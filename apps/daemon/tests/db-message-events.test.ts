import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  appendMessageAgentEvent,
  appendMessageStatusEvent,
  closeDatabase,
  insertConversation,
  insertProject,
  listMessages,
  openDatabase,
  upsertMessage,
} from '../src/db.js';

describe('message event persistence', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-db-message-events-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('upgrades an existing history database additively and persists fork media provenance after reopen', () => {
    let db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'source', name: 'Original', createdAt: now, updatedAt: now });
    insertConversation(db, { id: 'original', projectId: 'source', createdAt: now, updatedAt: now });
    upsertMessage(db, 'original', { id: 'existing', role: 'assistant', content: 'Keep this exact answer 🎨' });
    db.exec('ALTER TABLE messages DROP COLUMN history_origin_json');
    closeDatabase(); db = openDatabase(tempDir, { dataDir: tempDir });
    expect(listMessages(db, 'original')[0]?.content).toBe('Keep this exact answer 🎨');
    const historyOrigin = { projectId: 'source', conversationId: 'original', messageId: 'existing' };
    upsertMessage(db, 'original', { id: 'copy', role: 'assistant', content: 'Copied media', historyOrigin });
    closeDatabase(); db = openDatabase(tempDir, { dataDir: tempDir });
    expect(listMessages(db, 'original')[1]?.historyOrigin).toEqual(historyOrigin);
    expect(listMessages(db, 'original')[0]?.id).toBe('existing');
  });

  it('appends deduplicated failure status events to assistant messages', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, {
      id: 'proj-1',
      name: 'Routine project',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-1',
      projectId: 'proj-1',
      title: 'Routine run',
      createdAt: now,
      updatedAt: now,
    });
    upsertMessage(db, 'conv-1', {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      runId: 'agent-run-1',
      runStatus: 'running',
      events: [{ kind: 'status', label: 'starting', detail: 'Codex' }],
      startedAt: now,
    });

    appendMessageStatusEvent(db, 'assistant-1', {
      label: 'error',
      detail: 'Agent stalled without emitting any new output for 1s.',
    });
    appendMessageStatusEvent(db, 'assistant-1', {
      label: 'error',
      detail: 'Agent stalled without emitting any new output for 1s.',
    });

    expect(listMessages(db, 'conv-1')[0]?.events).toEqual([
      { kind: 'status', label: 'starting', detail: 'Codex' },
      {
        kind: 'status',
        label: 'error',
        detail: 'Agent stalled without emitting any new output for 1s.',
      },
    ]);
  });

  it('appends agent events and mirrors text deltas into message content', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, {
      id: 'proj-1',
      name: 'Video project',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-1',
      projectId: 'proj-1',
      title: 'HyperFrames run',
      createdAt: now,
      updatedAt: now,
    });
    upsertMessage(db, 'conv-1', {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      runId: 'agent-run-1',
      runStatus: 'running',
      events: [],
      startedAt: now,
    });

    appendMessageAgentEvent(db, 'assistant-1', { kind: 'text', text: 'Rendering ' });
    appendMessageAgentEvent(db, 'assistant-1', {
      kind: 'tool_use',
      id: 'tool-1',
      name: 'Bash',
      input: { command: 'od media generate' },
    });
    appendMessageAgentEvent(db, 'assistant-1', { kind: 'text', text: 'done.' });

    const message = listMessages(db, 'conv-1')[0];
    expect(message?.content).toBe('Rendering done.');
    expect(message?.events).toEqual([
      { kind: 'text', text: 'Rendering ' },
      {
        kind: 'tool_use',
        id: 'tool-1',
        name: 'Bash',
        input: { command: 'od media generate' },
      },
      { kind: 'text', text: 'done.' },
    ]);
  });

  it('persists result delivery independently from process success', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'proj-1', name: 'Design', createdAt: now, updatedAt: now });
    insertConversation(db, {
      id: 'conv-1',
      projectId: 'proj-1',
      title: 'Delivery',
      createdAt: now,
      updatedAt: now,
    });
    upsertMessage(db, 'conv-1', {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Done.',
      runStatus: 'succeeded',
      resultDeliveryState: 'delivery_failed',
      sessionMode: 'design',
    });

    expect(listMessages(db, 'conv-1')[0]).toMatchObject({
      runStatus: 'succeeded',
      resultDeliveryState: 'delivery_failed',
      sessionMode: 'design',
    });
  });

  it('round-trips Plan mode on persisted messages', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'proj-1', name: 'Plan', createdAt: now, updatedAt: now });
    insertConversation(db, {
      id: 'conv-1',
      projectId: 'proj-1',
      title: 'Plan first',
      sessionMode: 'plan',
      createdAt: now,
      updatedAt: now,
    });
    upsertMessage(db, 'conv-1', {
      id: 'user-1',
      role: 'user',
      content: 'Plan a Bricks hero.',
      sessionMode: 'plan',
    });

    expect(listMessages(db, 'conv-1')[0]).toMatchObject({
      content: 'Plan a Bricks hero.',
      sessionMode: 'plan',
    });
  });
});
