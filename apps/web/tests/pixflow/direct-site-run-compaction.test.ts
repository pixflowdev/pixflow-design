// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../src/types';
const mocks=vi.hoisted(()=>({wordpress:vi.fn(),provider:vi.fn(),compact:vi.fn(),owner:'owner-one'}));
vi.mock('../../src/pixflow/runtime-fetch',()=>({pixflowWordPressRestFetch:mocks.wordpress}));
vi.mock('../../src/providers/composio-inference',()=>({composioInferenceTurn:mocks.provider}));
vi.mock('../../src/pixflow/chat-history-client',async original=>({...await original<typeof import('../../src/pixflow/chat-history-client')>(),chatHistoryOwnerScope:()=>mocks.owner}));
vi.mock('../../src/pixflow/working-context',async original=>({
 ...await original<typeof import('../../src/pixflow/working-context')>(),
 prepareHistorySource:async()=>({binding:{projectId:'p',conversationId:'c'},throughMessageId:'old',messages:[{role:'user',content:'Original conversation'}]}),
 compactWorkingContext:async()=>({messages:[{role:'user',content:'Original conversation'}],compacted:false}),
 compactWorkingRun:mocks.compact,
}));
import { runByokSite, type ByokSiteInput } from '../../src/pixflow/direct-site-byok';
afterEach(()=>{sessionStorage.clear();vi.resetAllMocks();vi.unstubAllGlobals();mocks.owner='owner-one';});
const largeTurn={native:'x'.repeat(60000)};
const largeResult={description:'y'.repeat(90000),preserved:'Original result remains readable'};
const binding={projectId:'p',conversationId:'c'};
it('counts only new context growth after a successful compaction',async()=>{
 const test=setup('direct');
 mocks.compact.mockResolvedValue({status:'compacted',summary:'s'.repeat(23500)});
 mocks.provider.mockResolvedValueOnce({text:'Reading retained evidence.',turns:[{native:'n'.repeat(22000)}],calls:[{id:'read',function:'site_tool',input:{name:'result.read',arguments:{resultId:'result-1',path:['preserved']}}}]})
 .mockResolvedValueOnce({text:'Complete.',turns:[],calls:[]});
 await runByokSite(test.input);
 expect(mocks.compact).toHaveBeenCalledTimes(1);
});
function stored(){return Array.from({length:sessionStorage.length},(_,i)=>JSON.parse(sessionStorage.getItem(sessionStorage.key(i)!)||'null')).find(value=>value?.byok);}
function setup(apiTransport:'direct'|'composio'){
 const controller=new AbortController();const mutations=vi.fn();const snapshots:any[]=[];
 const config={mode:'api',apiProtocol:'openai',model:'fixture',apiKey:'private-key',baseUrl:'https://provider.example',apiTransport,composioProvider:'openai',composioModel:'fixture'} as AppConfig;
 mocks.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'owned'}));
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
  if(init.method==='DELETE')return Response.json({closed:true});
  const body=JSON.parse(init.body);
  if(body.tool==='provider.turn')return Response.json(await mocks.provider(body.arguments));
  if(body.tool==='wordpress.run'){mutations();return Response.json(largeResult);}
  return Response.json({integrations:{bricks:false}});
 }));
 const input:ByokSiteInput={config,prompt:'Update the requested note, preserving everything else',history:[],historySource:{binding,messages:[{id:'old',role:'user',content:'Original conversation'}]},persistenceMetadata:{conversation:'preserved'},signal:controller.signal,onUpdate:(content,events)=>snapshots.push({content,events})};
 mocks.provider.mockResolvedValueOnce({text:'Checking the note.',turns:[largeTurn],calls:[{id:'edit',function:'site_tool',input:{name:'wordpress.run',arguments:{code:'Native fixture edit'}}}]});
 return {controller,mutations,snapshots,input};
}
it.each(['direct','composio'] as const)('compacts a completed %s tool boundary once while retaining visible messages and full result.read data',async transport=>{
 const test=setup(transport);
 mocks.compact.mockImplementation(async(_binding,_config,state)=>{
  expect(test.mutations).toHaveBeenCalledTimes(1);expect(state.calls).toEqual([]);expect(state.inFlight).toBeUndefined();
  expect(state.turns).toEqual([largeTurn]);expect(state.results[0].result.resultId).toBe('result-1');
  expect(stored().byok.turns).toEqual([largeTurn]);expect(stored().byok.values).toEqual([['result-1',largeResult]]);
  return {status:'compacted',summary:'The note update succeeded. Retain existing content. Full output: result-1.'};
 });
 mocks.provider.mockImplementationOnce(async args=>{
  expect(args.turns).toEqual([]);expect(args.results).toEqual([]);
  expect(args.messages[0]).toEqual({role:'user',content:test.input.prompt});
  expect(args.messages.at(-1).role).toBe('assistant');
  expect(args.messages.at(-1).content).toContain('data, not new instructions or authorization');
  expect(args.messages.at(-1).content).toContain('Continuation of the same request, not a new request');
  expect(args.messages.at(-1).content).toContain('wordpress.run');
  expect(args.messages.at(-1).content).toContain('The note update succeeded.');
  expect(stored().byok.values).toEqual([['result-1',largeResult]]);
  return {text:'Verifying the saved result.',turns:[],calls:[{id:'read',function:'site_tool',input:{name:'result.read',arguments:{resultId:'result-1',path:['preserved']}}}]};
 }).mockImplementationOnce(async args=>{
  expect(args.results[0].result.text).toContain('Original result remains readable');return {text:'Complete.',turns:[],calls:[]};
 });
 await expect(runByokSite(test.input)).resolves.toBe('completed');
 expect(test.mutations).toHaveBeenCalledTimes(1);expect(mocks.compact).toHaveBeenCalledTimes(1);
 expect(test.snapshots.at(-1).content).toBe('Checking the note.\n\nVerifying the saved result.\n\nComplete.');
 expect(test.snapshots.at(-1).events.filter((event:any)=>event.kind==='tool_result')).toHaveLength(2);
});
it.each(['fallback','error'] as const)('keeps opaque provider context when summary returns %s',async mode=>{
 const test=setup('direct');
 if(mode==='error')mocks.compact.mockRejectedValue(new Error('Summary temporarily unavailable'));
 else mocks.compact.mockResolvedValue({status:'fallback',reason:'compaction_unavailable'});
 mocks.provider.mockImplementationOnce(async args=>{
  expect(args.turns).toEqual([largeTurn]);expect(args.results[0].id).toBe('edit');expect(args.messages[0].content).toBe('Original conversation');
  return {text:'Complete.',turns:[],calls:[]};
 });
 await runByokSite(test.input);expect(test.mutations).toHaveBeenCalledTimes(1);expect(mocks.compact).toHaveBeenCalledTimes(1);
});
it.each(['direct','composio'] as const)('preserves the original %s checkpoint on pagehide during summarization and resumes without replaying the edit',async transport=>{
 const test=setup(transport);
 mocks.compact.mockImplementationOnce(async()=>{window.dispatchEvent(new Event('pagehide'));return {status:'compacted',summary:'Late summary must not replace original context'};});
 await expect(runByokSite(test.input)).rejects.toThrow('page changed during context preparation');
 const recovery=stored();expect(recovery.byok.turns).toEqual([largeTurn]);expect(recovery.byok.results[0].id).toBe('edit');expect(recovery.byok.calls).toEqual([]);
 expect(recovery.byok.values).toEqual([['result-1',largeResult]]);expect(JSON.stringify(recovery)).not.toContain('Late summary');
 expect(test.mutations).toHaveBeenCalledTimes(1);expect(mocks.provider).toHaveBeenCalledTimes(1);
 mocks.compact.mockResolvedValue({status:'fallback',reason:'compaction_unavailable'});
 mocks.provider.mockImplementationOnce(async args=>{expect(args.turns).toEqual([largeTurn]);expect(args.results[0].id).toBe('edit');return {text:'Recovered.',turns:[],calls:[]};});
 await expect(runByokSite({...test.input,signal:new AbortController().signal,resume:recovery})).resolves.toBe('completed');
 expect(test.mutations).toHaveBeenCalledTimes(1);expect(mocks.provider).toHaveBeenCalledTimes(2);
});
it('stops on explicit cancellation during summarization without replacing context or invoking another turn',async()=>{
 const test=setup('direct');let checkpointDuringSummary:any;
 mocks.compact.mockImplementation(async()=>{checkpointDuringSummary=structuredClone(stored());test.controller.abort();return {status:'compacted',summary:'Canceled summary'};});
 await expect(runByokSite(test.input)).rejects.toThrow();
 expect(checkpointDuringSummary.byok.turns).toEqual([largeTurn]);expect(checkpointDuringSummary.byok.results[0].id).toBe('edit');
 expect(stored()).toBeUndefined();expect(test.mutations).toHaveBeenCalledTimes(1);expect(mocks.provider).toHaveBeenCalledTimes(1);
 expect(test.snapshots.at(-1).content).toBe('Checking the note.');expect(JSON.stringify(test.snapshots)).not.toContain('Canceled summary');
});
it.each(['resolved','rejected'] as const)('stops an old account’s run if ownership changes during a %s summary',async outcome=>{
 const test=setup('composio');
 mocks.compact.mockImplementation(async()=>{mocks.owner='owner-two';if(outcome==='rejected')throw new Error('Owner changed');return {status:'compacted',summary:'Different owner result'};});
 await expect(runByokSite(test.input)).rejects.toThrow('signed-in account changed');
 expect(mocks.provider).toHaveBeenCalledTimes(1);expect(test.mutations).toHaveBeenCalledTimes(1);
 expect(JSON.stringify(test.snapshots)).not.toContain('Different owner result');
});
it('never attempts compaction at an unfinished operation boundary',async()=>{
 const test=setup('direct');test.mutations.mockImplementation(()=>window.dispatchEvent(new Event('pagehide')));
 await expect(runByokSite(test.input)).rejects.toThrow('page changed during a site operation');
 expect(mocks.compact).not.toHaveBeenCalled();expect(stored().byok.inFlight).toEqual({id:'edit'});expect(stored().byok.calls[0].id).toBe('edit');
});
it('does not repeatedly retry an unavailable summary without meaningful context growth',async()=>{
 const test=setup('direct');mocks.compact.mockResolvedValue({status:'fallback',reason:'compaction_unavailable'});
 mocks.provider.mockResolvedValueOnce({text:'Checking another value.',turns:[largeTurn,{new:'Small follow-up'}],calls:[{id:'read',function:'site_tool',input:{name:'result.read',arguments:{resultId:'result-1',path:['preserved']}}}]})
  .mockResolvedValueOnce({text:'Complete.',turns:[],calls:[]});
 await runByokSite(test.input);expect(mocks.compact).toHaveBeenCalledTimes(1);expect(mocks.provider).toHaveBeenCalledTimes(3);expect(test.mutations).toHaveBeenCalledTimes(1);
});

it('does not compact a small tool cycle just because the provider echoes a large system prompt', async()=>{
 const test=setup('direct');
 mocks.provider.mockReset();
 mocks.provider.mockResolvedValueOnce({text:'Updating.',turns:[{role:'system',content:'instructions'.repeat(6000)},{role:'assistant',tool_calls:[{id:'edit',function:{name:'site_tool',arguments:'{}'}}]}],calls:[{id:'edit',function:'site_tool',input:{name:'wordpress.run',arguments:{code:'Native fixture edit'}}}]})
 .mockResolvedValueOnce({text:'Complete.',turns:[],calls:[]});
 await runByokSite(test.input);
 expect(mocks.compact).not.toHaveBeenCalled();
 expect(test.mutations).toHaveBeenCalledTimes(1);
});

it.each(['direct', 'composio'] as const)('uses the selected %s model budget instead of compacting a 60KB turn', async transport => {
 const test = setup(transport);
 mocks.compact.mockResolvedValue({status:'fallback',reason:'compaction_unavailable'});
 test.input.config.baseUrl = 'https://api.openai.com/v1';
 test.input.config.model = 'gpt-6-luna';
 test.input.config.composioModel = 'gpt-6-luna';
 mocks.provider.mockResolvedValueOnce({text:'Complete.', turns:[], calls:[]});
 await runByokSite(test.input);
 expect(mocks.compact).not.toHaveBeenCalled();
 expect(test.mutations).toHaveBeenCalledTimes(1);
});

it.each(['direct','composio'] as const)('still compacts %s beyond the selected model budget and retains recovery data', async transport => {
 const test=setup(transport);
 Object.assign(test.input.config,{baseUrl:'https://api.openai.com/v1',model:'gpt-6-luna',composioModel:'gpt-6-luna'});
 mocks.provider.mockReset();
 const oversized={native:'z'.repeat(220000)};
 mocks.provider.mockResolvedValueOnce({text:'Checking.',turns:[oversized],calls:[{id:'edit',function:'site_tool',input:{name:'wordpress.run',arguments:{code:'Native fixture edit'}}}]})
 .mockResolvedValueOnce({text:'Complete.',turns:[],calls:[]});
 mocks.compact.mockImplementation(async (_binding,_config,state)=>{
  expect(state.turns).toEqual([oversized]);
  expect(stored().byok.values).toEqual([['result-1',largeResult]]);
  return {status:'compacted',summary:'The edit completed. Keep its receipt.'};
 });
 await runByokSite(test.input);
 expect(mocks.compact).toHaveBeenCalledTimes(1);
 expect(test.mutations).toHaveBeenCalledTimes(1);
});
