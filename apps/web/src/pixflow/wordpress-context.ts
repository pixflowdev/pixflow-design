/** Host-shell transport fields are shared even when no premium editor is loaded. */
export type PixflowShellConfig = {
  ajaxUrl?: string;
  bridgeBaseUrl?: string;
  apiBaseUrl?: string;
  restBaseUrl?: string;
  restNonce?: string;
  appAssetBaseUrl?: string;
  theme?: unknown;
  accentColor?: unknown;
};

declare global {
  interface Window {
    pixflowDesignShell?: PixflowShellConfig;
    pixflowDesignWpAdmin?: PixflowShellConfig;
  }
}

export type PixflowDesignWordPressConfig = {
  workspaceAvailable?: boolean;
  ajaxUrl?: string;
  apiBaseUrl?: string;
  appAssetBaseUrl?: string;
  bridgeAllowedOrigin?: string;
  bridgeBaseUrl?: string;
  bridgeManifestUrl?: string;
  bridgeInstallUnixUrl?: string;
  bridgeInstallWindowsUrl?: string;
  bridgeInstallMacArm64Url?: string;
  bridgeRequiredVersion?: string;
  iconUrl?: string;
  quickMenuIconUrl?: string;
  placeholderImageUrl?: string;
  pluginUrl?: string;
  restBaseUrl?: string;
  /**
   * Query-string REST transport used for WordPress hosts whose front controller
   * cannot rewrite custom routes containing the `wp-admin` segment. The
   * pretty REST base remains the default for every other request.
   */
  restRouteBaseUrl?: string;
  restNonce?: string;
  runtime?: string;
  runtimeMode?: string;
  bricksIntegrationActive?: boolean;
  etchIntegrationActive?: boolean;
  elementorIntegrationActive?: boolean;
  gutenbergGlobalStylesAvailable?: boolean;
  siteHash?: string;
  siteLabel?: string;
  siteOrigin?: string;
  siteUrl?: string;
  theme?: string;
  appConfig?: { theme?: string; accentColor?: string };
  accentColor?: string;
  version?: string;
  postId?: number | string;
  userId?: number | string;
  userLocale?: string;
  workspaceInitiallyVisible?: boolean;
  /** Admin quick-menu settings must remain visible outside a hidden workspace. */
  settingsPortal?: boolean;
  /** Request-scoped launch identity. Never persist with reusable site config. */
  builderHandoff?: { id: string; tabId: string; postId: number } | null;
};

const PIXFLOW_BUILDER_POST_ID_STORAGE_KEY = 'pixflow:builder-post-id:v1';
const PIXFLOW_WORDPRESS_CONFIG_STORAGE_KEY = 'pixflow:wordpress-config:v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPixflowConfigLike(value: unknown): value is PixflowDesignWordPressConfig {
  if (!isRecord(value)) return false;
  return [
    'apiBaseUrl',
    'bridgeBaseUrl',
    'bridgeRequiredVersion',
    'restBaseUrl',
    'restNonce',
    'runtime',
    'runtimeMode',
    'siteHash',
    'version',
  ].some((key) => typeof value[key] === 'string' && String(value[key]).trim());
}

function readConfigFromWindow(source: Window | null | undefined): PixflowDesignWordPressConfig | undefined {
  if (!source) return undefined;
  try {
    const scopedWindow = source as Window & {
      pixflowDesignShell?: PixflowDesignWordPressConfig;
      pixflowDesignWpAdmin?: PixflowDesignWordPressConfig;
      __PIXFLOW_DESIGN_WORDPRESS__?: PixflowDesignWordPressConfig;
    };
    const candidate = scopedWindow.__PIXFLOW_DESIGN_WORDPRESS__
      ?? scopedWindow.pixflowDesignWpAdmin
      ?? scopedWindow.pixflowDesignShell;
    if (!isPixflowConfigLike(candidate)) return undefined;
    // wp_localize_script stringifies top-level scalar values (false becomes '').
    const active = (candidate as Record<string, unknown>).bricksIntegrationActive;
    const etchActive = (candidate as Record<string, unknown>).etchIntegrationActive;
    const elementorActive = (candidate as Record<string, unknown>).elementorIntegrationActive;
    const gutenbergStyles = (candidate as Record<string, unknown>).gutenbergGlobalStylesAvailable;
    return { ...candidate,
      ...(active === undefined ? {} : { bricksIntegrationActive: active === true || active === '1' }),
      ...(elementorActive === undefined ? {} : { elementorIntegrationActive: elementorActive === true || elementorActive === '1' }),
      ...(gutenbergStyles === undefined ? {} : { gutenbergGlobalStylesAvailable: gutenbergStyles === true || gutenbergStyles === '1' }),
      ...(etchActive === undefined ? {} : { etchIntegrationActive: etchActive === true || etchActive === '1' }),
    };

  } catch {
    return undefined;
  }
}

function readStoredPixflowConfig(): PixflowDesignWordPressConfig | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.sessionStorage.getItem(PIXFLOW_WORDPRESS_CONFIG_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    return isPixflowConfigLike(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readConfigFromQuery(): PixflowDesignWordPressConfig | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const params = new URLSearchParams(window.location.search);
    const config: PixflowDesignWordPressConfig = {};
    const bridgeRequiredVersion = params.get('pixflowBridgeRequiredVersion');
    const version = params.get('pixflowWpVersion');
    const siteHash = params.get('pixflowSiteHash');
    const siteOrigin = params.get('pixflowSiteOrigin');
    const postId = params.get('pixflowWpPostId');
    if (bridgeRequiredVersion) config.bridgeRequiredVersion = bridgeRequiredVersion;
    if (version) config.version = version;
    if (siteHash) config.siteHash = siteHash;
    if (siteOrigin) config.siteOrigin = siteOrigin;
    if (postId) config.postId = postId;
    return isPixflowConfigLike(config) ? config : undefined;
  } catch {
    return undefined;
  }
}

export function persistPixflowWordPressConfig(config: PixflowDesignWordPressConfig | undefined): void {
  if (typeof window === 'undefined' || !isPixflowConfigLike(config)) return;
  try {
    const { builderHandoff: _launchIdentity, ...siteConfig } = config!;
    window.sessionStorage.setItem(PIXFLOW_WORDPRESS_CONFIG_STORAGE_KEY, JSON.stringify(siteConfig));
  } catch {
    // Session storage is only a route/window handoff helper.
  }
}

export function getPixflowWordPressConfig(): PixflowDesignWordPressConfig | undefined {
  if (typeof window === 'undefined') return undefined;

  const config =
    readConfigFromWindow(window)
    ?? readConfigFromWindow(window.parent)
    ?? readConfigFromWindow(window.top)
    ?? readStoredPixflowConfig()
    ?? readConfigFromQuery();

  if (config) persistPixflowWordPressConfig(config);
  return config;
}

function readPixflowWordPressConfig(): PixflowDesignWordPressConfig | undefined {
  return getPixflowWordPressConfig();
}

function readPixflowShellConfig(): PixflowDesignWordPressConfig | undefined {
  if (typeof window === 'undefined') return undefined;
  return readConfigFromWindow(window) ?? readConfigFromWindow(window.parent) ?? readConfigFromWindow(window.top);
}

export function getPixflowBridgeBaseUrl(): string {
  const baseUrl = getPixflowWordPressConfig()?.bridgeBaseUrl;
  return typeof baseUrl === 'string' ? baseUrl.trim().replace(/\/+$/, '') : '';
}

export function getPixflowRestConfig(): Pick<PixflowDesignWordPressConfig, 'restBaseUrl' | 'restNonce'> {
  const config = getPixflowWordPressConfig();
  return {
    restBaseUrl: typeof config?.restBaseUrl === 'string' ? config.restBaseUrl : '',
    restNonce: typeof config?.restNonce === 'string' ? config.restNonce : '',
  };
}

export function getPixflowShellConfig(): PixflowDesignWordPressConfig | undefined {
  return readPixflowShellConfig();
}

// Pixflow-owned: the bridge-hosted app runs at 127.0.0.1 and receives its
// WordPress/Bricks context through URL flags, while the bundled WP entry sets a
// window config object. Keep this detection shared so Pixflow-only UI does not
// disappear depending on which mount path loaded the React app.
export function hasPixflowWordPressContext(): boolean {
  if (typeof window === 'undefined') return false;

  const config = readPixflowWordPressConfig();
  if (config?.version || config?.restBaseUrl || config?.bridgeRequiredVersion) {
    return true;
  }

  const shellConfig = readPixflowShellConfig();
  if (shellConfig?.version || shellConfig?.restBaseUrl || shellConfig?.bridgeRequiredVersion) {
    return true;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    if (
      params.has('pixflowWpRest') ||
      params.has('pixflowWpVersion') ||
      params.has('pixflowBridgeRequiredVersion')
    ) {
      return true;
    }
  } catch {
    // Continue to iframe/referrer checks below.
  }

  try {
    const frameName = window.name || '';
    const referrer = document.referrer || '';

    // Pixflow-owned: client-side routing in the bridge app can strip the
    // initial WordPress query flags. The Bricks iframe name/referrer remains
    // available and lets license/framework calls keep using the WP REST proxy.
    if (window.parent !== window && frameName === 'pixflow-design-frame') {
      return true;
    }

    if (window.parent !== window && /(?:[?&]bricks=run\b|\/wp-admin\/)/i.test(referrer)) {
      return true;
    }

    // Pixflow-owned: when the bridge iframe is mounted with no referrer and no
    // query string, an embedded parent is still the only place the WP REST proxy
    // can live. This does not grant license access by itself; REST calls still
    // have to be answered by the WordPress builder shell.
    if (window.parent !== window) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

// Pixflow-owned: the bridge app starts with WordPress context in the iframe
// query string, then client-side project routes remove that query. Persist the
// active Bricks post id once so direct HTML-to-Bricks handoffs can still target
// the correct page after route changes.
export function getPixflowBuilderPostId(): number | null {
  if (typeof window === 'undefined') return null;

  const config = readPixflowWordPressConfig();
  let candidate: number | string | null = config?.postId ?? null;

  try {
    const params = new URLSearchParams(window.location.search);
    candidate = params.get('pixflowWpPostId') || candidate;
  } catch {
    // Continue to shell/session fallbacks.
  }

  try {
    const shellConfig = (window as unknown as {
      pixflowDesignShell?: { postId?: number | string };
    }).pixflowDesignShell;
    candidate = candidate || shellConfig?.postId || null;
  } catch {
    // Continue to parent/session fallbacks.
  }

  try {
    const parentConfig = (window.parent as unknown as {
      pixflowDesignShell?: { postId?: number | string };
    }).pixflowDesignShell;
    candidate = candidate || parentConfig?.postId || null;
  } catch {
    // Cross-origin parent access is expected in the local bridge iframe.
  }

  const numericCandidate = Number(candidate || 0);
  if (Number.isFinite(numericCandidate) && numericCandidate > 0) {
    try {
      window.sessionStorage.setItem(PIXFLOW_BUILDER_POST_ID_STORAGE_KEY, String(numericCandidate));
    } catch {
      // Session storage is a route persistence helper only.
    }
    return numericCandidate;
  }

  try {
    const stored = Number(window.sessionStorage.getItem(PIXFLOW_BUILDER_POST_ID_STORAGE_KEY) || 0);
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

// Pixflow-owned: the Bricks handoff is only valid for generated HTML artifacts.
// Media-only runs still get normal OD follow-ups, but no Bricks conversion row.
export function isPixflowBricksHandoffFileName(fileName: string | null | undefined): boolean {
  const clean = String(fileName || '').split(/[?#]/, 1)[0]?.trim() ?? '';
  return /\.html?$/i.test(clean);
}
