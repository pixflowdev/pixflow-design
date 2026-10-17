// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { runByokSite, type ByokSiteCheckpoint } from '../../src/pixflow/direct-site-byok';
import type { AppConfig } from '../../src/types';
const requests=vi.hoisted(()=>({wordpress:vi.fn()}));
vi.mock('../../src/pixflow/runtime-fetch',()=>({pixflowWordPressRestFetch:requests.wordpress}));
const composio = vi.hoisted(() => ({ turn: vi.fn() }));
vi.mock('../../src/providers/composio-inference', () => ({ composioInferenceTurn: composio.turn }));
const context=vi.hoisted(()=>({prepare:vi.fn(),compact:vi.fn(),run:vi.fn()}));
vi.mock('../../src/pixflow/working-context',()=>({prepareHistorySource:context.prepare,compactWorkingContext:context.compact,compactWorkingRun:context.run,workingContextBytes:(value:unknown)=>Buffer.byteLength(JSON.stringify(value),'utf8')}));
afterEach(()=>{window.sessionStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();context.prepare.mockReset();context.compact.mockReset();context.run.mockReset();});
const config={mode:'api',apiProtocol:'openai',model:'fixture',apiKey:'private-key',baseUrl:'https://provider.example'} as AppConfig;
it.each(['direct', 'composio'] as const)('keeps an unavailable advanced action a normal result in %s', async apiTransport => {
 const denial={allowed:false,code:'pro_required',message:'Upgrade to Pixflow Design Pro.',learnMore:{label:'Why is this blocked in Free? Learn more',url:'https://pixflow.dev/free-pro#advanced-site-tools'}};
 requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'owned'}));
 let turns=0;
 const provider=vi.fn(async(args:{system:string;results:unknown[]})=>{
  expect(args.system).toContain('treat it as a normal availability result');
  expect(args.system).toContain('learnMore label and URL as a Markdown link');
  if(++turns===1)return {calls:[{id:'advanced',input:{name:'wordpress.run',arguments:{code:'return 1;'}}}],turns:[],text:''};
  expect(args.results).toEqual([{id:'advanced',result:denial}]);
  return {calls:[],turns:[],text:'This action requires Pro. [Why is this blocked in Free? Learn more](https://pixflow.dev/free-pro#advanced-site-tools)'};
 });
 composio.turn.mockImplementation(provider);
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
  if(init.method==='DELETE')return Response.json({closed:true});
  const body=JSON.parse(init.body);
  if(body.tool==='provider.turn')return Response.json(await provider(body.arguments));
  return Response.json(body.tool==='wordpress.run'?denial:{integrations:{bricks:false}});
 }));
 const onUpdate=vi.fn();
 await runByokSite({config:{...config,apiTransport,composioProvider:'openai',composioModel:'fixture'},prompt:'Change custom site code',history:[],signal:new AbortController().signal,onUpdate});
 expect(provider).toHaveBeenCalledTimes(2);
 const events=onUpdate.mock.calls.flatMap(call=>call[1]??[]);
 expect(events).toContainEqual(expect.objectContaining({kind:'tool_result',isError:false,content:JSON.stringify(denial)}));
});
it.each(['direct','composio'] as const)('uses the committed working context once before a %s run without altering saved source',async apiTransport=>{
 const historySource={binding:{projectId:'p',conversationId:'c'},messages:[{id:'old',role:'user',content:'Original durable history'}]};
 const preserved=structuredClone(historySource);
 const prepared={binding:historySource.binding,throughMessageId:'old',messages:[{role:'user',content:'Complete durable history'}]};
 const compacted=[{role:'user',content:'Verified checkpoint facts'},{role:'assistant',content:'Recent complete answer'}];
 context.prepare.mockResolvedValue(prepared);context.compact.mockResolvedValue({messages:compacted,compacted:true});
 requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'owned'}));
 const provider=vi.fn(async(args:{messages:unknown[]})=>{expect(args.messages).toEqual([...compacted,{role:'user',content:'Next queued request'}]);return {text:'Done',calls:[],turns:[]};});
 composio.turn.mockImplementation(provider);
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
  if(init.method==='DELETE')return Response.json({closed:true});
  const body=JSON.parse(init.body);if(body.tool==='provider.turn')return Response.json(await provider(body.arguments));
  return Response.json({integrations:{bricks:false}});
 }));
 await runByokSite({config:{...config,apiTransport,composioProvider:'openai',composioModel:'fixture'},prompt:'Next queued request',history:[],historySource,signal:new AbortController().signal,onUpdate:vi.fn()});
 expect(context.prepare).toHaveBeenCalledTimes(1);expect(context.compact).toHaveBeenCalledTimes(1);expect(provider).toHaveBeenCalledTimes(1);expect(historySource).toEqual(preserved);
});
it('does not open a tool session or execute a request when context preparation fails',async()=>{
 context.prepare.mockRejectedValue(new Error('History revision conflict'));
 const opens=requests.wordpress.mock.calls.length;
 await expect(runByokSite({config,prompt:'Continue',history:[],historySource:{binding:{projectId:'p',conversationId:'c'},messages:[]},signal:new AbortController().signal,onUpdate:vi.fn()})).rejects.toThrow('History revision conflict');
 expect(requests.wordpress.mock.calls).toHaveLength(opens);expect(context.compact).not.toHaveBeenCalled();
});
it.each(['bricks', 'etch', 'elementor'] as const)('bundles essential %s authoring guidance even when design polish is disabled', async builder => {
  const editorTarget = {builder, canvasId:'bound', postId:42};
  requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'owned',editorTarget}));
  const path = builder === 'bricks' ? 'bricks/operations/live-builder.md' : `${builder}/live-editor.md`;
  const reads: string[] = [];
  composio.turn.mockImplementation(async args => {
    expect(reads).toContain(path);
    expect(args.system).toContain('Native authoring fixture');
    return {text:'Done',calls:[],turns:[]};
  });
  vi.stubGlobal('fetch',vi.fn(async (_url,init) => {
    if(init.method==='DELETE')return Response.json({closed:true});
    const body=JSON.parse(init.body);
    if(body.tool==='skills.read'){reads.push(...body.arguments.paths);return Response.json({files:[{path,content:'Native authoring fixture'}]});}
    return Response.json({integrations:{bricks:true}});
  }));
  await runByokSite({config:{...config,apiTransport:'composio',composioProvider:'openai',composioModel:'fixture'},editorTarget,context:{editor:builder},enhancedDesignGuidance:false,prompt:'Build here',history:[],signal:new AbortController().signal,onUpdate:vi.fn()});
});
it.each(['direct', 'composio'] as const)('binds Workspace %s tool calls to the source turn and keeps live handoff guidance above artifact defaults', async transport => {
  const workspaceSource = { projectId: 'owned-project', conversationId: 'owned-chat', requestId: 'owned-user-message-1234' };
  requests.wordpress.mockResolvedValue(Response.json({ endpoint: 'https://site.example/tools', token: 'owned', workspaceSource }));
  const calls: string[] = [];
  let turns = 0;
  const provider = async (args: { system: string; results?: unknown[] }) => {
    expect(args.system).toContain('Workspace design preference');
    expect(args.system).toContain('Default page construction MUST happen visibly');
    expect(args.system.lastIndexOf('Pixflow Workspace: live page building')).toBeGreaterThan(args.system.indexOf('Workspace design preference'));
    expect(args.system).not.toContain('bricks/workflows/enhanced-design.md');
    expect(args.system).not.toContain('Current site integration: Bricks');
    if (++turns === 1) return { calls: [{ id: 'handoff', input: { name: 'builder.handoff', arguments: { action: 'create', builder: 'gutenberg', title: 'Fern House', brief: 'Build the agreed page' } } }], turns: [], text: '' };
    expect(args.results).toEqual([{ id: 'handoff', result: { handoff: { id: 'receipt', status: 'ready' } } }]);
    return { calls: [], turns: [], text: 'Opening your page.' };
  };
  composio.turn.mockImplementation(provider);
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    if (init.method === 'DELETE') return Response.json({ closed: true });
    const { tool, arguments: args } = JSON.parse(init.body);
    calls.push(tool);
    if (tool === 'provider.turn') return Response.json(await provider(args));
    if (tool === 'builder.handoff') return Response.json({ handoff: { id: 'receipt', status: 'ready' } });
    return Response.json({ integrations: { bricks: true } });
  }));
  const onUpdate = vi.fn();
  await runByokSite({ config: { ...config, apiTransport: transport, composioProvider: 'openai', composioModel: 'fixture' }, workspaceSource,
    systemPrompt: 'Workspace design preference', prompt: 'Create a new Gutenberg page for Fern House.', history: [], signal: new AbortController().signal, onUpdate });
  expect(JSON.parse(requests.wordpress.mock.calls.at(-1)![1].body).workspaceSource).toEqual(workspaceSource);
  expect(calls.filter(tool => tool === 'builder.handoff')).toHaveLength(1);
  expect(calls).not.toContain('wordpress.run');
  expect(onUpdate.mock.calls.at(-1)?.[0]).toBe('Opening your page.');
  expect(JSON.stringify(onUpdate.mock.calls)).not.toContain('private-key');
});
it.each(['bricks', 'etch', 'elementor', 'gutenberg'] as const)('keeps API %s commands on their originating tab during reconnect', async builder => {
  const editorTarget = { builder, canvasId: 'original-tab', postId: 42, ...(builder === 'gutenberg' ? {entity:{type:'wp_block',id:'42'}} : {}) };
  requests.wordpress.mockResolvedValue(Response.json({ endpoint: 'https://site.example/tools', token: 'owned', editorTarget }));
  let turns = 0, attempts = 0, polls = 0;
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    if (init.method === 'DELETE') return Response.json({ closed: true });
    const { tool, arguments: args } = JSON.parse(init.body);
    if (tool === 'provider.turn') {
      expect(args.system).toContain('The destination page already exists');
      expect(args.system).toContain('Do not create a second page');
      if (++turns === 1) return Response.json({ calls: [{ id: 'save', function: 'site_tool', input: { name: `${builder}.save`, arguments: {} } }], turns: [], text: '' });
      expect(args.results).toEqual([{ id: 'save', result: { ok: true } }]);
      return Response.json({ calls: [], turns: [], text: 'Saved.' });
    }
    if (tool === `${builder}.save`) {
      expect(args).toMatchObject({ canvasId: 'original-tab', expectedPostId: 42 });
      if (builder === 'gutenberg') expect(args.expectedEntity).toEqual({type:'wp_block',id:'42'});
      return Response.json(++attempts === 1 ? { code: 'canvas_disconnected', accepted: false } : { pending: true, commandId: 'accepted-save' });
    }
    if (tool === `${builder}.result`) { polls++; expect(args.commandId).toBe('accepted-save'); return Response.json({ ok: true }); }
    return Response.json({});
  }));
  expect(await runByokSite({ config, editorTarget, prompt: 'Save this page', history: [], signal: new AbortController().signal, onUpdate: vi.fn() })).toBe('completed');
  expect(JSON.parse(requests.wordpress.mock.calls.at(-1)![1].body).editorTarget).toEqual(editorTarget);
  expect(attempts).toBe(2);
  expect(polls).toBe(1);
});
it.each(['bricks', 'etch', 'elementor'])('loads the correct %s polish reference for API runs', async editor => {
  requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'owned'}));
  const path=editor==='bricks'?'bricks/workflows/enhanced-design.md':`${editor}/design-polish.md`;
  const references:string[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
    if(init.method==='DELETE')return Response.json({closed:true});
    const {tool,arguments:args}=JSON.parse(init.body);
    if(tool==='skills.read')references.push(...args.paths);
    if(tool==='provider.turn'){
      expect(args.system).toContain(path);
      if(editor!=='bricks')expect(args.system).not.toContain('bricks/workflows/enhanced-design.md');
      return Response.json({text:'Done',turns:[],calls:[]});
    }
    return Response.json({integrations:{bricks:true}});
  }));
  await runByokSite({config,context:{editor},canvasId:'legacy',enhancedDesignGuidance:true,prompt:'Polish the page',history:[],signal:new AbortController().signal,onUpdate:vi.fn()});
  expect(references).toContain(path);
});
it.each(['etch','bricks'])('waits for an accepted %s command when pending polls omit its ID',async builder=>{
  requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'owned'}));
  let turns=0,polls=0,edits=0;
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
    if(init.method==='DELETE')return Response.json({closed:true});
    const {tool,arguments:args}=JSON.parse(init.body);
    if(tool==='provider.turn'){
      if(++turns===1)return Response.json({text:'',turns:[],calls:[{id:'edit',function:'site_tool',input:{name:`${builder}.run`,arguments:{code:'native edit'}}}]});
      expect(polls).toBe(3);
      expect(args.results).toEqual([{id:'edit',result:{ok:true,result:'saved'}}]);
      return Response.json({text:'Saved.',turns:[],calls:[]});
    }
    if(tool===`${builder}.run`){edits++;return Response.json({pending:true,commandId:'accepted-edit'});}
    if(tool===`${builder}.result`){
      expect(args.commandId).toBe('accepted-edit');
      return Response.json(++polls<3?{pending:true}:{ok:true,result:'saved'});
    }
    return Response.json({integrations:{bricks:false}});
  }));
  expect(await runByokSite({config,prompt:'Update the note',history:[],signal:new AbortController().signal,onUpdate:vi.fn()})).toBe('completed');
  expect(edits).toBe(1);expect(polls).toBe(3);
});
it('retries a disconnected provider answer without repeating a completed native edit',async()=>{
  requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'owned'}));
  const tools:string[]=[];let turns=0;
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
    if(init.method==='DELETE')return Response.json({closed:true});
    const {tool,arguments:args}=JSON.parse(init.body);tools.push(tool);
    if(tool==='provider.turn'){
      if(++turns===1)return Response.json({text:'',turns:[],calls:[{id:'edit',function:'site_tool',input:{name:'etch.save',arguments:{}}}]});
      expect(args.results).toEqual([{id:'edit',result:{ok:true}}]);
      if(turns===2)throw new TypeError('Failed to fetch');
      return Response.json({text:'Saved.',turns:[],calls:[]});
    }
    return Response.json({ok:true});
  }));
  expect(await runByokSite({config,prompt:'Save this page',history:[],signal:new AbortController().signal,onUpdate:vi.fn()})).toBe('completed');
  expect(tools.filter(tool=>tool==='etch.save')).toHaveLength(1);
  expect(turns).toBe(3);
});
it.each(['network','http','cancel'])('bounds provider reconnection and respects %s failures',async kind=>{
  requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'owned'}));
  let turns=0;const controller=new AbortController();
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
    if(init.method==='DELETE')return Response.json({closed:true});
    const {tool}=JSON.parse(init.body);
    if(tool!=='provider.turn')return Response.json({});
    turns++;
    if(kind==='http')return Response.json({message:'Provider quota exhausted'},{status:429});
    if(kind==='cancel')controller.abort();
    throw new TypeError('Failed to fetch');
  }));
  await expect(runByokSite({config,prompt:'Read the page',history:[],signal:controller.signal,onUpdate:vi.fn()})).rejects.toBeTruthy();
  expect(turns).toBe(kind==='network'?2:1);
});
it('performs multiple native tools and polls accepted canvas work without repeating edits',async()=>{
  requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/?rest_route=%2Fpixflow-design%2Fv1%2Fwp-admin%2Fdirect%2Ftools',token:'owned'}));
  const tools:string[]=[];let turn=0;
  const fetcher=vi.fn(async(_url,init)=>{
    if(init.method==='DELETE')return Response.json({closed:true});
    const request=JSON.parse(init.body);tools.push(request.tool);
    if(request.tool==='provider.turn'){
      turn++;
      return Response.json(turn===1?{text:'Building.',turns:[],calls:[{id:'a',function:'site_tool',input:{name:'bricks.run',arguments:{code:'return 1;'}}},{id:'b',function:'site_tool',input:{name:'wordpress.run',arguments:{code:'return 2;'}}}]}:{text:'Complete.',turns:[],calls:[]});
    }
    if(request.tool==='bricks.run')return Response.json({pending:true,commandId:'accepted'});
    return Response.json({ok:true});
  });vi.stubGlobal('fetch',fetcher);
  const onUpdate=vi.fn();
  expect(await runByokSite({config,prompt:'Build a hero',history:[],canvasId:'canvas',canvasPostId:8,signal:new AbortController().signal,onUpdate})).toBe('completed');
  expect(tools).toEqual(['help','skills.read','provider.turn','bricks.run','bricks.result','wordpress.run','provider.turn']);
  const guideCall=fetcher.mock.calls.map(call=>call[1]?.body && JSON.parse(call[1].body)).find(call=>call?.tool==='skills.read');
  expect(guideCall.arguments.paths).toContain('pixflow/frontend-design/references/quality-review.md');
  expect(onUpdate.mock.calls.at(-1)?.[0]).toBe('Building.\n\nComplete.');
  expect(JSON.stringify(onUpdate.mock.calls)).not.toContain('private-key');
  expect(decodeURIComponent(String(fetcher.mock.calls.at(-1)?.[0]))).toContain('/direct/session');
});

it('recovers an accepted canvas command without sending the edit again or storing provider keys',async()=>{
  const saved:ByokSiteCheckpoint={session:{endpoint:'https://site.example/tools',token:'owned',expiresAt:9999999999,writable:true,identity:{}} as ByokSiteCheckpoint['session'],system:'Site context',messages:[{role:'user',content:'Build a hero'}],turns:[],results:[],calls:[{id:'a',function:'site_tool',input:{name:'bricks.mutate',arguments:{operations:[]}}}],images:[],content:'Building.',events:[],values:[],inFlight:{id:'a',commandId:'accepted'},provider:{model:config.model,apiProtocol:config.apiProtocol,baseUrl:config.baseUrl}};
  const names:string[]=[];let resultPolls=0;
  const store=vi.spyOn(Storage.prototype,'setItem');
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
    if(init.method==='DELETE')return Response.json({closed:true});
    const {tool}=JSON.parse(init.body);names.push(tool);
    if(tool==='bricks.result' && ++resultPolls===1)return Response.json({pending:true});
    return Response.json(tool==='provider.turn'?{text:'Saved.',turns:[],calls:[]}:{ok:true});
  }));
  await runByokSite({config,prompt:'',history:[],historySource:{binding:{projectId:'p',conversationId:'c'},messages:[]},resume:{connection:{id:'id',token:'owner'},metadata:{},byok:saved},signal:new AbortController().signal,onUpdate:vi.fn()});
  expect(names).toEqual(['help','bricks.result','bricks.result','provider.turn']);
  expect(context.prepare).not.toHaveBeenCalled();expect(context.compact).not.toHaveBeenCalled();
  expect(JSON.stringify(store.mock.calls)).not.toContain('private-key');
});

it('purges duplicate API display logs on quota pressure but preserves resumable tool results and calls',async()=>{
  const saved:ByokSiteCheckpoint={session:{endpoint:'https://site.example/tools',token:'owned',expiresAt:9999999999,writable:true},system:'Context',messages:[{role:'user',content:'Keep prompt'}],turns:[{kept:'provider turn'}],results:[{id:'old',result:'kept result'}],calls:[],images:[],content:'Keep answer',events:[{kind:'tool_result',toolUseId:'old',content:'x'.repeat(5000),isError:false}],values:[['result-1',{kept:'full value'}]],provider:{model:config.model,apiProtocol:config.apiProtocol,baseUrl:config.baseUrl}};
  const original=Storage.prototype.setItem;
  const writes:Record<string,any>[]=[];
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key,value){
    if(value.length>4000)throw new DOMException('Full','QuotaExceededError');
    writes.push(JSON.parse(value));original.call(this,key,value);
  });
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
    if(init.method==='DELETE')return Response.json({closed:true});
    const {tool}=JSON.parse(init.body);
    return Response.json(tool==='provider.turn'?{text:'Done.',turns:[],calls:[]}:{ok:true});
  }));
  await runByokSite({config,prompt:'',history:[],resume:{connection:{id:'id',token:'owner'},metadata:{messages:[{content:'Keep',events:saved.events}]},byok:saved},signal:new AbortController().signal,onUpdate:vi.fn()});
  expect(writes[0]).toMatchObject({metadata:{messages:[{content:'Keep'}]},byok:{messages:[{role:'user',content:'Keep prompt'}],turns:[{kept:'provider turn'}],results:[{id:'old',result:'kept result'}],events:[],values:[['result-1',{kept:'full value'}]]}});
});

it('does not replay a mutation whose acceptance was lost on reload',async()=>{
  const fetch=vi.fn(async()=>Response.json({closed:true}));vi.stubGlobal('fetch',fetch);
  const saved={session:{endpoint:'https://site.example/tools',token:'owned'},provider:{model:config.model,apiProtocol:config.apiProtocol,baseUrl:config.baseUrl},content:'Editing.',events:[],values:[],inFlight:{id:'unknown'}} as unknown as ByokSiteCheckpoint;
  await expect(runByokSite({config,prompt:'',history:[],resume:{connection:{id:'id',token:'owner'},metadata:{},byok:saved},signal:new AbortController().signal,onUpdate:vi.fn()})).rejects.toThrow('has not been repeated');
  expect(fetch).not.toHaveBeenCalled();
  const retained=Array.from({length:sessionStorage.length},(_,i)=>JSON.parse(sessionStorage.getItem(sessionStorage.key(i)!)||'null')).find(value=>value?.byok);
  expect(retained?.byok.inFlight).toEqual({id:'unknown'});
});
it('answers questions without issuing mutations and honors cancellation between calls',async()=>{
  requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'owned'}));
  const controller=new AbortController();const calls:string[]=[];const onAccepted=vi.fn();
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
    if(init.method==='DELETE')return Response.json({closed:true});
    const {tool}=JSON.parse(init.body);calls.push(tool);
    if(tool==='provider.turn'){controller.abort();return Response.json({text:'',turns:[],calls:[{id:'x',function:'site_tool',input:{name:'wordpress.run',arguments:{}}}]});}
    return Response.json({});
  }));
  await expect(runByokSite({config,prompt:'Stop test',history:[],signal:controller.signal,onUpdate:vi.fn(),onAccepted})).rejects.toBeTruthy();
  expect(calls).toEqual(['help','provider.turn']);
  expect(onAccepted).not.toHaveBeenCalled();
});


it('preserves a native null tool result instead of inventing an execution error', async () => {
  requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'owned'}));
  let turn=0;
  const onUpdate=vi.fn();
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
    if(init.method==='DELETE')return Response.json({closed:true});
    const {tool,arguments:args}=JSON.parse(init.body);
    if(tool==='provider.turn'){
      if(turn++===0)return Response.json({text:'',turns:[],calls:[{id:'null-result',function:'site_tool',input:{name:'wordpress.run',arguments:{code:'return null;'}}}]});
      expect(args.results).toEqual([{id:'null-result',result:null}]);
      return Response.json({text:'There is no value.',turns:[],calls:[]});
    }
    return Response.json(tool==='wordpress.run'?null:{});
  }));
  expect(await runByokSite({config,prompt:'Read an optional value',history:[],signal:new AbortController().signal,onUpdate})).toBe('completed');
  expect(onUpdate.mock.calls.at(-1)?.[1].filter((event:{kind:string})=>event.kind==='tool_result')).toEqual([expect.objectContaining({content:'null',isError:false})]);
});

it('keeps BYOK independent of Bricks when the site reports it inactive', async () => {
  requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'owned'}));
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
    if(init.method==='DELETE') return Response.json({closed:true});
    const {tool,arguments:args}=JSON.parse(init.body);
    if(tool==='help') return Response.json({integrations:{bricks:false},tools:{'wordpress.run':{}}});
    if(tool==='provider.turn') {
      expect(args.system).toContain('Bricks inactive');
      expect(args.system).not.toContain('bricks/workflows/enhanced-design.md');
      expect(args.system).not.toContain('Design styling: Use site styles');
      return Response.json({text:'WordPress is available.',turns:[],calls:[]});
    }
    throw new Error('Unexpected tool: '+tool);
  }));
  expect(await runByokSite({config,prompt:'What can you help with?',history:[],signal:new AbortController().signal,onUpdate:vi.fn()})).toBe('completed');
});

it('acknowledges API handoff only after the provider responds and before executing its tools', async () => {
  requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'owned'}));
  const accepted=vi.fn(async()=>undefined); let turn=0;
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
    if(init.method==='DELETE')return Response.json({closed:true});
    const {tool}=JSON.parse(init.body);
    if(tool==='provider.turn') { if(++turn===1) {expect(accepted).not.toHaveBeenCalled(); return Response.json({text:'',turns:[],calls:[{id:'inspect',input:{name:'gutenberg.read',arguments:{}}}]});} return Response.json({text:'Done',turns:[],calls:[]}); }
    if(tool==='gutenberg.read')expect(accepted).toHaveBeenCalledTimes(1);
    return Response.json({});
  }));
  await runByokSite({config,prompt:'Inspect',history:[],signal:new AbortController().signal,onUpdate:vi.fn(),onAccepted:accepted});
  expect(accepted).toHaveBeenCalledTimes(1);
});

it('preserves uncertain write evidence and refuses to replay a write whose admission was lost', async () => {
  requests.wordpress.mockClear();
  requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'owned'}));
  let writes=0,closed=0;
  const fetcher=vi.fn(async(_url,init)=>{
    if(init.method==='DELETE'){closed++;return Response.json({closed:true});}
    const {tool}=JSON.parse(init.body);
    if(tool==='provider.turn')return Response.json({text:'',turns:[],calls:[{id:'change',input:{name:'wordpress.run',arguments:{code:'fixture'}}}]});
    if(tool==='wordpress.run'){writes++;throw new TypeError('Lost write acknowledgement');}
    return Response.json({});
  });
  vi.stubGlobal('fetch',fetcher);
  const input={config,prompt:'Change the page',history:[],persistenceMetadata:{initial:[{id:'prior',content:'Keep my conversation'}],handoff:{id:'retained-receipt'}},signal:new AbortController().signal,onUpdate:vi.fn()};
  await expect(runByokSite(input)).rejects.toThrow('result is unknown');
  const saved=Array.from({length:sessionStorage.length},(_,i)=>JSON.parse(sessionStorage.getItem(sessionStorage.key(i)!)||'null')).find(value=>value?.byok);
  expect(saved).toMatchObject({metadata:input.persistenceMetadata,byok:{inFlight:{id:'change'}}});
  expect(closed).toBe(0);
  const callsBefore=fetcher.mock.calls.length;
  await expect(runByokSite({...input,resume:saved})).rejects.toThrow('operation has not been repeated');
  expect(fetcher).toHaveBeenCalledTimes(callsBefore); expect(writes).toBe(1);
});
it('recovers an accepted API command by its result identity without resending the mutation', async () => {
  requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'owned'}));
  let writes=0,results=0,turns=0;
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
    if(init.method==='DELETE')return Response.json({closed:true});
    const {tool,arguments:args}=JSON.parse(init.body);
    if(tool==='provider.turn')return ++turns===1 ? Response.json({text:'',turns:[],calls:[{id:'save',input:{name:'gutenberg.save',arguments:{}}}]}) : Response.json({text:'Saved',turns:[],calls:[]});
    if(tool==='gutenberg.save'){writes++;return Response.json({pending:true,commandId:'accepted-command'});}
    if(tool==='gutenberg.result'){expect(args.commandId).toBe('accepted-command'); if(++results===1)throw new TypeError('Lost result response'); return Response.json({ok:true});}
    return Response.json({});
  }));
  const input={config,prompt:'Save',history:[],persistenceMetadata:{id:'receipt'},signal:new AbortController().signal,onUpdate:vi.fn()};
  await expect(runByokSite(input)).rejects.toThrow('result is unknown');
  const saved=Array.from({length:sessionStorage.length},(_,i)=>JSON.parse(sessionStorage.getItem(sessionStorage.key(i)!)||'null')).find(value=>value?.byok);
  expect(saved?.byok.inFlight.commandId).toBe('accepted-command');
  await expect(runByokSite({...input,resume:saved})).resolves.toBe('completed');
  expect(writes).toBe(1);expect(results).toBe(2);
});

it('reports unknown Workspace tool delivery when Stop interrupts a dispatched operation', async () => {
  const controller = new AbortController();
  const workspaceSource = { projectId: 'owned-project', conversationId: 'owned-chat', requestId: 'original-user-message' };
  requests.wordpress.mockResolvedValue(Response.json({ endpoint: 'https://site.example/tools', token: 'owned', workspaceSource }));
  let handoffs = 0;
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    if (init.method === 'DELETE') return Response.json({ closed: true });
    const { tool } = JSON.parse(init.body);
    if (tool === 'provider.turn') return Response.json({ text: '', turns: [], calls: [{ id: 'handoff', input: { name: 'builder.handoff', arguments: {} } }] });
    if (tool === 'builder.handoff') {
      handoffs++;
      controller.abort();
      throw controller.signal.reason;
    }
    return Response.json({});
  }));
  await expect(runByokSite({ config, workspaceSource, prompt: 'Build the page', history: [], signal: controller.signal, onUpdate: vi.fn() }))
    .rejects.toMatchObject({ code: 'PIXFLOW_SITE_DELIVERY_UNCERTAIN' });
  expect(handoffs).toBe(1);
});

it('notifies the Workspace synchronously on pagehide and removes the listener when the run exits', async () => {
  const onDeliveryUncertain = vi.fn();
  requests.wordpress.mockResolvedValue(Response.json({ endpoint: 'https://site.example/tools', token: 'owned' }));
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    if (init.method === 'DELETE') return Response.json({ closed: true });
    const { tool } = JSON.parse(init.body);
    if (tool === 'provider.turn') {
      window.dispatchEvent(new Event('pagehide'));
      expect(onDeliveryUncertain).toHaveBeenCalledTimes(1);
      return Response.json({ text: '', turns: [], calls: [] });
    }
    return Response.json({});
  }));
  await expect(runByokSite({ config, prompt: 'Inspect the page', history: [], signal: new AbortController().signal, onUpdate: vi.fn(), onDeliveryUncertain }))
    .rejects.toMatchObject({ code: 'PIXFLOW_SITE_DELIVERY_UNCERTAIN' });
  window.dispatchEvent(new Event('pagehide'));
  expect(onDeliveryUncertain).toHaveBeenCalledTimes(1);
});
