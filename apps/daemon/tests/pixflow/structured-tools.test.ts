import {afterEach,expect,it} from 'vitest';
import {createServer} from 'node:http';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {stageWorkspaceBuilderHelper} from '../../src/pixflow/workspace-builder-session.js';
import {stagePixflowMcp,supportsPixflowMcp} from '../../src/pixflow/structured-tools.js';
import {DIRECT_SITE_TOOL_SOURCE} from '../../src/pixflow/direct-site-run.js';
import {directMcpConfiguration,withPixflowTools} from '../../src/pixflow/direct-site-mcp.js';
const cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const action of cleanup.splice(0).reverse())await action();});
function client(command:string,args:string[]) {
 const child=spawn(command,args,{windowsHide:true,env:{...process.env,PSExecutionPolicyPreference:'Restricted'},stdio:['pipe','pipe','pipe']}) as ChildProcessWithoutNullStreams;
 let seq=0,buffer='';const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
 child.stdout.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const row=buffer.slice(0,i);buffer=buffer.slice(i+1);const value=JSON.parse(row);pending.get(value.id)?.resolve(value);pending.delete(value.id);}});
 child.on('error',error=>{for(const p of pending.values())p.reject(error);});
 cleanup.push(async()=>{child.stdin.end();await new Promise<void>(resolve=>{if(child.exitCode!==null || child.signalCode!==null)return resolve();child.once('close',()=>resolve());setTimeout(()=>child.kill(),2000).unref();});});
 return {child,request(method:string,params:any={}){const id=++seq;return {id,promise:new Promise<any>((resolve,reject)=>{pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');})};},notify(method:string,params:any){child.stdin.write(JSON.stringify({jsonrpc:'2.0',method,params})+'\n');}};
}
async function fixture(scope:'site'|'workspace'='workspace', skillContent?: string) {
 const root=await mkdtemp(path.join(tmpdir(),'pixflow-mcp-'));cleanup.push(()=>rm(root,{recursive:true,force:true}));
 let deny=false,delay=false,readOnly=false;let allowedToken='pfdirect_'+'a'.repeat(64);const calls:any[]=[];
 const server = createServer(async (req, res) => {
   if (req.method === 'DELETE') {
     res.end('{}');
     return;
   }
   let text = '';
   for await (const part of req) text += part;
   const body = JSON.parse(text);
   calls.push(body);
   if (deny || req.headers.authorization !== 'Bearer ' + allowedToken || (readOnly && body.tool === 'builder.handoff')) {
     res.writeHead(403, { 'content-type': 'application/json' }).end('{"code":"rest_forbidden"}');
     return;
   }
   if (delay) return;
   res.setHeader('content-type', 'application/json');
   if (body.tool === 'abilities.list') {
     res.end(JSON.stringify({ ok: true, abilities: [
       { name: 'bricks/preview-dynamic-tag', inputSchema: { type: 'object' } },
       { name: 'bricks/list-dynamic-data-tags', inputSchema: { type: 'object' } },
       { name: 'core/list-post-types' },
     ] }));
     return;
   }
   if (body.tool === 'skills.read' && skillContent) {
     res.end(JSON.stringify({ ok: true, references: [{ path: 'design.md', content: skillContent }] }));
     return;
   }
   res.end(JSON.stringify({
     ok: true, tool: body.tool, handoff: { id: 'receipt' },
     tools: { 'bricks.read': { description: 'Read canvas' } },
   }));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));cleanup.push(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
 const session={endpoint:`http://127.0.0.1:${(server.address() as any).port}/tools`,token:'pfdirect_'+'a'.repeat(64),expiresAt:9999999999,writable:true};
 let helper:string,connection:string;
 if(scope==='workspace'){const staged=await stageWorkspaceBuilderHelper(root,session);helper=JSON.parse(staged.discovery).helper.replace(/\.cmd$/,'.mjs');connection=path.join(path.dirname(helper),'connection.json');}
 else {helper=path.join(root,'site-tool.mjs');connection=path.join(root,'site-connection.json');await writeFile(helper,DIRECT_SITE_TOOL_SOURCE);await writeFile(connection,JSON.stringify({...session,runId:'first'}));await writeFile(path.join(root,'visual-capture.mjs'),'export const captureAgentPage=()=>({ok:true});');}
 const staged=await stagePixflowMcp(helper,scope);const rpc=client(staged.server.command,staged.server.args);
 return {root,helper,connection,rpc,calls,staged,deny:()=>{deny=true;},readOnly:()=>{readOnly=true;},renewAuth:()=>{allowedToken='pfdirect_'+'b'.repeat(64);},delay:()=>{delay=true;}};
}
const payload=(reply:any)=>JSON.parse(reply.result.content[0].text);
it('forwards one native Bricks call through a repeated matching envelope',async()=>{
 const f=await fixture('site');
 const tool='bricks.native';
 const args={name:'bricks/list-element-types',input:{perPage:100}};
 const reply=await f.rpc.request('tools/call',{name:'pixflow_call',arguments:{tool,arguments:{tool,arguments:args}}}).promise;
 expect(payload(reply).ok).toBe(true);
 expect(f.calls).toEqual([{tool,arguments:args}]);
});
it('uses existing tools and keeps authorization denials authoritative',async()=>{
 const f=await fixture();expect((await f.rpc.request('initialize',{protocolVersion:'2025-03-26'}).promise).result.capabilities.tools).toEqual({});
 const call=()=>f.rpc.request('tools/call',{name:'pixflow_builder_destinations',arguments:{builder:'bricks'}}).promise;
 expect(payload(await call()).ok).toBe(true);f.deny();const denied=await call();expect(denied.result.isError).toBe(true);expect(payload(denied).status).toBe(403);expect(f.calls).toHaveLength(2);
 const bad=await f.rpc.request('tools/call',{name:'pixflow_builder_destinations',arguments:{endpoint:'https://other.invalid'}}).promise;expect(bad.result.isError).toBe(true);expect(f.calls).toHaveLength(2);
});
it('rejects a stale process after connection renewal, but a new process works',async()=>{
 const f=await fixture('site');const args={name:'pixflow_call',arguments:{tool:'bricks.read',arguments:{}}};
 expect(payload(await f.rpc.request('tools/call',args).promise).ok).toBe(true);
 const value=JSON.parse(await readFile(f.connection,'utf8'));await writeFile(f.connection,JSON.stringify({...value,runId:'next',token:'pfdirect_'+'b'.repeat(64)}));
 expect((await f.rpc.request('tools/call',args).promise).result.isError).toBe(true);expect(f.calls).toHaveLength(1);
 f.renewAuth();const staged=await stagePixflowMcp(f.helper,'site');const fresh=client(staged.server.command,staged.server.args);
 expect(payload(await fresh.request('tools/call',args).promise).ok).toBe(true);expect(f.calls).toHaveLength(2);
});
it('cancels in-flight calls without repeating them and retains uncertain-operation evidence',async()=>{
 const f=await fixture('site');f.delay();const request=f.rpc.request('tools/call',{name:'pixflow_call',arguments:{tool:'bricks.run',arguments:{code:'change'}}});
 for(let i=0;i<100&&!f.calls.length;i++)await new Promise(resolve=>setTimeout(resolve,20));expect(f.calls).toHaveLength(1);
 f.rpc.notify('notifications/cancelled',{requestId:request.id});expect((await request.promise).result.isError).toBe(true);expect(f.calls).toHaveLength(1);
 expect(await readFile(path.join(f.root,'site-tool-journal.jsonl'),'utf8')).toContain('uncertain');
});
it('does not overwrite external configuration or forward built-ins to unsupported providers',()=>{
 expect(supportsPixflowMcp('aider')).toBe(false);const external=directMcpConfiguration('claude',[{id:'other',enabled:true,transport:'stdio',command:'other'}]);const merged=withPixflowTools(external,{command:'node',args:['private.mjs']});expect(merged.claude?.mcpServers.other).toEqual(external.claude?.mcpServers.other);expect(external.claude?.mcpServers.pixflow_builtin).toBeUndefined();expect(()=>withPixflowTools(merged,{command:'other',args:[]})).toThrow(/reserved/);
});

it('permits reads but rejects writes for a read-only WordPress session',async()=>{
 const f=await fixture();f.readOnly();
 expect(payload(await f.rpc.request('tools/call',{name:'pixflow_builder_destinations',arguments:{}}).promise).ok).toBe(true);
 const result=await f.rpc.request('tools/call',{name:'pixflow_builder_handoff',arguments:{action:'open',builder:'bricks',postId:41}}).promise;
 expect(result.result.isError).toBe(true);expect(payload(result).status).toBe(403);expect(f.calls.filter(c=>c.tool==='builder.handoff')).toHaveLength(1);
});
it('closes a stopped transport with an uncertain write recorded and no retry',async()=>{
 const f=await fixture('site');f.delay();void f.rpc.request('tools/call',{name:'pixflow_call',arguments:{tool:'bricks.run',arguments:{code:'change'}}}).promise;
 for(let i=0;i<100&&!f.calls.length;i++)await new Promise(resolve=>setTimeout(resolve,20));expect(f.calls).toHaveLength(1);
 const ended=new Promise<void>(resolve=>f.rpc.child.once('close',()=>resolve()));f.rpc.child.stdin.end();await ended;
 expect(f.calls).toHaveLength(1);expect(await readFile(path.join(f.root,'site-tool-journal.jsonl'),'utf8')).toContain('uncertain');
});

it('resolves only installed WordPress abilities without executing them', async () => {
  const f = await fixture('site');
  const response = await f.rpc.request('tools/call', {
    name: 'pixflow_tools', arguments: { tool: 'bricks/preview-dynamic-tag' },
  }).promise;
  expect(payload(response).abilities).toEqual([
    { name: 'bricks/preview-dynamic-tag', inputSchema: { type: 'object' } },
  ]);
  const batch = (tools: string[]) => f.rpc.request('tools/call', {
    name: 'pixflow_tools', arguments: { tools },
  }).promise;
  const onlyAbilities = payload(await batch(['bricks/list-dynamic-data-tags', 'pixflow/bricks-knowledge']));
  expect(onlyAbilities.abilities.map((ability: { name: string }) => ability.name)).toEqual(['bricks/list-dynamic-data-tags']);
  expect(onlyAbilities.unavailableAbilities).toEqual(['pixflow/bricks-knowledge']);
  const mixed = payload(await batch(['bricks/preview-dynamic-tag', 'bricks.read']));
  expect(mixed).toMatchObject({tools: {'bricks.read': {description: 'Read canvas'}}, abilities: [{ name: 'bricks/preview-dynamic-tag' }]});
  expect(f.calls.map(call => call.tool).sort()).toEqual(['abilities.list', 'abilities.list', 'abilities.list', 'help']);
});

it('returns several focused schemas from one catalogue read and identifies missing tools', async () => {
  const f = await fixture('site');
  const call = (args: Record<string, unknown>) => f.rpc.request('tools/call', {
    name: 'pixflow_tools', arguments: args,
  }).promise;
  expect(payload(await call({ tools: ['bricks.read', 'bricks.unknown'] }))).toEqual({
    ok: true, tools: { 'bricks.read': { description: 'Read canvas' } }, unavailable: ['bricks.unknown'],
  });
  expect(f.calls.map(c => c.tool)).toEqual(['help']);
  expect(payload(await call({ tool: 'bricks.unknown' }))).toEqual({
    ok: true, tools: {}, unavailable: ['bricks.unknown'],
  });
  expect((await call({ tool: 'bricks.read', tools: ['bricks.read'] })).result.isError).toBe(true);
  expect(f.calls.map(c => c.tool)).toEqual(['help', 'help']);
});

it('routes catalogue requests addressed through the generic MCP tool without dispatching a site operation', async () => {
  const f = await fixture('site');
  const request = (arguments_: Record<string, unknown>) => f.rpc.request('tools/call', {
    name: 'pixflow_call', arguments: { tool: 'pixflow_tools', ...arguments_ },
  }).promise;
  expect(payload(await request({ arguments: { tools: ['bricks.read'] } }))).toMatchObject({
    tools: { 'bricks.read': { description: 'Read canvas' } },
  });
  expect((await request({ codeFile: 'wrong.js' })).result.isError).toBe(true);
  expect((await request({ arguments: { tools: ['bricks.read'], extra: true } })).result.isError).toBe(true);
  expect(f.calls.map(c => c.tool)).toEqual(['help']);
});

it('returns a usable local path instead of duplicating a large skill body in the MCP receipt', async () => {
  const body = 'Design guidance for the current builder.\n'.repeat(240);
  const f = await fixture('site', body);
  const reply = await f.rpc.request('tools/call', {
    name: 'pixflow_call', arguments: { tool: 'skills.read', arguments: { paths: ['design.md'] } },
  }).promise;
  const [reference] = payload(reply).references;
  expect(reference).not.toHaveProperty('content');
  expect(await readFile(reference.localPath, 'utf8')).toBe(body);
});

it('dispatches large input files through the existing tool and rejects unsafe paths', async () => {
  const f = await fixture('site');
  await writeFile(path.join(f.root, 'args.json'), JSON.stringify({ response: 'value' }));
  await writeFile(path.join(f.root, 'design.js'), 'return "draft";');
  const invoke = (args: Record<string, unknown>) => f.rpc.request('tools/call', {
    name: 'pixflow_call', arguments: { tool: 'bricks.run', ...args },
  }).promise;
  expect(payload(await invoke({ argumentFile: 'args.json', codeFile: 'design.js' })).ok).toBe(true);
  expect(f.calls[0].arguments).toMatchObject({ response: 'value', code: 'return "draft";' });
  expect(payload(await invoke({ codeFile: path.join(f.root, 'design.js') })).ok).toBe(true);
  expect(f.calls[1].arguments).toEqual({ code: 'return "draft";' });
  for (const argumentFile of ['../args.json', 'site-connection.json', 'missing.json']) {
    expect((await invoke({ argumentFile })).result.isError).toBe(true);
  }
  const early = await invoke({ codeFile: 'not-written.js' });
  expect(early.result.content[0].text).toContain('Write the file and wait');
  expect((await invoke({ codeFile: path.join(f.root, '..', 'design.js') })).result.isError).toBe(true);
  expect(f.calls).toHaveLength(2);
});

it('normalizes a script filename supplied with the native tool arguments', async () => {
  const f = await fixture('site');
  await writeFile(path.join(f.root, 'design.js'), 'return "draft";');
  const invoke = (arguments_: Record<string, unknown>, codeFile?: string) => f.rpc.request('tools/call', {
    name: 'pixflow_call', arguments: { tool: 'bricks.run', arguments: arguments_, codeFile },
  }).promise;
  expect(payload(await invoke({ codeFile: 'design.js', response: 'value' })).ok).toBe(true);
  expect(f.calls[0].arguments).toEqual({ response: 'value', code: 'return "draft";' });
  expect((await invoke({ codeFile: '../design.js' })).result.isError).toBe(true);
  expect((await invoke({ codeFile: 'design.js' }, 'other.js')).result.isError).toBe(true);
  expect((await invoke({ codeFile: 'design.js', code: 'return 1;' })).result.isError).toBe(true);
  expect(f.calls).toHaveLength(1);
});

for (const scope of ['workspace', 'site'] as const) it(`exposes the same saved plan tools in ${scope}, including handoff continuation`, async () => {
 const f=await fixture(scope);
 const list=await f.rpc.request('tools/list').promise;
 expect(list.result.tools.map((tool:any)=>tool.name)).toEqual(expect.arrayContaining(['pixflow_plan_read','pixflow_plan_update']));
 const plan={id:'build',title:'Build page',summary:'Approved brief',revision:0,steps:[{id:'build',content:'Build page',status:'pending'}]};
 expect(payload(await f.rpc.request('tools/call',{name:'pixflow_plan_update',arguments:plan}).promise).ok).toBe(true);
 expect(payload(await f.rpc.request('tools/call',{name:'pixflow_plan_read',arguments:{}}).promise).ok).toBe(true);
 expect(f.calls).toEqual([{tool:'plan.update',arguments:plan},{tool:'plan.read',arguments:{}}]);
 const denied=await f.rpc.request('tools/call',{name:'pixflow_plan_read',arguments:{conversationId:'other'}}).promise;
 expect(denied.result.isError).toBe(true);expect(f.calls).toHaveLength(2);
 for(const provider of ['codex','claude','grok-build','antigravity'])expect(supportsPixflowMcp(provider)).toBe(true);
 f.deny();expect((await f.rpc.request('tools/call',{name:'pixflow_plan_read',arguments:{}}).promise).result.isError).toBe(true);
});
