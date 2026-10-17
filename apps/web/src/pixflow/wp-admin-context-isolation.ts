import {
  PIXFLOW_WP_ADMIN_CONTEXT_IDENTITY_SCHEMA,
  PIXFLOW_WP_ADMIN_MESSAGE_ORIGIN_SCHEMA,
  PIXFLOW_WP_ADMIN_PENDING_CLARIFICATION_SCHEMA,
  type PixflowWpAdminContextIdentity,
  type PixflowWpAdminMessageOrigin,
  type PixflowWpAdminPendingClarification,
} from '@open-design/contracts';

type RecordLike = Record<string, unknown>;

function record(value: unknown): RecordLike {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordLike : {};
}

function clean(value: unknown, max = 191): string {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
}

export function buildWpAdminContextIdentity(context: unknown, tabId: string): PixflowWpAdminContextIdentity | null {
  const root = record(context);
  const site = record(root.site);
  const user = record(root.user);
  const screen = record(root.screen);
  const object = record(root.object ?? root.resource);
  const siteHash = clean(site.hash ?? site.id, 128);
  const userId = clean(user.id, 80);
  const revision = clean(root.revision, 128);
  const safeTabId = clean(tabId, 128);
  if (!siteHash || !userId || !safeTabId || !revision) return null;
  const objectKind = clean(object.kind || 'screen', 64) || 'screen';
  const objectType = clean(object.type ?? object.postType ?? object.taxonomy ?? screen.postType ?? screen.taxonomy, 80);
  const rawId = object.id;
  const objectId = typeof rawId === 'number' && Number.isFinite(rawId)
    ? rawId
    : clean(rawId, 120) || null;
  return {
    schema: PIXFLOW_WP_ADMIN_CONTEXT_IDENTITY_SCHEMA,
    version: 1,
    siteHash,
    userId,
    surface: 'wp_admin',
    objectKind,
    objectType,
    objectId,
    screenId: clean(screen.id, 80),
    screenBase: clean(screen.base, 80),
    adminArea: clean(screen.parentBase ?? screen.base, 80),
    contextRevision: revision,
    contentFingerprint: clean(object.contentFingerprint, 160) || null,
    tabId: safeTabId,
  };
}

export function wpAdminContextScopeKey(identity: PixflowWpAdminContextIdentity): string {
  const objectId = identity.objectId === null ? 'none' : String(identity.objectId);
  return [identity.siteHash, identity.userId, identity.surface, identity.objectKind, identity.objectType || 'none', objectId]
    .map((part) => encodeURIComponent(part)).join(':');
}

export function wpAdminTabContextKey(identity: PixflowWpAdminContextIdentity): string {
  return `${wpAdminContextScopeKey(identity)}:${encodeURIComponent(identity.tabId)}`;
}

export function sameWpAdminContext(left: PixflowWpAdminContextIdentity | null, right: PixflowWpAdminContextIdentity | null): boolean {
  return Boolean(left && right && wpAdminContextScopeKey(left) === wpAdminContextScopeKey(right));
}

export function buildWpAdminMessageOrigin(
  context: PixflowWpAdminContextIdentity,
  conversationId: string,
  sourceMessageId: string,
  messageId: string,
  createdAt = Date.now(),
  authority: 'authoritative' | 'display_only' = 'authoritative',
): PixflowWpAdminMessageOrigin {
  return {
    schema: PIXFLOW_WP_ADMIN_MESSAGE_ORIGIN_SCHEMA,
    version: 1,
    context,
    conversationId: clean(conversationId),
    sourceMessageId: clean(sourceMessageId),
    messageId: clean(messageId),
    createdAt,
    authority,
  };
}

type MessageWithOrigin = { id?: string; role?: string; content?: string; runStatus?: string; originContext?: PixflowWpAdminMessageOrigin };

export function authoritativeWpAdminMessages<T extends MessageWithOrigin>(
  messages: T[],
  context: PixflowWpAdminContextIdentity,
  conversationId: string,
): T[] {
  const discardedSources = new Set(messages.flatMap((message) => (
    message.role === 'assistant'
      && ['failed', 'canceled', 'cancelled'].includes(clean(message.runStatus, 32))
      && message.originContext?.sourceMessageId
      ? [message.originContext.sourceMessageId]
      : []
  )));
  return messages.filter((message) => {
    const origin = message.originContext;
    return Boolean(origin
      && origin.schema === PIXFLOW_WP_ADMIN_MESSAGE_ORIGIN_SCHEMA
      && origin.authority === 'authoritative'
      && origin.conversationId === conversationId
      && !discardedSources.has(origin.sourceMessageId)
      && sameWpAdminContext(origin.context, context));
  });
}

export function buildWpAdminPendingClarification(input: {
  conversationId: string;
  sourceMessageId: string;
  target: PixflowWpAdminContextIdentity;
  intent: Record<string, unknown>;
  candidates: string[];
  clarification: string;
  now?: number;
  ttlMs?: number;
}): PixflowWpAdminPendingClarification {
  const now = input.now ?? Date.now();
  return {
    schema: PIXFLOW_WP_ADMIN_PENDING_CLARIFICATION_SCHEMA,
    version: 1,
    clarificationId: `clarification:${now.toString(36)}:${clean(input.sourceMessageId, 60)}`,
    conversationId: clean(input.conversationId),
    sourceMessageId: clean(input.sourceMessageId),
    targetContext: input.target,
    originalIntent: input.intent,
    candidateTargets: input.candidates.map((item) => clean(item, 240)).filter(Boolean).slice(0, 16),
    clarification: clean(input.clarification, 2_000),
    contextRevision: input.target.contextRevision,
    contentFingerprint: input.target.contentFingerprint,
    status: 'awaiting_user',
    createdAt: now,
    expiresAt: now + Math.max(1_000, Math.min(input.ttlMs ?? 30 * 60_000, 24 * 60 * 60_000)),
  };
}

export function canContinueWpAdminClarification(
  pending: PixflowWpAdminPendingClarification | null,
  context: PixflowWpAdminContextIdentity,
  conversationId: string,
  now = Date.now(),
): { ok: true } | { ok: false; reason: 'missing' | 'inactive' | 'expired' | 'conversation_mismatch' | 'context_mismatch' | 'revision_mismatch' } {
  if (!pending) return { ok: false, reason: 'missing' };
  if (pending.status !== 'awaiting_user') return { ok: false, reason: 'inactive' };
  if (now >= pending.expiresAt) return { ok: false, reason: 'expired' };
  if (!sameWpAdminContext(pending.targetContext, context)) return { ok: false, reason: 'context_mismatch' };
  if (pending.conversationId !== conversationId) return { ok: false, reason: 'conversation_mismatch' };
  if (pending.contextRevision !== context.contextRevision
    || (pending.contentFingerprint && pending.contentFingerprint !== context.contentFingerprint)) {
    return { ok: false, reason: 'revision_mismatch' };
  }
  return { ok: true };
}

export function transitionWpAdminContextAuthority<T extends { id: string }, U>(state: {
  identity: PixflowWpAdminContextIdentity;
  pendingActions: T[];
  pendingClarification: PixflowWpAdminPendingClarification | null;
  approvalToken: string | null;
  preparedReceiptId: string | null;
  ui: U;
}, next: PixflowWpAdminContextIdentity) {
  if (sameWpAdminContext(state.identity, next)) return { ...state, identity: next, changed: false };
  return {
    identity: next,
    pendingActions: [] as T[],
    pendingClarification: null,
    approvalToken: null,
    preparedReceiptId: null,
    ui: state.ui,
    changed: true,
  };
}

export function sanitizeUnsupportedReviewClaim(text: string, hasTypedAction: boolean): string {
  if (hasTypedAction || !/(?:review\s+card|action\s+review).{0,40}(?:ready|prepared|available)|(?:ready|prepared).{0,40}(?:review\s+card|action\s+review)/i.test(text)) return text;
  return 'No review was prepared. Pixflow did not create an actionable WordPress change, so nothing can be approved or applied.';
}

export function contextBoundWpAdminAction<T extends RecordLike>(
  action: T,
  context: PixflowWpAdminContextIdentity,
  conversationId: string,
  sourceMessageId: string,
): T & { contextBinding: Omit<import('@open-design/contracts').PixflowWpAdminContextAuthorityBinding, 'contextAuthority'> } {
  return {
    ...action,
    contextBinding: {
      contextIdentity: context,
      contextScope: wpAdminTabContextKey(context),
      conversationId: clean(conversationId),
      sourceMessageId: clean(sourceMessageId),
      tabId: context.tabId,
      targetProvenance: 'active_context_target',
    },
  };
}
