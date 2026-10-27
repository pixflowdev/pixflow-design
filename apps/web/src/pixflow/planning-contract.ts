import type { ComponentType, Dispatch, SetStateAction } from 'react';
import type { AgentInfo, AppConfig, DesignSystemGenerationJob, DesignSystemSummary, ExecMode, Project, ProjectTemplate, ProviderModelOption } from '../types';
import type { Dict } from '../i18n/types';
import type { PixflowDesignSystemProfile } from './framework';

export interface DesignSystemGenerateSnapshot {
  sourceCount: number;
  hasBrandDescription: boolean;
  githubRepoCount: number;
  localFolderCount: number;
  figFileCount: number;
  assetFileCount: number;
}

export interface DesignSystemCreationProps {
  onBack: () => void;
  onCreated: (projectId: string, project?: Project) => void;
  onProjectPrepared?: (project: Project) => void;
  onSystemsRefresh?: () => Promise<void> | void;
  config?: AppConfig;
  onOpenConnectorsTab?: () => void;
  chrome?: 'standalone' | 'embedded';
  onBeforeGenerate?: (snapshot: DesignSystemGenerateSnapshot) => void;
  onGenerateSettled?: (snapshot: DesignSystemGenerateSnapshot, outcome: { result: 'success' } | { result: 'failed'; errorCode: string }) => void;
}

export interface DesignSystemDetailProps {
  id: string;
  selectedId: string | null;
  config: AppConfig;
  agents: AgentInfo[];
  onBack: () => void;
  onOpenProject?: (projectId: string) => void;
  onSetDefault: (id: string) => void;
  onSystemsRefresh?: () => Promise<void> | void;
  onProjectsRefresh?: () => Promise<void> | void;
  initialRevisionJob?: DesignSystemGenerationJob | null;
  onInitialRevisionJobConsumed?: (jobId: string) => void;
}

export interface SitemapViewProps {
  config?: AppConfig | null;
  agents?: AgentInfo[];
  providerModelsCache?: Record<string, ProviderModelOption[]>;
  daemonLive?: boolean;
  agentsLoading?: boolean;
  onModeChange?: (mode: ExecMode) => void;
  onAgentChange?: (id: string) => void;
  onAgentModelChange?: (id: string, choice: { model?: string; reasoning?: string; fastMode?: boolean }) => void;
  onApiModelChange?: (model: string) => void;
  onOpenSettings?: (section?: 'execution' | 'dictation' | 'designSystems') => void;
  onRefreshAgents?: (options?: { useOptionalBridge?: boolean }) => Promise<unknown> | unknown;
}

/** Public composition boundary; planning implementations and their CSS belong to Pro. */
export interface PlanningContribution {
  EnhancedDesignGuidance?: ComponentType<{ enabled?: boolean; surface?: import('@open-design/contracts').PixflowSurface }>;
  PixflowDesignSystemLibrary: ComponentType<{ showHeading?: boolean; config?: AppConfig; onBack?: () => void; onChanged?: () => void; initialId?: string; createInitially?: boolean }>;
  PixflowFrameworkDesignSystemBuilder: ComponentType<{ reusable?: { title: string; profile: PixflowDesignSystemProfile; onSave: (profile: PixflowDesignSystemProfile) => Promise<void>; onClose: () => void } }>;
  DesignSystemCreationFlow: ComponentType<DesignSystemCreationProps>;
  DesignSystemDetailView: ComponentType<DesignSystemDetailProps>;
  DesignSystemsSection: ComponentType<{ openManualEditor?: boolean; cfg: AppConfig; setCfg: Dispatch<SetStateAction<AppConfig>>; onDesignSystemsChanged?: (affectedDesignSystemId?: string) => void; onDesignSystemImportRebuildJob?: (designSystemId: string, job: DesignSystemGenerationJob) => void }>;
  DesignSystemsTab: ComponentType<{ systems: DesignSystemSummary[]; selectedId: string | null; onSelect: (id: string) => void; onPreview: (id: string) => void; onCreate?: () => void; onOpenSystem?: (id: string) => void; onSystemsRefresh?: () => Promise<void> | void; templates?: ProjectTemplate[] }>;
  DesignSystemPicker: ComponentType<{ designSystems: DesignSystemSummary[]; selectedId: string | null; loading?: boolean; onChange: (id: string | null) => void; variant?: 'project' | 'footer'; label?: string }>;
  DesignSystemSwitchPicker: ComponentType<{ t: (key: keyof Dict, vars?: Record<string, string | number>) => string; currentDesignSystemId?: string | null; onSelect: (designSystemId: string | null, title: string | null) => Promise<boolean>; onBack: () => void }>;
  DesignSystemSwitch: ComponentType<{ disabled?: boolean }>;
  SitemapView: ComponentType<SitemapViewProps>;
}
