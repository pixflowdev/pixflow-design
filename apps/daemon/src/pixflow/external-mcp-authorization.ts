import type { Request } from 'express';
import type { PixflowDirectSiteSession } from '@open-design/contracts';
import { authenticateDirectOwner } from './direct-site-session.js';

export function mcpSession(request: Request): PixflowDirectSiteSession {
  try {
    const raw = request.get('X-Pixflow-Mcp-Session');
    if (!raw || raw.length > 8192) throw new Error();
    return JSON.parse(raw) as PixflowDirectSiteSession;
  } catch { throw new Error('Reconnect to WordPress before using Pro external MCP.'); }
}
export async function authorizeExternalMcp(session: PixflowDirectSiteSession, signal?: AbortSignal): Promise<void> {
  await authenticateDirectOwner(session, true, signal, undefined, 'external-mcp');
}
/** Authenticate optional external-tool credentials before creating any run state. */
export async function authorizeExternalMcpRequest(request: Request): Promise<PixflowDirectSiteSession | undefined> {
  if (!request.get('X-Pixflow-Mcp-Session')) return undefined;
  const session = mcpSession(request);
  await authorizeExternalMcp(session);
  return session;
}
export function hasMcpMentions(context: unknown): boolean {
  if (!context || typeof context !== 'object') return false;
  const ids = (context as {mcpServerIds?: unknown}).mcpServerIds;
  return Array.isArray(ids) && ids.length > 0;
}
/** Cancel native clients carrying external tools when the current site loses access. */
export function watchExternalMcpAccess(session: PixflowDirectSiteSession, unavailable: (error: Error) => void): () => void {
  const lifetime = new AbortController();
  let checking = false;
  const timer = setInterval(() => {
    if (checking || lifetime.signal.aborted) return;
    checking = true;
    void authorizeExternalMcp(session, lifetime.signal).catch(error => {
      if (!lifetime.signal.aborted) unavailable(error instanceof Error ? error : new Error('External MCP is unavailable.'));
    }).finally(() => { checking = false; });
  }, 5000);
  timer.unref();
  return () => { clearInterval(timer); lifetime.abort(); };
}
