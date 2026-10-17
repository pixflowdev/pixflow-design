import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import http from 'node:http';
const fixture = vi.hoisted(() => ({ messages: [] as any[], busy: true, posts: [] as any[], status: 204, aborts: 0, resume: false, servers: [] as any[] }));
vi.mock('node:child_process', () => ({spawn: (_command: string, args: string[], options: any) => {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: () => { server.closeAllConnections();server.close();return true; } });
  const server = http.createServer(async (req,res) => {
    expect(req.headers.authorization).toBe('Basic '+Buffer.from('pixflow:'+options.env.OPENCODE_SERVER_PASSWORD).toString('base64'));
    let raw=''; for await (const c of req) raw+=c;
    res.setHeader('Content-Type','application/json');
    const send=(value:unknown)=>res.end(JSON.stringify(value));
    if(req.url==='/global/health')return send({healthy:true});
    if(req.url==='/session/saved'&&req.method==='GET'){fixture.resume=true;return send({id:'saved'});}
    if(req.url==='/session'&&req.method==='POST')return send({id:'saved'});
    if(req.url==='/session/saved/message')return send(fixture.messages);
    if(req.url==='/session/status')return send(fixture.busy?{saved:{type:'busy'}}:{});
    if(req.url==='/session/saved/abort'){fixture.aborts++;return send(true);}
    if(req.url==='/session/saved/prompt_async'){
      fixture.posts.push(JSON.parse(raw));res.statusCode=fixture.status;
      if(fixture.status===204)fixture.messages.push({info:{id:'user'+fixture.posts.length,role:'user'},parts:[]});
      return res.end();
    }
    res.statusCode=404;send({});
  }).listen(Number(args[args.indexOf('--port')+1]),'127.0.0.1',()=>child.stdout.write('opencode server listening on http://127.0.0.1:'+args[args.indexOf('--port')+1]));
  fixture.servers.push(server);return child;
}}));
import { runOpenCodeTurn, createOpenCodePresenter } from '../../src/pixflow/opencode-turn.js';
import type { CodexSteer } from '../../src/pixflow/codex-turn.js';
afterEach(()=>{for(const server of fixture.servers){server.closeAllConnections();server.close();}Object.assign(fixture,{servers:[],messages:[],busy:true,posts:[],status:204,aborts:0,resume:false});});
function start(resumeSessionId: string|null=null){let steer:CodexSteer|undefined;const controller=new AbortController();const events:any[]=[];const run=runOpenCodeTurn({executable:'opencode',env:{},cwd:process.cwd(),prompt:'Original',images:[],resumeSessionId,signal:controller.signal,onChild:()=>{},onEvent:event=>events.push(event),onSteerReady:fn=>{steer=fn;}});void run.catch(()=>{});return {run,controller,events,get steer(){return steer;}};}
function finish(text='Final'){fixture.messages.push({info:{id:'answer',role:'assistant',parentID:'user'+fixture.posts.length,finish:'stop',time:{completed:Date.now()}},parts:[{id:'text',type:'text',text}]});fixture.busy=false;}
it('steers the same session, deduplicates retries and waits for the final reply',async()=>{
 const test=start();await vi.waitFor(()=>expect(test.steer).toBeTypeOf('function'));
 const steer=test.steer!;expect(await steer('message-1','Revised')).toMatchObject({state:'accepted'});
 expect(await steer('message-1','Revised')).toMatchObject({state:'accepted'});
 expect(await steer('message-1','Different')).toMatchObject({state:'rejected'});
 expect(fixture.posts).toHaveLength(2);finish();expect(await test.run).toBe('saved');
 expect(test.events.filter(e=>e.type==='text_delta').map(e=>e.delta).join('')).toBe('Final');
 expect(await steer('message-2','Too late')).toMatchObject({state:'rejected'});
});
it('keeps an uncertain delivery uncertain and never resubmits it',async()=>{
 const test=start();await vi.waitFor(()=>expect(test.steer).toBeTypeOf('function'));fixture.status=503;
 expect(await test.steer!('message-1','Revised')).toMatchObject({state:'unconfirmed'});
 expect(await test.steer!('message-1','Revised')).toMatchObject({state:'unconfirmed'});
 expect(fixture.posts).toHaveLength(2);test.controller.abort();await expect(test.run).rejects.toThrow();
});
it('resumes without replaying old messages and cancels after steering',async()=>{
 fixture.messages=[{info:{id:'old',role:'assistant'},parts:[{id:'old-text',type:'text',text:'Old answer'}]}];
 const test=start('saved');await vi.waitFor(()=>expect(test.steer).toBeTypeOf('function'));
 await test.steer!('message-1','Revised');test.controller.abort();await expect(test.run).rejects.toThrow();
 expect(fixture.resume).toBe(true);expect(test.events.some(e=>e.delta==='Old answer')).toBe(false);expect(fixture.aborts).toBe(1);
});
it('emits incremental text and tools once from repeated snapshots',()=>{
 const events:any[]=[];const emit=createOpenCodePresenter(e=>events.push(e),new Set());
 const message:any={info:{id:'a',role:'assistant'},parts:[{id:'p',type:'text',text:'Hello'},{id:'t',type:'tool',tool:'bash',state:{status:'completed',input:{command:'echo'},output:'ok'}}]};
 emit([message]);emit([message]);message.parts[0].text+=' world';emit([message]);
 emit([{info:{id:'b',role:'assistant'},parts:[{id:'q',type:'text',text:'Next'}]}]);
 expect(events.filter(e=>e.type==='text_delta').map(e=>e.delta).join('')).toBe('Hello world\n\nNext');
 expect(events.filter(e=>e.type==='tool_use')).toHaveLength(1);expect(events.filter(e=>e.type==='tool_result')).toHaveLength(1);
});
it('identifies a missing native session before submitting or aborting any work',async()=>{
 const test=start('missing');
 await expect(test.run).rejects.toMatchObject({code:'PIXFLOW_NATIVE_SESSION_MISSING'});
 expect(fixture.posts).toHaveLength(0);expect(fixture.aborts).toBe(0);expect(test.steer).toBeUndefined();
});
it('keeps native summaries out of the visible transcript and reports their lifecycle once',()=>{
 const events:any[]=[];const emit=createOpenCodePresenter(e=>events.push(e),new Set());
 const summary:any={info:{id:'summary',role:'assistant',summary:true,time:{}},parts:[{id:'private-summary',type:'text',text:'Internal context checkpoint'}]};
 emit([summary]);emit([summary]);summary.info.time.completed=Date.now();emit([summary]);emit([summary]);
 expect(events.filter(e=>e.type==='text_delta')).toHaveLength(0);
 expect(events.filter(e=>e.contextCompaction).map(e=>e.contextCompaction)).toEqual(['running','completed']);
});
it('waits through native compaction and preserves queued steering without duplicate delivery',async()=>{
 const test=start('saved');await vi.waitFor(()=>expect(test.steer).toBeTypeOf('function'));
 fixture.messages.push({info:{id:'compact',role:'assistant',parentID:'user1',summary:true,time:{}},parts:[{id:'summary',type:'text',text:'Internal summary'}]});
 await vi.waitFor(()=>expect(test.events.some(e=>e.contextCompaction==='running')).toBe(true));
 expect(await test.steer!('queued','Use the preserved decisions')).toMatchObject({state:'rejected'});
 expect(fixture.posts).toHaveLength(1);
 fixture.messages[1].info.time.completed=Date.now();fixture.messages[1].info.finish='stop';fixture.busy=false;
 await vi.waitFor(()=>expect(test.events.some(e=>e.contextCompaction==='completed')).toBe(true));
 expect(await test.steer!('queued','Use the preserved decisions')).toMatchObject({state:'accepted'});
 await test.steer!('queued','Use the preserved decisions');expect(fixture.posts).toHaveLength(2);
 finish();await test.run;
 expect(test.events.filter(e=>e.type==='text_delta').map(e=>e.delta).join('')).toBe('Final');
});
