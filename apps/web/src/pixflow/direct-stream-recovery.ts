/** Only transport failures are retryable. Authorization and missing-run responses
 * must remain actionable; recovery must never turn into a new agent submission. */
export class StreamAttachmentHttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

function retryable(error: unknown): boolean {
  if (error instanceof StreamAttachmentHttpError) return error.status === 408 || error.status === 429 || error.status >= 500;
  return error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError');
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** Reattach with bounded backoff after a dropped connection. The timeout covers
 * attachment only, never the returned response's long-lived streaming body. */
export async function recoverDirectStream<T>(attach: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    if (attempt) await pause(attempt === 1 ? 500 : 1500, signal);
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new DOMException('Stream attachment timed out.', 'TimeoutError')), 10_000);
    try { return await attach(AbortSignal.any([signal, timeout.signal])); }
    catch (error) {
      if (signal.aborted || attempt >= 2 || !retryable(error)) throw error;
    } finally { clearTimeout(timer); }
  }
}
