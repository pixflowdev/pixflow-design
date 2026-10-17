import { afterEach, expect, it, vi } from 'vitest';

const ensureSite = vi.hoisted(() => vi.fn());
vi.mock('../../src/pixflow/optional-bridge', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/pixflow/optional-bridge')>(),
  ensurePixflowOptionalBridgeSiteContext: ensureSite,
}));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('selects the current WordPress site before starting packaged pairing', async () => {
  const order: string[] = [];
  ensureSite.mockImplementation(async () => { order.push('site'); });
  const fetch = vi.fn(async (_url: string, init: RequestInit) => { order.push('pairing'); expect(new Headers(init.headers).get('X-Pixflow-Site-Key')).toBe('this-installation'); return Response.json({}, {status:403}); });
  vi.stubGlobal('window', { __PIXFLOW_DESIGN_WORDPRESS__: { siteHash: 'this-installation', bridgeBaseUrl: 'http://127.0.0.1:7456' }, fetch });
  const { pairPixflowBridge } = await import('../../src/pixflow/license');
  await expect(pairPixflowBridge()).rejects.toThrow('Bridge pairing failed');
  expect(order).toEqual(['site', 'pairing']);
});

it('shows the Bridge cause and stage without exposing arbitrary server text', async () => {
  ensureSite.mockResolvedValue(undefined);
  const fetch = vi.fn(async () => Response.json({code:'pairing_certificate_untrusted',stage:'wordpress_exchange',error:'private raw transport information'}, {status:403}));
  vi.stubGlobal('window', { __PIXFLOW_DESIGN_WORDPRESS__: { bridgeBaseUrl:'http://127.0.0.1:7456' }, fetch });
  const { pairPixflowBridge } = await import('../../src/pixflow/license');
  await expect(pairPixflowBridge()).rejects.toThrow('cannot verify the HTTPS certificate');
  await expect(pairPixflowBridge()).rejects.toThrow('Bridge to WordPress');
});

it('does not blame the license when the browser hides the network cause', async () => {
  ensureSite.mockResolvedValue(undefined);
  const fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
  vi.stubGlobal('window', { __PIXFLOW_DESIGN_WORDPRESS__: { bridgeBaseUrl:'http://127.0.0.1:7456' }, fetch });
  const { pairPixflowBridge } = await import('../../src/pixflow/license');
  await expect(pairPixflowBridge()).rejects.toThrow('browser did not expose the precise cause');
});

it('does not create a pairing for a different site when selection fails', async () => {
  ensureSite.mockRejectedValue(new Error('Site selection failed'));
  const fetch = vi.fn();
  vi.stubGlobal('window', { __PIXFLOW_DESIGN_WORDPRESS__: { bridgeBaseUrl: 'http://127.0.0.1:7456' }, fetch });
  const { pairPixflowBridge } = await import('../../src/pixflow/license');
  await expect(pairPixflowBridge()).rejects.toThrow('Site selection failed');
  expect(fetch).not.toHaveBeenCalled();
});
