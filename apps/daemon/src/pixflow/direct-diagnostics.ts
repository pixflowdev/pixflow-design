import Database from 'better-sqlite3';
import { join } from 'node:path';

/** Manual export only: bounded rowid scan, no transcript/event reads or schema writes. */
export function readDirectDiagnostics(dataDir: string) {
  let db: Database.Database | undefined;
  try {
    db = new Database(join(dataDir, 'app.sqlite'), { readonly: true, fileMustExist: true, timeout: 100 });
    const rows = db.prepare(`SELECT id,surface,outcome,last_sequence,created_at,updated_at
      FROM pixflow_direct_runs ORDER BY rowid DESC LIMIT 50`).all() as Array<Record<string, unknown>>;
    const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    return {
      available: true,
      runs: rows.map(row => ({
        id: typeof row.id === 'string' && /^[a-f0-9]{32}$/u.test(row.id) ? row.id : undefined,
        surface: ['admin', 'bricks', 'sitemap'].includes(String(row.surface)) ? row.surface : 'unknown',
        outcome: row.outcome === null ? 'running' : ['completed', 'answered', 'awaiting_input', 'failed', 'canceled', 'interrupted'].includes(String(row.outcome)) ? row.outcome : 'unknown',
        eventCount: number(row.last_sequence), createdAt: number(row.created_at), updatedAt: number(row.updated_at),
      })),
    };
  } catch {
    return { available: false, reason: 'storage-unavailable', runs: [] };
  } finally { db?.close(); }
}
