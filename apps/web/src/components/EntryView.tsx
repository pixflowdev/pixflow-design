import type { WorkspaceCreateHandoff } from './workspace-first-turn';
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { ConnectorDetail } from '@open-design/contracts';
import type { OpenDesignHostProjectImportSuccess } from '@open-design/host';
import {
  DEFAULT_AUDIO_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
} from '../media/models';
import type {
  AgentInfo,
  ApiProtocol,
  AppConfig,
  AppTheme,
  DesignSystemSummary,
  ExecMode,
  Project,
  ProjectKind,
  ProjectMetadata,
  ProjectTemplate,
  PromptTemplateSummary,
  ProviderModelOption,
  SkillSummary,
} from '../types';
// `EntryShell` owns the redesigned home layout (left rail + centered
// hero + recent projects + plugins). Keeping the redesign in a sibling
// component lets future rebases against upstream `EntryView` (props,
// connector lifecycle, exported helpers) stay close to a no-op here.
import { EntryShell } from './EntryShell';
import type { CreateInput, ImportClaudeDesignOutcome } from './NewProjectPanel';
import {
  CONNECTOR_CALLBACK_MESSAGE_TYPE,
  listenForConnectorsChanged,
} from './connectors-events';
import { fetchConnectorCatalogSnapshot } from './connectors-state';
import type {
  PluginShareAction,
  PluginShareProjectOutcome,
} from '../state/projects';
import type { PixflowLicenseStatus } from '../pixflow/license';

interface Props {
  // Union of functional skills + design templates — used for id-based
  // lookups (DesignsTab project chips, NewProjectPanel skill picker).
  skills: SkillSummary[];
  onSkillsRefresh?: () => Promise<void>;
  designSystems: DesignSystemSummary[];
  projects: Project[];
  templates: ProjectTemplate[];
  onDeleteTemplate: (id: string) => Promise<boolean>;
  promptTemplates: PromptTemplateSummary[];
  catalogLoadAllowed?: boolean;
  defaultDesignSystemId: string | null;
  agents: AgentInfo[];
  // Forwarded to EntryShell → OnboardingView so the AMR cloud card can show a
  // detecting/skeleton state while the cold-start agent stream is in flight.
  agentsLoading?: boolean;
  // Execution / model-switching context forwarded to the EntryShell so the
  // sticky top-bar can expose the active CLI/BYOK + model and persist
  // changes through the same channels as the project view.
  config: AppConfig;
  providerModelsCache?: Record<string, ProviderModelOption[]>;
  onProviderModelsCacheChange?: Dispatch<SetStateAction<Record<string, ProviderModelOption[]>>>;
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
  // Quick theme switch invoked from the avatar-popover dropdown so the
  // user can flip light/dark/system without opening the full Settings
  // dialog. Persistence happens in `App`; this component just forwards.
  onThemeChange: (theme: AppTheme) => void;
  // Per-resource loading flags. Each tab gates its own content on whichever
  // flag matches the data it renders, so a slow `/api/agents` probe does
  // not block tabs that don't need agents. Templates are not gated here —
  // the New project modal renders an empty state until they arrive (fast
  // fetch), which keeps the prop surface narrower.
  skillsLoading?: boolean;
  designSystemsLoading?: boolean;
  projectsLoading?: boolean;
  promptTemplatesLoading?: boolean;
  onCreateProject: (
    input: CreateInput & WorkspaceCreateHandoff & {
      pendingPrompt?: string;
      pluginId?: string;
      appliedPluginSnapshotId?: string;
      pluginInputs?: Record<string, unknown>;
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
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onChangeDefaultDesignSystem: (id: string) => void;
  onCreateDesignSystem?: () => void;
  onOpenDesignSystem?: (id: string) => void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
  onOpenSettings: (section?: 'execution' | 'dictation' | 'media' | 'composio' | 'orbit' | 'integrations' | 'mcpClient' | 'language' | 'appearance' | 'notifications' | 'pet' | 'library' | 'about' | 'memory' | 'designSystems' | 'license' | 'resources' | 'resourcePacks') => void;
  onCompleteOnboarding: () => void;
  pixflowLicenseStatus?: PixflowLicenseStatus | null;
  onPixflowLicenseStatusChange?: (status: PixflowLicenseStatus) => void;
}

export { isTrustedConnectorCallbackOrigin, sortConnectorsForDisplay, getConnectorSearchScore, sortConnectorsForSearch } from './connectors-search';
import { isTrustedConnectorCallbackOrigin } from './connectors-search';

export function EntryView({
  skills,
  onSkillsRefresh,
  designSystems,
  projects,
  templates,
  onDeleteTemplate,
  promptTemplates,
  catalogLoadAllowed = true,
  defaultDesignSystemId,
  agents,
  agentsLoading,
  config,
  providerModelsCache,
  onProviderModelsCacheChange,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiProtocolChange,
  onApiModelChange,
  onConfigPersist,
  onRefreshAgents,
  onThemeChange,
  skillsLoading = false,
  designSystemsLoading = false,
  projectsLoading = false,
  promptTemplatesLoading: _promptTemplatesLoading = false,
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
  const [connectors, setConnectors] = useState<ConnectorDetail[]>([]);
  const [connectorsLoading, setConnectorsLoading] = useState(false);

  const reloadConnectorCatalog = useCallback(async (options: { refreshDiscovery?: boolean } = {}) => {
    setConnectorsLoading(true);
    setConnectors(await fetchConnectorCatalogSnapshot(options));
    setConnectorsLoading(false);
  }, []);

  useEffect(() => {
    if (!catalogLoadAllowed) return;
    let cancelled = false;
    // Fetch connectors on mount so the New project modal can show
    // already-configured connectors without waiting for the user to
    // open the Settings → Connectors surface.
    setConnectorsLoading(true);
    (async () => {
      const next = await fetchConnectorCatalogSnapshot();
      if (cancelled) return;
      setConnectors(next);
      setConnectorsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [catalogLoadAllowed]);

  useEffect(() => {
    if (!catalogLoadAllowed) return;
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== 'object' || (data as { type?: unknown }).type !== CONNECTOR_CALLBACK_MESSAGE_TYPE) return;
      if (!isTrustedConnectorCallbackOrigin(event.origin)) return;
      void reloadConnectorCatalog({ refreshDiscovery: true });
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [catalogLoadAllowed, reloadConnectorCatalog]);

  useEffect(() => {
    if (!catalogLoadAllowed) return;
    function onConnectorsChanged() {
      void reloadConnectorCatalog({ refreshDiscovery: true });
    }
    return listenForConnectorsChanged(onConnectorsChanged);
  }, [catalogLoadAllowed, reloadConnectorCatalog]);

  // When the OAuth flow is handed off to the user's system browser (desktop
  // shell opens connector auth URLs externally rather than in an Electron
  // popup), the callback page has no `window.opener` to postMessage back to.
  // Refresh connector statuses whenever the window regains focus so the UI
  // picks up a just-completed connection without manual intervention.
  useEffect(() => {
    if (!catalogLoadAllowed) return;
    function refreshAfterReturn() {
      void reloadConnectorCatalog({ refreshDiscovery: true });
    }
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      refreshAfterReturn();
    }
    window.addEventListener('focus', refreshAfterReturn);
    window.addEventListener('pageshow', refreshAfterReturn);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', refreshAfterReturn);
      window.removeEventListener('pageshow', refreshAfterReturn);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [catalogLoadAllowed, reloadConnectorCatalog]);

  return (
    <EntryShell
      skills={skills}
      onSkillsRefresh={onSkillsRefresh}
      designSystems={designSystems}
      projects={projects}
      templates={templates}
      onDeleteTemplate={onDeleteTemplate}
      promptTemplates={promptTemplates}
      catalogLoadAllowed={catalogLoadAllowed}
      defaultDesignSystemId={defaultDesignSystemId}
      connectors={connectors}
      connectorsLoading={connectorsLoading}
      skillsLoading={skillsLoading}
      designSystemsLoading={designSystemsLoading}
      projectsLoading={projectsLoading}
      config={config}
      providerModelsCache={providerModelsCache}
      onProviderModelsCacheChange={onProviderModelsCacheChange}
      agents={agents}
      {...(agentsLoading !== undefined ? { agentsLoading } : {})}
      daemonLive={daemonLive}
      onModeChange={onModeChange}
      onAgentChange={onAgentChange}
      onAgentModelChange={onAgentModelChange}
      onApiProtocolChange={onApiProtocolChange}
      onApiModelChange={onApiModelChange}
      onConfigPersist={onConfigPersist}
      onRefreshAgents={onRefreshAgents}
      onThemeChange={onThemeChange}
      onCreateProject={onCreateProject}
      onCreatePluginShareProject={onCreatePluginShareProject}
      onImportClaudeDesign={onImportClaudeDesign}
      {...(onImportFolder ? { onImportFolder } : {})}
      {...(onImportFolderResponse ? { onImportFolderResponse } : {})}
      onOpenProject={onOpenProject}
      onOpenLiveArtifact={onOpenLiveArtifact}
      onDeleteProject={onDeleteProject}
      onRenameProject={onRenameProject}
      onChangeDefaultDesignSystem={onChangeDefaultDesignSystem}
      onCreateDesignSystem={onCreateDesignSystem}
      onOpenDesignSystem={onOpenDesignSystem}
      onDesignSystemsRefresh={onDesignSystemsRefresh}
      onOpenSettings={onOpenSettings}
      onCompleteOnboarding={onCompleteOnboarding}
      pixflowLicenseStatus={pixflowLicenseStatus}
      onPixflowLicenseStatusChange={onPixflowLicenseStatusChange}
    />
  );
}

// Map a skill's declared mode to project metadata. Falls back to the same
// defaults the new-project form would apply (high-fidelity prototype, no
// speaker notes on decks, no template animations) so 'Use this prompt'
// produces a project indistinguishable from one created via the form. Per-
// skill hints in SKILL.md frontmatter (od.fidelity, od.speaker_notes,
// od.animations) override the defaults so each example reproduces the
// shipped example.html — e.g. wireframe-sketch declares fidelity:wireframe.
//
// Kept exported (and the kindForSkill helper too) so the New project modal
// and any future skill-driven creation surface can share the mapping.
export function metadataForSkill(skill: SkillSummary): ProjectMetadata {
  const kind = kindForSkill(skill);
  if (kind === 'prototype') {
    return { kind, fidelity: skill.fidelity ?? 'high-fidelity' };
  }
  if (kind === 'deck') {
    return {
      kind,
      speakerNotes:
        typeof skill.speakerNotes === 'boolean' ? skill.speakerNotes : false,
    };
  }
  if (kind === 'template') {
    return {
      kind,
      animations:
        typeof skill.animations === 'boolean' ? skill.animations : false,
    };
  }
  if (kind === 'image') {
    return { kind, imageModel: DEFAULT_IMAGE_MODEL, imageAspect: '1:1' };
  }
  if (kind === 'video') {
    return { kind, videoModel: DEFAULT_VIDEO_MODEL, videoAspect: '16:9', videoLength: 5 };
  }
  if (kind === 'audio') {
    return {
      kind,
      audioKind: 'speech',
      audioModel: DEFAULT_AUDIO_MODEL.speech,
      audioDuration: 10,
    };
  }
  return { kind: 'other' };
}

export function kindForSkill(skill: SkillSummary): ProjectKind {
  if (skill.mode === 'deck') return 'deck';
  if (skill.mode === 'prototype') return 'prototype';
  if (skill.mode === 'template') return 'template';
  if (skill.mode === 'image' || skill.surface === 'image') return 'image';
  if (skill.mode === 'video' || skill.surface === 'video') return 'video';
  if (skill.mode === 'audio' || skill.surface === 'audio') return 'audio';
  return 'other';
}
