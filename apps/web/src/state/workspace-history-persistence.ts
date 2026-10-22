import type { ChatMessage } from '../types';
import { historyMessageFingerprint, importChatHistory, saveChatHistoryMessage } from '../pixflow/chat-history-client';
import { preserveHistoryCopies } from '../pixflow/history-recovery';
import { getPixflowWordPressConfig } from '../pixflow/wordpress-context';

type Pending = { projectId: string; conversationId: string; message: ChatMessage };
const pending = new Map<string, Pending>();
const running = new Map<string, Promise<void>>();
const failures = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };
const scope = () => {
  const site = getPixflowWordPressConfig();
  return `${site?.siteHash || site?.siteUrl || location.origin}:${site?.userId || 'current'}`;
};
const prefix = () => `pixflow:workspace-history-outbox:${encodeURIComponent(scope())}:`;
const owner = (p: string, c: string) => `${prefix()}${encodeURIComponent(p)}:${encodeURIComponent(c)}:`;
const keyFor = (p: string, c: string, id: string) => `${owner(p,c)}${encodeURIComponent(id)}`;

export function subscribeWorkspaceHistoryWrites(listener: () => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export function workspaceHistoryWriteFailed(projectId: string, conversationId: string): boolean {
  const key = owner(projectId,conversationId);
  return [...failures].some(value => value.startsWith(key));
}

/** Keep the newest unacknowledged snapshot, including attachments and execution state. */
export function queueWorkspaceHistoryMessage(projectId: string, conversationId: string, message: ChatMessage): Promise<void> {
  const key = keyFor(projectId,conversationId,message.id);
  const entry = { projectId, conversationId, message: structuredClone(message) };
  pending.set(key,entry);
  try { localStorage.setItem(key,JSON.stringify(entry)); }
  // A recovery-copy quota failure is not a failed WordPress save. Keep the
  // in-memory outbox and let the durable request below determine the warning.
  catch { /* A failed durable write remains visible and retryable in flush(). */ }
  return flush(projectId,conversationId);
}

function flush(projectId: string, conversationId: string): Promise<void> {
  const group = owner(projectId,conversationId);
  const account = scope();
  const existing = running.get(group);
  if (existing) return existing;
  const task = (async () => {
    // Drain snapshots added while a previous request is in flight as well.
    while (true) {
      // A later request must never send the previous account's outbox with the
      // credentials of a newly signed-in user. Keep it for its original owner.
      if (scope() !== account) break;
      const next = [...pending.entries()].find(([key]) => key.startsWith(group));
      if (!next) break;
      const [key,entry] = next;
      try {
        const saved = await saveChatHistoryMessage({projectId,conversationId},entry.message);
        const latest = pending.get(key);
        if (latest === entry) {
          pending.delete(key);
          try { localStorage.removeItem(key); } catch { /* Re-import is idempotent. */ }
        } else if (latest) {
          latest.message.historyRevision = saved.historyRevision;
          try { localStorage.setItem(key,JSON.stringify(latest)); } catch { /* In-memory retry remains available. */ }
        }
        failures.delete(key); notify();
      } catch {
        failures.add(key); notify();
        break;
      }
    }
  })().finally(() => { running.delete(group); });
  running.set(group,task);
  return task;
}

/** Replay only this site's/user's outbox. Conflicts remain visible for recovery. */
export async function retryWorkspaceHistoryWrites(projectId: string, conversationId: string): Promise<void> {
  const group = owner(projectId,conversationId);
  let unreadable = false;
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(group) || pending.has(key)) continue;
      try {
        const entry = JSON.parse(localStorage.getItem(key) || 'null') as Pending | null;
        if (entry?.projectId === projectId && entry.conversationId === conversationId && entry.message?.id
          && key === keyFor(projectId,conversationId,entry.message.id)) pending.set(key,entry);
        else unreadable = true;
      } catch { unreadable = true; }
    }
  } catch { unreadable = true; }
  if (unreadable) failures.add(group); else failures.delete(group);
  notify();
  await flush(projectId,conversationId);
}

export function workspaceHistoryPendingMessages(projectId: string, conversationId: string): ChatMessage[] {
  const group = owner(projectId,conversationId);
  return [...pending].filter(([key]) => key.startsWith(group)).map(([,entry]) => entry.message);
}

/** Explicit recovery saves divergent copies privately before acknowledging canonical history. */
export async function recoverWorkspaceHistoryWrites(projectId: string, conversationId: string, title: string): Promise<ChatMessage[]> {
  const group = owner(projectId, conversationId), account = scope();
  if (running.has(group)) return [];
  const captured = [...pending].filter(([key]) => key.startsWith(group));
  const source = {projectId, conversationId};
  await preserveHistoryCopies(source, captured.map(([,entry]) => entry.message), title);
  if (scope() !== account) throw new Error('The signed-in account changed.');
  const canonical = await importChatHistory(source, captured.map(([,entry]) => entry.message));
  if (scope() !== account) throw new Error('The signed-in account changed.');
  const restored: ChatMessage[] = [];
  for (const [key, entry] of captured) {
    const saved = canonical.messages.find(item => item.id === entry.message.id);
    if (!saved || pending.get(key) !== entry) continue;
    const local = localStorage.getItem(key);
    if (local && historyMessageFingerprint(JSON.parse(local).message) !== historyMessageFingerprint(entry.message)) continue;
    localStorage.removeItem(key); pending.delete(key); failures.delete(key);
    restored.push(saved as ChatMessage);
  }
  notify(); return restored;
}
