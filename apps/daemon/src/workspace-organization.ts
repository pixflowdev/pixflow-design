import type Database from 'better-sqlite3';
import type { Express } from 'express';
import type { WorkspaceOrganization, WorkspaceOrganizationAction } from '@open-design/contracts';

const empty = (): WorkspaceOrganization => ({ revision: 0, projects: [], chats: {}, sidebarCollapsed: false });
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value) && !['constructor', 'prototype', '__proto__'].includes(value);
export class WorkspaceOrganizationError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
/** Organization never changes chat records. Removing a group only clears its memberships. */
export function applyWorkspaceOrganizationAction(state: WorkspaceOrganization, input: unknown, chatExists: (id: string) => boolean): WorkspaceOrganization {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new WorkspaceOrganizationError('Invalid organization action.');
  const action = input as WorkspaceOrganizationAction;
  const next = structuredClone(state);
  if (action.type === 'collapse-section') {
    if (!['pinned', 'projects', 'chats'].includes(action.section) || typeof action.collapsed !== 'boolean') throw new WorkspaceOrganizationError('Invalid section state.');
    next.collapsedSections = { ...next.collapsedSections, [action.section]: action.collapsed };
  } else if (action.type === 'collapse-sidebar') {
    if (typeof action.collapsed !== 'boolean') throw new WorkspaceOrganizationError('Invalid collapsed state.');
    next.sidebarCollapsed = action.collapsed;
  } else if (action.type === 'move-chat' || action.type === 'pin-chat') {
    if (!id(action.chatId) || !chatExists(action.chatId)) throw new WorkspaceOrganizationError('Chat not found.', 404);
    const chat = next.chats[action.chatId] ?? { projectId: null, pinned: false };
    if (action.type === 'pin-chat') {
      if (typeof action.pinned !== 'boolean') throw new WorkspaceOrganizationError('Invalid pinned state.');
      chat.pinned = action.pinned;
    } else {
      if (action.projectId !== null && (!id(action.projectId) || !next.projects.some(p => p.id === action.projectId))) throw new WorkspaceOrganizationError('Project not found.', 404);
      chat.projectId = action.projectId;
    }
    if (!chat.pinned && chat.projectId === null) delete next.chats[action.chatId];
    else next.chats[action.chatId] = chat;
    if (Object.keys(next.chats).length > 10000) throw new WorkspaceOrganizationError('Workspace organization limit reached.');
  } else {
    if (!('id' in action) || !id(action.id)) throw new WorkspaceOrganizationError('Invalid project ID.');
    const group = next.projects.find(p => p.id === action.id);
    if (action.type === 'create-project' || action.type === 'rename-project') {
      if (typeof action.name !== 'string' || !action.name.trim() || action.name.trim().length > 100 || /[\u0000-\u001f\u007f]/.test(action.name)) throw new WorkspaceOrganizationError('Project name must contain 1–100 characters.');
      if (action.type === 'create-project') {
        if (group) throw new WorkspaceOrganizationError('Project already exists.', 409);
        if (next.projects.length >= 200) throw new WorkspaceOrganizationError('Project limit reached.');
        next.projects.push({ id: action.id, name: action.name.trim(), pinned: false, collapsed: false });
      } else {
        if (!group) throw new WorkspaceOrganizationError('Project not found.', 404);
        group.name = action.name.trim();
      }
    } else {
      if (!group) throw new WorkspaceOrganizationError('Project not found.', 404);
      if (action.type === 'delete-project') {
        next.projects = next.projects.filter(p => p.id !== action.id);
        for (const chat of Object.values(next.chats)) if (chat.projectId === action.id) chat.projectId = null;
      } else if (action.type === 'pin-project') {
        if (typeof action.pinned !== 'boolean') throw new WorkspaceOrganizationError('Invalid pinned state.');
        group.pinned = action.pinned;
      } else if (action.type === 'collapse-project') {
        if (typeof action.collapsed !== 'boolean') throw new WorkspaceOrganizationError('Invalid collapsed state.');
        group.collapsed = action.collapsed;
      } else throw new WorkspaceOrganizationError('Unknown organization action.');
    }
  }
  next.revision++;
  return next;
}

/** SQLite transaction makes stale-tab updates fail rather than silently replace newer organization. */
export function workspaceOrganizationStore(db: Database.Database, chatExists: (id: string) => boolean): {
  read: () => WorkspaceOrganization;
  mutate: (revision: unknown, action: unknown) => WorkspaceOrganization;
} {
  db.exec('CREATE TABLE IF NOT EXISTS workspace_organization (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL)');
  const read = (): WorkspaceOrganization => {
    const row = db.prepare('SELECT state FROM workspace_organization WHERE id=1').get() as { state: string } | undefined;
    return row ? JSON.parse(row.state) as WorkspaceOrganization : empty();
  };
  return {
    read,
    mutate: db.transaction((revision: unknown, action: unknown) => {
      const previous = read();
      if (!Number.isSafeInteger(revision) || Number(revision) < 0) throw new WorkspaceOrganizationError('Invalid revision.');
      if (revision !== previous.revision) throw new WorkspaceOrganizationError('Workspace changed. Refresh and try again.', 409);
      const next = applyWorkspaceOrganizationAction(previous, action, chatExists);
      db.prepare('INSERT INTO workspace_organization (id,state) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state').run(JSON.stringify(next));
      return next;
    }),
  };
}
export function registerWorkspaceOrganizationRoutes(app: Express, db: Database.Database, chatExists: (id: string) => boolean) {
  const store = workspaceOrganizationStore(db, chatExists);
  app.get('/api/workspace-organization', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(store.read()); });
  app.post('/api/workspace-organization', (req, res) => {
    try { res.setHeader('Cache-Control', 'no-store'); res.json(store.mutate(req.body?.revision, req.body?.action)); }
    catch (error) {
      if (!(error instanceof WorkspaceOrganizationError)) throw error;
      res.status(error.status).json({ message: error.message });
    }
  });
}
