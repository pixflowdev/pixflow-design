
import { watchExternalMcpAccess, authorizeExternalMcp, hasMcpMentions } from './external-mcp-authorization.js';
import { audioSession, authorizeAudio, watchAudioAccess } from './audio-authorization.js';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import fs from 'node:fs/promises';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { Express, RequestHandler, Response } from 'express';
import { createCommandInvocation, stopChildProcessTree } from '@open-design/platform';
import type { PixflowDirectSiteContinuationRequest, PixflowDirectSiteRunRequest, PixflowDirectSiteOutcome, PixflowDirectSiteTimings, PixflowDirectSiteVoiceSdpEvent } from '@open-design/contracts';
import { getAgentDef, resolveAgentLaunch, applyAgentLaunchEnv, spawnEnvForAgent } from '../agents.js';
import { preparePromptFileForAgent } from '../runtimes/prompt-file.js';
import { agentCliEnvForAgent, readAppConfig } from '../app-config.js';
import { openDatabase } from '../db.js';
import { createClaudeStreamHandler } from '../claude-stream.js';
import { createJsonEventStreamHandler } from '../json-event-stream.js';
import { isClaudeResumeFailure } from '../agent-session-resume.js';
import { emittedRenderableQuestionForm } from '../question-form-detect.js';
import { AGENT_VISUAL_CAPTURE_SOURCE } from './agent-visual-capture.js';
import { startBricksContextMirror } from './bricks-context-mirror.js';
import { DirectSiteStore, directDigest, type DirectRunRecord } from './direct-site-store.js';
import { authenticateDirectOwner, DirectSessionAuthorizationError, redactDirectEvent, revokeDirectSession } from './direct-site-session.js';
import { directOperationState } from './direct-site-operation-state.js';
import { runCodexTurn, type CodexSteer } from './codex-turn.js';
import { runOpenCodeTurn } from './opencode-turn.js';
import { isNativeSessionMissing } from './native-session-recovery.js';
import { directHistoryLineage as lineage, directTurnLineage, type AcceptedDirectSteering } from './direct-site-lineage.js';
import { runCodexVoice } from './codex-voice.js';
import { installedVoiceSample } from './voice-preview.js';
import { cachedVoiceSample } from './voice-preview-cache.js';
import { PIXFLOW_CODEX_VOICES } from '@open-design/contracts';
import { registerPixflowRuntimeWork } from './runtime-idle.js';
import { readDirectMcpConfiguration, configureDirectMcpProcess } from './direct-site-mcp.js';
import type { PixflowDirectToolHistoryRequest, PixflowDirectToolHistoryResponse } from '@open-design/contracts';

interface DirectResources {
  helper: string;
  prompt: (input: PixflowDirectSiteRunRequest, imagegen: boolean, siteStyles: boolean, resuming?: boolean, imageGenerationAllowed?: boolean, composioConfigured?: boolean) => string;
  skills: (input: PixflowDirectSiteRunRequest, signal: AbortSignal) => Promise<unknown>;
  attachments: (input: PixflowDirectSiteRunRequest, workspace: string, signal: AbortSignal) => Promise<Array<{name:string;path:string;kind:string}>>;
}
type LiveRun = { recordSteering?: (messageId: string, prompt: string, attachments: unknown, comments: unknown) => void; agentId: string; clients: Set<Response>; done: boolean; cancel: () => void; credentialHash: string; externalMcp?: boolean; legacyContinuation: boolean; storageFailure?: string; voice?: boolean; endVoiceRequested?: boolean; endVoice?: () => void; steer?: CodexSteer | undefined };
const storageFailureMessage = 'Bridge could not save this conversation. Work has stopped; changes already applied may remain. Free disk space or check storage access, then restart Bridge and inspect the site before continuing.';
const storageFailureEvents = () => [{type:'error',message:storageFailureMessage},{type:'done',ok:false,outcome:'interrupted',message:storageFailureMessage}];
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
const validToken = (token: unknown): token is string => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);

/** Durable records own output; in-memory state owns only the currently running process. */
export function registerDirectSiteRoutes(app: Express, dataDir: string, permission: RequestHandler, resources: DirectResources, database?: Database.Database): () => void {
  const store = new DirectSiteStore(database ?? openDatabase(dataDir,{dataDir}));
  const parent = path.join(dataDir,'direct-site-runs');
  const managedWorkspace = (workspace: string) => path.dirname(path.resolve(workspace)) === path.resolve(parent) && path.basename(workspace).startsWith('run-');
  const runs = new Map<string,LiveRun>();
  let preparing = 0;
  const unconfirmedCanvas = new Set<string>();
  registerPixflowRuntimeWork(app, () => preparing > 0 || unconfirmedCanvas.size > 0 || [...runs.values()].some(run => !run.done));
  app.options('/api/pixflow/direct-site/voice-preview',permission,(_req,res)=>{res.status(204).end();});
  app.post('/api/pixflow/direct-site/voice-preview',permission,async(req,res)=>{
    let session;
    try { session = audioSession(req); await authorizeAudio(session); }
    catch (error) { res.status(403).json({message:error instanceof Error ? error.message : 'Pro audio is unavailable.'}); return; }
    finally { if (session) await revokeDirectSession(session); }
    const voice = req.body?.voice;
    if (!(PIXFLOW_CODEX_VOICES as readonly unknown[]).includes(voice)) {res.status(400).json({message:'Select a supported voice.'});return;}
    const audio = await cachedVoiceSample(voice, dataDir) ?? await installedVoiceSample(voice);
    if (!audio) {res.status(404).json({message:'Voice previews are unavailable on this computer. Your selected voice can still be used for calls.'});return;}
    res.set('Cache-Control','no-store').json({audioBase64:audio.toString('base64'),mimeType:'audio/wav'});
  });
  for (const workspace of store.recoverInterrupted()) if (managedWorkspace(workspace)) void fs.rm(path.join(workspace,'site-connection.json'),{force:true}).catch(()=>undefined);
  // Only generated direct children of the managed root are eligible for cleanup.
  const pruneHistory = () => {
    for (const workspace of store.prune()) if (managedWorkspace(workspace)) void fs.rm(path.resolve(workspace),{recursive:true,force:true}).catch(()=>undefined);
  };
  pruneHistory();
  // Long-running Bridges need the same retention as a freshly started Bridge.
  const retentionTimer = setInterval(() => { try { pruneHistory(); } catch { /* Retry next hour if the store is temporarily unavailable. */ } }, 60 * 60_000);
  retentionTimer.unref();

  app.options('/api/pixflow/direct-site/history-clear',permission,(_req,res)=>{res.status(204).end();});
  app.post('/api/pixflow/direct-site/history-clear',permission,async(req,res)=>{
    const {session} = (req.body || {}) as PixflowDirectToolHistoryRequest;
    let authorized = false;
    try {
      const owner = await authenticateDirectOwner(session,true);
      authorized = true;
      const result: PixflowDirectToolHistoryResponse = {clearedEvents:store.clearToolHistory(owner),retentionDays:7};
      res.json(result);
    } catch {
      res.status(authorized ? 500 : 403).json({message:authorized ? 'Bridge could not clear tool history. Try again.' : 'Reconnect to WordPress before clearing Bridge tool history.'});
    } finally { if (authorized) await revokeDirectSession(session); }
  });

  function attach(id: string, res: Response, afterSequence = 0): void {
    res.status(200).set({'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Accel-Buffering':'no'});
    res.flushHeaders();
    for (const event of store.events(id,afterSequence)) res.write(JSON.stringify(event)+'\n');
    const run = runs.get(id);
    if(run?.storageFailure)res.write(storageFailureEvents().map(event=>JSON.stringify(event)+'\n').join(''));
    if (!run || run.done || store.get(id)?.outcome) res.end();
    else { run.clients.add(res); res.on('close',()=>run.clients.delete(res)); }
  }

  for (const action of ['resume-stream','cancel','status','voice-end','steer']) {
    const route = `/api/pixflow/direct-site/${action}`;
    app.options(route,permission,(_req,res)=>{res.status(204).end();});
    app.post(route,permission,async(req,res)=>{
      const input = req.body as PixflowDirectSiteContinuationRequest;
      const run = validId(input?.id) && validToken(input?.token) ? store.get(input.id) : null;
      if (!run || run.tokenHash !== directDigest(input.token)) {res.status(404).json({message:'This Direct run is not available.'});return;}
      let phase: 'authorization' | 'preparation' | 'delivery' = 'authorization';
      try {
        // Older clients can reattach a live stream with its tab-owned secret.
        // Durable recovery always requires current authenticated WordPress ownership.
        if (input.session) {
          const owner = await authenticateDirectOwner(input.session,true);
          if (owner !== run.owner) {res.status(404).json({message:'This Direct run is not available.'});return;}
        } else if (!runs.get(run.id)?.legacyContinuation) {
          res.status(401).json({code:'DIRECT_SESSION_REQUIRED',message:'Reconnect to WordPress to recover this conversation.'});return;
        }
        phase = 'preparation';
        if (action === 'steer') {
          const {messageId,prompt}=req.body;
          const live=runs.get(run.id);
          const steer = live?.steer;
          if(typeof messageId!=='string'||!/^[\w-]{8,128}$/.test(messageId)||typeof prompt!=='string'||!prompt.trim()||prompt.length>100_000){res.status(400).json({message:'A message and unique message ID are required.'});return;}
          const receipt = store.events(run.id, 0).find(event => event.type === 'steering_message' && event.id === messageId);
          if (receipt) { res.json({messageId,state:receipt.text===prompt?'accepted':'rejected',...(receipt.text!==prompt?{message:'This message identifier has already been used.'}:{})});return; }
          const terminal = store.get(run.id)?.outcome;
          if (terminal) { res.json({messageId,state:['completed','answered'].includes(terminal)?'queued':'rejected',message:['completed','answered'].includes(terminal)?undefined:'The run stopped before this guidance was sent. Keep it queued.'});return; }
          if(!live||!['codex','opencode'].includes(live.agentId)||!steer||live.done){res.status(409).json({message:'Steering is not available for this active run. Keep the message queued.'});return;}
          if (live.externalMcp || hasMcpMentions(req.body.context)) await authorizeExternalMcp(input.session!);
          const files=await resources.attachments({session:input.session!,agentId:live.agentId,prompt,history:[],attachments:req.body.attachments},run.workspace,new AbortController().signal);
          const guidance=prompt+(req.body.context?'\n\nAttached request context:\n'+JSON.stringify(req.body.context):'')+(files.length?'\n\nUser reference files in the current workspace:\n'+JSON.stringify(files):'');
          // Preparation awaits WordPress and reference I/O. The run may finish
          // meanwhile; never dereference a handler that its cleanup removed.
          const outcome = store.get(run.id)?.outcome;
          if (outcome) { res.json({messageId,state:['completed','answered'].includes(outcome)?'queued':'rejected',message:['completed','answered'].includes(outcome)?undefined:'The run stopped before this guidance was sent. Keep it queued.'});return; }
          phase = 'delivery';
          const delivery = await steer(messageId,guidance);
          if (delivery.state === 'accepted') live.recordSteering?.(messageId,prompt,req.body.attachments,req.body.context?.comments);
          res.json(delivery);
        } else if (action === 'voice-end') {
          const live = runs.get(run.id);
          if (!live?.voice && !run.outcome) {res.status(409).json({message:'This run is not a voice call.'});return;}
          if (live && !run.outcome) {live.endVoiceRequested=true;live.endVoice?.();}
          res.json({ending:true,outcome:run.outcome});
        } else if (action === 'cancel') {
          runs.get(run.id)?.cancel();
          res.json({canceled:!run.outcome,outcome:run.outcome});
        } else if (action === 'status') {
          res.json({id:run.id,conversationId:run.conversationId,taskId:run.taskId,attemptId:run.attemptId,surface:run.surface,outcome:runs.get(run.id)?.storageFailure?'interrupted':run.outcome,lastSequence:run.lastSequence,createdAt:run.createdAt,updatedAt:run.updatedAt});
        } else {
          const cursor = input.afterSequence ?? 0;
          if (!Number.isSafeInteger(cursor) || cursor<0 || cursor>run.lastSequence) {res.status(400).json({message:'Invalid Direct event cursor.'});return;}
          attach(run.id,res,cursor);
        }
      } catch (error) {
        if (error instanceof DirectSessionAuthorizationError) res.status(error.status).json({code:error.code,message:error.message,state:'rejected'});
        else if (phase === 'authorization') res.status(403).json({code:'DIRECT_SESSION_REJECTED',message:'WordPress did not authorize conversation recovery.',state:'rejected'});
        else res.status(503).json({code:phase==='delivery'?'DIRECT_DELIVERY_UNCONFIRMED':'DIRECT_PREPARATION_FAILED',state:phase==='delivery'?'unconfirmed':'rejected',message:phase==='delivery'?'Delivery could not be confirmed. Check the conversation before retrying.':'The request could not be prepared. Nothing was sent; keep your message queued and retry.'});
      }
      finally {
        // End voice retains the admitted run's credential until its work completes.
        if(input.session && !(['voice-end','steer'].includes(action) && runs.get(run.id)?.credentialHash===directDigest(input.session.token))) await revokeDirectSession(input.session);
      }
    });
  }

  app.options('/api/pixflow/direct-site/run-stream',permission,(_req,res)=>{res.status(204).end();});
  app.post('/api/pixflow/direct-site/run-stream',permission,async(req,res)=>{
    const submitted = performance.now();
    const timings: PixflowDirectSiteTimings = {totalMs:0};
    const elapsed = () => Math.round(performance.now()-submitted);
    preparing++;
    const input = (req.body ?? {}) as PixflowDirectSiteRunRequest;
    const preparation = new AbortController();
    let child: ReturnType<typeof spawn> | undefined;
    let stopMcpAccess: (() => void) | undefined;
    let stopAudioAccess: (() => void) | undefined;

    let canceled = false;
    let record: DirectRunRecord | undefined;
    let workspace: string | undefined;
    let stopMirror: (()=>Promise<void>) | undefined;
    let assistant = '';
    let capturedSessionId: string | null = null;
    let compatibility = '';
    let conversationKey = '';
    let ownsCredential = true;
    let observingExisting = false;
    const cancel = () => {
      if(canceled)return;
      canceled=true;preparation.abort();

      if(child)void stopChildProcessTree(child).catch(()=>child?.kill());
    };
    const disconnect = () => {if((input.voice && !runs.get(record?.id ?? '')?.endVoiceRequested) || !input.continuation)cancel();};
    res.on('close',disconnect);
    let eventBatch: Record<string,unknown>[]=[];
    let batchTimer: ReturnType<typeof setTimeout> | undefined;
    let storageFailed=false;
    // A failed durable write stops execution. Report it out of band without
    // inventing an event cursor or claiming that the terminal state was saved.
    const failStorage = () => {
      if(storageFailed)return;
      storageFailed=true;clearTimeout(batchTimer);batchTimer=undefined;eventBatch=[];
      cancel();
      const run=record?runs.get(record.id):undefined;
      if(run){run.storageFailure=storageFailureMessage;run.done=true;}
      const line=storageFailureEvents().map(event=>JSON.stringify(event)+'\n').join('');
      const clients=run?.clients.size?run.clients:new Set([res]);
      for(const client of clients)if(!client.destroyed){client.write(line);client.end();}
    };
    const flushEvents = () => {
      clearTimeout(batchTimer);batchTimer=undefined;
      if(storageFailed||!eventBatch.length)return;
      let delivered: Record<string,unknown>[];
      try {delivered=record ? store.appendMany(record.id,eventBatch) : eventBatch;}
      catch {failStorage();return;}
      eventBatch=[];
      const line=delivered.map(event=>JSON.stringify(event)+'\n').join('');
      if(record)for(const client of runs.get(record.id)?.clients ?? []) {if(!client.destroyed)client.write(line);}
      else if(!res.destroyed)res.write(line);
    };
    const send = (event: Record<string,unknown>) => {
      if(storageFailed)return;
      const clean=redactDirectEvent(event,[input.session?.token ?? '',input.continuation?.token ?? '']);
      eventBatch.push(clean);
      // Only presentation deltas may wait. Tool/terminal boundaries flush synchronously.
      if(!['text_delta','thinking_delta'].includes(String(event.type)) || eventBatch.length>=64)flushEvents();
      else batchTimer ??= setTimeout(flushEvents,16);
    };
    const finish = (outcome: PixflowDirectSiteOutcome, message?: string) => {
      if(storageFailed)return;
      if(record && store.get(record.id)?.outcome)return;
      send({type:'done',ok:['answered','completed','awaiting_input'].includes(outcome),outcome,timings:{...timings,totalMs:elapsed()},...(message?{message}:{})});
    };
    try {
      if (!input.prompt?.trim() || !Array.isArray(input.history)) throw new Error('A prompt and conversation history are required.');
      if (input.voice && (input.agentId !== 'codex' || typeof input.voice.sdp !== 'string' || input.voice.sdp.length > 100_000 || !/^v=0\r?\n/.test(input.voice.sdp))) throw new Error('Codex voice requires a valid browser audio offer.');
      if (input.voice?.name && !(PIXFLOW_CODEX_VOICES as readonly string[]).includes(input.voice.name)) throw new Error('Select a supported Codex voice.');
      if (input.conversationId && !/^[\w:.-]{1,191}$/.test(input.conversationId)) throw new Error('Invalid Direct conversation identity.');
      if (input.taskId && !/^[\w:.-]{1,191}$/.test(input.taskId)) throw new Error('Invalid Direct task identity.');
      let externalMcpAllowed = false;
      let imageGenerationAllowed = false;
      let composioConfigured = false;
      const owner = await authenticateDirectOwner(input.session,!!input.conversationId || !!input.session.identity,preparation.signal, integrations => {
        const context = input.context && typeof input.context === 'object' ? input.context as Record<string, unknown> : {};
        input.context = { ...context, bricksIntegrationActive: integrations.bricks };
        if (integrations.bricks === false) { delete input.canvasId; delete input.canvasPostId; }
      }, input.voice ? 'audio' : undefined, features => { composioConfigured = features.composio === true; externalMcpAllowed = features['external-mcp'] === true; imageGenerationAllowed = features['image-generation'] === true; });
      if (hasMcpMentions(input.context) && !externalMcpAllowed) throw new Error('External MCP requires Pixflow Design Pro. Remove the external-tool mention or reactivate Pro before sending.');
      timings.ownerReadyMs=elapsed();
      const id=input.continuation?.id ?? randomUUID().replaceAll('-','');
      const token=input.continuation?.token ?? randomUUID()+randomUUID();
      if(input.continuation && (!validId(id)||!validToken(token)))throw new Error('Invalid Direct run continuation.');
      const requestHash=directDigest({...input,continuation:undefined,session:{endpoint:input.session.endpoint,writable:input.session.writable,editorTarget:input.session.editorTarget}});
      const previous=store.get(id);
      if(previous) {
        if(previous.owner!==owner || previous.tokenHash!==directDigest(token) || previous.requestHash!==requestHash) {
          res.status(409).json({message:'This request identity belongs to different work.'});return;
        }
        // Repeated submission after a lost acknowledgement observes the admitted run.
        observingExisting=true;
        ownsCredential=runs.get(id)?.credentialHash!==directDigest(input.session.token);
        attach(id,res);return;
      }
      const conversationId=input.conversationId ?? id;
      const active=store.active(owner,conversationId);
      if(active) {res.status(409).json({code:'DIRECT_CONVERSATION_BUSY',message:'This conversation already has a running request. Reconnect to it.'});return;}
      const def=getAgentDef(input.agentId);
      if(!def)throw new Error('Select an installed CLI agent in Settings â†’ Execution.');
      if(!['claude-stream-json','json-event-stream','stream-json'].includes(def.streamFormat))throw new Error(`Direct mode does not yet support ${def.name}'s ${def.streamFormat} transport. Select Codex, Claude, or OpenCode.`);
      const config=await readAppConfig(dataDir);
      const externalMcp=await readDirectMcpConfiguration(dataDir,def.id,externalMcpAllowed);
      if (input.enhancedDesignGuidance !== undefined && typeof input.enhancedDesignGuidance !== 'boolean') throw new Error('Enhanced design guidance must be a boolean.');
      input.enhancedDesignGuidance ??= config.enhancedDesignGuidance !== false;
      const configuredEnv=agentCliEnvForAgent(config.agentCliEnv,def.id);
      const launch=resolveAgentLaunch(def,configuredEnv);
      if(!launch.launchPath)throw new Error(`${def.name} is not installed or cannot be found.`);
      conversationKey=directDigest([owner,conversationId,input.surface ?? 'bricks']);
      const previousConversation=store.conversation(conversationKey);
      compatibility=directDigest({agent:def.id,externalMcp,executable:launch.launchPath,model:input.model ?? 'default',mode:input.mode ?? (input.session.writable?'design':'ask'),writable:input.session.writable,canvasPostId:input.canvasPostId,
        // A page-pinned canvas is a replaceable transport, not conversation identity.
        // The real mailbox and renewed credentials are still refreshed for each turn.
        instructions:resources.prompt({...input,...(input.canvasId && input.canvasPostId ? {canvasId:'page-pinned-builder'} : {}),prompt:'',history:[],context:undefined},imageGenerationAllowed && config.codexImagegenOverride===true,config.bricksUseSiteStyles!==false,false,imageGenerationAllowed,composioConfigured)});
      const compatible=previousConversation?.compatibility===compatibility && previousConversation.lineage===lineage(input.history);
      let resumeSessionId=compatible && def.resumesSessionViaCli ? previousConversation.nativeSessionId : null;
      await fs.mkdir(parent,{recursive:true});
      workspace=compatible && previousConversation && managedWorkspace(previousConversation.workspace) ? previousConversation.workspace : await fs.mkdtemp(path.join(parent,'run-'));
      await fs.mkdir(workspace,{recursive:true});
      // Preparation can await I/O. Recheck admission immediately before the atomic insert.
      const admitted=store.get(id);
      if(admitted) {
        if(admitted.owner!==owner||admitted.tokenHash!==directDigest(token)||admitted.requestHash!==requestHash){res.status(409).json({message:'This request identity belongs to different work.'});return;}
        observingExisting=true;ownsCredential=runs.get(id)?.credentialHash!==directDigest(input.session.token);attach(id,res);return;
      }
      if(store.active(owner,conversationId)){res.status(409).json({code:'DIRECT_CONVERSATION_BUSY',message:'This conversation already has a running request. Reconnect to it.'});return;}
      record={id,owner,tokenHash:directDigest(token),requestHash,conversationId,taskId:input.taskId ?? id,attemptId:randomUUID(),surface:input.surface ?? 'bricks',workspace,outcome:null,lastSequence:0,createdAt:Date.now(),updatedAt:Date.now()};
      store.create(record);
      const recordedSteering = new Set<string>();
      const acceptedSteering: AcceptedDirectSteering[] = [];
      let activeAssistantMessage = false;
      const deferredSteering: AcceptedDirectSteering[] = [];
      runs.set(id,{recordSteering:(messageId,prompt,attachments,comments)=>{
        if(recordedSteering.has(messageId))return;
        recordedSteering.add(messageId);
        const accepted = {id:messageId,text:prompt,contentOffset:assistant.length};
        acceptedSteering.push(accepted);
        if (activeAssistantMessage) deferredSteering.push(accepted);
        send({type:'steering_message',id:messageId,text:prompt,contentOffset:assistant.length,createdAt:Date.now(),
          ...(Array.isArray(attachments)?{attachments}:{}),...(Array.isArray(comments)?{commentAttachments:comments}:{})});
      },agentId:def.id,clients:new Set(),done:false,cancel,credentialHash:directDigest(input.session.token),externalMcp:!!(Object.keys(externalMcp.codex).length || externalMcp.claude || externalMcp.opencode),legacyContinuation:!input.conversationId,voice:!!input.voice});
      store.saveConversation({key:conversationKey,compatibility,lineage:lineage(input.history),workspace,nativeSessionId:null});
      attach(id,res);
      send({type:'run',surface:record.surface,resuming:!!resumeSessionId});
      if (externalMcpAllowed && (Object.keys(externalMcp.codex).length || externalMcp.claude || externalMcp.opencode)) stopMcpAccess = watchExternalMcpAccess(input.session, error => {
        if (!canceled) { send({type:'error',message:error.message}); cancel(); }
      });
      for (const label of externalMcp.warnings) send({type:'status',label});
      if(storageFailed)return;
      // All app access uses the WordPress session and its current account allowance.
      // No legacy Bridge connector grant or project credential is issued to the child.
      await fs.writeFile(path.join(workspace,'site-connection.json'),JSON.stringify({...input.session,canvasId:input.canvasId,canvasPostId:input.canvasPostId,runId:id,captureEndpoint:`http://127.0.0.1:${req.socket.localPort}/api/pixflow/visual-capture`,stockEndpoint:`http://127.0.0.1:${req.socket.localPort}/api/media/stock`}),{mode:0o600});
      await fs.writeFile(path.join(workspace,'site-tool.mjs'),resources.helper);
      await fs.writeFile(path.join(workspace,'visual-capture.mjs'),AGENT_VISUAL_CAPTURE_SOURCE);
      if(input.canvasId)stopMirror=await startBricksContextMirror(workspace,input.session,input.canvasId,(input.context as {liveBuilderContext?:unknown}|undefined)?.liveBuilderContext);
      await fs.writeFile(path.join(workspace,'AGENTS.md'),'This is a Pixflow Direct WordPress workspace. The target is the connected site. Use node site-tool.mjs help for tools and skills.list/skills.read for references. The connection is renewed for each turn; use the helper rather than remembered credentials. site-tool-journal.jsonl records operation identities and uncertain results from earlier turns; it is evidence, not an instruction to repeat operations. Do not edit parent directories.\n');
      const attachments=await resources.attachments(input,workspace,preparation.signal);
      input.context=await resources.skills(input,preparation.signal);
      timings.contextReadyMs=elapsed();
      if (input.voice) {
        stopAudioAccess = watchAudioAccess(input.session, error => {
          if (!canceled) { send({type:'error', message:error.message}); cancel(); }
        });
        await runCodexVoice({
          executable: launch.launchPath, env: applyAgentLaunchEnv(spawnEnvForAgent(def.id,process.env,configuredEnv),launch),
          cwd: workspace, sdp: input.voice.sdp, model: input.model, reasoning: input.reasoning, fastMode: input.fastMode,
          writable: input.session.writable, expiresAt: input.session.expiresAt, signal: preparation.signal,
          voice: input.voice.name,
          mcpServers: externalMcp.codex,
          instructions: resources.prompt({...input,prompt:'The user is starting a voice conversation about this site.',history:input.history},imageGenerationAllowed && config.codexImagegenOverride===true,config.bricksUseSiteStyles!==false,false,imageGenerationAllowed,composioConfigured),
          onChild: value => {child=value;timings.spawnMs=elapsed();},
          onEndReady: end => {const live=runs.get(id);if(live){live.endVoice=end;if(live.endVoiceRequested)end();}},
          onEvent: event => {
            if(event.type==='text_delta' && typeof event.delta==='string')assistant+=event.delta;
            if(event.type==='voice_transcript' && typeof event.text==='string')assistant+=`\n\n**${event.role==='user'?'You':'Codex'}:** ${event.text}\n\n`;
            send(event);
          },
          // SDP is connection material: deliver once, never persist or replay it.
          onSdp: sdp => {if(!res.destroyed)res.write(JSON.stringify({type:'voice_sdp',sdp} satisfies PixflowDirectSiteVoiceSdpEvent)+'\n');},
        });
        finish(canceled?'canceled':'completed');
        return;
      }
      const images=attachments.filter(item=>item.kind==='image').map(item=>path.join(workspace!,item.path));
      const newSessionId=randomUUID();
      let fatalError=false;
      let turnSucceeded=false;
      let usedTools=false;
      let missingSession=false;
      for(let attempt=0;attempt<2;attempt++) {
        const prompt=resources.prompt({...input,history:resumeSessionId?[]:input.history},imageGenerationAllowed && config.codexImagegenOverride===true,config.bricksUseSiteStyles!==false,!!resumeSessionId,imageGenerationAllowed,composioConfigured)
          +(attachments.length?'\n\nUser reference files:\n'+JSON.stringify(attachments):'');
        // File-based CLIs need the complete composed request available until the child exits.
        // Each attempt owns its file so retries cannot read an earlier conversation seed.
        const promptFile=await preparePromptFileForAgent(def,prompt,id);
        try {
        const args=def.buildArgs(prompt,images,[],{model:input.model ?? null,reasoning:input.reasoning ?? null,fastMode:input.fastMode ?? null},{cwd:workspace,resumeSessionId,newSessionId,...(promptFile?{promptFilePath:promptFile.path}:{})});
        timings.promptBytes=Buffer.byteLength(prompt,'utf8');
        timings.nativeSessionReused=!!resumeSessionId;
        const env=applyAgentLaunchEnv(spawnEnvForAgent(def.id,process.env,configuredEnv),launch);
        await configureDirectMcpProcess(externalMcp,def.id,workspace,env,args);
        if(def.id==='claude'&&!args.includes('--permission-mode'))args.push('--permission-mode','bypassPermissions');
        if(def.id==='codex')args.push('-c','sandbox_workspace_write.network_access=true','-c','approval_policy="never"');
        if(def.id==='opencode') {const inherited=env.OPENCODE_CONFIG_CONTENT?JSON.parse(env.OPENCODE_CONFIG_CONTENT):{};env.OPENCODE_CONFIG_CONTENT=JSON.stringify({...inherited,permission:'allow'});args.push('--title','Pixflow Direct');}
        const invocation=createCommandInvocation({command:launch.launchPath,args,env});
        const onEvent=(event:Record<string,unknown>)=>{
          timings.firstProviderEventMs ??= elapsed();
          if(event.type==='text_delta') timings.firstTextMs ??= elapsed();
          if(typeof event.sessionId==='string' && /^[\w.-]{1,256}$/.test(event.sessionId))capturedSessionId=event.sessionId;
          if(event.type==='text_delta' && typeof event.delta==='string')assistant+=event.delta;
          if (event.type === 'assistant_message_boundary') {
            event = { ...event, contentOffset: assistant.length };
            activeAssistantMessage = event.phase === 'started';
            if (!activeAssistantMessage) for (const accepted of deferredSteering.splice(0)) accepted.contentOffset = assistant.length;
          }
          if(event.type==='tool_use')usedTools=true;
          if(event.type==='error')fatalError=true;
          send(event);
          const stopReason=event.stopReason ?? event.stop_reason;
          if(def.promptInputFormat==='stream-json' && event.type==='turn_end' && stopReason && stopReason!=='tool_use')child?.stdin?.end();
        };
        const parser=def.eventParser==='claude'||def.id==='claude'?createClaudeStreamHandler(onEvent):createJsonEventStreamHandler(def.eventParser||def.id,onEvent);
        const decoder=new StringDecoder('utf8');
        let buffer='';
        const accept=(line:string)=>{
          try {
            const raw=JSON.parse(line) as Record<string,unknown>;
            if(typeof raw.sessionID==='string' && /^[\w.-]{1,256}$/.test(raw.sessionID))capturedSessionId=raw.sessionID;
            const part=raw.part as {reason?:string}|undefined;
            if(raw.type==='turn.completed'||(raw.type==='result' && raw.is_error===false)||(raw.type==='step_finish'&&part?.reason==='stop')) {turnSucceeded=true;fatalError=false;}
            if(raw.type==='turn.failed'||raw.type==='error'||(raw.type==='result'&&raw.is_error===true))turnSucceeded=false;
            if(raw.type==='result' && def.promptInputFormat==='stream-json')child?.stdin?.end();
            const error=raw.error as {code?:string;name?:string}|undefined;
            if(['session_not_found','thread_not_found','SessionNotFoundError'].includes(String(error?.code??error?.name??'')))missingSession=true;
          }catch { /* Parser retains non-JSON diagnostics. */ }
          parser.feed(line+'\n');
        };
        if(canceled)break;
        let code: number|null=0;
        let stderr='';
        if(def.id==='codex'||def.id==='opencode') {
          try {
          capturedSessionId=await (def.id==='codex'?runCodexTurn:runOpenCodeTurn)({executable:launch.launchPath,env,cwd:workspace,prompt,images,
            mcpServers: externalMcp.codex,
            isolateProjectInstructions: true,
            model:input.model,reasoning:input.reasoning,fastMode:input.fastMode,resumeSessionId,signal:preparation.signal,
            onChild:value=>{child=value;timings.spawnMs=elapsed();},onEvent,
            onSteerReady:steer=>{const live=runs.get(id);if(live)live.steer=steer;},
          });
          turnSucceeded=true;
          } catch(error) {
            if(!resumeSessionId || !isNativeSessionMissing(error))throw error;
            missingSession=true;code=1;stderr=error.message;
          }
        } else {
        child=spawn(invocation.command,invocation.args,{cwd:workspace,env,shell:false,windowsHide:true,windowsVerbatimArguments:invocation.windowsVerbatimArguments,stdio:['pipe','pipe','pipe']});
        timings.spawnMs=elapsed();
        child.stdout?.on('data',(chunk:Buffer)=>{buffer+=decoder.write(chunk);const lines=buffer.split('\n');buffer=lines.pop()||'';lines.forEach(accept);});
        child.stderr?.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-4000);});
        child.stdin?.on('error',()=>undefined);
        const completed=new Promise<number|null>((resolve,reject)=>{child!.once('error',reject);child!.once('close',resolve);});
        if(def.promptViaStdin) {
          if(def.promptInputFormat==='stream-json')child.stdin?.write(JSON.stringify({type:'user',message:{role:'user',content:prompt}})+'\n');
          else child.stdin?.end(prompt);
        }else child.stdin?.end();
        code=await completed;
        buffer+=decoder.end();if(buffer)accept(buffer);parser.flush();
        }
        const sessionMissing=missingSession || (def.id==='claude'&&isClaudeResumeFailure(stderr));
        const journal=await fs.readFile(path.join(workspace,'site-tool-journal.jsonl'),'utf8').catch(()=>'');
        const dispatched=journal.split('\n').some(line=>{try{return JSON.parse(line).runId===id;}catch{return false;}});
        if(attempt===0 && resumeSessionId && sessionMissing && !usedTools && !dispatched && !assistant && !canceled) {
          resumeSessionId=null;capturedSessionId=null;fatalError=false;turnSucceeded=false;missingSession=false;
          send({type:'status',label:'The saved agent session is unavailable. Continuing from the visible conversation.'});store.nextAttempt(id);continue;
        }
        if(code!==0 && !canceled)throw new Error(stderr||`${def.name} exited with code ${code}.`);
        if(fatalError && !turnSucceeded && !canceled) {finish('failed','The agent reported an unrecovered runtime error.');break;}
        if(!canceled) {
          const operationState=directOperationState(journal,id);
          const outcome=emittedRenderableQuestionForm(assistant)?'awaiting_input':operationState ?? (input.session.writable?'completed':'answered');
          store.saveConversation({key:conversationKey,compatibility,lineage:directTurnLineage(input.history,input.prompt,assistant,acceptedSteering),workspace,nativeSessionId:capturedSessionId ?? (def.id==='claude'?newSessionId:null)});
          finish(outcome,operationState==='interrupted'?'A site operation has no confirmed result. Inspect its command result and current site state before continuing.':operationState==='failed'?'A site tool reported a rejection without a later successful retry of that tool. Review the retained output before continuing.':undefined);
        }
        break;
        } finally {
          await promptFile?.cleanup();
        }
      }
      if(canceled)finish('canceled','Stopped. Changes already applied are retained.');
    }catch(error) {
      if(!res.headersSent)res.status(canceled?200:400).set('Content-Type','application/x-ndjson');
      if(!canceled)send({type:'error',message:error instanceof Error?error.message:String(error)});
      finish(canceled?'canceled':'failed');
    }finally {

      stopAudioAccess?.();
      stopMcpAccess?.();
      try {
      if (workspace && record) {
        const journal = await fs.readFile(path.join(workspace, 'site-tool-journal.jsonl'), 'utf8').catch(() => '');
        if (directOperationState(journal, record.id) === 'interrupted') unconfirmedCanvas.add(record.id);
      }
      flushEvents();
      if(observingExisting){res.off('close',disconnect);if(ownsCredential)await revokeDirectSession(input.session);return;}
      await stopMirror?.().catch(()=>undefined);
      res.off('close',disconnect);
      if(workspace)await fs.rm(path.join(workspace,'site-connection.json'),{force:true});
      if(workspace)await fs.rm(path.join(workspace,'external-mcp.json'),{force:true});
      if(record) {
        if(!store.get(record.id)?.outcome)finish(canceled?'canceled':'interrupted');
        const run=runs.get(record.id);if(run){run.done=true;for(const client of run.clients)client.end();run.clients.clear();}
        setTimeout(()=>runs.delete(record!.id),3600_000).unref();
      }
      if(ownsCredential && input.session?.token)await revokeDirectSession(input.session);
      if(!res.destroyed)res.end();
      } finally { preparing--; }
    }
  });
  return () => clearInterval(retentionTimer);
}

