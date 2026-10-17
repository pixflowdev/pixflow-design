// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDurableChatHistory } from '../../src/pixflow/use-durable-chat-history';
import { importChatHistory, readChatHistory, resolveChatHistory, saveChatHistoryMessage } from '../../src/pixflow/chat-history-client';

const account = vi.hoisted(() => ({ id: 1 }));
vi.mock('../../src/pixflow/wordpress-context', () => ({ hasPixflowWordPressContext: () => true, getPixflowWordPressConfig: () => ({ siteHash: 'qa-site', userId: account.id }) }));
vi.mock('../../src/pixflow/chat-history-client', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/pixflow/chat-history-client')>(),
  resolveChatHistory: vi.fn(), importChatHistory: vi.fn(), readChatHistory: vi.fn(), saveChatHistoryMessage: vi.fn(),
}));

interface Message { id: string; role: string; content: string; createdAt?: number; historyRevision?: number; historySequence?: number; status?: string }
const message = (index: number): Message => ({ id: `message-${index}`, role: index % 2 ? 'assistant' : 'user', content: `Message ${index}`, createdAt: index });
const saved = (item: Message, sequence = 1): Message => ({ ...item, historyRevision: 1, historySequence: sequence });
const outboxKey = 'pixflow:chat-history-outbox:qa-site:1:history-race-test';
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
function useHarness(initial: Message[], sessionKey = 'history-race-test') {
  const [messages, setMessages] = useState(initial);
  return { ...useDurableChatHistory({ sessionKey, messages, onHydrate: setMessages }), setMessages };
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); account.id = 1;
  vi.mocked(resolveChatHistory).mockImplementation(async input => ({ projectId: input.sessionKey, conversationId: 'conversation' }));
  vi.mocked(importChatHistory).mockImplementation(async (_binding, messages) => ({ messages: messages.map((item, index) => ({ ...item, historyRevision: item.historyRevision || 1, historySequence: index + 1 })), deletedMessageIds: [] }));
  vi.mocked(readChatHistory).mockResolvedValue({ messages: [], nextCursor: null, hasMore: false });
  vi.mocked(saveChatHistoryMessage).mockImplementation(async (_binding, item) => ({ ...item, historyRevision: (item.historyRevision || 0) + 1, historySequence: 1 }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Durable history independent migration and recovery checks', () => {
  it.each(['{"unfinished":', '{"unexpected":"record"}', '[{"content":"missing identity"}]'])('preserves an unreadable outbox without replacing it: %s', async raw => {
    localStorage.setItem(outboxKey, raw);
    const { result } = renderHook(() => useHarness([message(1)]));
    await waitFor(() => expect(result.current.error).toBe('save'));
    act(() => result.current.setMessages([message(1), message(2)]));
    act(() => result.current.retry());
    expect(localStorage.getItem(outboxKey)).toBe(raw);
    expect(resolveChatHistory).not.toHaveBeenCalled();
    expect(saveChatHistoryMessage).not.toHaveBeenCalled();
  });
  it('does not replace or remove an outbox when reading browser storage fails', async () => {
    const raw = JSON.stringify([message(9)]);
    localStorage.setItem(outboxKey, raw);
    const original = Storage.prototype.getItem;
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function(this: Storage, key: string) {
      if (this === localStorage && key === outboxKey) throw new DOMException('Storage unavailable');
      return original.call(this, key);
    });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const { result } = renderHook(() => useHarness([message(1)]));
    await waitFor(() => expect(result.current.error).toBe('save'));
    act(() => result.current.setMessages([message(2)]));
    expect(write.mock.calls.some(call => call[0] === outboxKey)).toBe(false);
    expect(remove.mock.calls.some(call => call[0] === outboxKey)).toBe(false);
    read.mockRestore();
    expect(localStorage.getItem(outboxKey)).toBe(raw);
  });
  it('looks up empty panel history without creating a chat, then creates on the first message', async () => {
    vi.mocked(resolveChatHistory).mockImplementation(async input => input.create === false
      ? { projectId: null, conversationId: null } as unknown as { projectId: string; conversationId: string }
      : { projectId: 'created-on-send', conversationId: 'conversation' });
    const { result } = renderHook(() => useHarness([]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(resolveChatHistory).toHaveBeenCalledWith({ sessionKey: 'history-race-test', create: false });
    expect(importChatHistory).not.toHaveBeenCalled();
    expect(readChatHistory).not.toHaveBeenCalled();
    act(() => result.current.setMessages([message(1)]));
    await waitFor(() => expect(resolveChatHistory).toHaveBeenCalledWith({ sessionKey: 'history-race-test' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(importChatHistory).toHaveBeenCalledWith({ projectId: 'created-on-send', conversationId: 'conversation' }, [message(1)]);
  });
  it('does not migrate the old account transcript after account changes during resolution', async () => {
    const pending = deferred<{ projectId: string; conversationId: string }>();
    vi.mocked(resolveChatHistory).mockReturnValueOnce(pending.promise);
    const hydrate = vi.fn();
    const { rerender } = renderHook(() => useDurableChatHistory({ sessionKey: 'account-switch', messages: [message(1)], onHydrate: hydrate }));
    account.id = 2;
    rerender();
    await act(async () => pending.resolve({ projectId: 'private-old-project', conversationId: 'conversation' }));
    expect(importChatHistory).not.toHaveBeenCalled();
    expect(saveChatHistoryMessage).not.toHaveBeenCalled();
    expect(hydrate).not.toHaveBeenCalled();
    expect(localStorage.getItem('pixflow:chat-history-outbox:qa-site:2:account-switch')).toBeNull();
    expect(localStorage.getItem('pixflow:chat-history-outbox:qa-site:1:account-switch')).toContain('message-1');
  });
  it('does not import the next session outbox when the previous resolve finishes late', async () => {
    const oldResolve = deferred<{ projectId: string; conversationId: string }>();
    vi.mocked(resolveChatHistory).mockImplementation(input => input.sessionKey === 'old'
      ? oldResolve.promise : Promise.resolve({ projectId: 'new', conversationId: 'conversation' }));
    const { rerender } = renderHook(({ key, messages }) => useDurableChatHistory({ sessionKey: key, messages }), {
      initialProps: { key: 'old', messages: [message(1)] },
    });
    rerender({ key: 'new', messages: [message(2)] });
    await waitFor(() => expect(importChatHistory).toHaveBeenCalledWith({ projectId: 'new', conversationId: 'conversation' }, [message(2)]));
    await act(async () => oldResolve.resolve({ projectId: 'old', conversationId: 'conversation' }));
    expect(vi.mocked(importChatHistory).mock.calls.every(call => call[0].projectId === 'new')).toBe(true);
  });
  it('does not acknowledge raw legacy recovery until the server imports it', async () => {
    const legacy = [{ ...message(0), content: 'Untouched old transcript '.repeat(2000), status: 'streaming' }];
    const acknowledgement = vi.fn();
    vi.mocked(importChatHistory).mockRejectedValue(new Error('Server unavailable'));
    const { result } = renderHook(() => useDurableChatHistory({ sessionKey: 'raw-recovery', messages: [], legacyMessages: legacy, onImported: acknowledgement }));
    await waitFor(() => expect(result.current.error).toBe('load'));
    expect(acknowledgement).not.toHaveBeenCalled();
    expect(importChatHistory).toHaveBeenCalledWith(expect.anything(), legacy);
    vi.mocked(importChatHistory).mockImplementation(async (_binding, items) => ({ messages: items.map(item => ({ ...item, historyRevision: 1 })), deletedMessageIds: [] }));
    act(() => result.current.retry());
    await waitFor(() => expect(acknowledgement).toHaveBeenCalledWith(['message-0']));
  });

  it('imports full legacy history without pushing older pages into the active transcript', async () => {
    const legacy = Array.from({ length: 80 }, (_, index) => message(index));
    const recent = legacy.slice(-24);
    const serverPage = legacy.slice(-50).map((item, index) => saved(item, index + 31));
    vi.mocked(readChatHistory).mockResolvedValue({ messages: serverPage, nextCursor: 'older', hasMore: true });
    const hydrate = vi.fn();
    const { result } = renderHook(() => useDurableChatHistory({ sessionKey: 'raw-paging', messages: recent, legacyMessages: legacy, onHydrate: hydrate }));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    expect(importChatHistory).toHaveBeenNthCalledWith(1, expect.anything(), legacy);
    expect(result.current.messages).toHaveLength(50);
    expect(hydrate).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'message-79' })]));
  });

  it('imports the complete browser transcript beyond 24 messages without truncating large replies', async () => {
    const messages = Array.from({ length: 125 }, (_, index) => message(index));
    messages[124]!.content = 'Complete response 日本語 🎨 '.repeat(2000);
    const { result } = renderHook(() => useHarness(messages));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(importChatHistory).toHaveBeenCalledWith(expect.anything(), messages);
    expect(result.current.messages).toHaveLength(125);
    expect(result.current.messages[124]!.content).toBe(messages[124]!.content);
  });

  it('server-completed history wins over a shortened interrupted browser cache', async () => {
    const browser = { ...message(1), content: 'Partial', status: 'interrupted' };
    const server = saved({ ...browser, content: 'Full completed answer', status: 'complete' });
    vi.mocked(readChatHistory).mockResolvedValue({ messages: [server], nextCursor: null, hasMore: false });
    const { result } = renderHook(() => useHarness([browser]));
    await waitFor(() => expect(result.current.messages[0]!.content).toBe(server.content));
    await new Promise(resolve => setTimeout(resolve, 450));
    expect(saveChatHistoryMessage).not.toHaveBeenCalled();
  });

  it('retains a failed write and retries the latest complete streaming answer', async () => {
    const baseline = saved(message(1));
    vi.mocked(readChatHistory).mockResolvedValue({ messages: [baseline], nextCursor: null, hasMore: false });
    vi.mocked(saveChatHistoryMessage).mockRejectedValue(new Error('Temporary network failure'));
    const { result } = renderHook(() => useHarness([baseline]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setMessages([{ ...baseline, content: 'Still streaming', status: 'streaming' }]));
    await waitFor(() => expect(result.current.error).toBe('save'));
    act(() => result.current.setMessages([{ ...baseline, content: 'Complete answer '.repeat(2000), status: 'complete' }]));
    await waitFor(() => expect(localStorage.getItem(outboxKey)).toContain('Complete answer'));
    vi.mocked(saveChatHistoryMessage).mockImplementation(async (_binding, item) => ({ ...item, historyRevision: 2, historySequence: 1 }));
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(localStorage.getItem(outboxKey)).toBeNull());
    expect(vi.mocked(saveChatHistoryMessage).mock.calls.at(-1)?.[1].content).toBe('Complete answer '.repeat(2000));
    expect(result.current.messages[0]!.content).toBe('Complete answer '.repeat(2000));
  });

  it('fetches older pages without replacing the current streaming message or duplicating IDs', async () => {
    const recent = [saved(message(50), 51), saved(message(51), 52)];
    vi.mocked(readChatHistory).mockResolvedValueOnce({ messages: recent, nextCursor: 'older', hasMore: true })
      .mockResolvedValueOnce({ messages: [saved(message(49), 50), recent[0]!], nextCursor: null, hasMore: false });
    const { result } = renderHook(() => useHarness(recent));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    act(() => result.current.setMessages([recent[0]!, { ...recent[1]!, content: 'Live answer in progress', status: 'streaming' }]));
    await act(async () => { await result.current.loadEarlier(); });
    expect(result.current.messages.map(item => item.id)).toEqual(['message-49', 'message-50', 'message-51']);
    expect(result.current.messages[2]!.content).toBe('Live answer in progress');
    expect(result.current.hasMore).toBe(false);
  });

  it('ignores the prior conversation response after a session switch', async () => {
    const first = deferred<{ messages: Message[]; nextCursor: string | null; hasMore: boolean }>();
    vi.mocked(readChatHistory).mockImplementation(binding => binding.projectId === 'first'
      ? first.promise : Promise.resolve({ messages: [saved(message(2))], nextCursor: null, hasMore: false }));
    const hydrate = vi.fn();
    const { result, rerender } = renderHook(({ key, messages }) => useDurableChatHistory({ sessionKey: key, messages, onHydrate: hydrate }), {
      initialProps: { key: 'first', messages: [message(1)] },
    });
    await waitFor(() => expect(readChatHistory).toHaveBeenCalledTimes(1));
    rerender({ key: 'second', messages: [message(2)] });
    await waitFor(() => expect(hydrate).toHaveBeenCalledWith([saved(message(2))]));
    await act(async () => first.resolve({ messages: [saved(message(1))], nextCursor: null, hasMore: false }));
    expect(result.current.messages.map(item => item.id)).toEqual(['message-2']);
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it('recovers an unacknowledged outbox after remount with an empty browser transcript', async () => {
    localStorage.setItem(outboxKey, JSON.stringify([message(9)]));
    const { result } = renderHook(() => useHarness([]));
    await waitFor(() => expect(result.current.messages).toMatchObject([{ id: 'message-9', content: 'Message 9' }]));
    expect(localStorage.getItem(outboxKey)).toBeNull();
  });

  it('shows the recovered newer outbox answer instead of the older server snapshot', async () => {
    const baseline = saved(message(9));
    const complete = { ...baseline, content: 'New complete answer recovered from the outbox', status: 'complete' };
    localStorage.setItem(outboxKey, JSON.stringify([complete]));
    vi.mocked(importChatHistory).mockResolvedValue({ messages: [baseline], deletedMessageIds: [] });
    vi.mocked(readChatHistory).mockResolvedValue({ messages: [baseline], nextCursor: null, hasMore: false });
    const { result } = renderHook(() => useHarness([baseline]));
    await waitFor(() => expect(localStorage.getItem(outboxKey)).toBeNull());
    expect(saveChatHistoryMessage).toHaveBeenCalledWith(expect.anything(), complete);
    expect(result.current.messages[0]!.content).toBe(complete.content);
  });

  it('preserves newly streamed text while initial history loading is pending', async () => {
    const pending = deferred<{ projectId: string; conversationId: string }>();
    vi.mocked(resolveChatHistory).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useHarness([message(1)]));
    act(() => result.current.setMessages([{ ...message(1), content: 'Streamed before history resolved', status: 'streaming' }]));
    await waitFor(() => expect(localStorage.getItem(outboxKey)).toContain('Streamed before history resolved'));
    await act(async () => pending.resolve({ projectId: 'history-race-test', conversationId: 'conversation' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages[0]!.content).toBe('Streamed before history resolved');
  });
});
