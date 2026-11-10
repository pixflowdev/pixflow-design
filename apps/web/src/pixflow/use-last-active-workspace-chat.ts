import { useEffect, useRef } from 'react';
import { buildPath, navigate, parseRoute, type Route } from '../router';
import { readChatHistory } from './chat-history-client';
import { getPixflowWordPressConfig } from './wordpress-context';
import { rememberLastActiveChat } from './last-active-chat';
import { decodeWorkspaceRouteHash } from './workspace-route-hash';

/** An ordinary Workspace opening belongs to this tab, site and WordPress user. */
export function useLastActiveWorkspaceChat(route: Route, active: boolean): void {
  const config = getPixflowWordPressConfig();
  const site = config?.restRouteBaseUrl || config?.restBaseUrl || config?.siteUrl;
  const owner = site && config?.userId ? 'pixflow:workspace-route:' + JSON.stringify([site, config.userId]) : null;
  const entered = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !owner) return;
    try {
      if (entered.current !== owner) {
        entered.current = owner;
        const stored = sessionStorage.getItem(owner);
        if (route.kind === 'home' && route.view === 'home' && !decodeWorkspaceRouteHash(location.hash) && stored && stored !== '/') {
          const target = parseRoute(stored);
          if (buildPath(target) === stored) {
            navigate(target, { replace: true });
            return;
          }
        }
      }
      sessionStorage.setItem(owner, buildPath(route));
    } catch { /* The current route still works if storage is unavailable. */ }
  }, [active, owner, route]);

  useEffect(() => {
    if (!active || route.kind !== 'project' || !route.conversationId) return;
    let cancelled = false;
    const binding = { projectId: route.projectId, conversationId: route.conversationId };
    void readChatHistory(binding).then(() => {
      if (!cancelled) rememberLastActiveChat(binding);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [active, owner, route]);
}
