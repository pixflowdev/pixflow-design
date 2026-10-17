import { beginProviderDiscovery, getProviderDiscoveryState } from './provider-discovery-state';
import type { AgentInfo, AppConfig } from '../types';
import { getPixflowWordPressConfig } from './wordpress-context';

type PixflowBridgeConfigSource = {
  bridgeBaseUrl?: string;
  bridgeRequiredVersion?: string;
  siteHash?: string;
  siteLabel?: string;
  siteOrigin?: string;
  siteUrl?: string;
  runtime?: string;
  runtimeMode?: string;
};

declare global {
  interface Window {
    __PIXFLOW_DESIGN_NATIVE_FETCH__?: typeof window.fetch;
  }
}

export type PixflowOptionalBridgeHealth = {
  available: boolean;
  runtimeState?: string;
  version?: string;
  requiredVersion?: string;
  status: 'ready' | 'missing' | 'error';
  error?: string;
};

type BridgeAppConfigResponse = {
  config?: Partial<AppConfig>;
};

type BridgeAgentsResponse = {
  agents?: AgentInfo[];
};

type PublishedBridgeStatus = {
  checked?: boolean;
  running?: boolean;
  state?: string;
  status?: string;
  updateRequired?: boolean;
  version?: string;
  siteMismatch?: boolean;
};

export const PIXFLOW_OPTIONAL_BRIDGE_UNAVAILABLE_MESSAGE =
  'Pixflow Design Bridge disconnected. Restart Bridge, then rescan Local CLI settings. API and BYOK features can continue without Bridge.';
export const PIXFLOW_OPTIONAL_BRIDGE_LOOPBACK_BLOCKED_MESSAGE =
  'Chrome blocked or could not reach Pixflow Design Bridge access for this site. Allow Apps on device or local network access for this site, confirm Bridge is running, then rescan Local CLI.';

export class PixflowOptionalBridgeUnavailableError extends Error {
  cause?: unknown;

  constructor(message = PIXFLOW_OPTIONAL_BRIDGE_UNAVAILABLE_MESSAGE, cause?: unknown) {
    super(message);
    this.name = 'PixflowOptionalBridgeUnavailableError';
    this.cause = cause;
  }
}

export class PixflowOptionalBridgeLoopbackAccessError extends PixflowOptionalBridgeUnavailableError {
  constructor(message = PIXFLOW_OPTIONAL_BRIDGE_LOOPBACK_BLOCKED_MESSAGE, cause?: unknown) {
    super(message, cause);
    this.name = 'PixflowOptionalBridgeLoopbackAccessError';
  }
}

let cachedHealth: {
  checkedAt: number;
  value: PixflowOptionalBridgeHealth;
} | null = null;

const HEALTH_CACHE_MS = 30_000;
const HEALTH_FAILURE_CACHE_MS = 2_000;
const AGENTS_CACHE_MS = 60_000;
const PERSISTED_AGENTS_CACHE_TTL_MS = 24 * 60 * 60_000;
const AGENTS_CACHE_STORAGE_PREFIX = 'pixflow-design:bridge-agents:v1:';

let cachedAgents: {
  checkedAt: number;
  value: AgentInfo[];
} | null = null;
let agentsRequest: Promise<AgentInfo[]> | null = null;
const siteContextEnsureRequests = new Map<boolean, Promise<void>>();

const PIXFLOW_RETIRED_AGENT_IDS = new Set(['amr', 'gemini']);

export function isPixflowSupportedCliAgent(agent: Pick<AgentInfo, 'id'>): boolean {
  return !PIXFLOW_RETIRED_AGENT_IDS.has(String(agent.id || '').trim().toLowerCase());
}

function filterPixflowSupportedCliAgents(agents: AgentInfo[]): AgentInfo[] {
  return agents.filter(isPixflowSupportedCliAgent);
}

function readBridgeConfig(): PixflowBridgeConfigSource | null {
  return getPixflowWordPressConfig() ?? null;
}

export function readPublishedBridgeStatus(): PublishedBridgeStatus | null {
  if (typeof window === 'undefined') return null;
  const read = (target: Window): PublishedBridgeStatus | null => {
    try {
      const scopedWindow = target as Window & {
        pixflowDesignBridgeStatus?: unknown;
        pixflowDesignStartupStatus?: unknown;
      };
      const value = scopedWindow.pixflowDesignBridgeStatus;
      const startup = scopedWindow.pixflowDesignStartupStatus;
      const startupBridge = startup && typeof startup === 'object'
        ? (startup as { bridge?: unknown }).bridge
        : null;
      if (startupBridge && typeof startupBridge === 'object') {
        return {
          ...(startupBridge as PublishedBridgeStatus),
          ...(value && typeof value === 'object' ? value as PublishedBridgeStatus : {}),
        };
      }
      return value && typeof value === 'object' ? value as PublishedBridgeStatus : null;
    } catch {
      return null;
    }
  };

  const candidates: Window[] = [];
  const add = (candidate: Window | null | undefined) => {
    if (!candidate || candidates.includes(candidate)) return;
    candidates.push(candidate);
  };
  add(window);
  try { add(window.parent); } catch { /* cross-origin parent */ }
  try { add(window.top); } catch { /* cross-origin top */ }
  for (const candidate of candidates) {
    const value = read(candidate);
    if (value) return value;
  }
  return null;
}

/**
 * Optional Bridge calls stay dormant until the WordPress host has published a
 * connected health state. Explicit user rescans pass `force` and may probe.
 */
export function pixflowOptionalBridgeCanRequest(force = false): boolean {
  if (force || !readBridgeConfig()) return true;
  const status = readPublishedBridgeStatus();
  if (!status) return false;
  return status.siteMismatch !== true
    && (
      status.running === true
      || status.state === 'connected'
      || status.status === 'connected'
      // An outdated Bridge is still reachable. Allowing the probe through is
      // important so Settings can display its installed version and the UI can
      // tell the user to update rather than incorrectly calling it missing.
      || status.state === 'update'
      || status.status === 'update'
      || status.updateRequired === true
    );
}

function agentsCacheStorageKey(): string {
  const siteKey = String(
    readBridgeConfig()?.siteHash
      || (typeof window !== 'undefined' ? window.location.origin : 'site'),
  ).trim() || 'site';
  return `${AGENTS_CACHE_STORAGE_PREFIX}${encodeURIComponent(siteKey)}`;
}

function readPersistedAgentsCache(): { checkedAt: number; value: AgentInfo[] } | null {
  if (typeof window === 'undefined') return null;
  const storages: Storage[] = [];
  try {
    if (window.localStorage) storages.push(window.localStorage);
  } catch {
    // Storage is optional in locked-down admin tabs.
  }
  try {
    if (window.sessionStorage) storages.push(window.sessionStorage);
  } catch {
    // Storage is optional in locked-down admin tabs.
  }

  for (const storage of storages) {
    try {
      const raw = storage.getItem(agentsCacheStorageKey());
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { checkedAt?: unknown; value?: unknown };
      const checkedAt = Number(parsed?.checkedAt || 0);
      if (!checkedAt || Date.now() - checkedAt > PERSISTED_AGENTS_CACHE_TTL_MS) continue;
      if (!Array.isArray(parsed?.value)) continue;
      return { checkedAt, value: filterPixflowSupportedCliAgents(parsed.value as AgentInfo[]) };
    } catch {
      // Ignore malformed or inaccessible cache entries.
    }
  }
  return null;
}

function persistAgentsCache(value: AgentInfo[], checkedAt = Date.now()): void {
  if (typeof window === 'undefined') return;
  const serialized = JSON.stringify({ checkedAt, value });
  try {
    window.localStorage.setItem(agentsCacheStorageKey(), serialized);
  } catch {
    // The in-memory cache remains the source of truth when storage is full.
  }
  try {
    window.sessionStorage.setItem(agentsCacheStorageKey(), serialized);
  } catch {
    // Session storage is only an optional same-tab handoff.
  }
}

function hydratePersistedAgentsCache(): void {
  if (cachedAgents) return;
  const persisted = readPersistedAgentsCache();
  if (persisted) cachedAgents = persisted;
}

export function readCachedPixflowOptionalBridgeAgents(): AgentInfo[] {
  hydratePersistedAgentsCache();
  return cachedAgents?.value ?? [];
}

export function getPixflowOptionalBridgeBaseUrl(): string {
  const configured = readBridgeConfig()?.bridgeBaseUrl;
  return String(configured || 'http://127.0.0.1:7456').replace(/\/+$/, '');
}

export function pixflowOptionalBridgeApiUrl(path: string): string {
  return `${getPixflowOptionalBridgeBaseUrl()}/api/${path.replace(/^\/+/, '')}`;
}

export function isPixflowOptionalBridgeUnavailableError(error: unknown): boolean {
  if (error instanceof PixflowOptionalBridgeUnavailableError) return true;
  if (!(error instanceof Error)) return false;
  const message = String(error.message || '').toLowerCase();
  return error.name === 'AbortError'
    || message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('load failed')
    || message.includes('connection refused')
    || message.includes('bridge disconnected')
    || message.includes('bridge is not running');
}

export function isPixflowIntentionalAbort(error: unknown, signal?: AbortSignal | null): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === 'AbortError');
}

export function isPixflowOptionalBridgeLoopbackAccessError(error: unknown): boolean {
  if (error instanceof PixflowOptionalBridgeLoopbackAccessError) return true;
  if (!(error instanceof Error)) return false;
  const message = String(error.message || '').toLowerCase();
  return error.name === 'PixflowOptionalBridgeLoopbackAccessError'
    || message.includes('loopback')
    || message.includes('local network')
    || message.includes('private network')
    || message.includes('address space')
    || message.includes('targetaddressspace')
    || message.includes('apps on device')
    || message.includes('permission was denied');
}

function isPixflowOptionalBridgeLoopbackFetchFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = String(error.message || '').toLowerCase();
  if (!message.includes('failed to fetch') && !message.includes('load failed')) return false;
  try {
    const base = new URL(getPixflowOptionalBridgeBaseUrl());
    return base.hostname === '127.0.0.1'
      || base.hostname === 'localhost'
      || base.hostname === '[::1]'
      || base.hostname === '::1';
  } catch {
    return false;
  }
}

export function normalizePixflowOptionalBridgeError(error: unknown): Error {
  if (error instanceof PixflowOptionalBridgeUnavailableError) return error;
  if (isPixflowOptionalBridgeLoopbackAccessError(error) || isPixflowOptionalBridgeLoopbackFetchFailure(error)) {
    return new PixflowOptionalBridgeLoopbackAccessError(PIXFLOW_OPTIONAL_BRIDGE_LOOPBACK_BLOCKED_MESSAGE, error);
  }
  if (isPixflowOptionalBridgeUnavailableError(error)) {
    return new PixflowOptionalBridgeUnavailableError(PIXFLOW_OPTIONAL_BRIDGE_UNAVAILABLE_MESSAGE, error);
  }
  return error instanceof Error ? error : new Error(String(error || 'Pixflow Design Bridge request failed.'));
}

export function notifyPixflowOptionalBridgeDisconnected(error?: unknown): void {
  if (typeof window === 'undefined') return;
  const normalized = error
    ? normalizePixflowOptionalBridgeError(error)
    : new PixflowOptionalBridgeUnavailableError();
  const loopbackBlocked = normalized instanceof PixflowOptionalBridgeLoopbackAccessError;
  window.dispatchEvent(new CustomEvent('pixflow-design:optional-bridge-disconnected', {
    detail: {
      kind: loopbackBlocked ? 'loopback-blocked' : 'unavailable',
      message: normalized.message || PIXFLOW_OPTIONAL_BRIDGE_UNAVAILABLE_MESSAGE,
      error: error instanceof Error ? error.message : error ? String(error) : '',
    },
  }));
}

let connectivityCheck: Promise<PixflowOptionalBridgeHealth> | null = null;

export function pixflowOptionalBridgeSiteHeaders(initial: HeadersInit = {}): Headers {
  const headers = new Headers(initial);
  const siteKey = String(readBridgeConfig()?.siteHash || '').trim();
  if (siteKey) headers.set('X-Pixflow-Site-Key', siteKey);
  return headers;
}

function requestWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 3_500): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', abortFromExternal, { once: true });
  }
  const bridgeFetch = window.__PIXFLOW_DESIGN_NATIVE_FETCH__ ?? window.fetch.bind(window);
  const headers = pixflowOptionalBridgeSiteHeaders(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return bridgeFetch(url, {
    ...init,
    cache: 'no-store',
    signal: controller.signal,
    targetAddressSpace: 'loopback',
    headers,
  } as RequestInit).catch(async (error) => {
    // Closing a dialog or cancelling a run only cancels that request.
    if (externalSignal?.aborted) throw error;
    const normalized = normalizePixflowOptionalBridgeError(error);
    if (normalized instanceof PixflowOptionalBridgeUnavailableError) {
      if (url === pixflowOptionalBridgeApiUrl('health')) {
        notifyPixflowOptionalBridgeDisconnected(error);
      } else {
        // A slow endpoint or endpoint-specific CORS failure is not proof that
        // the Bridge is offline. Health owns the shared connection state.
        connectivityCheck ??= probePixflowOptionalBridge({ force: true })
          .finally(() => { connectivityCheck = null; });
        await connectivityCheck;
      }
    }
    throw normalized;
  }).finally(() => {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  });
}

function refreshFailedProvidersAfterReconnect(): void {
  if (getProviderDiscoveryState().phase !== 'error') return;
  // Keep the saved choices visible while a real discovery replaces the stale
  // failure. Discovery publishes 'refreshing' synchronously, coalescing callers.
  void fetchPixflowOptionalBridgeAgents({ force: true }).catch(() => undefined);
}

export async function ensurePixflowOptionalBridgeSiteContext(options?: {
  timeoutMs?: number;
  allowSiteSwitch?: boolean;
}): Promise<void> {
  const allowSiteSwitch=options?.allowSiteSwitch!==false;
  const pending=siteContextEnsureRequests.get(allowSiteSwitch);
  if(pending)return pending;
  const config = readBridgeConfig();
  const siteKey = String(config?.siteHash || '').trim();
  if (!siteKey) return;

  const request = (async () => {
    const timeoutMs = Math.max(5_000, Math.min(45_000, Number(options?.timeoutMs || 45_000)));
    const startedAt = Date.now();
    type SiteReadiness = { ok?: boolean; state?: string; runtimeState?: string; site?: { key?: string } };
    // Selection can be published before the replacement runtime is listening.
    // Older daemons omit readiness fields; an explicit negative is never ready.
    const isReady = (value: SiteReadiness) => String(value?.site?.key || '') === siteKey
      && value.ok !== false && (!value.state || value.state === 'running')
      && !['sleeping', 'waking', 'releasing', 'unavailable'].includes(value.runtimeState || '');
    const health = await pixflowOptionalBridgeJson<SiteReadiness>('health', {}, { timeoutMs: 3_500 });
    const publishRuntime = (state: string) => window.dispatchEvent(new CustomEvent('pixflow-design:bridge-runtime-state', { detail: { state } }));
    publishRuntime(health.runtimeState || 'ready');
    if (isReady(health)) { refreshFailedProvidersAfterReconnect(); return; }
    if (!allowSiteSwitch && health.runtimeState === 'sleeping') return;
    if(!allowSiteSwitch && health.site?.key && health.site.key!==siteKey) {
      throw new PixflowOptionalBridgeUnavailableError('Bridge is connected to another site. Send a request or choose Reconnect to switch to this site.');
    }

    if (String(health?.site?.key || '') !== siteKey || ['sleeping', 'releasing', 'unavailable'].includes(health.runtimeState || '')) {
    publishRuntime('waking');
    await pixflowOptionalBridgeJson('pixflow/site-context/switch', {
      method: 'POST',
      body: JSON.stringify({
        siteKey,
        siteUrl: String(config?.siteUrl || ''),
        siteOrigin: String(config?.siteOrigin || ''),
        siteLabel: String(config?.siteLabel || ''),
      }),
    }, { timeoutMs: Math.max(1, timeoutMs - (Date.now() - startedAt)) });
    }

    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      try {
        const next = await pixflowOptionalBridgeJson<SiteReadiness>('health', {}, { timeoutMs: 2_500 });
        if (isReady(next)) {
          publishRuntime('ready');
          cachedHealth = null;
          refreshFailedProvidersAfterReconnect();
          return;
        }
      } catch {
        // A packaged site switch restarts the daemon. Temporary connection
        // failures are expected until the target site's instance is healthy.
      }
    }
    throw new PixflowOptionalBridgeUnavailableError(
      'Pixflow Design Bridge could not connect to this WordPress site before the request started.',
    );
  })().catch(error => {
    window.dispatchEvent(new CustomEvent('pixflow-design:bridge-runtime-state', { detail: { state: 'unavailable' } }));
    throw error;
  }).finally(() => {
    siteContextEnsureRequests.delete(allowSiteSwitch);
  });

  siteContextEnsureRequests.set(allowSiteSwitch,request);
  return request;
}

export function pixflowOptionalBridgeFetch(
  path: string,
  init: RequestInit = {},
  options?: { timeoutMs?: number },
): Promise<Response> {
  return requestWithTimeout(pixflowOptionalBridgeApiUrl(path), init, options?.timeoutMs);
}

export class PixflowBridgeLicenseError extends Error {}

// Concurrent panel requests share the same site authorization exchange.
let entitlementRecovery: Promise<void> | null = null;

export async function pixflowOptionalBridgeJson<T>(
  path: string,
  init: RequestInit = {},
  options?: { timeoutMs?: number },
): Promise<T> {
  let response = await requestWithTimeout(
    pixflowOptionalBridgeApiUrl(path),
    init,
    options?.timeoutMs,
  );
  if (!response.ok) {
    if (response.status === 403) {
      const detail = await response.clone().json().catch(() => null) as {error?: {code?: string}} | null;
      if (detail?.error?.code === 'PIXFLOW_CENTRAL_ENTITLEMENT_REQUIRED') {
        try {
          entitlementRecovery ??= import('./license')
            .then(({ ensurePixflowLicenseEntitlement }) => ensurePixflowLicenseEntitlement({allowSiteSwitch:false}))
            .finally(() => { entitlementRecovery = null; });
          await entitlementRecovery;
          // This rejection occurs before the protected handler runs. Retry
          // exactly once after normal installation-bound authorization.
          response = await requestWithTimeout(pixflowOptionalBridgeApiUrl(path), init, options?.timeoutMs);
          if (response.ok) return response.json() as Promise<T>;
        } catch (error) {
          throw new PixflowBridgeLicenseError(`Pixflow Design license: ${error instanceof Error ? error.message : 'Automatic bridge pairing failed.'}`);
        }
        throw new PixflowBridgeLicenseError('Pixflow Design license authorization failed after automatic bridge pairing. Check License settings.');
      }
    }
    const detail = await response.json().catch(() => null) as {message?:unknown;error?:unknown} | null;
    const nested = detail?.error && typeof detail.error === 'object' ? (detail.error as {message?:unknown}).message : detail?.error;
    const message = typeof detail?.message === 'string' ? detail.message : typeof nested === 'string' ? nested : '';
    throw new Error(message || `Pixflow Design Bridge returned HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function probePixflowOptionalBridge(options?: {
  force?: boolean;
  timeoutMs?: number;
}): Promise<PixflowOptionalBridgeHealth> {
  if (!pixflowOptionalBridgeCanRequest(options?.force === true)) {
    return cachedHealth?.value ?? {
      available: false,
      requiredVersion: readBridgeConfig()?.bridgeRequiredVersion,
      status: 'missing',
      error: PIXFLOW_OPTIONAL_BRIDGE_UNAVAILABLE_MESSAGE,
    };
  }
  const now = Date.now();
  const healthCacheMs = cachedHealth?.value.available ? HEALTH_CACHE_MS : HEALTH_FAILURE_CACHE_MS;
  if (!options?.force && cachedHealth && now - cachedHealth.checkedAt < healthCacheMs) {
    return cachedHealth.value;
  }

  try {
    const response = await requestWithTimeout(
      pixflowOptionalBridgeApiUrl('health'),
      {},
      options?.timeoutMs ?? 2_500,
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = (await response.json()) as { version?: string; status?: string; runtimeState?: string };
    if (json.runtimeState) window.dispatchEvent(new CustomEvent('pixflow-design:bridge-runtime-state', { detail: { state: json.runtimeState } }));
    const value: PixflowOptionalBridgeHealth = {
      available: true,
      runtimeState: json.runtimeState,
      version: json.version,
      requiredVersion: readBridgeConfig()?.bridgeRequiredVersion,
      status: 'ready',
    };
    cachedHealth = { checkedAt: Date.now(), value };
    return value;
  } catch (error) {
    const value: PixflowOptionalBridgeHealth = {
      available: false,
      requiredVersion: readBridgeConfig()?.bridgeRequiredVersion,
      status: 'missing',
      error: error instanceof Error ? error.message : String(error),
    };
    cachedHealth = { checkedAt: Date.now(), value };
    return value;
  }
}

export async function fetchPixflowOptionalBridgeConfig(): Promise<Partial<AppConfig> | null> {
  if (!pixflowOptionalBridgeCanRequest()) return null;
  try {
    const result = await pixflowOptionalBridgeJson<BridgeAppConfigResponse>('app-config');
    return result.config ?? null;
  } catch {
    return null;
  }
}

export async function persistPixflowOptionalBridgeConfig(
  prefs: Record<string, unknown>,
): Promise<Partial<AppConfig> | null> {
  await ensurePixflowOptionalBridgeSiteContext();
  const result = await pixflowOptionalBridgeJson<BridgeAppConfigResponse>('app-config', {
    method: 'PUT',
    body: JSON.stringify(prefs),
  });
  return result.config ?? null;
}

export async function fetchPixflowOptionalBridgeAgents(options?: {
  signal?: AbortSignal;
  force?: boolean;
}): Promise<AgentInfo[]> {
  hydratePersistedAgentsCache();

  const run = async () => {
    const finishDiscovery = beginProviderDiscovery(Boolean(cachedAgents?.value.length));
    try {
    const force = options?.force === true;
    const health = await probePixflowOptionalBridge({
      force,
      timeoutMs: force ? 2_500 : 1_800,
    });
    if (['sleeping', 'releasing', 'waking'].includes(health.runtimeState || '')) {
      if (force) await ensurePixflowOptionalBridgeSiteContext();
      else { finishDiscovery('sleeping'); return cachedAgents?.value ?? []; }
    }
    if (!health.available) {
      if (health.error && isPixflowOptionalBridgeLoopbackAccessError(new Error(health.error))) {
        throw new PixflowOptionalBridgeLoopbackAccessError(PIXFLOW_OPTIONAL_BRIDGE_LOOPBACK_BLOCKED_MESSAGE);
      }
      finishDiscovery(false);
      return cachedAgents?.value ?? [];
    }
    const result = await pixflowOptionalBridgeJson<BridgeAgentsResponse>(
      force ? 'agents?force=1' : 'agents',
      {
      signal: options?.signal,
      },
      { timeoutMs: force ? 45_000 : 12_000 },
    );
    const value = filterPixflowSupportedCliAgents(result.agents ?? []);
    cachedAgents = { checkedAt: Date.now(), value };
    persistAgentsCache(value, cachedAgents.checkedAt);
    finishDiscovery(true);
    return value;
    } catch (error) { finishDiscovery(false); throw error; }
  };

  const startBackgroundRefresh = (): Promise<AgentInfo[]> => {
    if (!agentsRequest) {
      agentsRequest = run()
        .catch((error) => {
          if (error instanceof PixflowBridgeLicenseError) throw error;
          return cachedAgents?.value ?? [];
        })
        .finally(() => {
          agentsRequest = null;
        });
    }
    return agentsRequest;
  };

  const now = Date.now();
  const cacheAge = cachedAgents ? now - cachedAgents.checkedAt : Infinity;
  if (!options?.force && cachedAgents && cacheAge < AGENTS_CACHE_MS) {
    return cachedAgents.value;
  }
  if (!options?.force && cachedAgents && cacheAge < PERSISTED_AGENTS_CACHE_TTL_MS && !options?.signal) {
    // Callers already render saved providers. Resolve with the fresh list so
    // their state updates when discovery completes instead of retaining stale data.
    return startBackgroundRefresh();
  }
  if (!options?.force && !options?.signal && agentsRequest) {
    return agentsRequest;
  }

  if (options?.force || options?.signal) {
    return run();
  }

  return startBackgroundRefresh();
}

export function clearPixflowOptionalBridgeAgentsCache(): void {
  cachedAgents = null;
  agentsRequest = null;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(agentsCacheStorageKey());
  } catch {
    // Optional storage.
  }
  try {
    window.sessionStorage.removeItem(agentsCacheStorageKey());
  } catch {
    // Optional storage.
  }
}

export async function fetchPixflowOptionalBridgeAgentsStream(args: {
  onAgent: (agent: AgentInfo) => void;
  signal?: AbortSignal;
  force?: boolean;
}): Promise<AgentInfo[]> {
  hydratePersistedAgentsCache();
  if (!args.force && cachedAgents && Date.now() - cachedAgents.checkedAt < AGENTS_CACHE_MS) {
    for (const agent of cachedAgents.value) {
      if (args.signal?.aborted) break;
      args.onAgent(agent);
    }
    return cachedAgents.value;
  }

  const finishDiscovery = beginProviderDiscovery(Boolean(cachedAgents?.value.length));
  try {
  const force = args.force === true;
  const health = await probePixflowOptionalBridge({
    force,
    timeoutMs: force ? 2_500 : 1_800,
  });
  if (['sleeping', 'releasing', 'waking'].includes(health.runtimeState || '')) {
    if (force) await ensurePixflowOptionalBridgeSiteContext();
    else {
      finishDiscovery('sleeping');
      for (const agent of cachedAgents?.value ?? []) args.onAgent(agent);
      return cachedAgents?.value ?? [];
    }
  }
  if (!health.available) {
    if (health.error && isPixflowOptionalBridgeLoopbackAccessError(new Error(health.error))) {
      throw new PixflowOptionalBridgeLoopbackAccessError(PIXFLOW_OPTIONAL_BRIDGE_LOOPBACK_BLOCKED_MESSAGE);
    }
    finishDiscovery(false);
    return cachedAgents?.value ?? [];
  }

  const response = await requestWithTimeout(
    pixflowOptionalBridgeApiUrl(force ? 'agents?stream=1&force=1' : 'agents?stream=1'),
    {
      signal: args.signal,
      headers: { Accept: 'text/event-stream' },
    },
    force ? 20_000 : 12_000,
  );
  if (!response.ok || !response.body) {
    throw new Error(`agents stream ${response.status}`);
  }

  const collected: AgentInfo[] = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;

  const handleEvent = (rawEvent: string) => {
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of rawEvent.split('\n')) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    const data = dataLines.join('\n');
    if (eventName === 'done') {
      if (data && JSON.parse(data).timedOut) throw new Error('Provider scan timed out');
      done = true;
      return;
    }
    if (eventName === 'error') {
      throw new Error(data || 'agents stream error');
    }
    if (eventName !== 'agent' || !data) return;
    try {
      const agent = JSON.parse(data) as AgentInfo;
      if (!isPixflowSupportedCliAgent(agent)) return;
      collected.push(agent);
      args.onAgent(agent);
    } catch {
      // Ignore malformed records so one bad probe does not break the list.
    }
  };

  try {
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        if (rawEvent.trim()) handleEvent(rawEvent);
        if (done) break;
      }
    }
    if (!done && buffer.trim()) handleEvent(buffer);
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Already closed.
    }
  }

  if (!done) throw new Error('agents stream ended before done');
  cachedAgents = { checkedAt: Date.now(), value: collected };
  persistAgentsCache(collected, cachedAgents.checkedAt);
  finishDiscovery(true);
  return collected;
  } catch (error) { finishDiscovery(false); throw error; }
}


