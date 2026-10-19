import { migrateWorkspaceRouteHash } from './workspace-route-hash';
import { createRoot, type Root } from 'react-dom/client';
import { installPixflowInputAutofillProtection } from './input-autofill';
import { installPixflowClientDiagnostics } from './client-diagnostics';
import { App } from '../App';
import { navigate } from '../router';
import { I18nProvider } from '../i18n';
import { WpAdminOnboardingHost } from './WpAdminOnboardingHost';
import { persistPixflowWordPressConfig } from './wordpress-context';
import { applyAppearanceToDocument } from '../state/appearance';
import { createPixflowSharedAppConfigNotification } from './shared-app-config-notification';
import '../index.css';
import '../styles/home/index.css';

type PixflowDesignWordPressConfig = {
  ajaxUrl?: string;
  apiBaseUrl?: string;
  bridgeAllowedOrigin?: string;
  bridgeBaseUrl?: string;
  // Pixflow-owned: populated by the WordPress plugin for bridge compatibility UI.
  bridgeRequiredVersion?: string;
  iconUrl?: string;
  pluginUrl?: string;
  restBaseUrl?: string;
  restNonce?: string;
  siteHash?: string;
  siteLabel?: string;
  siteOrigin?: string;
  siteUrl?: string;
  version?: string;
  theme?: string;
  accentColor?: string;
  workspaceInitiallyVisible?: boolean;
  settingsPortal?: boolean;
  surface?: 'bricks_builder' | 'wp_admin' | 'workspace';
  appConfig?: Record<string, unknown>;
  context?: Record<string, unknown>;
  contextUrl?: string;
  panelStorageKey?: string;
  sessionStorageKey?: string;
  settingsProfile?: string;
  userId?: number | string;
  userLocale?: string;
};

type PixflowDesignMountHandle = {
  unmount(): void;
};

declare global {
  interface Window {
    PixflowDesignApp?: {
      mount(container: HTMLElement, config?: PixflowDesignWordPressConfig): PixflowDesignMountHandle;
    };
    __PIXFLOW_DESIGN_NATIVE_FETCH__?: typeof window.fetch;
    wpApiSettings?: {
      nonce?: string;
    };
  }
}

migrateWorkspaceRouteHash();

let bridgeInstalled = false;

function normalizeApiBase(apiBaseUrl?: string): string {
  return (apiBaseUrl ?? '').trim().replace(/\/+$/, '');
}

const WORDPRESS_OD_API_PATHS = new Set([
  'agents',
  'app-config',
  'active',
  'analytics',
  'automation-proposals',
  'automation-templates',
  'connectors',
  'design-systems',
  'design-templates',
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
  'prompt-templates',
  'recent-dirs',
  'routines',
  'skills',
  'templates',
  'version',
]);

function isDaemonBackedApiPath(value: string, method = 'GET'): boolean {
  let path = value;

  try {
    path = new URL(value, window.location.href).pathname;
  } catch {
    path = value.split(/[?#]/, 1)[0] ?? value;
  }

  const normalizedMethod = String(method || 'GET').toUpperCase();
  if (path === '/api/connectors' || path.startsWith('/api/connectors/')) return true;
  if (path === '/api/agents' || path.startsWith('/api/agents/')) return true;
  if (path === '/api/projects') return false;
  if (/^\/api\/projects\/[^/]+$/.test(path)) return false;
  // WordPress projects own their files in the site's uploads directory. Keep
  // the complete file transport on the WP REST adapter in API-only installs;
  // otherwise the fetch shim would silently send direct file reads/writes to
  // the optional Bridge even though the registry has a durable WP adapter.
  if (/^\/api\/projects\/[^/]+\/(?:files|folders|upload|raw)(?:[/?#/]|$)/.test(path)) return false;
  if (/^\/api\/projects\/[^/]+\/(?:conversations(?:\/[^/]+(?:(?:\/messages|\/comments)(?:\/[^/]+)?)?)?|tabs|events)(?:[/?#]|$)/.test(path)) return false;
  if (path.startsWith('/api/projects/')) return true;
  if (path === '/api/import' || path.startsWith('/api/import/')) return true;
  if (path === '/api/dialog' || path.startsWith('/api/dialog/')) return true;
  if (path === '/api/runs' || path.startsWith('/api/runs/')) return true;
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
  if (path === '/api/pixflow/visual-capture') return true;
  if (path === '/api/pixflow/website-clone-source') return true;

  return false;
}

function mapRuntimeApiUrl(value: string, config: PixflowDesignWordPressConfig, method = 'GET'): { url: string; useRestNonce: boolean } | null {
  const wordpressApiBaseUrl = normalizeApiBase(config.apiBaseUrl);
  const bridgeBaseUrl = normalizeApiBase(config.bridgeBaseUrl);
  const restBaseUrl = normalizeApiBase(config.restBaseUrl);

  if (bridgeBaseUrl && (value === '/api' || value.startsWith('/api/')) && isDaemonBackedApiPath(value, method)) {
    return { url: `${bridgeBaseUrl}${value}`, useRestNonce: false };
  }

  if ((value === '/api' || value.startsWith('/api/')) && wordpressApiBaseUrl) {
    const apiPath = value === '/api' ? '' : value.slice('/api/'.length);
    const firstSegment = apiPath.split(/[/?#]/, 1)[0] ?? '';
    if (WORDPRESS_OD_API_PATHS.has(firstSegment)) {
      return { url: `${wordpressApiBaseUrl}${value === '/api' ? '' : value.slice(4)}`, useRestNonce: true };
    }
  }

  if (bridgeBaseUrl && wordpressApiBaseUrl && value.startsWith(`${bridgeBaseUrl}/api/`)) {
    const bridgePath = value.slice(bridgeBaseUrl.length);
    if (isDaemonBackedApiPath(bridgePath, method)) {
      return { url: value, useRestNonce: false };
    }
    const apiPath = bridgePath.slice('/api/'.length);
    const firstSegment = apiPath.split(/[/?#]/, 1)[0] ?? '';
    if (WORDPRESS_OD_API_PATHS.has(firstSegment)) {
      return { url: `${wordpressApiBaseUrl}${bridgePath.slice(4)}`, useRestNonce: true };
    }
  }

  if (restBaseUrl && value.startsWith(`${restBaseUrl}/od/`)) {
    return { url: value, useRestNonce: true };
  }

  if (bridgeBaseUrl && (value.startsWith('/artifacts/') || value.startsWith('/frames/'))) {
    return { url: `${bridgeBaseUrl}${value}`, useRestNonce: false };
  }

  return null;
}

function withRestNonce(init: RequestInit | undefined, request: Request | null, restNonce?: string): RequestInit | undefined {
  const nonce = restNonce || window.wpApiSettings?.nonce || '';
  if (!nonce) return init;

  const requestInit = init ? { ...init } : {};
  const headers = new Headers(requestInit.headers ?? request?.headers ?? {});
  headers.set('X-WP-Nonce', nonce);
  requestInit.headers = headers;

  return requestInit;
}

function withBridgeSiteHeaders(
  init: RequestInit | undefined,
  request: Request | null,
  siteHash?: string,
): RequestInit | undefined {
  const headers = new Headers(init?.headers ?? request?.headers ?? {});
  [
    'X-WP-Nonce',
    'X-OD-Analytics-Device-Id',
    'X-OD-Analytics-Session-Id',
    'X-OD-Analytics-Client-Type',
    'X-OD-Analytics-Locale',
    'X-OD-Analytics-Request-Id',
    'X-OD-Client',
  ].forEach((name) => headers.delete(name));

  const siteKey = String(siteHash || '').trim();
  if (siteKey) headers.set('X-Pixflow-Site-Key', siteKey);

  if (!init && Array.from(headers.keys()).length === 0) return undefined;
  return {
    ...(init ?? {}),
    headers,
  };
}

function installWordPressBridge(config: PixflowDesignWordPressConfig): void {
  if (bridgeInstalled) return;

  if (!normalizeApiBase(config.apiBaseUrl) && !normalizeApiBase(config.bridgeBaseUrl)) return;

  bridgeInstalled = true;
  window.__PIXFLOW_DESIGN_WORDPRESS__ = config;
  persistPixflowWordPressConfig(config);
  window.dispatchEvent(new CustomEvent('pixflow-design:wordpress-runtime-ready', { detail: config }));

  const nativeFetch = window.fetch.bind(window);
  window.__PIXFLOW_DESIGN_NATIVE_FETCH__ = nativeFetch;
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let nextInput: RequestInfo | URL = input;
    let originalRequest: Request | null = input instanceof Request ? input : null;
    const originalUrl = input instanceof Request ? input.url : String(input);
    const shouldMirrorAppConfig = isAppConfigMutation(originalUrl, init);
    const method = String(init?.method || originalRequest?.method || 'GET').toUpperCase();
    let mappedTarget: { url: string; useRestNonce: boolean } | null = null;

    if (typeof input === 'string') {
      mappedTarget = mapRuntimeApiUrl(input, config, method);
      nextInput = mappedTarget?.url ?? input;
    } else if (input instanceof URL) {
      mappedTarget = mapRuntimeApiUrl(input.toString(), config, method);
      nextInput = mappedTarget ? new URL(mappedTarget.url) : input;
    } else if (input instanceof Request) {
      mappedTarget = mapRuntimeApiUrl(input.url, config, method);
      const mapped = mappedTarget?.url ?? input.url;
      if (mapped !== input.url) {
        nextInput = new Request(mapped, input);
        originalRequest = nextInput;
      }
    }

    const requestInit = mappedTarget?.useRestNonce
      ? withRestNonce(init, originalRequest, config.restNonce)
      : mappedTarget
        ? withBridgeSiteHeaders(init, originalRequest, config.siteHash)
        : init;
    const response = nativeFetch(nextInput, requestInit);

    // Pixflow-owned: the builder-native Bricks Agent panel is not mounted in
    // this iframe, so it cannot read iframe-local config. Mirror appearance
    // changes into WP whenever the embedded app saves /api/app-config.
    if (shouldMirrorAppConfig && !mappedTarget?.useRestNonce) {
      void response
        .then((nextResponse) => {
          if (nextResponse.ok) {
            void mirrorWordPressAppConfig(init?.body, config, nativeFetch);
          }
          return nextResponse;
        })
        .catch(() => {});
    }

    return response;
  };

  if (typeof window.EventSource === 'function') {
    const NativeEventSource = window.EventSource;
    window.EventSource = (function PixflowDesignEventSource(url: string | URL, eventSourceInitDict?: EventSourceInit) {
      const target = mapRuntimeApiUrl(String(url), config, 'GET');
      let mapped = target?.url ?? String(url);

      if (target?.useRestNonce && /\/od\/(?:memory\/events|projects\/[^/?#]+\/events)(?:[?#]|$)/.test(mapped)) {
        return createNoopEventSource(mapped);
      }

      if (target?.useRestNonce && config.restNonce && !mapped.includes('_wpnonce=')) {
        mapped += `${mapped.includes('?') ? '&' : '?'}_wpnonce=${encodeURIComponent(config.restNonce)}`;
      }

      return new NativeEventSource(mapped, eventSourceInitDict);
    } as unknown) as typeof EventSource;
    window.EventSource.prototype = NativeEventSource.prototype;
  }
}

function createNoopEventSource(url: string): EventSource {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const source = {
    url,
    withCredentials: false,
    CONNECTING: 0,
    OPEN: 1,
    CLOSED: 2,
    readyState: 2,
    onopen: null,
    onmessage: null,
    onerror: null,
    close() {},
    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
      if (!listener) return;
      const set = listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
      if (!listener) return;
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent() {
      return true;
    },
  };

  return source as unknown as EventSource;
}

function isAppConfigMutation(url: string, init?: RequestInit): boolean {
  const method = String(init?.method || 'GET').toUpperCase();
  if (method !== 'PUT' && method !== 'PATCH' && method !== 'POST') return false;
  try {
    const parsed = new URL(url, window.location.href);
    return /\/api\/app-config\/?$/.test(parsed.pathname);
  } catch {
    return /\/api\/app-config(?:\?|$)/.test(url);
  }
}

async function mirrorWordPressAppConfig(
  body: BodyInit | null | undefined,
  config: PixflowDesignWordPressConfig,
  nativeFetch: typeof window.fetch,
): Promise<void> {
  if (!config.restBaseUrl || !config.restNonce || typeof body !== 'string') return;

  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object') return;
    const notification = createPixflowSharedAppConfigNotification(parsed, 'wp_admin', 'wordpress-embed');
    if (!notification) return;
    const redactedConfig = redactAppConfigForWordPress(parsed as Record<string, unknown>);
    await nativeFetch(`${config.restBaseUrl.replace(/\/+$/, '')}/od/app-config`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-WP-Nonce': config.restNonce,
      },
      body: JSON.stringify(redactedConfig),
    });
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        source: 'pixflow-design',
        type: 'pixflow-design:app-config-changed',
        config: notification.patch,
        notification,
      }, '*');
    }
  } catch {
    // Best-effort mirror only; the bridge save remains the source action.
  }
}

function redactAppConfigForWordPress(config: Record<string, unknown>): Record<string, unknown> {
  const secretEnvKeys = new Set(['ANTHROPIC_API_KEY', 'CODEX_API_KEY', 'OPENAI_API_KEY']);
  const redacted: Record<string, unknown> = { ...config };
  delete redacted.apiKey;
  if (redacted.agentCliEnv && typeof redacted.agentCliEnv === 'object') {
    const env = redacted.agentCliEnv as Record<string, unknown>;
    redacted.agentCliEnv = Object.fromEntries(Object.entries(env).map(([agentId, values]) => {
      if (!values || typeof values !== 'object') return [agentId, {}];
      return [agentId, Object.fromEntries(
        Object.entries(values as Record<string, unknown>)
          .filter(([key]) => !secretEnvKeys.has(key)),
      )];
    }));
  }
  if (redacted.apiProtocolConfigs && typeof redacted.apiProtocolConfigs === 'object') {
    redacted.apiProtocolConfigs = Object.fromEntries(
      Object.entries(redacted.apiProtocolConfigs as Record<string, unknown>).map(([protocol, values]) => {
        if (!values || typeof values !== 'object') return [protocol, {}];
        const safeValues = { ...(values as Record<string, unknown>) };
        delete safeValues.apiKey;
        return [protocol, safeValues];
      }),
    );
  }
  return redacted;
}

function applyThemeInit(container: HTMLElement, shellConfig: PixflowDesignWordPressConfig = {}): void {
  try {
    const config = JSON.parse(localStorage.getItem('open-design:config') || '{}') as {
      accentColor?: unknown;
      theme?: unknown;
    };
    const shellTheme = shellConfig.theme === 'light' || shellConfig.theme === 'dark'
      ? shellConfig.theme
      : undefined;
    const shellAccentColor = typeof shellConfig.accentColor === 'string'
      ? shellConfig.accentColor
      : undefined;
    container.classList.add('pixflow-design-token-scope');
    document.documentElement.classList.add('pixflow-design-wordpress-runtime');
    applyAppearanceToDocument({
      theme: shellTheme ?? (config.theme === 'light' || config.theme === 'dark' ? config.theme : undefined),
      accentColor: shellAccentColor ?? (typeof config.accentColor === 'string' ? config.accentColor : undefined),
    });
  } catch {
    // Theme init is a best-effort FOUC guard; React owns the real settings state.
  }
}

function shouldMountBricksAgentFrame(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('pixflowBricksAgent') === '1';
}

function shouldMountWpAdminAgentFrame(config: PixflowDesignWordPressConfig): boolean {
  if (config.surface === 'wp_admin') return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('pixflowWpAdminAgent') === '1';
}

function mount(container: HTMLElement, config: PixflowDesignWordPressConfig = {}): PixflowDesignMountHandle {
  installPixflowInputAutofillProtection();
  installPixflowClientDiagnostics();
  installWordPressBridge(config);
  if (config.appConfig?.onboardingCompleted === false && !shouldMountBricksAgentFrame()) {
    navigate({ kind: 'home', view: 'onboarding' }, { replace: true });
  }
  // Prime the small bundled icon catalogue before the composer and agent menu
  // paint. The shared cache survives normal WP Admin page navigation.
  container.classList.add('pixflow-design-token-scope');
  document.documentElement.classList.add('pixflow-design-wordpress-runtime');
  applyThemeInit(container, config);

  container.innerHTML = '';
  if (shouldMountBricksAgentFrame()) {
    const renderer = (window as typeof window & { PixflowProBricks?: { mount(container: HTMLElement): PixflowDesignMountHandle } }).PixflowProBricks;
    if (!renderer) throw new Error('The Bricks integration could not load. Update Pixflow Design Pro and reload this editor.');
    return renderer.mount(container);
  }
  const root: Root = createRoot(container);
  const content = shouldMountWpAdminAgentFrame(config)
    ? <WpAdminOnboardingHost completed={config.appConfig?.onboardingCompleted === true} route={config.appConfig?.onboardingRoute} />
    : <App settingsPortal={config.settingsPortal === true} workspaceInitiallyVisible={config.workspaceInitiallyVisible} />;
  root.render(
    <I18nProvider>
      {content}
    </I18nProvider>,
  );

  return {
    unmount() {
      root.unmount();
      container.classList.remove('pixflow-design-token-scope');
    },
  };
}

window.PixflowDesignApp = { mount };
