// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatHistoryBrowser } from '../../src/pixflow/ChatHistoryBrowser';
import { listChatHistory, readChatHistory } from '../../src/pixflow/chat-history-client';

vi.mock('../../src/i18n', () => ({ useT: () => (key: string) => key }));
vi.mock('../../src/pixflow/chat-history-client', async original => ({
  ...await original<typeof import('../../src/pixflow/chat-history-client')>(),
  listChatHistory: vi.fn(), readChatHistory: vi.fn(),
}));
vi.mock('../../src/pixflow/ChatExportButton', () => ({ ChatExportButton: () => null }));
vi.mock('../../src/components/shared-chat/SharedChatRows', () => ({
  SharedChatRows: ({ messages }: { messages: Array<{ id: string; content: string }> }) => <div data-testid="history-rows">{messages.map(message => <p key={message.id}>{message.content}</p>)}</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

describe('floating archive large-conversation pagination', () => {
  it.each([1000, 5000])('loads only 50 of %i messages initially and retains every requested page', async count => {
    const archive = Array.from({ length: count }, (_, index) => ({ id: `archive-${index + 1}`, role: 'assistant', content: `Archive ${index + 1}`, historySequence: index + 1 }));
    vi.mocked(listChatHistory).mockResolvedValue({ conversations: [{ projectId: 'qa', conversationId: 'conversation', title: 'Large archive', messageCount: count, createdAt: 0, updatedAt: 0 }], hasMore: false, nextCursor: null });
    vi.mocked(readChatHistory).mockImplementation(async (_binding, before) => {
      const end = before ? Number(before) : count;
      const start = Math.max(0, end - 50);
      return { messages: archive.slice(start, end), hasMore: start > 0, nextCursor: start > 0 ? String(start) : null };
    });
    render(<ChatHistoryBrowser />);
    fireEvent.click(screen.getByRole('button', { name: 'chat.conversationsAria' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Large archive' }));
    await waitFor(() => expect(screen.getByTestId('history-rows').children).toHaveLength(50));
    expect(screen.getByText(`Archive ${count}`)).toBeTruthy();
    expect(screen.queryByText('Archive 1')).toBeNull();
    expect(readChatHistory).toHaveBeenCalledTimes(1);
    for (let page = 2; page <= 3; page++) {
      fireEvent.click(screen.getByRole('button', { name: 'history.loadEarlier' }));
      await waitFor(() => expect(screen.getByTestId('history-rows').children).toHaveLength(50 * page));
    }
    const items = screen.getByTestId('history-rows').children;
    expect(items[0]?.textContent).toBe(`Archive ${count - 149}`);
    expect(items[149]?.textContent).toBe(`Archive ${count}`);
    expect(readChatHistory).toHaveBeenCalledTimes(3);
    expect(archive).toHaveLength(count);
    expect(archive[0]?.content).toBe('Archive 1');
  });
});
