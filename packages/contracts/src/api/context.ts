export interface RunContextSelection {
  skillIds?: string[];
  pluginIds?: string[];
  mcpServerIds?: string[];
  /** Display-only snapshots for queued drafts; never include server credentials or commands. */
  mcpMentions?: Array<{ id: string; label: string }>;
  connectorIds?: string[];
  workspaceItems?: WorkspaceContextItem[];
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
