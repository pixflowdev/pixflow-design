import type { WorkspaceOrganization } from '@open-design/contracts';

/** CLI and UI share the same revision-checked endpoint; a conflict is never silently overwritten. */
export async function requestWorkspaceOrganization(base: string, action?: unknown): Promise<Response> {
  const url = `${base.replace(/\/$/, '')}/api/workspace-organization`;
  const response = await fetch(url);
  if (!response.ok || action === undefined) return response;
  const organization = await response.json() as WorkspaceOrganization;
  return fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: organization.revision, action }),
  });
}
