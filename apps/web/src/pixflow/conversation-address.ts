import type { PixflowChatHistoryBinding } from '@open-design/contracts';

const prefix = 'pixflow:conversation:v1:';
/** A storage address only. Every read/write still goes through WordPress permissions. */
export function conversationSessionKey(binding: PixflowChatHistoryBinding): string {
  return prefix + encodeURIComponent(binding.projectId) + ':' + encodeURIComponent(binding.conversationId);
}

export function conversationBinding(sessionKey: string): PixflowChatHistoryBinding | null {
  if (!sessionKey.startsWith(prefix)) return null;
  try {
    const parts = sessionKey.slice(prefix.length).split(':');
    if (parts.length !== 2) return null;
    const projectId = decodeURIComponent(parts[0]!);
    const conversationId = decodeURIComponent(parts[1]!);
    if (!/^[a-f0-9-]{36}$/i.test(projectId) || !conversationId || conversationId.length > 191) return null;
    return { projectId, conversationId };
  } catch { return null; }
}
