import { useT as usePixflowUiTranslation } from '../i18n';
import { ComposioWriteAccess } from './ComposioWriteAccess';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type SyntheticEvent,
} from 'react';
import { createPortal } from 'react-dom';
import modalStyles from './ConnectorDetailModal.module.css';
import { Button, VisuallyHidden } from '@open-design/components';
import connectorStyles from './ConnectorSettings.module.css';
import type { ConnectorConnectResponse, ConnectorDetail, ConnectorStatusResponse } from '@open-design/contracts';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import {
  cancelConnectorAuthorization as cancelConnectorAuthorizationRequest,
  connectConnector,
  disconnectConnector,
  fetchConnectorDetail,
  fetchConnectorDiscovery,
  fetchConnectors,
  fetchConnectorStatuses,
  openExternalUrl,
} from '../providers/registry';
import {
  isTrustedConnectorCallbackOrigin,
  sortConnectorsForSearch,
} from './connectors-search';
import {
  CONNECTOR_CALLBACK_MESSAGE_TYPE,
  notifyConnectorsChanged,
} from './connectors-events';
import { hasConnectorStatusChanges } from './connectors-state';
import { ConnectorLogo, useResolvedTheme } from './ConnectorLogo';
import { Icon } from './Icon';
import { CenteredLoader } from './Loading';

const CONNECTOR_AUTH_PENDING_STORAGE_KEY = 'od-connectors-authorization-pending';
const CONNECTOR_AUTH_PENDING_POLL_MS = 2_000;
const CONNECTOR_TOOL_PREVIEW_LIMIT = 50;
const AUTHORIZATION_CANCEL_FAILED_MESSAGE = "Couldn't cancel authorization. Try again.";
const CONNECTOR_AUTH_CONTINUE_LABEL = 'Continue in browser';

interface ConnectorAuthorizationPending {
  expiresAt?: string;
  redirectUrl?: string;
}

type ConnectorAuthorizationPendingState = Record<string, ConnectorAuthorizationPending>;

function mergeConnectors(current: ConnectorDetail[], incoming: ConnectorDetail[]): ConnectorDetail[] {
  if (current.length === 0) return incoming;
  const incomingById = new Map(incoming.map((connector) => [connector.id, connector]));
  const merged = current.map((connector) => {
    const next = incomingById.get(connector.id);
    if (!next) return connector;
    return {
      ...connector,
      ...next,
      tools: next.tools.length > 0 ? next.tools : connector.tools,
      toolCount: next.toolCount ?? connector.toolCount,
      toolsNextCursor: next.toolsNextCursor ?? connector.toolsNextCursor,
      toolsHasMore: next.toolsHasMore ?? connector.toolsHasMore,
    };
  });
  const currentIds = new Set(current.map((connector) => connector.id));
  for (const connector of incoming) {
    if (!currentIds.has(connector.id)) merged.push(connector);
  }
  return merged;
}

function loadConnectorAuthorizationPending(): ConnectorAuthorizationPendingState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(CONNECTOR_AUTH_PENDING_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const pending: ConnectorAuthorizationPendingState = {};
    for (const [connectorId, state] of Object.entries(parsed as Record<string, unknown>)) {
      if (!connectorId) continue;
      if (state && typeof state === 'object' && !Array.isArray(state)) {
        const expiresAt = (state as Record<string, unknown>).expiresAt;
        const redirectUrl = (state as Record<string, unknown>).redirectUrl;
        pending[connectorId] = {
          ...(typeof expiresAt === 'string' && expiresAt.trim() ? { expiresAt } : {}),
          ...(typeof redirectUrl === 'string' && redirectUrl.trim() ? { redirectUrl } : {}),
        };
      } else {
        pending[connectorId] = {};
      }
    }
    return pruneConnectorAuthorizationPending(pending);
  } catch {
    return {};
  }
}

function saveConnectorAuthorizationPending(pending: ConnectorAuthorizationPendingState): void {
  if (typeof window === 'undefined') return;
  try {
    if (Object.keys(pending).length === 0) {
      window.sessionStorage.removeItem(CONNECTOR_AUTH_PENDING_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(CONNECTOR_AUTH_PENDING_STORAGE_KEY, JSON.stringify(pending));
    }
  } catch {
    /* Ignore unavailable sessionStorage. */
  }
}

export function pruneConnectorAuthorizationPending(
  pending: ConnectorAuthorizationPendingState,
  nowMs = Date.now(),
): ConnectorAuthorizationPendingState {
  const next: ConnectorAuthorizationPendingState = {};
  for (const [connectorId, state] of Object.entries(pending)) {
    const expiresAtMs = state.expiresAt ? Date.parse(state.expiresAt) : Number.NaN;
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) continue;
    next[connectorId] = {
      ...(state.expiresAt ? { expiresAt: state.expiresAt } : {}),
      ...(state.redirectUrl ? { redirectUrl: state.redirectUrl } : {}),
    };
  }
  return next;
}

export function updateConnectorAuthorizationPendingFromConnectResponse(
  pending: ConnectorAuthorizationPendingState,
  response: ConnectorConnectResponse,
  nowMs = Date.now(),
): ConnectorAuthorizationPendingState {
  const connectorId = response.connector.id;
  const next = { ...pending };
  if (response.auth?.kind === 'redirect_required' || response.auth?.kind === 'pending') {
    next[connectorId] = {
      ...(response.auth.expiresAt ? { expiresAt: response.auth.expiresAt } : {}),
      ...(response.auth.redirectUrl ? { redirectUrl: response.auth.redirectUrl } : {}),
    };
    return pruneConnectorAuthorizationPending(next, nowMs);
  }
  delete next[connectorId];
  return pruneConnectorAuthorizationPending(next, nowMs);
}

export function updateConnectorAuthorizationPendingFromStatuses(
  pending: ConnectorAuthorizationPendingState,
  statuses: ConnectorStatusResponse['statuses'],
  nowMs = Date.now(),
): ConnectorAuthorizationPendingState {
  const next = { ...pending };
  for (const [connectorId, status] of Object.entries(statuses)) {
    if (status.status === 'connected') delete next[connectorId];
  }
  return pruneConnectorAuthorizationPending(next, nowMs);
}

export function clearConnectorAuthorizationErrorsForConnected(
  errors: Record<string, string>,
  statuses: ConnectorStatusResponse['statuses'],
): Record<string, string> {
  let mutated = false;
  const next = { ...errors };
  for (const [connectorId, status] of Object.entries(statuses)) {
    if (status.status === 'connected' && next[connectorId] !== undefined) {
      delete next[connectorId];
      mutated = true;
    }
  }
  return mutated ? next : errors;
}

export function clearConnectorAuthorizationCancelFailuresForConnected(
  failures: Record<string, boolean>,
  statuses: ConnectorStatusResponse['statuses'],
): Record<string, boolean> {
  let mutated = false;
  const next = { ...failures };
  for (const [connectorId, status] of Object.entries(statuses)) {
    if (status.status === 'connected' && next[connectorId] !== undefined) {
      delete next[connectorId];
      mutated = true;
    }
  }
  return mutated ? next : failures;
}

export function clearConnectorAuthorizationPending(
  pending: ConnectorAuthorizationPendingState,
  connectorId: string,
): ConnectorAuthorizationPendingState {
  if (pending[connectorId] === undefined) return pending;
  const next = { ...pending };
  delete next[connectorId];
  return next;
}

export function getConnectorDisplayToolCount(connector: ConnectorDetail): number {
  return connector.toolCount ?? connector.tools.length;
}

export function hasLoadedAllAdvertisedConnectorTools(connector: ConnectorDetail): boolean {
  if (connector.toolsNextCursor) return false;
  if (connector.toolCount === undefined) return connector.tools.length > 0;
  return connector.tools.length >= connector.toolCount;
}

function mergeConnectorTools(current: ConnectorDetail['tools'], incoming: ConnectorDetail['tools']): ConnectorDetail['tools'] {
  const seen = new Set<string>();
  const merged: ConnectorDetail['tools'] = [];
  for (const tool of [...current, ...incoming]) {
    if (seen.has(tool.name)) continue;
    seen.add(tool.name);
    merged.push(tool);
  }
  return merged;
}

export function mergeConnectorToolPreview(current: ConnectorDetail, next: ConnectorDetail, append: boolean): ConnectorDetail {
  const merged: ConnectorDetail = {
    ...current,
    ...next,
    tools: append ? mergeConnectorTools(current.tools, next.tools) : next.tools,
    toolCount: next.toolCount ?? current.toolCount,
    toolsHasMore: next.toolsHasMore ?? false,
    featuredToolNames: next.featuredToolNames ?? current.featuredToolNames,
  };
  if (next.toolsNextCursor !== undefined) return { ...merged, toolsNextCursor: next.toolsNextCursor };
  const { toolsNextCursor: _toolsNextCursor, ...withoutCursor } = merged;
  return withoutCursor;
}

export function mergeConnectorActionResult(current: ConnectorDetail, next: ConnectorDetail): ConnectorDetail {
  return {
    ...current,
    ...next,
    tools: next.tools.length > 0 ? next.tools : current.tools,
    toolCount: next.toolCount ?? current.toolCount,
    featuredToolNames: next.featuredToolNames ?? current.featuredToolNames,
  };
}

function applyConnectorStatuses(
  current: ConnectorDetail[],
  statuses: ConnectorStatusResponse['statuses'],
): ConnectorDetail[] {
  if (Object.keys(statuses).length === 0) return current;
  return current.map((connector) => {
    const next = statuses[connector.id];
    if (!next) return connector;
    const { accountLabel: _accountLabel, lastError: _lastError, ...base } = connector;
    return { ...base, ...next };
  });
}

interface ConnectorsBrowserProps {
  composioConfigured: boolean;
  catalogRefreshKey?: string | number;
  /** Optional analytics hook for the integrations surface. The parent
   *  can wire this so provider-tab
   *  / search clicks emit on `page_name: 'integrations'`; when omitted
   *  (SettingsDialog uses the settings page family instead), no event
   *  is fired. */
  onConnectorsTabClick?: (
    element: 'provider_chip' | 'search_connectors',
  ) => void;
  /** Analytics hook for the per-connector authorization result. The
   *  daemon emits its own server-side telemetry but the click→outcome
   *  loop happens in the browser; this lets the parent emit
   *  `settings_connector_auth_result` for the completed connect /
   *  disconnect attempts the user kicked off here. */
  onConnectorAuthResult?: (params: {
    connectorId: string;
    action: 'connect' | 'disconnect' | 'refresh';
    result: 'success' | 'failed' | 'cancelled';
    errorCode?: string;
  }) => void;
}

/**
 * Connector cards + search, lifted out of the entry-view top tab so it can
 * live under Settings → Connectors. Owns its own data lifecycle: fetches the
 * catalog on mount, lazily enriches with Composio discovery when the user
 * actually opens the surface, and rehydrates statuses on window focus and
 * OAuth callback messages.
 */
/**
 * Provider tab definition. Today this is just Composio, but the surface is
 * structured as a list-of-tabs because the next provider integration (e.g.
 * a self-hosted MCP registry) is expected to drop in here without rework.
 *
 * `match` decides whether a given catalog entry belongs to this provider:
 * the entry's `auth.provider` is the source of truth, falling back to the
 * lowercased display `provider` for catalog rows that don't carry an auth
 * payload yet.
 */
const PROVIDER_TABS: ReadonlyArray<{
  id: string;
  label: string;
  match: (connector: ConnectorDetail) => boolean;
}> = [
  {
    id: 'composio',
    label: 'Composio',
    match: (connector) => {
      const provider = connector.auth?.provider ?? connector.provider.toLowerCase();
      return provider === 'composio';
    },
  },
];

const DEFAULT_PROVIDER_TAB_ID = 'composio';

const CONNECTOR_CATEGORY_KEYS = {
  'accounting': 'connectors.category.accounting',
  'admin': 'connectors.category.admin',
  'ads & conversion': 'connectors.category.advertising',
  'advertising': 'connectors.category.advertising',
  'ai agents': 'connectors.category.aiAgents',
  'ai chatbots': 'connectors.category.aiAgents',
  'ai infrastructure': 'connectors.category.aiInfrastructure',
  'ai meeting assistants': 'connectors.category.meetings',
  'analytics': 'connectors.category.analytics',
  'artificial intelligence': 'connectors.category.aiAgents',
  'automation': 'connectors.category.automation',
  'bookmark managers': 'connectors.category.personal',
  'calendar': 'connectors.category.calendar',
  'cms': 'connectors.category.cms',
  'code': 'connectors.category.developer',
  'commerce': 'connectors.category.commerce',
  'communication': 'connectors.category.communication',
  'connectors': 'connectors.category.integration',
  'contacts': 'connectors.category.contacts',
  'crm': 'connectors.category.crm',
  'customer support': 'connectors.category.support',
  'data platform': 'connectors.category.dataPlatform',
  'database': 'connectors.category.database',
  'databases': 'connectors.category.database',
  'design': 'connectors.category.design',
  'developer': 'connectors.category.developer',
  'developer tools': 'connectors.category.developer',
  'documents': 'connectors.category.documentation',
  'documentation': 'connectors.category.documentation',
  'ecommerce': 'connectors.category.commerce',
  'education': 'connectors.category.education',
  'email': 'connectors.category.email',
  'email newsletters': 'connectors.category.email',
  'erp': 'connectors.category.erp',
  'electronics': 'connectors.category.commerce',
  'events': 'connectors.category.events',
  'event management': 'connectors.category.events',
  'example': 'connectors.category.integration',
  'feedback': 'connectors.category.surveys',
  'field service': 'connectors.category.fieldService',
  'file management & storage': 'connectors.category.storage',
  'finance': 'connectors.category.finance',
  'fitness': 'connectors.category.fitness',
  'forms': 'connectors.category.forms',
  'forms & surveys': 'connectors.category.forms',
  'fundraising': 'connectors.category.nonprofit',
  'gaming': 'connectors.category.gaming',
  'hospitality': 'connectors.category.hospitality',
  'hr': 'connectors.category.hr',
  'hr talent & recruitment': 'connectors.category.recruiting',
  'human resources': 'connectors.category.hr',
  'images & design': 'connectors.category.design',
  'important': 'connectors.category.integration',
  'integration': 'connectors.category.integration',
  'itsm': 'connectors.category.itsm',
  'it operations': 'connectors.category.itsm',
  'localization': 'connectors.category.localization',
  'logistics': 'connectors.category.logistics',
  'maps': 'connectors.category.maps',
  'marketing': 'connectors.category.marketing',
  'marketing automation': 'connectors.category.marketing',
  'media': 'connectors.category.media',
  'meetings': 'connectors.category.meetings',
  'model context protocol': 'connectors.category.developer',
  'news & lifestyle': 'connectors.category.media',
  'nonprofit': 'connectors.category.nonprofit',
  'notes': 'connectors.category.documentation',
  'notifications': 'connectors.category.communication',
  'observability': 'connectors.category.observability',
  'online courses': 'connectors.category.education',
  'payments': 'connectors.category.payments',
  'payment processing': 'connectors.category.payments',
  'personal': 'connectors.category.personal',
  'phone & sms': 'connectors.category.communication',
  'presentations': 'connectors.category.presentations',
  'premium': 'connectors.category.integration',
  'procurement': 'connectors.category.procurement',
  'product': 'connectors.category.product',
  'product management': 'connectors.category.product',
  'productivity': 'connectors.category.productivity',
  'productivity & project management': 'connectors.category.projectManagement',
  'project management': 'connectors.category.projectManagement',
  'proposal & invoice management': 'connectors.category.accounting',
  'recruiting': 'connectors.category.recruiting',
  'research': 'connectors.category.research',
  'sales': 'connectors.category.salesIntelligence',
  'sales intelligence': 'connectors.category.salesIntelligence',
  'scheduling': 'connectors.category.scheduling',
  'scheduling & booking': 'connectors.category.scheduling',
  'search': 'connectors.category.search',
  'security': 'connectors.category.security',
  'security & identity tools': 'connectors.category.security',
  'server monitoring': 'connectors.category.observability',
  'signing': 'connectors.category.signing',
  'signatures': 'connectors.category.signing',
  'social': 'connectors.category.social',
  'social media accounts': 'connectors.category.social',
  'social media marketing': 'connectors.category.marketing',
  'spreadsheets': 'connectors.category.spreadsheets',
  'storage': 'connectors.category.storage',
  'support': 'connectors.category.support',
  'surveys': 'connectors.category.surveys',
  'task management': 'connectors.category.tasks',
  'tasks': 'connectors.category.tasks',
  'team chat': 'connectors.category.communication',
  'team collaboration': 'connectors.category.communication',
  'time tracking': 'connectors.category.timeTracking',
  'time tracking software': 'connectors.category.timeTracking',
  'url shortener': 'connectors.category.marketing',
  'video': 'connectors.category.video',
  'video & audio': 'connectors.category.video',
  'video conferencing': 'connectors.category.meetings',
  'website builders': 'connectors.category.cms',
  'whiteboard': 'connectors.category.whiteboard',
} as const satisfies Record<string, keyof Dict>;

export function ConnectorsBrowser({
  composioConfigured,
  catalogRefreshKey = 0,
  onConnectorsTabClick,
  onConnectorAuthResult,
}: ConnectorsBrowserProps) {
  const translateUi = usePixflowUiTranslation();
  const t = useT();
  const [connectors, setConnectors] = useState<ConnectorDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [discoveryError, setDiscoveryError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsLoaded, setToolsLoaded] = useState(false);
  const [pendingConnectorAction, setPendingConnectorAction] = useState<{
    connectorId: string;
    action: 'connect' | 'disconnect';
  } | null>(null);
  const [connectorAuthorizationPending, setConnectorAuthorizationPending] = useState<ConnectorAuthorizationPendingState>(() => loadConnectorAuthorizationPending());
  const [connectorAuthorizationCancelFailed, setConnectorAuthorizationCancelFailed] = useState<Record<string, boolean>>({});
  const [connectorAuthorizationError, setConnectorAuthorizationError] = useState<Record<string, string>>({});
  const [detailConnectorId, setDetailConnectorId] = useState<string | null>(null);
  const [toolPreviewLoadingIds, setToolPreviewLoadingIds] = useState<Record<string, boolean>>({});
  const [toolPreviewFetchedIds, setToolPreviewFetchedIds] = useState<Record<string, boolean>>({});
  const [toolPreviewFailedIds, setToolPreviewFailedIds] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>(DEFAULT_PROVIDER_TAB_ID);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchTrackedRef = useRef(false);
  const connectorsRef = useRef(connectors);
  const logoTheme = useResolvedTheme();
  const toolPreviewRetryToken = `${composioConfigured ? 'configured' : 'unconfigured'}:${String(catalogRefreshKey)}`;

  useEffect(() => {
    connectorsRef.current = connectors;
  }, [connectors]);

  const reloadConnectorStatuses = useCallback(async () => {
    const statuses = await fetchConnectorStatuses();
    const statusChanged = hasConnectorStatusChanges(connectorsRef.current, statuses);
    setConnectors((curr) => applyConnectorStatuses(curr, statuses));
    setConnectorAuthorizationPending((curr) => updateConnectorAuthorizationPendingFromStatuses(curr, statuses));
    setConnectorAuthorizationError((curr) => clearConnectorAuthorizationErrorsForConnected(curr, statuses));
    setConnectorAuthorizationCancelFailed((curr) => clearConnectorAuthorizationCancelFailuresForConnected(curr, statuses));
    if (statusChanged) notifyConnectorsChanged();
    return statuses;
  }, []);

  const connectorAuthorizationPendingRef = useRef(connectorAuthorizationPending);
  useEffect(() => {
    connectorAuthorizationPendingRef.current = connectorAuthorizationPending;
  }, [connectorAuthorizationPending]);

  const cancelStaleAuthorizations = useCallback(async (
    pendingBeforeReload: ConnectorAuthorizationPendingState,
    statuses: ConnectorStatusResponse['statuses'],
    nowMs = Date.now(),
  ) => {
    const stuck = Object.keys(pendingBeforeReload).filter((connectorId) => {
      if (statuses[connectorId]?.status === 'connected') return false;
      const expiresAt = pendingBeforeReload[connectorId]?.expiresAt;
      if (!expiresAt) return false;
      const expiresAtMs = Date.parse(expiresAt);
      return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
    });
    if (stuck.length === 0) return;
    await Promise.allSettled(stuck.map(async (connectorId) => {
      let connector: ConnectorDetail | null = null;
      try {
        connector = await cancelConnectorAuthorizationRequest(connectorId);
      } catch {
        connector = null;
      }
      if (!connector) {
        setConnectorAuthorizationCancelFailed((curr) => ({ ...curr, [connectorId]: true }));
        return;
      }
      updateConnector(connector);
      setConnectorAuthorizationCancelFailed((curr) => {
        if (curr[connectorId] === undefined) return curr;
        const next = { ...curr };
        delete next[connectorId];
        return next;
      });
      setConnectorAuthorizationError((curr) => {
        if (curr[connectorId] === undefined) return curr;
        const next = { ...curr };
        delete next[connectorId];
        return next;
      });
      setConnectorAuthorizationPending((curr) => clearConnectorAuthorizationPending(curr, connectorId));
    }));
  }, []);

  useEffect(() => {
    saveConnectorAuthorizationPending(connectorAuthorizationPending);
  }, [connectorAuthorizationPending]);

  useEffect(() => {
    if (Object.keys(connectorAuthorizationPending).length === 0) return;
    const interval = window.setInterval(() => {
      setConnectorAuthorizationPending((curr) => pruneConnectorAuthorizationPending(curr));
      void reloadConnectorStatuses();
    }, CONNECTOR_AUTH_PENDING_POLL_MS);
    return () => window.clearInterval(interval);
  }, [connectorAuthorizationPending, reloadConnectorStatuses]);

  // Initial catalog fetch — always loads the lightweight registry payload so
  // already-configured connectors render immediately.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setToolsLoaded(false);
    setCatalogError(false);
    (async () => {
      try {
        const next = await fetchConnectors({ throwOnError: true });
        if (!cancelled) setConnectors((curr) => mergeConnectors(curr, next));
      } catch {
        if (!cancelled) setCatalogError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [composioConfigured, catalogRefreshKey, reloadNonce]);

  // Lazy Composio discovery — enriched toolkit metadata + auth configuration.
  // Heavier round trip; only worth it once a Composio API key is actually
  // saved. Before that, discovery returns no live tools and the web-side
  // provider cache can otherwise keep those empty tool lists after Save key.
  useEffect(() => {
    if (!composioConfigured) {
      setToolsLoaded(false);
      setToolsLoading(false);
      return;
    }
    let cancelled = false;
    setToolsLoading(true);
    setDiscoveryError(false);
    (async () => {
      try {
        const next = await fetchConnectorDiscovery({ refresh: true, throwOnError: true });
        if (!cancelled) {
          setConnectors((curr) => mergeConnectors(curr, next));
          setToolsLoaded(true);
        }
      } catch {
        if (!cancelled) setDiscoveryError(true);
      } finally {
        if (!cancelled) setToolsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      setToolsLoading(false);
    };
  }, [composioConfigured, catalogRefreshKey, reloadNonce]);

  // OAuth callback: a popup or system-browser tab postMessages back when an
  // auth flow completes. Trust same-origin + localhost-loopback so packaged
  // dev URLs (different ports) keep working.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (
        !data ||
        typeof data !== 'object' ||
        (data as { type?: unknown }).type !== CONNECTOR_CALLBACK_MESSAGE_TYPE
      )
        return;
      if (!isTrustedConnectorCallbackOrigin(event.origin)) return;
      void reloadConnectorStatuses();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [reloadConnectorStatuses]);

  // System-browser auth flows have no opener to post back to; refresh
  // whenever the window regains focus so the UI catches up silently. If a
  // pending authorization is still not connected after the refresh, the
  // user closed the auth flow without completing it — auto-cancel so the
  // card recovers to its default state instead of staying stuck loading.
  useEffect(() => {
    async function refreshAfterReturn() {
      const pendingBeforeReload = connectorAuthorizationPendingRef.current;
      const statuses = await reloadConnectorStatuses();
      await cancelStaleAuthorizations(pendingBeforeReload, statuses);
    }
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      void refreshAfterReturn();
    }
    window.addEventListener('focus', refreshAfterReturn);
    window.addEventListener('pageshow', refreshAfterReturn);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', refreshAfterReturn);
      window.removeEventListener('pageshow', refreshAfterReturn);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [reloadConnectorStatuses, cancelStaleAuthorizations]);

  // The local Composio API-key state is authoritative for masking. Cached
  // connector auth can be stale immediately after the user clears the key.
  const needsComposioKey = !composioConfigured;

  // Filter and rank connectors by user-visible fields. Exact/prefix matches
  // on connector name/provider are strongest; broad description matches stay
  // searchable but are down-ranked. The provider tab restricts the catalog
  // to a single backing provider before search runs so result rankings stay
  // tab-local.
  const providerScopedConnectors = useMemo(() => {
    const tab =
      PROVIDER_TABS.find((p) => p.id === selectedProvider) ??
      PROVIDER_TABS.find((p) => p.id === DEFAULT_PROVIDER_TAB_ID);
    if (!tab) return connectors;
    return connectors.filter((connector) => tab.match(connector));
  }, [connectors, selectedProvider]);

  const filteredConnectors = useMemo(() => {
    return sortConnectorsForSearch(providerScopedConnectors, filter);
  }, [providerScopedConnectors, filter]);

  const hasQuery = filter.trim().length > 0;
  const hasNoResults = hasQuery && filteredConnectors.length === 0;
  const connectorPanelAlerts = useMemo(() => {
    const alerts: Array<{ connectorId: string; connectorName: string; message: string }> = [];
    for (const connector of connectors) {
      if (connector.id === detailConnectorId) continue;
      const message = connectorAuthorizationError[connector.id];
      if (message) {
        alerts.push({ connectorId: connector.id, connectorName: connector.name, message });
      }
      if (connectorAuthorizationCancelFailed[connector.id]) {
        alerts.push({
          connectorId: connector.id,
          connectorName: connector.name,
          message: AUTHORIZATION_CANCEL_FAILED_MESSAGE,
        });
      }
    }
    return alerts;
  }, [connectorAuthorizationCancelFailed, connectorAuthorizationError, connectors, detailConnectorId]);

  function updateConnector(next: ConnectorDetail | null) {
    if (!next) return;
    setConnectors((curr) => curr.map((connector) => (
      connector.id === next.id ? mergeConnectorActionResult(connector, next) : connector
    )));
  }

  async function runConnectorAction(connectorId: string, action: 'connect' | 'disconnect') {
    if (pendingConnectorAction) return;
    setPendingConnectorAction({ connectorId, action });
    try {
      if (action === 'connect') {
        setConnectorAuthorizationCancelFailed((curr) => {
          if (curr[connectorId] === undefined) return curr;
          const next = { ...curr };
          delete next[connectorId];
          return next;
        });
        setConnectorAuthorizationError((curr) => {
          if (curr[connectorId] === undefined) return curr;
          const next = { ...curr };
          delete next[connectorId];
          return next;
        });
        try {
          const result = await connectConnector(connectorId);
          updateConnector(result.connector);
          if (result.connector && !result.error) {
            if (result.connector.status === 'connected') notifyConnectorsChanged();
            setConnectorAuthorizationPending((curr) => updateConnectorAuthorizationPendingFromConnectResponse(curr, {
              connector: result.connector!,
              ...(result.auth === undefined ? {} : { auth: result.auth }),
            }));
            onConnectorAuthResult?.({
              connectorId,
              action: 'connect',
              result: 'success',
            });
          } else {
            setConnectorAuthorizationPending((curr) => clearConnectorAuthorizationPending(curr, connectorId));
            if (result.error) {
              setConnectorAuthorizationError((curr) => ({ ...curr, [connectorId]: result.error! }));
            }
            onConnectorAuthResult?.({
              connectorId,
              action: 'connect',
              result: 'failed',
              ...(result.error ? { errorCode: result.error } : {}),
            });
          }
        } catch (err) {
          onConnectorAuthResult?.({
            connectorId,
            action: 'connect',
            result: 'failed',
            errorCode: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      } else {
        setConnectorAuthorizationPending((curr) => clearConnectorAuthorizationPending(curr, connectorId));
        setConnectorAuthorizationError((curr) => {
          if (curr[connectorId] === undefined) return curr;
          const next = { ...curr };
          delete next[connectorId];
          return next;
        });
        try {
          updateConnector(await disconnectConnector(connectorId));
          notifyConnectorsChanged();
          onConnectorAuthResult?.({
            connectorId,
            action: 'disconnect',
            result: 'success',
          });
        } catch (err) {
          onConnectorAuthResult?.({
            connectorId,
            action: 'disconnect',
            result: 'failed',
            errorCode: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      }
    } finally {
      setPendingConnectorAction(null);
    }
  }

  const detailConnector = useMemo(
    () => (detailConnectorId ? connectors.find((c) => c.id === detailConnectorId) ?? null : null),
    [detailConnectorId, connectors],
  );

  async function hydrateToolPreview(connectorId: string, cursor?: string) {
    if (!composioConfigured) return;
    if (toolPreviewLoadingIds[connectorId]) return;
    setToolPreviewLoadingIds((curr) => ({ ...curr, [connectorId]: true }));
    try {
      const next = await fetchConnectorDetail(connectorId, {
        hydrateTools: true,
        toolsLimit: CONNECTOR_TOOL_PREVIEW_LIMIT,
        ...(cursor === undefined ? {} : { toolsCursor: cursor }),
      });
      if (next) {
        setConnectors((curr) => curr.map((connector) => (
          connector.id === next.id ? mergeConnectorToolPreview(connector, next, cursor !== undefined) : connector
        )));
        setToolPreviewFetchedIds((curr) => ({ ...curr, [connectorId]: true }));
        setToolPreviewFailedIds((curr) => {
          if (curr[connectorId] === undefined) return curr;
          const nextFailed = { ...curr };
          delete nextFailed[connectorId];
          return nextFailed;
        });
      } else {
        setToolPreviewFailedIds((curr) => ({ ...curr, [connectorId]: toolPreviewRetryToken }));
      }
    } catch {
      setToolPreviewFailedIds((curr) => ({ ...curr, [connectorId]: toolPreviewRetryToken }));
    } finally {
      setToolPreviewLoadingIds((curr) => ({ ...curr, [connectorId]: false }));
    }
  }

  useEffect(() => {
    if (!detailConnector) return;
    if (!composioConfigured) return;
    if (hasLoadedAllAdvertisedConnectorTools(detailConnector)) return;
    if (toolPreviewFetchedIds[detailConnector.id]) return;
    if (toolPreviewFailedIds[detailConnector.id] === toolPreviewRetryToken) return;
    if (toolPreviewLoadingIds[detailConnector.id]) return;
    void hydrateToolPreview(detailConnector.id);
  }, [composioConfigured, detailConnector, toolPreviewFailedIds, toolPreviewFetchedIds, toolPreviewLoadingIds, toolPreviewRetryToken]);

  function openConnectorDetails(connectorId: string) {
    setToolPreviewFailedIds((curr) => {
      if (curr[connectorId] === undefined) return curr;
      const next = { ...curr };
      delete next[connectorId];
      return next;
    });
    setDetailConnectorId(connectorId);
  }

  async function cancelConnectorAuthorization(connectorId: string) {
    const connector = await cancelConnectorAuthorizationRequest(connectorId);
    if (connector) {
      updateConnector(connector);
      setConnectorAuthorizationCancelFailed((curr) => {
        if (curr[connectorId] === undefined) return curr;
        const next = { ...curr };
        delete next[connectorId];
        return next;
      });
      setConnectorAuthorizationError((curr) => {
        if (curr[connectorId] === undefined) return curr;
        const next = { ...curr };
        delete next[connectorId];
        return next;
      });
      setConnectorAuthorizationPending((curr) => clearConnectorAuthorizationPending(curr, connectorId));
      return;
    }
    try {
      const statuses = await reloadConnectorStatuses();
      if (statuses[connectorId]?.status === 'connected') return;
    } catch {
      // Keep the local failure visible when the status refresh itself fails.
    }
    setConnectorAuthorizationCancelFailed((curr) => ({ ...curr, [connectorId]: true }));
  }

  return (
    <div className={`tab-panel connectors-panel connectors-panel-embedded ${connectorStyles.browser}`}>
      <div className="tab-panel-toolbar">
        <div className="toolbar-left connectors-heading">
          <div>
            <h2>{t('connectors.title')}</h2>
            <p>{t('connectors.subtitle')}</p>
          </div>
        </div>
        <div className="toolbar-right">
          <div
            className="connectors-provider-tabs"
            role="tablist"
            aria-label={translateUi("ui.connectorsBrowser.connectorProvider")}
          >
            {PROVIDER_TABS.map((provider) => {
              const active = provider.id === selectedProvider;
              return (
                <button
                  key={provider.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`connectors-provider-tab${active ? ' is-active' : ''}`}
                  onClick={() => {
                    onConnectorsTabClick?.('provider_chip');
                    setSelectedProvider(provider.id);
                  }}
                  data-testid={`connectors-provider-tab-${provider.id}`}
                >
                  {provider.label}
                </button>
              );
            })}
          </div>
          <div className="toolbar-search connectors-search">
            <span className="search-icon" aria-hidden>
              <Icon name="search" size={13} />
            </span>
            <input
              ref={searchInputRef}
              type="search"
              value={filter}
              onFocus={() => {
                if (searchTrackedRef.current) return;
                searchTrackedRef.current = true;
                onConnectorsTabClick?.('search_connectors');
              }}
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && filter) {
                  event.preventDefault();
                  event.stopPropagation();
                  setFilter('');
                }
              }}
              placeholder={t('connectors.searchPlaceholder')}
              aria-label={t('connectors.searchAriaLabel')}
              disabled={needsComposioKey}
              data-testid="connectors-search-input"
            />
            {hasQuery ? (
              <button
                type="button"
                className="toolbar-search-clear"
                aria-label={t('connectors.searchClear')}
                onClick={() => {
                  setFilter('');
                  searchInputRef.current?.focus();
                }}
                data-testid="connectors-search-clear"
              >
                <Icon name="close" size={12} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {(catalogError || discoveryError) && <div className={connectorStyles.notice} role="alert">
        <div><strong>{translateUi("ui.connectorsBrowser.couldnTLoadConnectors")}</strong><p>{catalogError ? translateUi("ui.connectorsBrowser.checkThatPixflowBridgeIsRunningAnd") : translateUi("ui.connectorsBrowser.composioDiscoveryFailedCheckYourSavedKey")}  {translateUi("ui.connectorsBrowser.yourSavedKeyHasNotBeenChanged")}</p></div>
        <Button variant="ghost" disabled={loading || toolsLoading} onClick={() => setReloadNonce(value => value + 1)}>{translateUi("ui.connectorsBrowser.tryAgain")}</Button>
      </div>}
      {!loading && !catalogError && !discoveryError && !connectors.length && composioConfigured && <div className={connectorStyles.notice} role="status">
        <div><strong>{toolsLoading ? translateUi("ui.connectorsBrowser.loadingYourConnectors") : translateUi("ui.connectorsBrowser.noConnectorsAvailable")}</strong><p>{toolsLoading ? translateUi("ui.connectorsBrowser.fetchingTheComposioCatalogueFromYourBridge") : translateUi("ui.connectorsBrowser.theBridgeReturnedAnEmptyCatalogueRefresh")}</p></div>
        {!toolsLoading && <Button variant="ghost" onClick={() => setReloadNonce(value => value + 1)}>{translateUi("designFiles.refresh")}</Button>}
      </div>}
      {connectorPanelAlerts.length > 0 ? (
        <div className="connector-panel-alerts">
          {connectorPanelAlerts.map((alert) => (
            <div
              key={`${alert.connectorId}:${alert.message}`}
              className="connector-panel-alert"
              title={`${alert.connectorName}: ${alert.message}`}
            >
              <p className="connector-panel-alert-copy" role="status">
                <strong title={alert.connectorName}>{alert.connectorName}</strong>
                <VisuallyHidden>: </VisuallyHidden>
                <span title={alert.message}>{alert.message}</span>
              </p>
              <button
                type="button"
                className="icon-only connector-panel-alert-action"
                aria-label={t('connectors.openDetailsAria', { name: alert.connectorName })}
                title={t('connectors.openDetailsAria', { name: alert.connectorName })}
                onClick={() => openConnectorDetails(alert.connectorId)}
              >
                <Icon name="external-link" size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {loading ? (
        <CenteredLoader label={t('common.loading')} />
      ) : (
        <div
          className={`connector-grid-wrap${needsComposioKey ? ' is-masked' : ''}`}
          data-testid="connector-grid-wrap"
        >
          {hasNoResults && !needsComposioKey ? (
            <div
              className="tab-empty connectors-empty"
              role="status"
              aria-live="polite"
              data-testid="connectors-empty"
            >
              <p className="connectors-empty-title">
                {t('connectors.emptyNoMatchTitle', { query: filter.trim() })}
              </p>
              <p className="connectors-empty-body">{t('connectors.emptyNoMatchBody')}</p>
              <button
                type="button"
                className="ghost connectors-empty-action"
                onClick={() => {
                  setFilter('');
                  searchInputRef.current?.focus();
                }}
              >
                {t('connectors.emptyNoMatchAction')}
              </button>
            </div>
          ) : (
            <div
              className="connector-grid"
              aria-hidden={needsComposioKey || undefined}
            >
              {filteredConnectors.map((connector) => (
                <ConnectorCard
                  key={connector.id}
                  connector={connector}
                  disabled={needsComposioKey}
                  pendingAction={
                    pendingConnectorAction?.connectorId === connector.id
                      ? pendingConnectorAction.action
                      : null
                  }
                  authorizationPending={connectorAuthorizationPending[connector.id]}
                  authorizationCancelFailed={connectorAuthorizationCancelFailed[connector.id] === true}
                  toolsLoading={toolsLoading}
                  toolsLoaded={toolsLoaded}
                  logoTheme={logoTheme}
                  onConnect={(connectorId) => runConnectorAction(connectorId, 'connect')}
                  onDisconnect={(connectorId) => runConnectorAction(connectorId, 'disconnect')}
                  onCancelAuthorization={cancelConnectorAuthorization}
                  onOpenDetails={openConnectorDetails}
                />
              ))}
            </div>
          )}
          {needsComposioKey ? (
            <div
              className="connector-gate"
              role="region"
              aria-label={t('connectors.gateTitle')}
              data-testid="connector-gate"
            >
              <div className="connector-gate-card">
                <div className="connector-gate-icon" aria-hidden>
                  <Icon name="settings" size={20} />
                </div>
                <h3 className="connector-gate-title">{t('connectors.gateTitle')}</h3>
                <p className="connector-gate-body">{t('connectors.gateBody')}</p>
              </div>
            </div>
          ) : null}
        </div>
      )}
      {detailConnector ? (
        <ConnectorDetailDrawer
          connector={detailConnector}
          disabled={needsComposioKey}
          pendingAction={
            pendingConnectorAction?.connectorId === detailConnector.id
              ? pendingConnectorAction.action
              : null
          }
          authorizationPending={connectorAuthorizationPending[detailConnector.id]}
          authorizationCancelFailed={connectorAuthorizationCancelFailed[detailConnector.id] === true}
          authorizationError={connectorAuthorizationError[detailConnector.id] ?? null}
          toolsLoading={toolsLoading}
          toolsPreviewLoading={Boolean(toolPreviewLoadingIds[detailConnector.id])}
          toolsLoaded={
            Boolean(toolPreviewFetchedIds[detailConnector.id])
            || toolPreviewFailedIds[detailConnector.id] === toolPreviewRetryToken
            || hasLoadedAllAdvertisedConnectorTools(detailConnector)
          }
          logoTheme={logoTheme}
          onClose={() => setDetailConnectorId(null)}
          onConnect={(connectorId) => runConnectorAction(connectorId, 'connect')}
          onDisconnect={(connectorId) => runConnectorAction(connectorId, 'disconnect')}
          onCancelAuthorization={cancelConnectorAuthorization}
          onLoadMoreTools={(connectorId, cursor) => hydrateToolPreview(connectorId, cursor)}
        />
      ) : null}
    </div>
  );
}

function ConnectorCard({
  connector,
  disabled = false,
  pendingAction,
  authorizationPending,
  authorizationCancelFailed,
  toolsLoading: _toolsLoading,
  toolsLoaded,
  logoTheme,
  onConnect,
  onDisconnect,
  onCancelAuthorization,
  onOpenDetails,
}: {
  connector: ConnectorDetail;
  disabled?: boolean;
  pendingAction: 'connect' | 'disconnect' | null;
  authorizationPending?: ConnectorAuthorizationPending;
  authorizationCancelFailed: boolean;
  toolsLoading: boolean;
  toolsLoaded: boolean;
  logoTheme: 'light' | 'dark';
  onConnect: (connectorId: string) => Promise<void> | void;
  onDisconnect: (connectorId: string) => Promise<void> | void;
  onCancelAuthorization: (connectorId: string) => void;
  onOpenDetails: (connectorId: string) => void;
}) {
  const t = useT();
  const isConnecting = pendingAction === 'connect';
  const isDisconnecting = pendingAction === 'disconnect';
  const isConnected = connector.status === 'connected';
  const isAuthorizationPending = !isConnected && authorizationPending !== undefined;
  const isPending = pendingAction !== null || isAuthorizationPending;
  const canConnect = !disabled && !isPending && connector.status === 'available';
  const canDisconnect = !disabled && !isPending && isConnected;
  const toolCount = getConnectorDisplayToolCount(connector);
  const showToolsBadge = connector.toolCount !== undefined || connector.tools.length > 0 || toolsLoaded;
  const toolsBadgeLabel = formatToolsBadge(toolCount, t);
  const categoryLabel = connectorCategoryLabel(connector.category, t);

  function openDetails() {
    if (disabled) return;
    onOpenDetails(connector.id);
  }

  function onKeyActivate(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    openDetails();
  }

  function stop(event: SyntheticEvent) {
    event.stopPropagation();
  }

  function continueAuthorization(event: SyntheticEvent) {
    stop(event);
    if (!authorizationPending?.redirectUrl) return;
    void openExternalUrl(authorizationPending.redirectUrl);
  }

  return (
    <article
      className={`connector-card status-${connector.status}${disabled ? ' is-locked' : ''}`}
      data-connector-id={connector.id}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={t('connectors.openDetailsAria', { name: connector.name })}
      onClick={openDetails}
      onKeyDown={onKeyActivate}
    >
      <div className="connector-card-top">
        <ConnectorLogo connector={connector} theme={logoTheme} size="sm" />
        <div className="connector-card-head">
          {/* Title row composes the connector name with an inline
              connection dot when applicable, instead of putting the
              dot in the action column. The dot now reads as a small
              "live status" indicator anchored to the brand label,
              while the action column is reserved purely for the
              connect/disconnect controls and any error/disabled
              status chips. The name span carries the ellipsis so a
              long brand never crowds the dot out of the row. */}
          <h3 className="connector-card-title">
            <span className="connector-card-title-name">{connector.name}</span>
            {isConnected ? (
              <span
                className={`connector-status-dot connector-card-title-dot status-${connector.status}`}
                aria-label={statusLabel(connector.status, t)}
                title={statusLabel(connector.status, t)}
                role="img"
              />
            ) : isAuthorizationPending ? (
              <span
                className="connector-status-dot connector-card-title-dot status-pending"
                aria-label={t('connectors.authorizationPending')}
                title={t('connectors.authorizationPending')}
                role="img"
              />
            ) : null}
          </h3>
          {/* Two-row meta block. Splitting category and tools-badge onto
              their own rows keeps card heights deterministic — long
              category labels no longer push the badge to a new line in
              an unpredictable way, and the tools-badge slot reserves
              its row even before the async discovery resolves so the
              card doesn't grow when the badge appears. The category
              row truncates with ellipsis (one line); the badge row is
              a fixed-height anchor that the badge animates into. */}
          <div className="connector-meta">
            <span
              className="connector-meta-item connector-meta-category"
              title={categoryLabel}
            >
              {categoryLabel}
            </span>
            <span className="connector-meta-tools" aria-hidden={!showToolsBadge}>
              {showToolsBadge ? (
                <span className="connector-tools-badge is-ready" title={toolsBadgeLabel}>
                  <span>{toolsBadgeLabel}</span>
                </span>
              ) : null}
            </span>
          </div>
        </div>
        <div className="connector-card-actions">
          {isConnected ? (
            <button
              type="button"
              className={connectorStyles.action}
              disabled={!canDisconnect}
              aria-busy={isDisconnecting || undefined}
              aria-label={t('connectors.disconnect')}
              title={t('connectors.disconnect')}
              tabIndex={disabled ? -1 : undefined}
              onMouseDown={stop}
              onKeyDown={stop}
              onClick={(e) => {
                stop(e);
                onDisconnect(connector.id);
              }}
            >
              <Icon name={isDisconnecting ? 'spinner' : 'close'} size={12} />
            </button>
          ) : (
            <button
              type="button"
              className={connectorStyles.action}
              disabled={!canConnect}
              aria-busy={isConnecting || isAuthorizationPending || undefined}
              aria-label={isAuthorizationPending ? t('connectors.authorizationPending') : t('connectors.connect')}
              title={isAuthorizationPending ? t('connectors.authorizationPendingHint') : t('connectors.connect')}
              tabIndex={disabled ? -1 : undefined}
              onMouseDown={stop}
              onKeyDown={stop}
              onClick={(e) => {
                stop(e);
                onConnect(connector.id);
              }}
            >
              <Icon name={isConnecting || isAuthorizationPending ? 'spinner' : 'plus'} size={12} />
            </button>
          )}
          {isAuthorizationPending ? (
            <button
              type="button"
              className={connectorStyles.action}
              aria-label={t('connectors.cancelAuthorization')}
              title={t('connectors.cancelAuthorization')}
              onMouseDown={stop}
              onKeyDown={stop}
              onClick={(e) => {
                stop(e);
                onCancelAuthorization(connector.id);
              }}
            >
              <Icon name="close" size={12} />
            </button>
          ) : null}
          {connector.status === 'error' || connector.status === 'disabled' ? (
            <span className={`connector-status-pill status-${connector.status}`}>
              {statusLabel(connector.status, t)}
            </span>
          ) : null}
        </div>
      </div>
      {authorizationCancelFailed ? (
        <p className="connector-authorization-hint connector-authorization-error" role="alert">
          {AUTHORIZATION_CANCEL_FAILED_MESSAGE}
        </p>
      ) : null}
      {isAuthorizationPending && authorizationPending.redirectUrl ? (
        <button
          type="button"
          className="connector-authorization-link"
          title={t('connectors.authorizationPendingHint')}
          onClick={continueAuthorization}
        >
          {CONNECTOR_AUTH_CONTINUE_LABEL}
        </button>
      ) : null}
    </article>
  );
}

function statusLabel(status: ConnectorDetail['status'], t: ReturnType<typeof useT>): string {
  switch (status) {
    case 'available':
      return t('connectors.statusAvailable');
    case 'connected':
      return t('connectors.statusConnected');
    case 'error':
      return t('connectors.statusError');
    case 'disabled':
      return t('connectors.statusDisabled');
  }
}

function connectorCategoryLabel(category: string, t: ReturnType<typeof useT>): string {
  const normalized = category.trim().toLowerCase();
  const key = CONNECTOR_CATEGORY_KEYS[normalized as keyof typeof CONNECTOR_CATEGORY_KEYS];
  return key ? t(key) : category;
}

function formatToolsBadge(count: number, t: ReturnType<typeof useT>): string {
  if (count === 0) return t('connectors.toolsBadgeNone');
  if (count === 1) return t('connectors.toolsBadgeOne', { n: count });
  return t('connectors.toolsBadgeMany', { n: count });
}

function ConnectorDetailDrawer({
  connector,
  disabled,
  pendingAction,
  authorizationPending,
  authorizationCancelFailed,
  authorizationError,
  toolsLoading,
  toolsPreviewLoading,
  toolsLoaded,
  logoTheme,
  onClose,
  onConnect,
  onDisconnect,
  onCancelAuthorization,
  onLoadMoreTools,
}: {
  connector: ConnectorDetail;
  disabled: boolean;
  pendingAction: 'connect' | 'disconnect' | null;
  authorizationPending?: ConnectorAuthorizationPending;
  authorizationCancelFailed: boolean;
  authorizationError: string | null;
  toolsLoading: boolean;
  toolsPreviewLoading: boolean;
  toolsLoaded: boolean;
  logoTheme: 'light' | 'dark';
  onClose: () => void;
  onConnect: (connectorId: string) => Promise<void> | void;
  onDisconnect: (connectorId: string) => Promise<void> | void;
  onCancelAuthorization: (connectorId: string) => void;
  onLoadMoreTools: (connectorId: string, cursor: string) => Promise<void> | void;
}) {
  const t = useT();
  const isConnected = connector.status === 'connected';
  const isConnecting = pendingAction === 'connect';
  const isDisconnecting = pendingAction === 'disconnect';
  const isAuthorizationPending = !isConnected && authorizationPending !== undefined;
  const isPending = pendingAction !== null || isAuthorizationPending;
  const canConnect = !disabled && !isPending && connector.status === 'available';
  const canDisconnect = !disabled && !isPending && isConnected;
  const accountLabel = getDisplayableConnectorAccountLabel(connector);
  const actualToolCount = connector.tools.length;
  const toolCount = getConnectorDisplayToolCount(connector);
  const isLoadingTools = !toolsLoaded || (toolsLoading && actualToolCount === 0) || (toolsPreviewLoading && actualToolCount === 0);
  const toolDetailsUnavailable = toolsLoaded && actualToolCount === 0 && toolCount > 0;
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [closing, setClosing] = useState(false);
  const [query, setQuery] = useState('');
  // Portalling escapes the transformed Settings dialog. Keep its actual theme,
  // which can differ from the WordPress document or system preference.
  const [theme] = useState(() => {
    const scope = document.activeElement?.closest('[data-theme]');
    const value = scope?.getAttribute('data-theme');
    return value === 'dark' || value === 'light' ? value : logoTheme;
  });
  const requestClose = useCallback(() => setClosing(true), []);
  useEffect(() => {
    if (!closing) return;
    const delay = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 140;
    const timer = window.setTimeout(() => onCloseRef.current(), delay);
    return () => window.clearTimeout(timer);
  }, [closing]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        requestClose();
      } else if (e.key === 'Tab') {
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), a[href], summary, [tabindex="0"]',
        ) ?? []).filter((el) => !el.closest('details:not([open]) > :not(summary)'));
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (e.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
          e.preventDefault(); last?.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
          e.preventDefault(); first?.focus();
        }
      }
    }
    // Capture before the parent Settings Escape handler; close only this layer.
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [requestClose]);

  const needle = query.trim().toLocaleLowerCase();
  const visibleTools = connector.tools.filter((tool) => !needle ||
    `${tool.title ?? ''} ${tool.name} ${tool.description ?? ''}`.toLocaleLowerCase().includes(needle));

  function continueAuthorization(event: SyntheticEvent) {
    event.stopPropagation();
    if (authorizationPending?.redirectUrl) void openExternalUrl(authorizationPending.redirectUrl);
  }

  return createPortal(
    <div className="pixflow-design-portal-scope" data-theme={theme}>
    <div className={modalStyles.backdrop} data-closing={closing || undefined} role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section ref={dialogRef} className={modalStyles.dialog} role="dialog" aria-modal="true"
        aria-labelledby="connector-drawer-title" data-testid="connector-drawer"
        onClick={(event) => event.stopPropagation()}>
        <header className={modalStyles.header}>
          <div className={modalStyles.brand}><ConnectorLogo connector={connector} theme={theme} size="lg" /></div>
          <div className={modalStyles.identity}>
            <h2 id="connector-drawer-title">{connector.name}</h2>
            <div className={modalStyles.metadata}>
              <span>{connectorCategoryLabel(connector.category, t)}</span><span aria-hidden>·</span><span>{connector.provider}</span>
            </div>
          </div>
          <Button ref={closeBtnRef} className={modalStyles.close} onClick={requestClose}
            aria-label={t('common.close')} data-testid="connector-drawer-close"><Icon name="close" size={18} /></Button>
        </header>
        <div className={modalStyles.body} data-testid="connector-modal-scroll">
          <div className={modalStyles.overview}>
            <span className={modalStyles.status} data-status={isAuthorizationPending ? 'pending' : connector.status}>
              <span aria-hidden />{isAuthorizationPending ? t('connectors.authorizationPending') : statusLabel(connector.status, t)}
            </span>
            {connector.description ? <p className={modalStyles.description}>{connector.description}</p> : null}
            {accountLabel ? <div className={modalStyles.account}><span>{t('connectors.account')}</span><strong>{accountLabel}</strong></div> : null}
          </div>
          {connector.provider === 'composio' && isConnected ? <ComposioWriteAccess connectorId={connector.id} connectorName={connector.name} /> : null}
          {isAuthorizationPending ? <div className={modalStyles.notice} role="status">
            <p>{t('connectors.authorizationPendingHint')}</p>
            {authorizationPending.redirectUrl ? <Button className={modalStyles.secondary} onClick={continueAuthorization}>{CONNECTOR_AUTH_CONTINUE_LABEL}<Icon name="external-link" size={14} /></Button> : null}
          </div> : null}
          {authorizationError || authorizationCancelFailed || connector.lastError ? <div className={modalStyles.error} role="alert">
            {authorizationError ? <p>{authorizationError}</p> : null}
            {authorizationCancelFailed ? <p>{AUTHORIZATION_CANCEL_FAILED_MESSAGE}</p> : null}
            {connector.lastError && connector.lastError !== authorizationError ? <p>{connector.lastError}</p> : null}
          </div> : null}
          <section className={modalStyles.tools} aria-labelledby="connector-tools-title">
            <div className={modalStyles.sectionHeader}>
              <h3 id="connector-tools-title">{t('connectors.toolsSection')} <span>{toolCount}</span></h3>
              {actualToolCount > 0 ? <span className={modalStyles.loaded}>{t('connectors.toolsLoadedCount', { n: actualToolCount, total: toolCount })}</span> : null}
            </div>
            {actualToolCount > 0 ? <div className={modalStyles.search}>
              <Icon name="search" size={16} />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder={t('connectors.searchLoadedTools')} aria-label={t('connectors.searchLoadedTools')} />
              {query ? <Button className={modalStyles.clear} onClick={() => setQuery('')} aria-label={t('connectors.searchClear')}><Icon name="close" size={14} /></Button> : null}
            </div> : null}
            {isLoadingTools ? <p className={modalStyles.empty} role="status"><Icon name="spinner" size={16} />{t('connectors.toolsLoading')}</p>
              : toolDetailsUnavailable ? <p className={modalStyles.empty}>{t('connectors.toolDetailsUnavailable', { n: toolCount })}</p>
              : actualToolCount === 0 ? <p className={modalStyles.empty}>{t('connectors.noToolsAvailable')}</p>
              : <>
                {visibleTools.length === 0 ? <p className={modalStyles.empty} role="status">{t('connectors.noLoadedToolsMatch')}</p> : null}
                <ul className={modalStyles.toolList}>
                  {visibleTools.map((tool) => <li key={tool.name}>
                    <details className={modalStyles.tool}>
                      <summary><span className={modalStyles.toolTitle}>{tool.title || tool.name}</span>
                        <span className={modalStyles.safety} data-effect={tool.safety.sideEffect} title={tool.safety.reason}>{tool.safety.sideEffect}</span>
                        <span className={modalStyles.chevron} aria-hidden><Icon name="chevron-down" size={14} /></span>
                      </summary>
                      <div className={modalStyles.toolDetails}>
                        {tool.description ? <p>{tool.description}</p> : null}
                        <code>{tool.name}</code>
                        {tool.safety.reason ? <p className={modalStyles.reason}>{tool.safety.reason}</p> : null}
                      </div>
                    </details>
                  </li>)}
                </ul>
                {connector.toolsNextCursor ? <Button className={modalStyles.loadMore} disabled={toolsPreviewLoading}
                  onClick={() => onLoadMoreTools(connector.id, connector.toolsNextCursor!)}>
                  {toolsPreviewLoading ? <Icon name="spinner" size={14} /> : null}{t('connectors.loadMoreTools')}
                </Button> : null}
              </>}
          </section>
        </div>
        <footer className={modalStyles.footer}>
          <span className={modalStyles.footerLabel}>{formatToolsBadge(toolCount, t)}</span>
          <div className={modalStyles.footerActions}>
            {isAuthorizationPending ? <Button className={modalStyles.secondary} onClick={() => onCancelAuthorization(connector.id)}>{t('connectors.cancelAuthorization')}</Button> : null}
            <Button className={isConnected ? modalStyles.disconnect : modalStyles.primary}
              disabled={isConnected ? !canDisconnect : !canConnect}
              aria-busy={isPending || undefined}
              onClick={() => isConnected ? onDisconnect(connector.id) : onConnect(connector.id)}>
              {isConnecting || isDisconnecting || isAuthorizationPending ? <Icon name="spinner" size={14} /> : null}
              {isConnected ? t('connectors.disconnect') : isAuthorizationPending ? t('connectors.authorizationPending') : t('connectors.connect')}
            </Button>
          </div>
        </footer>
      </section>
    </div>
    </div>, document.body,
  );
}

function getDisplayableConnectorAccountLabel(connector: ConnectorDetail): string | undefined {
  if (!connector.accountLabel) return undefined;
  const provider = connector.auth?.provider ?? connector.provider.toLowerCase();
  if (provider === 'composio') return undefined;
  return connector.accountLabel;
}
