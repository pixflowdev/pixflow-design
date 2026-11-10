// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement, StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ read: vi.fn(), navigate: vi.fn() }));
vi.mock('../../src/pixflow/wordpress-context', () => ({ hasPixflowWordPressContext: () => true, getPixflowWordPressConfig: () => ({ restBaseUrl: 'https://a.test/wp-json', userId: 1 }) }));
vi.mock('../../src/pixflow/chat-history-client', () => ({ readChatHistory: mock.read, mergeChatHistory: vi.fn() }));
vi.mock('../../src/router', async importOriginal => ({ ...await importOriginal<typeof import('../../src/router')>(), navigate: mock.navigate }));
import { rememberLastActiveChat, restoreLastActiveChat } from '../../src/pixflow/last-active-chat';
import { rememberFloatingConversation, useFloatingConversation } from '../../src/pixflow/floating-conversation';
import { useLastActiveWorkspaceChat } from '../../src/pixflow/use-last-active-workspace-chat';
import { conversationSessionKey } from '../../src/pixflow/conversation-address';
const binding = { projectId: '12345678-1234-1234-1234-123456789abc', conversationId: 'saved-chat' };
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); location.hash = ''; mock.read.mockReset().mockResolvedValue({ messages: [] }); mock.navigate.mockReset(); });
afterEach(cleanup);
it('opens Home in a fresh session even with a previous chat', () => {
  rememberLastActiveChat(binding);
  renderHook(() => useLastActiveWorkspaceChat({kind:'home', view:'home'}, true));
  expect(mock.navigate).not.toHaveBeenCalled();
});
it('starts a fresh panel without restoring a previous browser session', async () => {
  rememberLastActiveChat(binding);
  sessionStorage.clear();
  const first = renderHook(() => useFloatingConversation('native-legacy', 'admin'));
  const freshKey = first.result.current.historyKey;
  expect(freshKey).not.toBe('native-legacy');
  expect(freshKey).not.toBe(conversationSessionKey(binding));
  expect(first.result.current.continuing).toBe(false);
  expect(await restoreLastActiveChat()).toBeNull();
  expect(mock.read).not.toHaveBeenCalled();
  first.unmount();
  sessionStorage.clear();
  const second = renderHook(() => useFloatingConversation('native-legacy', 'admin'));
  expect(second.result.current.historyKey).not.toBe(freshKey);
});
it('retains the session chat across an editor switch and a late Bricks session update', () => {
  const key = conversationSessionKey(binding);
  rememberFloatingConversation(key, 'admin');
  const gutenberg = renderHook(() => useFloatingConversation('admin-native', 'admin'));
  expect(gutenberg.result.current.historyKey).toBe(key);
  gutenberg.unmount();
  const bricks = renderHook(({ native }) => useFloatingConversation(native, 'bricks'), { initialProps: { native: 'bricks-initial' } });
  expect(bricks.result.current.historyKey).toBe(key);
  bricks.rerender({ native: 'bricks-canvas-ready' });
  expect(bricks.result.current.historyKey).toBe(key);
  expect(bricks.result.current.surface).toBe('admin');
});
it('restores SEO Audit after reopening in the same session', () => {
  const first=renderHook(()=>useLastActiveWorkspaceChat({kind:'home',view:'seo-audit'},true));
  first.unmount();
  renderHook(()=>useLastActiveWorkspaceChat({kind:'home',view:'home'},true), {
    wrapper: ({children})=>createElement(StrictMode,null,children),
  });
  expect(mock.navigate).toHaveBeenCalledExactlyOnceWith({kind:'home',view:'seo-audit'},{replace:true});
});
it('does not hijack explicit Workspace URLs', async () => {
  rememberLastActiveChat(binding); location.hash = '#pixflow-explicit';
  const route = { kind: 'home', view: 'home' } as const;
  renderHook(() => useLastActiveWorkspaceChat(route, true));
  await act(async () => {});
  expect(mock.navigate).not.toHaveBeenCalled();
});
it('does not restore when New chat follows an explicit initial route', async () => {
  rememberLastActiveChat(binding); location.hash = '#pixflow-explicit';
  const hook = renderHook(({ route }) => useLastActiveWorkspaceChat(route, true), { initialProps: { route: { kind: 'home', view: 'home' } as const } });
  location.hash = '';
  hook.rerender({ route: { kind: 'home', view: 'home' } });
  await act(async () => {});
  expect(mock.navigate).not.toHaveBeenCalled();
});
