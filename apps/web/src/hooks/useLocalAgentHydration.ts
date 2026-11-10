import { useEffect, useRef, useState } from 'react';
import type { AgentInfo } from '../types';

type Options = {
  enabled: boolean;
  hasAgents: boolean;
  bootstrapLoading: boolean;
  load: (force: boolean) => Promise<AgentInfo[]>;
  onAgents: (agents: AgentInfo[]) => void;
};

/** Discovery owns its loading state; that state must never cancel its own request.
 * Mode/inventory changes invalidate late results. Empty discovery retries once,
 * then settles until the next eligible transition rather than polling forever.
 */
export function useLocalAgentHydration(options: Options): boolean {
  const { enabled, hasAgents, bootstrapLoading } = options;
  const callbacks = useRef(options);
  callbacks.current = options;
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled || hasAgents || bootstrapLoading) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void (async () => {
      const first = await callbacks.current.load(false);
      return first.length || !active ? first : callbacks.current.load(true);
    })().then(list => {
      if (active && list.length) callbacks.current.onAgents(list);
    }).catch(() => {
      // Connection diagnostics own the error UI. Keep saved choices and allow
      // another discovery when the user returns to Local CLI.
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled, hasAgents, bootstrapLoading]);
  return loading;
}
