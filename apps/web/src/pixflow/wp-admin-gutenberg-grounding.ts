export type PixflowWpAdminExactReadCheck =
  | { ok: true; postId: number; fingerprint: string; readMode: 'inline' | 'chunked'; complete: boolean }
  | { ok: false; reason: string };

export type PixflowWpAdminExpectedReadAuthority = {
  conversationId: string;
  sourceMessageId: string;
  tabId: string;
  contextIdentity?: { objectId?: number | string | null; contextRevision?: string; contentFingerprint?: string | null };
};

export function wpAdminContextPostId(context: unknown): number {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return 0;
  const source = context as Record<string, unknown>;
  const object = source.object && typeof source.object === 'object' && !Array.isArray(source.object)
    ? source.object as Record<string, unknown>
    : source.resource && typeof source.resource === 'object' && !Array.isArray(source.resource)
      ? source.resource as Record<string, unknown>
      : {};
  const id = Number(object.id || 0);
  return Number.isInteger(id) && id > 0 && String(object.kind || 'post') === 'post' ? id : 0;
}

export function validateWpAdminExactGutenbergRead(value: unknown, expectedPostId: number, expectedAuthority?: PixflowWpAdminExpectedReadAuthority): PixflowWpAdminExactReadCheck {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: 'missing_result' };
  const result = value as Record<string, unknown>;
  if (result.schema !== 'pixflow.wp-admin.gutenberg-read.v2') return { ok: false, reason: 'invalid_schema' };
  const post = result.post && typeof result.post === 'object' && !Array.isArray(result.post) ? result.post as Record<string, unknown> : {};
  if (Number(post.id || 0) !== expectedPostId) return { ok: false, reason: 'post_mismatch' };
  const contextIdentity = result.contextIdentity && typeof result.contextIdentity === 'object' && !Array.isArray(result.contextIdentity)
    ? result.contextIdentity as Record<string, unknown> : {};
  if (Number(contextIdentity.objectId || 0) !== expectedPostId) return { ok: false, reason: 'context_mismatch' };
  const authority = result.readAuthority && typeof result.readAuthority === 'object' && !Array.isArray(result.readAuthority)
    ? result.readAuthority as Record<string, unknown> : {};
  if (expectedAuthority && (
    String(authority.conversationId || '') !== expectedAuthority.conversationId
    || String(authority.sourceMessageId || '') !== expectedAuthority.sourceMessageId
    || String(authority.tabId || '') !== expectedAuthority.tabId
  )) return { ok: false, reason: 'authority_mismatch' };
  const document = result.document && typeof result.document === 'object' && !Array.isArray(result.document) ? result.document as Record<string, unknown> : {};
  const fingerprint = String(result.fingerprint || '');
  if (!fingerprint.startsWith('sha256:') || !String(document.contentSha256 || '').startsWith('sha256:')) return { ok: false, reason: 'missing_fingerprint' };
  if (result.contentTruncated === true) return { ok: false, reason: 'truncated' };
  if (expectedAuthority?.contextIdentity?.contextRevision
    && String(result.contextRevision || '') !== expectedAuthority.contextIdentity.contextRevision) return { ok: false, reason: 'revision_mismatch' };
  if (expectedAuthority?.contextIdentity?.contentFingerprint
    && String(result.contentFingerprint || '') !== expectedAuthority.contextIdentity.contentFingerprint) return { ok: false, reason: 'content_fingerprint_mismatch' };
  const readMode = result.readMode === 'chunked' ? 'chunked' : result.readMode === 'inline' ? 'inline' : null;
  if (!readMode) return { ok: false, reason: 'invalid_read_mode' };
  const complete = result.contentComplete === true && result.blockTreeComplete === true;
  if (readMode === 'inline' && !complete) return { ok: false, reason: 'incomplete_inline_result' };
  if (readMode === 'inline' && typeof result.contentRaw !== 'string') return { ok: false, reason: 'missing_content' };
  return { ok: true, postId: expectedPostId, fingerprint, readMode, complete };
}

/** JSON is either complete or replaced by an explicit valid omission envelope. */
export function serializeWpAdminPromptEvidence(value: unknown, maxChars: number, label: string): string {
  try {
    const encoded = JSON.stringify(value);
    if (encoded.length <= maxChars) return encoded;
    return JSON.stringify({
      schema: 'pixflow.wp-admin.bounded-evidence.v1',
      label,
      contentComplete: false,
      contentTruncated: false,
      omitted: true,
      reason: 'encoded_size_limit',
      encodedCharacters: encoded.length,
      maxCharacters: maxChars,
    });
  } catch {
    return JSON.stringify({
      schema: 'pixflow.wp-admin.bounded-evidence.v1', label, contentComplete: false,
      contentTruncated: false, omitted: true, reason: 'json_encoding_failed',
    });
  }
}

type EditorStore = { isEditedPostDirty?: () => boolean; getCurrentPostId?: () => number };

/** Detects a dirty same-post Gutenberg store without reading or changing it. */
export function wpAdminDirtyEditorState(postId: number, browserWindow: Window | undefined = typeof window === 'undefined' ? undefined : window): { dirty: boolean; source: 'live_editor' | 'persisted_wordpress'; reason?: string } {
  if (!browserWindow || postId < 1) return { dirty: false, source: 'persisted_wordpress' };
  try {
    const owner = browserWindow.parent && browserWindow.parent !== browserWindow ? browserWindow.parent : browserWindow;
    const wp = (owner as Window & { wp?: { data?: { select?: (store: string) => EditorStore | undefined } } }).wp;
    const editor = wp?.data?.select?.('core/editor');
    const currentPostId = Number(editor?.getCurrentPostId?.() || 0);
    if (currentPostId === postId && editor?.isEditedPostDirty?.() === true) {
      return { dirty: true, source: 'live_editor', reason: 'unsaved_editor_changes' };
    }
  } catch {
    // Cross-frame or unavailable stores are not treated as proof of dirty state.
  }
  return { dirty: false, source: 'persisted_wordpress' };
}
