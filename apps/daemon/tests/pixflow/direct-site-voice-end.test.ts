import { afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type { runCodexVoice } from '../../src/pixflow/codex-voice.js';

const voice = vi.hoisted(() => ({ options: null as Parameters<typeof runCodexVoice>[0] | null, finish: () => {} }));
vi.mock('../../src/pixflow/codex-voice.js', () => ({ runCodexVoice: (options: Parameters<typeof runCodexVoice>[0]) => {
  voice.options = options;
  return new Promise<void>(resolve => { voice.finish = resolve; options.signal.addEventListener('abort', resolve.bind(null, undefined), {once:true}); });
} }));
vi.mock('../../src/agents.js', () => ({ getAgentDef: () => ({id:'codex',streamFormat:'json-event-stream',eventParser:'codex'}), resolveAgentLaunch: () => ({launchPath:process.execPath}), applyAgentLaunchEnv: () => process.env, spawnEnvForAgent: () => process.env }));
vi.mock('../../src/app-config.js', () => ({readAppConfig:async()=>({}),agentCliEnvForAgent:()=>({})}));
import { registerDirectSiteRoutes } from '../../src/pixflow/direct-site-routes.js';
import { closeDatabase } from '../../src/db.js';
import { DirectSiteStore } from '../../src/pixflow/direct-site-store.js';

let server: Server | undefined;
let directory: string | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  voice.finish(); voice.options = null;
  if (server) await new Promise<void>(resolve => {server!.closeAllConnections();server!.close(()=>resolve());});
  closeDatabase();
  if (directory) await fs.rm(directory,{recursive:true,force:true});
});

it.each(['tool_use','text_delta'])('reports failed durable storage during %s without throwing or claiming completion', async type => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(),'pixflow-storage-failure-'));
  const app = express(); app.use(express.json());
  app.get('/session',(_req,res)=>res.json({features:{audio:true},identity:{siteId:'storage-site',userId:1,blogId:1},writable:true}));
  app.delete('/session',(_req,res)=>res.json({ok:true}));
  registerDirectSiteRoutes(app,directory,(_req,_res,next)=>next(),{helper:'',prompt:()=>'',skills:async()=>({}),attachments:async()=>[]});
  server = app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server!.once('listening',resolve));
  const address=server.address();if(!address||typeof address==='string')throw new Error('No port');
  const url=`http://127.0.0.1:${address.port}`;
  const session={endpoint:url+'/tools',token:'pfdirect_'+'a'.repeat(64),writable:true,expiresAt:Date.now()/1000+300};
  const continuation={id:'3'.repeat(32),token:'4'.repeat(64)};
  const response=await fetch(url+'/api/pixflow/direct-site/run-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agentId:'codex',conversationId:'storage-test',surface:'admin',prompt:'Voice conversation',history:[],voice:{sdp:'v=0\r\n'},continuation,session})});
  const output=response.text();
  await vi.waitFor(()=>expect(voice.options).not.toBeNull());
  vi.spyOn(DirectSiteStore.prototype,'appendMany').mockImplementation(()=>{throw new Error('SQLITE_FULL: private/path');});
  expect(()=>voice.options!.onEvent({type,delta:'Uncommitted output',name:'Read',id:'tool-one'})).not.toThrow();
  const text=await output;
  expect(text).toContain('"outcome":"interrupted"');
  expect(text).toContain('could not save');
  expect(text).not.toContain('private/path');
  expect(text).not.toContain('Uncommitted output');
  expect(text).not.toContain('"outcome":"completed"');
  expect(voice.options!.signal.aborted).toBe(true);
  const status=await fetch(url+'/api/pixflow/direct-site/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...continuation,session})});
  expect(await status.json()).toMatchObject({outcome:'interrupted',lastSequence:1});
  const resumed=await fetch(url+'/api/pixflow/direct-site/resume-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...continuation,session,afterSequence:1})});
  expect(await resumed.text()).toContain('could not save');
});

it('queues graceful end without revoking the active site credential or cancelling work', async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(),'pixflow-voice-end-'));
  let userId = 1;
  const revoke = vi.fn();
  const app = express(); app.use(express.json());
  app.get('/session',(_req,res)=>res.json({features:{audio:true},identity:{siteId:'voice-site',userId,blogId:1},writable:true}));
  app.delete('/session',(_req,res)=>{revoke();res.json({ok:true});});
  registerDirectSiteRoutes(app,directory,(_req,_res,next)=>next(),{helper:'',prompt:()=>'',skills:async()=>({}),attachments:async()=>[]});
  server = app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server!.once('listening',resolve));
  const address = server.address(); if (!address || typeof address==='string') throw new Error('No port');
  const url = `http://127.0.0.1:${address.port}`;
  const session = {endpoint:url+'/tools',token:'pfdirect_'+'a'.repeat(64),writable:true,expiresAt:Date.now()/1000+300};
  const continuation = {id:'1'.repeat(32),token:'2'.repeat(64)};
  const post = (action:string,body:unknown)=>fetch(url+'/api/pixflow/direct-site/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const response = await post('run-stream',{agentId:'codex',conversationId:'voice-test',surface:'admin',mode:'design',prompt:'Voice conversation',history:[],voice:{sdp:'v=0\r\n'},continuation,session});
  const output = response.text();
  await vi.waitFor(()=>expect(voice.options).not.toBeNull()).catch(async error => { throw new Error(`${error}\n${await output}`); });
  userId=2;
  expect((await post('voice-end',{...continuation,session})).status).toBe(404);
  userId=1;
  expect((await post('voice-end',{...continuation,session})).status).toBe(200);
  const end = vi.fn(); voice.options!.onEndReady!(end);
  expect(end).toHaveBeenCalledOnce();
  expect(voice.options!.signal.aborted).toBe(false);
  expect(revoke).not.toHaveBeenCalled();
  voice.options!.onEvent({type:'text_delta',delta:'Finished the requested edit.'});
  voice.finish();
  expect(await output).toContain('"outcome":"completed"');
  await vi.waitFor(()=>expect(revoke).toHaveBeenCalledOnce());
});


