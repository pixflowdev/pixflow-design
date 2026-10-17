import { AvatarMenu } from './AvatarMenu';
import type { WorkspaceCreateHandoff } from './workspace-first-turn';
import { PixflowResourcesSection } from './PixflowResourcesSection';
// EntryShell — the centered-hero entry layout.
//
// This component owns the entire JSX render and local UI state for
// the redesigned home view (left rail + sticky settings cog + hero +
// recent projects + plugins section + new-project modal). It is
// intentionally a sibling of `EntryView` so that upstream `main`
// changes to `EntryView` (props, connector lifecycle, helpers, exports)
// can be rebased without touching this file. `EntryView` becomes a
// thin wrapper that passes data and callbacks through to this shell.
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { defaultScenarioPluginIdForProjectMetadata, type ChatSessionMode, type ConnectorDetail, type InstalledPluginRecord } from '@open-design/contracts';
import type { OpenDesignHostProjectImportSuccess } from '@open-design/host';
import { useAnalytics } from '../analytics/provider';
import { trackHomeNavClick, trackHomeToolbarClick } from '../analytics/events';
import { useT } from '../i18n';
import { navigate, useRoute } from '../router';
import type { AgentInfo, ApiProtocol, AppConfig, AppTheme, DesignSystemSummary, ExecMode, Project, ProjectMetadata, ProjectTemplate, PromptTemplateSummary, SkillSummary } from '../types';
import { CenteredLoader } from './Loading';
import { DesignsTab } from './DesignsTab';
import { DesignSystemPreviewModal } from './DesignSystemPreviewModal';
import { DesignSystemsTab } from './DesignSystemsTab';
import { EntryNavRail, type EntryView as EntryViewKind } from './EntryNavRail';
import { UpdaterPopup } from './UpdaterPopup';
import { HomeView } from './HomeView';
import { createPluginAuthoringHandoff, createPluginUseHandoff, type HomePromptHandoff } from './home-hero/plugin-authoring';
import type { PluginUseAction } from './plugins-home/useActions';
import { Icon } from './Icon';
import { InlineModelSwitcher } from './InlineModelSwitcher';
import { MediaView } from './MediaView';
import { SitemapView } from './sitemap/SitemapView';
import { EntrySettingsMenu, type EntrySettingsSection } from './EntrySettingsMenu';
import { NewProjectModal } from './NewProjectModal';
import { PluginsView } from './PluginsView';
import type { CreateInput, CreateTab, ImportClaudeDesignOutcome } from './NewProjectPanel';
import type { PluginLoopSubmit } from './PluginLoopHome';
import type { PluginShareAction, PluginShareProjectOutcome } from '../state/projects';
import { AnimatePresence } from 'motion/react';
import { smoothScrollToTop } from '../utils/smoothScrollToTop';
import { type ProviderModelsCache } from './providerModelsCache';
import type { PixflowLicenseStatus } from '../pixflow/license';
import { hasPixflowWordPressContext } from '../pixflow/wordpress-context';
import { buildWebsiteCloneBricksHomeForward } from '../pixflow/website-clone';
import { OnboardingView } from './OnboardingView';
export { PIXFLOW_LOCAL_CLI_ONBOARDING_COPY, PIXFLOW_BYOK_ONBOARDING_NOTICE, canContinueOnboardingConnect, OnboardingDropdown } from './OnboardingView';

// Persist the entry nav-rail open/collapsed state so it survives both a
// home -> project -> home navigation (EntryShell unmounts on the project
// route) and a full reload. Without this the rail always reset to its
// collapsed default on return.
const RAIL_OPEN_STORAGE_KEY = 'od.entry.railOpen';

function readStoredRailOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(RAIL_OPEN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeStoredRailOpen(open: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RAIL_OPEN_STORAGE_KEY, open ? 'true' : 'false');
  } catch {
    /* ignore quota / disabled storage */
  }
}



// Pixflow-owned: OD social CTAs are removed from the fork; this topbar keeps
// only the execution switcher beside the Pixflow settings controls.

// Default scenario plugin for each project kind/intent. The mapping
// lives in `@open-design/contracts` so the daemon's `/api/projects`
// and `/api/runs` fallbacks resolve to the same plugin id when no
// `pluginId` is on the request body — plan §3.3 of
// `specs/current/plugin-driven-flow-plan.md`.
// Newsletter signup endpoint. Lives on the marketing site (Cloudflare Pages
// Function backed by KV), so this is a cross-origin POST from the desktop
// client. Overridable at build time via NEXT_PUBLIC_NEWSLETTER_URL — e.g. point
// it at a local `wrangler pages dev` instance during development.
const NEWSLETTER_SUBSCRIBE_URL =
  // Pixflow-owned: FluentCRM webhook for first-run newsletter signup.
  process.env.NEXT_PUBLIC_NEWSLETTER_URL
  ?? 'https://pixflow.dev/?fluentcrm=1&route=contact&hash=62f0f228-759f-4d94-9037-e0594d6c777f';
const NEWSLETTER_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function defaultPluginIdForMetadata(metadata: ProjectMetadata): string | null {
  // Pixflow-owned: direct HTML-to-Bricks imports must not bind the default
  // generation router. The uploaded HTML becomes the handoff source instead.
  if ((metadata as ProjectMetadata & { pixflowHtmlToBricks?: boolean }).pixflowHtmlToBricks === true) {
    return null;
  }
  if (
    (metadata as ProjectMetadata & { pixflowBricksNativePrototype?: boolean }).pixflowBricksNativePrototype === true ||
    String((metadata as ProjectMetadata & { intent?: string }).intent || '') === 'pixflow_bricks_native_prototype'
  ) {
    return null;
  }
  return defaultScenarioPluginIdForProjectMetadata(metadata);
}

function defaultPluginInputsForCreate(
  input: CreateInput,
  pluginId: string | null,
): Record<string, unknown> | null {
  const kind = input.metadata.kind;
  const projectName = input.name.trim();

  if (pluginId === 'example-web-prototype') {
    return {
      artifactKind: input.metadata.includeLandingPage
        ? 'landing page'
        : 'web prototype',
      fidelity: input.metadata.fidelity ?? 'high-fidelity',
      audience: 'product evaluators',
      designSystem: 'the active project design system',
      template: input.metadata.templateLabel ?? 'the bundled web prototype seed',
    };
  }

  if (pluginId === 'example-simple-deck') {
    return {
      deckType: 'pitch deck',
      topic: projectName || 'the user brief',
      audience: 'decision makers',
      slideCount: '10-15 pages',
      speakerNotes: input.metadata.speakerNotes
        ? 'include speaker notes'
        : 'no speaker notes',
      designSystem: 'the active project design system',
    };
  }

  if (pluginId === 'od-new-generation') {
    const templateLabel = input.metadata.templateLabel?.trim();
    const artifactKind =
      kind === 'template'
        ? 'artifact based on a saved template'
        : kind === 'other'
          ? 'custom design artifact'
          : `${kind} artifact`;
    return {
      artifactKind,
      audience: 'product and design reviewers',
      topic: templateLabel || projectName || 'the user brief',
    };
  }

  if (pluginId !== 'od-media-generation') return null;
  if (kind !== 'image' && kind !== 'video' && kind !== 'audio') return null;

  const promptTemplate = input.metadata.promptTemplate;
  const subject =
    promptTemplate?.prompt?.trim()
    || projectName
    || promptTemplate?.title?.trim()
    || `${kind} concept`;
  const style =
    promptTemplate?.summary?.trim()
    || 'cinematic, high-quality, on-brand';
  const aspect =
    kind === 'image'
      ? input.metadata.imageAspect
      : kind === 'video'
        ? input.metadata.videoAspect
        : undefined;

  return {
    mediaKind: kind,
    subject,
    style,
    ...(aspect ? { aspect } : {}),
  };
}

interface Props {
  skills: SkillSummary[];
  onSkillsRefresh?: () => Promise<void>;
  designSystems: DesignSystemSummary[];
  projects: Project[];
  templates: ProjectTemplate[];
  onDeleteTemplate?: (id: string) => Promise<boolean>;
  promptTemplates: PromptTemplateSummary[];
  catalogLoadAllowed?: boolean;
  defaultDesignSystemId: string | null;
  connectors: ConnectorDetail[];
  connectorsLoading: boolean;
  skillsLoading?: boolean;
  designSystemsLoading?: boolean;
  projectsLoading?: boolean;
  // Execution / model-switching context. Threaded down from `App` so the
  // top-bar `InlineModelSwitcher` can render the active mode/agent/model
  // and persist changes through the same callbacks the project view uses.
  config: AppConfig;
  providerModelsCache?: ProviderModelsCache;
  onProviderModelsCacheChange?: Dispatch<SetStateAction<ProviderModelsCache>>;
  agents: AgentInfo[];
  // True while the cold-start agent detection stream is still in flight
  // (`fetchAgentsStream` has not reached its terminal `done`). Onboarding
  // uses this to show the AMR cloud card in a detecting/skeleton state
  // instead of hiding it during the seconds AMR's probe takes to settle.
  agentsLoading?: boolean;
  daemonLive: boolean;
  onModeChange: (mode: ExecMode) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: { model?: string; reasoning?: string; fastMode?: boolean },
  ) => void;
  onApiProtocolChange: (protocol: ApiProtocol) => void;
  onApiModelChange: (model: string) => void;
  onConfigPersist: (cfg: AppConfig) => Promise<void> | void;
  onRefreshAgents: (options?: { useOptionalBridge?: boolean }) => Promise<AgentInfo[]> | AgentInfo[];
  // Quick theme switch from the avatar-popover dropdown. Lets the user
  // flip between system / light / dark without opening the full Settings
  // dialog. App owns persistence; this component just calls the callback.
  onThemeChange: (theme: AppTheme) => void;
  onCreateProject: (
    input: CreateInput & WorkspaceCreateHandoff & {
      pendingPrompt?: string;
      pluginId?: string;
      appliedPluginSnapshotId?: string;
      pluginInputs?: Record<string, unknown>;
      skipDiscoveryBrief?: boolean;
      conversationMode?: ChatSessionMode;
      autoSendFirstMessage?: boolean;
      pendingFiles?: File[];
    },
  ) => Promise<boolean> | boolean | void;
  onCreatePluginShareProject: (
    pluginId: string,
    action: PluginShareAction,
    locale?: string,
  ) => Promise<PluginShareProjectOutcome>;
  onImportClaudeDesign: (
    file: File,
  ) => Promise<ImportClaudeDesignOutcome | void> | ImportClaudeDesignOutcome | void;
  onImportFolder?: (baseDir: string) => Promise<void> | void;
  onImportFolderResponse?: (response: OpenDesignHostProjectImportSuccess) => Promise<void> | void;
  onOpenProject: (id: string) => void;
  onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (id: string) => Promise<boolean | void> | boolean | void;
  onRenameProject: (id: string, name: string) => void;
  onChangeDefaultDesignSystem: (id: string) => void;
  onCreateDesignSystem?: () => void;
  // NOTE: first-run onboarding intentionally no longer hosts guided
  // design-system creation. The previous step-3 design-system surface was
  // replaced by the newsletter step, so EntryShell deliberately does not
  // accept a `renderDesignSystemCreation` renderer. Guided creation stays
  // reachable from the standalone `design-system-create` route and the
  // Design Systems tab; do not re-thread an onboarding renderer here.
  onOpenDesignSystem?: (id: string) => void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
  onOpenSettings: (section?: EntrySettingsSection) => void;
  onCompleteOnboarding: () => void | Promise<void>;
  pixflowLicenseStatus?: PixflowLicenseStatus | null;
  onPixflowLicenseStatusChange?: (status: PixflowLicenseStatus) => void;
}

// Map an EntryNavRail view id to the analytics `element` enum on
// `home/nav` ui_click. Returns `null` for views without a dedicated nav
// button (the rail's "Home" target is the brand logo, which gets its own
// element value via the logo click handler — not the changeView path).
function navElementForView(
  next: EntryViewKind,
):
  | 'home'
  | 'projects'
  | 'plugins'
  | 'design_systems'
  | null {
  switch (next) {
    case 'home':
      return 'home';
    case 'projects':
      return 'projects';
    case 'media':
      return null;
    case 'plugins':
      return 'plugins';
    case 'design-systems':
      return 'design_systems';
    default:
      return null;
  }
}

// Tab views stay mounted (so previews/thumbnails survive a tab switch) but the
// inactive ones must leave layout, the accessibility tree, and tab order.
// `content-visibility: hidden` still reserves the hidden pane's block size,
// which pushes later sidebar destinations far below the sticky topbar.
function inactiveViewProps(active: boolean) {
  return {
    style: active ? undefined : ({ display: 'none' } as const),
    inert: !active,
    'aria-hidden': !active,
  };
}

export function EntryShell({
  skills,
  onSkillsRefresh,
  designSystems,
  projects,
  templates,
  onDeleteTemplate,
  promptTemplates,
  catalogLoadAllowed = true,
  defaultDesignSystemId,
  connectors,
  connectorsLoading,
  skillsLoading = false,
  designSystemsLoading = false,
  projectsLoading = false,
  config,
  providerModelsCache: sharedProviderModelsCache,
  onProviderModelsCacheChange,
  agents,
  agentsLoading = false,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiProtocolChange,
  onApiModelChange,
  onConfigPersist,
  onRefreshAgents,
  onThemeChange,
  onCreateProject,
  onCreatePluginShareProject,
  onImportClaudeDesign,
  onImportFolder,
  onImportFolderResponse,
  onOpenProject,
  onOpenLiveArtifact,
  onDeleteProject,
  onRenameProject,
  onChangeDefaultDesignSystem,
  onCreateDesignSystem,
  onOpenDesignSystem,
  onDesignSystemsRefresh,
  onOpenSettings,
  onCompleteOnboarding,
  pixflowLicenseStatus,
  onPixflowLicenseStatusChange,
}: Props) {
  const t = useT();
  // Each entry sub-view (home / projects / design-systems) is its own
  // URL now, so the browser back/forward buttons work and a deep link
  // to /design-systems lands on that section. We derive the active
  // view from the route rather than keeping it in component state.
  const route = useRoute();
  const view: EntryViewKind = route.kind === 'home' && !(hasPixflowWordPressContext() && route.view === 'plugins') ? route.view : 'home';
  const [previewSystemId, setPreviewSystemId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  // The entry nav rail is collapsed by default (Manus-style) so the entry
  // view opens clean and full-width; the panel toggle in the topbar opens it
  // as an overlay that dismisses on selection / backdrop click / Escape.
  // Its open/collapsed state is persisted (localStorage) so it survives a
  // home -> project -> home round trip (EntryShell unmounts on the project
  // route) and a reload, instead of snapping back to collapsed.
  const [railOpen, setRailOpen] = useState<boolean>(readStoredRailOpen);
  useEffect(() => {
    writeStoredRailOpen(railOpen);
  }, [railOpen]);
  const [localProviderModelsCache, setLocalProviderModelsCache] =
    useState<ProviderModelsCache>({});
  const hasSharedProviderModelsCache =
    Boolean(sharedProviderModelsCache) && Boolean(onProviderModelsCacheChange);
  const activeProviderModelsCache =
    hasSharedProviderModelsCache
      ? sharedProviderModelsCache!
      : localProviderModelsCache;
  const activeSetProviderModelsCache =
    hasSharedProviderModelsCache
      ? onProviderModelsCacheChange!
      : setLocalProviderModelsCache;
  const [newProjectInitialTab, setNewProjectInitialTab] =
    useState<CreateTab>('prototype');
  const [homePromptHandoff, setHomePromptHandoff] = useState<HomePromptHandoff | null>(null);
  const entryMainScrollRef = useRef<HTMLElement | null>(null);
  const analytics = useAnalytics();
  function changeView(next: EntryViewKind) {
    const navElement = navElementForView(next);
    if (navElement) {
      trackHomeNavClick(analytics.track, {
        page_name: 'home',
        area: 'nav',
        element: navElement,
      });
    }
    navigate({ kind: 'home', view: next });
  }

  function startPluginAuthoring(goal?: string) {
    setHomePromptHandoff(
      createPluginAuthoringHandoff(Date.now(), goal),
    );
    changeView('home');
  }

  function usePluginFromLibrary(
    record: InstalledPluginRecord,
    action: PluginUseAction = 'use',
  ) {
    setHomePromptHandoff(
      createPluginUseHandoff(Date.now(), record.id, { action }),
    );
    changeView('home');
  }

  useEffect(() => {
    if (view !== 'home' || !homePromptHandoff) return;
    const frame = window.requestAnimationFrame(() => {
      const scrollContainer = entryMainScrollRef.current;
      if (!scrollContainer) return;
      smoothScrollToTop(scrollContainer);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [homePromptHandoff?.id, view]);

  function openNewProject(tab: CreateTab = 'prototype') {
    setNewProjectInitialTab(tab);
    setNewProjectOpen(true);
  }

  const previewSystem = useMemo(
    () => (previewSystemId ? designSystems.find((d) => d.id === previewSystemId) ?? null : null),
    [designSystems, previewSystemId],
  );

  function handleCreate(input: CreateInput) {
    // The NewProjectModal no longer asks the user to pick a plugin.
    // Each project kind is silently bound to its default scenario
    // pipeline at creation time so the user lands in a running flow
    // without having to reason about pipeline internals. The mapping
    // is intentionally explicit so future kind-specific scenarios
    // (e.g. a deck- or image-specialized pipeline) can take over a
    // single row without touching the form.
    const pluginId = defaultPluginIdForMetadata(input.metadata);
    const pluginInputs = defaultPluginInputsForCreate(input, pluginId);
    return onCreateProject({
      ...input,
      ...(pluginId ? { pluginId } : {}),
      ...(pluginInputs ? { pluginInputs } : {}),
    });
  }

  // Plan §3.F5 — the home prompt-loop submit path. The user picks a
  // plugin (which calls /api/plugins/:id/apply and binds a snapshot),
  // edits the rendered example query if any, then presses Enter. We
  // derive a project name from the active plugin (or prompt head),
  // forward the pluginId so POST /api/projects pins the snapshot to
  // project + conversation, and request auto-send of the first
  // message so the user lands inside a running pipeline.
  //
  // Stage B of plugin-driven-flow-plan: the rail can stamp a
  // `projectKind` on the payload so the created project records the
  // chosen surface (image / video / audio, etc.). Free-form Home
  // submits now arrive with the hidden od-default router plugin and
  // projectKind='other', so the agent asks for the exact task type
  // before continuing.
  function handlePluginLoopSubmit(payload: PluginLoopSubmit) {
    const bricksCloneForward = typeof window === 'undefined'
      ? null
      : buildWebsiteCloneBricksHomeForward({
          locationHref: window.location.href,
          pluginId: payload.pluginId,
          projectIntent: String((payload.projectMetadata as { intent?: unknown } | null)?.intent || ''),
          configuredTarget: String(payload.pluginInputs?.targetUrl || ''),
          prompt: payload.prompt,
        });
    if (bricksCloneForward) {
      window.postMessage(bricksCloneForward, window.location.origin);
      return;
    }
    const head = payload.prompt.trim().split(/\s+/).slice(0, 8).join(' ');
    const firstAttachmentName = payload.attachments?.[0]?.name ?? '';
    const fallbackName = head.length > 0 ? head : firstAttachmentName || 'Untitled';
    const name =
      payload.pluginTitle && payload.pluginTitle.trim().length > 0
        ? payload.pluginTitle.trim()
        : fallbackName;
    const metadata: ProjectMetadata = {
      ...(payload.projectMetadata ?? {}),
      kind: payload.projectKind ?? payload.projectMetadata?.kind ?? 'prototype',
      nameSource: 'prompt',
      ...(payload.contextPlugins && payload.contextPlugins.length > 0
        ? { contextPlugins: payload.contextPlugins }
        : {}),
      ...(payload.contextMcpServers && payload.contextMcpServers.length > 0
        ? { contextMcpServers: payload.contextMcpServers }
        : {}),
      ...(payload.contextConnectors && payload.contextConnectors.length > 0
        ? { contextConnectors: payload.contextConnectors }
        : {}),
      ...(payload.pluginTitle && payload.pluginTitle.trim().length > 0
        ? { pluginTitle: payload.pluginTitle.trim() }
        : {}),
      ...(payload.pluginId && payload.pluginId.trim().length > 0
        ? { pluginId: payload.pluginId.trim() }
        : {}),
      ...(payload.pluginInputs ? { pluginInputs: payload.pluginInputs } : {}),
      ...(payload.examplePromptContext ? {
        examplePrompt: true,
        examplePromptTitle: payload.examplePromptContext.title,
        examplePromptBrief: payload.examplePromptContext.brief,
      } : {}),
    };
    // Pixflow-owned: direct HTML-to-Bricks imports and Library builds skip
    // the normal Home auto-send. ProjectView opens the isolated Bricks Agent
    // flow after the project lands so the default Web Prototype pipeline
    // cannot leak into builder-focused routes.
    const pixflowHtmlToBricks =
      (metadata as ProjectMetadata & { pixflowHtmlToBricks?: boolean }).pixflowHtmlToBricks === true;
    const pixflowLibrary =
      (metadata as ProjectMetadata & { pixflowLibrary?: boolean }).pixflowLibrary === true ||
      String((metadata as ProjectMetadata & { intent?: string }).intent || '') === 'pixflow_library';
    const pixflowBricksNativePrototype =
      (metadata as ProjectMetadata & { pixflowBricksNativePrototype?: boolean }).pixflowBricksNativePrototype === true ||
      String((metadata as ProjectMetadata & { intent?: string }).intent || '') === 'pixflow_bricks_native_prototype';
    return onCreateProject({
      name,
      skillId: payload.skillId ?? null,
      designSystemId: payload.designSystemId ?? null,
      metadata,
      pendingPrompt: payload.prompt,
      ...(payload.existingProjectId ? { existingProjectId: payload.existingProjectId } : {}),
      ...(payload.firstTurn ? { firstTurn: payload.firstTurn } : {}),
      ...(payload.pluginId ? { pluginId: payload.pluginId } : {}),
      ...(payload.pluginType ? { pluginType: payload.pluginType } : {}),
      ...(payload.appliedPluginSnapshotId
        ? { appliedPluginSnapshotId: payload.appliedPluginSnapshotId }
        : {}),
      ...(payload.pluginInputs ? { pluginInputs: payload.pluginInputs } : {}),
      ...(payload.skipDiscoveryBrief ? { skipDiscoveryBrief: true } : {}),
      ...(payload.conversationMode ? { conversationMode: payload.conversationMode } : {}),
      ...(payload.attachments && payload.attachments.length > 0
        ? { pendingFiles: payload.attachments }
        : {}),
      autoSendFirstMessage: !pixflowHtmlToBricks && !pixflowLibrary && !pixflowBricksNativePrototype,
    });
  }

  async function finishOnboarding(): Promise<void> {
    await onCompleteOnboarding();
    changeView('home');
  }

  const avatarMenu = (
    <EntrySettingsMenu
      config={config}
      onThemeChange={onThemeChange}
      onOpenSettings={onOpenSettings}
      onTrackTriggerClick={() => {
        trackHomeToolbarClick(analytics.track, {
          page_name: 'home',
          area: 'toolbar',
          element: 'settings',
        });
      }}
    />
  );


  if (view === 'onboarding') {
    return (
      <div className="entry-shell entry-shell--no-header entry-shell--onboarding">
        <main className="entry-onboarding-modal" aria-label={t('settings.welcomeTitle')}>
          <OnboardingView
            config={config}
            agents={agents}
            providerModelsCache={activeProviderModelsCache}
            onProviderModelsCacheChange={activeSetProviderModelsCache}
            daemonLive={daemonLive}
            onModeChange={onModeChange}
            onAgentChange={onAgentChange}
            onAgentModelChange={onAgentModelChange}
            onApiProtocolChange={onApiProtocolChange}
            onApiModelChange={onApiModelChange}
            onConfigPersist={onConfigPersist}
            onRefreshAgents={onRefreshAgents}
            onFinish={finishOnboarding}
            pixflowLicenseStatus={pixflowLicenseStatus}
            onPixflowLicenseStatusChange={onPixflowLicenseStatusChange}
          />
        </main>
      </div>
    );
  }

  const executionSwitcher = (
    <InlineModelSwitcher
      config={config}
      agents={agents}
      providerModelsCache={activeProviderModelsCache}
      onProviderModelsCacheChange={activeSetProviderModelsCache}
      daemonLive={daemonLive}
      onModeChange={onModeChange}
      onAgentChange={onAgentChange}
      onAgentModelChange={onAgentModelChange}
      onApiProtocolChange={onApiProtocolChange}
      onApiModelChange={onApiModelChange}
      onOpenSettings={onOpenSettings}
    />
  );

  return (
    <div className="entry-shell entry-shell--no-header">
      <div className={`entry${railOpen ? ' entry--rail-open' : ''}`}>
        {!hasPixflowWordPressContext() && <EntryNavRail
          view={view}
          onViewChange={changeView}
          onNewProject={() => openNewProject()}
          open={railOpen}
          onClose={() => setRailOpen(false)}
        />}
        <main className="entry-main entry-main--scroll" ref={entryMainScrollRef}>
          {!hasPixflowWordPressContext() && <div className="entry-main__topbar">
            {!hasPixflowWordPressContext() && <button
              type="button"
              className="entry-rail-toggle"
              onClick={() => setRailOpen((prev) => !prev)}
              aria-label={t('entry.navExpand')}
              aria-expanded={railOpen}
              data-testid="entry-rail-toggle"
            >
              <Icon name="panel-left" size={20} />
            </button>}
            <div className="entry-main__topbar-chips entry-main__topbar-chips--icon-only">
              {/* Pixflow-owned: OD badges and Use everywhere CTA are omitted from Pixflow Design. */}
              {executionSwitcher}
            </div>
            <UpdaterPopup />
            {avatarMenu}
          </div>}
          <div
            className={`entry-main__inner${
              view === 'home' ? '' : ' entry-main__inner--wide'
            }`}
          >
            <div data-testid="entry-view-home" data-active={view === 'home' ? 'true' : 'false'} {...inactiveViewProps(view === 'home')}>
              <HomeView
                isActive={view === 'home'}
                projects={projects}
                projectsLoading={projectsLoading}
                designSystems={designSystems}
                defaultDesignSystemId={defaultDesignSystemId}
                onSubmit={handlePluginLoopSubmit}
                executionSwitcher={hasPixflowWordPressContext() ? <AvatarMenu
                  composerLabel config={config} agents={agents} daemonLive={daemonLive}
                  onModeChange={onModeChange} onAgentChange={onAgentChange}
                  onAgentModelChange={onAgentModelChange} onApiModelChange={onApiModelChange}
                  onExecutionChange={patch => { void onConfigPersist({ ...config, ...patch }); }}
                  providerModelsCache={activeProviderModelsCache}
                  onOpenSettings={onOpenSettings} onRefreshAgents={onRefreshAgents}
                  placement="up" popoverZIndex={2147483002}
                /> : executionSwitcher}
                mcpProvider={config.mode === 'daemon' ? config.agentId : null}
                codexVoiceEnabled={hasPixflowWordPressContext() && daemonLive && config.mode === 'daemon' && config.agentId === 'codex'}
                onOpenExecutionSettings={onOpenSettings}
                onOpenProject={onOpenProject}
                onViewAllProjects={() => changeView('projects')}
                onBrowseRegistry={() => changeView('plugins')}
                onOpenIntegrations={() => onOpenSettings('composio')}
                onOpenMcp={() => onOpenSettings('mcpClient')}
                onOpenNewProject={(tab) => {
                  openNewProject(tab);
                }}
                promptHandoff={homePromptHandoff}
                skills={skills}
                onSkillsRefresh={onSkillsRefresh}
                skillsLoading={skillsLoading}
                connectors={connectors}
                promptTemplates={promptTemplates}
                catalogLoadAllowed={catalogLoadAllowed}
              />
            </div>
            <div data-testid="entry-view-projects" data-active={view === 'projects' ? 'true' : 'false'} {...inactiveViewProps(view === 'projects')}>
              {projectsLoading ? (
                <CenteredLoader label={t('common.loading')} />
              ) : (
                <div className="entry-section">
                  <header className="entry-section__head">
                    <h1 className="entry-section__title">{t(hasPixflowWordPressContext() ? 'workspaceSidebar.chats' : 'entry.navProjects')}</h1>
                  </header>
                  <DesignsTab
                    projects={projects}
                    skills={skills}
                    designSystems={designSystems}
                    onOpen={onOpenProject}
                    onOpenLiveArtifact={onOpenLiveArtifact}
                    onDelete={onDeleteProject}
                    onRename={onRenameProject}
                    onNewProject={() => openNewProject()}
                  />
                </div>
              )}
            </div>
            <div data-testid="entry-view-media" data-active={view === 'media' ? 'true' : 'false'} {...inactiveViewProps(view === 'media')}>
              {view === 'media' ? (
                <div className="entry-section">
                  <MediaView />
                </div>
              ) : null}
            </div>
            <div data-testid="entry-view-sitemap" data-active={view === 'sitemap' ? 'true' : 'false'} {...inactiveViewProps(view === 'sitemap')}>
              {view === 'sitemap' ? (
                <div className="entry-section">
                  <SitemapView
                    config={config}
                    agents={agents}
                    providerModelsCache={activeProviderModelsCache}
                    daemonLive={daemonLive}
                    agentsLoading={agentsLoading}
                    onModeChange={onModeChange}
                    onAgentChange={onAgentChange}
                    onAgentModelChange={onAgentModelChange}
                    onApiModelChange={onApiModelChange}
                    onOpenSettings={(section) => onOpenSettings(section)}
                    onRefreshAgents={onRefreshAgents}
                  />
                </div>
              ) : null}
            </div>
            <div data-testid="entry-view-plugins" data-active={view === 'plugins' ? 'true' : 'false'} {...inactiveViewProps(view === 'plugins')}>
              {view === 'plugins' ? (hasPixflowWordPressContext() ? <PixflowResourcesSection onDownloads={() => onOpenSettings('resourcePacks')} onUsePlugin={usePluginFromLibrary} /> :
                <PluginsView
                  onCreatePlugin={startPluginAuthoring}
                  onUsePlugin={usePluginFromLibrary}
                  onCreatePluginShareProject={onCreatePluginShareProject}
                />
              ) : null}
            </div>
            <div data-testid="entry-view-design-systems" data-active={view === 'design-systems' ? 'true' : 'false'} {...inactiveViewProps(view === 'design-systems')}>
              {designSystemsLoading ? (
                <CenteredLoader label={t('common.loading')} />
              ) : (
                <div className="entry-section">
                  <header className="entry-section__head">
                    <h1 className="entry-section__title">{t('entry.navDesignSystems')}</h1>
                  </header>
                  <DesignSystemsTab
                    systems={designSystems}
                    templates={templates}
                    selectedId={defaultDesignSystemId}
                    onSelect={onChangeDefaultDesignSystem}
                    onCreate={onCreateDesignSystem}
                    onOpenSystem={onOpenDesignSystem}
                    onSystemsRefresh={onDesignSystemsRefresh}
                    onPreview={(id) => setPreviewSystemId(id)}
                  />
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
      <AnimatePresence>
        {previewSystem ? (
          <DesignSystemPreviewModal
            system={previewSystem}
            onClose={() => setPreviewSystemId(null)}
          />
        ) : null}
      </AnimatePresence>
      <NewProjectModal
        open={newProjectOpen}
        initialTab={newProjectInitialTab}
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId={defaultDesignSystemId}
        templates={templates}
        {...(onDeleteTemplate ? { onDeleteTemplate } : {})}
        promptTemplates={promptTemplates}
        mediaProviders={config.mediaProviders}
        connectors={connectors}
        connectorsLoading={connectorsLoading}
        loading={skillsLoading}
        onCreate={handleCreate}
        onImportClaudeDesign={onImportClaudeDesign}
        {...(onImportFolder ? { onImportFolder } : {})}
        {...(onImportFolderResponse ? { onImportFolderResponse } : {})}
        onOpenConnectorsTab={() => {
          setNewProjectOpen(false);
          onOpenSettings('composio');
        }}
        onClose={() => setNewProjectOpen(false)}
      />
    </div>
  );
}

