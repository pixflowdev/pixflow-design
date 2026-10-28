import type { AmrModelsResponse } from '@open-design/contracts';
import { deriveConfigureGlobals } from '@open-design/contracts/analytics';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { detectClientType } from './analytics/identity';
import { useAnalytics } from './analytics/provider';
import { AMR_LOGIN_STATUS_EVENT } from './components/amrLoginPolling';
import { MemoryToast } from './components/MemoryToast';
import { OnboardingView } from './components/OnboardingView';
import { migrateCustomPetAtlas } from './components/pet/pets';
import { PixflowGateModalBackdrop } from './components/PixflowGateModalBackdrop';
import { PixflowLicensePanel } from './components/PixflowLicensePanel';
import { SettingsDialog, switchApiProtocolConfig, updateCurrentApiProtocolConfig, type SettingsHighlight, type SettingsSection, } from './components/SettingsDialog';
import { TooltipLayer } from './components/TooltipLayer';
import { useModalWindowDragGuard } from './hooks/useModalWindowDragGuard';
import { useI18n, useT as usePixflowUiTranslation } from './i18n';
import { PixflowBridgeUpdateProvider, usePixflowBridgeUpdateState, } from './pixflow/bridge-update-gate';
import { usePixflowFeatureRuntime } from './pixflow/feature-runtime';
import { isPixflowWordPressEmbed, requestWordPressRest, type PixflowLicenseStatus, } from './pixflow/license';
import { applyPixflowOnboardingProfile, fetchPixflowOnboardingProfile, resetPixflowOnboardingProfile, syncPixflowOnboardingProfile, } from './pixflow/onboarding-profile';
import { createPixflowSharedAppConfigNotification, subscribePixflowSharedAppConfigNotifications, } from './pixflow/shared-app-config-notification';
import { isTrustedPixflowParentMessage } from './pixflow/trusted-parent-message';
import { usePixflowLicenseRefresh } from './pixflow/use-license-refresh';
import { getPixflowBuilderPostId, getPixflowWordPressConfig, hasPixflowWordPressContext } from './pixflow/wordpress-context';
import { buildPixflowWordPressAppConfigPrefs } from './pixflow/wordpress-settings-prefs';
import { workspaceAccessAllowed } from './pixflow/workspace-access';
import { WorkspaceContribution, workspaceAvailable, type WorkspaceActions } from './pixflow/workspace-contribution';
import { isPixflowHiddenBuilderWorkspace } from './pixflow/workspace-visibility';
import { agentReadinessBridgeStatusSignature, bridgeStatusCanWarmAgentReadiness, warmSelectedAgentReadiness, } from './providers/agent-readiness';
import { fetchAmrModels, fetchVelaLoginStatus, type VelaLoginStatus } from './providers/daemon';
import { daemonIsLive, fetchAgents, fetchAgentsStream, fetchDesignSystems, fetchSkills } from './providers/registry';
import { navigate, useRoute } from './router';
import { useLastActiveWorkspaceChat } from './pixflow/use-last-active-workspace-chat';
import { fetchDaemonConfig, fetchMediaProvidersFromDaemon, loadConfig, mergeDaemonConfig, mergeDaemonMediaProviders, saveConfig, syncComposioConfigToDaemon, syncConfigToDaemon } from './state/config';
import { useAppearance } from './state/useAppearance';
import type { AgentInfo, AgentModelChoice, ApiProtocol, AppConfig, AppVersionInfo, DesignSystemGenerationJob, DesignSystemSummary, ProviderModelOption, SkillSummary } from './types';
import { isMacPlatform } from './utils/platform';
export { buildPixflowWordPressAppConfigPrefs } from './pixflow/wordpress-settings-prefs';

const APP_CONFIG_CHANGED_EVENT = 'open-design:app-config-changed';
const BRICKS_EXTENSION_CONFIG_CHANGED_EVENT = 'pixflow-design:bricks-extensions-config-changed';
const PIXFLOW_BRICKS_AGENT_EXECUTION_SETTINGS_EVENT =
  'pixflow-design:bricks-agent-execution-settings-changed';
const AMR_AGENT_ID = 'amr';
const AMR_PROFILE_ENV_KEY = 'OPEN_DESIGN_AMR_PROFILE';
// Pixflow-owned: hosted OD AMR is not part of Pixflow Design, so keep its
// background model/status polling disabled while leaving upstream code mergeable.
const PIXFLOW_AMR_ENABLED = false;

function readPixflowWordPressRuntimeVersionInfo(): AppVersionInfo | null {
  if (typeof window === 'undefined' || !hasPixflowWordPressContext()) return null;
  const shell = (window as unknown as {
    __PIXFLOW_DESIGN_WORDPRESS__?: { version?: string };
    pixflowDesignShell?: { version?: string };
  }).__PIXFLOW_DESIGN_WORDPRESS__ ?? (window as unknown as {
    pixflowDesignShell?: { version?: string };
  }).pixflowDesignShell;
  const version = typeof shell?.version === 'string' && shell.version.trim() !== ''
    ? shell.version.trim()
    : 'wordpress';
  return {
    version,
    runtimeVersion: version,
    product: 'pixflow-design-wordpress',
    channel: 'wordpress-local',
    packaged: false,
    platform: 'wordpress',
    arch: 'site',
  };
}

function isPixflowWorkspaceCatalogInitiallyVisible(): boolean {
  if (typeof window === 'undefined') return true;
  const params = new URLSearchParams(window.location.search);
  if (params.has('bricks')) return false;
  const wpConfig = (window as unknown as {
    __PIXFLOW_DESIGN_WORDPRESS__?: { workspaceInitiallyVisible?: boolean };
  }).__PIXFLOW_DESIGN_WORDPRESS__;
  if (typeof wpConfig?.workspaceInitiallyVisible === 'boolean') {
    return wpConfig.workspaceInitiallyVisible;
  }
  const shell = (window as unknown as { pixflowDesignShell?: unknown }).pixflowDesignShell;
  // In the Bricks builder shell the React workspace may be pre-mounted while
  // hidden so agents/skills are warm for the floating panel. Defer catalog
  // surfaces in that hidden state; the builder shell posts visibility when the
  // workspace is opened.
  return !(hasPixflowWordPressContext() && Boolean(shell));
}


function normalizeSavedComposioConfig(config: AppConfig['composio']): AppConfig['composio'] {
  const apiKey = config?.apiKey?.trim() ?? '';
  if (apiKey) {
    return {
      ...config,
      apiKey: '',
      apiKeyConfigured: true,
      apiKeyTail: apiKey.slice(-4),
    };
  }
  return { ...(config ?? {}) };
}

function amrProfileForConfig(config: AppConfig): string | null {
  const profile = config.agentCliEnv?.[AMR_AGENT_ID]?.[AMR_PROFILE_ENV_KEY];
  return typeof profile === 'string' && profile ? profile : null;
}

function sameAgentModelChoice(
  left: AgentModelChoice | undefined,
  right: AgentModelChoice | undefined,
): boolean {
  return (left?.model ?? null) === (right?.model ?? null)
    && (left?.reasoning ?? null) === (right?.reasoning ?? null);
}

function clearStaleAmrModelChoiceOnProfileChange(
  previous: AppConfig,
  next: AppConfig,
): AppConfig {
  if (amrProfileForConfig(previous) === amrProfileForConfig(next)) return next;

  const previousChoice = previous.agentModels?.[AMR_AGENT_ID];
  const nextChoice = next.agentModels?.[AMR_AGENT_ID];
  if (!nextChoice || !sameAgentModelChoice(previousChoice, nextChoice)) return next;

  const nextAgentModels = { ...(next.agentModels ?? {}) };
  delete nextAgentModels[AMR_AGENT_ID];
  return { ...next, agentModels: nextAgentModels };
}

export type ProjectListRequest = {
  generation: number;
  mutationVersion: number;
};

export async function persistComposioConfigChange(
  current: AppConfig,
  composio: AppConfig['composio'],
  sync: (config: AppConfig['composio']) => Promise<boolean> = syncComposioConfigToDaemon,
): Promise<AppConfig> {
  const saved = await sync(composio);
  if (!saved) throw new Error('Composio config save failed');
  return {
    ...current,
    composio: normalizeSavedComposioConfig(composio),
  };
}

export function buildPersistedConfig(next: AppConfig, current: AppConfig): AppConfig {
  return {
    ...next,
    onboardingCompleted: current.onboardingCompleted ? true : next.onboardingCompleted,
    composio: next.composio
      ? {
          apiKey: '',
          apiKeyConfigured: Boolean(next.composio.apiKeyConfigured),
          apiKeyTail: next.composio.apiKeyTail ?? '',
        }
      : next.composio,
  };
}

/**
 * True when `next` and `last` produce an identical persisted shape —
 * i.e. the only diffs between them are fields that buildPersistedConfig
 * intentionally strips before disk/daemon writes (the Composio API key
 * draft today; any future save-on-explicit-confirm secrets later).
 *
 * The autosave loop in Settings uses this to skip the "All changes
 * saved" indicator transition when the user has only typed an unsaved
 * secret. Without it, autosave completes a no-op write and flashes
 * "Saved" — misleading users into trusting that a sensitive key has
 * been persisted when in fact only the section-local "Save key"
 * gesture commits it.
 */
export function isAutosaveDraftOnlyChange(next: AppConfig, last: AppConfig): boolean {
  return (
    JSON.stringify(buildPersistedConfig(next, next))
    === JSON.stringify(buildPersistedConfig(last, last))
  );
}

export function resolveSettingsCloseConfig(
  rendered: AppConfig,
  latestPersisted: AppConfig,
): AppConfig {
  const base = latestPersisted === rendered ? rendered : latestPersisted;
  return base;
}

/**
 * Public cross-surface notifications omit credentials. Read the latest local
 * snapshot before merging them, so a stale mounted root cannot erase a key
 * just saved by another root (or resurrect a key the user removed).
 */
export function mergeIncomingWordPressConfig(
  current: AppConfig,
  persisted: AppConfig,
  patch: Partial<AppConfig> | NonNullable<Awaited<ReturnType<typeof fetchDaemonConfig>>>,
): AppConfig {
  const next = mergeDaemonConfig({ ...current, ...persisted }, patch as AppConfig);
  // WordPress owns execution preferences; Bridge discovery must remain limited
  // to CLI metadata. Public preferences never replace browser-owned secrets.
  for (const key of ['mode', 'apiTransport', 'apiProtocol', 'apiVersion', 'baseUrl',
    'model', 'apiProviderBaseUrl', 'composioProvider', 'composioModel', 'maxTokens'] as const) {
    if (patch[key] !== undefined) Object.assign(next, { [key]: patch[key] });
  }
  return next;
}


function hasPixflowCliConfigChange(next: AppConfig, previous: AppConfig): boolean {
  return next.agentId !== previous.agentId
    || next.allowVisualReviewerFallback !== previous.allowVisualReviewerFallback
    || next.disableBricksEmptyDivMinimumSize !== previous.disableBricksEmptyDivMinimumSize
    || next.codexImagegenOverride !== previous.codexImagegenOverride
    || next.bricksAbilitiesEnabled !== previous.bricksAbilitiesEnabled
    || JSON.stringify(next.agentModels ?? {}) !== JSON.stringify(previous.agentModels ?? {})
    || JSON.stringify(next.agentCliEnv ?? {}) !== JSON.stringify(previous.agentCliEnv ?? {});
}

async function syncPixflowWordPressAppConfig(config: AppConfig): Promise<void> {
  if (!isPixflowWordPressEmbed()) return;
  const postId = getPixflowBuilderPostId();
  const configPath = postId && postId > 0
    ? `od/app-config?postId=${encodeURIComponent(String(postId))}`
    : 'od/app-config';
  const response = await requestWordPressRest<{
    config?: Partial<AppConfig> & { bricksExtensionPageSettings?: Record<string, unknown> };
  }>(configPath, {
    method: 'PUT',
    body: buildPixflowWordPressAppConfigPrefs(config),
  });
  if (!response.ok) {
    throw new Error('Could not save WordPress app settings.');
  }

  // The WordPress-hosted Bricks Agent is mounted beside this app, not below a
  // daemon/Bridge iframe. Keep its in-memory execution settings current after
  // the authoritative WordPress write succeeds. This same-window event may
  // carry the browser-only API key; it is never posted to WordPress or another
  // browsing context.
  if (typeof window !== 'undefined') {
    const notification = createPixflowSharedAppConfigNotification(config, 'wp_admin', 'workspace-save');
    window.dispatchEvent(new CustomEvent('pixflow-design:app-config-changed', {
      detail: notification?.patch ?? {},
    }));

    // The REST response includes the current Builder document's page
    // switches when the save came from an embedded Builder. Forward those
    // authoritative values to the parent shell so a global <-> page scope
    // change restores the page state without a full reload.
    const serverConfig = response.body?.config;
    const pageSettings = serverConfig?.bricksExtensionPageSettings;
    if (pageSettings && typeof pageSettings === 'object' && !Array.isArray(pageSettings)) {
      const detail = {
        pageSettings,
        bricksExtensions: serverConfig?.bricksExtensions ?? config.bricksExtensions,
      };
      window.dispatchEvent(new CustomEvent('pixflow-design:bricks-extension-page-settings-changed', {
        detail,
      }));
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          source: 'pixflow-design',
          type: 'pixflow-design:bricks-extension-page-settings-changed',
          detail,
        }, '*');
      }
    }
  }
}

function mergeAmrModelsIntoAgents(
  agents: AgentInfo[],
  amrModels: AmrModelsResponse | null,
): AgentInfo[] {
  if (!amrModels || amrModels.models.length === 0) return agents;
  return agents.map((agent) => {
    if (agent.id !== 'amr') return agent;
    const shouldPreferAgentModels =
      amrModels.source === 'preset' &&
      Array.isArray(agent.models) &&
      agent.models.length > 0;
    if (shouldPreferAgentModels) return agent;
    return { ...agent, models: amrModels.models, modelsSource: 'live' };
  });
}

const CANONICAL_AGENT_ORDER = [
  'claude',
  'codex',
  'devin',
  'antigravity',
  'opencode',
  'hermes',
  'trae-cli',
  'grok-build',
  'kimi',
  'cursor-agent',
  'qwen',
  'qoder',
  'copilot',
  'pi',
  'kiro',
  'kilo',
  'vibe',
  'deepseek',
  'aider',
  'reasonix',
] as const;

const CANONICAL_AGENT_ORDER_INDEX = new Map<string, number>(
  CANONICAL_AGENT_ORDER.map((id, index) => [id, index]),
);

function orderAgentsByRegistry(agents: AgentInfo[]): AgentInfo[] {
  return agents
    .filter((agent) => agent.id !== 'amr')
    .map((agent, index) => ({ agent, index }))
    .sort((left, right) => {
      const leftRank =
        CANONICAL_AGENT_ORDER_INDEX.get(left.agent.id) ??
        CANONICAL_AGENT_ORDER.length;
      const rightRank =
        CANONICAL_AGENT_ORDER_INDEX.get(right.agent.id) ??
        CANONICAL_AGENT_ORDER.length;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.index - right.index;
    })
    .map(({ agent }) => agent);
}

function upsertAgent(agents: AgentInfo[], agent: AgentInfo): AgentInfo[] {
  if (agent.id === 'amr') return agents;
  const index = agents.findIndex((item) => item.id === agent.id);
  if (index === -1) return [...agents, agent];
  const next = agents.slice();
  next[index] = agent;
  return next;
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'AbortError'
  );
}

export interface AppProps {
  /** A hidden workspace can host Settings without making the workspace visible. */
  settingsPortal?: boolean;
  workspaceInitiallyVisible?: boolean;
}

export function App({ settingsPortal = false, workspaceInitiallyVisible }: AppProps = {}) {
  usePixflowFeatureRuntime();
  // `reducedMotion="user"` makes every motion/react component honor the OS
  // `prefers-reduced-motion` setting: transform/layout animations are zeroed
  // out while opacity-only changes are kept. The CSS `@media (prefers-reduced-
  // motion: reduce)` block covers the CSS-keyframe surfaces, but the dialogs,
  // toasts and popovers that moved to motion/react need this gate too — without
  // it they keep springing/sliding for users who asked us not to animate.
  return (
    <MotionConfig reducedMotion="user">
      <AppInner settingsPortal={settingsPortal} workspaceInitiallyVisible={workspaceInitiallyVisible} />
    </MotionConfig>
  );
}


function useAppController({ settingsPortal, workspaceInitiallyVisible }: AppProps) {
  const workspaceActionsRef = useRef<WorkspaceActions | null>(null);
  const pendingTemplateLibrary = useRef(false);
  usePixflowLicenseRefresh();

  const translateUi = usePixflowUiTranslation();

  const { t } = useI18n();

  const clientType = useMemo(() => detectClientType(), []);

  useModalWindowDragGuard();

  // Observability marker. `apps/web/src/observability/white-screen.ts`
  // keys its "app actually mounted" success condition on this attribute
  // because the dynamic-import loading shell (`<div class="od-loading-shell">
  // Loading Pixflow Design…</div>`) is itself >MIN_VISIBLE_TEXT and would
  // otherwise be mistaken for a real mount. Survives subsequent render
  // crashes — once App has mounted at least once, it's no longer a white
  // screen (subsequent failures show up as `$exception`).
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-od-app-mounted', '1');
    }
  }, []);

  const [config, setConfig] = useState<AppConfig>(() => loadConfig());

  const configRef = useRef(config);

  configRef.current = config;

  const latestPersistedConfigRef = useRef(config);

  latestPersistedConfigRef.current = config;

  const [settingsOpen, setSettingsOpen] = useState(false);

  const [settingsWelcome, setSettingsWelcome] = useState(false);

  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('execution');

  const [settingsHighlight, setSettingsHighlight] = useState<SettingsHighlight>(null);

  const [pendingWorkspaceTool, setPendingWorkspaceTool] = useState<'google-fonts' | 'design-system' | null>(null);

  const [toolbarWorkspaceTool, setToolbarWorkspaceTool] = useState<'settings' | 'google-fonts' | 'icon-sets' | 'design-system' | null>(null);

  const [daemonLive, setDaemonLive] = useState(false);

  const [agents, setAgents] = useState<AgentInfo[]>([]);

  const amrModelsRef = useRef<AmrModelsResponse | null>(null);

  const amrPollGenerationRef = useRef(0);

  const agentStreamRequestSeqRef = useRef(0);

  const pixflowWpAgentHydrationAttemptedRef = useRef(false);

  const cliConfigPersistTimerRef = useRef<number | null>(null);

  const cliConfigPersistInFlightRef = useRef(false);

  const cliConfigPersistLatestRef = useRef<{ next: AppConfig; source: string } | null>(null);

  const [amrPollRestartToken, setAmrPollRestartToken] = useState(0);

  const [providerModelsCache, setProviderModelsCache] = useState<
    Record<string, ProviderModelOption[]>
  >({});

  // Pixflow-owned: WordPress licensing gates the Pixflow Design workspace while
  // preserving the upstream OD app mechanics inside the local bridge.
  const [pixflowLicenseStatus, setPixflowLicenseStatus] =
    useState<PixflowLicenseStatus | null>(null);

  // Functional skills (capabilities the agent invokes mid-task) — stays
  // small and lives under the Settings → Skills surface.
  const [skills, setSkills] = useState<SkillSummary[]>([]);

  const [designSystems, setDesignSystems] = useState<DesignSystemSummary[]>([]);

  const [appVersionInfo, setAppVersionInfo] = useState<AppVersionInfo | null>(
    () => readPixflowWordPressRuntimeVersionInfo(),
  );

  const [daemonMediaProviders, setDaemonMediaProviders] = useState<
    AppConfig['mediaProviders'] | null
  >(null);

  const [daemonMediaProvidersFetchState, setDaemonMediaProvidersFetchState] = useState<
    'idle' | 'ok' | 'error'
  >('idle');

  const [mediaProvidersNotice, setMediaProvidersNotice] = useState<string | null>(null);

  // Per-resource loading flags. Each goes false the moment its own fetch
  // resolves so each entry-view tab can render as its data lands instead of
  // every tab waiting on the slowest endpoint (typically `/api/agents`,
  // which probes CLI versions and can take seconds on cold start). The entry
  // view picks the right flag for whichever tab the user is currently on.
  const [agentsLoading, setAgentsLoading] = useState(true);

  const [skillsLoading, setSkillsLoading] = useState(true);

  const [dsLoading, setDsLoading] = useState(true);

  // Goes true once the daemon-persisted config (agentId/designSystemId/etc.)
  // has merged into local state. Auto-selection effects below wait on this
  // so they don't race ahead of the daemon-stored choice and overwrite it
  // with a freshly picked first-available agent.
  const [daemonConfigLoaded, setDaemonConfigLoaded] = useState(false);

  // Narrower flag dedicated to the Composio API key hydration. The key is
  // persisted by the daemon (and only reflected back via apiKeyConfigured
  // + apiKeyTail), so after a dev-server restart there is a window where
  // the dialog can render an empty Composio input even though a saved key
  // exists. Settings → Connectors uses this to render a skeleton over the
  // input + buttons instead of an empty input that the user might
  // mistake for "no key saved" — and to disable Save/Clear so a misclick
  // can't overwrite the saved state with `''` before hydration lands.
  const [composioConfigLoading, setComposioConfigLoading] = useState(true);

  const [pixflowWorkspaceCatalogVisible, setPixflowWorkspaceCatalogVisible] = useState(
    () => workspaceInitiallyVisible ?? isPixflowWorkspaceCatalogInitiallyVisible(),
  );

  const route = useRoute();

  const workspaceAllowed = workspaceAccessAllowed(isPixflowWordPressEmbed(), workspaceAvailable(), pixflowLicenseStatus);
  useLastActiveWorkspaceChat(route, isPixflowWordPressEmbed() && workspaceAllowed && pixflowWorkspaceCatalogVisible);

  const workspaceSetup = route.kind === 'home' && route.view === 'onboarding';

  const analytics = useAnalytics();


  const beginAgentStreamRequest = useCallback(() => {
    agentStreamRequestSeqRef.current += 1;
    return agentStreamRequestSeqRef.current;
  }, []);


  const isCurrentAgentStreamRequest = useCallback((requestId: number) => {
    return agentStreamRequestSeqRef.current === requestId;
  }, []);


  const restartAmrPolling = useCallback(() => {
    amrPollGenerationRef.current += 1;
    setAmrPollRestartToken((current) => current + 1);
  }, []);


  // Keep host client detection available for desktop/web runtime branching.
  void detectClientType;


  // App-level AMR sign-in state — declared here because the configure
  // globals effect below reads it; the sync effects live next to the
  // other AMR plumbing further down.
  const [amrLoginStatus, setAmrLoginStatus] = useState<VelaLoginStatus | null>(null);


  // v2 analytics requires every event to carry the configure-state
  // triplet (has_available_configure_cli / configure_type /
  // configure_availability). We push it into the PostHog global register
  // whenever the user's execution-mode config or the detected agent list
  // changes; the next capture inherits the fresh values, so dashboards
  // can segment by execution setup without per-helper boilerplate.
  //
  // Gated on `agentsLoading` so the cold-start probe (`fetchAgentsStream()`
  // lands asynchronously after this effect's first run) does not stamp
  // the first home/projects/plugins page_view with
  // has_available_configure_cli=false / configure_availability=unavailable
  // on machines that DO have an installed CLI. While the probe is in
  // flight we leave the boot defaults ('unknown'/'unknown') in place,
  // matching what the helper would return for an empty agent list with
  // no mode pinned.
  useEffect(() => {
    if (agentsLoading) return;
    const byokConfigured = (() => {
      const protocols = config.apiProtocolConfigs;
      if (!protocols) return Boolean(config.apiKey?.trim());
      return Object.values(protocols).some(
        (cfg) => Boolean(cfg?.apiKey?.trim()),
      );
    })();
    const globals = deriveConfigureGlobals({
      mode: config.mode,
      agentId: config.agentId,
      agents: agents.map((a) => ({ id: a.id, available: a.available })),
      byokConfigured,
      amrAuthorized: amrLoginStatus?.loggedIn === true,
    });
    analytics.setConfigureGlobals(globals);
  }, [
    analytics.setConfigureGlobals,
    agentsLoading,
    amrLoginStatus,
    config.mode,
    config.agentId,
    config.apiKey,
    config.apiProtocolConfigs,
    agents,
  ]);


  // Sync theme preference to the <html> element so CSS variables pick it up.
  // useLayoutEffect (vs useEffect) fires before the browser paints, so a
  // live theme switch in Settings applies atomically — no 1-frame flash of
  // the old theme. Safe here because the component tree is ssr:false.
  useAppearance(config.theme, config.accentColor);


  useEffect(() => {
    let cancelled = false;
    const applyLicenseStatus = (event: Event) => {
      if (!cancelled) setPixflowLicenseStatus((event as CustomEvent<PixflowLicenseStatus>).detail);
    };
    window.addEventListener('pixflow-design:license-changed', applyLicenseStatus);
    return () => {
      cancelled = true;
      window.removeEventListener('pixflow-design:license-changed', applyLicenseStatus);
    };
  }, []);


  useEffect(() => {
    if (!PIXFLOW_AMR_ENABLED) return;
    if (!daemonLive) return;
    let cancelled = false;
    let timer: number | null = null;
    const pollGeneration = amrPollGenerationRef.current + 1;
    amrPollGenerationRef.current = pollGeneration;
    const pollDelayMs = 1_000;
    const maxPresetPolls = 10;
    let presetPolls = 0;

    const applyAmrModels = async () => {
      const result = await fetchAmrModels();
      if (
        cancelled ||
        amrPollGenerationRef.current !== pollGeneration ||
        !result ||
        !Array.isArray(result.models) ||
        result.models.length === 0
      ) {
        return;
      }
      amrModelsRef.current = result;
      setAgents((current) => mergeAmrModelsIntoAgents(current, result));
      const shouldPollPreset =
        result.source === 'preset' &&
        !result.remoteError &&
        presetPolls < maxPresetPolls;
      if (shouldPollPreset) {
        presetPolls += 1;
        timer = window.setTimeout(() => {
          void applyAmrModels();
        }, pollDelayMs);
      }
    };

    void applyAmrModels();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [amrPollRestartToken, daemonLive]);


  // App-level AMR sign-in state. Feeds two analytics globals: the
  // `amr` configure_type bucket (deriveConfigureGlobals below) and the
  // `user_id` public param (the AMR account id is the only join key
  // between this PostHog project and the AMR-side one). Child surfaces
  // push status changes up via onAmrLoginStatusChange; the global
  // AMR_LOGIN_STATUS_EVENT covers logins finishing in surfaces that
  // unmounted before their poll settled.
  useEffect(() => {
    if (!PIXFLOW_AMR_ENABLED) return;
    let cancelled = false;
    const sync = async () => {
      const status = await fetchVelaLoginStatus();
      if (!cancelled && status) setAmrLoginStatus(status);
    };
    void sync();
    const onStatusEvent = () => {
      void sync();
    };
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, onStatusEvent);
    return () => {
      cancelled = true;
      window.removeEventListener(AMR_LOGIN_STATUS_EVENT, onStatusEvent);
    };
  }, [daemonLive]);


  useEffect(() => {
    analytics.setUserId(
      amrLoginStatus?.loggedIn === true ? amrLoginStatus.user?.id ?? null : null,
    );
  }, [analytics.setUserId, amrLoginStatus]);


  const handleAmrLoginStatusChange = useCallback((status: VelaLoginStatus | null) => {
    if (status) setAmrLoginStatus(status);
    if (status?.loggedIn !== true) return;
    restartAmrPolling();
  }, [restartAmrPolling]);


  // Bootstrap — detect daemon, then fan out independent fetches so each
  // entry-view tab can render the moment its own data lands. Earlier this
  // was one Promise.all behind a global "Loading workspace…" placeholder,
  // which made the slowest endpoint (typically `/api/agents` on cold start)
  // gate every tab including the ones that don't need agents at all.
  useEffect(() => {
    let cancelled = false;
    const agentStreamAbort = new AbortController();
    (async () => {
      const alive = await daemonIsLive();
      if (cancelled) return;
      setDaemonLive(alive);
      if (!alive) {
        // No daemon — clear every loading flag so empty states render
        // instead of the entry view sitting on indefinite spinners.
        setAgentsLoading(false);
        setSkillsLoading(false);
        setDsLoading(false);
        setDaemonConfigLoaded(true);
        // Composio hydration also depends on the daemon. With no daemon
        // we just keep whatever localStorage already held; drop the
        // skeleton so the Settings → Connectors input reflects state.
        setComposioConfigLoading(false);
        return;
      }

      const agentRequestId = beginAgentStreamRequest();
      const isPixflowWpRuntime = hasPixflowWordPressContext();
      const shouldPreloadAgents = !isPixflowWpRuntime || (
        latestPersistedConfigRef.current.onboardingCompleted === true
        && latestPersistedConfigRef.current.mode === 'daemon'
      );
      if (shouldPreloadAgents) void fetchAgentsStream({
        signal: agentStreamAbort.signal,
        useOptionalBridge: isPixflowWpRuntime,
        onAgent: (agent) => {
          if (
            cancelled ||
            (!isPixflowWpRuntime && !isCurrentAgentStreamRequest(agentRequestId))
          ) return;
          setAgents((current) =>
            mergeAmrModelsIntoAgents(
              upsertAgent(current, agent),
              amrModelsRef.current,
            ),
          );
        },
      })
        .then((list) => {
          if (
            cancelled ||
            (!isPixflowWpRuntime && !isCurrentAgentStreamRequest(agentRequestId))
          ) return;
          if (isPixflowWpRuntime && list.length === 0) return;
          setAgents(
            mergeAmrModelsIntoAgents(
              orderAgentsByRegistry(list),
              amrModelsRef.current,
            ),
          );
        })
        .catch((err) => {
          if (
            cancelled ||
            isAbortError(err) ||
            (!isPixflowWpRuntime && !isCurrentAgentStreamRequest(agentRequestId))
          ) {
            return;
          }
          if (!isPixflowWpRuntime) setAgents([]);
        })
        .finally(() => {
          if (
            cancelled ||
            (!isPixflowWpRuntime && !isCurrentAgentStreamRequest(agentRequestId))
          ) return;
          setAgentsLoading(false);
        });
      else setAgentsLoading(false);

      // The compact Bricks floating panel uses the smaller Pixflow MCP
      // prompt-skill catalogue. The full `/od/skills` registry is workspace
      // and settings data, so hidden builder preload must not fetch it.
      if (isPixflowHiddenBuilderWorkspace()) {
        setSkillsLoading(false);
      } else {
        void fetchSkills()
          .then((list) => {
            if (cancelled) return;
            setSkills(list);
          })
          .catch(() => {
            if (cancelled) return;
            setSkills([]);
          })
          .finally(() => {
            if (cancelled) return;
            setSkillsLoading(false);
          });
      }

      // Daemon-persisted config + composio config + media provider config land
      // together so the welcome-modal decision and daemon-backed settings
      // apply in one merge, avoiding a flash where local-only state is shown
      // before daemon overrides it.
      void Promise.all([
        fetchDaemonConfig(),
        fetchPixflowOnboardingProfile(),
      ]).then(([daemonConfig, onboardingProfile]) => {
        if (cancelled) return;
        // Compute the next config outside the setConfig updater so we can
        // both (a) call navigate() after setConfig returns — calling it
        // inside the updater would trigger a Router setState during React's
        // render phase — and (b) read next.onboardingCompleted synchronously,
        // since React batches setConfig and the updater doesn't run until
        // the next render. latestPersistedConfigRef is kept in sync with
        // the rendered config and is safe to read here.
        const baseConfig = latestPersistedConfigRef.current;
        const next = clearStaleAmrModelChoiceOnProfileChange(
          baseConfig,
          applyPixflowOnboardingProfile(
            hasPixflowWordPressContext() ? mergeIncomingWordPressConfig(baseConfig, baseConfig, daemonConfig ?? {}) : mergeDaemonConfig(baseConfig, daemonConfig),
            onboardingProfile,
          ),
        );
        saveConfig(next);
        // Migrate localStorage prefs to daemon on first boot with the new
        // endpoint. If daemon already had values the merge above used them;
        // writing back is idempotent and keeps both sides in sync.
        if (!hasPixflowWordPressContext()) {
          void syncConfigToDaemon(next);
        }
        latestPersistedConfigRef.current = next;
        setConfig(next);

        // Route first-run users through the global onboarding panel.
        if (!next.onboardingCompleted) {
          navigate({ kind: 'home', view: 'onboarding' }, { replace: true });
        }
        setDaemonConfigLoaded(true);
        // Composio key hydration is part of this same daemon-config
        // fetch — by the time we land here the daemon has either
        // returned the saved-key shape (apiKeyConfigured + tail) or
        // it errored and we kept whatever localStorage held. Either
        // way it is safe to drop the skeleton.
      });
    })();
    return () => {
      cancelled = true;
      agentStreamAbort.abort();
    };
  }, [
    beginAgentStreamRequest,
    isCurrentAgentStreamRequest,
  ]);


  // Auto-pick the first available agent once both the daemon-stored config
  // and the agents listing have landed. Splitting this out of bootstrap
  // avoids racing the local-config initial value against a slow agents
  // probe — by the time this runs, daemonConfig has already overlaid the
  // user's previous choice, so we only fill an empty slot.
  //
  // First-run onboarding is the one time we must NOT do this: the onboarding
  // flow is the sole authority for the initial agent pick (AMR is the
  // recommended default there), and AMR (vela) detection is asynchronous. If
  // this fallback fires during onboarding while AMR is still being detected it
  // snaps the slot to the registry-first *detected* agent (Claude) and
  // persists it to the daemon, which then races and clobbers the user's AMR
  // selection on the next launch. Gate on onboardingCompleted so this only
  // backfills an empty slot for returning users.
  useEffect(() => {
    if (!daemonConfigLoaded || agentsLoading) return;
    if (config.onboardingCompleted !== true) return;
    if (config.agentId) return;
    const firstAvailable = agents.find((a) => a.available);
    if (!firstAvailable) return;
    setConfig((prev) => {
      if (prev.agentId) return prev;
      const next: AppConfig = { ...prev, agentId: firstAvailable.id };
      saveConfig(next);
      void syncConfigToDaemon(next);
      void syncPixflowOnboardingProfile(next, 'agent-auto');
      return next;
    });
  }, [
    daemonConfigLoaded,
    agentsLoading,
    agents,
    config.agentId,
    config.onboardingCompleted,
  ]);


  // Pixflow-owned: WP-first can receive app-config changes while the first
  // Local CLI probe is still resolving. If that leaves the shared workspace
  // agent state empty, hydrate it once from the optional bridge so settings,
  // the home composer, and the floating panel all read the same canonical
  // `agents` array.
  useEffect(() => {
    if (!hasPixflowWordPressContext()) return;
    if (config.mode !== 'daemon') return;
    if (agents.length > 0) return;
    if (agentsLoading) return;
    if (pixflowWpAgentHydrationAttemptedRef.current) return;
    pixflowWpAgentHydrationAttemptedRef.current = true;
    let cancelled = false;
    setAgentsLoading(true);
    void (async () => {
      const first = await fetchAgents({ useOptionalBridge: true });
      if (first.length > 0) return first;
      // Pixflow-owned: the optional bridge can be briefly busy during Bricks
      // startup. Do one forced retry so a transient health timeout does not
      // leave Local CLI surfaces stuck on "no CLI detected" until reload.
      return fetchAgents({ useOptionalBridge: true, force: true });
    })()
      .then((list) => {
        if (cancelled || list.length === 0) return;
        const ordered = orderAgentsByRegistry(list);
        setDaemonLive(true);
        setAgents(mergeAmrModelsIntoAgents(ordered, amrModelsRef.current));
      })
      .finally(() => {
        if (!cancelled) setAgentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agents.length, agentsLoading, config.mode]);


  // Auto-pick the default design system the same way — only after daemon
  // config has merged so we never overwrite a daemon-stored selection.
  // Pixflow-owned: the Bricks Agent preloader resolves the optional bridge
  // app-config and Local CLI inventory as soon as the builder shell loads.
  // Hydrate the main workspace from that same event so the workspace,
  // settings modal, and floating panel share one agent/model source of truth.
  useEffect(() => {
    if (!hasPixflowWordPressContext()) return;

    function onBricksAgentExecutionSettings(event: Event) {
      const detail = (event as CustomEvent<{
        config?: Partial<AppConfig>;
        agents?: AgentInfo[];
        daemonLive?: boolean;
        ready?: boolean;
      } | null>).detail;
      if (!detail || typeof detail !== 'object') return;

      if (Array.isArray(detail.agents) && detail.agents.length > 0) {
        const ordered = orderAgentsByRegistry(detail.agents);
        setAgents(mergeAmrModelsIntoAgents(ordered, amrModelsRef.current));
        setAgentsLoading(false);
      }

      if (detail.daemonLive || detail.ready || (Array.isArray(detail.agents) && detail.agents.length > 0)) {
        setDaemonLive(true);
      }

      if (detail.config && typeof detail.config === 'object') {
        setConfig((current) => {
          const next = clearStaleAmrModelChoiceOnProfileChange(
            current,
            mergeDaemonConfig(current, detail.config || {}),
          );
          latestPersistedConfigRef.current = next;
          saveConfig(next);
          return next;
        });
      }
    }

    window.addEventListener(
      PIXFLOW_BRICKS_AGENT_EXECUTION_SETTINGS_EVENT,
      onBricksAgentExecutionSettings as EventListener,
    );
    return () => {
      window.removeEventListener(
        PIXFLOW_BRICKS_AGENT_EXECUTION_SETTINGS_EVENT,
        onBricksAgentExecutionSettings as EventListener,
      );
    };
  }, []);


  useEffect(() => {
    if (!daemonConfigLoaded || dsLoading) return;
    if (config.designSystemId) return;
    if (designSystems.length === 0) return;
    const id =
      designSystems.find((d) => d.id === 'default')?.id ?? designSystems[0]!.id;
    setConfig((prev) => {
      if (prev.designSystemId) return prev;
      const next: AppConfig = { ...prev, designSystemId: id };
      saveConfig(next);
      void syncPixflowOnboardingProfile(next, 'design-system-auto');
      return next;
    });
  }, [
    daemonConfigLoaded,
    dsLoading,
    designSystems,
    config.designSystemId,
  ]);


  // One-shot self-healing migration for pets adopted before the
  // overlay learned atlas-row switching. If the stored pet is a
  // custom / codex pet whose imageUrl is a single-row strip
  // (no atlas), we silently re-download the full spritesheet so
  // hover, drag, and idle-ambient variety all light up on next render.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const upgraded = await migrateCustomPetAtlas(config);
      if (!upgraded || cancelled) return;
      setConfig((prev) => {
        if (!prev.pet) return prev;
        const next: AppConfig = {
          ...prev,
          pet: { ...prev.pet, custom: upgraded },
        };
        saveConfig(next);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // Snapshot the config at mount; migration is one-shot per session
    // and should not re-run every time config changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const refreshDesignSystems = useCallback(async () => {
    const list = await fetchDesignSystems();
    setDesignSystems(list);
  }, []);


  const refreshSkills = useCallback(async () => {
    const list = await fetchSkills();
    setSkills(list);
  }, []);


  const reloadMediaProvidersFromDaemon = useCallback(async () => {
    const result = await fetchMediaProvidersFromDaemon();
    if (result.status !== 'ok') {
      setDaemonMediaProvidersFetchState('error');
      setMediaProvidersNotice(
        t('settings.mediaProviderLoadError'),
      );
      return null;
    }
    setDaemonMediaProviders(result.providers);
    setDaemonMediaProvidersFetchState('ok');
    setMediaProvidersNotice(null);
    setConfig((prev) => {
      const merged = mergeDaemonMediaProviders(prev, result.providers);
      saveConfig(merged);
      return merged;
    });
    return result.providers;
  }, []);


  /**
   * Autosave-driven persistence path. The settings dialog calls this on
   * every committed edit (via a debounced effect) so localStorage and
   * WordPress stay in lock-step with the user's draft. We deliberately
   * do NOT touch the Composio secret here — it has its own gesture
   * (handleConfigPersistComposioKey) so partial keys never leave the
   * browser. Onboarding is also left alone; the dialog's close path
   * is the canonical "I'm done" signal.
   */
  const handleConfigPersist = useCallback(async (
    next: AppConfig,
    options?: { forceMediaProviderSync?: boolean },
  ) => {
    // Strip the in-flight Composio secret before anything hits disk so
    // a half-typed key can't survive in localStorage. If the dialog is
    // closing, preserve any onboarding completion that the close gesture
    // already committed so an unmount autosave cannot re-open the welcome flow.
    const persisted = buildPersistedConfig(next, configRef.current);
    const cliConfigChanged = hasPixflowCliConfigChange(persisted, configRef.current);
    latestPersistedConfigRef.current = persisted;
    saveConfig(persisted);
    setConfig(persisted);
    await Promise.all([
      cliConfigChanged ? syncConfigToDaemon(persisted) : Promise.resolve(),
      syncPixflowWordPressAppConfig(persisted),
      syncPixflowOnboardingProfile(persisted, 'settings'),
    ]);
  }, []);


  /**
   * Explicit Composio API-key save. Called from the section-local
   * "Save key" button so secrets never ride the autosave keystroke
   * loop. Once the daemon confirms, we normalize the saved config
   * (strip the secret, store apiKeyConfigured + apiKeyTail) and feed
   * it back into local state so the saved-key badge appears.
   */
  const handleConfigPersistComposioKey = useCallback(
    async (composio: AppConfig['composio']) => {
      const next = await persistComposioConfigChange(config, composio);
      setConfig((curr) => {
        const merged: AppConfig = { ...curr, composio: next.composio };
        saveConfig(merged);
        return merged;
      });
    },
    [config],
  );


  const flushQueuedCliConfigPersist = useCallback(() => {
    if (cliConfigPersistInFlightRef.current) return;
    const pending = cliConfigPersistLatestRef.current;
    if (!pending) return;
    cliConfigPersistLatestRef.current = null;
    cliConfigPersistInFlightRef.current = true;

    void (async () => {
      try {
        await syncConfigToDaemon(pending.next);
        await Promise.all([
          syncPixflowWordPressAppConfig(pending.next),
          syncPixflowOnboardingProfile(pending.next, pending.source),
        ]);
      } finally {
        cliConfigPersistInFlightRef.current = false;
        if (cliConfigPersistLatestRef.current) {
          cliConfigPersistTimerRef.current = window.setTimeout(() => {
            cliConfigPersistTimerRef.current = null;
            flushQueuedCliConfigPersist();
          }, 0);
        }
      }
    })();
  }, []);


  const persistCliConfigToBridgeAndWordPress = useCallback((next: AppConfig, source: string) => {
    cliConfigPersistLatestRef.current = { next, source };
    if (cliConfigPersistTimerRef.current !== null) {
      window.clearTimeout(cliConfigPersistTimerRef.current);
    }
    cliConfigPersistTimerRef.current = window.setTimeout(() => {
      cliConfigPersistTimerRef.current = null;
      flushQueuedCliConfigPersist();
    }, 150);
  }, [flushQueuedCliConfigPersist]);


  useEffect(() => () => {
    if (cliConfigPersistTimerRef.current !== null) {
      window.clearTimeout(cliConfigPersistTimerRef.current);
    }
  }, []);



  const persistConfigToWordPress = useCallback((next: AppConfig, source: string) => {
    void syncPixflowWordPressAppConfig(next);
    void syncPixflowOnboardingProfile(next, source);
  }, []);


  const handleModeChange = useCallback(
    (mode: AppConfig['mode']) => {
      const next: AppConfig = { ...config, mode, onboardingRoute: mode === 'api' ? 'byok' : 'local' };
      saveConfig(next);
      persistConfigToWordPress(next, 'execution-mode');
      setConfig(next);
    },
    [config, persistConfigToWordPress],
  );


  // Quick theme switch from the settings dropdown in the entry view.
  // Skips the full SettingsDialog round-trip so the appearance flip
  // feels instantaneous; the live preview comes for free because the
  // `useLayoutEffect` above re-runs `applyAppearanceToDocument` the
  // moment `config.theme` changes. We still persist to localStorage
  // and WordPress so the choice survives reloads. Theme-only changes do
  // not need the Local CLI bridge.
  const handleThemeChange = useCallback(
    (theme: AppConfig['theme']) => {
      const next = { ...config, theme };
      saveConfig(next);
      persistConfigToWordPress(next, 'theme');
      setConfig(next);
    },
    [config, persistConfigToWordPress],
  );


  const handleAgentChange = useCallback(
    (agentId: string) => {
      const next = { ...config, agentId };
      saveConfig(next);
      persistCliConfigToBridgeAndWordPress(next, 'agent');
      setConfig(next);
    },
    [config, persistCliConfigToBridgeAndWordPress],
  );


  const handleAgentModelChange = useCallback(
    (agentId: string, choice: AgentModelChoice) => {
      const prev = config.agentModels?.[agentId] ?? {};
      const merged = { ...prev, ...choice };
      const nextAgentModels = {
        ...(config.agentModels ?? {}),
        [agentId]: merged,
      };
      const next = { ...config, agentModels: nextAgentModels };
      saveConfig(next);
      persistCliConfigToBridgeAndWordPress(next, 'agent-model');
      setConfig(next);
    },
    [config, persistCliConfigToBridgeAndWordPress],
  );


  const selectedReadinessModel = config.agentId
    ? config.agentModels?.[config.agentId]?.model
    : undefined;

  const readinessBridgeStatusSignatureRef = useRef('');

  useEffect(() => {
    if (
      config.onboardingCompleted !== true
      ||
      config.mode !== 'daemon'
      || !config.agentId
      || (!daemonLive && !hasPixflowWordPressContext())
    ) return;
    const warm = (force = false) => {
      void warmSelectedAgentReadiness({
        mode: config.mode,
        agentId: config.agentId,
        model: selectedReadinessModel,
        force,
      }).then((readiness) => {
        if (readiness) setAgents((current) => upsertAgent(current, readiness.agent));
      });
    };
    const onFocus = () => warm();
    const onBridgeStatus = (event: Event) => {
      const status = (event as CustomEvent<unknown>).detail;
      const signature = agentReadinessBridgeStatusSignature(status);
      if (readinessBridgeStatusSignatureRef.current === signature) return;
      readinessBridgeStatusSignatureRef.current = signature;
      if (!bridgeStatusCanWarmAgentReadiness(status)) return;
      // A completed heartbeat site switch changes the authoritative WordPress
      // app config without remounting this workspace. Force one targeted probe
      // so the newly selected site/provider is ready before its next prompt.
      warm(true);
    };
    warm();
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onFocus);
    window.addEventListener('pixflow-design:wordpress-runtime-ready', onFocus);
    window.addEventListener('pixflow-design:bridge-status', onBridgeStatus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onFocus);
      window.removeEventListener('pixflow-design:wordpress-runtime-ready', onFocus);
      window.removeEventListener('pixflow-design:bridge-status', onBridgeStatus);
    };
  }, [config.agentId, config.mode, daemonLive, selectedReadinessModel]);


  // BYOK protocol switch — also flips `mode` to 'api' so the user does
  // not have to take a second step after picking a provider from the
  // inline switcher. The helper preserves any per-protocol fields the
  // user had previously configured for the target protocol.
  const handleApiProtocolChange = useCallback(
    (protocol: ApiProtocol) => {
      const next = switchApiProtocolConfig(config, protocol);
      saveConfig(next);
      persistConfigToWordPress(next, 'api-protocol');
      setConfig(next);
    },
    [config, persistConfigToWordPress],
  );


  // BYOK model picker — patches `model` (and the per-protocol shadow
  // copy) without touching apiKey/baseUrl so the user can swap models
  // mid-session without retyping their key.
  const handleApiModelChange = useCallback(
    (model: string) => {
      const next = updateCurrentApiProtocolConfig(config, { model });
      saveConfig(next);
      persistConfigToWordPress(next, 'api-model');
      setConfig(next);
    },
    [config, persistConfigToWordPress],
  );


  const handleChangeDefaultDesignSystem = useCallback(
    (designSystemId: string | null) => {
      const next = { ...config, designSystemId };
      saveConfig(next);
      persistConfigToWordPress(next, 'design-system');
      setConfig(next);
    },
    [config, persistConfigToWordPress],
  );


  const refreshAgents = useCallback(
    async (options?: {
      throwOnError?: boolean;
      agentCliEnv?: AppConfig['agentCliEnv'];
      useOptionalBridge?: boolean;
    }) => {
      if (options && Object.prototype.hasOwnProperty.call(options, 'agentCliEnv')) {
        const nextConfig = clearStaleAmrModelChoiceOnProfileChange(config, {
          ...config,
          agentCliEnv: options.agentCliEnv ?? {},
        });
        amrModelsRef.current = null;
        saveConfig(nextConfig);
        await syncConfigToDaemon(nextConfig);
        await syncPixflowOnboardingProfile(nextConfig, 'agent-cli-env');
        setConfig(nextConfig);
      }
      const agentRequestId = beginAgentStreamRequest();
      const isPixflowWpRuntime = hasPixflowWordPressContext();
      setAgentsLoading(true);
      try {
        const next = await fetchAgentsStream({
          useOptionalBridge: options?.useOptionalBridge,
          onAgent: (agent) => {
            if (!isPixflowWpRuntime && !isCurrentAgentStreamRequest(agentRequestId)) return;
            setAgents((current) =>
              mergeAmrModelsIntoAgents(
                upsertAgent(current, agent),
                amrModelsRef.current,
              ),
            );
          },
        });
        const ordered = orderAgentsByRegistry(next);
        if (isPixflowWpRuntime || isCurrentAgentStreamRequest(agentRequestId)) {
          if (!isPixflowWpRuntime || ordered.length > 0) {
            setAgents(mergeAmrModelsIntoAgents(ordered, amrModelsRef.current));
          }
          setAgentsLoading(false);
        }
        return ordered;
      } catch (err) {
        if (!isPixflowWpRuntime && !isCurrentAgentStreamRequest(agentRequestId)) return [];
        setAgentsLoading(false);
        if (options?.throwOnError) throw err;
        if (!isPixflowWpRuntime) setAgents([]);
        return [];
      }
    },
    [beginAgentStreamRequest, config, isCurrentAgentStreamRequest],
  );


  const executionSettingsScanAttempted = useRef(false);

  useEffect(() => {
    if (!settingsOpen) { executionSettingsScanAttempted.current = false; return; }
    if (!hasPixflowWordPressContext() || settingsInitialSection !== 'execution') return;
    if (agentsLoading || agents.length > 0 || executionSettingsScanAttempted.current) return;
    // Opening execution settings is an explicit discovery request, including
    // when BYOK is selected. Otherwise the disabled CLI tab cannot recover.
    executionSettingsScanAttempted.current = true;
    setAgentsLoading(true);
    void fetchAgents({ useOptionalBridge: true, force: true }).then(list => {
      if (list.length > 0) {
        setDaemonLive(true);
        setAgents(mergeAmrModelsIntoAgents(orderAgentsByRegistry(list), amrModelsRef.current));
      }
    }).catch(() => undefined).finally(() => setAgentsLoading(false));
  }, [agents.length, agentsLoading, settingsInitialSection, settingsOpen]);


  useEffect(() => {
    const applyConfigPayload = (payload: Partial<AppConfig> | null | undefined) => {
      if (!payload || typeof payload !== 'object') return false;
      const next = clearStaleAmrModelChoiceOnProfileChange(
        latestPersistedConfigRef.current,
        hasPixflowWordPressContext()
          ? mergeIncomingWordPressConfig(latestPersistedConfigRef.current, loadConfig(), payload)
          : mergeDaemonConfig(latestPersistedConfigRef.current, payload as AppConfig),
      );
      latestPersistedConfigRef.current = next;
      saveConfig(next);
      setConfig(next);
      amrModelsRef.current = null;
      restartAmrPolling();
      void refreshAgents();
      return true;
    };

    const handleAppConfigChanged = (event?: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as Partial<AppConfig> | null : null;
      if (applyConfigPayload(detail)) return;
      if (hasPixflowWordPressContext()) return;

      void fetchDaemonConfig().then((daemonConfig) => {
        applyConfigPayload(daemonConfig as Partial<AppConfig>);
      });
    };
    const handleBricksExtensionConfigChanged = (event: Event) => {
      const detail = event instanceof CustomEvent
        ? event.detail as { bricksExtensions?: AppConfig['bricksExtensions'] } | null
        : null;
      if (!detail || typeof detail !== 'object' || !detail.bricksExtensions) return;

      // The template insert endpoint is authoritative for dependency-driven
      // module activation. Merge that response into the mounted workspace
      // state immediately so an already-open settings modal reflects the new
      // GSAP/Splide switches and cannot later autosave a stale disabled copy.
      applyConfigPayload({ bricksExtensions: detail.bricksExtensions });
    };
    window.addEventListener(APP_CONFIG_CHANGED_EVENT, handleAppConfigChanged);
    window.addEventListener(BRICKS_EXTENSION_CONFIG_CHANGED_EVENT, handleBricksExtensionConfigChanged);
    const handleParentConfigChanged = (event: MessageEvent) => {
      const site = getPixflowWordPressConfig();
      if (!isTrustedPixflowParentMessage(event, window, site?.siteOrigin || site?.siteUrl || site?.restBaseUrl)) return;
      const data = event.data as { source?: string; type?: string; config?: Partial<AppConfig> } | null;
      if (!data || data.source !== 'pixflow-design-builder' || data.type !== 'pixflow-design:app-config-changed') {
        return;
      }
      if (!applyConfigPayload(data.config)) {
        handleAppConfigChanged();
      }
    };
    window.addEventListener('message', handleParentConfigChanged);
    const unsubscribeSharedConfig = subscribePixflowSharedAppConfigNotifications((notification) => {
      applyConfigPayload(notification.patch as unknown as Partial<AppConfig>);
    });
    return () => {
      window.removeEventListener(APP_CONFIG_CHANGED_EVENT, handleAppConfigChanged);
      window.removeEventListener(BRICKS_EXTENSION_CONFIG_CHANGED_EVENT, handleBricksExtensionConfigChanged);
      window.removeEventListener('message', handleParentConfigChanged);
      unsubscribeSharedConfig();
    };
  }, [refreshAgents, restartAmrPolling]);


  useEffect(() => {
    const handlePixflowShellMessage = (event: MessageEvent) => {
      const site = getPixflowWordPressConfig();
      const sameWindow = event.source === window && event.origin === window.location.origin;
      if (!sameWindow && !isTrustedPixflowParentMessage(event, window, site?.siteOrigin || site?.siteUrl || site?.restBaseUrl)) return;
      const data = event.data as {
        source?: unknown;
        projectId?: unknown;
        conversationId?: unknown;
        type?: unknown;
        open?: unknown;
        section?: unknown;
        theme?: unknown;
        tool?: unknown;
      } | null;
      if (!data || data.source !== 'pixflow-design-shell') return;
      if (data.type === 'pixflow-design:open-template-library') {
        pendingTemplateLibrary.current = true;
        setPixflowWorkspaceCatalogVisible(true);
        workspaceActionsRef.current?.openTemplateLibrary();
      }
      if (data.type === 'pixflow-design:workspace-visibility') {
        setPixflowWorkspaceCatalogVisible(data.open === true || data.open === 'true');
      }
      if (data.type === 'pixflow-design:open-saved-conversation' && typeof data.projectId === 'string' && typeof data.conversationId === 'string') {
        setToolbarWorkspaceTool(null);
        setSettingsOpen(false);
        navigate({ kind: 'project', projectId: data.projectId, conversationId: data.conversationId, fileName: null });
      }
      if (
        data.type === 'pixflow-design:change-theme'
        && (data.theme === 'system' || data.theme === 'light' || data.theme === 'dark')
      ) {
        handleThemeChange(data.theme);
      }
      if (data.type === 'pixflow-design:open-settings') {
        setToolbarWorkspaceTool('settings');
        setSettingsWelcome(false);
        setSettingsInitialSection(data.section === 'resourcePacks' ? 'resourcePacks' : data.section === 'dictation' ? 'dictation' : 'execution');
        setSettingsHighlight(null);
        setSettingsOpen(true);
      }
      if (data.type === 'pixflow-design:open-workspace-tool') {
        setSettingsWelcome(false);
        setSettingsHighlight(null);
        if (data.tool === 'google-fonts') {
          setToolbarWorkspaceTool('google-fonts');
          setSettingsInitialSection('googleFonts');
          setPendingWorkspaceTool('google-fonts');
          setSettingsOpen(true);
        } else if (data.tool === 'icon-sets') {
          setToolbarWorkspaceTool('icon-sets');
          setSettingsInitialSection('iconPacks');
          setPendingWorkspaceTool(null);
          setSettingsOpen(true);
        } else if (data.tool === 'design-system') {
          setToolbarWorkspaceTool('design-system');
          setSettingsInitialSection('designSystems');
          setPendingWorkspaceTool(null);
          setSettingsOpen(true);
        } else if (data.tool === 'sitemap' || data.tool === 'design-systems') {
          setToolbarWorkspaceTool(null);
          setPendingWorkspaceTool(null);
          setSettingsOpen(false);
          navigate({ kind: 'home', view: data.tool === 'sitemap' ? 'sitemap' : 'design-systems' });
        }
      }
      if (data.type === 'pixflow-design:close-workspace-tool') {
        setToolbarWorkspaceTool(null);
        setPendingWorkspaceTool(null);
        setSettingsOpen(false);
      }
    };

    window.addEventListener('message', handlePixflowShellMessage);
    window.postMessage({ source: 'pixflow-design', type: 'pixflow-design:workspace-ready' }, window.location.origin);
    return () => window.removeEventListener('message', handlePixflowShellMessage);
  }, [handleThemeChange]);


  useEffect(() => {
    if (!settingsOpen || !pendingWorkspaceTool) return;
    const eventName = pendingWorkspaceTool === 'google-fonts'
      ? 'pixflow-design:open-google-fonts'
      : 'pixflow-design:open-framework-design-system';
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent(eventName));
      setPendingWorkspaceTool(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingWorkspaceTool, settingsOpen]);


  useEffect(() => {
    const closeToolbarTool = (event: Event) => {
      const detail = (event as CustomEvent<{ tool?: unknown }>).detail;
      if (!toolbarWorkspaceTool || detail?.tool !== toolbarWorkspaceTool) return;
      setToolbarWorkspaceTool(null);
      setPendingWorkspaceTool(null);
      setSettingsOpen(false);
      window.postMessage({
        source: 'pixflow-design',
        type: 'pixflow-design:workspace-tool-closed',
      }, window.location.origin);
    };
    window.addEventListener('pixflow-design:workspace-tool-modal-closed', closeToolbarTool as EventListener);
    return () => window.removeEventListener('pixflow-design:workspace-tool-modal-closed', closeToolbarTool as EventListener);
  }, [toolbarWorkspaceTool]);


  const openSettings = useCallback((
    section: SettingsSection = 'execution',
    opts?: { highlight?: SettingsHighlight },
  ) => {
    setSettingsWelcome(false);
    setSettingsInitialSection(section);
    setSettingsHighlight(opts?.highlight ?? null);
    setSettingsOpen(true);
  }, []);


  // Entry point from the failed-run AMR nudge: open Settings on the execution
  // section and flag the AMR agent card for a one-shot scroll-into-view +
  // highlight (and a sign-in coachmark when not yet authorized).
  const openAmrSettings = useCallback(() => {
    openSettings('execution', { highlight: 'amr' });
  }, [openSettings]);


  const openPetSettings = useCallback(() => {
    setSettingsWelcome(false);
    setSettingsInitialSection('pet');
    setSettingsOpen(true);
  }, []);


  const openMcpSettings = useCallback(() => {
    openSettings('mcpClient');
  }, [openSettings]);


  // The composer "+" menu's "add plugin" / "add connector" rows route to the
  // home plugin-registry / connector-integration surfaces.
  const openPluginRegistry = useCallback(() => {
    navigate({ kind: 'home', view: 'plugins' });
  }, []);


  const openConnectorIntegrations = useCallback(() => {
    openSettings('composio');
  }, [openSettings]);


  const handleCompleteOnboarding = useCallback(async () => {
    const current = latestPersistedConfigRef.current;
    if (current.onboardingCompleted) return;
    const next: AppConfig = { ...current, onboardingCompleted: true };
    // Wait for both persistence paths before leaving onboarding. The profile
    // is authoritative, while the app-config marker lets older/partially
    // migrated installs recover completion if a browser refresh interrupts
    // the user-profile request.
    await syncPixflowWordPressAppConfig(next);
    await syncPixflowOnboardingProfile(next, 'onboarding-complete');
    latestPersistedConfigRef.current = next;
    saveConfig(next);
    setConfig(next);
  }, []);


  const handleResetOnboarding = useCallback(async () => {
    await resetPixflowOnboardingProfile();
    const current = latestPersistedConfigRef.current;
    const next: AppConfig = { ...current, onboardingCompleted: false };
    latestPersistedConfigRef.current = next;
    saveConfig(next);
    setConfig(next);
    setSettingsOpen(false);
    setSettingsHighlight(null);
    if (toolbarWorkspaceTool) {
      setToolbarWorkspaceTool(null);
      window.postMessage({
        source: 'pixflow-design',
        type: 'pixflow-design:workspace-tool-closed',
      }, window.location.origin);
    }
    navigate({ kind: 'home', view: 'onboarding' }, { replace: true });
  }, [toolbarWorkspaceTool]);


  // Cmd+, (mac) / Ctrl+, (win/linux) opens Settings. Capture phase so we
  // beat the browser's default Preferences dialog. Platform-gated so
  // meta/ctrl don't conflict across OS.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const primary = isMacPlatform() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (primary && !e.shiftKey && !e.altKey && e.key === ',') {
        if (e.isComposing) return;
        e.preventDefault();
        openSettings();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [openSettings]);

  const showPixflowLicenseGate =
    config.onboardingCompleted === true
    && pixflowLicenseStatus?.requires_license === true
    && pixflowLicenseStatus.license.valid !== true;

  // Do not let the Bridge notice race the WordPress license gate while the
  // site-scoped license request is still pending. Desktop has no WordPress
  // license boundary, so it can evaluate the Bridge as soon as its status is
  // available.
  const pixflowLicenseAllowsBridgeGate = !isPixflowWordPressEmbed()
    ? true
    : pixflowLicenseStatus !== null
      && (pixflowLicenseStatus.requires_license !== true || pixflowLicenseStatus.license.valid === true);

  const pixflowBridgeUpdateState = usePixflowBridgeUpdateState({
    active: pixflowWorkspaceCatalogVisible,
    enabled: pixflowLicenseAllowsBridgeGate && (workspaceAllowed || workspaceSetup),
    mode: config.mode,
    installedVersion: isPixflowWordPressEmbed() ? undefined : appVersionInfo?.version,
  });
  const refreshProjects = useCallback(async () => { await workspaceActionsRef.current?.refreshProjects(); }, []);
  const handleSkillsChanged = useCallback((id?: string) => {
    if (workspaceActionsRef.current) workspaceActionsRef.current.skillsChanged(id);
    else void refreshSkills();
  }, [refreshSkills]);
  const handleDesignSystemsChanged = useCallback((id?: string) => {
    if (workspaceActionsRef.current) workspaceActionsRef.current.designSystemsChanged(id);
    else void refreshDesignSystems();
  }, [refreshDesignSystems]);
  const pendingDesignSystemJobs = useRef<Record<string, DesignSystemGenerationJob>>({});
  const handleDesignSystemImportRebuildJob = useCallback((id: string, job: DesignSystemGenerationJob) => {
    if (workspaceActionsRef.current) workspaceActionsRef.current.designSystemJob(id, job);
    else pendingDesignSystemJobs.current[id] = job;
  }, []);

  return {
    translateUi,
    config,
    setConfig,
    latestPersistedConfigRef,
    settingsOpen,
    setSettingsOpen,
    settingsWelcome,
    settingsInitialSection,
    settingsHighlight,
    setSettingsHighlight,
    toolbarWorkspaceTool,
    setToolbarWorkspaceTool,
    daemonLive,
    agents,
    providerModelsCache,
    setProviderModelsCache,
    pixflowLicenseStatus,
    setPixflowLicenseStatus,
    appVersionInfo,
    daemonMediaProviders,
    daemonMediaProvidersFetchState,
    mediaProvidersNotice,
    agentsLoading,
    composioConfigLoading,
    workspaceSetup,
    handleAmrLoginStatusChange,
    refreshDesignSystems,
    refreshSkills,
    reloadMediaProvidersFromDaemon,
    handleConfigPersist,
    handleConfigPersistComposioKey,
    persistConfigToWordPress,
    handleModeChange,
    handleAgentChange,
    handleAgentModelChange,
    handleApiProtocolChange,
    handleApiModelChange,
    refreshAgents,
    openSettings,
    handleCompleteOnboarding,
    handleResetOnboarding,
    showPixflowLicenseGate,
    pixflowBridgeUpdateState,
    refreshProjects,
    handleSkillsChanged,
    handleDesignSystemsChanged,
    handleDesignSystemImportRebuildJob,
    settingsPortal,
    t,
    skills,
    setSkills,
    designSystems,
    setDesignSystems,
    setAppVersionInfo,
    skillsLoading,
    setSkillsLoading,
    dsLoading,
    setDsLoading,
    daemonConfigLoaded,
    setComposioConfigLoading,
    pixflowWorkspaceCatalogVisible,
    route,
    workspaceAllowed,
    analytics,
    handleThemeChange,
    handleChangeDefaultDesignSystem,
    openAmrSettings,
    openPetSettings,
    openMcpSettings,
    openPluginRegistry,
    openConnectorIntegrations,
    clientType,
    workspaceActionsRef,
    pendingDesignSystemJobs,
    pendingTemplateLibrary
  };
}
export type WorkspaceHostContext = ReturnType<typeof useAppController>;
function AppInner(props: AppProps) {
  const host = useAppController(props);
  const {
    translateUi,
    config,
    setConfig,
    latestPersistedConfigRef,
    settingsOpen,
    setSettingsOpen,
    settingsWelcome,
    settingsInitialSection,
    settingsHighlight,
    setSettingsHighlight,
    toolbarWorkspaceTool,
    setToolbarWorkspaceTool,
    daemonLive,
    agents,
    providerModelsCache,
    setProviderModelsCache,
    pixflowLicenseStatus,
    setPixflowLicenseStatus,
    appVersionInfo,
    daemonMediaProviders,
    daemonMediaProvidersFetchState,
    mediaProvidersNotice,
    agentsLoading,
    composioConfigLoading,
    workspaceSetup,
    handleAmrLoginStatusChange,
    refreshDesignSystems,
    refreshSkills,
    reloadMediaProvidersFromDaemon,
    handleConfigPersist,
    handleConfigPersistComposioKey,
    persistConfigToWordPress,
    handleModeChange,
    handleAgentChange,
    handleAgentModelChange,
    handleApiProtocolChange,
    handleApiModelChange,
    refreshAgents,
    openSettings,
    handleCompleteOnboarding,
    handleResetOnboarding,
    showPixflowLicenseGate,
    pixflowBridgeUpdateState,
    refreshProjects,
    handleSkillsChanged,
    handleDesignSystemsChanged,
    handleDesignSystemImportRebuildJob,
    settingsPortal
  } = host;
  return (<>
    <PixflowBridgeUpdateProvider required={pixflowBridgeUpdateState.required}>
      {workspaceSetup ? <div className="workspace-shell workspace-shell--onboarding"><div className="workspace-shell__body"><div className="entry-shell entry-shell--no-header entry-shell--onboarding"><main className="entry-onboarding-modal" aria-label={translateUi('settings.welcomeTitle')}><OnboardingView
        config={config} agents={agents} daemonLive={daemonLive}
        providerModelsCache={providerModelsCache} onProviderModelsCacheChange={setProviderModelsCache}
        onModeChange={handleModeChange} onAgentChange={handleAgentChange} onAgentModelChange={handleAgentModelChange}
        onApiProtocolChange={handleApiProtocolChange} onApiModelChange={handleApiModelChange}
        onConfigPersist={handleConfigPersist} onRefreshAgents={refreshAgents}
        onFinish={async () => { await handleCompleteOnboarding(); navigate({ kind: 'home', view: 'home' }); }}
        pixflowLicenseStatus={pixflowLicenseStatus} onPixflowLicenseStatusChange={setPixflowLicenseStatus}
      /></main></div></div></div> : <WorkspaceContribution host={host} />}
    </PixflowBridgeUpdateProvider>
      <TooltipLayer />
      <AnimatePresence>
      {settingsOpen ? (
        <SettingsDialog
          portalToBody={settingsPortal}
          initial={config}
          agents={agents}
          agentsLoading={agentsLoading}
          daemonLive={daemonLive}
          appVersionInfo={appVersionInfo}
          welcome={settingsWelcome}
          initialSection={settingsInitialSection}
          openManualDesignSystem={toolbarWorkspaceTool === 'design-system'}
          initialHighlight={settingsHighlight}
          composioConfigLoading={composioConfigLoading}
          onPersist={handleConfigPersist}
          onPersistComposioKey={handleConfigPersistComposioKey}
          onClose={() => {
            // Closing settings preserves setup progress; only the setup
            // completion action marks onboarding complete.
            const next = resolveSettingsCloseConfig(config, latestPersistedConfigRef.current);
            if (!next.onboardingCompleted || !config.onboardingCompleted) {
              latestPersistedConfigRef.current = next;
              saveConfig(next);
              persistConfigToWordPress(next, 'settings-close');
              setConfig(next);
            }
            setSettingsOpen(false);
            setSettingsHighlight(null);
            if (toolbarWorkspaceTool) {
              setToolbarWorkspaceTool(null);
              window.postMessage({
                source: 'pixflow-design',
                type: 'pixflow-design:workspace-tool-closed',
              }, window.location.origin);
            }
          }}
          onResetOnboarding={handleResetOnboarding}
          onRefreshAgents={refreshAgents}
          onAmrLoginStatusChange={handleAmrLoginStatusChange}
          onSkillsRefresh={refreshSkills}
          pixflowLicenseStatus={pixflowLicenseStatus}
          onPixflowLicenseStatusChange={setPixflowLicenseStatus}
          onResourcePacksChanged={() => Promise.all([
            refreshSkills().catch(() => undefined),
            refreshDesignSystems().catch(() => undefined),
          ]).then(() => undefined)}
          daemonMediaProviders={daemonMediaProviders}
          daemonMediaProvidersFetchState={daemonMediaProvidersFetchState}
          mediaProvidersNotice={mediaProvidersNotice}
          onReloadMediaProviders={reloadMediaProvidersFromDaemon}
          onProjectsRefresh={refreshProjects}
          onSkillsChanged={handleSkillsChanged}
          onDesignSystemsChanged={handleDesignSystemsChanged}
          onDesignSystemImportRebuildJob={handleDesignSystemImportRebuildJob}
          providerModelsCache={providerModelsCache}
          onProviderModelsCacheChange={setProviderModelsCache}
        />
      ) : null}
      </AnimatePresence>
      {showPixflowLicenseGate ? (
        <PixflowGateModalBackdrop theme={config.theme}>
          <div
            className="pixflow-license-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pixflow-license-modal-title"
          >
            <h2 id="pixflow-license-modal-title">{translateUi("ui.app.licenseRequired")}</h2>
            <PixflowLicensePanel
              mode="modal"
              status={pixflowLicenseStatus}
              onStatusChange={setPixflowLicenseStatus}
            />
          </div>
        </PixflowGateModalBackdrop>
      ) : null}
      <MemoryToast onOpenMemory={() => openSettings('memory')} />
    </>
  );
}
