import { getPixflowWordPressConfig, hasPixflowWordPressContext } from './wordpress-context';
import { pixflowWordPressRestFetch } from './runtime-fetch';
import { PIXFLOW_LICENSE_CHANGED, refreshPixflowFeatureRuntime } from './feature-runtime';
import { ensurePixflowOptionalBridgeSiteContext, pixflowOptionalBridgeSiteHeaders } from './optional-bridge';
import type { PixflowPairingStart, PixflowPairingResult } from '@open-design/contracts';
import { pixflowPairingErrorMessage } from '@open-design/contracts';
import {
  createPixflowBricksAgentMessage,
  isPixflowBricksAgentMessage,
  PIXFLOW_BRICKS_AGENT_FRAME_SOURCE,
  PIXFLOW_BRICKS_AGENT_SHELL_SOURCE,
} from './bricks-agent-frame-protocol';

export type PixflowLicenseSummary = {
  present: boolean;
  valid: boolean;
  status: string;
  message?: string;
  license_key_masked?: string;
  license_id?: string;
  purchase_id?: string;
  license_expires_at?: string;
  activation_limit?: number | null;
  activations_count?: number | null;
  last_validated_at?: string;
};

export type PixflowLicenseStatus = {
  pro?: import('@open-design/contracts').PixflowProInstallation;
  requires_license: boolean;
  license: PixflowLicenseSummary;
  runtime_ready?: boolean;
  central_entitlement?: {
    enabled: boolean;
    valid: boolean;
    offline?: boolean;
    expires_at?: number;
    offline_until?: number;
    code?: string;
  };
  bridge_entitlement?: {
    token: string;
    issued_at?: string;
    expires_at?: string;
    grace_expires_at?: string;
    ttl_seconds?: number;
    grace_seconds?: number;
  };
};

const LICENSE_STATUS_SESSION_CACHE_KEY = 'pixflow-design:license-status-cache';
const LICENSE_STATUS_CACHE_MS = 30_000;

function readCachedPixflowLicenseStatus(): PixflowLicenseStatus | null {
  if (typeof window === 'undefined') return null;
  const cached = window.__PIXFLOW_DESIGN_LICENSE_STATUS_CACHE__;
  if (cached && Date.now() - cached.checkedAt < LICENSE_STATUS_CACHE_MS) {
    return cached.value;
  }
  try {
    const raw = window.sessionStorage.getItem(LICENSE_STATUS_SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { checkedAt?: number; value?: PixflowLicenseStatus };
    if (!parsed.value || Date.now() - Number(parsed.checkedAt || 0) >= LICENSE_STATUS_CACHE_MS) return null;
    window.__PIXFLOW_DESIGN_LICENSE_STATUS_CACHE__ = {
      value: parsed.value,
      checkedAt: Number(parsed.checkedAt || Date.now()),
    };
    return parsed.value;
  } catch {
    return null;
  }
}

function writeCachedPixflowLicenseStatus(status: PixflowLicenseStatus): void {
  if (typeof window === 'undefined') return;
  const cached = {
    value: status,
    checkedAt: Date.now(),
  };
  window.__PIXFLOW_DESIGN_LICENSE_STATUS_CACHE__ = cached;
  try {
    window.sessionStorage.setItem(LICENSE_STATUS_SESSION_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // sessionStorage can be unavailable in locked-down browser contexts.
  }
}

type WordPressRestResponse<T> = {
  ok: boolean;
  status: number;
  body: T;
};

type PendingRequest = {
  resolve: (value: WordPressRestResponse<unknown>) => void;
  reject: (error: Error) => void;
  timeout: number;
};

const pending = new Map<string, PendingRequest>();
let listenerInstalled = false;
// A status read can be in flight while onboarding validates the license. If
// that older read completes afterwards, its pre-validation (usually
// `missing`) response must not overwrite the authoritative result returned by
// the validation mutation. Keep a small generation counter so reads can
// reconcile against the latest session cache instead of publishing stale
// WordPress state.
let licenseMutationGeneration = 0;
let latestLicenseMutation: Promise<PixflowLicenseStatus> | null = null;
let featureRuntimeSignature = '';

async function publishLicenseStatus(status: PixflowLicenseStatus, generation: number, force = false): Promise<void> {
  const signature = JSON.stringify([status.license.valid, status.central_entitlement?.valid, status.pro?.installation, status.pro?.eligible]);
  if (force || featureRuntimeSignature !== signature) {
    await refreshPixflowFeatureRuntime(() => requestWordPressRest('license/features'), () => generation === licenseMutationGeneration);
    if (generation !== licenseMutationGeneration) return;
    featureRuntimeSignature = signature;
  }
  if (generation !== licenseMutationGeneration) return;
  if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new CustomEvent(PIXFLOW_LICENSE_CHANGED, { detail: status }));
}

declare global {
  interface Window {
    __PIXFLOW_DESIGN_WORDPRESS__?: {
      ajaxUrl?: string;
      apiBaseUrl?: string;
      bridgeAllowedOrigin?: string;
      bridgeBaseUrl?: string;
      bridgeRequiredVersion?: string;
      iconUrl?: string;
      pluginUrl?: string;
      restBaseUrl?: string;
      restNonce?: string;
      version?: string;
      theme?: string;
      accentColor?: string;
      workspaceInitiallyVisible?: boolean;
    };
    __PIXFLOW_DESIGN_LICENSE_STATUS_CACHE__?: {
      value: PixflowLicenseStatus;
      checkedAt: number;
    };
    wpApiSettings?: {
      nonce?: string;
    };
  }
}

function isReusableCachedLicenseStatus(status: PixflowLicenseStatus): boolean {
  if (status.requires_license === false && !status.license.valid) return true;
  if (status.central_entitlement?.enabled) {
    const grant = status.central_entitlement;
    const deadline = grant.offline ? grant.offline_until : grant.expires_at;
    return status.license.valid === true && status.runtime_ready !== false
      && grant.valid === true && Number(deadline) > Date.now() / 1000;
  }
  // A negative result can be produced during the short interval in which the
  // WordPress shell is restoring its site context. Never let that transient
  // result become a blocking source of truth. A valid site result remains safe
  // to reuse for the short cache window; entitlement sync is best-effort.
  return status.license.valid === true;
}

export function isPixflowWordPressEmbed(): boolean {
  // Pixflow-owned: license state must be site-scoped through WordPress. The
  // bridge app can load before injected config exists, so URL flags also count.
  return hasPixflowWordPressContext();
}

function installResponseListener(): void {
  if (listenerInstalled || typeof window === 'undefined') return;
  listenerInstalled = true;
  window.addEventListener('message', (event) => {
    const data = event.data as {
      source?: string;
      type?: string;
      requestId?: string;
      payload?: WordPressRestResponse<unknown>;
    } | null;
    if (isPixflowBricksAgentMessage(event.data)) {
      if (
        event.data.source !== PIXFLOW_BRICKS_AGENT_SHELL_SOURCE
        || event.data.type !== 'pixflow-bricks-agent:wp-rest-response'
      ) {
        return;
      }

      const requestId = event.data.requestId ?? '';
      const request = pending.get(requestId);
      if (!request) return;

      window.clearTimeout(request.timeout);
      pending.delete(requestId);
      if (event.data.error) {
        request.reject(new Error(event.data.error.message || 'WordPress REST request failed.'));
        return;
      }
      request.resolve((event.data.payload ?? { ok: false, status: 0, body: {} }) as WordPressRestResponse<unknown>);
      return;
    }

    if (!data || data.source !== 'pixflow-design-shell' || data.type !== 'pixflow-design:wp-rest-response') {
      return;
    }
    const requestId = data.requestId ?? '';
    const request = pending.get(requestId);
    if (!request) return;

    window.clearTimeout(request.timeout);
    pending.delete(requestId);
    request.resolve(data.payload ?? { ok: false, status: 0, body: {} });
  });
}

export async function requestWordPressRest<T>(
  path: string,
  options: { method?: string; body?: Record<string, unknown>; keepalive?: boolean } = {},
): Promise<WordPressRestResponse<T>> {
  if (typeof window === 'undefined') {
    throw new Error('Pixflow WordPress bridge is not available.');
  }

  // Pixflow-owned: the full Pixflow workspace runs inside the local bridge
  // iframe and must proxy REST through the parent WordPress shell. The Bricks
  // Agent React panel is mounted directly in the builder document, so it can
  // use the injected nonce and REST base URL without postMessage.
  if (window.parent === window) {
    const shell = window.__PIXFLOW_DESIGN_WORDPRESS__ || window.pixflowDesignShell || getPixflowWordPressConfig();
    const restBaseUrl = String(shell?.restBaseUrl || '').replace(/\/+$/, '');
    let restNonce = String(shell?.restNonce || window.wpApiSettings?.nonce || '');
    if (!restBaseUrl || !restNonce) {
      throw new Error('Pixflow WordPress REST context is not available.');
    }
    const request = async (): Promise<WordPressRestResponse<T>> => {
      const response = await pixflowWordPressRestFetch(path, {
        method: options.method ?? 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-WP-Nonce': restNonce,
        },
        ...(options.keepalive ? { keepalive: true } : {}),
        ...(options.method && options.method !== 'GET' ? { body: JSON.stringify(options.body ?? {}) } : {}),
      });
      const body = await response.json().catch(() => ({})) as T;
      return {
        ok: response.ok,
        status: response.status,
        body,
      };
    };

    let response = await request();
    const responseBody = response.body as { code?: unknown } | null;
    if (response.status === 403 && responseBody?.code === 'rest_cookie_invalid_nonce') {
      const ajaxUrl = String(shell?.ajaxUrl || '').trim();
      if (ajaxUrl) {
        const refreshBody = new URLSearchParams();
        refreshBody.set('action', 'pixflow_design_refresh_rest_nonce');
        const refreshResponse = await fetch(ajaxUrl, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
          body: refreshBody.toString(),
        });
        const refreshPayload = await refreshResponse.json().catch(() => ({})) as {
          success?: boolean;
          data?: { restNonce?: unknown };
        };
        const refreshedNonce = refreshPayload.success
          ? String(refreshPayload.data?.restNonce || '')
          : '';
        if (refreshResponse.ok && refreshedNonce) {
          restNonce = refreshedNonce;
          if (window.__PIXFLOW_DESIGN_WORDPRESS__) {
            window.__PIXFLOW_DESIGN_WORDPRESS__.restNonce = refreshedNonce;
          }
          if (window.pixflowDesignShell) {
            window.pixflowDesignShell.restNonce = refreshedNonce;
          }
          if (window.wpApiSettings) {
            window.wpApiSettings.nonce = refreshedNonce;
          }
          response = await request();
        }
      }
    }
    return response;
  }

  installResponseListener();
  const requestId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `pixflow-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const promise = new Promise<WordPressRestResponse<unknown>>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('WordPress REST request timed out.'));
    }, 20000);
    pending.set(requestId, { resolve, reject, timeout });
  });

  if (isHostedBricksAgentFrame()) {
    window.parent.postMessage(createPixflowBricksAgentMessage(
      PIXFLOW_BRICKS_AGENT_FRAME_SOURCE,
      'pixflow-bricks-agent:wp-rest-request',
      {
        path,
        method: options.method ?? 'GET',
        body: options.body ?? {},
        keepalive: options.keepalive === true,
      },
      { requestId },
    ), '*');
    return promise as Promise<WordPressRestResponse<T>>;
  }

  // Pixflow-owned: all license calls go through the parent Bricks/WP shell so
  // the local bridge app never relies on cross-origin WordPress cookies.
  window.parent.postMessage({
    source: 'pixflow-design',
    type: 'pixflow-design:wp-rest-request',
    requestId,
    path,
    method: options.method ?? 'GET',
    body: options.body ?? {},
    keepalive: options.keepalive === true,
  }, '*');

  return promise as Promise<WordPressRestResponse<T>>;
}

export async function requestWordPressAjax<T>(
  action: string,
  body: Record<string, unknown> = {},
): Promise<WordPressRestResponse<T>> {
  if (typeof window === 'undefined') {
    throw new Error('Pixflow WordPress AJAX context is not available.');
  }

  const shell = window.__PIXFLOW_DESIGN_WORDPRESS__ || window.pixflowDesignShell || getPixflowWordPressConfig();
  const ajaxUrl = String((shell as { ajaxUrl?: unknown } | undefined)?.ajaxUrl || '').trim();
  const restNonce = String(shell?.restNonce || window.wpApiSettings?.nonce || '');
  if (!ajaxUrl || !restNonce) {
    throw new Error('Pixflow WordPress AJAX context is not available.');
  }

  const payload = new URLSearchParams();
  payload.set('action', action);
  payload.set('_wpnonce', restNonce);
  Object.entries(body).forEach(([key, value]) => {
    if (value === undefined) return;
    payload.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  });

  const response = await fetch(ajaxUrl, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-WP-Nonce': restNonce,
    },
    body: payload.toString(),
  });
  const parsed = await response.json().catch(() => ({})) as T;

  return {
    ok: response.ok,
    status: response.status,
    body: parsed,
  };
}

function isHostedBricksAgentFrame(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('pixflowBricksAgent') === '1';
}

async function syncBridgeEntitlement(status: PixflowLicenseStatus): Promise<void> {
  if (!isPixflowWordPressEmbed()) return;
  if (status.central_entitlement?.enabled) return;

  const shell = typeof window !== 'undefined'
    ? window.__PIXFLOW_DESIGN_WORDPRESS__ || window.pixflowDesignShell
    : null;
  const bridgeState = (shell as { bridge?: { available?: unknown } } | null)?.bridge;
  const bridgeAvailable = bridgeState?.available === true;
  const bridgeBaseUrl = String((shell as { bridgeBaseUrl?: unknown } | null)?.bridgeBaseUrl || '').replace(/\/+$/, '');
  if (!bridgeAvailable) {
    return;
  }
  if (!bridgeBaseUrl) {
    console.warn('[pixflow] No bridgeBaseUrl was provided; skipping entitlement sync.');
    return;
  }
  const entitlementUrl = `${bridgeBaseUrl}/api/pixflow/license-entitlement`;
  const bridgeFetch = typeof window !== 'undefined'
    ? (window.__PIXFLOW_DESIGN_NATIVE_FETCH__ || window.fetch.bind(window))
    : fetch;

  // Pixflow-owned: WordPress remains the trusted license validator, while the
  // local daemon receives a long-lived entitlement for write/generation calls.
  if (status.license.valid === true && status.bridge_entitlement?.token) {
    await bridgeFetch(entitlementUrl, {
      method: 'POST',
      cache: 'no-store',
      targetAddressSpace: 'loopback',
      headers: pixflowOptionalBridgeSiteHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ token: status.bridge_entitlement.token }),
    } as RequestInit).catch((error) => {
      console.warn('[pixflow] Could not sync bridge license entitlement', error);
    });
  }
}

async function clearBridgeEntitlement(): Promise<void> {
  if (!isPixflowWordPressEmbed()) return;
  const shell = typeof window !== 'undefined'
    ? window.__PIXFLOW_DESIGN_WORDPRESS__ || window.pixflowDesignShell
    : null;
  const bridgeState = (shell as { bridge?: { available?: unknown } } | null)?.bridge;
  const bridgeBaseUrl = String((shell as { bridgeBaseUrl?: unknown } | null)?.bridgeBaseUrl || '').replace(/\/+$/, '');
  if (bridgeState?.available !== true || !bridgeBaseUrl) return;
  const bridgeFetch = typeof window !== 'undefined'
    ? (window.__PIXFLOW_DESIGN_NATIVE_FETCH__ || window.fetch.bind(window))
    : fetch;
  await bridgeFetch(`${bridgeBaseUrl}/api/pixflow/license-entitlement`, {
    method: 'DELETE',
    headers: pixflowOptionalBridgeSiteHeaders(),
    cache: 'no-store',
    targetAddressSpace: 'loopback',
  } as RequestInit).catch(() => {});
}

/**
 * Reconcile the WordPress license entitlement with the optional local Bridge
 * before a protected Bridge request (for example the onboarding CLI smoke
 * test). The localized shell can report an unknown bridge state while the
 * Bridge is already running, so this explicit path uses the configured
 * loopback URL instead of waiting for the optional health probe to settle.
 */
export async function ensurePixflowLicenseEntitlement(options: {allowSiteSwitch?: boolean} = {}): Promise<void> {
  if (!isPixflowWordPressEmbed()) return;

  const status = await fetchPixflowLicenseStatus({ force: true });
  const token = String(status.bridge_entitlement?.token || '').trim();
  const central = status.central_entitlement?.enabled === true;
  if (status.requires_license !== false && (status.license.valid !== true || (central ? status.runtime_ready !== true || status.central_entitlement?.valid !== true : !token))) {
    throw new Error(status.license.message || 'Validate your Pixflow Design license to continue.');
  }

  const shell = typeof window !== 'undefined'
    ? window.__PIXFLOW_DESIGN_WORDPRESS__ || window.pixflowDesignShell
    : null;
  const bridgeBaseUrl = String((shell as { bridgeBaseUrl?: unknown } | null)?.bridgeBaseUrl || '').replace(/\/+$/, '');
  if (!bridgeBaseUrl) {
    throw new Error('Pixflow Design Bridge is not configured for this site.');
  }

  const bridgeFetch = typeof window !== 'undefined'
    ? (window.__PIXFLOW_DESIGN_NATIVE_FETCH__ || window.fetch.bind(window))
    : fetch;
  if (central) {
    await ensurePixflowOptionalBridgeSiteContext(options);
    const response = await bridgeFetch(`${bridgeBaseUrl}/api/pixflow/central-entitlement`, {
      method: 'GET', cache: 'no-store', targetAddressSpace: 'loopback',
      headers: pixflowOptionalBridgeSiteHeaders(),
    } as RequestInit);
    const body = await response.json().catch(() => null) as { valid?: boolean; pro_valid?: boolean } | null;
    const proRenewed = status.license.valid === true && status.central_entitlement?.valid === true && body?.pro_valid === false;
    if (!response.ok || body?.valid !== true || proRenewed) {
      await pairPixflowBridge({ notifyReconnect: false,allowSiteSwitch:options.allowSiteSwitch });
    }
    return;
  }
  const response = await bridgeFetch(`${bridgeBaseUrl}/api/pixflow/license-entitlement`, {
    method: 'POST',
    cache: 'no-store',
    targetAddressSpace: 'loopback',
    headers: pixflowOptionalBridgeSiteHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ token }),
  } as RequestInit);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string; error?: { message?: string } } | null;
    throw new Error(body?.error?.message || body?.message || `Pixflow Design Bridge entitlement sync failed (${response.status}).`);
  }
}

export async function fetchPixflowLicenseStatus(
  options: { force?: boolean } = {},
): Promise<PixflowLicenseStatus> {
  if (!isPixflowWordPressEmbed()) {
    // Pixflow-owned: Pixflow Design licensing is always WordPress-site scoped.
    // During bridge/WP boot the app can briefly load before context flags are
    // available; never treat that timing gap as a valid standalone license.
    return {
      requires_license: true,
      license: {
        present: false,
        valid: false,
        status: 'missing',
        message: 'Open Pixflow Design from WordPress to validate your site license.',
      },
    };
  }

  const cached = options.force ? null : readCachedPixflowLicenseStatus();
  if (cached && isReusableCachedLicenseStatus(cached)) {
    await syncBridgeEntitlement(cached);
    await publishLicenseStatus(cached, licenseMutationGeneration);
    return cached;
  }

  const requestGeneration = licenseMutationGeneration;
  const response = await requestWordPressRest<PixflowLicenseStatus>('license/status');
  if (!response.ok) {
    throw new Error((response.body as { message?: string })?.message ?? 'Could not read Pixflow license status.');
  }

  // Pixflow-owned: onboarding validation/reset is authoritative for the
  // current session. An older GET may resolve after that mutation and return
  // the previous missing/invalid result; use the status written by the
  // mutation rather than letting the stale response reopen the license gate.
  if (requestGeneration !== licenseMutationGeneration) {
    if (latestLicenseMutation) return latestLicenseMutation;
    const latest = readCachedPixflowLicenseStatus();
    if (latest) {
      await syncBridgeEntitlement(latest);
      return latest;
    }
  }

  writeCachedPixflowLicenseStatus(response.body);
  await syncBridgeEntitlement(response.body);
  await publishLicenseStatus(response.body, requestGeneration, options.force);
  if (requestGeneration !== licenseMutationGeneration && latestLicenseMutation) return latestLicenseMutation;
  return response.body;
}

export function validatePixflowLicense(licenseKey: string): Promise<PixflowLicenseStatus> {
  return mutatePixflowLicense('validate', { license_key: licenseKey });
}

export type PixflowInstallationRecovery = {
  request: { schema: 'pixflow.installation-recovery.v1'; installation_id: string; public_key_pem: string; site_url: string };
  account_url: string;
};

export async function preparePixflowInstallationRecovery(licenseKey = ''): Promise<PixflowInstallationRecovery> {
  const response = await requestWordPressRest<PixflowInstallationRecovery & {message?: string}>('license/recovery/prepare', {method: 'POST', body: licenseKey.trim() ? {license_key: licenseKey.trim()} : {}});
  if (!response.ok) throw new Error(response.body.message || 'Could not prepare installation recovery.');
  return response.body;
}

export function completePixflowInstallationRecovery(installationId: string): Promise<PixflowLicenseStatus> {
  return mutatePixflowLicense('recovery/complete', {installation_id: installationId});
}

export async function authorizePixflowBridgeChallenge(challenge: string, siteUrl: string): Promise<string> {
  const response = await requestWordPressRest<{code?:string}>('license/pairing/authorize', {method:'POST',body:{challenge,siteUrl}});
  if (!response.ok) throw new Error(pixflowPairingErrorMessage(response.body, 'wordpress_authorize', response.status));
  if (typeof response.body?.code !== 'string' || !/^[a-f0-9]{64}$/u.test(response.body.code)) throw new Error(pixflowPairingErrorMessage({code:'pairing_invalid_response'}, 'wordpress_authorize', response.status));
  return response.body.code;
}

export async function pairPixflowBridge(options: { notifyReconnect?: boolean; allowSiteSwitch?: boolean } = {}): Promise<void> {
  const shell = window.__PIXFLOW_DESIGN_WORDPRESS__ || window.pixflowDesignShell || getPixflowWordPressConfig();
  const base = String((shell as {bridgeBaseUrl?:string})?.bridgeBaseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('Connect the bridge to this site first.');
  await ensurePixflowOptionalBridgeSiteContext(options);
  const nativeFetch = window.__PIXFLOW_DESIGN_NATIVE_FETCH__ || window.fetch.bind(window);
  const post = async <T,>(route: string, body: object): Promise<T> => {
    const stage = route === 'start' ? 'bridge_start' : 'wordpress_exchange';
    let response: Response;
    try {
      response = await nativeFetch(`${base}/api/pixflow/pairing/${route}`, {method:'POST',cache:'no-store',targetAddressSpace:'loopback',headers:pixflowOptionalBridgeSiteHeaders({'Content-Type':'application/json'}),body:JSON.stringify(body)} as RequestInit);
    } catch { throw new Error(pixflowPairingErrorMessage({code:'pairing_browser_connection'}, stage)); }
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(pixflowPairingErrorMessage(result, stage, response.status));
    if (!result || typeof result !== 'object') throw new Error(pixflowPairingErrorMessage({code:'pairing_invalid_response'}, stage, response.status));
    return result as T;
  };
  const start = await post<PixflowPairingStart>('start', {});
  if (typeof start.requestId !== 'string' || typeof start.challenge !== 'string' || typeof start.siteUrl !== 'string') throw new Error(pixflowPairingErrorMessage({code:'pairing_invalid_response'}, 'bridge_start'));
  const code = await authorizePixflowBridgeChallenge(start.challenge,start.siteUrl);
  const result = await post<PixflowPairingResult>('complete',{requestId:start.requestId,code});
  if (!result.ok || !result.valid) throw new Error(pixflowPairingErrorMessage(result, 'verification'));
  if (options.notifyReconnect !== false) {
    window.dispatchEvent(new CustomEvent('pixflow-design:bridge-reconnect-request', { detail: { source: 'license-pairing' } }));
  }
}

export function resetPixflowLicense(): Promise<PixflowLicenseStatus> {
  return mutatePixflowLicense('reset');
}

/** Only the most recent user mutation may publish license state into this session. */
function mutatePixflowLicense(operation: 'validate' | 'reset' | 'recovery/complete', body?: Record<string, unknown>): Promise<PixflowLicenseStatus> {
  const generation = ++licenseMutationGeneration;
  const mutation = (async (): Promise<PixflowLicenseStatus> => {
    let response = await requestWordPressRest<PixflowLicenseStatus & { message?: string }>(`license/${operation}`, {
      method: 'POST', ...(body ? { body } : {}),
    });
    if (response.ok && operation === 'recovery/complete') {
      response = await requestWordPressRest<PixflowLicenseStatus & { message?: string }>('license/status');
    }
    if (generation !== licenseMutationGeneration && latestLicenseMutation) return latestLicenseMutation;
    if (!response.ok) throw new Error(response.body?.message ?? `Pixflow license ${operation} failed.`);
    const committedGeneration = ++licenseMutationGeneration;
    writeCachedPixflowLicenseStatus(response.body);
    if (operation === 'reset') {
      if (!response.body.central_entitlement?.enabled) await clearBridgeEntitlement();
    } else {
      await syncBridgeEntitlement(response.body);
    }
    await publishLicenseStatus(response.body, committedGeneration, true);
    if (committedGeneration !== licenseMutationGeneration && latestLicenseMutation) return latestLicenseMutation;
    return response.body;
  })();
  latestLicenseMutation = mutation;
  return mutation;
}
