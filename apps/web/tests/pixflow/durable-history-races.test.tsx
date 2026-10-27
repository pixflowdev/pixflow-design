// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDurableChatHistory } from '../../src/pixflow/use-durable-chat-history';
import { importChatHistory, readChatHistory, resolveChatHistory, saveChatHistoryMessage } from '../../src/pixflow/chat-history-client';

const account = vi.hoisted(() => ({ id: 1 }));
const recovery = vi.hoisted(() => vi.fn());
vi.mock('../../src/pixflow/history-recovery', async importOriginal => ({ ...(await importOriginal<typeof import('../../src/pixflow/history-recovery')>()), preserveHistoryCopies: recovery }));
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
  vi.clearAllMocks(); recovery.mockResolvedValue(undefined); localStorage.clear(); sessionStorage.clear(); account.id = 1;
  vi.mocked(resolveChatHistory).mockImplementation(async input => ({ projectId: input.sessionKey, conversationId: 'conversation' }));
  vi.mocked(importChatHistory).mockImplementation(async (_binding, messages) => ({ messages: messages.map((item, index) => ({ ...item, historyRevision: item.historyRevision || 1, historySequence: index + 1 })), deletedMessageIds: [] }));
  vi.mocked(readChatHistory).mockResolvedValue({ messages: [], nextCursor: null, hasMore: false });
  vi.mocked(saveChatHistoryMessage).mockImplementation(async (_binding, item) => ({ ...item, historyRevision: (item.historyRevision || 0) + 1, historySequence: 1 }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Durable history independent migration and recovery checks', () => {
  it('does not release run recovery when the durable history read fails', async () => {
    vi.mocked(readChatHistory).mockRejectedValueOnce(new Error('Offline'));
    const owner = renderHook(() => useHarness([saved(message(1))]));
    await waitFor(() => expect(owner.result.current.error).toBe('load'));
    expect(owner.result.current.ready).toBe(false);
    expect(saveChatHistoryMessage).not.toHaveBeenCalled();
    act(() => owner.result.current.retry());
    await waitFor(() => expect(owner.result.current.ready).toBe(true));
    expect(owner.result.current.messages[0]?.content).toBe('Message 1');
  });
  it('allows run recovery only after canonical history and revisions are hydrated', async () => {
    const read = deferred<{ messages: Message[]; nextCursor: null; hasMore: boolean }>();
    vi.mocked(readChatHistory).mockReturnValueOnce(read.promise);
    const owner = renderHook(() => useHarness([saved(message(1))]));
    expect(owner.result.current.ready).toBe(false);
    await act(async () => read.resolve({ messages: [{ ...saved(message(1)), historyRevision: 8 }], nextCursor: null, hasMore: false }));
    await waitFor(() => expect(owner.result.current.ready).toBe(true));
    expect(owner.result.current.messages[0]?.historyRevision).toBe(8);
    act(() => owner.result.current.setMessages([{ ...owner.result.current.messages[0]!, content: 'Recovered final reply', status: 'complete' }]));
    await waitFor(() => expect(saveChatHistoryMessage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ historyRevision: 8, content: 'Recovered final reply' })));
    expect(owner.result.current.error).toBeNull();
  });
  it('does not archive every delta written by the same mounted owner', async () => {
    const initial = saved(message(1));
    const owner = renderHook(() => useHarness([initial]));
    await waitFor(() => expect(owner.result.current.loading).toBe(false));
    for (const content of ['a', 'ab', 'abc']) act(() => owner.result.current.setMessages([{ ...initial, content }]));
    expect(localStorage.getItem(`${outboxKey}:alternates`)).toBeNull();
  });
  it('leaves the shared recovery copy untouched if its alternate archive is unreadable', async () => {
    const initial = saved(message(1));
    const owner = renderHook(() => useHarness([initial]));
    await waitFor(() => expect(owner.result.current.loading).toBe(false));
    const alternate = { ...initial, content: 'Other tab final reply' };
    localStorage.setItem(outboxKey, JSON.stringify([alternate]));
    localStorage.setItem(`${outboxKey}:alternates`, '{broken');
    act(() => owner.result.current.setMessages([{ ...initial, content: 'Local reply' }]));
    expect(JSON.parse(localStorage.getItem(outboxKey)!)).toEqual([alternate]);
    expect(localStorage.getItem(`${outboxKey}:alternates`)).toBe('{broken');
    expect(owner.result.current.error).toBe('save');
  });
  it('preserves a different same-ID recovery snapshot before a second tab replaces its outbox entry', async () => {
    const initial = saved(message(1));
    const first = renderHook(() => useHarness([initial]));
    const second = renderHook(() => useHarness([initial]));
    await waitFor(() => expect(first.result.current.loading || second.result.current.loading).toBe(false));
    const firstReply = { ...initial, content: 'Complete first-tab reply', status: 'complete' };
    act(() => first.result.current.setMessages([firstReply]));
    first.unmount();
    act(() => second.result.current.setMessages([{ ...initial, content: 'Different second-tab reply' }]));
    const preserved = JSON.parse(localStorage.getItem(`${outboxKey}:alternates`) || '[]');
    expect(preserved).toContainEqual(firstReply);
  });
  it('keeps another tab’s final outbox message when this tab acknowledges a different reply', async () => {
    const first = renderHook(() => useHarness([saved(message(1))]));
    const second = renderHook(() => useHarness([saved(message(2))]));
    await waitFor(() => expect(first.result.current.loading || second.result.current.loading).toBe(false));
    const final = { ...saved(message(1)), content: 'Final answer awaiting save', status: 'complete' };
    act(() => first.result.current.setMessages([final]));
    first.unmount();
    act(() => second.result.current.setMessages([{ ...saved(message(2)), content: 'Other reply finished' }]));
    await waitFor(() => expect(saveChatHistoryMessage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({content:'Other reply finished'})));
    const stored = JSON.parse(localStorage.getItem(outboxKey) || '[]');
    expect(Array.isArray(stored) ? stored : stored.messages).toContainEqual(final);
  });
  it('does not turn another tab’s insert-only migration into a stale edit', async () => {
    const browser = { ...saved(message(1)), content: 'Older browser snapshot' };
    const canonical = { ...browser, content: 'Complete server answer', historyRevision: 3 };
    const delayed = deferred<{ projectId: string; conversationId: string }>();
    vi.mocked(resolveChatHistory).mockReturnValueOnce(delayed.promise);
    vi.mocked(importChatHistory).mockResolvedValue({ messages: [canonical], deletedMessageIds: [] });
    vi.mocked(readChatHistory).mockResolvedValue({ messages: [canonical], nextCursor: null, hasMore: false });
    const first = renderHook(() => useHarness([browser]));
    const second = renderHook(() => useHarness([browser]));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    await act(async () => delayed.resolve({ projectId: 'history-race-test', conversationId: 'conversation' }));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(saveChatHistoryMessage).not.toHaveBeenCalled();
    expect(second.result.current.messages[0]?.content).toBe(canonical.content);
  });
  it('keeps a conflicting recovery copy without blocking unrelated new messages', async () => {
    const stale = { ...saved(message(1)), content: 'Unsaved text from another tab' };
    const canonical = { ...saved(message(1)), content: 'Newer saved text', historyRevision: 3 };
    localStorage.setItem(outboxKey, JSON.stringify([stale]));
    vi.mocked(importChatHistory).mockResolvedValue({ messages: [canonical], deletedMessageIds: [] });
    vi.mocked(readChatHistory).mockResolvedValue({ messages: [canonical], nextCursor: null, hasMore: false });
    vi.mocked(saveChatHistoryMessage).mockImplementation(async (_binding, item) => {
      if (item.id === stale.id) throw new Error('This message has a newer saved version.');
      return { ...item, historyRevision: 1, historySequence: 2 };
    });
    const { result } = renderHook(() => useHarness([canonical]));
    await waitFor(() => expect(result.current.error).toBe('save'));
    act(() => result.current.setMessages([canonical, message(2)]));
    await waitFor(() => expect(saveChatHistoryMessage).toHaveBeenCalledWith(expect.anything(), message(2)));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(outboxKey)!)).toEqual([stale]));
    expect(result.current.error).toBe('save');
    expect(result.current.messages.find(item => item.id === canonical.id)?.content).toBe(canonical.content);
  });
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


it('keeps conflicting local data if saving a recovery copy fails', async () => {
  const original = saved(message(1));
  const owner = renderHook(() => useHarness([original]));
  await waitFor(() => expect(owner.result.current.loading).toBe(false));
  vi.mocked(saveChatHistoryMessage).mockRejectedValue(new Error('Conflict'));
  act(() => owner.result.current.setMessages([{...original,content:'Different preserved response',status:'complete'}]));
  await waitFor(() => expect(owner.result.current.error).toBe('save'));
  const before = localStorage.getItem(outboxKey);
  recovery.mockRejectedValue(new Error('Recovery storage unavailable'));
  await act(async () => owner.result.current.recover('Recovered history'));
  expect(localStorage.getItem(outboxKey)).toBe(before);
  expect(owner.result.current.error).toBe('save');
});
it('uses canonical history only after divergent copies are preserved', async () => {
  const original = saved(message(1));
  const owner = renderHook(() => useHarness([original]));
  await waitFor(() => expect(owner.result.current.loading).toBe(false));
  vi.mocked(saveChatHistoryMessage).mockRejectedValue(new Error('Conflict'));
  const different={...original,content:'Different response',status:'complete'};
  act(() => owner.result.current.setMessages([different]));
  await waitFor(() => expect(owner.result.current.error).toBe('save'));
  vi.mocked(importChatHistory).mockResolvedValue({messages:[original],deletedMessageIds:[]});
  await act(async () => owner.result.current.recover('Recovered history'));
  expect(recovery).toHaveBeenCalledWith({projectId:'history-race-test',conversationId:'conversation'},[different],'Recovered history');
  expect(owner.result.current.messages[0]?.content).toBe(original.content);
  expect(owner.result.current.error).toBeNull();
  expect(localStorage.getItem(outboxKey)).toBeNull();
});

// A passive editor must observe durable completion without becoming a writer.
describe('Cross-tab completed history', () => {
  it('ignores an in-flight refresh after the signed-in account changes', async () => {
    const before = saved(message(1));
    const { result } = renderHook(() => useHarness([before]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const pendingRead = deferred<{ messages: Message[]; nextCursor: null; hasMore: boolean }>();
    vi.mocked(readChatHistory).mockReturnValueOnce(pendingRead.promise);
    act(() => window.dispatchEvent(new Event('focus')));
    account.id = 2;
    await act(async () => pendingRead.resolve({ messages: [{ ...before, content: 'Other account response', historyRevision: 4 }], nextCursor: null, hasMore: false }));
    expect(result.current.messages[0]?.content).toBe(before.content);
    expect(saveChatHistoryMessage).not.toHaveBeenCalled();
  });
  it('refreshes a saved streaming snapshot on focus without writing it back', async () => {
    const before = { ...saved(message(1)), content: 'Starting', status: 'streaming' };
    vi.mocked(readChatHistory).mockResolvedValue({ messages: [before], nextCursor: null, hasMore: false });
    const { result } = renderHook(() => useHarness([before]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const final = { ...before, content: 'Complete answer from the other tab', status: 'complete', historyRevision: 4 };
    vi.mocked(readChatHistory).mockResolvedValue({ messages: [final], nextCursor: null, hasMore: false });
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(result.current.messages[0]).toEqual(final));
    expect(saveChatHistoryMessage).not.toHaveBeenCalled();
  });

  it('does not replace a local unsaved edit when another tab completes', async () => {
    const before = saved(message(1));
    vi.mocked(readChatHistory).mockResolvedValue({ messages: [before], nextCursor: null, hasMore: false });
    const { result } = renderHook(() => useHarness([before]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const local = { ...before, content: 'Local unsaved work' };
    act(() => result.current.setMessages([local]));
    vi.mocked(readChatHistory).mockResolvedValue({ messages: [{ ...before, content: 'Remote answer', historyRevision: 4 }], nextCursor: null, hasMore: false });
    act(() => window.dispatchEvent(new Event('focus')));
    await act(async () => {});
    expect(result.current.messages[0]?.content).toBe(local.content);
    expect(localStorage.getItem(outboxKey)).toContain(local.content);
  });
});
