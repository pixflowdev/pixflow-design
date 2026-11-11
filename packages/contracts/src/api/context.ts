export interface RunContextSelection {
  skillIds?: string[];
  /** Display-only references to exact UTF-16 ranges of the submitted prompt. */
  skillMentions?: ChatSkillMention[];
  pluginIds?: string[];
  mcpServerIds?: string[];
  /** Display-only snapshots for queued drafts; never include server credentials or commands. */
  mcpMentions?: Array<{ id: string; label: string }>;
  connectorIds?: string[];
  workspaceItems?: WorkspaceContextItem[];
}

export interface ChatSkillMention {
  start: number;
  token: string;
  label: string;
}

export type WorkspaceContextKind =
  | 'design-files'
  | 'design-system'
  | 'file'
  | 'folder'
  | 'browser'
  | 'terminal'
  | 'side-chat'
  | 'live-artifact'
  | 'sitemap-brief'
  | 'sitemap-page';

export interface WorkspaceContextItem {
  id: string;
  kind: WorkspaceContextKind;
  label: string;
  tabId?: string;
  path?: string;
  absolutePath?: string;
  url?: string;
  title?: string;
  content?: string;
  /** Optional six-digit hex accent for a saved design-system reference. */
  accentColor?: string;
}

export interface ProjectContextPluginRef {
  id: string;
  title: string;
  description?: string;
}

export interface ProjectContextMcpServerRef {
  id: string;
  label?: string;
  transport?: string;
  url?: string;
  command?: string;
}

export interface ProjectContextConnectorRef {
  id: string;
  name: string;
  provider?: string;
  category?: string;
  description?: string;
  status?: string;
  accountLabel?: string;
}
