import { useEffect, useRef } from 'react';
import { navigate, type Route } from '../router';
import { readChatHistory } from './chat-history-client';
import { lastActiveChatOwner, rememberLastActiveChat, restoreLastActiveChat } from './last-active-chat';

/** Restore only the initial empty entry. Explicit routes and subsequent New chat actions win. */
export function useLastActiveWorkspaceChat(route: Route, active: boolean): void {
  const attempt = useRef<{ route: Route; result: ReturnType<typeof restoreLastActiveChat> } | null>(null);
  const routeRef = useRef(route);
  routeRef.current = route;
  useEffect(() => {
    if (!active) return;
    // Reuse the initial permission check during effect replay; later routes never restore.
    attempt.current ??= { route, result: route.kind === 'home' && route.view === 'home' && (!location.hash || location.hash === '#') ? restoreLastActiveChat() : Promise.resolve(null) };
    if (attempt.current.route !== route) return;
    let cancelled = false;
    void attempt.current.result.then(binding => {
      if (!cancelled && binding && routeRef.current === route) navigate({ kind: 'project', ...binding, fileName: null }, { replace: true });
    });
    return () => { cancelled = true; };
  }, [active, route]);
  useEffect(() => {
    if (!active || route.kind !== 'project' || !route.conversationId) return;
    let cancelled = false;
    const binding = { projectId: route.projectId, conversationId: route.conversationId };
    const owner = lastActiveChatOwner();
    void readChatHistory(binding).then(() => {
      if (!cancelled && owner === lastActiveChatOwner()) rememberLastActiveChat(binding);
    }).catch(() => { /* Never remember a route that the current user cannot read. */ });
    return () => { cancelled = true; };
  }, [active, route]);
}
