import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  insertConversation,
  insertProject,
  listLatestProjectRunStatuses,
  openDatabase,
  upsertMessage,
} from '../src/db.js';

describe('persisted project run completeness', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    closeDatabase();
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function seed(status: string, todos?: Array<{ content: string; status: string }>) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'od-project-completeness-'));
    tempDirs.push(dir);
    const db = openDatabase(dir, { dataDir: dir });
    const now = Date.now();
    insertProject(db, { id: 'p1', name: 'Project', createdAt: now, updatedAt: now });
    insertConversation(db, {
      id: 'c1', projectId: 'p1', title: null, sessionMode: 'design', createdAt: now, updatedAt: now,
    });
    upsertMessage(db, 'c1', {
      id: 'm1', role: 'assistant', content: '', runId: 'r1', runStatus: status,
      events: todos
        ? [{ kind: 'tool_use', id: 'tw1', name: 'TodoWrite', input: { todos } }]
        : [{ kind: 'text', text: 'Done.' }],
      startedAt: now, endedAt: now,
    });
    return db;
  }

  it('projects successful runs with pending work as incomplete', () => {
    const db = seed('succeeded', [
      { content: 'Build', status: 'in_progress' },
      { content: 'Verify', status: 'pending' },
    ]);
    expect(listLatestProjectRunStatuses(db).get('p1')?.value).toBe('incomplete');
  });

  it('keeps completed and text-only successful runs succeeded', () => {
    let db = seed('succeeded', [{ content: 'Build', status: 'completed' }]);
    expect(listLatestProjectRunStatuses(db).get('p1')?.value).toBe('succeeded');
    closeDatabase();
    db = seed('succeeded');
    expect(listLatestProjectRunStatuses(db).get('p1')?.value).toBe('succeeded');
  });
});
