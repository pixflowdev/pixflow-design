import { beforeEach, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../src/types';

const mocks=vi.hoisted(()=>({owner:'owner-one',resolve:vi.fn(),import:vi.fn(),save:vi.fn(),read:vi.fn(),fetch:vi.fn()}));
vi.mock('../../src/pixflow/chat-history-client',()=>({
  chatHistoryOwnerScope:()=>mocks.owner,
  resolveChatHistory:mocks.resolve,importChatHistory:mocks.import,saveChatHistoryMessage:mocks.save,readChatHistory:mocks.read,
  historyMessageFingerprint:(message:Record<string,unknown>)=>{const {historyRevision,historySequence,...payload}=message;return JSON.stringify(payload);},
}));
vi.mock('../../src/pixflow/runtime-fetch',()=>({pixflowWordPressRestFetch:mocks.fetch}));
import { compactWorkingContext, compactWorkingRun, prepareHistorySource, workingContextBytes, workingRunContextBytes } from '../../src/pixflow/working-context';

it('counts completed history once without opaque reasoning or static instructions', () => {
  const request = {role:'user',content:'Audit the page'};
  const state = {messages:[request],turns:[{role:'system',content:'x'.repeat(60000)},request,{type:'reasoning',encrypted_content:'y'.repeat(60000)}],results:[]};
  const original = structuredClone(state);
  expect(workingRunContextBytes(state)).toBeLessThan(200);
  expect(workingContextBytes(state)).toBeGreaterThan(120000);
  expect(state).toEqual(original);
  expect(workingRunContextBytes({...state,results:[{id:'result',content:'z'.repeat(60000)}]})).toBeGreaterThan(60000);
});

const binding={projectId:'project',conversationId:'conversation'};
const message=(index:number)=>({id:`m-${index}`,role:index%2?'user':'assistant',content:`Preserved ${index}`,historySequence:index,historyRevision:1});
const source={binding,messages:[message(125)]};
const history={binding,throughMessageId:'m-125',messages:[{role:'user',content:'Preserved 125'}]};
const config={apiTransport:'direct',apiProtocol:'openai',apiKey:'test-key',baseUrl:'https://api.example.test',model:'model-one'} as AppConfig;
const signal=()=>new AbortController().signal;
const response=(value:unknown,ok=true)=>({ok,json:async()=>value});
beforeEach(()=>{
  vi.resetAllMocks();mocks.owner='owner-one';
  mocks.resolve.mockResolvedValue(binding);
  mocks.import.mockImplementation(async(_binding,messages)=>({messages,deletedMessageIds:[]}));
  mocks.save.mockImplementation(async(_binding,message)=>message);
  mocks.read.mockResolvedValue({messages:source.messages,hasMore:false,nextCursor:null});
});

it('loads every 50-message page and preserves original snapshots before execution',async()=>{
 const all=Array.from({length:125},(_,index)=>message(index+1));
 mocks.read.mockResolvedValueOnce({messages:all.slice(75),hasMore:true,nextCursor:'before-76'})
  .mockResolvedValueOnce({messages:all.slice(25,75),hasMore:true,nextCursor:'before-26'})
  .mockResolvedValueOnce({messages:all.slice(0,25),hasMore:false,nextCursor:null});
 const original=structuredClone(source);
 const result=await prepareHistorySource(source,signal());
 expect(result.messages).toHaveLength(125);expect(result.messages[0]?.content).toBe('Preserved 1');expect(result.messages.at(-1)?.content).toBe('Preserved 125');
 expect(mocks.read.mock.calls.map(call=>call[1])).toEqual([undefined,'before-76','before-26']);expect(source).toEqual(original);
});
it('excludes newer queued messages beyond this request’s snapshot',async()=>{
 mocks.read.mockResolvedValue({messages:[message(124),message(125),message(126)],hasMore:false,nextCursor:null});
 const result=await prepareHistorySource(source,signal());
 expect(result.messages.map(row=>row.content)).toEqual(['Preserved 124','Preserved 125']);
});
it('includes accepted steering as user context without altering the original assistant row',async()=>{
 const row={...message(124),content:'BeforeAfter',events:[{kind:'steering_message',id:'steer-1',text:'Keep existing pages',contentOffset:6,createdAt:1}]};
 mocks.read.mockResolvedValue({messages:[row,message(125)],hasMore:false,nextCursor:null});
 const result=await prepareHistorySource(source,signal());
 expect(result.messages).toEqual([{role:'assistant',content:'Before'},{role:'user',content:'Keep existing pages'},{role:'assistant',content:'After'},{role:'user',content:'Preserved 125'}]);
 expect(row.content).toBe('BeforeAfter');
});
it('saves the latest acknowledged streaming snapshot before reading execution history',async()=>{
 const latest={...message(125),content:'Latest complete response'};
 mocks.import.mockResolvedValue({messages:[message(125)],deletedMessageIds:[]});
 mocks.read.mockResolvedValue({messages:[latest],hasMore:false,nextCursor:null});
 const result=await prepareHistorySource({binding,messages:[latest]},signal());
 expect(mocks.save).toHaveBeenCalledWith(binding,latest);expect(result.messages[0]?.content).toBe(latest.content);
 expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.read.mock.invocationCallOrder[0]!);
});
it('stops on a revision conflict rather than using a stale source or overwriting another tab',async()=>{
 mocks.import.mockResolvedValue({messages:[message(125)],deletedMessageIds:[]});mocks.save.mockRejectedValue(new Error('Revision conflict'));
 await expect(prepareHistorySource({binding,messages:[{...message(125),content:'Stale update'}]},signal())).rejects.toThrow('Revision conflict');
 expect(mocks.read).not.toHaveBeenCalled();
});
it('does not borrow a server revision to overwrite mismatching unacknowledged legacy content',async()=>{
 const legacy={id:'m-125',role:'user',content:'Legacy snapshot'};
 mocks.import.mockResolvedValue({messages:[message(125)],deletedMessageIds:[]});
 mocks.save.mockRejectedValue(new Error('Revision conflict'));
 await expect(prepareHistorySource({binding,messages:[legacy]},signal())).rejects.toThrow('Revision conflict');
 expect(mocks.save).toHaveBeenCalledWith(binding,legacy);expect(mocks.save.mock.calls[0]?.[1].historyRevision).toBeUndefined();expect(mocks.read).not.toHaveBeenCalled();
});
it('saves a just-finished revisionless snapshot through the acknowledged writer before preparing context',async()=>{
 const finished={id:'m-125',role:'assistant',content:'Complete streamed response'};
 mocks.import.mockResolvedValue({messages:[{...message(125),role:'assistant',content:'Partial streamed'}],deletedMessageIds:[]});
 mocks.save.mockResolvedValue({...finished,historyRevision:2});
 mocks.read.mockResolvedValue({messages:[{...finished,historyRevision:2}],hasMore:false,nextCursor:null});
 expect((await prepareHistorySource({binding,messages:[finished]},signal())).messages).toEqual([{role:'assistant',content:finished.content}]);
 expect(mocks.save).toHaveBeenCalledWith(binding,finished);
});
it('does not manufacture history when the through-message was deleted',async()=>{
 mocks.read.mockResolvedValue({messages:[],hasMore:false,nextCursor:null});
 await expect(prepareHistorySource(source,signal())).rejects.toThrow('preceding chat message is not saved');
});
it('stops pagination when the account changes',async()=>{
 mocks.read.mockImplementation(async()=>{mocks.owner='owner-two';return {messages:source.messages,hasMore:true,nextCursor:'next'};});
 await expect(prepareHistorySource(source,signal())).rejects.toThrow('signed-in account changed');expect(mocks.read).toHaveBeenCalledTimes(1);
});
it('rejects cancellation before saving or reading any history',async()=>{
 const controller=new AbortController();controller.abort();
 await expect(prepareHistorySource(source,controller.signal)).rejects.toThrow();expect(mocks.import).not.toHaveBeenCalled();
});
it('uses the committed response rather than the disposable candidate',async()=>{
 mocks.fetch.mockResolvedValueOnce(response({candidateId:'candidate',messages:[{role:'assistant',content:'Candidate'}]}))
  .mockResolvedValueOnce(response({messages:[{role:'assistant',content:'Committed'}],compacted:true}));
 const result=await compactWorkingContext(history,config,signal());
 expect(result.messages[0]?.content).toBe('Committed');expect(mocks.fetch.mock.calls[1]?.[0]).toMatch(/\/commit$/);
 expect(JSON.parse(mocks.fetch.mock.calls[1]?.[1].body)).toEqual({candidateId:'candidate'});
});
it.each(['abort','owner'])('never commits a candidate after %s changes during preparation',async(kind)=>{
 const controller=new AbortController();
 mocks.fetch.mockImplementation(async()=>{if(kind==='abort')controller.abort();else mocks.owner='owner-two';return response({candidateId:'candidate',messages:[]});});
 await expect(compactWorkingContext(history,config,controller.signal)).rejects.toThrow();expect(mocks.fetch).toHaveBeenCalledTimes(1);
});
it('does not execute stale candidate messages after a conflicting commit',async()=>{
 mocks.fetch.mockResolvedValueOnce(response({candidateId:'candidate',messages:[{role:'assistant',content:'Stale'}]})).mockResolvedValueOnce(response({message:'Context changed'},false));
 await expect(compactWorkingContext(history,config,signal())).rejects.toThrow('Context changed');
});
it('routes Composio preparation through WordPress with no Bridge or direct provider credential dependency',async()=>{
 mocks.fetch.mockResolvedValue(response({messages:history.messages,compacted:false}));
 await compactWorkingContext(history,{...config,apiTransport:'composio',composioProvider:'openai',composioModel:'model-two'},signal());
 const [url,options]=mocks.fetch.mock.calls[0]!;expect(url).toBe('/chat-history/project/conversation/working-context');
 expect(JSON.parse(options.body)).toEqual({transport:'composio',throughMessageId:'m-125',provider:'openai',model:'model-two'});
});
it('fails closed if a pagination response claims missing pages but supplies no cursor',async()=>{
 mocks.read.mockResolvedValue({messages:source.messages,hasMore:true,nextCursor:null});
 await expect(prepareHistorySource(source,signal())).rejects.toThrow();
});
it('fails closed on a repeated cursor rather than reading forever',async()=>{
 mocks.read.mockResolvedValueOnce({messages:source.messages,hasMore:true,nextCursor:'repeat'})
  .mockResolvedValueOnce({messages:[message(124)],hasMore:true,nextCursor:'repeat'})
  .mockImplementation(async()=>{throw new Error('Read beyond repeated cursor');});
 await expect(prepareHistorySource(source,signal())).rejects.toThrow();expect(mocks.read).toHaveBeenCalledTimes(2);
});
it('does not send a duplicated row if pages overlap',async()=>{
 mocks.read.mockResolvedValueOnce({messages:[message(124),message(125)],hasMore:true,nextCursor:'next'})
  .mockResolvedValueOnce({messages:[message(123),message(124)],hasMore:false,nextCursor:null});
 await expect(prepareHistorySource(source,signal())).rejects.toThrow();
});
const runState={messages:history.messages,turns:[{opaque:'Provider-owned turn'}],results:[{id:'edit',result:{ok:true}}],calls:[]};
it('measures context size in UTF-8 bytes instead of UTF-16 characters',()=>{
 expect(workingContextBytes('字')).toBe(5);
});
it.each(['calls','inFlight'])('does not summarize while %s remains unfinished',async(field)=>{
 const state={...runState,...(field==='calls'?{calls:[{id:'pending'}]}:{inFlight:{id:'pending'}})};
 expect(await compactWorkingRun(binding,config,state,signal())).toEqual({status:'fallback',reason:'unfinished_tools'});
 expect(mocks.fetch).not.toHaveBeenCalled();
});
it.each([{}, {status:'compacted',summary:''},{status:'compacted',summary:' '},{status:'compacted',summary:42},{status:'compacted',summary:'字'.repeat(9000)}])('rejects malformed or oversized run summary %j',async(body)=>{
 mocks.fetch.mockResolvedValue(response(body));
 expect(await compactWorkingRun(binding,config,runState,signal())).toEqual({status:'fallback',reason:'compaction_unavailable'});
});
it('keeps opaque inputs unchanged on unavailable run compaction',async()=>{
 const original=structuredClone(runState);mocks.fetch.mockResolvedValue(response({message:'Unavailable'},false));
 expect(await compactWorkingRun(binding,config,runState,signal())).toMatchObject({status:'fallback'});expect(runState).toEqual(original);
});
it.each(['abort','owner'])('rejects run summaries after %s changes',async(kind)=>{
 const controller=new AbortController();mocks.fetch.mockImplementation(async()=>{if(kind==='abort')controller.abort();else mocks.owner='owner-two';return response({status:'compacted',summary:'Late summary'});});
 await expect(compactWorkingRun(binding,config,runState,controller.signal)).rejects.toThrow();
});
it('runs Composio summary inference through WordPress without forwarding direct credentials',async()=>{
 mocks.fetch.mockResolvedValue(response({status:'compacted',summary:'Confirmed save and remaining task'}));
 expect(await compactWorkingRun(binding,{...config,apiTransport:'composio',composioProvider:'openai',composioModel:'model-two'},runState,signal())).toMatchObject({status:'compacted'});
 const [url,options]=mocks.fetch.mock.calls[0]!;
 expect(url).toBe('/chat-history/project/conversation/working-context/run');
 expect(JSON.parse(options.body)).toEqual({...runState,transport:'composio',provider:'openai',model:'model-two'});
});
