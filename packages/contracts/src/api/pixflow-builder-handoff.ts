import type { PixflowBuilderDestination, PixflowBuilderId } from './pixflow-builder-destination.js';
import type { PixflowEditorTarget } from './pixflow-direct-site.js';

export interface PixflowBuilderHandoffAsset { projectId: string; path: string; name: string; mime?: string }
export type PixflowBuilderHandoffStatus = 'ready' | 'claimed' | 'accepted' | 'awaiting_input' | 'completed' | 'failed' | 'cancelled';
/** Durable site-owned receipt. Claim is sticky: uncertain execution is never resent. */
export interface PixflowBuilderHandoff {
  id: string;
  projectId: string;
  conversationId: string;
  /** Present only for a handoff prepared through the source-bound agent tool. */
  origin?: 'agent';
  sourceRequestId?: string;
  destination: PixflowBuilderDestination;
  editorUrl: string;
  targetTabId: string;
  brief: string;
  assets: PixflowBuilderHandoffAsset[];
  messageId: string;
  status: PixflowBuilderHandoffStatus;
  /** Unix time in milliseconds; expiry applies only before first claim. */
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  editorTarget?: PixflowEditorTarget;
  runId?: string;
  error?: string;
}
export type PixflowBuilderHandoffRequest =
  | { action: 'prepare'; requestId: string; projectId: string; conversationId: string; builder: PixflowBuilderId; postId: number; targetTabId: string; brief: string; assets?: PixflowBuilderHandoffAsset[] }
  | { action: 'claim'; id: string; tabId: string; editorTarget: PixflowEditorTarget }
  | { action: 'ack'; id: string; tabId: string; messageId: string; runId?: string }
  | { action: 'finish'; id: string; tabId: string; messageId: string; outcome: 'completed' | 'failed' | 'awaiting_input'; error?: string }
  | { action: 'fail'; id: string; error: string }
  | { action: 'cancel'; id: string };
export interface PixflowBuilderHandoffResult { handoff: PixflowBuilderHandoff; shouldStart?: boolean; reused?: boolean }
export interface PixflowBuilderHandoffLookup { handoff: PixflowBuilderHandoff | null }
