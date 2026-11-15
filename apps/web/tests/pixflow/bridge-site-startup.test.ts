import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

it('waits for a selected site whose gateway reports that its runtime is still starting', async () => {
  vi.useFakeTimers();
  let ready = false;
  const fetch = vi.fn(async (_url: string) => Response.json({ ok: ready, state: ready ? 'running' : 'starting', site: { key: 'local-site' } }));
  vi.stubGlobal('window', {
    __PIXFLOW_DESIGN_WORDPRESS__: { bridgeBaseUrl: 'http://127.0.0.1:7456', siteHash: 'local-site' },
    fetch, setTimeout, clearTimeout, dispatchEvent: vi.fn(),
  });
  const { ensurePixflowOptionalBridgeSiteContext } = await import('../../src/pixflow/optional-bridge');
  let resolved = false;
  const result = ensurePixflowOptionalBridgeSiteContext().then(() => { resolved = true; });
  await vi.advanceTimersByTimeAsync(600);
  expect(resolved).toBe(false);
  ready = true;
  await vi.advanceTimersByTimeAsync(600);
  await result;
  expect(resolved).toBe(true);
  expect(fetch.mock.calls.every(call => String(call[0]).endsWith('/health'))).toBe(true);
});

it('waits for a packaged site restart that takes longer than five seconds', async () => {
  vi.useFakeTimers();
  let selected = false;
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.includes('site-context/switch')) {
      await new Promise<void>((resolve, reject) => {
        setTimeout(() => { selected = true; resolve(); }, 10_000);
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }
    return { ok: true, json: async () => ({ site: { key: selected ? 'local-site' : '' } }) };
  });
  vi.stubGlobal('window', {
    __PIXFLOW_DESIGN_WORDPRESS__: { bridgeBaseUrl: 'http://127.0.0.1:7456', siteHash: 'local-site', siteUrl: 'http://127.0.0.1:8088' },
    fetch, setTimeout, clearTimeout, dispatchEvent: vi.fn(),
  });
  const { ensurePixflowOptionalBridgeSiteContext } = await import('../../src/pixflow/optional-bridge');
  const result = ensurePixflowOptionalBridgeSiteContext().then(() => 'ready', () => 'failed');
  await vi.advanceTimersByTimeAsync(11_000);
  expect(await result).toBe('ready');
});

it.each(['refused', 'timed out'])('recovers when the first health request is %s during a Bridge restart', async failure => {
  vi.useFakeTimers();
  const now = Date.now();
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    if (Date.now() - now >= 7_000) return Response.json({ ok: true, site: { key: 'local-site' } });
    if (failure === 'refused') throw new TypeError('Failed to fetch');
    return new Promise<Response>((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  });
  vi.stubGlobal('window', {
    __PIXFLOW_DESIGN_WORDPRESS__: { bridgeBaseUrl: 'http://127.0.0.1:7456', siteHash: 'local-site' },
    fetch, setTimeout, clearTimeout, dispatchEvent: vi.fn(),
  });
  const { ensurePixflowOptionalBridgeSiteContext } = await import('../../src/pixflow/optional-bridge');
  const result = ensurePixflowOptionalBridgeSiteContext().then(() => 'ready', () => 'failed');
  await vi.advanceTimersByTimeAsync(12_000);
  expect(await result).toBe('ready');
  expect(fetch.mock.calls.every(call => call[0].endsWith('/health'))).toBe(true);
});

it('does not retry a health request denied by the Bridge', async () => {
  const fetch = vi.fn(async () => Response.json({ message: 'Not allowed' }, { status: 403 }));
  vi.stubGlobal('window', {
    __PIXFLOW_DESIGN_WORDPRESS__: { bridgeBaseUrl: 'http://127.0.0.1:7456', siteHash: 'local-site' },
    fetch, setTimeout, clearTimeout, dispatchEvent: vi.fn(),
  });
  const { ensurePixflowOptionalBridgeSiteContext } = await import('../../src/pixflow/optional-bridge');
  await expect(ensurePixflowOptionalBridgeSiteContext()).rejects.toMatchObject({ status: 403 });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('bounds recovery when the Bridge stays offline', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
  vi.stubGlobal('window', {
    __PIXFLOW_DESIGN_WORDPRESS__: { bridgeBaseUrl: 'http://127.0.0.1:7456', siteHash: 'local-site' },
    fetch, setTimeout, clearTimeout, dispatchEvent: vi.fn(),
  });
  const { ensurePixflowOptionalBridgeSiteContext } = await import('../../src/pixflow/optional-bridge');
  const result = ensurePixflowOptionalBridgeSiteContext({ timeoutMs: 5_000 }).then(() => 'ready', () => 'failed');
  await vi.advanceTimersByTimeAsync(5_000);
  expect(await result).toBe('failed');
  const calls = fetch.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10_000);
  expect(fetch).toHaveBeenCalledTimes(calls);
});
