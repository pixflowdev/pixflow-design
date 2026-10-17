import type { PixflowChatHistoryPage } from '@open-design/contracts';
import type { ChatMessage } from '../types';
import { isPixflowWordPressEmbed, requestWordPressRest } from '../pixflow/license';
import { listMessages } from './projects';

/** Older entries are fetched explicitly; a failed read must never masquerade as an empty chat. */
export async function listMessagePage(projectId: string, conversationId: string, before?: string): Promise<PixflowChatHistoryPage<ChatMessage>> {
  if (!isPixflowWordPressEmbed()) {
    return { messages: await listMessages(projectId, conversationId), nextCursor: null, hasMore: false };
  }
  const query = new URLSearchParams({ limit: '50' });
  if (before) query.set('before', before);
  const response = await requestWordPressRest<PixflowChatHistoryPage<ChatMessage> & { message?: string }>(
    `od/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages?${query}`,
  );
  if (!response.ok || !Array.isArray(response.body.messages)) throw new Error(response.body?.message || 'Could not load chat history.');
  return response.body;
}

/** Paging never overwrites a locally streaming message with an older server snapshot. */
export function prependHistoryPage(current: ChatMessage[], older: ChatMessage[]): ChatMessage[] {
  const present = new Set(current.map(message => message.id));
  return [...older.filter(message => !present.has(message.id)), ...current];
}
