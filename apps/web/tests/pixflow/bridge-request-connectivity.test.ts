import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
function setup(fetch: ReturnType<typeof vi.fn>) {
  const dispatchEvent = vi.fn();
  vi.stubGlobal('window', {
    __PIXFLOW_DESIGN_WORDPRESS__: { bridgeBaseUrl: 'http://127.0.0.1:7456', siteHash: 'test' },
    fetch, dispatchEvent, setTimeout, clearTimeout,
  });
  return dispatchEvent;
}

it('sends one JSON content type when callers already specify it', async () => {
  const fetch=vi.fn(async (_url:string, init:RequestInit) => {
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({query:'pottery'});
    return Response.json({ok:true});
  });
  setup(fetch);
  const {pixflowOptionalBridgeJson}=await import('../../src/pixflow/optional-bridge');
  await expect(pixflowOptionalBridgeJson('media/stock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'pottery'})})).resolves.toEqual({ok:true});
});

it('reports structured service errors without displaying an object placeholder', async () => {
  setup(vi.fn(async()=>Response.json({error:{message:'query is required'}},{status:400})));
  const {pixflowOptionalBridgeJson}=await import('../../src/pixflow/optional-bridge');
  await expect(pixflowOptionalBridgeJson('media/stock')).rejects.toThrow('query is required');
});

it('does not mark Bridge offline when a panel request is intentionally cancelled', async () => {
  const controller = new AbortController(); controller.abort();
  const fetch = vi.fn(async () => { throw new DOMException('Cancelled', 'AbortError'); });
  const dispatch = setup(fetch);
  const { pixflowOptionalBridgeFetch } = await import('../../src/pixflow/optional-bridge');
  await expect(pixflowOptionalBridgeFetch('agents', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(dispatch).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(1);
});

it('keeps Bridge connected when an endpoint fails but health succeeds', async () => {
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith('/health')) return { ok: true, json: async () => ({ ok: true, version: '2.0.1' }) };
    throw new TypeError('Failed to fetch');
  });
  const dispatch = setup(fetch);
  const { pixflowOptionalBridgeFetch } = await import('../../src/pixflow/optional-bridge');
  await expect(pixflowOptionalBridgeFetch('app-config')).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(2); expect(dispatch).not.toHaveBeenCalled();
});

it('publishes disconnection when the independent health check also fails', async () => {
  const fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
  const dispatch = setup(fetch);
  const { pixflowOptionalBridgeFetch } = await import('../../src/pixflow/optional-bridge');
  await expect(pixflowOptionalBridgeFetch('app-config')).rejects.toThrow();
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(dispatch.mock.calls[0]?.[0].type).toBe('pixflow-design:optional-bridge-disconnected');
});
