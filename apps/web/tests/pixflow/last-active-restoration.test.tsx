// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ read: vi.fn(), navigate: vi.fn() }));
vi.mock('../../src/pixflow/wordpress-context', () => ({ getPixflowWordPressConfig: () => ({ restBaseUrl: 'https://a.test/wp-json', userId: 1 }) }));
vi.mock('../../src/pixflow/chat-history-client', () => ({ readChatHistory: mock.read, mergeChatHistory: vi.fn() }));
vi.mock('../../src/router', () => ({ navigate: mock.navigate }));
import { rememberLastActiveChat } from '../../src/pixflow/last-active-chat';
import { useFloatingConversation } from '../../src/pixflow/floating-conversation';
import { useLastActiveWorkspaceChat } from '../../src/pixflow/use-last-active-workspace-chat';
import { conversationSessionKey } from '../../src/pixflow/conversation-address';
const binding = { projectId: '12345678-1234-1234-1234-123456789abc', conversationId: 'saved-chat' };
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); location.hash = ''; mock.read.mockReset().mockResolvedValue({ messages: [] }); mock.navigate.mockReset(); });
afterEach(cleanup);
it('restores the floating panel in a fresh tab without starting a run', async () => {
  rememberLastActiveChat(binding);
  const hook = renderHook(() => useFloatingConversation('native-new', 'bricks'));
  expect(hook.result.current.restoring).toBe(true);
  await waitFor(() => expect(hook.result.current.restoring).toBe(false));
  expect(hook.result.current.historyKey).toBe(conversationSessionKey(binding));
  expect(mock.navigate).not.toHaveBeenCalled();
});
it('lets New chat win over a pending floating restoration', async () => {
  let finish!: (value: unknown) => void;
  mock.read.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  rememberLastActiveChat(binding);
  const hook = renderHook(({ key }) => useFloatingConversation(key, 'admin'), { initialProps: { key: 'old' } });
  hook.rerender({ key: 'new' });
  await act(async () => finish({ messages: [] }));
  expect(hook.result.current.historyKey).toBe('new');
  expect(hook.result.current.restoring).toBe(false);
});
it('restores an empty Workspace entry after permission verification', async () => {
  rememberLastActiveChat(binding);
  const route = { kind: 'home', view: 'home' } as const;
  renderHook(() => useLastActiveWorkspaceChat(route, true));
  await waitFor(() => expect(mock.navigate).toHaveBeenCalledWith({ kind: 'project', ...binding, fileName: null }, { replace: true }));
});
it('does not hijack explicit Workspace URLs', async () => {
  rememberLastActiveChat(binding); location.hash = '#pixflow-explicit';
  const route = { kind: 'home', view: 'home' } as const;
  renderHook(() => useLastActiveWorkspaceChat(route, true));
  await act(async () => {});
  expect(mock.navigate).not.toHaveBeenCalled();
});
