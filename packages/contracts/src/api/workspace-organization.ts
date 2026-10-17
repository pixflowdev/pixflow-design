/** Organization overlays existing chat/project IDs; never moves or deletes their content. */
export interface WorkspaceProjectGroup {
  id: string;
  name: string;
  pinned: boolean;
  collapsed: boolean;
}
export interface WorkspaceOrganization {
  revision: number;
  projects: WorkspaceProjectGroup[];
  chats: Record<string, { projectId: string | null; pinned: boolean }>;
  sidebarCollapsed: boolean;
  collapsedSections?: { pinned?: boolean; projects?: boolean; chats?: boolean };
}
export type WorkspaceOrganizationAction =
  | { type: 'create-project'; id: string; name: string }
  | { type: 'rename-project'; id: string; name: string }
  | { type: 'delete-project'; id: string }
  | { type: 'pin-project'; id: string; pinned: boolean }
  | { type: 'collapse-project'; id: string; collapsed: boolean }
  | { type: 'move-chat'; chatId: string; projectId: string | null }
  | { type: 'pin-chat'; chatId: string; pinned: boolean }
  | { type: 'collapse-section'; section: 'pinned' | 'projects' | 'chats'; collapsed: boolean }
  | { type: 'collapse-sidebar'; collapsed: boolean };
export interface WorkspaceOrganizationRequest {
  revision: number;
  action: WorkspaceOrganizationAction;
}
