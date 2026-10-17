const HEADER = 'X-Pixflow-Editor-Revisions';
export type EditorRevisions = Record<string, string>;

function requestFields(body: unknown): { get: (key: string) => unknown } | undefined {
  if (body instanceof FormData || body instanceof URLSearchParams) return body;
  if (typeof body !== 'string') return;
  try { const value = JSON.parse(body); return { get: key => value[key] }; }
  catch { return new URLSearchParams(body); }
}

function isSave(method: string, body: unknown): boolean {
  if (method.toUpperCase() === 'GET') return false;
  const fields = requestFields(body);
  const policy = (window as any).pixflowEditorAjaxPolicy;
  if (!policy || !fields || fields.get('action') !== policy.action) return true;
  try { return Object.values(JSON.parse(String(fields.get('actions') || '{}'))).some((item: any) => policy.writes.includes(item?.action)); }
  catch { return false; }
}

/** Only native document transports carry revision state; never third-party requests. */
export function nativeEditorRequest(rawUrl: string, body?: unknown): boolean {
  const url = new URL(rawUrl, window.location.href);
  if (url.origin !== window.location.origin) return false;
  const route = url.searchParams.get('rest_route') || url.pathname;
  const gutenbergRoute = (window as any).pixflowGutenbergSaveRoute;
  if ((window as any).pixflowGutenbergEntityGuard && new RegExp('/wp/v2/(' + ((window as any).pixflowGutenbergSharedRoutes ?? ['templates','template-parts','blocks','navigation']).join('|') + ')(?:/|$)').test(decodeURIComponent(route))) return true;
  const restRoute = route.includes('/wp-json/') ? route.slice(route.indexOf('/wp-json/') + 8) : route;
  if ((window as any).pixflowGutenbergEntityGuard && ((window as any).pixflowGutenbergPostRoutes ?? []).some((base:string) => restRoute === base || restRoute.startsWith(base + '/'))) return true;
  if (typeof gutenbergRoute === 'string' && [gutenbergRoute, `${gutenbergRoute}/autosaves`].some(target => route === target || route.endsWith(`/wp-json${target}`))) return true;
  if (((window as any).pixflowEditorRequestPatterns ?? []).some((pattern: string) => new RegExp(pattern).test(restRoute))) return true;
  if (!url.pathname.endsWith('/admin-ajax.php')) return false;
  const fields = requestFields(body);
  if (!fields) return false;
  if (((window as any).pixflowEditorSimpleAjaxActions ?? []).includes(fields.get('action'))) return true;
  const policy = (window as any).pixflowEditorAjaxPolicy;
  if (!policy || fields.get('action') !== policy.action) return false;
  try {
    const actions = JSON.parse(String(fields.get('actions') || '{}'));
    return Object.values(actions).some((item: any) => [...policy.reads, ...policy.writes].includes(item?.action));
  } catch { return false; }
}

export function installEditorSaveGuard(revisions: EditorRevisions, onConflict: () => void): () => void {
  const accept = (raw: string | null, write: boolean) => {
    if (!raw) return false;
    let accepted = false;
    try {
      for (const [key, value] of Object.entries(JSON.parse(raw))) {
        if ((write || !revisions[key]) && (Object.hasOwn(revisions, key) || ((window as any).pixflowEditorRevisionPatterns ?? []).some((pattern: string) => new RegExp(pattern).test(key)) || new RegExp('^(?:gutenberg:\\d+|gutenberg-entity:(' + ((window as any).pixflowGutenbergSharedTypes ?? ['wp_template','wp_template_part','wp_block','wp_navigation']).join('|') + '):[a-zA-Z0-9_/-]+)$').test(key)) && typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)) { revisions[key] = value; accepted = true; }
      }
    } catch { /* A missing/malformed receipt cannot advance the baseline. */ }
    return accepted;
  };
  let middlewareActive = true;
  const apiFetch = (window as any).wp?.apiFetch;
  if ((window as any).pixflowGutenbergEntityGuard && apiFetch?.use) {
    // WordPress can serve entity reads from inline preloads, bypassing fetch.
    // Receive the revision delivered with that exact record, never a newer lookup.
    apiFetch.use(async (options: any, next: (options: any) => Promise<any>) => {
      if (!middlewareActive || !nativeEditorRequest(options.url || options.path || '')) return next(options);
      const write = isSave(options.method || 'GET', options.data);
      const result = await next({ ...options, headers: { ...options.headers, [HEADER]: JSON.stringify(revisions) } });
      const records = Array.isArray(result) ? result : [result];
      for (const record of records) if (record?._pixflow_revision) accept(JSON.stringify(record._pixflow_revision), write);
      return result;
    });
  }
  const originalFetch = window.fetch;
  // Etch's Save starts page and shared-resource requests together. Dispatch
  // its native writes one at a time, using only receipts from this document's
  // successful saves. Never fetch a newer baseline to authorize stale work.
  let writeQueue: Promise<void> = Promise.resolve();
  let writeBlocked = false;
  const blockedWrite = () => new Error('An earlier editor save failed or could not be confirmed. Pending changes were not sent. Keep your unsaved work and reload the editor before saving again.');
  const guardedFetch: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const body = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
    if (!nativeEditorRequest(url, body)) return originalFetch.call(window, input, init);
    const write = isSave(init?.method ?? (input instanceof Request ? input.method : 'GET'), body);
    const send = async (request: RequestInfo | URL, options: RequestInit | undefined, serialized: boolean): Promise<Response> => {
      const headers = new Headers(options?.headers ?? (request instanceof Request ? request.headers : undefined));
      headers.set(HEADER, JSON.stringify(revisions));
      try {
        const response = await originalFetch.call(window, request, { ...options, headers });
        if (serialized && !response.ok) writeBlocked = true;
        if (response.status === 409) onConflict();
        if (response.ok) {
          const accepted = accept(response.headers.get(HEADER), write);
          if (serialized && !accepted) writeBlocked = true;
        }
        return response;
      } catch (error) {
        // A lost response can follow a committed write. No queued request may
        // guess its revision or replay that write after an uncertain outcome.
        if (serialized) writeBlocked = true;
        throw error;
      }
    };
    if (!(window as any).pixflowEditorSerializeFetchWrites || !write) return send(input, init, false);
    // Snapshot the body, headers, credentials and signal at fetch invocation;
    // callers may mutate a FormData/URLSearchParams while this write is queued.
    const pending = input instanceof Request ? new Request(input, init) : new Request(new URL(url, window.location.href), init);
    const task = writeQueue.then(() => {
      if (!middlewareActive || writeBlocked) throw blockedWrite();
      // A queued cancellation never reaches the server and does not poison
      // subsequent saves. An in-flight abort is uncertain and blocks them.
      if (pending.signal.aborted) throw pending.signal.reason ?? new DOMException('The request was aborted.', 'AbortError');
      return send(pending, undefined, true);
    });
    writeQueue = task.then(() => undefined, () => undefined);
    return new Promise<Response>((resolve, reject) => {
      const aborted = () => reject(pending.signal.reason ?? new DOMException('The request was aborted.', 'AbortError'));
      pending.signal.addEventListener('abort', aborted, { once: true });
      if (pending.signal.aborted) aborted();
      task.then(response => { pending.signal.removeEventListener('abort', aborted); resolve(response); }, error => {
        pending.signal.removeEventListener('abort', aborted); reject(error);
      });
    });
  };
  window.fetch = guardedFetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const urls = new WeakMap<XMLHttpRequest, string>();
  const writes = new WeakMap<XMLHttpRequest, boolean>();
  const open = function (this: XMLHttpRequest, ...args: any[]) {
    urls.set(this, String(args[1]));
    writes.set(this, String(args[0]).toUpperCase() !== 'GET');
    return (originalOpen as Function).apply(this, args);
  } as typeof originalOpen;
  const send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    if (nativeEditorRequest(urls.get(this) || '', body)) {
      this.setRequestHeader(HEADER, JSON.stringify(revisions));
      this.addEventListener('load', () => {
        if (this.status === 409) onConflict();
        if (this.status >= 200 && this.status < 300) accept(this.getResponseHeader(HEADER), writes.get(this) === true && isSave('POST', body));
      }, { once: true });
    }
    return originalSend.call(this, body);
  };
  XMLHttpRequest.prototype.open = open;
  XMLHttpRequest.prototype.send = send;
  return () => {
    middlewareActive = false;
    if (window.fetch === guardedFetch) window.fetch = originalFetch;
    if (XMLHttpRequest.prototype.open === open) XMLHttpRequest.prototype.open = originalOpen;
    if (XMLHttpRequest.prototype.send === send) XMLHttpRequest.prototype.send = originalSend;
  };
}
