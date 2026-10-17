import { afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type { runCodexTurn } from '../../src/pixflow/codex-turn.js';

const voice = vi.hoisted(() => ({ options: null as Parameters<typeof runCodexTurn>[0] | null, finish: () => {} }));
vi.mock('../../src/pixflow/codex-turn.js', () => ({ runCodexTurn: (options: Parameters<typeof runCodexTurn>[0]) => {
  voice.options = options;
  options.onSteerReady(async (messageId, prompt) => ({messageId, state: prompt === 'Reject this' ? 'rejected' : 'accepted'}));
  return new Promise<string>(resolve => { voice.finish = () => { options.onSteerReady(undefined); resolve('thread-test'); }; options.signal.addEventListener('abort', resolve.bind(null, 'thread-test'), {once:true}); });
} }));
vi.mock('../../src/agents.js', () => ({ getAgentDef: () => ({id:'codex',streamFormat:'json-event-stream',eventParser:'codex',buildArgs:()=>[]}), resolveAgentLaunch: () => ({launchPath:process.execPath}), applyAgentLaunchEnv: () => process.env, spawnEnvForAgent: () => process.env }));
vi.mock('../../src/app-config.js', () => ({readAppConfig:async()=>({}),agentCliEnvForAgent:()=>({})}));
import { registerDirectSiteRoutes } from '../../src/pixflow/direct-site-routes.js';
import { closeDatabase } from '../../src/db.js';

let server: Server | undefined;
let directory: string | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  voice.finish(); voice.options = null;
  if (server) await new Promise<void>(resolve => {server!.closeAllConnections();server!.close(()=>resolve());});
  closeDatabase();
  if (directory) await fs.rm(directory,{recursive:true,force:true});
});

it('keeps steering queued when its run finishes while references are being prepared, without reporting an authorization failure', async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-steering-race-'));
  const app = express(); app.use(express.json());
  let authStatus = 200, authUser = 1;
  app.get('/session', (_req, res) => authStatus === 200
    ? res.json({ identity: { siteId: 'race-site', userId: authUser, blogId: 1 }, writable: true })
    : res.status(authStatus).json({ message: 'private-upstream-diagnostic' }));
  app.delete('/session', (_req, res) => res.json({ ok: true }));
  let finishDuringPreparation = false, preparationError = false;
  let output: Promise<string>;
  registerDirectSiteRoutes(app, directory, (_req, _res, next) => next(), {
    helper: '', prompt: () => '', skills: async () => ({}), attachments: async () => {
      if (preparationError) throw Error('private-reference-path');
      if (finishDuringPreparation) {
        voice.options!.onEvent({ type: 'text_delta', delta: 'A complete reply.' });
        voice.finish();
        // Let the real route complete its durable terminal state before returning references.
        await output;
      }
      return [];
    },
  });
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server!.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('No port');
  const url = `http://127.0.0.1:${address.port}`;
  const session = { endpoint: url + '/tools', token: 'pfdirect_' + 'a'.repeat(64), writable: true, expiresAt: 9999999999 };
  const continuation = { id: '5'.repeat(32), token: '6'.repeat(64) };
  const post = (action: string, body: unknown) => fetch(url + '/api/pixflow/direct-site/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const running = await post('run-stream', { agentId: 'codex', conversationId: 'race-test', surface: 'admin', prompt: 'Start', history: [], continuation, session });
  output = running.text();
  await vi.waitFor(() => expect(voice.options).not.toBeNull());
  preparationError = true;
  const failedPreparation = await post('steer', { ...continuation, session, messageId: 'prep-message-001', prompt: 'Additional guidance' });
  expect(failedPreparation.status).toBe(503);
  expect(await failedPreparation.json()).toMatchObject({ code: 'DIRECT_PREPARATION_FAILED', state: 'rejected' });
  preparationError = false;
  finishDuringPreparation = true;
  const result = await post('steer', { ...continuation, session, messageId: 'race-message-001', prompt: 'Additional guidance' });
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ state: 'queued' });
  const events = (await output).trim().split('\n').map(line => JSON.parse(line));
  expect(events.filter(event => event.type === 'steering_message')).toHaveLength(0);
  expect(events.find(event => event.type === 'done')).toMatchObject({ ok: true });
  authStatus = 503;
  const unavailable = await post('resume-stream', { ...continuation, session });
  expect(unavailable.status).toBe(503);
  expect(await unavailable.json()).toMatchObject({ code: 'DIRECT_AUTH_UNAVAILABLE', state: 'rejected' });
  authStatus = 403;
  const revoked = await post('resume-stream', { ...continuation, session });
  expect(revoked.status).toBe(403);
  expect(await revoked.text()).not.toContain('private-upstream-diagnostic');
  authStatus = 200; authUser = 2;
  expect((await post('resume-stream', { ...continuation, session })).status).toBe(404);
  authUser = 1;
  const recovered = await post('resume-stream', { ...continuation, session });
  expect(recovered.status).toBe(200);
  expect((await recovered.text()).match(/A complete reply\./g)).toHaveLength(1);
});

it.each([false, true])('persists accepted steering once, replays its position, and excludes rejected guidance (native boundaries %s)', async (boundaries) => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(),'pixflow-steering-transcript-'));
  const app = express(); app.use(express.json());
  app.get('/session',(_req,res)=>res.json({features:{},identity:{siteId:'steer-site',userId:1,blogId:1},writable:true}));
  app.delete('/session',(_req,res)=>res.json({ok:true}));
  registerDirectSiteRoutes(app,directory,(_req,_res,next)=>next(),{helper:'',prompt:()=>'',skills:async()=>({}),attachments:async()=>[]});
  server=app.listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server!.once('listening',resolve));
  const address=server.address();if(!address||typeof address==='string')throw new Error('No port');
  const url=`http://127.0.0.1:${address.port}`;
  const session={endpoint:url+'/tools',token:'pfdirect_'+'a'.repeat(64),writable:true,expiresAt:Date.now()/1000+300};
  const continuation={id:'7'.repeat(32),token:'8'.repeat(64)};
  const post=(action:string,body:unknown)=>fetch(url+'/api/pixflow/direct-site/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const response=await post('run-stream',{agentId:'codex',conversationId:'steer-test',surface:'admin',prompt:'Start',history:[],continuation,session});
  const output=response.text();
  await vi.waitFor(()=>expect(voice.options).not.toBeNull());
  if (boundaries) voice.options!.onEvent({type:'assistant_message_boundary',phase:'started',messageId:'reply-1'});
  voice.options!.onEvent({type:'text_delta',delta:'Before'});
  const request={...continuation,session,messageId:'steer-one-001',prompt:'Change this',attachments:[{name:'Brief',kind:'file',path:'brief.txt',projectId:'test'}]};
  expect(await(await post('steer',request)).json()).toMatchObject({state:'accepted'});
  await post('steer',request);
  expect(await(await post('steer',{...request,messageId:'steer-two-002',prompt:'Reject this',attachments:undefined})).json()).toMatchObject({state:'rejected'});
  voice.options!.onEvent({type:'text_delta',delta:'After'});
  if (boundaries) voice.options!.onEvent({type:'assistant_message_boundary',phase:'completed',messageId:'reply-1'});
  voice.finish();
  const events=(await output).trim().split('\n').map(line=>JSON.parse(line));
  const accepted=events.filter(event=>event.type==='steering_message');
  expect(accepted).toHaveLength(1);
  expect(accepted[0]).toMatchObject({id:request.messageId,text:'Change this',contentOffset:6,attachments:request.attachments});
  if (boundaries) expect(events.filter(event=>event.type==='assistant_message_boundary').map(event=>[event.phase,event.contentOffset])).toEqual([['started',0],['completed',11]]);
  const replay=await post('resume-stream',{...continuation,session,afterSequence:0});
  expect(await replay.text()).toContain('"type":"steering_message"');
  expect(await (await post('steer',request)).json()).toMatchObject({state:'accepted'});
  expect(await (await post('steer',{...request,prompt:'Different retry'})).json()).toMatchObject({state:'rejected'});
  expect(await (await post('steer',{...request,messageId:'new-after-finish'})).json()).toMatchObject({state:'queued'});
});
