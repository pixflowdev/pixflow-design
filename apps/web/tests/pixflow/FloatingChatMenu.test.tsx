// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ list: vi.fn(), conversations: vi.fn(), read: vi.fn(), select: vi.fn() }));
vi.mock('../../src/i18n', () => ({ useT: () => (key: string) => key }));
vi.mock('../../src/pixflow/chat-history-client', () => ({ listChatHistory: api.list, readChatHistory: api.read }));
vi.mock('../../src/pixflow/floating-conversation', () => ({ selectFloatingConversation: api.select, readFloatingConversation: () => null }));
vi.mock('../../src/state/projects', () => ({ listProjects: api.list, listConversations: api.conversations }));
vi.mock('../../src/state/workspace-organization', () => ({ useWorkspaceOrganization: () => ({ organization: { revision: 1, projects: [], chats: {}, sidebarCollapsed: false }, loading: false, error: null }) }));
import { FloatingChatMenu } from '../../src/pixflow/FloatingChatMenu';
const chat = { projectId: 'project', conversationId: 'chat', title: 'Website brief' };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  api.list.mockResolvedValue([{ id: chat.projectId, name: chat.title, createdAt: 1, updatedAt: 2 }]);
  api.conversations.mockResolvedValue([{ id: chat.conversationId }]);
  api.read.mockResolvedValue({ messages: [] }); api.select.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('places the menu control in the native panel header without adding a chat toolbar', () => {
  const { container } = render(<div className="pixflow-bricks-agent-panel"><header className="pixflow-bricks-agent-panel__head"/><FloatingChatMenu /></div>);
  const button = screen.getByRole('button', { name: 'chat.conversationsAria' });
  expect(button.closest('.pixflow-bricks-agent-panel__head')).not.toBeNull();
  expect(container.querySelector('[data-header="true"]')).not.toBeNull();
});
async function open() {
  render(<FloatingChatMenu />);
  fireEvent.click(screen.getByRole('button', { name: 'chat.conversationsAria' }));
  return screen.findByRole('button', { name: 'Website brief' });
}
it('opens the selected chat directly and closes the drawer after selection succeeds', async () => {
  fireEvent.click(await open());
  await waitFor(() => expect(api.select).toHaveBeenCalledWith({ projectId: chat.projectId, conversationId: chat.conversationId }, expect.objectContaining({ signal: expect.any(AbortSignal) })));
  await waitFor(() => expect(document.querySelector('[data-open]')?.getAttribute('data-open') === 'true').toBe(false));
  expect(api.read).toHaveBeenCalledWith({ projectId: chat.projectId, conversationId: chat.conversationId });
});
it('keeps the menu open when access is denied, without switching chats', async () => {
  api.read.mockRejectedValue(new Error('Forbidden'));
  fireEvent.click(await open());
  await screen.findByRole('alert');
  expect(api.select).not.toHaveBeenCalled();
  expect(document.querySelector('[data-open]')?.getAttribute('data-open') === 'true').toBe(true);
});
it('shows the busy handoff state and cancels selection when dismissed', async () => {
  api.select.mockImplementation((_row, options) => { options.onWaiting(); return new Promise(() => {}); });
  fireEvent.click(await open());
  await screen.findByText('history.switchWaiting');
  const signal = api.select.mock.calls[0]![1].signal;
  fireEvent.click(screen.getByRole('button', { name: 'chat.conversationsAria' }));
  expect(signal.aborted).toBe(true);
});

it('does not switch chats if dismissed while resolving the conversation', async () => {
  let resolve!: (rows: Array<{ id: string }>) => void;
  api.conversations.mockImplementation(() => new Promise(done => { resolve = done; }));
  fireEvent.click(await open());
  fireEvent.click(screen.getByRole('button', { name: 'chat.conversationsAria' }));
  resolve([{ id: chat.conversationId }]);
  await waitFor(() => expect(api.conversations).toHaveBeenCalled());
  expect(api.read).not.toHaveBeenCalled();
  expect(api.select).not.toHaveBeenCalled();
});

it('reports conversation lookup failure without an unhandled rejection', async () => {
  api.conversations.mockRejectedValue(new Error('Forbidden'));
  fireEvent.click(await open());
  await screen.findByRole('alert');
  expect(api.select).not.toHaveBeenCalled();
});
