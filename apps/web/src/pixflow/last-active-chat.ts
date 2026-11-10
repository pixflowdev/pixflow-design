import { getPixflowWordPressConfig } from './wordpress-context';
import { readChatHistory, type ChatHistoryBinding } from './chat-history-client';
import { conversationBinding, conversationSessionKey } from './conversation-address';

/** Persist addresses only. A saved address never grants access or resumes execution. */
export function lastActiveChatOwner(): string | null {
  const config = getPixflowWordPressConfig();
  const site = config?.restRouteBaseUrl || config?.restBaseUrl || config?.siteUrl;
  return site && config?.userId ? `pixflow:last-active-chat:v1:${JSON.stringify([site, config.userId])}` : null;
}
export function rememberLastActiveChat(binding: ChatHistoryBinding): void {
  const key = lastActiveChatOwner();
  if (!key || !conversationBinding(conversationSessionKey(binding))) return;
  try { sessionStorage.setItem(key, conversationSessionKey(binding)); } catch { /* Storage may be disabled. */ }
}
export async function restoreLastActiveChat(): Promise<ChatHistoryBinding | null> {
  const key = lastActiveChatOwner();
  if (!key) return null;
  let address: string | null;
  try { address = sessionStorage.getItem(key); } catch { return null; }
  const binding = address && conversationBinding(address);
  if (!binding) return null;
  try {
    await readChatHistory(binding);
    // Another account or explicit selection may have won while permission was checked.
    return lastActiveChatOwner() === key && sessionStorage.getItem(key) === address ? binding : null;
  } catch { return null; } // Offline/denied: preserve the pointer, never reveal cached content.
}
