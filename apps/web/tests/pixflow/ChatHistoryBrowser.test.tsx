// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatHistoryBrowser } from '../../src/pixflow/ChatHistoryBrowser';
const api = vi.hoisted(() => ({ listChatHistory: vi.fn(), readChatHistory: vi.fn() }));
vi.mock('../../src/pixflow/chat-history-client', async original => ({ ...await original<typeof import('../../src/pixflow/chat-history-client')>(), ...api }));
vi.mock('../../src/i18n', () => ({ useT: () => (key: string) => key }));
vi.mock('../../src/components/shared-chat/SharedChatRows', () => ({ SharedChatRows: ({ messages }: { messages: Array<{ content: string }> }) => <div>{messages.map(message => message.content).join('|')}</div> }));
beforeEach(() => {
  api.listChatHistory.mockReset(); api.readChatHistory.mockReset();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);
it('discovers a server chat with empty browser storage and views earlier messages without changing a live session', async () => {
  localStorage.clear(); sessionStorage.clear();
  const chat = { projectId: 'saved-project', conversationId: 'saved-chat', title: 'Saved customer brief', messageCount: 51 };
  api.listChatHistory.mockResolvedValue({ conversations: [chat], hasMore: false, nextCursor: null });
  api.readChatHistory.mockResolvedValueOnce({ messages: [{ id: 'recent', content: 'Recent full answer' }], hasMore: true, nextCursor: 'older' })
    .mockResolvedValueOnce({ messages: [{ id: 'old', content: 'Original customer brief' }], hasMore: false, nextCursor: null });
  render(<ChatHistoryBrowser />);
  fireEvent.click(screen.getAllByRole('button', { name: 'chat.conversationsAria' })[0]!);
  fireEvent.click(await screen.findByRole('button', { name: 'Saved customer brief' }));
  await screen.findByText('Recent full answer');
  fireEvent.click(screen.getByRole('button', { name: 'history.loadEarlier' }));
  await screen.findByText('Original customer brief|Recent full answer');
  expect(api.readChatHistory).toHaveBeenLastCalledWith(chat, 'older');
  fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
  await waitFor(() => expect(document.querySelector('dialog')?.hasAttribute('open')).toBe(false));
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});
it('retries a failed older page at the same cursor while retaining the visible recent answer', async () => {
  const chat = { projectId: 'p', conversationId: 'c', title: 'History' };
  api.listChatHistory.mockResolvedValue({ conversations: [chat], hasMore: false, nextCursor: null });
  api.readChatHistory.mockResolvedValueOnce({ messages: [{ id: 'recent', content: 'Latest answer' }], hasMore: true, nextCursor: 'old-page' })
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce({ messages: [{ id: 'older', content: 'Earlier answer' }], hasMore: false, nextCursor: null });
  render(<ChatHistoryBrowser />);
  fireEvent.click(screen.getAllByRole('button', { name: 'chat.conversationsAria' })[0]!);
  fireEvent.click(await screen.findByRole('button', { name: 'History' }));
  await screen.findByText('Latest answer');
  fireEvent.click(screen.getByRole('button', { name: 'history.loadEarlier' }));
  fireEvent.click(await screen.findByRole('button', { name: 'history.retry' }));
  await screen.findByText('Earlier answer|Latest answer');
  expect(api.readChatHistory.mock.calls.map(call => call[1])).toEqual([undefined, 'old-page', 'old-page']);
});
it('ignores a delayed selected conversation after returning to the list', async () => {
  const chat = { projectId: 'p', conversationId: 'c', title: 'Slow history' };
  let resolve!: (value: unknown) => void;
  api.listChatHistory.mockResolvedValue({ conversations: [chat], hasMore: false, nextCursor: null });
  api.readChatHistory.mockReturnValue(new Promise(done => { resolve = done; }));
  render(<ChatHistoryBrowser />);
  fireEvent.click(screen.getAllByRole('button', { name: 'chat.conversationsAria' })[0]!);
  fireEvent.click(await screen.findByRole('button', { name: 'Slow history' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'chat.conversationsAria' }).at(-1)!);
  await act(async () => { resolve({ messages: [{ id: 'old', content: 'Delayed obsolete response' }], hasMore: false, nextCursor: null }); });
  expect(screen.queryByText('Delayed obsolete response')).toBeNull();
  expect(screen.getByRole('button', { name: 'Slow history' })).toBeTruthy();
});
