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

it.each(['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.'])('does not diagnose browser permission denial from %s', async (message) => {
  setup(vi.fn());
  const {normalizePixflowOptionalBridgeError, PixflowOptionalBridgeLoopbackAccessError}=await import('../../src/pixflow/optional-bridge');
  const error=normalizePixflowOptionalBridgeError(new TypeError(message));
  expect(error).not.toBeInstanceOf(PixflowOptionalBridgeLoopbackAccessError);
  expect(error.message).toContain('could not reach');
  expect(error.message).toContain('cannot determine');
});

it('distinguishes explicit local-network denial from unrelated authorization failures', async () => {
  const {normalizePixflowOptionalBridgeError, PixflowOptionalBridgeLoopbackAccessError}=await import('../../src/pixflow/optional-bridge');
  expect(normalizePixflowOptionalBridgeError(new Error('Local network access permission denied'))).toBeInstanceOf(PixflowOptionalBridgeLoopbackAccessError);
  const denied=new Error('WordPress permission was denied');
  expect(normalizePixflowOptionalBridgeError(denied)).toBe(denied);
  const mismatch=new Error('Bridge loopback site mismatch');
  expect(normalizePixflowOptionalBridgeError(mismatch)).toBe(mismatch);
});

it('gives timeout and connection-refused recovery without diagnosing permission denial', async () => {
  const {normalizePixflowOptionalBridgeError}=await import('../../src/pixflow/optional-bridge');
  expect(normalizePixflowOptionalBridgeError(new DOMException('Aborted','AbortError')).message).toContain('timed out');
  expect(normalizePixflowOptionalBridgeError(new Error('net::ERR_CONNECTION_REFUSED')).message).toContain('refused');
});

it('publishes an ambiguous network failure as unavailable, not blocked', async () => {
  const dispatch=setup(vi.fn(async()=>{throw new TypeError('Failed to fetch');}));
  const {pixflowOptionalBridgeFetch}=await import('../../src/pixflow/optional-bridge');
  await expect(pixflowOptionalBridgeFetch('health')).rejects.toThrow('cannot determine');
  expect(dispatch.mock.calls[0]?.[0].detail.kind).toBe('unavailable');
});

it('times out a stalled health request without retrying or changing saved state', async () => {
  const fetch=vi.fn((_url:string, init:RequestInit)=>new Promise<Response>((_resolve,reject)=>{
    init.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
  }));
  const dispatch=setup(fetch);
  const {pixflowOptionalBridgeFetch}=await import('../../src/pixflow/optional-bridge');
  await expect(pixflowOptionalBridgeFetch('health',{}, {timeoutMs:5})).rejects.toThrow('timed out');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(dispatch.mock.calls[0]?.[0].detail.kind).toBe('unavailable');
});

it('recovers on an explicit rescan after an ambiguous failure', async () => {
  const fetch=vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(Response.json({version:'2.1.1',runtimeState:'ready'}));
  setup(fetch);
  const {probePixflowOptionalBridge}=await import('../../src/pixflow/optional-bridge');
  expect(await probePixflowOptionalBridge({force:true})).toMatchObject({available:false,error:expect.stringContaining('cannot determine')});
  expect(await probePixflowOptionalBridge({force:true})).toMatchObject({available:true,version:'2.1.1'});
});

it('retains explicit authorization and HTTP failures instead of suggesting browser permissions', async () => {
  const dispatch=setup(vi.fn(async()=>Response.json({error:{message:'This site is not paired with Bridge'}},{status:403})));
  const {pixflowOptionalBridgeJson}=await import('../../src/pixflow/optional-bridge');
  await expect(pixflowOptionalBridgeJson('app-config')).rejects.toThrow('This site is not paired with Bridge');
  expect(dispatch).not.toHaveBeenCalled();
});

it.each(['list','stream'])('preserves the connection diagnosis in an explicit %s rescan', async (kind) => {
  setup(vi.fn(async()=>{throw new TypeError('Failed to fetch');}));
  const api=await import('../../src/pixflow/optional-bridge');
  await expect(kind==='list' ? api.fetchPixflowOptionalBridgeAgents({force:true}) : api.fetchPixflowOptionalBridgeAgentsStream({force:true,onAgent:()=>{}})).rejects.toThrow('cannot determine');
});
