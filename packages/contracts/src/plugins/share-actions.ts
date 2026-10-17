import type { Project } from '../api/projects.js';

export const PLUGIN_SHARE_ACTIONS = [
  'publish-github',
] as const;

export type PluginShareAction = (typeof PLUGIN_SHARE_ACTIONS)[number];

export interface CreatePluginShareProjectRequest {
  action: PluginShareAction;
  locale?: string;
}

export interface CreatePluginShareProjectResponse {
  ok: true;
  project: Project;
  conversationId: string;
  appliedPluginSnapshotId?: string;
  actionPluginId?: string;
  sourcePluginId: string;
  stagedPath: string;
  prompt: string;
  message: string;
}
