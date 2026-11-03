import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { PixflowDirectSiteOutcome, PixflowDirectSiteRunIdentity } from '@open-design/contracts';

export const directDigest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export interface DirectRunRecord extends PixflowDirectSiteRunIdentity {
  id: string;
  owner: string;
  tokenHash: string;
  requestHash: string;
  workspace: string;
  outcome: PixflowDirectSiteOutcome | null;
  lastSequence: number;
  createdAt: number;
  updatedAt: number;
}
export interface DirectConversationRecord {
  key: string;
  compatibility: string;
  lineage: string;
  workspace: string;
  nativeSessionId: string | null;
}

/** Additive schema: Direct records have no dependency on project-file chats. */
export function migrateDirectSiteStore(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pixflow_direct_runs (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, token_hash TEXT NOT NULL,
      request_hash TEXT NOT NULL, conversation_id TEXT NOT NULL, task_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL, surface TEXT NOT NULL, workspace TEXT NOT NULL,
      outcome TEXT, last_sequence INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pixflow_direct_runs_conversation ON pixflow_direct_runs(owner, conversation_id, updated_at);
    CREATE TABLE IF NOT EXISTS pixflow_direct_events (
      run_id TEXT NOT NULL REFERENCES pixflow_direct_runs(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL, event_json TEXT NOT NULL, PRIMARY KEY(run_id, sequence)
    );
    CREATE TABLE IF NOT EXISTS pixflow_direct_conversations (
      key TEXT PRIMARY KEY, compatibility TEXT NOT NULL, lineage TEXT NOT NULL,
      workspace TEXT NOT NULL, native_session_id TEXT, updated_at INTEGER NOT NULL
    );
  `);
}

function record(row: Record<string, unknown> | undefined): DirectRunRecord | null {
  if (!row) return null;
  return { id: String(row.id), owner: String(row.owner), tokenHash: String(row.token_hash), requestHash: String(row.request_hash),
    conversationId: String(row.conversation_id), taskId: String(row.task_id), attemptId: String(row.attempt_id), surface: String(row.surface),
    workspace: String(row.workspace), outcome: row.outcome as PixflowDirectSiteOutcome | null,
    lastSequence: Number(row.last_sequence), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) };
}

export class DirectSiteStore {
  constructor(private readonly db: Database.Database) { migrateDirectSiteStore(db); }
  get(id: string): DirectRunRecord | null {
    return record(this.db.prepare('SELECT * FROM pixflow_direct_runs WHERE id = ?').get(id) as Record<string, unknown> | undefined);
  }
  create(run: DirectRunRecord): void {
    this.db.prepare(`INSERT INTO pixflow_direct_runs VALUES (@id,@owner,@tokenHash,@requestHash,@conversationId,@taskId,@attemptId,@surface,@workspace,@outcome,@lastSequence,@createdAt,@updatedAt)`).run(run);
  }
  /** Persist event and terminal state atomically before clients can observe them. */
  append(id: string, event: Record<string, unknown>): Record<string, unknown> {
    return this.appendMany(id,[event])[0]!;
  }
  /** One durable transaction per provider burst; consumers only see committed events. */
  appendMany(id: string, events: Record<string, unknown>[]): Record<string, unknown>[] {
    if(!events.length)return [];
    return this.db.transaction(() => {
      const run = this.get(id);
      if (!run) throw new Error('Direct run record is unavailable.');
      const updatedAt = Date.now();
      const insert=this.db.prepare('INSERT INTO pixflow_direct_events VALUES (?,?,?)');
      let outcome=run.outcome;
      const enriched=events.map((event,index)=>{
        const sequence=run.lastSequence+index+1;
        const value = { ...event, sequence, timestamp: updatedAt, runId: id,
        conversationId: run.conversationId, taskId: run.taskId, attemptId: run.attemptId };
        insert.run(id,sequence,JSON.stringify(value));
        if(event.type==='done')outcome=event.outcome as PixflowDirectSiteOutcome;
        return value;
      });
      this.db.prepare('UPDATE pixflow_direct_runs SET last_sequence=?,updated_at=?,outcome=? WHERE id=?')
        .run(run.lastSequence+events.length, updatedAt, outcome, id);
      return enriched;
    })();
  }
  events(id: string, afterSequence = 0): Record<string, unknown>[] {
    return (this.db.prepare('SELECT event_json FROM pixflow_direct_events WHERE run_id=? AND sequence>? ORDER BY sequence').all(id, afterSequence) as Array<{event_json:string}>)
      .map(row => JSON.parse(row.event_json) as Record<string, unknown>);
  }
  active(owner: string, conversationId: string): DirectRunRecord | null {
    return record(this.db.prepare('SELECT * FROM pixflow_direct_runs WHERE owner=? AND conversation_id=? AND outcome IS NULL LIMIT 1').get(owner, conversationId) as Record<string, unknown> | undefined);
  }
  conversation(key: string): DirectConversationRecord | null {
    const row = this.db.prepare('SELECT * FROM pixflow_direct_conversations WHERE key=?').get(key) as Record<string, unknown> | undefined;
    return row ? {key, compatibility:String(row.compatibility),lineage:String(row.lineage),workspace:String(row.workspace),nativeSessionId:row.native_session_id as string|null} : null;
  }
  saveConversation(value: DirectConversationRecord): void {
    this.db.prepare(`INSERT INTO pixflow_direct_conversations VALUES (@key,@compatibility,@lineage,@workspace,@nativeSessionId,@updatedAt)
      ON CONFLICT(key) DO UPDATE SET compatibility=excluded.compatibility,lineage=excluded.lineage,workspace=excluded.workspace,native_session_id=excluded.native_session_id,updated_at=excluded.updated_at`)
      .run({...value,updatedAt:Date.now()});
  }
  nextAttempt(id: string): void {
    this.db.prepare('UPDATE pixflow_direct_runs SET attempt_id=?,updated_at=? WHERE id=? AND outcome IS NULL').run(randomUUID(),Date.now(),id);
  }
  /** Never erase replay evidence from an active or interrupted run, or CLI session memory. */
  clearToolHistory(owner: string): number {
    return this.db.prepare(`DELETE FROM pixflow_direct_events
      WHERE run_id IN (SELECT id FROM pixflow_direct_runs WHERE owner=? AND outcome IS NOT NULL AND outcome!='interrupted')
      AND json_extract(event_json,'$.type') IN ('tool_use','tool_result','tool_input_delta')`).run(owner).changes;
  }
  recoverInterrupted(): string[] {
    const active = this.db.prepare('SELECT id,workspace FROM pixflow_direct_runs WHERE outcome IS NULL').all() as Array<{id:string;workspace:string}>;
    for (const run of active) this.db.transaction(() => {
      this.append(run.id, {type:'done',ok:false,outcome:'interrupted',message:'The Bridge restarted before this agent run completed. Previous edits may have happened; inspect their current state before continuing.'});
      this.db.prepare('UPDATE pixflow_direct_conversations SET native_session_id=NULL WHERE workspace=?').run(run.workspace);
    })();
    return active.map(run => run.workspace);
  }
  prune(now = Date.now()): string[] {
    const candidates=this.db.prepare('SELECT DISTINCT workspace FROM pixflow_direct_runs UNION SELECT workspace FROM pixflow_direct_conversations').all() as Array<{workspace:string}>;
    this.db.prepare('DELETE FROM pixflow_direct_runs WHERE outcome IS NOT NULL AND updated_at<?').run(now-7*86400_000);
    this.db.prepare('DELETE FROM pixflow_direct_conversations WHERE updated_at<? AND workspace NOT IN (SELECT workspace FROM pixflow_direct_runs)').run(now-30*86400_000);
    const retained=new Set((this.db.prepare('SELECT DISTINCT workspace FROM pixflow_direct_runs UNION SELECT workspace FROM pixflow_direct_conversations').all() as Array<{workspace:string}>).map(row=>row.workspace));
    return candidates.map(row=>row.workspace).filter(workspace=>!retained.has(workspace));
  }
}
