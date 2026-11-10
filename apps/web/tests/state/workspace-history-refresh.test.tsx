// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWorkspaceHistoryRefresh } from '../../src/state/use-workspace-history-refresh';
const fixtures = vi.hoisted(() => ({ account: 'one', read: vi.fn(), pending: vi.fn() }));
vi.mock('../../src/pixflow/chat-history-client', () => ({ chatHistoryOwnerScope: () => fixtures.account }));
vi.mock('../../src/state/chat-history', () => ({ listMessagePage: fixtures.read }));
vi.mock('../../src/state/workspace-history-persistence', () => ({ workspaceHistoryPendingMessages: fixtures.pending }));
const reply = { id: 'reply', role: 'assistant', content: 'Completed remotely', historyRevision: 4 };
beforeEach(() => { vi.clearAllMocks(); fixtures.account = 'one'; fixtures.pending.mockReturnValue([]); fixtures.read.mockResolvedValue({ messages: [reply] }); });
afterEach(cleanup);
it('refreshes a passive Workspace on focus without a write path', async () => {
  const accept = vi.fn();
  renderHook(() => useWorkspaceHistoryRefresh('project', 'chat', true, accept));
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(accept).toHaveBeenCalledWith([reply]));
  expect(fixtures.read).toHaveBeenCalledWith('project', 'chat');
});
it('excludes unacknowledged local messages', async () => {
  fixtures.pending.mockReturnValue([{ ...reply, content: 'Unsaved work' }]);
  const accept = vi.fn();
  renderHook(() => useWorkspaceHistoryRefresh('project', 'chat', true, accept));
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(accept).toHaveBeenCalledWith([]));
});
it('does not poll during a local run', () => {
  renderHook(() => useWorkspaceHistoryRefresh('project', 'chat', false, vi.fn()));
  act(() => window.dispatchEvent(new Event('focus')));
  expect(fixtures.read).not.toHaveBeenCalled();
});
it.each(['account', 'conversation'])('rejects a late response after changing %s', async kind => {
  let resolve!: (value: unknown) => void;
  fixtures.read.mockReturnValue(new Promise(done => { resolve = done; }));
  const accept = vi.fn();
  const owner = renderHook(({ chat }) => useWorkspaceHistoryRefresh('project', chat, true, accept), { initialProps: { chat: 'first' } });
  act(() => window.dispatchEvent(new Event('focus')));
  if (kind === 'account') fixtures.account = 'two'; else owner.rerender({ chat: 'second' });
  await act(async () => resolve({ messages: [reply] }));
  expect(accept).not.toHaveBeenCalled();
});
