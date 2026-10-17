import { getPixflowWordPressConfig, hasPixflowWordPressContext, type PixflowDesignWordPressConfig } from './wordpress-context';

function normalizeBaseUrl(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

function appendApiPath(baseUrl: string, path: string): string {
  const url = new URL(baseUrl);
  const hashIndex = path.indexOf('#');
  const pathWithoutHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const hash = hashIndex >= 0 ? path.slice(hashIndex + 1) : '';
  const queryIndex = pathWithoutHash.indexOf('?');
  const pathname = queryIndex >= 0 ? pathWithoutHash.slice(0, queryIndex) : pathWithoutHash;
  const search = queryIndex >= 0 ? pathWithoutHash.slice(queryIndex + 1) : '';
  const normalizedSuffix = pathname.replace(/^\/+/, '');
  const restRoute = url.searchParams.get('rest_route');

  if (restRoute !== null) {
    url.searchParams.set(
      'rest_route',
      `${restRoute.replace(/\/+$/, '')}/${normalizedSuffix}`,
    );
  } else {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/${normalizedSuffix}`;
  }

  for (const [key, value] of new URLSearchParams(search)) {
    url.searchParams.append(key, value);
  }
  if (hash) url.hash = hash;

  return url.toString();
}

const WORDPRESS_OD_API_PATHS = new Set([
  'agents',
  'app-config',
  'active',
  'analytics',
  'automation-proposals',
  'automation-templates',
  'connectors',
  'editors',
  'health',
  'live-artifacts',
  'marketplaces',
  'mcp',
  'media',
  'memory',
  'pixflow',
  'plugins',
  'projects',
  'skills',
  'version',
  'design-systems',
  'design-templates',
  'prompt-templates',
  'recent-dirs',
  'routines',
  'templates',
]);

function isDaemonBackedApiPath(path: string): boolean {
  // Connector credentials, discovery and OAuth state are owned by the Bridge.
  if (/^\/api\/connectors(?:[/?#]|$)/.test(path)) return true;
  if (path === '/api/agents' || path.startsWith('/api/agents/')) return true;
  if (path === '/api/projects') return false;
  if (/^\/api\/projects\/[^/]+$/.test(path)) return false;
  // A WordPress project is durable in the site's uploads directory. Keep its
  // file tree on the same origin so API/BYOK users do not need the optional
  // daemon merely to open, save, or preview a project file. Desktop projects
  // retain the daemon-backed path below.
  if (
    hasPixflowWordPressContext()
    && /^\/api\/projects\/[^/]+\/(?:files|folders|upload|raw)(?:[/?#]|$)/.test(path)
  ) return false;
  if (/^\/api\/projects\/[^/]+\/(?:files|folders)(?:[/?#/]|$)/.test(path)) return true;
  if (/^\/api\/projects\/[^/]+\/(?:conversations(?:\/[^/]+(?:(?:\/messages|\/comments)(?:\/[^/]+)?)?)?|tabs|events)(?:[/?#]|$)/.test(path)) return false;
  if (path.startsWith('/api/projects/')) return true;
  if (path === '/api/import' || path.startsWith('/api/import/')) return true;
  if (path === '/api/dialog' || path.startsWith('/api/dialog/')) return true;
  if (path === '/api/runs' || path.startsWith('/api/runs/')) return true;
  if (path === '/api/research' || path.startsWith('/api/research/')) return true;
  if (path === '/api/amr' || path.startsWith('/api/amr/')) return true;
  if (path === '/api/artifacts' || path.startsWith('/api/artifacts/')) return true;
  if (path === '/api/integrations' || path.startsWith('/api/integrations/')) return true;
  if (path === '/api/editors') return true;
  if (path.startsWith('/api/editors/')) return true;
  if (path === '/api/applied-plugins' || path.startsWith('/api/applied-plugins/')) return true;

  if (path === '/api/pixflow-sync' || path.startsWith('/api/pixflow-sync/')) return true;

  if (/^\/api\/plugins\/[^/]+\/(?:share-project|upgrade|uninstall)(?:[/?#]|$)/.test(path)) return true;
  if (/^\/api\/plugins\/[^/]+\/plugins\/(?:install-folder|share-tasks)(?:[/?#]|$)/.test(path)) return true;
  if (/^\/api\/plugins\/[^/]+\/share-tasks(?:[/?#]|$)/.test(path)) return true;
  if (/^\/api\/plugins\/share-tasks\/[^/]+\/wait(?:[/?#]|$)/.test(path)) return true;
  if (/^\/api\/plugins\/(?:install|upload-zip|upload-folder)(?:[/?#]|$)/.test(path)) return true;

  if (path.startsWith('/api/pixflow/bricks-handoff/')) return true;
  if (path.startsWith('/api/pixflow/bricks-agent/')) return true;
  if (path.startsWith('/api/pixflow/direct-site/')) return true;
  if (path.startsWith('/api/pixflow/dictation/')) return true;
  if (path.startsWith('/api/pixflow/visual-capture')) return true;
  if (path.startsWith('/api/pixflow/website-clone-source')) return true;

  return false;
}

export function toPixflowWordPressApiUrl(path: string): string | null {
  if (typeof window === 'undefined') return null;

  const config = pixflowWordPressConfig();
  const apiBaseUrl = normalizeBaseUrl(config?.apiBaseUrl);
  if (!apiBaseUrl || path !== '/api' && !path.startsWith('/api/')) return null;
  if (isDaemonBackedApiPath(path)) return null;

  const apiPath = path === '/api' ? '' : path.slice('/api/'.length);
  const firstSegment = apiPath.split(/[/?#]/, 1)[0] ?? '';
  if (!WORDPRESS_OD_API_PATHS.has(firstSegment)) return null;

  return path === '/api' ? apiBaseUrl : appendApiPath(apiBaseUrl, path.slice(4));
}

export function toPixflowPreviewAssetUrl(path: string): string {
  if (typeof window === 'undefined') return path;

  const config = pixflowWordPressConfig();

  const bridgeBaseUrl = normalizeBaseUrl(config?.bridgeBaseUrl);
  if (!bridgeBaseUrl) return path;

  if (path.startsWith('/artifacts/') || path.startsWith('/frames/')) {
    return `${bridgeBaseUrl}${path}`;
  }

  return path;
}

export function toPixflowRuntimeUrl(path: string): string {
  if (typeof window !== 'undefined' && (path === '/api' || path.startsWith('/api/')) && isDaemonBackedApiPath(path)) {
    const bridgeBaseUrl = normalizeBaseUrl(pixflowWordPressConfig()?.bridgeBaseUrl);
    if (bridgeBaseUrl) return `${bridgeBaseUrl}${path}`;
  }

  const wordpressApiUrl = toPixflowWordPressApiUrl(path);
  if (wordpressApiUrl) return wordpressApiUrl;

  return toPixflowPreviewAssetUrl(path);
}

export function toPixflowRuntimeIframeUrl(path: string): string {
  const url = toPixflowRuntimeUrl(path);
  if (typeof window === 'undefined') return url;

  const config = pixflowWordPressConfig();
  const restNonce = typeof config?.restNonce === 'string' ? config.restNonce : '';
  if (!restNonce) return url;
  try {
    const target = new URL(url, window.location.href);
    if (![config?.restBaseUrl, config?.restRouteBaseUrl, config?.apiBaseUrl]
      .some((base) => isWordPressResourceWithinBase(target, base))) return url;
    if (target.searchParams.has('_wpnonce')) return url;
    target.searchParams.set('_wpnonce', restNonce);
    return target.toString();
  } catch {
    return url;
  }
}

/** Match the configured REST namespace, including plain-permalink transport,
 * without sending a WordPress nonce to another origin or route namespace. */
function isWordPressResourceWithinBase(target: URL, configuredBase: unknown): boolean {
  if (typeof configuredBase !== 'string' || !configuredBase.trim()) return false;
  try {
    const base = new URL(configuredBase);
    if (target.origin !== base.origin) return false;
    const baseRoute = base.searchParams.get('rest_route');
    const targetPath = baseRoute === null ? target.pathname : target.searchParams.get('rest_route');
    if (baseRoute !== null && target.pathname !== base.pathname) return false;
    const basePath = (baseRoute ?? base.pathname).replace(/\/+$/, '');
    return targetPath === basePath || Boolean(targetPath?.startsWith(`${basePath}/`));
  } catch {
    return false;
  }
}

/**
 * @deprecated Use toPixflowRuntimeUrl, toPixflowWordPressApiUrl, or
 * toPixflowPreviewAssetUrl. Kept as an internal alias while call sites are
 * moved off the old bridge-first naming.
 */
export function toPixflowBridgeUrl(path: string): string {
  return toPixflowRuntimeUrl(path);
}

function pixflowWordPressConfig(): PixflowDesignWordPressConfig | undefined {
  return getPixflowWordPressConfig();
}
