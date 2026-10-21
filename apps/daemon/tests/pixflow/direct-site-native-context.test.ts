import { afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type { runCodexTurn } from '../../src/pixflow/codex-turn.js';

type Turn = Parameters<typeof runCodexTurn>[0];
const native = vi.hoisted(() => ({calls:[] as Turn[], execute:async (_options:Turn):Promise<string>=>'saved-native'}));
vi.mock('../../src/pixflow/codex-turn.js',()=>({runCodexTurn:async(options:Turn)=>{native.calls.push(options);return native.execute(options);}}));
vi.mock('../../src/agents.js',()=>({getAgentDef:()=>({id:'codex',streamFormat:'json-event-stream',eventParser:'codex',resumesSessionViaCli:true,buildArgs:()=>[]}),resolveAgentLaunch:()=>({launchPath:process.execPath}),applyAgentLaunchEnv:()=>process.env,spawnEnvForAgent:()=>process.env}));
vi.mock('../../src/app-config.js',()=>({readAppConfig:async()=>({}),agentCliEnvForAgent:()=>({})}));
import { registerDirectSiteRoutes } from '../../src/pixflow/direct-site-routes.js';
import { NativeSessionMissingError } from '../../src/pixflow/native-session-recovery.js';
import { closeDatabase } from '../../src/db.js';

let server:Server|undefined;
let directory:string|undefined;
afterEach(async()=>{
  if(server)await new Promise<void>(resolve=>{server!.closeAllConnections();server!.close(()=>resolve());});
  closeDatabase();
  if(directory)await fs.rm(directory,{recursive:true,force:true});
  native.calls=[];
});
async function setup(){
  directory=await fs.mkdtemp(path.join(os.tmpdir(),'pixflow-native-context-'));
  const app=express();app.use(express.json());
  app.get('/session',(_req,res)=>res.json({features:{},identity:{siteId:'context-site',userId:1,blogId:1},writable:false}));
  app.delete('/session',(_req,res)=>res.json({ok:true}));
  registerDirectSiteRoutes(app,directory,(_req,_res,next)=>next(),{helper:'',prompt:input=>JSON.stringify({prompt:input.prompt,history:input.history}),skills:async()=>({}),attachments:async()=>[]});
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));
  const address=server.address();if(!address||typeof address==='string')throw new Error('No port');
  const url=`http://127.0.0.1:${address.port}`;
  const session={endpoint:url+'/tools',token:'pfdirect_'+'a'.repeat(64),writable:false,expiresAt:Date.now()/1000+300};
  const request={agentId:'codex',conversationId:'context-history',surface:'admin',prompt:'First request',history:[] as Array<{role:string;content:string}>,continuation:{id:'1'.repeat(32),token:'2'.repeat(64)},session};
  const post=(action:string,body:unknown)=>fetch(url+'/api/pixflow/direct-site/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  native.execute=async options=>{options.onEvent({type:'text_delta',delta:'First answer'});return 'saved-native';};
  await(await post('run-stream',request)).text();
  const history=[{role:'user',content:'First request'},{role:'assistant',content:'First answer'}];
  return {request:{...request,prompt:'Continue',history,continuation:{id:'3'.repeat(32),token:'4'.repeat(64)}},post};
}

it('recovers a missing native context once with complete history and replays retries without another run',async()=>{
  const {request,post}=await setup();const preserved=structuredClone(request.history);
  native.execute=async options=>{
    if(options.resumeSessionId)throw new NativeSessionMissingError();
    options.onEvent({type:'text_delta',delta:'Recovered answer'});return 'recovered-native';
  };
  const output=await(await post('run-stream',request)).text();
  expect(native.calls.map(call=>call.resumeSessionId)).toEqual([null,'saved-native',null]);
  expect(JSON.parse(native.calls[1]!.prompt).history).toEqual([]);
  expect(JSON.parse(native.calls[2]!.prompt).history).toEqual(preserved);
  expect(request.history).toEqual(preserved);
  expect(output).toContain('"outcome":"answered"');
  const replay=await(await post('run-stream',request)).text();
  expect(replay).toContain('Recovered answer');expect(native.calls).toHaveLength(3);
});

it.each(['text','tool','journal'])('does not restart a native context after %s evidence of dispatched work',async(evidence)=>{
  const {request,post}=await setup();
  native.execute=async options=>{
    if(evidence==='text')options.onEvent({type:'text_delta',delta:'Work already started'});
    if(evidence==='tool')options.onEvent({type:'tool_use',id:'one',name:'Edit',input:{}});
    if(evidence==='journal')await fs.writeFile(path.join(options.cwd,'site-tool-journal.jsonl'),JSON.stringify({runId:request.continuation.id,phase:'dispatched'})+'\n');
    throw new NativeSessionMissingError();
  };
  const output=await(await post('run-stream',request)).text();
  expect(native.calls).toHaveLength(2);expect(output).toContain('"outcome":"failed"');
});

it('retains a canceled compacting run for recovery and seeds the next request without replaying the canceled turn',async()=>{
  const {request,post}=await setup();
  native.execute=options=>new Promise<string>(resolve=>{
    options.onEvent({type:'status',label:'Compacting working context',contextCompaction:'running'});
    options.signal.addEventListener('abort',()=>resolve('saved-native'),{once:true});
  });
  const response=await post('run-stream',request);const output=response.text();
  await vi.waitFor(()=>expect(native.calls).toHaveLength(2));
  await post('cancel',{...request.continuation,session:request.session});
  expect(await output).toContain('"outcome":"canceled"');
  const replay=await(await post('resume-stream',{...request.continuation,session:request.session,afterSequence:0})).text();
  expect(replay).toContain('"contextCompaction":"running"');expect(replay).toContain('"outcome":"canceled"');
  native.execute=async options=>{options.onEvent({type:'text_delta',delta:'Next answer'});return 'next-native';};
  await(await post('run-stream',{...request,prompt:'Next queued request',continuation:{id:'5'.repeat(32),token:'6'.repeat(64)}})).text();
  expect(native.calls).toHaveLength(3);expect(native.calls[2]!.resumeSessionId).toBeNull();
  expect(JSON.parse(native.calls[2]!.prompt)).toEqual({prompt:'Next queued request',history:request.history});
});
it.each([false,true])('resumes a compacted native session after accepted steering using its actual split transcript, but rejects changed history (boundaries %s)',async(boundaries)=>{
  const {request,post}=await setup();let finish=()=>{};
  native.execute=options=>new Promise<string>(resolve=>{
    if(boundaries)options.onEvent({type:'assistant_message_boundary',phase:'started',messageId:'native-reply'});
    options.onEvent({type:'text_delta',delta:'Before'});
    options.onEvent({type:'status',contextCompaction:'completed',label:'Working context compacted'});
    options.onSteerReady(async(messageId,prompt)=>({messageId,state:prompt==='Rejected'?'rejected':'accepted'}));
    finish=()=>{options.onEvent({type:'text_delta',delta:'After'});if(boundaries)options.onEvent({type:'assistant_message_boundary',phase:'completed',messageId:'native-reply'});resolve('compacted-native');};
  });
  const response=await post('run-stream',request);const output=response.text();
  await vi.waitFor(()=>expect(native.calls).toHaveLength(2));
  const steer={...request.continuation,session:request.session,messageId:'accepted-steer-001',prompt:'Preserve existing content'};
  expect(await(await post('steer',steer)).json()).toMatchObject({state:'accepted'});
  await post('steer',steer);
  expect(await(await post('steer',{...steer,messageId:'rejected-steer-002',prompt:'Rejected'})).json()).toMatchObject({state:'rejected'});
  finish();await output;
  const steeredHistory=boundaries
    ? [...request.history,{role:'user',content:request.prompt},{role:'assistant',content:'BeforeAfter'},{role:'user',content:steer.prompt}]
    : [...request.history,{role:'user',content:request.prompt},{role:'assistant',content:'Before'},{role:'user',content:steer.prompt},{role:'assistant',content:'After'}];
  native.execute=async options=>{options.onEvent({type:'text_delta',delta:'Follow-up answer'});return 'compacted-native';};
  const next={...request,history:steeredHistory,prompt:'Queued follow-up',continuation:{id:'5'.repeat(32),token:'6'.repeat(64)}};
  await(await post('run-stream',next)).text();
  expect(native.calls.at(-1)?.resumeSessionId).toBe('compacted-native');
  expect(JSON.parse(native.calls.at(-1)!.prompt).history).toEqual([]);
  await(await post('run-stream',{...next,history:[...steeredHistory,{role:'user',content:'Changed queued follow-up'},{role:'assistant',content:'Follow-up answer'}],continuation:{id:'7'.repeat(32),token:'8'.repeat(64)}})).text();
  expect(native.calls.at(-1)?.resumeSessionId).toBeNull();
});

it('bounds direct-site instructions to its generated workspace while preserving native continuity',async()=>{
  const {request,post}=await setup();
  const first=native.calls[0]!;
  expect(first.isolateProjectInstructions).toBe(true);
  expect(await fs.readFile(path.join(first.cwd,'AGENTS.md'),'utf8')).toContain('Pixflow Direct WordPress workspace');
  await(await post('run-stream',request)).text();
  expect(native.calls[1]!.isolateProjectInstructions).toBe(true);
  expect(native.calls[1]!.resumeSessionId).toBe('saved-native');
  expect(native.calls[1]!.cwd).toBe(first.cwd);
  expect(JSON.parse(native.calls[1]!.prompt).history).toEqual([]);
});
