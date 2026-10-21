import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import { chatHistoryOwnerScope } from '../pixflow/chat-history-client';
import { listMessagePage } from './chat-history';
import { workspaceHistoryPendingMessages } from './workspace-history-persistence';

/** Observers read durable replies without becoming writers or replacing pending edits. */
export function useWorkspaceHistoryRefresh(projectId: string, conversationId: string | null, enabled: boolean, accept: (messages: ChatMessage[]) => void) {
  const acceptRef = useRef(accept); acceptRef.current = accept;
  useEffect(() => {
    if (!enabled || !conversationId) return;
    const account = chatHistoryOwnerScope();
    let cancelled = false;
    let reading = false;
    const refresh = async () => {
      if (cancelled || reading || account !== chatHistoryOwnerScope()) return;
      reading = true;
      try {
        const page = await listMessagePage(projectId, conversationId);
        if (cancelled || account !== chatHistoryOwnerScope()) return;
        const pending = new Set(workspaceHistoryPendingMessages(projectId, conversationId).map(message => message.id));
        acceptRef.current(page.messages.filter(message => !pending.has(message.id)));
      } catch { /* A failed background read leaves the displayed history intact. */ }
      finally { reading = false; }
    };
    const focus = () => { void refresh(); };
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visible);
    const timer = window.setInterval(visible, 15000);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visible);
      window.clearInterval(timer);
    };
  }, [projectId, conversationId, enabled]);
}
