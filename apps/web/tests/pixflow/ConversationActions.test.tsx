// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({read: vi.fn(), select: vi.fn()}));
vi.mock('../../src/i18n', () => ({useT: () => (key: string) => key}));
vi.mock('../../src/pixflow/chat-history-client', () => ({readChatHistory: api.read}));
vi.mock('../../src/pixflow/floating-conversation', () => ({selectFloatingConversation: api.select}));
vi.mock('../../src/pixflow/wordpress-context', () => ({getPixflowWordPressConfig: () => ({workspaceAvailable:true})}));
import { ConversationActions } from '../../src/pixflow/ConversationActions';
const binding = {projectId:'12345678-1234-1234-1234-123456789abc',conversationId:'saved-chat'};
beforeEach(() => { vi.clearAllMocks(); api.read.mockResolvedValue({messages:[]}); api.select.mockResolvedValue(undefined); });
afterEach(cleanup);
it('checks server access before selecting the exact saved chat', async () => {
  render(<ConversationActions binding={binding}/>);
  fireEvent.click(screen.getByRole('button',{name:'history.continuePanel'}));
  await waitFor(() => expect(api.select).toHaveBeenCalledWith(binding, expect.objectContaining({signal:expect.any(AbortSignal)})));
  expect(api.read).toHaveBeenCalledWith(binding);
});
it('does not select or open a chat when server permissions reject it', async () => {
  api.read.mockRejectedValue(new Error('Forbidden'));
  render(<ConversationActions binding={binding}/>);
  fireEvent.click(screen.getByRole('button',{name:'history.continuePanel'}));
  await screen.findByRole('alert');
  expect(api.select).not.toHaveBeenCalled();
});
it('opens Workspace using the existing conversation identity', async () => {
  const listener = vi.fn(); window.addEventListener('pixflow-design:open-saved-conversation',listener);
  render(<ConversationActions binding={binding}/>);
  fireEvent.click(screen.getByRole('button',{name:'ui.wpAdminOnboardingHost.openWorkspace'}));
  await waitFor(() => expect(listener).toHaveBeenCalled());
  expect(listener.mock.calls[0]![0].detail).toEqual(binding);
  expect(api.select).not.toHaveBeenCalled();
  window.removeEventListener('pixflow-design:open-saved-conversation',listener);
});
