import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startBricksContextMirror } from '../../src/pixflow/bricks-context-mirror.js';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('exposes searchable native records and clears them when the document is lost', async () => {
  vi.useFakeTimers();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'context-records-'));
  const elements = [{id:'price',name:'heading',settings:{text:'Studio plan',_cssGlobalClasses:['accent']}},{id:'other',name:'text',settings:{text:'Other section'}}];
  const classes = [{id:'accent',name:'brand-card',settings:{_background:{color:{raw:'var(--brand)'}}}}];
  const snapshot = {schemaVersion:1,documentId:'doc',revision:3,postId:12,markdown:'# Pricing',sections:{elements,classes}};
  let resolve!: (value: Response) => void;
  vi.stubGlobal('fetch',vi.fn().mockImplementation(() => new Promise<Response>(r => {resolve=r;})));
  const stop=await startBricksContextMirror(dir,{endpoint:'https://site.invalid/tools',token:'private',expiresAt:9999999999,writable:false},'tab',snapshot);
  try {
    for(const [file,records] of [['BRICKS-ELEMENTS.jsonl',elements],['BRICKS-CLASSES.jsonl',classes]] as const) {
      const rows=(await fs.readFile(path.join(dir,file),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
      expect(rows[0]._mirror).toMatchObject({documentId:'doc',revision:3,postId:12});
      expect(rows.slice(1)).toEqual(records);
    }
    const matches=(await fs.readFile(path.join(dir,'BRICKS-ELEMENTS.jsonl'),'utf8')).split('\n').filter(line=>line.includes('Studio'));
    expect(matches).toHaveLength(1);expect(JSON.parse(matches[0]!)).toEqual(elements[0]);
    expect(await fs.readFile(path.join(dir,'BRICKS-CONTEXT.md'),'utf8')).toContain('context.sections.elements');
    expect(await fs.readFile(path.join(dir,'BRICKS-CONTEXT.md'),'utf8')).toContain('not a catalogue of available element types');
    resolve(Response.json({context:null,revision:'',connected:true,postId:12}));
    await vi.waitFor(async()=>expect(await fs.readFile(path.join(dir,'BRICKS-ELEMENTS.jsonl'),'utf8')).not.toContain('Studio'));
  } finally {resolve(Response.json({context:null,revision:'',connected:true,postId:12}));await stop();await fs.rm(dir,{recursive:true,force:true});}
});
it('clears a previous document when the same page reconnects without a snapshot', async () => {
  vi.useFakeTimers();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'context-reconnect-'));
  const snapshot = { schemaVersion: 1, documentId: 'old', revision: 2, postId: 12, status: 'ready', updatedAt: 'now', markdown: 'OLD DOCUMENT', sections: {} };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ context: null, revision: '', connected: true, postId: 12 })));
  const stop = await startBricksContextMirror(dir, { endpoint: 'https://site.invalid/tools', token: 'private', expiresAt: 9999999999, writable: false }, 'tab', snapshot);
  try {
    await vi.waitFor(async () => {
      const file = await fs.readFile(path.join(dir, 'BRICKS-CONTEXT.md'), 'utf8');
      expect(file).toContain('No compiled snapshot');
      expect(file).not.toContain('OLD DOCUMENT');
    });
  } finally { await stop(); await fs.rm(dir, { recursive: true, force: true }); }
});
it('mirrors revisions, marks transport failure stale, and stops on run completion', async () => {
  vi.useFakeTimers();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'context-mirror-'));
  const snapshot = { schemaVersion: 1, documentId: 'doc', revision: 1, postId: 12, status: 'ready', updatedAt: 'now', markdown: '# Variables\n--brand: blue', sections: { variables: [] } };
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ context: snapshot, connected: true, postId: 12 }))
    .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));
  vi.stubGlobal('fetch', fetcher);
  const stop = await startBricksContextMirror(dir, { endpoint: 'https://site.invalid/tools', token: 'private-token', expiresAt: 9999999999, writable: false }, 'tab', snapshot);
  try {
    // Real filesystem work completes independently of fake timers.
    await vi.waitFor(async () => expect(await fs.readFile(path.join(dir, 'BRICKS-CONTEXT.md'), 'utf8')).toContain('Mirror connection: connected'));
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(async () => expect(await fs.readFile(path.join(dir, 'BRICKS-CONTEXT.md'), 'utf8')).toContain('stale: HTTP 403'));
    expect(JSON.parse(fetcher.mock.calls[1]![1].body).arguments.revision).toBe('doc:1');
    await stop();
    expect(await fs.readFile(path.join(dir, 'BRICKS-CONTEXT.md'), 'utf8')).toContain('mirroring stopped');
    const json = await fs.readFile(path.join(dir, 'BRICKS-CONTEXT.json'), 'utf8');
    expect(json).not.toContain('private-token');
    expect(JSON.parse(json).context).toEqual(snapshot);
    // File search tools must be able to retrieve one field without returning the entire catalogue.
    const postLines = json.split('\n').filter(line => line.includes('"postId"'));
    expect(postLines).toHaveLength(1);
    expect(postLines[0]!.trim()).toBe('"postId": 12,');
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally { await stop(); await fs.rm(dir, { recursive: true, force: true }); }
});
