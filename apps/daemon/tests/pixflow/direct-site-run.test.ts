import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const runner = vi.hoisted(() => ({ script: '', imageGeneration: false, imagePaths: [] as string[], contexts: [] as Record<string, unknown>[], prompts: [] as string[], writable: true, userId:1, siteId:'fixture-site', authorized:true, parser:'codex', streamInput:false, filePrompt:false, failArgs:false }));
vi.mock('../../src/agents.js', () => ({
  getAgentDef: () => ({ id: 'fixture-cli', name: 'Fixture CLI', streamFormat: runner.parser==='claude'?'claude-stream-json':'json-event-stream', eventParser: runner.parser, promptInputFormat:runner.streamInput?'stream-json':'text', promptViaStdin: !runner.filePrompt, promptViaFile: runner.filePrompt, resumesSessionViaCli: true, capturesSessionIdFromStream: true, buildArgs: (prompt: string, images: string[], _dirs: string[], _options: unknown, context: Record<string, unknown>) => {
    runner.imagePaths = images; runner.contexts.push(context); runner.prompts.push(prompt);
    if (runner.filePrompt) antigravityAgentDef.buildArgs(prompt, images, [], {}, context);
    if (runner.failArgs) throw new Error('Fixture argument failure');
    return ['--input-type=module', '-e', `const resumed=${JSON.stringify(context.resumeSessionId)};const promptFile=${JSON.stringify(context.promptFilePath)};`+runner.script];
  } }),
  resolveAgentLaunch: () => ({ launchPath: process.execPath, childPathPrepend: [] }),
  applyAgentLaunchEnv: (env: NodeJS.ProcessEnv) => env,
  spawnEnvForAgent: () => process.env,
}));
vi.mock('../../src/app-config.js', () => ({ readAppConfig: async () => ({}), agentCliEnvForAgent: () => ({ PIXFLOW_TEST_STALE_CREDENTIAL: 'must-stay-removed' }) }));
import { DIRECT_SITE_TOOL_SOURCE, directSitePrompt, directSkillContext, registerDirectSiteRunRoutes } from '../../src/pixflow/direct-site-run.js';

import { closeDatabase } from '../../src/db.js';
import { emittedRenderableQuestionForm } from '../../src/question-form-detect.js';
import { antigravityAgentDef } from '../../src/runtimes/defs/antigravity.js';
import { AGENT_VISUAL_CAPTURE_SOURCE } from '../../src/pixflow/agent-visual-capture.js';

const servers: Server[] = [];
const dirs: string[] = [];
async function listen(app: ReturnType<typeof express>) {
  app.get('/session', (_req, res) => res.status(runner.authorized?200:403).json({features:{'image-generation':runner.imageGeneration},identity:{siteId:runner.siteId,userId:runner.userId,blogId:1},writable:runner.writable}));
  const server = app.listen(0, '127.0.0.1'); servers.push(server);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  return `http://127.0.0.1:${address.port}`;
}
afterEach(async () => {
  runner.contexts = [];
  runner.prompts = [];
  runner.writable = true; runner.imageGeneration = false;
  runner.userId = 1; runner.siteId = 'fixture-site'; runner.authorized = true;
  runner.parser='codex';runner.streamInput=false;runner.filePrompt=false;runner.failArgs=false;
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); })));
  closeDatabase();
  await Promise.all(dirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

describe('direct site agent connection', () => {
  it('treats CLI help as discovery without executing the named operation', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-help-')); dirs.push(dir);
    const app = express(); app.use(express.json());
    const calls: unknown[] = [];
    app.post('/tools', (req, res) => { calls.push(req.body); res.json({ tools: [] }); });
    const url = await listen(app);
    await fs.writeFile(path.join(dir, 'site-tool.mjs'), DIRECT_SITE_TOOL_SOURCE);
    await fs.writeFile(path.join(dir, 'visual-capture.mjs'), 'export function captureAgentPage() {}');
    await fs.writeFile(path.join(dir, 'site-connection.json'), JSON.stringify({ endpoint: url + '/tools', token: 'fixture' }));
    for (const args of [['--help'], ['elementor.run', '--help'], ['bricks.run', '--help', '--code-file', 'absent.js']]) {
      await promisify(execFile)(process.execPath, ['site-tool.mjs', ...args], { cwd: dir });
    }
    expect(calls).toEqual([{ tool: 'help', arguments: {} }, { tool: 'help', arguments: { topic: 'elementor' } }, { tool: 'help', arguments: { topic: 'bricks' } }]);
  });
  it.each([false, true])('describes saved result envelopes without flattening data (wrapped=%s)', async wrapped => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-envelope-')); dirs.push(dir);
    const value = { inspection: { nodes: [] } };
    const result = wrapped ? { ok: true, result: { value } } : { ok: true, inspection: value.inspection };
    const app = express(); app.use(express.json()); app.post('/tools', (_req, res) => res.json(result));
    const url = await listen(app);
    await fs.writeFile(path.join(dir, 'site-tool.mjs'), DIRECT_SITE_TOOL_SOURCE);
    await fs.writeFile(path.join(dir, 'visual-capture.mjs'), 'export function captureAgentPage() {}');
    await fs.writeFile(path.join(dir, 'site-connection.json'), JSON.stringify({ endpoint: url + '/tools', token: 'fixture' }));
    const { stdout } = await promisify(execFile)(process.execPath, ['site-tool.mjs', 'bricks.read', '--output', 'result.json'], { cwd: dir });
    expect(JSON.parse(stdout)).toMatchObject({ keys: Object.keys(result), ...(wrapped ? { valuePath: 'result.value' } : {}) });
    if (!wrapped) expect(JSON.parse(stdout)).not.toHaveProperty('valuePath');
    expect(JSON.parse(await fs.readFile(path.join(dir, 'result.json'), 'utf8'))).toEqual(result);
  });
  it.each(['gutenberg', 'bricks', 'etch', 'elementor'])('provides file-based quoting guidance in %s', (editor) => {
    const prompt = directSitePrompt({ agentId: 'codex', prompt: 'Inspect this page', history: [], context: { editor }, session: { endpoint: 'http://127.0.0.1/tools', token: 'fixture', writable: true, expiresAt: 0 } });
    expect(prompt).toContain('Write multiline JSON or code using your file-editing tool');
    expect(prompt).toContain('Gutenberg native operations use argument files');
    expect(prompt).toContain('Local helper scripts that themselves use require belong in .cjs');
  });
  it('gives CLI agents a normal Pro availability result with the explanation link', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-pro-boundary-')); dirs.push(dir);
    const app = express(); app.use(express.json());
    const denial = { allowed: false, code: 'pro_required', message: 'Upgrade to Pixflow Design Pro.', learnMore: { label: 'Why is this blocked in Free? Learn more', url: 'https://pixflow.dev/free-pro#advanced-site-tools' } };
    app.post('/tools', (_req, res) => res.json(denial));
    const url = await listen(app);
    await fs.writeFile(path.join(dir, 'site-tool.mjs'), DIRECT_SITE_TOOL_SOURCE);
    await fs.writeFile(path.join(dir, 'visual-capture.mjs'), AGENT_VISUAL_CAPTURE_SOURCE);
    await fs.writeFile(path.join(dir, 'site-connection.json'), JSON.stringify({ endpoint: url + '/tools', token: 'pfdirect_' + 'a'.repeat(64) }));
    const result = await promisify(execFile)(process.execPath, ['site-tool.mjs', 'wordpress.run', '{}'], { cwd: dir });
    expect(JSON.parse(result.stdout)).toEqual(denial);
    expect(result.stderr).toBe('');
    const request = { agentId: 'codex', prompt: 'Help with my site', history: [], surface: 'admin', mode: 'design', conversationId: 'test', session: { endpoint: url + '/tools', token: 'pfdirect_' + 'a'.repeat(64), writable: true, expiresAt: Date.now() / 1000 + 300 } };
    const prompt = directSitePrompt(request);
    expect(prompt).toContain('treat it as a normal availability result');
    expect(prompt).toContain('learnMore label and URL as a Markdown link');
    expect(prompt).toContain('Never bypass an unavailable Pro tool');
  });
  async function fixture(writable=false) {
    runner.writable=writable;
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'direct-lifecycle-'));dirs.push(dir);
    const app=express();app.use(express.json());registerDirectSiteRunRoutes(app,dir,(_req,_res,next)=>next());
    const url=await listen(app);
    const request={agentId:'codex',conversationId:'owned-conversation',surface:'admin',mode:writable?'design':'ask',prompt:'First request',history:[] as Array<{role:string;content:string}>,
      continuation:{id:'1'.repeat(32),token:'2'.repeat(64)},session:{endpoint:url+'/tools',token:'pfdirect_'+'a'.repeat(64),writable,expiresAt:Date.now()/1000+300}};
    const post=(action:string,body:unknown)=>fetch(url+'/api/pixflow/direct-site/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return {dir,url,request,post,app};
  }
  const answerScript=`for await(const chunk of process.stdin) {}; console.log(JSON.stringify({type:'thread.started',thread_id:'saved-native'}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'First answer'}}));`;

  it('keeps Workspace voice on the live-handoff policy on fresh and resumed turns', async () => {
    const { request } = await fixture();
    const input = { ...request, session: { ...request.session, workspaceSource: { projectId: 'project', conversationId: 'chat', requestId: 'message' } } };
    for (const resuming of [false, true]) {
      const prompt = directSitePrompt(input, false, true, resuming);
      expect(prompt).toContain('Default page construction MUST happen visibly in the selected live editor');
      expect(prompt).toContain('builder.handoff');
      expect(prompt).not.toContain('BRICKS-CONTEXT.md is continuously compiled');
    }
    expect(directSitePrompt(request)).not.toContain('# Pixflow Workspace: live page building');
  });

  it.each([0, 1])('routes CLI connected apps through WordPress without a legacy grant, exit %s', async (exitCode) => {
    const {request,post,app}=await fixture();
    const calls: string[]=[];
    app.post('/tools',(req,res)=>{
      expect(req.headers.authorization).toBe('Bearer '+request.session.token);
      const {tool,arguments:args}=req.body;calls.push(tool);
      if(tool==='composio.apps')return res.json({accounts:[{id:'ca_github',name:'GitHub',toolkit:'github',enabled:true}]});
      expect(args.accountId).toBe('ca_github');
      if(tool==='composio.tools')return res.json({tools:[{name:'GITHUB_SEARCH',title:'Search repositories'}]});
      expect(tool).toBe('composio.execute');
      expect(args).toEqual({accountId:'ca_github',tool:'GITHUB_SEARCH',arguments:{query:'test'}});
      return res.json({output:{name:'Fixture repository'}});
    });
    runner.script=`import {execFileSync} from 'node:child_process';import fs from 'node:fs';for await(const chunk of process.stdin){};
      const connection=JSON.parse(fs.readFileSync('site-connection.json','utf8'));
      if(connection.connectorToken || connection.connectorEndpoint)throw new Error('Legacy grant exposed');
      const call=(tool,args={})=>execFileSync(process.execPath,['site-tool.mjs',tool,JSON.stringify(args)],{encoding:'utf8'});
      const result=call('composio.apps')+call('connectors.list')+call('connectors.tools',{connectorId:'github',query:'repositories'})+call('connectors.execute',{connectorId:'github',toolName:'GITHUB_SEARCH',input:{query:'test'}});
      console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:result}}));process.exit(${exitCode});`;
    const output=await(await post('run-stream',request)).text();
    expect(output).toContain('GitHub');expect(output).toContain('Fixture repository');
    expect(calls).toEqual(['composio.apps','composio.apps','composio.apps','composio.tools','composio.apps','composio.execute']);
    expect(output).not.toContain(request.session.token);
  });

  it('fails closed on revoked site app access without consulting legacy Bridge connections',async()=>{
    const {request,post,app}=await fixture();
    let calls=0;
    app.post('/tools',(_req,res)=>{calls++;res.status(403).json({message:'This saved connection requires Pro.'});});
    app.get('/api/tools/connectors/list',()=>{throw new Error('Legacy connector route used');});
    runner.script=`import {execFileSync} from 'node:child_process';for await(const chunk of process.stdin){};
      try{execFileSync(process.execPath,['site-tool.mjs','connectors.list'],{encoding:'utf8',stdio:'pipe'});throw new Error('Unexpected success');}
      catch(e){console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:String(e.stdout || e.stderr || e.message)}}));}`;
    const output=await(await post('run-stream',request)).text();
    expect(calls).toBe(1);expect(output).toContain('requires Pro');
  });
  it('requires current WordPress ownership for history cleanup and does not trust caller identity',async()=>{
    const {request,post}=await fixture();
    runner.authorized=false;
    expect((await post('history-clear',{session:request.session})).status).toBe(403);
    runner.authorized=true;
    const response=await post('history-clear',{session:request.session,owner:'another-site-user'});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({clearedEvents:0,retentionDays:7});
  });

  it.each([0, 3])('delivers the complete Antigravity file prompt and removes it after exit %s', async (exit) => {
    runner.filePrompt = true;
    runner.script = `import fs from 'node:fs';let stdin='';for await(const chunk of process.stdin)stdin+=chunk;const prompt=fs.readFileSync(promptFile,'utf8');console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({prompt,stdin})}}));process.exit(${exit});`;
    const {request,post}=await fixture();
    const output=await(await post('run-stream',{...request,agentId:'antigravity',prompt:'A complete request — café 日本語 '+ 'context '.repeat(5000)})).text();
    const events=output.trim().split('\n').map(line=>JSON.parse(line));
    const delivered=JSON.parse(events.filter(event=>event.type==='text_delta').map(event=>event.delta).join(''));
    expect(delivered).toEqual({prompt:runner.prompts[0],stdin:''});
    expect(output).toContain(exit === 0 ? '"outcome":"answered"' : '"outcome":"failed"');
    const file=String(runner.contexts[0]?.promptFilePath);
    expect(path.isAbsolute(file)).toBe(true);
    await expect.poll(()=>fs.access(path.dirname(file)).then(()=>true,()=>false)).toBe(false);
  });

  it('cleans the managed prompt file if constructing CLI arguments fails', async () => {
    runner.filePrompt=true;runner.failArgs=true;
    const {request,post}=await fixture();
    const output=await(await post('run-stream',{...request,agentId:'antigravity'})).text();
    expect(output).toContain('Fixture argument failure');
    const file=String(runner.contexts[0]?.promptFilePath);
    expect(path.isAbsolute(file)).toBe(true);
    await expect.poll(()=>fs.access(path.dirname(file)).then(()=>true,()=>false)).toBe(false);
  });

  it('keeps the prompt file available during a run and removes it after Stop', async () => {
    runner.filePrompt=true;
    runner.script=`for await(const chunk of process.stdin) {};console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Waiting'}}));setInterval(()=>{},1000);`;
    const {request,post}=await fixture();
    const response=await post('run-stream',{...request,agentId:'antigravity'});
    const output=response.text();
    await expect.poll(()=>runner.contexts.length).toBe(1);
    const file=String(runner.contexts[0]?.promptFilePath);
    expect(await fs.readFile(file,'utf8')).toBe(runner.prompts[0]);
    expect((await post('cancel',{...request.continuation,session:request.session})).status).toBe(200);
    expect(await output).toContain('"outcome":"canceled"');
    await expect.poll(()=>fs.access(path.dirname(file)).then(()=>true,()=>false)).toBe(false);
  });

  it('rejects steering for an unsupported active runtime without cancelling it', async () => {
    runner.script = `for await(const chunk of process.stdin) {}; console.log(JSON.stringify({type:'thread.started',thread_id:'active-non-codex'}));setTimeout(()=>console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Finished normally'}})),1200);`;
    const {request,post}=await fixture(false);
    const response=await post('run-stream',{...request,agentId:'antigravity'});
    const output=response.text();
    const rejected=await post('steer',{...request.continuation,session:request.session,messageId:'steer-test-001',prompt:'Change direction'});
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toMatchObject({message:expect.stringContaining('not available')});
    expect(await output).toContain('Finished normally');
  });

  it.each([false, true])('takes image generation access from the authenticated site (%s)', async allowed => {
    runner.imageGeneration = allowed;
    runner.script = answerScript;
    const {request, post} = await fixture(false);
    await (await post('run-stream', {...request, context:{imageGenerationAllowed:!allowed}})).text();
    expect(runner.prompts.at(-1)?.includes('Image generation and generated-image import are unavailable')).toBe(!allowed);
    expect(runner.prompts.at(-1)?.includes('Use the configured Pixflow media providers')).toBe(allowed);
  });

  it('enables design guidance for an unset preference and preserves explicit opt-out', async () => {
    runner.script=answerScript;
    const {request,post}=await fixture(false);
    Object.assign(request.session, {designGuidance:{revision:0,source:'existing',product:'',instructions:'',extension:{instructions:'OPTIONAL FOUNDATION',commands:{}}}});
    await(await post('run-stream',request)).text();
    expect(runner.prompts.at(-1)).toContain('OPTIONAL FOUNDATION');
    await(await post('run-stream',{...request,enhancedDesignGuidance:false,continuation:{id:'3'.repeat(32),token:'4'.repeat(64)}})).text();
    expect(runner.prompts.at(-1)).not.toContain('OPTIONAL FOUNDATION');
  });

  it('documents the optional JSON question format accepted by the panels', async () => {
    const {request}=await fixture(false);
    const prompt=directSitePrompt(request);
    expect(emittedRenderableQuestionForm(prompt)).toBe(true);
    expect(prompt).toContain('not a required planning or approval step');
  });

  it('treats saving as part of a normal live build without changing publication status', async () => {
    const {request}=await fixture(true);
    const prompt=directSitePrompt({...request,surface:'bricks',canvasId:'canvas',prompt:'Build a studio hero'});
    expect(prompt).not.toContain('save when requested');
    expect(prompt).toContain('A build or edit request includes saving the completed work');
    expect(prompt).toContain('preserve the page publication status');
  });

  it('keeps guidance in compatible follow-ups and removes it after disabling', async () => {
    const {post, request}=await fixture(); runner.script=answerScript;
    Object.assign(request.session, {designGuidance:{revision:0,source:'existing',product:'',instructions:'',extension:{instructions:'OPTIONAL FOUNDATION',commands:{}}}});
    await(await post('run-stream',{...request,enhancedDesignGuidance:true})).text();
    expect(runner.prompts[0]).toContain('OPTIONAL FOUNDATION');
    const followup={...request,prompt:'Follow up',history:[{role:'user',content:request.prompt},{role:'assistant',content:'First answer'}]};
    await(await post('run-stream',{...followup,enhancedDesignGuidance:true,continuation:{id:'3'.repeat(32),token:'4'.repeat(64)}})).text();
    expect(runner.contexts.at(-1)?.resumeSessionId).toBe('saved-native');
    await(await post('run-stream',{...followup,enhancedDesignGuidance:false,continuation:{id:'5'.repeat(32),token:'6'.repeat(64)}})).text();
    expect(runner.contexts.at(-1)?.resumeSessionId).toBeNull();
    expect(runner.prompts.at(-1)).not.toContain('OPTIONAL FOUNDATION');
    expect(runner.prompts.at(-1)).toContain('First answer');
  });

  it('retains native conversation continuity when the mailbox reconnects to the same page', async () => {
    const {post, request}=await fixture(); runner.script=answerScript;
    const first={...request,surface:'bricks',canvasId:'first-mailbox',canvasPostId:12};
    await(await post('run-stream',first)).text();
    const next={...first,canvasId:'replacement-mailbox',prompt:'Follow up',history:[{role:'user',content:'First request'},{role:'assistant',content:'First answer'}],continuation:{id:'3'.repeat(32),token:'4'.repeat(64)}};
    await(await post('run-stream',next)).text();
    expect(runner.contexts.at(-1)?.resumeSessionId).toBe('saved-native');
    const connection=JSON.parse(await fs.readFile(path.join(String(runner.contexts.at(-1)?.cwd),'site-connection.json'),'utf8').catch(()=> '{}'));
    // Finalization revokes credentials; refreshed prompts still name the actual mailbox.
    expect(connection.token).toBeUndefined();
    expect(runner.prompts.at(-1)).toContain('replacement-mailbox');
    await(await post('run-stream',{...next,canvasPostId:34,continuation:{id:'5'.repeat(32),token:'6'.repeat(64)}})).text();
    expect(runner.contexts.at(-1)?.resumeSessionId).toBeNull();
  });

  it.each(['claude','opencode'])('captures and resumes %s session handles using its actual stream parser',async(parser)=>{
    const {post,request}=await fixture();runner.parser=parser;
    const text='First answer';
    if(parser==='claude') {
      runner.streamInput=true;
      runner.script=`import readline from 'node:readline';const lines=readline.createInterface({input:process.stdin});for await(const line of lines){console.log(JSON.stringify({type:'system',subtype:'init',session_id:'provider-session'}));console.log(JSON.stringify({type:'assistant',message:{content:[{type:'text',text:'${text}'}],stop_reason:'end_turn'}}));console.log(JSON.stringify({type:'result',is_error:false,result:'${text}'}));break;}lines.close();`;
    } else runner.script=`for await(const chunk of process.stdin) {};console.log(JSON.stringify({type:'text',sessionID:'provider-session',part:{text:'${text}'}}));console.log(JSON.stringify({type:'step_finish',sessionID:'provider-session',part:{reason:'stop'}}));`;
    expect(await(await post('run-stream',request)).text()).toContain('"ok":true');
    expect(await(await post('run-stream',{...request,prompt:'Follow up',history:[{role:'user',content:request.prompt},{role:'assistant',content:text}],continuation:{id:'3'.repeat(32),token:'4'.repeat(64)}})).text()).toContain('"ok":true');
    expect(runner.contexts).toHaveLength(2);expect(runner.contexts[1]?.resumeSessionId).toBe('provider-session');
  });

  it('admits double submission and a lost acknowledgement once, including concurrent preparation',async()=>{
    const {post,request}=await fixture();runner.script=answerScript;
    const responses=await Promise.all([post('run-stream',request),post('run-stream',request)]);
    const outputs=await Promise.all(responses.map(response=>response.text()));
    expect(outputs.every(output=>output.includes('First answer'))).toBe(true);
    expect(runner.contexts).toHaveLength(1);
    expect(await (await post('run-stream',request)).text()).toContain('First answer');
    expect(runner.contexts).toHaveLength(1);
    expect((await post('run-stream',{...request,prompt:'Different work'})).status).toBe(409);
  });

  it('reauthorizes stored output against the current site and administrator, even on a live route instance',async()=>{
    const {post,request}=await fixture();runner.script=answerScript;await(await post('run-stream',request)).text();
    expect((await post('status',request.continuation)).status).toBe(401);
    const recovery={...request.continuation,session:{...request.session,token:'pfdirect_'+'b'.repeat(64)}};
    expect((await post('status',recovery)).status).toBe(200);
    runner.userId=2;expect((await post('resume-stream',recovery)).status).toBe(404);
    runner.userId=1;runner.siteId='different-site';expect((await post('resume-stream',recovery)).status).toBe(404);
    runner.siteId='fixture-site';runner.authorized=false;expect((await post('resume-stream',recovery)).status).toBe(403);
    runner.authorized=true;expect((await post('resume-stream',{...recovery,token:'9'.repeat(64)})).status).toBe(404);
    expect(runner.contexts).toHaveLength(1);
  });

  it.each(['model','permission','lineage','fork'])('starts fresh when %s compatibility changes',async(change)=>{
    const {post,request}=await fixture();runner.script=answerScript;await(await post('run-stream',request)).text();
    const history=[{role:'user',content:'First request'},{role:'assistant',content:'First answer'}];
    if(change==='permission')runner.writable=true;
    const follow={...request,prompt:'Follow up',history:change==='lineage'?[]:history,
      ...(change==='model'?{model:'another-model'}:{}),...(change==='fork'?{conversationId:'forked-conversation'}:{}),
      ...(change==='permission'?{mode:'design',session:{...request.session,writable:true}}:{}),continuation:{id:'3'.repeat(32),token:'4'.repeat(64)}};
    expect(await(await post('run-stream',follow)).text()).toContain('"ok":true');
    expect(runner.contexts.at(-1)?.resumeSessionId).toBeNull();
    expect(runner.contexts.at(-1)?.cwd).not.toBe(runner.contexts[0]?.cwd);
  });

  it('restarts an explicitly missing native session once with one transcript seed and a new attempt identity',async()=>{
    const {post,request}=await fixture();runner.script=answerScript;await(await post('run-stream',request)).text();
    runner.script=`for await(const chunk of process.stdin) {}; if(resumed){console.log(JSON.stringify({type:'error',message:'Missing session',error:{code:'thread_not_found'}}));process.exit(1);}console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Recovered answer'}}));`;
    const output=await(await post('run-stream',{...request,prompt:'Follow up',history:[{role:'user',content:'First request'},{role:'assistant',content:'First answer'}],continuation:{id:'3'.repeat(32),token:'4'.repeat(64)}})).text();
    expect(output).toContain('Recovered answer');expect(output).toContain('"ok":true');
    expect(runner.contexts).toHaveLength(3);expect(runner.contexts[1]?.resumeSessionId).toBe('saved-native');expect(runner.contexts[2]?.resumeSessionId).toBeNull();
    expect(runner.prompts[1]).not.toContain('user: First request');expect(runner.prompts[2]).toContain('user: First request');
    const events=output.trim().split('\n').map(line=>JSON.parse(line));
    expect(new Set(events.map(event=>event.attemptId)).size).toBe(2);
  });

  it('does not restart a missing session after a native operation was dispatched',async()=>{
    const {post,request}=await fixture();runner.script=answerScript;await(await post('run-stream',request)).text();
    runner.script=`import fs from 'node:fs';for await(const chunk of process.stdin) {};const connection=JSON.parse(fs.readFileSync('site-connection.json','utf8'));fs.appendFileSync('site-tool-journal.jsonl',JSON.stringify({runId:connection.runId,phase:'dispatched',commandId:'owned-command'})+String.fromCharCode(10));console.log(JSON.stringify({type:'error',message:'Missing session',error:{code:'thread_not_found'}}));process.exit(1);`;
    const output=await(await post('run-stream',{...request,prompt:'Follow up',history:[{role:'user',content:'First request'},{role:'assistant',content:'First answer'}],continuation:{id:'3'.repeat(32),token:'4'.repeat(64)}})).text();
    expect(output).toContain('"outcome":"failed"');expect(runner.contexts).toHaveLength(2);
    const journal=await fs.readFile(path.join(String(runner.contexts[1]?.cwd),'site-tool-journal.jsonl'),'utf8');
    expect(JSON.parse(journal.trim())).toMatchObject({runId:'3'.repeat(32),phase:'dispatched',commandId:'owned-command'});
  });

  it.each([
    {text:'A planning answer with no file.',error:false,exit:0,outcome:'answered'},
    {text:'<question-form>{"questions":[{"id":"choice","question":"Which style?"}]}</question-form>',error:false,exit:0,outcome:'awaiting_input'},
    {text:'Partial output.',error:true,exit:0,outcome:'failed'},
    {text:'Partial output.',error:false,exit:3,outcome:'failed'},
  ])('records $outcome from structured lifecycle evidence',async({text,error,exit,outcome})=>{
    const {post,request}=await fixture();
    runner.script=`for await(const chunk of process.stdin) {};console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:${JSON.stringify(text)}}}));${error?"console.log(JSON.stringify({type:'error',message:'Unrecovered failure'}));":''}process.exit(${exit});`;
    expect(await(await post('run-stream',request)).text()).toContain(`"outcome":"${outcome}"`);
  });

  it('retains completed events across a new route instance and replays only missing sequences', async () => {
    runner.writable = false;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-durable-')); dirs.push(dir);
    const app = express(); app.use(express.json());
    registerDirectSiteRunRoutes(app, dir, (_req, _res, next) => next());
    const url = await listen(app);
    const continuation = { id: 'd'.repeat(32), token: 'e'.repeat(64) };
    runner.script = `for await(const chunk of process.stdin) {}; console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Persisted answer'}}));`;
    const response = await fetch(url + '/api/pixflow/direct-site/run-stream', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      agentId:'codex',prompt:'Answer',history:[],continuation,
      session:{endpoint:url+'/tools',token:'pfdirect_'+'a'.repeat(64),writable:false,expiresAt:Date.now()/1000+300},
    })});
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    const answer = events.find(event => event.type === 'text_delta');
    const restarted = express(); restarted.use(express.json());
    registerDirectSiteRunRoutes(restarted, dir, (_req, _res, next) => next());
    const restartedUrl = await listen(restarted);
    const replay = await fetch(restartedUrl+'/api/pixflow/direct-site/resume-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...continuation,afterSequence:answer.sequence,session:{endpoint:url+'/tools',token:'pfdirect_'+'b'.repeat(64),writable:false}})});
    expect(replay.status).toBe(200);
    expect(await replay.text()).not.toContain('Persisted answer');
    expect(runner.contexts).toHaveLength(1);
  });

  it('continues the captured native session with a renewed connection and without seeding the transcript twice', async () => {
    runner.writable = false;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-native-')); dirs.push(dir);
    const app = express(); app.use(express.json());
    registerDirectSiteRunRoutes(app, dir, (_req, _res, next) => next());
    const url = await listen(app);
    const request = {agentId:'codex',conversationId:'conversation-one',surface:'admin',prompt:'First request',history:[] as Array<{role:string;content:string}>,
      session:{endpoint:url+'/tools',token:'pfdirect_'+'a'.repeat(64),writable:false,expiresAt:Date.now()/1000+300}};
    runner.script = `let prompt=''; for await(const chunk of process.stdin) prompt+=chunk; console.log(JSON.stringify({type:'thread.started',thread_id:'native-session-one'})); console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'First answer'}}));`;
    await (await fetch(url+'/api/pixflow/direct-site/run-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)})).text();
    runner.script = `let prompt=''; for await(const chunk of process.stdin) prompt+=chunk; if(prompt.includes('user: First request'))process.exit(3); console.log(JSON.stringify({type:'thread.started',thread_id:'native-session-one'})); console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Second answer'}}));`;
    const follow = await fetch(url+'/api/pixflow/direct-site/run-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...request,prompt:'Follow up',history:[{role:'user',content:'First request'},{role:'assistant',content:'First answer'}],session:{...request.session,token:'pfdirect_'+'b'.repeat(64)}})});
    expect(await follow.text()).toContain('"ok":true');
    expect(runner.contexts.at(-1)?.resumeSessionId).toBe('native-session-one');
    expect(runner.contexts[0]?.cwd).toBe(runner.contexts[1]?.cwd);
    expect(await fs.readFile(path.join(String(runner.contexts[1]?.cwd),'AGENTS.md'),'utf8')).not.toContain(request.session.token);
  });

  it('accepts structured successful completion after a recovered error while preserving the diagnostic event', async () => {
    runner.writable = false;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-outcome-')); dirs.push(dir);
    const app = express(); app.use(express.json()); registerDirectSiteRunRoutes(app, dir, (_req,_res,next)=>next());
    const url = await listen(app);
    runner.script = `for await(const chunk of process.stdin) {}; for(const event of [{type:'error',message:'Temporary tool failure'},{type:'item.completed',item:{type:'agent_message',text:'Repaired'}},{type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}])console.log(JSON.stringify(event));`;
    const response = await fetch(url+'/api/pixflow/direct-site/run-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agentId:'codex',prompt:'Answer',history:[],session:{endpoint:url+'/tools',token:'pfdirect_'+'a'.repeat(64),writable:false,expiresAt:0}})});
    const output = await response.text();
    expect(output).toContain('Temporary tool failure');
    expect(output).toContain('"ok":true');
    expect(output).toContain('"outcome":"answered"');
  });

  it.each([
    { name: 'pending native edit', entries: [{tool:'bricks.mutate',phase:'received',ok:true,pending:true,commandId:'cmd'}], outcome:'interrupted' },
    { name: 'unrecovered native rejection', entries: [{tool:'bricks.mutate',phase:'received',ok:false,pending:false}], outcome:'failed' },
    { name: 'acknowledged native edit', entries: [{tool:'bricks.mutate',phase:'received',ok:true,pending:true,commandId:'cmd'},{tool:'bricks.result',phase:'received',ok:true,pending:false,commandId:'cmd'}], outcome:'completed' },
    { name: 'repaired tool rejection', entries: [{tool:'bricks.mutate',phase:'received',ok:false},{tool:'bricks.mutate',phase:'received',ok:true,pending:false}], outcome:'completed' },
    { name: 'unrelated successful read after rejection', entries: [{tool:'bricks.mutate',phase:'received',ok:false},{tool:'bricks.canvases',phase:'received',ok:true}], outcome:'failed' },
    { name: 'lost site response', entries: [{tool:'bricks.mutate',phase:'dispatched',requestId:'req'},{tool:'bricks.mutate',phase:'uncertain',requestId:'req'}], outcome:'interrupted' },
    { name: 'inspection of an older expired command', entries: [{tool:'bricks.result',phase:'received',ok:false,pending:false,commandId:'older-command'}], outcome:'completed' },
    { name: 'repair after a rejected native acknowledgement', entries: [{tool:'bricks.mutate',phase:'received',ok:true,pending:true,commandId:'bad'},{tool:'bricks.result',phase:'received',ok:false,pending:false,commandId:'bad'},{tool:'bricks.mutate',phase:'received',ok:true,pending:true,commandId:'repair'},{tool:'bricks.result',phase:'received',ok:true,pending:false,commandId:'repair'}], outcome:'completed' },
  ])('does not let a successful agent exit hide $name', async ({entries,outcome}) => {
    const {post,request}=await fixture(true);
    runner.script=`import fs from 'node:fs';for await(const chunk of process.stdin) {};const connection=JSON.parse(fs.readFileSync('site-connection.json','utf8'));for(const entry of ${JSON.stringify(entries)})fs.appendFileSync('site-tool-journal.jsonl',JSON.stringify({...entry,runId:connection.runId})+String.fromCharCode(10));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Run ended.'}}));console.log(JSON.stringify({type:'turn.completed'}));`;
    expect(await(await post('run-stream',request)).text()).toContain(`"outcome":"${outcome}"`);
  });
  it('searches stock through the local media service without sending the site credential', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-stock-')); dirs.push(dir);
    const app = express(); app.use(express.json());
    const calls: unknown[] = [];
    app.post('/stock', (req, res) => { calls.push({ body: req.body, authorization: req.headers.authorization }); res.json({ ok: true, images: [{ id: 'photo' }] }); });
    const url = await listen(app);
    await fs.writeFile(path.join(dir, 'site-tool.mjs'), DIRECT_SITE_TOOL_SOURCE);
    await fs.writeFile(path.join(dir, 'visual-capture.mjs'), 'export function captureAgentPage() {}');
    await fs.writeFile(path.join(dir, 'site-connection.json'), JSON.stringify({ endpoint: url + '/tools', stockEndpoint: url + '/stock', token: 'site-private' }));
    const result = await promisify(execFile)(process.execPath, ['site-tool.mjs', 'media.stock.search', '--query', 'creative studio'], { cwd: dir });
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, images: [{ id: 'photo' }] });
    expect(calls).toEqual([{ body: { query: 'creative studio' }, authorization: undefined }]);
  });
  it('waits only for explicitly unaccepted busy commands, never resubmitting accepted work', async () => {
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'direct-busy-'));dirs.push(dir);
    const app=express();app.use(express.json());let submissions=0;let results=0;
    app.post('/tools',(req,res)=>{
      if(req.body.tool==='bricks.result'){results++;res.json({ok:true,result:'finished'});return;}
      submissions++;
      res.json(submissions<3 ? {ok:false,code:'canvas_busy',accepted:false,retryAfterMs:250} : {pending:true,commandId:'a'.repeat(32)});
    });
    const url=await listen(app);
    await fs.writeFile(path.join(dir,'site-tool.mjs'),DIRECT_SITE_TOOL_SOURCE);
    await fs.writeFile(path.join(dir,'visual-capture.mjs'),'export function captureAgentPage() {}');
    await fs.writeFile(path.join(dir,'site-connection.json'),JSON.stringify({endpoint:url+'/tools',token:'test-only'}));
    const result=await promisify(execFile)(process.execPath,['site-tool.mjs','bricks.mutate','{"operations":[]}'],{cwd:dir});
    expect(JSON.parse(result.stdout)).toEqual({ok:true,result:'finished'});
    expect(submissions).toBe(3);expect(results).toBe(1);
  });
  it.each(['bricks', 'etch', 'elementor', 'gutenberg'])('keeps generated %s CLI tools on the original tab through reconnect', async builder => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-origin-')); dirs.push(dir);
    const app = express(); app.use(express.json()); let submissions = 0, polls = 0;
    app.post('/tools', (req, res) => {
      if (req.body.tool === builder + '.result') { polls++; res.json({ ok: true }); return; }
      expect(req.body.arguments).toMatchObject({ canvasId: 'original', expectedPostId: 42 });
      if (builder === 'gutenberg') expect(req.body.arguments.expectedEntity).toEqual({type:'wp_block',id:'42'});
      res.json(++submissions === 1 ? { code: 'canvas_disconnected', accepted: false, retryAfterMs: 250 } : { pending: true, commandId: 'a'.repeat(32) });
    });
    const url = await listen(app);
    await fs.writeFile(path.join(dir, 'site-tool.mjs'), DIRECT_SITE_TOOL_SOURCE);
    await fs.writeFile(path.join(dir, 'visual-capture.mjs'), 'export function captureAgentPage() {}');
    await fs.writeFile(path.join(dir, 'site-connection.json'), JSON.stringify({ endpoint: url + '/tools', token: 'fixture', editorTarget: { builder, canvasId: 'original', postId: 42, ...(builder === 'gutenberg' ? {entity:{type:'wp_block',id:'42'}} : {}) } }));
    const result = await promisify(execFile)(process.execPath, ['site-tool.mjs', builder + '.save', '{}'], { cwd: dir });
    expect(JSON.parse(result.stdout)).toEqual({ ok: true });
    expect(submissions).toBe(2); expect(polls).toBe(1);
  });
  it('sends script files as source text without executing them locally or shell serialization', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-code-file-')); dirs.push(dir);
    const site = express(); site.use(express.json());
    const calls: unknown[] = [];
    site.post('/tools', (req, res) => { calls.push(req.body); res.json({ ok: true }); });
    const url = await listen(site);
    await fs.writeFile(path.join(dir, 'site-tool.mjs'), DIRECT_SITE_TOOL_SOURCE);
    await fs.writeFile(path.join(dir, 'visual-capture.mjs'), 'export function captureAgentPage() {}');
    await fs.writeFile(path.join(dir, 'site-connection.json'), JSON.stringify({ endpoint: url + '/tools', token: 'fixture', canvasId: 'canvas', canvasPostId: 12 }));
    const code = 'await builder.step("Créative", () => builder.refresh()); return `Text ${1}`;';
    await fs.writeFile(path.join(dir, 'build.js'), '\ufeff' + code, 'utf16le');
    const run = promisify(execFile);
    await run(process.execPath, ['site-tool.mjs', 'bricks.run', '--code-file', 'build.js', '--output', 'result.json'], { cwd: dir });
    expect(calls).toEqual([{ tool: 'bricks.run', arguments: { code, canvasId: 'canvas', expectedPostId: 12 } }]);
    for (const flags of [['--code-file'], ['--code-file', '--output', 'result.json'], ['--code-file', 'missing.js']]) {
      await expect(run(process.execPath, ['site-tool.mjs', 'bricks.run', ...flags], { cwd: dir })).rejects.toMatchObject({ code: 1 });
    }
    expect(calls).toHaveLength(1);
    await run(process.execPath, ['site-tool.mjs', 'help', '--topic', 'bricks'], { cwd: dir });
    await run(process.execPath, ['site-tool.mjs', 'bricks.run', '--code-file', 'build.js', '--response', 'value'], { cwd: dir });
    expect(calls.slice(1)).toEqual([
      { tool: 'help', arguments: { topic: 'bricks' } },
      { tool: 'bricks.run', arguments: { code, response: 'value', canvasId: 'canvas', expectedPostId: 12 } },
    ]);
    await expect(run(process.execPath, ['site-tool.mjs', 'help', '--topic'], { cwd: dir })).rejects.toMatchObject({ code: 1 });
    expect(calls).toHaveLength(3);
    await run(process.execPath, ['site-tool.mjs', 'bricks.run', '{"response":"value"}', '--code-file', 'build.js', '--response', 'value'], { cwd: dir });
    expect(calls).toHaveLength(4);
    await expect(run(process.execPath, ['site-tool.mjs', 'bricks.run', '{"response":"full"}', '--code-file', 'build.js', '--response', 'value'], { cwd: dir })).rejects.toMatchObject({ code: 1 });
    expect(calls).toHaveLength(4);
    await run(process.execPath, ['site-tool.mjs', 'bricks.run', '--code', 'return 42;', '--response', 'value'], { cwd: dir });
    expect(calls.at(-1)).toEqual({ tool: 'bricks.run', arguments: { code: 'return 42;', response: 'value', canvasId: 'canvas', expectedPostId: 12 } });
    await expect(run(process.execPath, ['site-tool.mjs', 'bricks.run', '--code', 'return 42;', '--code-file', 'build.js'], { cwd: dir })).rejects.toMatchObject({ code: 1 });
    expect(calls).toHaveLength(5);
    await fs.writeFile(path.join(dir, 'etch-target.json'), JSON.stringify({ canvasId: 'etch-canvas', expectedPostId: 34 }));
    await run(process.execPath, ['site-tool.mjs', 'etch.run', '@etch-target.json', '--code-file', 'build.js'], { cwd: dir });
    expect(calls.at(-1)).toEqual({ tool: 'etch.run', arguments: { code, canvasId: 'etch-canvas', expectedPostId: 34 } });
    await fs.writeFile(path.join(dir, 'elementor-target.json'), JSON.stringify({ canvasId: 'elementor-canvas', expectedPostId: 56 }));
    await run(process.execPath, ['site-tool.mjs', 'elementor.run', '@elementor-target.json', '--code-file', 'build.js'], { cwd: dir });
    expect(calls.at(-1)).toEqual({ tool: 'elementor.run', arguments: { code, canvasId: 'elementor-canvas', expectedPostId: 56 } });
  });
  it('preserves skill path flags and reports unsupported flags before sending a request', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-skill-flags-')); dirs.push(dir);
    const site = express(); site.use(express.json());
    const calls: unknown[] = [];
    site.post('/tools', (req, res) => { calls.push(req.body); res.json({ ok: true }); });
    const url = await listen(site);
    await fs.writeFile(path.join(dir, 'site-tool.mjs'), DIRECT_SITE_TOOL_SOURCE);
    await fs.writeFile(path.join(dir, 'visual-capture.mjs'), 'export function captureAgentPage() {}');
    await fs.writeFile(path.join(dir, 'site-connection.json'), JSON.stringify({ endpoint: url + '/tools', token: 'fixture' }));
    const run = promisify(execFile);
    await run(process.execPath, ['site-tool.mjs', 'skills.read', '--paths', 'bricks/operations/live-builder.md', 'bricks/workflows/enhanced-design.md', '--output', 'refs.json'], { cwd: dir });
    expect(calls).toEqual([{ tool: 'skills.read', arguments: { paths: ['bricks/operations/live-builder.md', 'bricks/workflows/enhanced-design.md'] } }]);
    await run(process.execPath, ['site-tool.mjs', 'skills.read', '--path', 'bricks/index.md'], { cwd: dir });
    expect(calls.at(-1)).toEqual({ tool: 'skills.read', arguments: { path: 'bricks/index.md' } });
    for (const flags of [['--paths'], ['--paths', '--output', 'refs.json'], ['--unknown', 'value']]) {
      await expect(run(process.execPath, ['site-tool.mjs', 'skills.read', ...flags], { cwd: dir })).rejects.toMatchObject({ code: 1 });
    }
    expect(calls).toHaveLength(2);
    await expect(run(process.execPath, ['site-tool.mjs', 'batch', '{calls:[]}'], { cwd: dir })).rejects.toMatchObject({stdout:expect.stringContaining('No site operation was dispatched')});
    expect(calls).toHaveLength(2);
  });
  it('reports invalid argument-file encoding without sending replacement characters to WordPress', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-encoding-')); dirs.push(dir);
    const site = express(); site.use(express.json());
    const calls: unknown[] = [];
    site.post('/tools', (req, res) => { calls.push(req.body); res.json({ ok: true }); });
    const url = await listen(site);
    await fs.writeFile(path.join(dir, 'site-tool.mjs'), DIRECT_SITE_TOOL_SOURCE);
    await fs.writeFile(path.join(dir, 'visual-capture.mjs'), 'export function captureAgentPage() {}');
    await fs.writeFile(path.join(dir, 'site-connection.json'), JSON.stringify({ endpoint: url + '/tools', token: 'fixture' }));
    await fs.writeFile(path.join(dir, 'args.json'), Buffer.concat([Buffer.from('{"title":"Orbit '), Buffer.from([0x97]), Buffer.from(' Studio"}')]));
    const run = promisify(execFile);
    await expect(run(process.execPath, ['site-tool.mjs', 'wordpress.run', '@args.json'], { cwd: dir }))
      .rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('UTF-8') });
    expect(calls).toEqual([]);
    await fs.writeFile(path.join(dir, 'args.json'), JSON.stringify({ title: 'Orbit — Studio' }), 'utf8');
    await run(process.execPath, ['site-tool.mjs', 'wordpress.run', '@args.json'], { cwd: dir });
    expect(calls).toEqual([{ tool: 'wordpress.run', arguments: { title: 'Orbit — Studio' } }]);
  });
  it('executes batch reads and writes UTF-8 directly from a PowerShell UTF-16 argument file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-helper-')); dirs.push(dir);
    const site = express(); site.use(express.json());
    const calls: string[] = [];
    site.post('/tools', (req, res) => { calls.push(req.body.tool); res.json({ text: 'Créative — studio', tool: req.body.tool }); });
    const url = await listen(site);
    await fs.writeFile(path.join(dir, 'site-tool.mjs'), DIRECT_SITE_TOOL_SOURCE);
    await fs.writeFile(path.join(dir, 'visual-capture.mjs'), 'export function captureAgentPage() {}');
    await fs.writeFile(path.join(dir, 'site-connection.json'), JSON.stringify({ endpoint: url + '/tools', token: 'fixture' }));
    await fs.writeFile(path.join(dir, 'args.json'), '\ufeff' + JSON.stringify({ calls: [{ tool: 'skills.read' }, { tool: 'abilities.list' }] }), 'utf16le');
    const run = promisify(execFile);
    const { stdout } = await run(process.execPath, ['site-tool.mjs', 'batch', '@args.json', '--output', 'result.json'], { cwd: dir });
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, output: 'result.json' });
    const result = JSON.parse(await fs.readFile(path.join(dir, 'result.json'), 'utf8'));
    expect(result.results.map((item: { result: { text: string } }) => item.result.text)).toEqual(['Créative — studio', 'Créative — studio']);
    expect(calls).toEqual(['skills.read', 'abilities.list']);
    await expect(run(process.execPath, ['site-tool.mjs', 'batch', '@args.json', '--output'], { cwd: dir })).rejects.toMatchObject({ code: 1 });
    expect(calls).toHaveLength(2);
  });
  it('resolves mention file hints without restricting other skills or making discovery a prerequisite', async () => {
    const site = express(); site.use(express.json());
    site.post('/tools', (req,res) => { expect(req.body).toEqual({tool:'skills.list',arguments:{ids:['query-loops']}});res.json({mentions:[{id:'query-loops',paths:['bricks/elements/leaves/query-loop.md']}]}); });
    const url = await listen(site);
    const input = {agentId:'codex',prompt:'Build and research',history:[],context:{selectedSkills:['query-loops']},session:{endpoint:url+'/tools',token:'pfdirect_'+'a'.repeat(64),writable:true,expiresAt:0}};
    const context = await directSkillContext(input,new AbortController().signal);
    const prompt = directSitePrompt({...input,context});
    expect(prompt).toContain('bricks/elements/leaves/query-loop.md');
    expect(prompt).toContain('You may use other skills and online research whenever useful');
    expect(await directSkillContext({...input,session:{...input.session,endpoint:url+'/missing'}},new AbortController().signal)).toEqual(input.context);
  });
  it('replays a continued run after its browser reloads without spawning it again', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-reload-')); dirs.push(dir);
    const app = express(); app.use(express.json());
    registerDirectSiteRunRoutes(app, dir, (_req, _res, next) => next());
    const url = await listen(app);
    const continuation = { id: 'a'.repeat(32), token: 'b'.repeat(64) };
    runner.script = `for await(const chunk of process.stdin) {};
      console.log(JSON.stringify({type:'item.completed',item:{id:'first',type:'agent_message',text:'Before reload.'}}));
      await new Promise(r=>setTimeout(r,500));
      console.log(JSON.stringify({type:'item.completed',item:{id:'last',type:'agent_message',text:'After reload.'}}));`;
    const response = await fetch(url + '/api/pixflow/direct-site/run-stream', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({
      agentId:'codex',prompt:'Continue through a reload',history:[],continuation,
      session:{endpoint:url+'/tools',token:'pfdirect_'+'a'.repeat(64),writable:true,expiresAt:Date.now()/1000+300},
    }) });
    const reader = response.body!.getReader(); await reader.read(); await reader.cancel();
    const resumed = await fetch(url + '/api/pixflow/direct-site/resume-stream', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(continuation)});
    expect(resumed.status).toBe(200);
    const output = await resumed.text();
    expect(output).toContain('Before reload.'); expect(output).toContain('After reload.');
    expect(output.match(/After reload\./g)).toHaveLength(1);
    expect(await fs.readdir(path.join(dir,'direct-site-runs'))).toHaveLength(1);
    const denied = await fetch(url + '/api/pixflow/direct-site/resume-stream', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...continuation,token:'c'.repeat(64)})});
    expect(denied.status).toBe(404);
  });

  it('captures pages through the local screenshot service without sending the site credential', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-capture-test-')); dirs.push(dir);
    const app = express(); app.use(express.json());
    const calls: unknown[] = [];
    app.post('/api/pixflow/visual-capture', (req, res) => {
      expect(req.headers.authorization).toBeUndefined(); calls.push(req.body);
      res.json({ ok: true, browser: 'fixture', errors: [], captures: [{ viewport: 'mobile', width: 390, height: 844, mimeType: 'image/png', base64: 'iVBORw==', sha256: 'fixture',
        layout: { typography: { rootFontSize: '16px', samples: [{ selector: 'p', text: 'Visible copy', fontSize: '16px', fontFamily: 'Arial', lineHeight: '24px' }] } } }] });
    });
    registerDirectSiteRunRoutes(app, dir, (_req, _res, next) => next());
    const url = await listen(app);
    runner.script = `import fs from 'node:fs/promises'; import {execFileSync,spawnSync} from 'node:child_process';
      for await (const chunk of process.stdin) {}
      await fs.writeFile('capture.json',String.fromCharCode(0xfeff)+JSON.stringify({url:'https://example.test',viewports:[{id:'mobile',width:390,height:844}]}));
      const result=JSON.parse(execFileSync(process.execPath,['site-tool.mjs','browser.capture','@capture.json'],{encoding:'utf8'}));
      if(result.captures[0].base64 || (await fs.readFile(result.captures[0].path)).toString('hex')!=='89504e47') process.exit(2);
      if(result.captures[0].typography.styles[0].examples[0].text!=='Visible copy') process.exit(3);
      const invalid=spawnSync(process.execPath,['site-tool.mjs','help','{bad'],{encoding:'utf8'});
      if(invalid.status!==1 || JSON.parse(invalid.stdout).ok!==false || invalid.stderr) process.exit(3);`;
    const response = await fetch(url + '/api/pixflow/direct-site/run-stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId: 'codex', prompt: 'Inspect the page', history: [], session: { endpoint: url + '/unused', token: 'pfdirect_' + 'a'.repeat(64), writable: true, expiresAt: 0 } }) });
    expect(await response.text()).toContain('"ok":true');
    expect(calls).toEqual([{url:'https://example.test',viewports:[{id:'mobile',width:390,height:844}]}]);
  });
  it('does not advertise image generation in Free, including resumed turns and saved override preferences', () => {
    const input = { agentId: 'codex', prompt: 'Build a section', history: [], session: { endpoint: 'https://example.test', token: 'test', expiresAt: 9999999999, writable: true } };
    for (const resumed of [false, true]) {
      const prompt = directSitePrompt(input, true, true, resumed, false);
      expect(prompt).toContain('Image generation and generated-image import are unavailable');
      expect(prompt).not.toContain('Image generation preference:');
      expect(prompt).not.toContain('Use the configured Pixflow media providers');
    }
    expect(directSitePrompt(input, true, true, false, true)).toContain('Image generation preference:');
  });
  it('keeps classes in both styling modes and applies explicit choices over saved defaults', () => {
    const input = { agentId: 'codex', canvasId: 'canvas', prompt: 'Build a section', history: [], session: { endpoint: 'https://example.test', token: 'test', expiresAt: 9999999999, writable: true } };
    expect(directSitePrompt(input)).toContain('Design styling: Use site styles');
    const resumed=directSitePrompt({...input,canvasId:'renewed-canvas',context:{revision:'new-revision'}},false,true,true);
    expect(resumed).not.toContain('The tool catalogue');
    expect(resumed).toContain('renewed-canvas');
    expect(resumed).toContain('new-revision');
    expect(resumed).toContain('Build a section');
    expect(resumed.length).toBeLessThan(directSitePrompt(input).length/2);
    expect(directSitePrompt(input, false, false)).toContain('Design styling: Custom styling');
    const custom = directSitePrompt({ ...input, bricksUseSiteStyles: false });
    expect(custom).toContain('native Bricks global classes');
    expect(custom).toContain('not element IDs');
    expect(custom).toContain('Design styling: Custom styling');
    expect(directSitePrompt({ ...input, bricksUseSiteStyles: true }, false, false)).toContain('Design styling: Use site styles');
  });
  it('binds the CLI helper to its canvas and waits for acknowledgment without replaying edits', async () => {
    const calls: Array<{ tool: string; arguments: Record<string, unknown> }> = [];
    const site = express(); site.use(express.json());
    site.post('/tools', (req, res) => {
      calls.push(req.body);
      res.json(req.body.tool === 'bricks.mutate' ? { pending: true, commandId: 'cmd' } : { ok: true, result: { revision: 'live:2', saved: false } });
    });
    const siteUrl = await listen(site);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-canvas-test-')); dirs.push(dir);
    const app = express(); app.use(express.json());
    registerDirectSiteRunRoutes(app, dir, (_req, _res, next) => next());
    const url = await listen(app);
    runner.script = `import {execFileSync} from 'node:child_process';
      let prompt=''; for await (const chunk of process.stdin) prompt+=chunk;
      if(!prompt.includes('live canvas is authoritative')||!prompt.includes('bricks.run')) throw new Error('Missing live tool instructions');
      const value=JSON.parse(execFileSync(process.execPath,['site-tool.mjs','bricks.mutate','{}'],{encoding:'utf8'}));
      if(value.result.revision!=='live:2'||value.result.saved!==false) process.exit(2);`;
    const response = await fetch(url + '/api/pixflow/direct-site/run-stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId: 'codex', canvasId: 'tab-1', prompt: 'Edit the heading', history: [], session: { endpoint: siteUrl + '/tools', token: 'pfdirect_' + 'a'.repeat(64), writable: true, expiresAt: Date.now()/1000+60 } }) });
    expect(await response.text()).toContain('"ok":true');
    expect(calls).toEqual([{ tool: 'bricks.context', arguments: { canvasId: 'tab-1', revision: '' } }, { tool: 'bricks.mutate', arguments: { canvasId: 'tab-1' } }, { tool: 'bricks.result', arguments: { commandId: 'cmd' } }]);
  });
  it('omits Bricks construction guidance for an inactive integration, including resumed turns', () => {
    const input = { agentId: 'codex', prompt: 'Review my WordPress site', history: [], enhancedDesignGuidance: true,
      context: { bricksIntegrationActive: false }, session: { endpoint: 'https://example.test/tools', token: 'unused', writable: true, expiresAt: 0 } };
    const prompt = directSitePrompt(input);
    expect(prompt).not.toContain('BRICKS-CONTEXT.md');
    expect(prompt).not.toContain('help --topic bricks');
    expect(prompt).not.toContain('bricks/workflows/enhanced-design.md');
    expect(prompt).toContain('Bricks is not active on this site');
    expect(directSitePrompt(input, false, true, true)).toContain('Bricks inactive');
  });
  it.each(['bricks', 'etch', 'elementor'])('routes design polish to the active %s editor, including follow-ups', editor => {
    const input = { agentId: 'codex', prompt: 'Improve this page', history: [], enhancedDesignGuidance: true, canvasId: 'legacy', context: { editor, bricksIntegrationActive: true, etchIntegrationActive: true, elementorIntegrationActive: true }, session: { endpoint: 'https://example.test/tools', token: 'unused', writable: true, expiresAt: 0 } };
    const path = editor === 'bricks' ? 'bricks/workflows/enhanced-design.md' : `${editor}/design-polish.md`;
    Object.assign(input.session, {designGuidance:{revision:0,source:'existing',product:'',instructions:'',extension:{instructions:path,commands:{}}}});
    expect(directSitePrompt(input)).toContain(path);
    expect(directSitePrompt(input, false, true, true)).toContain(path);
    expect(directSitePrompt({ ...input, enhancedDesignGuidance: false })).not.toContain(path);
  });
  it('only enables the imagegen preference for opted-in Codex runs', () => {
    const input = { agentId: 'codex', prompt: 'Generate an image', history: [], session: { endpoint: 'https://site.example/tools', token: '', writable: true, expiresAt: 0 } };
    expect(directSitePrompt(input, true)).toContain('node site-tool.mjs media.import');
    expect(directSitePrompt(input, true)).toContain('Videos still use the configured video provider');
    expect(directSitePrompt(input)).not.toContain('Image generation preference:');
    expect(directSitePrompt({ ...input, agentId: 'claude' }, true)).not.toContain('Image generation preference:');
  });

  it('uploads actual generated bytes with descriptive metadata through the site importer', async () => {
    const site = express(); site.use(express.json());
    const calls: any[] = [];
    site.post('/tools', (req, res) => { calls.push(req.body); res.json({ id: 123, url: 'https://site.example/image.png' }); });
    const siteUrl = await listen(site);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-imagegen-test-')); dirs.push(dir);
    const app = express(); app.use(express.json());
    registerDirectSiteRunRoutes(app, dir, (_req, _res, next) => next());
    const url = await listen(app);
    runner.script = `import fs from 'node:fs/promises'; import {execFileSync} from 'node:child_process';
      for await (const chunk of process.stdin) {}
      await fs.writeFile('garden.png', Buffer.from([137,80,78,71]));
      await fs.writeFile('image.json', JSON.stringify({path:'garden.png',filename:'sunny-garden.png',mimeType:'image/png',title:'Sunny garden',altText:'Flowers in a sunny garden',prompt:'A garden in sunlight'}));
      const result=execFileSync(process.execPath,['site-tool.mjs','media.import','@image.json'],{encoding:'utf8'});
      if(JSON.parse(result).id!==123) process.exit(2);`;
    const response = await fetch(url + '/api/pixflow/direct-site/run-stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId: 'codex', prompt: 'Import image', history: [], session: { endpoint: siteUrl + '/tools', token: 'pfdirect_' + 'a'.repeat(64), writable: true, expiresAt: 0 } }) });
    expect(await response.text()).toContain('"ok":true');
    expect(calls).toEqual([{tool:'media.import',arguments:{filename:'sunny-garden.png',mimeType:'image/png',title:'Sunny garden',altText:'Flowers in a sunny garden',prompt:'A garden in sunlight',source:'generated',contentBase64:'iVBORw=='}}]);
  });
  it('materializes WordPress attachments and supplies native image paths before launching', async () => {
    runner.writable = false;
    const site = express(); site.use(express.json());
    site.post('/tools', (req, res) => {
      expect(req.headers.authorization).toBe(`Bearer pfdirect_${'a'.repeat(64)}`);
      expect(req.body.tool).toBe('project.file.read');
      res.json({ content: Buffer.from(req.body.arguments.path.endsWith('.png') ? 'image-bytes' : 'brief evidence').toString('base64') });
    });
    const siteUrl = await listen(site);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-attachment-test-')); dirs.push(dir);
    const app = express(); app.use(express.json());
    registerDirectSiteRunRoutes(app, dir, (_req, _res, next) => next());
    const url = await listen(app);
    runner.script = `import fs from 'node:fs/promises'; let prompt=''; for await(const chunk of process.stdin) prompt+=chunk;
      const files=await fs.readdir('attachments');
      const text=await fs.readFile('attachments/'+files.find(f=>f.endsWith('.txt')),'utf8');
      if(text!=='brief evidence'||!prompt.includes('attachments/')) process.exit(2);
      console.log(JSON.stringify({type:'item.completed',item:{id:'answer',type:'agent_message',text:'Read both attachments.'}}));`;
    const response = await fetch(`${url}/api/pixflow/direct-site/run-stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      agentId: 'codex', prompt: 'Use the attachments', history: [], attachments: [
        { projectId: 'project', path: 'brief.txt', name: '../brief.txt', kind: 'file' },
        { projectId: 'project', path: 'image.png', name: 'image.png', kind: 'image' },
      ], session: { endpoint: `${siteUrl}/tools`, token: `pfdirect_${'a'.repeat(64)}`, writable: false, expiresAt: Date.now()/1000+300 },
    }) });
    expect(await response.text()).toContain('Read both attachments.');
    expect(runner.imagePaths).toHaveLength(1);
    expect(await fs.readFile(runner.imagePaths[0]!, 'utf8')).toBe('image-bytes');
  });
  it('runs a real child CLI that edits through the authenticated site tool, streams its answer, and removes credentials', async () => {
    const calls: unknown[] = [];
    const site = express(); site.use(express.json());
    site.post('/tools', (req, res) => {
      expect(req.headers.authorization).toBe(`Bearer pfdirect_${'a'.repeat(64)}`);
      calls.push(req.body); res.json({ bytesWritten: 7 });
    });
    const siteUrl = await listen(site);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-site-test-')); dirs.push(dir);
    const app = express(); app.use(express.json());
    registerDirectSiteRunRoutes(app, dir, (_req, _res, next) => next());
    const url = await listen(app);
    runner.script = `
      import fs from 'node:fs/promises';
      import { execFileSync } from 'node:child_process';
      for await (const chunk of process.stdin) {}
      if (process.env.PIXFLOW_TEST_STALE_CREDENTIAL) throw new Error('Launcher restored a credential stripped by the runtime environment helper');
      await fs.writeFile('args.json', JSON.stringify({path:'wp-content/test.css',content:'updated'}));
      const result = execFileSync(process.execPath, ['site-tool.mjs','files.write','@args.json'], {encoding:'utf8'});
      if (!JSON.parse(result).bytesWritten) process.exit(2);
      console.log(JSON.stringify({type:'item.completed',item:{id:'answer',type:'agent_message',text:'Updated the site file.'}}));
    `;
    const response = await fetch(`${url}/api/pixflow/direct-site/run-stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      agentId: 'codex', prompt: 'Update the CSS', history: [], session: { endpoint: `${siteUrl}/tools`, token: `pfdirect_${'a'.repeat(64)}`, writable: true, expiresAt: Date.now() / 1000 + 300 },
    }) });
    const output = await response.text();
    expect(output).toContain('Updated the site file.');
    expect(output).toContain('"ok":true');
    expect(output).not.toContain('pfdirect_');
    expect(calls).toEqual([{ tool: 'files.write', arguments: { path: 'wp-content/test.css', content: 'updated' } }]);
    const runs = await fs.readdir(path.join(dir, 'direct-site-runs'));
    await expect(fs.access(path.join(dir, 'direct-site-runs', runs[0]!, 'site-connection.json'))).rejects.toThrow();
  });

  it('keeps skills as knowledge and makes editing/read-only sessions explicit', () => {
    const input = { agentId: 'codex', prompt: 'Inspect', history: [], session: { endpoint: 'https://site.example/tools', token: '', writable: false, expiresAt: 0 } };
    const prompt = directSitePrompt(input);
    expect(prompt).toContain('skills.list');
    expect(prompt).not.toContain('mandatory preflight');
    expect(prompt).toContain('A question or request for a plan does not authorize site changes');
    expect(prompt).toContain('connection is read-only');
    expect(directSitePrompt({ ...input, session: { ...input.session, writable: true } })).toContain('Full editing capability does not authorize unsolicited edits');
  });

  it('stops the child and removes its connection after the browser cancels', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-site-cancel-')); dirs.push(dir);
    const app = express(); app.use(express.json());
    registerDirectSiteRunRoutes(app, dir, (_req, _res, next) => next());
    const url = await listen(app);
    runner.script = `import fs from 'node:fs/promises'; for await (const chunk of process.stdin) {} await fs.writeFile('started',String(process.pid)); setInterval(()=>{},1000);`;
    const controller = new AbortController();
    const response = await fetch(`${url}/api/pixflow/direct-site/run-stream`, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      agentId: 'codex', prompt: 'Wait', history: [], session: { endpoint: url+'/tools', token: `pfdirect_${'a'.repeat(64)}`, writable: true, expiresAt: Date.now() / 1000 + 300 },
    }) });
    let runDir = '';
    await vi.waitFor(async () => {
      const runs = await fs.readdir(path.join(dir, 'direct-site-runs'));
      runDir = path.join(dir, 'direct-site-runs', runs[0]!);
      await fs.access(path.join(runDir, 'started'));
    });
    const pid = Number(await fs.readFile(path.join(runDir, 'started'), 'utf8'));
    controller.abort();
    await response.body?.cancel().catch(() => undefined);
    await vi.waitFor(async () => {
      await expect(fs.access(path.join(runDir, 'site-connection.json'))).rejects.toThrow();
      expect(() => process.kill(pid, 0)).toThrow();
    }, { timeout: 15000 });
  });
  it('explicitly stops a continued child even after its original browser disconnects', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-stop-')); dirs.push(dir);
    const app = express(); app.use(express.json());
    registerDirectSiteRunRoutes(app, dir, (_req, _res, next) => next());
    const url = await listen(app);
    const continuation = { id: 'd'.repeat(32), token: 'e'.repeat(64) };
    runner.script = `import fs from 'node:fs/promises'; for await(const chunk of process.stdin) {}; await fs.writeFile('started',String(process.pid)); setInterval(()=>{},1000);`;
    const response = await fetch(url+'/api/pixflow/direct-site/run-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      agentId:'codex',prompt:'Wait for Stop',history:[],continuation,
      session:{endpoint:url+'/tools',token:'pfdirect_'+'a'.repeat(64),writable:true,expiresAt:Date.now()/1000+300},
    })});
    let runDir='';
    await vi.waitFor(async()=>{const dirs=await fs.readdir(path.join(dir,'direct-site-runs'));runDir=path.join(dir,'direct-site-runs',dirs[0]!);await fs.access(path.join(runDir,'started'));});
    const pid=Number(await fs.readFile(path.join(runDir,'started'),'utf8'));
    await response.body!.cancel();
    expect(()=>process.kill(pid,0)).not.toThrow();
    const stopped=await fetch(url+'/api/pixflow/direct-site/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(continuation)});
    expect(stopped.status).toBe(200);
    await vi.waitFor(async()=>{expect(()=>process.kill(pid,0)).toThrow();await expect(fs.access(path.join(runDir,'site-connection.json'))).rejects.toThrow();},{timeout:15000});
  });
});

it('CLI uses only the current optional server guidance and preserves off', () => {
 const input = {session:{endpoint:'https://example.test/tools',token:'fixture',writable:true},context:{},history:[],prompt:'Help with this page',enhancedDesignGuidance:true} as any;
 expect(directSitePrompt(input)).not.toContain('OPTIONAL FOUNDATION');
 input.session.designGuidance={revision:0,source:'existing',product:'',instructions:'',extension:{instructions:'OPTIONAL FOUNDATION',commands:{'/operation check':'FOCUSED CHECK'}}};
 expect(directSitePrompt(input)).toContain('OPTIONAL FOUNDATION');
 input.enhancedDesignGuidance=false;
 expect(directSitePrompt(input)).not.toContain('OPTIONAL FOUNDATION');
 input.prompt='/operation check this';
 expect(directSitePrompt(input)).toContain('FOCUSED CHECK');
 delete input.session.designGuidance;
 expect(directSitePrompt(input)).not.toContain('FOCUSED CHECK');
});
