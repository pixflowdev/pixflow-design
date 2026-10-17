import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

function setup(valid = true, rejectRetry = false, selectedSite?: string) {
  let paired = false;
  const calls: string[] = [];
  const transport = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if(url.endsWith('/health'))return Response.json({ok:true,state:'running',site:{key:selectedSite}});
    if(url.endsWith('/site-context/switch')){selectedSite='this-site';return Response.json({ok:true});}
    if (url.endsWith('/license/status')) return Response.json({
      license: { valid, message: valid ? '' : 'Pixflow Design license expired.' },
      runtime_ready: valid, central_entitlement: { enabled: true, valid },
    });
    if (url.endsWith('/central-entitlement')) return Response.json({ valid: paired });
    if (url.endsWith('/pairing/start')) return Response.json({ requestId: 'request', challenge: 'challenge', siteUrl: 'https://site.test' });
    if (url.endsWith('/pairing/authorize')) return Response.json({ code: 'a'.repeat(64) });
    if (url.endsWith('/pairing/complete')) { paired = true; return Response.json({ ok: true, valid: true }); }
    if (url.includes('/api/agents')) return paired && !rejectRetry
      ? Response.json({ agents: [{ id: 'codex' }] })
      : Response.json({ error: { code: 'PIXFLOW_CENTRAL_ENTITLEMENT_REQUIRED' } }, { status: 403 });
    throw new Error(`Unexpected request ${url}`);
  });
  const win = {
    __PIXFLOW_DESIGN_WORDPRESS__: { version: '2.0.0', bridgeBaseUrl: 'http://127.0.0.1:7456', restBaseUrl: 'https://site.test/wp-json/pixflow-design/v1', restNonce: 'nonce', ...(selectedSite?{siteHash:'this-site'}:{}) },
    location: { href: 'https://site.test/' }, fetch: transport, setTimeout, clearTimeout,
    dispatchEvent: vi.fn(),
  };
  Object.assign(win, { parent: win, top: win });
  vi.stubGlobal('window', win);
  vi.stubGlobal('fetch', transport);
  return { calls, win };
}

it('automatically pairs an active licensed site before retrying agent discovery', async () => {
  const { calls, win } = setup();
  const { pixflowOptionalBridgeJson } = await import('../../src/pixflow/optional-bridge');
  await expect(pixflowOptionalBridgeJson('agents')).resolves.toEqual({ agents: [{ id: 'codex' }] });
  expect(calls.filter(url => url.endsWith('/pairing/start'))).toHaveLength(1);
  expect(win.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({type: 'pixflow-design:license-changed'}));
});

it('does not let background discovery switch away from another selected site', async () => {
  const {calls}=setup(true,false,'another-site');
  const {pixflowOptionalBridgeJson}=await import('../../src/pixflow/optional-bridge');
  await expect(pixflowOptionalBridgeJson('agents')).rejects.toThrow(/another site/i);
  expect(calls.some(url=>url.endsWith('/site-context/switch'))).toBe(false);
  expect(calls.some(url=>url.endsWith('/pairing/start'))).toBe(false);
});

it('does not pair a site whose license is invalid', async () => {
  const { calls } = setup(false);
  const { pixflowOptionalBridgeJson } = await import('../../src/pixflow/optional-bridge');
  await expect(pixflowOptionalBridgeJson('agents')).rejects.toThrow(/license expired/i);
  expect(calls.some(url => url.endsWith('/pairing/start'))).toBe(false);
});

it('does not loop when discovery is rejected after successful pairing', async () => {
  const { calls } = setup(true, true);
  const { pixflowOptionalBridgeJson } = await import('../../src/pixflow/optional-bridge');
  await expect(pixflowOptionalBridgeJson('agents')).rejects.toThrow(/license/i);
  expect(calls.filter(url => url.includes('/api/agents'))).toHaveLength(2);
  expect(calls.filter(url => url.endsWith('/pairing/start'))).toHaveLength(1);
});

it('shares automatic pairing across concurrent protected requests', async () => {
  const { calls } = setup();
  const { pixflowOptionalBridgeJson } = await import('../../src/pixflow/optional-bridge');
  await Promise.all([pixflowOptionalBridgeJson('agents'), pixflowOptionalBridgeJson('agents?force=1')]);
  expect(calls.filter(url => url.endsWith('/pairing/start'))).toHaveLength(1);
});
