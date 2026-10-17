// @vitest-environment jsdom
import { beforeEach } from 'vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { installEditorSaveGuard, nativeEditorRequest } from '../../src/pixflow/editor-save-guard';
let stop: (() => void) | undefined;
afterEach(() => { stop?.(); delete (window as any).pixflowEditorSerializeFetchWrites; vi.restoreAllMocks(); });
it.each([
  ['/wp-json/etch-api/post/42/blocks', undefined],
  ['/?rest_route=/etch-api/post/42/blocks', undefined],
  ['/wp-admin/admin-ajax.php', 'action=bricks_save_post&postId=42'],
  ['/wp-admin/admin-ajax.php', new URLSearchParams({ action: 'elementor_ajax', actions: JSON.stringify({ save: { action: 'save_builder', data: { editor_post_id: 42 } } }) })],
])('recognizes native document transport %s', (url, body) => expect(nativeEditorRequest(url, body)).toBe(true));
it('does not attach document state to unrelated or cross-origin requests', () => {
  expect(nativeEditorRequest('https://another.test/wp-json/etch-api/post/42/blocks')).toBe(false);
  expect(nativeEditorRequest('/wp-json/etch-api/media')).toBe(false);
  expect(nativeEditorRequest('/wp-admin/admin-ajax.php', 'action=heartbeat')).toBe(false);
});
it('advances only successful save receipts and preserves the stale baseline on a conflict', async () => {
  const old = 'a'.repeat(64), next = 'b'.repeat(64);
  const revisions = { 'etch:42': old };
  const conflict = vi.fn();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', { headers: { 'X-Pixflow-Editor-Revisions': JSON.stringify({ 'etch:42': next }) } }))
    .mockResolvedValueOnce(new Response('{}', { status: 409, headers: { 'X-Pixflow-Editor-Revisions': JSON.stringify({ 'etch:42': 'c'.repeat(64) }) } }));
  vi.stubGlobal('fetch', fetcher);
  stop = installEditorSaveGuard(revisions, conflict);
  await window.fetch('/wp-json/etch-api/post/42/blocks', { method: 'POST', body: '{}' });
  expect(JSON.parse(fetcher.mock.calls[0]![1].headers.get('X-Pixflow-Editor-Revisions'))).toEqual({ 'etch:42': old });
  expect(revisions['etch:42']).toBe(next);
  await window.fetch('/wp-json/etch-api/post/42/blocks', { method: 'POST', body: '{}' });
  expect(conflict).toHaveBeenCalledOnce();
  expect(revisions['etch:42']).toBe(next);
});
it('does not authorize stale content after an inspection read, but initializes newly loaded resources', async () => {
  const old = 'a'.repeat(64), next = 'b'.repeat(64);
  const revisions: Record<string, string> = { 'etch:42': old, 'elementor:42': old };
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { headers: {
    'X-Pixflow-Editor-Revisions': JSON.stringify({ 'etch:42': next, 'elementor:42': next, 'etch:styles': next }),
  } })));
  stop = installEditorSaveGuard(revisions, vi.fn());
  await window.fetch('/wp-json/etch-api/post/42/blocks');
  await window.fetch('/wp-admin/admin-ajax.php', { method: 'POST', body: new URLSearchParams({
    action: 'elementor_ajax', actions: JSON.stringify({ read: { action: 'get_document_config', data: { id: 42 } } }),
  }) });
  expect(revisions).toEqual({ 'etch:42': old, 'elementor:42': old, 'etch:styles': next });
});

it('protects the loaded Gutenberg post including draft autosaves; excludes other posts and sites', () => {
  (window as any).pixflowGutenbergSaveRoute = '/wp/v2/pages/42';
  expect(nativeEditorRequest('/wp-json/wp/v2/pages/42')).toBe(true);
  expect(nativeEditorRequest('/?rest_route=%2Fwp%2Fv2%2Fpages%2F42')).toBe(true);
  expect(nativeEditorRequest('/wp-json/wp/v2/pages/42/autosaves')).toBe(true);
  expect(nativeEditorRequest('/wp-json/wp/v2/pages/43')).toBe(false);
  expect(nativeEditorRequest('https://elsewhere.test/wp-json/wp/v2/pages/42')).toBe(false);
  delete (window as any).pixflowGutenbergSaveRoute;
});
it('captures preloaded shared entity revisions without authorizing a later inspection version', async () => {
  (window as any).pixflowGutenbergEntityGuard = true;
  let middleware: any;
  (window as any).wp = { apiFetch:{use:(fn:any)=>{middleware=fn;}} };
  const revisions: Record<string,string> = {}, key='gutenberg-entity:wp_template:theme//home';
  stop=installEditorSaveGuard(revisions,vi.fn());
  const next=vi.fn(async()=>({_pixflow_revision:{[key]:'a'.repeat(64)}}));
  await middleware({path:'/wp/v2/templates/theme//home'},next);
  expect(revisions[key]).toBe('a'.repeat(64));
  next.mockResolvedValue({_pixflow_revision:{[key]:'b'.repeat(64)}});
  await middleware({path:'/wp/v2/templates/theme//home'},next);
  expect(revisions[key]).toBe('a'.repeat(64));
  await middleware({path:'/wp/v2/templates/theme//home',method:'POST'},next);
  expect(revisions[key]).toBe('b'.repeat(64));
  expect(nativeEditorRequest('/?rest_route=%2Fwp%2Fv2%2Ftemplate-parts%2Ftheme%2F%2Fheader')).toBe(true);
  expect(nativeEditorRequest('https://another.test/wp-json/wp/v2/blocks/12')).toBe(false);
  delete (window as any).pixflowGutenbergEntityGuard; delete (window as any).wp;
});

it('protects Site Editor pages on subdirectory installations', () => {
  (window as any).pixflowGutenbergEntityGuard = true;
  (window as any).pixflowGutenbergPostRoutes = ['/wp/v2/pages'];
  expect(nativeEditorRequest('/wordpress/wp-json/wp/v2/pages/42')).toBe(true);
  expect(nativeEditorRequest('/wordpress/wp-json/wp/v2/pages/42/autosaves')).toBe(true);
  expect(nativeEditorRequest('/wordpress/wp-json/wp/v2/pages-extra/42')).toBe(false);
  delete (window as any).pixflowGutenbergEntityGuard;
  delete (window as any).pixflowGutenbergPostRoutes;
});

beforeEach(() => {
  (window as any).pixflowEditorSimpleAjaxActions = ['bricks_save_post'];
  (window as any).pixflowEditorAjaxPolicy = { action: 'elementor_ajax', reads: ['get_document_config'], writes: ['save_builder'] };
  (window as any).pixflowEditorRequestPatterns = ['^/etch-api/post/[0-9]+(?:/blocks)?/?$', '^/etch-api/(styles|stylesheets|loops|queries)(?:/[^/]+)?/?$'];
  (window as any).pixflowEditorRevisionPatterns = ['^etch:(?:[0-9]+|styles|stylesheets|loops|queries)$'];
});

it('does not intercept Elementor saves when Pro has not contributed its policy', () => {
  delete (window as any).pixflowEditorAjaxPolicy;
  expect(nativeEditorRequest('/wp-admin/admin-ajax.php', new URLSearchParams({action:'elementor_ajax', actions:JSON.stringify({save:{action:'save_builder'}})}))).toBe(false);
});

it('does not intercept Bricks saves without a Pro policy', () => {
 delete (window as any).pixflowEditorSimpleAjaxActions;
 expect(nativeEditorRequest('/wp-admin/admin-ajax.php','action=bricks_save_post&postId=42')).toBe(false);
});


it('serializes Etch parallel native saves and stamps each write after the previous successful receipt', async () => {
  (window as any).pixflowEditorSerializeFetchWrites = true;
  const old = 'a'.repeat(64), saved = 'b'.repeat(64), loops = 'c'.repeat(64);
  const revisions = { 'etch:42': old, 'etch:loops': loops };
  let finishPage!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finishPage = resolve; }))
    .mockResolvedValueOnce(new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  const conflict = vi.fn();
  stop = installEditorSaveGuard(revisions, conflict);
  const pageSave = window.fetch('/wp-json/etch-api/post/42/blocks', { method: 'POST', body: '{"blocks":[]}' });
  const loopsSave = window.fetch('/?rest_route=%2Fetch-api%2Floops&_method=PUT', { method: 'POST', body: '{"existing":"loops"}' });
  await Promise.resolve(); await Promise.resolve();
  expect(fetcher).toHaveBeenCalledTimes(1);
  finishPage(new Response('{}', { headers: { 'X-Pixflow-Editor-Revisions': JSON.stringify({ 'etch:42': saved }) } }));
  await Promise.all([pageSave, loopsSave]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetcher.mock.calls[1]![1].headers.get('X-Pixflow-Editor-Revisions'))).toEqual({ 'etch:42': saved, 'etch:loops': loops });
  expect(conflict).not.toHaveBeenCalled();
});


it.each([409, 500])('does not send queued writes after HTTP %s, or refresh their baseline through GET', async status => {
  (window as any).pixflowEditorSerializeFetchWrites = true;
  const old = 'a'.repeat(64), other = 'b'.repeat(64);
  const revisions = { 'etch:42': old };
  let finish!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValue(new Response('{}', { headers: { 'X-Pixflow-Editor-Revisions': JSON.stringify({ 'etch:42': other }) } }));
  vi.stubGlobal('fetch', fetcher);
  const conflict = vi.fn();
  stop = installEditorSaveGuard(revisions, conflict);
  const first = window.fetch('/wp-json/etch-api/post/42/blocks', { method: 'POST', body: '{}' });
  const queued = window.fetch('/wp-json/etch-api/loops', { method: 'POST', body: '{}' });
  const queuedCheck = expect(queued).rejects.toThrow('Pending changes were not sent');
  await Promise.resolve(); await Promise.resolve();
  const response = new Response('{}', { status, headers: { 'X-Pixflow-Editor-Revisions': JSON.stringify({ 'etch:42': other }) } });
  finish(response);
  expect(await first).toBe(response);
  await queuedCheck;
  expect(fetcher).toHaveBeenCalledTimes(1);
  await window.fetch('/wp-json/etch-api/post/42/blocks');
  expect(revisions['etch:42']).toBe(old);
  await expect(window.fetch('/wp-json/etch-api/post/42/blocks', { method: 'POST', body: '{}' })).rejects.toThrow('Pending changes were not sent');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(conflict).toHaveBeenCalledTimes(status === 409 ? 1 : 0);
});

it('does not dispatch queued writes after an uncertain transport failure', async () => {
  (window as any).pixflowEditorSerializeFetchWrites = true;
  const old = 'a'.repeat(64), revisions = { 'etch:42': old };
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Lost response')));
  const fetcher = window.fetch as ReturnType<typeof vi.fn>;
  stop = installEditorSaveGuard(revisions, vi.fn());
  const first = window.fetch('/wp-json/etch-api/post/42/blocks', { method: 'POST', body: '{}' });
  const queued = window.fetch('/wp-json/etch-api/loops', { method: 'POST', body: '{}' });
  await Promise.all([expect(first).rejects.toThrow('Lost response'), expect(queued).rejects.toThrow('Pending changes were not sent')]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(revisions['etch:42']).toBe(old);
});

it('keeps inspection GETs concurrent and snapshots queued request data and transport options', async () => {
  (window as any).pixflowEditorSerializeFetchWrites = true;
  const old = 'a'.repeat(64), next = 'b'.repeat(64), revisions = { 'etch:42': old };
  let finish!: (response: Response) => void;
  const finalResponse = new Response('{"saved":true}', { headers: { 'X-Pixflow-Editor-Revisions': JSON.stringify({ 'etch:42': next }) } });
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(finalResponse);
  vi.stubGlobal('fetch', fetcher);
  stop = installEditorSaveGuard(revisions, vi.fn());
  const first = window.fetch('/wp-json/etch-api/post/42/blocks', { method: 'POST', body: '{}' });
  await Promise.resolve(); await Promise.resolve();
  const body = new URLSearchParams({ saved: 'original' });
  const headers = new Headers({ 'X-Existing': 'original' });
  const queued = window.fetch('/wp-json/etch-api/loops', { method: 'PUT', body, headers, credentials: 'include', cache: 'no-store' });
  body.set('saved', 'changed'); headers.set('X-Existing', 'changed');
  await window.fetch('/wp-json/etch-api/post/42/blocks');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(revisions['etch:42']).toBe(old);
  finish(new Response('{}', { headers: { 'X-Pixflow-Editor-Revisions': JSON.stringify({ 'etch:42': next }) } }));
  await first;
  expect(await queued).toBe(finalResponse);
  expect(await finalResponse.json()).toEqual({ saved: true });
  const [request, init] = fetcher.mock.calls[2]!;
  expect(request.method).toBe('PUT');
  expect(request.credentials).toBe('include');
  expect(request.cache).toBe('no-store');
  expect(await request.text()).toBe('saved=original');
  expect(init.headers.get('X-Existing')).toBe('original');
  expect(JSON.parse(init.headers.get('X-Pixflow-Editor-Revisions'))['etch:42']).toBe(next);
});

it('does not send an aborted queued request or poison later writes that have not been sent', async () => {
  (window as any).pixflowEditorSerializeFetchWrites = true;
  const old = 'a'.repeat(64), next = 'b'.repeat(64), revisions = { 'etch:42': old };
  let finish!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValue(new Response('{}', { headers: { 'X-Pixflow-Editor-Revisions': JSON.stringify({ 'etch:42': next }) } }));
  vi.stubGlobal('fetch', fetcher);
  stop = installEditorSaveGuard(revisions, vi.fn());
  const first = window.fetch('/wp-json/etch-api/post/42/blocks', { method: 'POST', body: '{}' });
  const controller = new AbortController();
  const cancelled = window.fetch('/wp-json/etch-api/loops', { method: 'POST', body: '{}', signal: controller.signal });
  const cancelledCheck = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
  const final = window.fetch('/wp-json/etch-api/styles', { method: 'POST', body: '{}' });
  controller.abort();
  await cancelledCheck;
  await Promise.resolve(); await Promise.resolve();
  finish(new Response('{}', { headers: { 'X-Pixflow-Editor-Revisions': JSON.stringify({ 'etch:42': next }) } }));
  await Promise.all([first, cancelledCheck, final]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(String((fetcher.mock.calls[1]![0] as Request).url)).toContain('/styles');
});

it('leaves native writes concurrent when the builder has not opted in', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  stop = installEditorSaveGuard({ 'etch:42': 'a'.repeat(64) }, vi.fn());
  const first = window.fetch('/wp-json/etch-api/post/42/blocks', { method: 'POST', body: '{}' });
  const second = window.fetch('/wp-json/etch-api/loops', { method: 'POST', body: '{}' });
  expect(fetcher).toHaveBeenCalledTimes(2);
  await Promise.all([first, second]);
});


it.each([null, 'not-json', '{"etch:42":"invalid"}'])('does not advance queued writes after a missing or malformed receipt: %s', async header => {
  (window as any).pixflowEditorSerializeFetchWrites = true;
  const revisions = { 'etch:42': 'a'.repeat(64) };
  const fetcher = vi.fn().mockResolvedValue(new Response('{}', { headers: header === null ? {} : { 'X-Pixflow-Editor-Revisions': header } }));
  vi.stubGlobal('fetch', fetcher);
  stop = installEditorSaveGuard(revisions, vi.fn());
  const first = window.fetch('/wp-json/etch-api/post/42/blocks', { method: 'POST', body: '{}' });
  const second = window.fetch('/wp-json/etch-api/loops', { method: 'POST', body: '{}' });
  await Promise.all([first, expect(second).rejects.toThrow('could not be confirmed')]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(revisions['etch:42']).toBe('a'.repeat(64));
});

it('leaves unrelated native reads and third-party requests outside a pending Etch save queue', async () => {
  (window as any).pixflowEditorSerializeFetchWrites = true;
  let finish!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  stop = installEditorSaveGuard({ 'etch:42': 'a'.repeat(64) }, vi.fn());
  const first = window.fetch('/wp-json/etch-api/post/42/blocks', { method: 'POST', body: '{}' });
  await Promise.resolve(); await Promise.resolve();
  const outsideInit = { method: 'POST', body: '{}' };
  await window.fetch('https://another.test/wp-json/etch-api/post/42/blocks', outsideInit);
  await window.fetch('/wp-json/etch-api/media');
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls[1]).toEqual(['https://another.test/wp-json/etch-api/post/42/blocks', outsideInit]);
  expect(fetcher.mock.calls[2]).toEqual(['/wp-json/etch-api/media', undefined]);
  finish(new Response('{}', { headers: { 'X-Pixflow-Editor-Revisions': JSON.stringify({ 'etch:42': 'b'.repeat(64) }) } }));
  await first;
});


it('blocks pending writes after an in-flight abort because the server may have saved already', async () => {
  (window as any).pixflowEditorSerializeFetchWrites = true;
  const fetcher = vi.fn((request: Request) => new Promise<Response>((_resolve, reject) => {
    request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
  }));
  vi.stubGlobal('fetch', fetcher);
  stop = installEditorSaveGuard({ 'etch:42': 'a'.repeat(64) }, vi.fn());
  const controller = new AbortController();
  const first = window.fetch('/wp-json/etch-api/post/42/blocks', { method: 'POST', body: '{}', signal: controller.signal });
  const firstCheck = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  const queued = window.fetch('/wp-json/etch-api/loops', { method: 'POST', body: '{}' });
  const queuedCheck = expect(queued).rejects.toThrow('could not be confirmed');
  await Promise.resolve(); await Promise.resolve();
  expect(fetcher).toHaveBeenCalledTimes(1);
  controller.abort();
  await Promise.all([firstCheck, queuedCheck]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
