import { afterEach, describe, expect, it, vi } from 'vitest';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } satisfies Storage;
}

describe('agent icon asset cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('warms optional menu artwork without creating unused preload hints', async () => {
    const appendChild = vi.fn();
    const fetch = vi.fn(async () => new Response('<svg/>', { status: 200 }));
    vi.stubGlobal('window', { localStorage: memoryStorage(), fetch, btoa });
    vi.stubGlobal('document', { createElement: () => ({}), head: { appendChild } });
    vi.stubGlobal('Image', class { decoding = ''; src = ''; });
    const icons = await import('../../src/components/agentIconAssets');
    icons.warmAgentIconAssetUrls(['/agent-icons/codex.svg', '/agent-icons/codex.svg']);
    await icons.cacheAgentIconAssetUrl('/agent-icons/codex.svg');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(appendChild).not.toHaveBeenCalled();
    expect(await icons.cacheAgentIconAssetUrl('/agent-icons/codex.svg')).toMatch(/^data:image/);
  });

  it('persists a loaded icon and restores it synchronously in a new document', async () => {
    const localStorage = memoryStorage();
    const fetch = vi.fn(async () => new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', {
      status: 200,
      headers: { 'content-type': 'image/svg+xml' },
    }));
    vi.stubGlobal('window', {
      pixflowDesignShell: {
        appAssetBaseUrl: 'https://example.test/plugin/assets/app/',
        version: '1.1.5',
      },
      localStorage,
      fetch,
      btoa,
    });

    const firstDocument = await import('../../src/components/agentIconAssets');
    const assetUrl = firstDocument.agentIconAssetUrl('opencode');
    expect(assetUrl).toBe('https://example.test/plugin/assets/app/agent-icons/opencode.svg');
    const loadedUrl = await firstDocument.cacheAgentIconAssetUrl(assetUrl || '');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(loadedUrl).toMatch(/^data:image\/svg\+xml;base64,/);

    // Simulate navigating to a different WP Admin document. Module memory is
    // gone, but the same-origin persistent cache remains.
    vi.resetModules();
    const nextDocument = await import('../../src/components/agentIconAssets');
    expect(nextDocument.cachedAgentIconAssetUrl('opencode')).toBe(loadedUrl);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('invalidates website artwork cached under the same installed version when switching to directory Free', async () => {
    vi.stubGlobal('window', {
      pixflowDesignShell: {
        appAssetBaseUrl: 'https://example.test/plugin/assets/app/',
        version: '2.0.4',
      },
      localStorage: memoryStorage(),
      fetch: vi.fn(async () => new Response('<svg/>', { status: 200 })),
      btoa,
    });
    const website = await import('../../src/components/agentIconAssets');
    const websiteUrl = website.agentIconAssetUrl('codex')!;
    const cachedWebsite = await website.cacheAgentIconAssetUrl(websiteUrl);
    expect(website.cachedAgentIconAssetUrl('codex')).toBe(cachedWebsite);

    vi.stubGlobal('PixflowSharedRuntime', { monochromeProviderArtwork: true });
    vi.resetModules();
    const directory = await import('../../src/components/agentIconAssets');
    expect(directory.agentIconAssetUrl('codex')).not.toBe(websiteUrl);
    expect(directory.cachedAgentIconAssetUrl('codex')).toBeNull();
    expect(directory.agentIconAssetUrl('codex')).toContain('?pixflow-artwork=directory-v1');
    expect(directory.providerIconAssetUrl('model-icons/openai.svg')).toBe('https://example.test/plugin/assets/app/model-icons/openai.svg?pixflow-artwork=directory-v1');
    expect(await directory.cacheAgentIconAssetUrl(directory.agentIconAssetUrl('devin')!)).toMatch(/^data:image\/png;base64,/);
  });

  it('uses the native editor bootstrap for every provider icon before the workspace mounts', async () => {
    vi.stubGlobal('window', {
      pixflowDesignWpAdmin: {
        appAssetBaseUrl: 'https://example.test/wp-content/plugins/pixflow-ai/assets/app/',
        version: '2.0.4',
      },
      localStorage: memoryStorage(),
      location: { href: 'https://example.test/?etch=magic&post_id=3199' },
    });
    vi.stubGlobal('HTMLScriptElement', class {});
    vi.stubGlobal('document', { currentScript: null, scripts: [] });
    const icons = await import('../../src/components/agentIconAssets');
    const urls = icons.allAgentIconAssetUrls();
    expect(urls.length).toBeGreaterThan(20);
    expect(urls.every(url => url.startsWith('https://example.test/wp-content/plugins/pixflow-ai/assets/app/agent-icons/'))).toBe(true);
  });
});
