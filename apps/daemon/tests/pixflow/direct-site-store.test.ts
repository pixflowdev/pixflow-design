import Database from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DirectSiteStore, directDigest, type DirectRunRecord } from '../../src/pixflow/direct-site-store.js';

const databases: Database.Database[]=[];
const fixture=(patch:Partial<DirectRunRecord>={}):DirectRunRecord=>({id:'a'.repeat(32),owner:'site-user-one',tokenHash:directDigest('private-continuation'),requestHash:'request',conversationId:'conversation',taskId:'task',attemptId:'attempt',surface:'admin',workspace:'workspace',outcome:null,lastSequence:0,createdAt:Date.now(),updatedAt:Date.now(),...patch});
function setup(){const db=new Database(':memory:');db.pragma('foreign_keys=ON');databases.push(db);return {db,store:new DirectSiteStore(db)};}
afterEach(()=>{for(const db of databases.splice(0))db.close();});

describe('durable Direct run state',()=>{
  it('clears only completed owner tool logs while preserving replay, text and native session memory',()=>{
    const {store}=setup();
    for (const [id,owner,outcome] of [['a','site-user-one','completed'],['b','site-user-one',null],['c','another-user','completed'],['d','site-user-one','interrupted']] as const) {
      store.create(fixture({id:id.repeat(32),owner}));
      store.appendMany(id.repeat(32),[{type:'tool_use',name:'site_tool'},{type:'tool_result',content:'private diagnostics'},{type:'text_delta',delta:'Kept answer'}]);
      if(outcome)store.append(id.repeat(32),{type:'done',ok:true,outcome});
    }
    store.saveConversation({key:'native',compatibility:'compatible',lineage:'unchanged',workspace:'workspace',nativeSessionId:'keep-session'});
    expect(store.clearToolHistory('site-user-one')).toBe(2);
    expect(store.events('a'.repeat(32)).map(event=>event.type)).toEqual(['text_delta','done']);
    expect(store.get('a'.repeat(32))?.lastSequence).toBe(4);
    for(const id of ['b','c','d'])expect(store.events(id.repeat(32))[0]?.type).toBe('tool_use');
    expect(store.conversation('native')?.nativeSessionId).toBe('keep-session');
    expect(store.clearToolHistory('site-user-one')).toBe(0);
  });
  it('reports a full database without committing a partial event batch',()=>{
    const {db,store}=setup();store.create(fixture());
    store.append('a'.repeat(32),{type:'text_delta',delta:'Already committed'});
    const pages=db.pragma('page_count',{simple:true});
    db.pragma(`max_page_count=${pages}`);
    expect(()=>store.appendMany('a'.repeat(32),[
      {type:'text_delta',delta:'Must roll back'},
      {type:'text_delta',delta:'x'.repeat(1024*1024)},
    ])).toThrow(/full/iu);
    expect(store.get('a'.repeat(32))).toMatchObject({lastSequence:1,outcome:null});
    expect(store.events('a'.repeat(32)).map(event=>event.delta)).toEqual(['Already committed']);
  });
  it('recovers the last committed batch after the writer dies inside the next transaction',()=>{
    const directory=mkdtempSync(join(tmpdir(),'pixflow-batch-crash-'));
    const filename=join(directory,'runs.sqlite');
    try {
      const source=new URL('../../src/pixflow/direct-site-store.ts',import.meta.url).href;
      const child=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`
        import Database from 'better-sqlite3';
        import { DirectSiteStore } from ${JSON.stringify(source)};
        const db=new Database(${JSON.stringify(filename)});
        db.pragma('journal_mode=WAL');
        const store=new DirectSiteStore(db);
        store.create(${JSON.stringify(fixture())});
        store.appendMany('a'.repeat(32),Array.from({length:64},(_,i)=>({type:'text_delta',delta:String(i)})));
        store.appendMany('a'.repeat(32),[
          {type:'text_delta',delta:'uncommitted'},
          {toJSON(){process.kill(process.pid,'SIGKILL');return {};}}
        ]);
      `],{encoding:'utf8',timeout:15000});
      expect(child.error).toBeUndefined();
      expect(child.status).not.toBe(0);
      const db=new Database(filename);
      try {
        const store=new DirectSiteStore(db);
        expect(store.get('a'.repeat(32))?.lastSequence).toBe(64);
        expect(store.events('a'.repeat(32)).map(event=>event.delta)).toEqual(Array.from({length:64},(_,i)=>String(i)));
        expect(store.recoverInterrupted()).toEqual(['workspace']);
        expect(store.events('a'.repeat(32)).at(-1)).toMatchObject({type:'done',outcome:'interrupted'});
        expect(store.recoverInterrupted()).toEqual([]);
        expect(store.events('a'.repeat(32))).toHaveLength(65);
      } finally {db.close();}
    } finally {rmSync(directory,{recursive:true,force:true});}
  });
  it('commits a complete ordered burst and rolls back the entire batch on serialization failure',()=>{
    const {db,store}=setup();store.create(fixture());
    const batch=Array.from({length:64},(_,i)=>({type:'text_delta',delta:String(i)}));
    expect(store.appendMany('a'.repeat(32),batch).map(event=>event.sequence)).toEqual(batch.map((_,i)=>i+1));
    const cycle:Record<string,unknown>={type:'text_delta'};cycle.cycle=cycle;
    expect(()=>store.appendMany('a'.repeat(32),[{type:'text_delta',delta:'lost'},cycle])).toThrow();
    expect(store.get('a'.repeat(32))?.lastSequence).toBe(64);
    const restarted=new DirectSiteStore(db);
    restarted.recoverInterrupted();
    expect(restarted.events('a'.repeat(32))).toHaveLength(65);
    expect(restarted.events('a'.repeat(32)).at(-1)).toMatchObject({outcome:'interrupted'});
  });
  it('atomically stores cursor and terminal outcome and leaves no reusable credential',()=>{
    const {db,store}=setup();store.create(fixture());
    expect(store.append('a'.repeat(32),{type:'text_delta',delta:'Visible'}).sequence).toBe(1);
    expect(store.append('a'.repeat(32),{type:'done',ok:true,outcome:'answered'}).sequence).toBe(2);
    expect(store.get('a'.repeat(32))).toMatchObject({lastSequence:2,outcome:'answered'});
    expect(store.events('a'.repeat(32),1)).toHaveLength(1);
    const raw=JSON.stringify(db.prepare('SELECT * FROM pixflow_direct_runs').all());
    expect(raw).not.toContain('private-continuation');
  });
  it('recovers an unfinished process once as interrupted without replaying actions',()=>{
    const {db,store}=setup();store.create(fixture());
    store.append('a'.repeat(32),{type:'tool_use',id:'command-one',name:'Bash'});
    store.saveConversation({key:'conversation-key',compatibility:'compatible',lineage:'history',workspace:'workspace',nativeSessionId:'native-old'});
    const restarted=new DirectSiteStore(db);
    expect(restarted.recoverInterrupted()).toEqual(['workspace']);
    expect(restarted.get('a'.repeat(32))?.outcome).toBe('interrupted');
    expect(restarted.conversation('conversation-key')?.nativeSessionId).toBeNull();
    restarted.saveConversation({key:'conversation-key',compatibility:'compatible',lineage:'new-history',workspace:'workspace',nativeSessionId:'native-new'});
    expect(restarted.recoverInterrupted()).toEqual([]);
    expect(restarted.conversation('conversation-key')?.nativeSessionId).toBe('native-new');
    expect(restarted.events('a'.repeat(32)).map(event=>event.type)).toEqual(['tool_use','done']);
  });
  it('isolates ownership and retains active work while expiring old completed records',()=>{
    const {store}=setup();store.create(fixture());
    store.create(fixture({id:'b'.repeat(32),owner:'another-user'}));
    expect(store.active('another-site','conversation')).toBeNull();
    expect(store.active('another-user','conversation')?.id).toBe('b'.repeat(32));
    store.append('a'.repeat(32),{type:'done',ok:true,outcome:'completed'});
    store.prune(Date.now()+8*86400_000);
    expect(store.get('a'.repeat(32))).toBeNull();expect(store.events('a'.repeat(32))).toEqual([]);
    expect(store.get('b'.repeat(32))?.outcome).toBeNull();
  });
});
