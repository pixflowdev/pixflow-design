import { pixflowPublicAssetUrl } from '../pixflow/public-assets';

const AGENT_ICON_CACHE_SCHEMA = 'v1';
const AGENT_ICON_CACHE_KEY = `pixflow-design:agent-icons:${AGENT_ICON_CACHE_SCHEMA}`;
const MAX_CACHED_AGENT_ICON_BYTES = 96 * 1024;

/** Directory builds supply a licensed monochrome asset set; website artwork is unchanged. */
export function usesMonochromeProviderArtwork(): boolean {
  return (globalThis as typeof globalThis & {
    PixflowSharedRuntime?: { monochromeProviderArtwork?: boolean };
  }).PixflowSharedRuntime?.monochromeProviderArtwork === true;
}

/** Keep the directory asset set distinct from website images cached at the same plugin version and path. */
export function providerIconAssetUrl(path: string): string {
  const url = pixflowPublicAssetUrl(path);
  return usesMonochromeProviderArtwork() ? `${url}${url.includes('?') ? '&' : '?'}pixflow-artwork=directory-v1` : url;
}

type PersistedAgentIconCache = {
  namespace: string;
  values: Record<string, string>;
};

let hydratedCache: PersistedAgentIconCache | null = null;
const cacheRequests = new Map<string, Promise<string>>();
const warmedUrls = new Set<string>();

export const AGENT_ICON_EXT: Record<string, 'svg' | 'png'> = {
  composio: 'png',
  'openai-api': 'svg',
  'anthropic-api': 'png',
  'google-gemini-api': 'svg',
  'azure-openai-api': 'png',
  'ollama-cloud-api': 'png',
  'senseaudio-api': 'png',
  'aihubmix-api': 'png',
  amr: 'svg',
  claude: 'svg',
  codex: 'svg',
  gemini: 'svg',
  opencode: 'svg',
  'cursor-agent': 'svg',
  copilot: 'svg',
  qwen: 'svg',
  qoder: 'svg',
  deepseek: 'svg',
  reasonix: 'svg',
  mimo: 'svg',
  hermes: 'svg',
  'grok-build': 'svg',
  kimi: 'svg',
  pi: 'svg',
  kiro: 'svg',
  kilo: 'svg',
  vibe: 'svg',
  antigravity: 'svg',
  aider: 'png',
  'trae-cli': 'png',
  devin: 'png',
};

export const MONO_AGENT_ICONS = new Set([
  'openai-api',
  'cursor-agent',
  'opencode',
  'hermes',
  'mimo',
  'kilo',
  'grok-build',
]);

export function agentIconAssetUrl(id: string): string | null {
  const ext = AGENT_ICON_EXT[id];
  return ext ? providerIconAssetUrl(`agent-icons/${id}.${ext}`) : null;
}

export function allAgentIconAssetUrls(): string[] {
  return Object.keys(AGENT_ICON_EXT).flatMap((id) => {
    const url = agentIconAssetUrl(id);
    return url ? [url] : [];
  });
}

function agentIconCacheNamespace(): string {
  if (typeof window === 'undefined') return 'server';
  const shell = window as unknown as {
    pixflowDesignShell?: { appAssetBaseUrl?: string; version?: string };
    __PIXFLOW_DESIGN_WORDPRESS__?: { appAssetBaseUrl?: string; version?: string };
    pixflowDesignWpAdmin?: { appAssetBaseUrl?: string; version?: string };
  };
  const runtime = shell.pixflowDesignShell
    || shell.__PIXFLOW_DESIGN_WORDPRESS__
    || shell.pixflowDesignWpAdmin
    || {};
  return `${String(runtime.version || 'app')}|${String(runtime.appAssetBaseUrl || '/')}`;
}

function readPersistedAgentIconCache(): PersistedAgentIconCache {
  const namespace = agentIconCacheNamespace();
  if (hydratedCache?.namespace === namespace) return hydratedCache;
  hydratedCache = { namespace, values: {} };
  if (typeof window === 'undefined') return hydratedCache;
  try {
    const raw = window.localStorage.getItem(AGENT_ICON_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<PersistedAgentIconCache> : null;
    if (parsed?.namespace === namespace && parsed.values && typeof parsed.values === 'object') {
      hydratedCache.values = parsed.values;
    }
  } catch {
    // Hardened browser contexts may disable storage. Native HTTP caching and
    // the current document's in-memory cache remain available.
  }
  return hydratedCache;
}

function persistAgentIconCache(): void {
  if (typeof window === 'undefined' || !hydratedCache) return;
  try {
    window.localStorage.setItem(AGENT_ICON_CACHE_KEY, JSON.stringify(hydratedCache));
  } catch {
    // Agent artwork is an optional performance cache. Never let quota or
    // privacy-mode failures affect the composer.
  }
}

function cachedAgentIconUrl(url: string): string | null {
  const value = readPersistedAgentIconCache().values[url];
  return typeof value === 'string' && value.startsWith('data:image/') ? value : null;
}

function bytesToDataUrl(bytes: Uint8Array, contentType: string): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${contentType};base64,${window.btoa(binary)}`;
}

/**
 * Resolve an icon to its persisted data URL when it has already been loaded.
 * WP Admin serves plugin assets with `Cache-Control: no-cache` on common local
 * stacks, so relying on the HTTP cache alone causes every navigation to
 * revalidate the same marks. This small, version-scoped catalogue makes the
 * second paint synchronous and remains shared by Bricks and WP Admin.
 */
export function cachedAgentIconAssetUrl(id: string): string | null {
  const url = agentIconAssetUrl(id);
  return url ? cachedAgentIconUrl(url) : null;
}

export function cacheAgentIconAssetUrl(url: string): Promise<string> {
  if (typeof window === 'undefined' || !url) return Promise.resolve(url);
  const cached = cachedAgentIconUrl(url);
  if (cached) return Promise.resolve(cached);
  const existing = cacheRequests.get(url);
  if (existing) return existing;

  const request = window.fetch(url, {
    cache: 'force-cache',
    credentials: 'same-origin',
  }).then(async (response) => {
    if (!response.ok) return url;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_CACHED_AGENT_ICON_BYTES) return url;
    const contentType = /\.png(?:[?#]|$)/i.test(url) ? 'image/png' : 'image/svg+xml';
    const dataUrl = bytesToDataUrl(new Uint8Array(buffer), contentType);
    const cache = readPersistedAgentIconCache();
    cache.values[url] = dataUrl;
    persistAgentIconCache();
    return dataUrl;
  }).catch(() => url).finally(() => {
    cacheRequests.delete(url);
  });
  cacheRequests.set(url, request);
  return request;
}

export function warmAgentIconAssetUrls(urls: string[]): void {
  if (typeof window === 'undefined') return;
  for (const url of urls) {
    if (!url || warmedUrls.has(url)) continue;
    warmedUrls.add(url);
    const cached = cachedAgentIconUrl(url);
    const source = cached || url;
    // Menu artwork is optional and may never be displayed. Warm its cache
    // without preload hints, which promise an immediate visible consumer.
    const image = new Image();
    image.decoding = 'async';
    image.src = source;
    void cacheAgentIconAssetUrl(url).then((resolvedUrl) => {
      if (resolvedUrl === source) return;
      const cachedImage = new Image();
      cachedImage.decoding = 'async';
      cachedImage.src = resolvedUrl;
    });
  }
}

export function warmAllAgentIconAssets(): void {
  warmAgentIconAssetUrls(allAgentIconAssetUrls());
}
