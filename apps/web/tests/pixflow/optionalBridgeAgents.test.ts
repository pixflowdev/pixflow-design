import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isPixflowIntentionalAbort,
  isPixflowSupportedCliAgent,
  pixflowOptionalBridgeCanRequest,
  ensurePixflowOptionalBridgeSiteContext,
  fetchPixflowOptionalBridgeAgents,
} from '../../src/pixflow/optional-bridge';
import { beginProviderDiscovery, getProviderDiscoveryState } from '../../src/pixflow/provider-discovery-state';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Pixflow optional bridge agent visibility', () => {
  it('shows sleeping instead of a failed provider refresh and makes no provider call', async () => {
    const request = vi.fn(async (_url: string) => new Response(JSON.stringify({ ok: true, runtimeState: 'sleeping' })));
    const scopedWindow: Record<string, unknown> = {
      location: { search: '' }, sessionStorage: { getItem: () => null }, localStorage: { getItem: () => null },
      __PIXFLOW_DESIGN_WORDPRESS__: { version: '2.0.2', siteHash: 'sleeping-site', bridgeBaseUrl: 'http://127.0.0.1:7456' },
      pixflowDesignBridgeStatus: { checked: true, running: true, state: 'connected' },
      setTimeout, clearTimeout, dispatchEvent: vi.fn(), fetch: request,
    };
    scopedWindow.parent = scopedWindow; scopedWindow.top = scopedWindow;
    vi.stubGlobal('window', scopedWindow);
    await fetchPixflowOptionalBridgeAgents();
    expect(getProviderDiscoveryState().phase).toBe('sleeping');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toContain('/health');
  });
  it('refreshes a failed provider list after confirming site readiness without a manual rescan', async () => {
    beginProviderDiscovery(true)(false);
    const request = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/agents')
      ? { agents: [] } : { ok: true, state: 'running', runtimeState: 'ready', site: { key: 'recovery-site' } })));
    const scopedWindow: Record<string, unknown> = {
      location: { search: '' }, sessionStorage: { getItem: () => null, setItem: () => {} }, localStorage: { getItem: () => null, setItem: () => {} },
      __PIXFLOW_DESIGN_WORDPRESS__: { version: '2.0.2', siteHash: 'recovery-site', bridgeBaseUrl: 'http://127.0.0.1:7456' },
      pixflowDesignBridgeStatus: { checked: true, running: true, state: 'connected' },
      setTimeout, clearTimeout, dispatchEvent: vi.fn(), fetch: request,
    };
    scopedWindow.parent = scopedWindow; scopedWindow.top = scopedWindow;
    vi.stubGlobal('window', scopedWindow);
    await ensurePixflowOptionalBridgeSiteContext();
    await vi.waitFor(() => expect(getProviderDiscoveryState().phase).toBe('ready'));
    expect(request.mock.calls.filter(([url]) => url.includes('/agents'))).toHaveLength(1);
  });
  it('leaves a sleeping site alone during refresh and wakes it once before a user request', async () => {
    let sleeping = true;
    const calls: string[] = [];
    const scopedWindow: Record<string, unknown> = {
      location: { search: '' }, sessionStorage: { getItem: () => null, setItem: () => {} },
      __PIXFLOW_DESIGN_WORDPRESS__: { version: '2.0.2', siteHash: 'sleeping-site', bridgeBaseUrl: 'http://127.0.0.1:7456' },
      setTimeout, clearTimeout,
      dispatchEvent: vi.fn(),
      fetch: async (url: string) => {
        calls.push(url);
        if (url.endsWith('/switch')) sleeping = false;
        return new Response(JSON.stringify({ ok: true, state: 'running', site: { key: 'sleeping-site' }, runtimeState: sleeping ? 'sleeping' : 'ready' }));
      },
    };
    scopedWindow.parent = scopedWindow; scopedWindow.top = scopedWindow;
    vi.stubGlobal('window', scopedWindow);
    await ensurePixflowOptionalBridgeSiteContext({ allowSiteSwitch: false });
    expect(calls.filter(url => url.endsWith('/switch'))).toHaveLength(0);
    await Promise.all([ensurePixflowOptionalBridgeSiteContext(), ensurePixflowOptionalBridgeSiteContext()]);
    expect(calls.filter(url => url.endsWith('/switch'))).toHaveLength(1);
    expect(sleeping).toBe(false);
  });
  it.each(['amr', 'gemini'])('hides retired Open Design agent %s', (id) => {
    expect(isPixflowSupportedCliAgent({ id })).toBe(false);
  });

  it.each(['codex', 'claude', 'antigravity', 'opencode', 'cursor-agent', 'copilot', 'pi'])(
    'keeps supported CLI %s',
    (id) => {
      expect(isPixflowSupportedCliAgent({ id })).toBe(true);
    },
  );

  it('distinguishes an intentional abort from a Bridge disconnection', () => {
    const controller = new AbortController();
    controller.abort();

    expect(isPixflowIntentionalAbort(new Error('fetch failed'), controller.signal)).toBe(true);
    expect(isPixflowIntentionalAbort(new DOMException('Stopped.', 'AbortError'))).toBe(true);
    expect(isPixflowIntentionalAbort(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('keeps passive WordPress Bridge calls dormant until the host publishes a connection', () => {
    const stored = new Map<string, string>();
    const scopedWindow: Record<string, unknown> = {
      location: { search: '' },
      sessionStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
      },
      __PIXFLOW_DESIGN_WORDPRESS__: {
        version: '1.1.5',
        bridgeBaseUrl: 'http://127.0.0.1:7456',
      },
    };
    scopedWindow.parent = scopedWindow;
    scopedWindow.top = scopedWindow;
    vi.stubGlobal('window', scopedWindow);

    expect(pixflowOptionalBridgeCanRequest()).toBe(false);

    scopedWindow.pixflowDesignBridgeStatus = {
      checked: true,
      running: false,
      state: 'missing',
    };
    expect(pixflowOptionalBridgeCanRequest()).toBe(false);

    scopedWindow.pixflowDesignBridgeStatus = {
      checked: true,
      running: true,
      state: 'connected',
      siteMismatch: false,
    };
    expect(pixflowOptionalBridgeCanRequest()).toBe(true);

    (scopedWindow.pixflowDesignBridgeStatus as Record<string, unknown>).siteMismatch = true;
    expect(pixflowOptionalBridgeCanRequest()).toBe(false);
    expect(pixflowOptionalBridgeCanRequest(true)).toBe(true);
  });
});
