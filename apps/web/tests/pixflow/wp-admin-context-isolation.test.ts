import { describe, expect, it } from 'vitest';

import {
  authoritativeWpAdminMessages,
  buildWpAdminContextIdentity,
  buildWpAdminMessageOrigin,
  buildWpAdminPendingClarification,
  canContinueWpAdminClarification,
  contextBoundWpAdminAction,
  sanitizeUnsupportedReviewClaim,
  transitionWpAdminContextAuthority,
  wpAdminContextScopeKey,
  wpAdminTabContextKey,
} from '../../src/pixflow/wp-admin-context-isolation';

const context = (postId: number, revision = `revision-${postId}`) => ({
  schema: 'pixflow.wp-admin.context.v1',
  surface: 'wp_admin',
  revision,
  site: { hash: 'site-hash' },
  user: { id: 2 },
  screen: { id: 'post', base: 'post', postType: 'post', isAdmin: true, verified: true },
  object: { kind: 'post', type: 'post', id: postId, verified: true, contentFingerprint: `sha256:post-${postId}` },
});

describe('WP Admin object-context isolation', () => {
  it('creates distinct authoritative conversation scopes for posts 42 and 54', () => {
    const post42 = buildWpAdminContextIdentity(context(42), 'tab-a');
    const post54 = buildWpAdminContextIdentity(context(54), 'tab-a');
    expect(post42).not.toBeNull();
    expect(post54).not.toBeNull();
    expect(wpAdminContextScopeKey(post42!)).not.toBe(wpAdminContextScopeKey(post54!));
  });

  it('filters old-post and legacy messages from authoritative grounding', () => {
    const post42 = buildWpAdminContextIdentity(context(42), 'tab-a')!;
    const post54 = buildWpAdminContextIdentity(context(54), 'tab-a')!;
    const messages = [
      { id: 'legacy', role: 'assistant' as const, content: 'Old contextless article' },
      { id: 'm42', role: 'assistant' as const, content: 'Post 42 final paragraph', originContext: buildWpAdminMessageOrigin(post42, 'c42', 'u42', 'm42', 1) },
      { id: 'm54', role: 'user' as const, content: 'The second one', originContext: buildWpAdminMessageOrigin(post54, 'c54', 'u54', 'm54', 2) },
    ];
    expect(authoritativeWpAdminMessages(messages, post54, 'c54').map((message) => message.id)).toEqual(['m54']);
  });

  it('excludes failed and cancelled turns from authoritative continuation', () => {
    const post54 = buildWpAdminContextIdentity(context(54), 'tab-a')!;
    const messages = [
      { id: 'u-failed', role: 'user' as const, content: 'Prepare an edit', originContext: buildWpAdminMessageOrigin(post54, 'c54', 'u-failed', 'u-failed', 1) },
      { id: 'a-failed', role: 'assistant' as const, content: 'A review is ready', runStatus: 'failed', originContext: buildWpAdminMessageOrigin(post54, 'c54', 'u-failed', 'a-failed', 2) },
      { id: 'u-canceled', role: 'user' as const, content: 'Prepare another edit', originContext: buildWpAdminMessageOrigin(post54, 'c54', 'u-canceled', 'u-canceled', 3) },
      { id: 'a-canceled', role: 'assistant' as const, content: 'Stopped', runStatus: 'canceled', originContext: buildWpAdminMessageOrigin(post54, 'c54', 'u-canceled', 'a-canceled', 4) },
      { id: 'u-ok', role: 'user' as const, content: 'Read the post', originContext: buildWpAdminMessageOrigin(post54, 'c54', 'u-ok', 'u-ok', 5) },
      { id: 'a-ok', role: 'assistant' as const, content: 'Read complete', runStatus: 'succeeded', originContext: buildWpAdminMessageOrigin(post54, 'c54', 'u-ok', 'a-ok', 6) },
    ];
    expect(authoritativeWpAdminMessages(messages, post54, 'c54').map((message) => message.id)).toEqual(['u-ok', 'a-ok']);
  });

  it('binds pending clarification to its post across reload and rejects it after navigation', () => {
    const post54 = buildWpAdminContextIdentity(context(54), 'tab-a')!;
    const pending = buildWpAdminPendingClarification({
      conversationId: 'c54', sourceMessageId: 'u54', target: post54,
      intent: { kind: 'insert_after_section' }, candidates: ['first Benefits', 'second Benefits'],
      clarification: 'Which Benefits section?', now: 100, ttlMs: 5_000,
    });
    expect(canContinueWpAdminClarification(pending, post54, 'c54', 101)).toEqual({ ok: true });
    const hydrated = JSON.parse(JSON.stringify(pending));
    expect(canContinueWpAdminClarification(hydrated, post54, 'c54', 102)).toEqual({ ok: true });
    const post42 = buildWpAdminContextIdentity(context(42), 'tab-a')!;
    expect(canContinueWpAdminClarification(pending, post42, 'c42', 103)).toMatchObject({ ok: false, reason: 'context_mismatch' });
    expect(canContinueWpAdminClarification(pending, buildWpAdminContextIdentity(context(54, 'changed'), 'tab-a')!, 'c54', 104))
      .toMatchObject({ ok: false, reason: 'revision_mismatch' });
  });

  it('clears mutation state on context change while retaining visual preferences', () => {
    const post42 = buildWpAdminContextIdentity(context(42), 'tab-a')!;
    const post54 = buildWpAdminContextIdentity(context(54), 'tab-a')!;
    expect(transitionWpAdminContextAuthority({
      identity: post42,
      pendingActions: [{ id: 'review-42' }],
      pendingClarification: buildWpAdminPendingClarification({
        conversationId: 'c42', sourceMessageId: 'u42', target: post42,
        intent: {}, candidates: [], clarification: 'Which one?', now: 100, ttlMs: 5_000,
      }),
      approvalToken: 'approval-42', preparedReceiptId: 'receipt-42',
      ui: { open: true, width: 380, height: 560 },
    }, post54)).toEqual({
      identity: post54,
      pendingActions: [], pendingClarification: null,
      approvalToken: null, preparedReceiptId: null,
      ui: { open: true, width: 380, height: 560 },
      changed: true,
    });
  });

  it('requires typed action state before claiming a review is ready', () => {
    expect(sanitizeUnsupportedReviewClaim('A review card is ready for post 42.', false))
      .toContain('No review was prepared');
    expect(sanitizeUnsupportedReviewClaim('A review card is ready for post 54.', true))
      .toBe('A review card is ready for post 54.');
  });

  it('binds actions to the current context and tab', () => {
    const post42a = buildWpAdminContextIdentity(context(42), 'tab-a')!;
    const post42b = buildWpAdminContextIdentity(context(42), 'tab-b')!;
    const action = contextBoundWpAdminAction({ id: 'action-42' }, post42a, 'c42', 'u42');
    expect(action.contextBinding.tabId).toBe('tab-a');
    expect(action.contextBinding.contextScope).toBe(wpAdminTabContextKey(post42a));
    expect(action.contextBinding.contextScope).not.toBe(wpAdminTabContextKey(post42b));
    expect(wpAdminContextScopeKey(post42a)).toBe(wpAdminContextScopeKey(post42b));
  });
});
