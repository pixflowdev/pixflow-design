import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDirectDiagnostics } from '../../src/pixflow/direct-diagnostics.js';

describe('bounded private Direct diagnostics', () => {
  it('reads only the newest 50 metadata rows without exporting arbitrary stored text', () => {
    const root = mkdtempSync(join(tmpdir(), 'pixflow-diagnostics-'));
    const db = new Database(join(root, 'app.sqlite'));
    try {
      db.exec('CREATE TABLE pixflow_direct_runs (id TEXT, surface TEXT, outcome TEXT, last_sequence INTEGER, created_at INTEGER, updated_at INTEGER, private_content TEXT)');
      const insert = db.prepare('INSERT INTO pixflow_direct_runs VALUES (?,?,?,?,?,?,?)');
      db.transaction(() => {
        for (let i = 0; i < 10000; i++) insert.run(i.toString(16).padStart(32, '0'), 'admin', 'completed', i, i, i + 100, 'PRIVATE PROMPT');
        insert.run('PRIVATE ID', 'PRIVATE SURFACE', 'PRIVATE ERROR', 1, 1, 2, 'SECRET');
      })();
      const result = readDirectDiagnostics(root);
      expect(result.available).toBe(true);
      expect(result.runs).toHaveLength(50);
      expect(result.runs[1]).toMatchObject({ surface: 'admin', outcome: 'completed', eventCount: 9999 });
      expect(JSON.stringify(result)).not.toMatch(/PRIVATE|SECRET/);
      expect(db.prepare('SELECT count(*) AS n FROM pixflow_direct_runs').get()).toEqual({ n: 10001 });
    } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
  });
  it('reports unavailable storage without exposing a path or creating a database', () => {
    expect(readDirectDiagnostics(join(tmpdir(), 'missing-private-pixflow-db'))).toEqual({ available: false, reason: 'storage-unavailable', runs: [] });
  });
});
