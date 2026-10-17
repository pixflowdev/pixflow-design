import Database from 'better-sqlite3';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { applyWorkspaceOrganizationAction, registerWorkspaceOrganizationRoutes, workspaceOrganizationStore } from '../src/workspace-organization.js';
const initial = () => ({ revision: 0, projects: [], chats: {}, sidebarCollapsed: false });

describe('workspace organization preservation', () => {
  it('moves and pins chats, renames/deletes groups without altering source chats', () => {
    const chats = new Map([['chat-1', { title: 'Existing chat', messages: ['Keep me'], files: ['index.html'] }]]);
    const before = structuredClone(chats);
    let state = applyWorkspaceOrganizationAction(initial(), { type: 'create-project', id: 'client', name: 'Client' }, id => chats.has(id));
    for (const action of [
      { type: 'move-chat', chatId: 'chat-1', projectId: 'client' },
      { type: 'pin-chat', chatId: 'chat-1', pinned: true },
      { type: 'pin-project', id: 'client', pinned: true },
      { type: 'collapse-project', id: 'client', collapsed: true },
      { type: 'rename-project', id: 'client', name: 'New name' },
    ]) state = applyWorkspaceOrganizationAction(state, action, id => chats.has(id));
    expect(state.projects[0]).toEqual({ id: 'client', name: 'New name', pinned: true, collapsed: true });
    state = applyWorkspaceOrganizationAction(state, { type: 'delete-project', id: 'client' }, id => chats.has(id));
    expect(state.projects).toEqual([]);
    expect(state.chats['chat-1']).toEqual({ projectId: null, pinned: true });
    expect(chats).toEqual(before);
  });
  it.each([
    { type: 'create-project', id: '__proto__', name: 'Bad' },
    { type: 'create-project', id: 'ok', name: ' ' },
    { type: 'create-project', id: 'ok', name: 'a'.repeat(101) },
    { type: 'create-project', id: 'ok', name: 'a\u0000b' },
    { type: 'pin-chat', chatId: 'unknown', pinned: true },
    { type: 'pin-chat', chatId: 'chat-1', pinned: 'true' },
    { type: 'move-chat', chatId: 'chat-1', projectId: 'unknown' },
    { type: 'collapse-sidebar', collapsed: 1 },
    { type: 'destroy-all', id: 'anything' },
  ])('rejects invalid or inaccessible mutations %j', (action) => {
    const before = initial();
    expect(() => applyWorkspaceOrganizationAction(before, action, id => id === 'chat-1')).toThrow();
    expect(before).toEqual(initial());
  });
  it('persists across store reloads and rejects stale revisions atomically', () => {
    const db = new Database(':memory:');
    try {
      const store = workspaceOrganizationStore(db, () => true);
      store.mutate(0, { type: 'create-project', id: 'a', name: 'Project A' });
      expect(() => store.mutate(0, { type: 'collapse-sidebar', collapsed: true })).toThrow('Workspace changed');
      const reopened = workspaceOrganizationStore(db, () => true);
      expect(reopened.read().projects[0]?.name).toBe('Project A');
      expect(reopened.read().sidebarCollapsed).toBe(false);
      reopened.mutate(1, { type: 'collapse-section', section: 'projects', collapsed: true });
      expect(reopened.read().collapsedSections).toEqual({ projects: true });
      expect(() => reopened.mutate('1', { type: 'collapse-sidebar', collapsed: true })).toThrow('Invalid revision');
    } finally { db.close(); }
  });
  it('preserves independent collapse preferences and rejects unknown sections', () => {
    const first = applyWorkspaceOrganizationAction(initial(), { type: 'collapse-section', section: 'projects', collapsed: true }, () => true);
    const second = applyWorkspaceOrganizationAction(first, { type: 'collapse-section', section: 'chats', collapsed: true }, () => true);
    expect(second.collapsedSections).toEqual({ projects: true, chats: true });
    expect(() => applyWorkspaceOrganizationAction(second, { type: 'collapse-section', section: '__proto__', collapsed: true }, () => true)).toThrow('Invalid section');
  });
  it('uses the same HTTP read/mutation surface with conflict and no-store responses', async () => {
    const db = new Database(':memory:');
    const app = express(); app.use(express.json());
    registerWorkspaceOrganizationRoutes(app, db, id => id === 'chat-1');
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}/api/workspace-organization`;
    try {
      const first = await fetch(url);
      expect(first.headers.get('cache-control')).toBe('no-store');
      expect(await first.json()).toEqual(initial());
      const mutate = (body: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      expect((await mutate({ revision: 0, action: { type: 'pin-chat', chatId: 'private', pinned: true } })).status).toBe(404);
      expect((await mutate({ revision: 0, action: { type: 'pin-chat', chatId: 'chat-1', pinned: true } })).status).toBe(200);
      expect((await mutate({ revision: 0, action: { type: 'pin-chat', chatId: 'chat-1', pinned: false } })).status).toBe(409);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
  });
});
