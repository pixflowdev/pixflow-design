import { beforeEach, describe, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => vi.fn());
const owner = vi.hoisted(() => ({ id: 'one' }));
vi.mock('../../src/pixflow/runtime-fetch', () => ({ pixflowWordPressRestFetch: transport }));
vi.mock('../../src/pixflow/chat-history-client', () => ({ chatHistoryOwnerScope: () => owner.id }));
import { prepareChatExport, readChatStorageUsage } from '../../src/pixflow/chat-history-export';

const binding = { projectId: 'project', conversationId: 'chat' };
const conversation = { ...binding, title: 'Preserved chat', createdAt: 1, updatedAt: 2, messageCount: 250 };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const page = (messages: unknown[], nextCursor: string | null, count = 250) => ({ schemaVersion: 1, exportedAt: '2026-10-16T12:00:00Z', conversation: { ...conversation, messageCount: count }, messages, hasMore: !!nextCursor, nextCursor });
describe('complete chat exports', () => {
  beforeEach(() => { transport.mockReset(); owner.id = 'one'; });
  it('exports every page and preserves full payloads including unknown fields, tools and media references', async () => {
    const messages = Array.from({ length: 250 }, (_, index) => ({ id: `m${index}`, role: index % 2 ? 'assistant' : 'user', content: `Unicode العربية ${index}`, events: [{ kind: 'tool_result', content: 'complete'.repeat(100) }], attachments: [{ url: '/image.png' }], futureField: { preserved: true } }));
    transport.mockResolvedValueOnce(response(page(messages.slice(0, 100), 'cursor/+=='))).mockResolvedValueOnce(response(page(messages.slice(100, 200), 'two'))).mockResolvedValueOnce(response(page(messages.slice(200), null)));
    const progress = vi.fn();
    const result = await prepareChatExport(binding, undefined, progress);
    expect(JSON.parse(await result.blob.text())).toEqual({ schemaVersion: 1, exportedAt: '2026-10-16T12:00:00Z', conversation, messages });
    expect(result.count).toBe(250);
    expect(progress.mock.calls).toEqual([[100], [200], [250]]);
    expect(transport.mock.calls[1]?.[0]).toContain('cursor=cursor%2F%2B%3D%3D');
  });
  it('exports an empty saved conversation as valid JSON', async () => {
    transport.mockResolvedValue(response(page([], null, 0)));
    expect(JSON.parse(await (await prepareChatExport(binding)).blob.text()).messages).toEqual([]);
  });
  it('does not produce a partial file when a concurrent edit invalidates the snapshot', async () => {
    transport.mockResolvedValueOnce(response(page([{ id: 'first' }], 'next', 2))).mockResolvedValueOnce(response({ code: 'pixflow_history_export_changed' }, 409));
    await expect(prepareChatExport(binding)).rejects.toThrow('409');
  });
  it.each(['duplicate', 'count', 'cursor', 'metadata'])('rejects malformed %s export data instead of silently losing data', async kind => {
    transport.mockResolvedValueOnce(response(page([{ id: 'first' }], 'next', 2)));
    const second = page([{ id: kind === 'duplicate' ? 'first' : 'second' }], kind === 'cursor' ? 'next' : null, kind === 'count' ? 3 : 2);
    if (kind === 'metadata') second.conversation.title = 'Changed title';
    transport.mockResolvedValueOnce(response(second));
    await expect(prepareChatExport(binding)).rejects.toThrow();
  });
  it('rejects an account switch even during the final request', async () => {
    transport.mockImplementation(async () => { owner.id = 'two'; return response(page([{ id: 'first' }], null, 1)); });
    await expect(prepareChatExport(binding)).rejects.toThrow('owner changed');
  });
  it('cancels a pending export without starting another page', async () => {
    const controller = new AbortController();
    transport.mockImplementation(async () => { controller.abort(); return response(page([{ id: 'first' }], 'next', 2)); });
    await expect(prepareChatExport(binding, controller.signal)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('reads owner-scoped usage without sending an arbitrary user id', async () => {
    transport.mockResolvedValue(response({ scope: 'current-user', messageCount: 10 }));
    expect((await readChatStorageUsage()).messageCount).toBe(10);
    expect(transport.mock.calls[0]?.[0]).toBe('/chat-history/storage');
  });
});
