import { useT as usePixflowUiTranslation } from '../i18n';
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { fetchPixflowBridgeReleaseManifest } from './bridge-update';
import { getPixflowWordPressConfig } from './wordpress-context';

export type PixflowBridgeGateSurface = 'workspace' | 'bricks_builder' | 'wp_admin';

/**
 * Kept as a public compatibility type for integrations that imported the old
 * modal gate. The update experience is now inline, so the component below is
 * intentionally a no-op.
 */
export type PixflowBridgeUpdateGateProps = {
  surface: PixflowBridgeGateSurface;
  active: boolean;
  enabled: boolean;
  mode?: string | null;
  theme?: unknown;
  requiredVersion?: string | null;
  installedVersion?: string | null;
  onOpenDownloads?: () => void;
};

export type PixflowBridgeUpdateState = {
  required: boolean;
  currentVersion: string | null;
  requiredVersion: string | null;
};

export type PixflowBridgeUpdateStateProps = {
  active: boolean;
  enabled?: boolean;
  mode?: string | null;
  requiredVersion?: string | null;
  installedVersion?: string | null;
};

export type PixflowBridgeStatus = {
  checked?: boolean;
  updateRequired?: boolean;
  version?: string;
  state?: string;
  status?: string;
  running?: boolean;
  siteMismatch?: boolean;
  reconnecting?: boolean;
  error?: unknown;
};

const listeners = new Set<() => void>();
const statusObservers = new Set<(status: PixflowBridgeStatus) => void>();
let statusListenerInstalled = false;
let bridgeStatus: PixflowBridgeStatus = {};
let manifestVersion: string | null = null;
let manifestRequestStarted = false;
let statusRevision = 0;

function compareVersions(a: string, b: string): number {
  const left = String(a || '').split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const right = String(b || '').split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function nonEmptyVersion(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function configuredRequiredVersion(): string | null {
  return nonEmptyVersion(getPixflowWordPressConfig()?.bridgeRequiredVersion);
}

function statusFromWindow(source: Window | null | undefined): PixflowBridgeStatus {
  if (!source) return {};
  try {
    const scopedWindow = source as Window & {
      pixflowDesignBridgeStatus?: unknown;
      pixflowDesignStartupStatus?: unknown;
    };
    const value = scopedWindow.pixflowDesignBridgeStatus;
    const startup = scopedWindow.pixflowDesignStartupStatus;
    const startupBridge = startup && typeof startup === 'object'
      ? (startup as { bridge?: unknown }).bridge
      : null;
    return {
      ...(startupBridge && typeof startupBridge === 'object'
        ? startupBridge as PixflowBridgeStatus
        : {}),
      ...(value && typeof value === 'object' ? value as PixflowBridgeStatus : {}),
    };
  } catch {
    return {};
  }
}

/** Read status from every same-origin host window without assuming iframe depth. */
export function readPixflowBridgeStatus(): PixflowBridgeStatus {
  if (typeof window === 'undefined') return {};
  const sources: Window[] = [];
  const add = (candidate: Window | null | undefined) => {
    if (!candidate || sources.includes(candidate)) return;
    sources.push(candidate);
  };
  add(window);
  try { add(window.parent); } catch { /* cross-origin parent */ }
  try { add(window.top); } catch { /* cross-origin top */ }
  return sources.reduce<PixflowBridgeStatus>((merged, source) => ({ ...merged, ...statusFromWindow(source) }), {});
}

function notifyStatusListeners(): void {
  statusRevision += 1;
  statusObservers.forEach((observer) => observer(bridgeStatus));
  listeners.forEach((listener) => listener());
}

function handleBridgeStatus(event: Event): void {
  const detail = (event as CustomEvent<unknown>).detail;
  bridgeStatus = detail && typeof detail === 'object' ? detail as PixflowBridgeStatus : readPixflowBridgeStatus();
  notifyStatusListeners();
}

function installStatusListener(): void {
  if (statusListenerInstalled || typeof window === 'undefined') return;
  statusListenerInstalled = true;
  bridgeStatus = readPixflowBridgeStatus();
  const sources: Window[] = [];
  const add = (candidate: Window | null | undefined) => {
    if (!candidate || sources.includes(candidate)) return;
    sources.push(candidate);
  };
  add(window);
  try { add(window.parent); } catch { /* cross-origin parent */ }
  try { add(window.top); } catch { /* cross-origin top */ }
  sources.forEach((source) => {
    try {
      source.addEventListener('pixflow-design:bridge-status', handleBridgeStatus);
    } catch {
      // A Bridge-hosted iframe may have a cross-origin parent. Reading that
      // Window is already guarded above; listener registration must be too.
    }
  });
}

function ensureManifest(): void {
  if (manifestRequestStarted || typeof window === 'undefined') return;
  manifestRequestStarted = true;
  void fetchPixflowBridgeReleaseManifest()
    .then((manifest) => {
      manifestVersion = nonEmptyVersion(manifest.version);
      notifyStatusListeners();
    })
    .catch(() => {
      // The WordPress-required version and live Bridge status remain
      // authoritative when the public release manifest is unavailable.
    });
}

function highestVersion(...values: Array<string | null | undefined>): string | null {
  return values
    .map(nonEmptyVersion)
    .filter((value): value is string => Boolean(value))
    .reduce<string | null>((highest, value) => (
      !highest || compareVersions(value, highest) > 0 ? value : highest
    ), null);
}

export function bridgeUpdateRequiredForProps(
  props: PixflowBridgeUpdateStateProps,
  status: PixflowBridgeStatus = bridgeStatus,
): PixflowBridgeUpdateState {
  const currentVersion = nonEmptyVersion(props.installedVersion) || nonEmptyVersion(status.version);
  const requiredVersion = highestVersion(
    nonEmptyVersion(props.requiredVersion),
    configuredRequiredVersion(),
    manifestVersion,
  );
  const active = props.active && props.enabled !== false && props.mode !== 'api';
  const required = Boolean(
    active
      && (status.updateRequired === true
        || (currentVersion
          && requiredVersion
          && compareVersions(currentVersion, requiredVersion) < 0)),
  );
  return { required, currentVersion, requiredVersion };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): number {
  return statusRevision;
}

export function usePixflowBridgeUpdateState(
  props: PixflowBridgeUpdateStateProps,
): PixflowBridgeUpdateState {
  installStatusListener();
  const revision = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  void revision;
  useEffect(() => {
    if (props.active && props.enabled !== false && props.mode !== 'api') ensureManifest();
  }, [props.active, props.enabled, props.mode]);
  return bridgeUpdateRequiredForProps(props);
}

/** Subscribe to the host-published Bridge status for Settings and other
 * non-gated status surfaces that need the installed version immediately. */
export function subscribePixflowBridgeStatus(
  observer: (status: PixflowBridgeStatus) => void,
): () => void {
  installStatusListener();
  // A host can publish its status before this module is imported (for example
  // when Settings mounts after the builder has already completed its probe).
  // Refresh the module snapshot before the initial callback so subscribers do
  // not briefly, or permanently, render an installed Bridge as missing.
  const published = readPixflowBridgeStatus();
  if (Object.keys(published).length > 0) {
    bridgeStatus = { ...bridgeStatus, ...published };
  }
  statusObservers.add(observer);
  observer(bridgeStatus);
  return () => statusObservers.delete(observer);
}

const PixflowBridgeUpdateContext = createContext(false);

export function PixflowBridgeUpdateProvider({
  required,
  children,
}: {
  required: boolean;
  children: ReactNode;
}) {
  return (
    <PixflowBridgeUpdateContext.Provider value={required}>
      {children}
    </PixflowBridgeUpdateContext.Provider>
  );
}

export function usePixflowBridgeUpdateRequired(): boolean {
  return useContext(PixflowBridgeUpdateContext);
}

/**
 * Shared inline copy used above a composer or inside a floating-panel chat.
 * It deliberately has no fixed positioning or portal so the message stays
 * attached to the composer that is blocked.
 */
export function PixflowBridgeUpdateNotice({
  className = '',
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const translateUi = usePixflowUiTranslation();
  return (
    <div
      className={`pixflow-bridge-update-notice${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}
      role="alert"
    >
      <span>{translateUi("ui.bridge-update-gate.pleaseUpdateThePixflowDesignBridgeTo")}</span>
    </div>
  );
}

/** @deprecated Updates are now shown inline; retained so older mounts do not crash. */
export function PixflowBridgeUpdateGate(_props: PixflowBridgeUpdateGateProps) {
  return null;
}
