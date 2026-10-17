import type { PixflowChatHistoryExportPage, PixflowChatHistoryStorageUsage } from '@open-design/contracts';
import { pixflowWordPressRestFetch } from './runtime-fetch';
import { chatHistoryOwnerScope, type ChatHistoryBinding } from './chat-history-client';

async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await pixflowWordPressRestFetch(path, { signal });
  if (!response.ok) throw new Error(`Chat archive request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export function readChatStorageUsage(signal?: AbortSignal): Promise<PixflowChatHistoryStorageUsage> {
  return read('/chat-history/storage', signal);
}

/** Read bounded pages without mounting history or retaining every decoded tool payload. */
export async function prepareChatExport(binding: ChatHistoryBinding, signal?: AbortSignal, onProgress?: (count: number) => void) {
  const owner = chatHistoryOwnerScope();
  const assertOwner = () => {
    signal?.throwIfAborted();
    if (chatHistoryOwnerScope() !== owner) throw new Error('Chat archive owner changed.');
  };
  const path = `/chat-history/${encodeURIComponent(binding.projectId)}/${encodeURIComponent(binding.conversationId)}/export`;
  const parts: BlobPart[] = [];
  const cursors = new Set<string>();
  const ids = new Set<string>();
  let cursor: string | null = null;
  let metadata = '';
  let count = 0;
  do {
    assertOwner();
    const page: PixflowChatHistoryExportPage<Record<string, unknown> & { id: string }> = await read(`${path}?limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, signal);
    assertOwner();
    if (page.schemaVersion !== 1 || !Array.isArray(page.messages) || page.conversation.projectId !== binding.projectId || page.conversation.conversationId !== binding.conversationId) throw new Error('Invalid chat archive.');
    const nextMetadata = JSON.stringify({ schemaVersion: page.schemaVersion, exportedAt: page.exportedAt, conversation: page.conversation });
    if (!metadata) {
      metadata = nextMetadata;
      parts.push(`${metadata.slice(0, -1)},"messages":[`);
    } else if (metadata !== nextMetadata) throw new Error('Chat archive changed during export.');
    for (const message of page.messages) {
      if (typeof message.id !== 'string' || ids.has(message.id)) throw new Error('Invalid chat archive message.');
      ids.add(message.id);
    }
    if (page.messages.length) {
      parts.push(`${count ? ',' : ''}${page.messages.map(message => JSON.stringify(message)).join(',')}`);
      count += page.messages.length;
    }
    onProgress?.(count);
    cursor = page.hasMore ? page.nextCursor : null;
    if (page.hasMore && (!cursor || !page.messages.length || cursors.has(cursor))) throw new Error('Invalid chat archive cursor.');
    if (cursor) cursors.add(cursor);
    if (!cursor && count !== page.conversation.messageCount) throw new Error('Incomplete chat archive.');
  } while (cursor);
  assertOwner();
  parts.push(']}');
  return { blob: new Blob(parts, { type: 'application/json;charset=utf-8' }), count };
}

export function downloadChatExport(blob: Blob, binding: ChatHistoryBinding) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pixflow-chat-${binding.conversationId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
