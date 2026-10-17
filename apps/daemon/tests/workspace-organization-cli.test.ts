import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestWorkspaceOrganization } from '../src/workspace-organization-cli.js';
afterEach(() => vi.unstubAllGlobals());
describe('organization CLI endpoint parity', () => {
  it('reads without writing when no action is supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ revision: 3 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await (await requestWorkspaceOrganization('http://localhost:1234/')).json()).toEqual({ revision: 3 });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('http://localhost:1234/api/workspace-organization');
  });
  it('submits a JSON action using the server revision and surfaces conflicts', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ revision: 7 })).mockResolvedValueOnce(Response.json({ message: 'Conflict' }, { status: 409 }));
    vi.stubGlobal('fetch', fetchMock);
    const action = { type: 'move-chat', chatId: 'existing', projectId: 'group' };
    expect((await requestWorkspaceOrganization('http://localhost:1234', action)).status).toBe(409);
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body)).toEqual({ revision: 7, action });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not mutate after a denied read', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({}, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await requestWorkspaceOrganization('http://localhost:1234', { type: 'delete-project', id: 'a' })).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
