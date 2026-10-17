import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceOrganization, WorkspaceOrganizationAction } from '@open-design/contracts';
import { isPixflowWordPressEmbed, requestWordPressRest } from '../pixflow/license';
import { pixflowRuntimeFetch } from '../pixflow/runtime-fetch';

export type { WorkspaceOrganization, WorkspaceOrganizationAction, WorkspaceProjectGroup } from '@open-design/contracts';
export const emptyWorkspaceOrganization = (): WorkspaceOrganization => ({ revision: 0, projects: [], chats: {}, sidebarCollapsed: false });
type DisclosureAction = Extract<WorkspaceOrganizationAction, { type: 'collapse-sidebar' | 'collapse-project' | 'collapse-section' }>;
export function isWorkspaceDisclosureAction(action: WorkspaceOrganizationAction): action is DisclosureAction {
  return action.type === 'collapse-sidebar' || action.type === 'collapse-project' || action.type === 'collapse-section';
}
async function request(method: 'GET' | 'POST', body?: Record<string, unknown>) {
  if (isPixflowWordPressEmbed()) return requestWordPressRest<WorkspaceOrganization & { message?: string }>('od/workspace-organization', { method, body });
  const result = await pixflowRuntimeFetch('/api/workspace-organization', {
    method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  let parsed: WorkspaceOrganization & { message?: string };
  try { parsed = await result.json() as WorkspaceOrganization & { message?: string }; }
  catch { throw new Error('Could not load workspace organization.'); }
  return { ok: result.ok, status: result.status, body: parsed };
}

/** Persist per-user grouping separately from chat files and messages. Mutations serialize and retry one stale revision. */
export function useWorkspaceOrganization(enabled = true) {
  const [organization, setOrganization] = useState<WorkspaceOrganization>(emptyWorkspaceOrganization);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(organization);
  const serial = useRef<Promise<unknown>>(Promise.resolve());
  const alive = useRef(true);
  const pendingDisclosures = useRef(new Map<symbol, DisclosureAction>());
  // Presentation follows the latest click immediately; revisions always use
  // confirmed server state. Older responses cannot undo a newer pending click.
  const publish = useCallback(() => {
    if (!alive.current) return;
    let presented = current.current;
    for (const action of pendingDisclosures.current.values()) {
      if (action.type === 'collapse-sidebar') presented = { ...presented, sidebarCollapsed: action.collapsed };
      else if (action.type === 'collapse-section') presented = { ...presented, collapsedSections: { ...presented.collapsedSections, [action.section]: action.collapsed } };
      else presented = { ...presented, projects: presented.projects.map(project => project.id === action.id ? { ...project, collapsed: action.collapsed } : project) };
    }
    setOrganization(presented);
  }, []);
  const accept = useCallback((next: WorkspaceOrganization) => {
    if (next.revision < current.current.revision) return current.current;
    current.current = next;
    publish();
    if (alive.current) setError(null);
    return next;
  }, [publish]);
  const refresh = useCallback(async () => {
    if (!enabled) return current.current;
    const response = await request('GET');
    if (!response.ok) throw new Error(response.body.message || 'Could not load workspace organization.');
    return accept(response.body);
  }, [accept, enabled]);
  useEffect(() => {
    alive.current = true;
    if (!enabled) { setLoading(false); return () => { alive.current = false; }; }
    setLoading(true);
    void refresh().catch((e: Error) => { if (alive.current) setError(e.message); }).finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; };
  }, [refresh, enabled]);
  const mutate = useCallback((action: WorkspaceOrganizationAction): Promise<WorkspaceOrganization> => {
    const pendingId = Symbol();
    if (enabled && isWorkspaceDisclosureAction(action)) {
      pendingDisclosures.current.set(pendingId, action);
      publish();
    }
    const next = serial.current.catch(() => {}).then(async () => {
      if (!enabled) throw new Error('Workspace organization is unavailable.');
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await request('POST', { revision: current.current.revision, action });
        if (response.ok) return accept(response.body);
        if (response.status === 409 && attempt === 0) { await refresh(); continue; }
        throw new Error(response.body.message || 'Could not update workspace organization.');
      }
      throw new Error('Could not update workspace organization.');
    }).catch((e: Error) => { if (alive.current) setError(e.message); throw e; })
      .finally(() => {
        if (pendingDisclosures.current.delete(pendingId)) publish();
      });
    serial.current = next;
    return next;
  }, [accept, refresh, enabled, publish]);
  return { organization, loading, error, refresh, mutate };
}
