// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ owner: { restBaseUrl: 'https://a.test/wp-json', userId: 1 }, read: vi.fn() }));
vi.mock('../../src/pixflow/wordpress-context', () => ({ getPixflowWordPressConfig: () => state.owner }));
vi.mock('../../src/pixflow/chat-history-client', () => ({ readChatHistory: state.read }));
import { forgetLastActiveChat, rememberLastActiveChat, restoreLastActiveChat } from '../../src/pixflow/last-active-chat';
const binding = { projectId: '12345678-1234-1234-1234-123456789abc', conversationId: 'chat-a' };
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); state.owner = { restBaseUrl: 'https://a.test/wp-json', userId: 1 }; state.read.mockReset().mockResolvedValue({ messages: [] }); });
it('restores after tab/session storage is cleared, but rechecks server access', async () => {
  rememberLastActiveChat(binding); sessionStorage.clear();
  expect(await restoreLastActiveChat()).toEqual(binding);
  expect(state.read).toHaveBeenCalledWith(binding);
  expect(Object.values(localStorage).join('')).not.toContain('messages');
});
it('isolates sites and users and restores the original user after login', async () => {
  rememberLastActiveChat(binding);
  state.owner.userId = 2; expect(await restoreLastActiveChat()).toBeNull();
  state.owner.userId = 1; state.owner.restBaseUrl = 'https://b.test/wp-json'; expect(await restoreLastActiveChat()).toBeNull();
  state.owner.restBaseUrl = 'https://a.test/wp-json'; expect(await restoreLastActiveChat()).toEqual(binding);
});
it('never restores a denied or unavailable chat', async () => {
  rememberLastActiveChat(binding); state.read.mockRejectedValue(new Error('403'));
  expect(await restoreLastActiveChat()).toBeNull();
});
it('does not overwrite an explicit New chat while access is being checked', async () => {
  let finish!: (value: unknown) => void;
  state.read.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  rememberLastActiveChat(binding); const pending = restoreLastActiveChat();
  forgetLastActiveChat(); finish({ messages: [] }); expect(await pending).toBeNull();
});
it('does not restore across an account change during verification', async () => {
  state.read.mockImplementation(async () => { state.owner.userId = 2; return { messages: [] }; });
  rememberLastActiveChat(binding); expect(await restoreLastActiveChat()).toBeNull();
});
