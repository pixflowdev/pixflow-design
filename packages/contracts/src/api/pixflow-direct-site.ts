/** Live site integrations returned by the authenticated WordPress session check. */
export interface PixflowSiteIntegrations { bricks?: boolean }
/** Source bound by WordPress when the Workspace opens a tool session. */
export interface PixflowWorkspaceSource { projectId: string; conversationId: string; requestId: string }
export interface PixflowDirectSiteAuthorization {
  /** Current server-owned contributions, never taken from request JSON. */
  features?: { composio?: boolean; audio?: boolean; 'external-mcp'?: boolean; 'image-generation'?: boolean };
  editorTarget?: PixflowEditorTarget | null;
  workspaceSource?: PixflowWorkspaceSource | null;
  identity?: { siteId?: string; userId?: number; blogId?: number };
  writable?: boolean;
  integrations?: PixflowSiteIntegrations;
}
export type PixflowSiteAccessMode = 'direct' | 'guarded';
export interface PixflowDirectSiteAttachment {
  projectId: string;
  path: string;
  name: string;
  kind: 'image' | 'file';
  annotationScreenshot?: boolean;
}
export interface PixflowDirectSiteSession {
  editorTarget?: PixflowEditorTarget;
  workspaceSource?: PixflowWorkspaceSource;
  endpoint: string;
  token: string;
  expiresAt: number;
  writable: boolean;
  /** Supplied by the authenticated WordPress session endpoint. */
  identity?: { siteId: string; userId: number; blogId: number };
}
/** Immutable origin of a builder run, enforced by the WordPress tool session. */
export interface PixflowGutenbergEntity { type: string; id: string }
export interface PixflowEditorTarget { builder: 'bricks' | 'etch' | 'elementor' | 'gutenberg'; canvasId: string; postId: number; entity?: PixflowGutenbergEntity }
/** Removes display-only tool logs for the authenticated site/user; native CLI memory is preserved. */
export interface PixflowDirectToolHistoryRequest { session: PixflowDirectSiteSession }
export interface PixflowDirectToolHistoryResponse { clearedEvents: number; retentionDays: number }
export type PixflowDirectSiteOutcome = 'answered' | 'completed' | 'awaiting_input' | 'interrupted' | 'canceled' | 'failed';
/** Durations from request receipt, never credentials or prompt content. Carried on terminal events. */
export interface PixflowDirectSiteTimings {
  ownerReadyMs?: number;
  contextReadyMs?: number;
  spawnMs?: number;
  firstProviderEventMs?: number;
  firstTextMs?: number;
  totalMs: number;
  promptBytes?: number;
  nativeSessionReused?: boolean;
}
export interface PixflowDirectSiteRunIdentity {
  conversationId: string;
  taskId: string;
  attemptId: string;
  surface: string;
}
export interface PixflowDirectSiteContinuationRequest {
  id: string;
  token: string;
  session?: PixflowDirectSiteSession;
  afterSequence?: number;
}
/** Guidance for the current turn. Never implicitly cancels or starts a replacement run. */
export interface PixflowDirectSiteSteerRequest extends PixflowDirectSiteContinuationRequest {
  messageId: string;
  prompt: string;
  attachments?: PixflowDirectSiteAttachment[];
  context?: unknown;
}
export interface PixflowDirectSiteSteerResponse {
  messageId: string;
  /** Queued means the final reply finished first; deliver normally as the next turn. */
  state: 'accepted' | 'queued' | 'unconfirmed' | 'rejected';
  turnId?: string;
  message?: string;
}
export interface PixflowDirectSiteRunStatus extends PixflowDirectSiteRunIdentity {
  id: string;
  outcome: PixflowDirectSiteOutcome | null;
  lastSequence: number;
  createdAt: number;
  updatedAt: number;
}
/** Transient connection event; excluded from persisted/replayed Direct events. */
export const PIXFLOW_CODEX_VOICES = ['arbor', 'breeze', 'cove', 'ember', 'juniper', 'maple', 'sol', 'spruce', 'vale'] as const;
export interface PixflowVoicePreviewResponse { audioBase64: string; mimeType: 'audio/wav' }
export interface PixflowDirectSiteVoiceSdpEvent {
  type: 'voice_sdp';
  sdp: string;
}
/** POST direct-site/voice-end uses PixflowDirectSiteContinuationRequest. */
export interface PixflowDirectSiteVoiceEndResponse {
  ending: true;
  outcome: PixflowDirectSiteOutcome | null;
}
export interface PixflowDirectSiteRunRequest {
  editorTarget?: PixflowEditorTarget;
  /** Browser-created WebRTC offer. Credentials and native execution stay in the Bridge. */
  voice?: { sdp: string; name?: string };
  /** Tab-owned continuation identity; distinct from the WordPress credential. */
  continuation?: { id: string; token: string };
  conversationId?: string;
  taskId?: string;
  surface?: string;
  mode?: string;
  session: PixflowDirectSiteSession;
  agentId: string;
  model?: string;
  reasoning?: string;
  fastMode?: boolean;
  prompt: string;
  context?: unknown;
  attachments?: PixflowDirectSiteAttachment[];
  history: Array<{ role: string; content: string }>;
  canvasId?: string;
  /** Page attached to this request; navigation must not retarget its tools. */
  canvasPostId?: number;
  bricksUseSiteStyles?: boolean;
  /** Omission uses the saved Bridge preference, defaulting on when unset. */
  enhancedDesignGuidance?: boolean;
}

export function bricksStylingInstructions(useSiteStyles = true): string {
  return 'Bricks styling convention: build with native Bricks global classes using consistent section/component names (for example studio-intro, studio-intro__heading). Put layout, typography, spacing, colours, responsive and pseudo-state styles on these classes, not element IDs or element-level style settings. Keep content, image selection, links and genuinely individual configuration on the elements. Inspect existing class usage before changing shared classes; create a scoped class when a change should affect only the new section. '
    + (useSiteStyles
      ? 'Design styling: Use site styles. Inspect and reuse suitable existing Bricks global classes, saved CSS variables and saved colour palette entries. Reference the actual variable names and colour entries rather than copying their resolved values. Create missing classes using those site values where suitable; explain any new values that are necessary.'
      : 'Design styling: Custom styling. Create scoped native global classes with design values chosen for this section. Existing site variables and colours are available but are not required.');
}

/** Live tools target one authenticated browser tab, never saved post metadata. */
export interface PixflowDirectCanvasCommand {
  /** Opaque owner of transient canvas feedback; never an execution credential. */
  presentationScope?: string;
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  postId: number;
  writable: boolean;
  expiresAt: number;
}
export interface PixflowDirectCanvasResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}
export interface PixflowDirectCanvasPollResult {
  command: PixflowDirectCanvasCommand | null;
  /** Active feedback owners. Omitted by older WordPress installations. */
  presentationScopes?: string[];
  /** Optional for compatibility with older WordPress installs. */
  frameworkRouteId?: string;
}
/** Native action acknowledgment; bricks.read remains the complete snapshot. */
export interface PixflowDirectCanvasActionResult {
  elementCount: number;
  globalClassCount: number;
  rendered: unknown[];
  [key: string]: unknown;
}
export interface PixflowDirectCanvasConnection {
  canvasId: string;
  postId: number;
  context?: PixflowBricksLiveContext;
}

/** Compiled in the builder, independently of agent runs. Site content is data. */
export interface PixflowBricksLiveContext {
  schemaVersion: 1;
  documentId: string;
  revision: number;
  postId: number;
  status: 'ready' | 'updating' | 'hydrating' | 'unavailable';
  updatedAt: string;
  markdown: string;
  sections: Record<string, unknown>;
}

/** One native BYOK provider turn transported through the owned WordPress session. */
export interface PixflowSiteProviderTurn {
  text: string;
  calls: Array<{ id: string; function: 'site_tool'; input: { name: string; arguments: Record<string, unknown> } }>;
  turns: unknown[];
}
