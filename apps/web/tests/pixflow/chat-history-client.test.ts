import { beforeEach, describe, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => vi.fn());
const owner = vi.hoisted(() => ({ id: 1 }));
vi.mock('../../src/pixflow/runtime-fetch', () => ({ pixflowWordPressRestFetch: transport }));
vi.mock('../../src/pixflow/wordpress-context', () => ({ getPixflowWordPressConfig: () => ({ siteHash: 'audit-site', userId: owner.id }) }));
import { importChatHistory, mergeChatHistory, readChatHistory, saveChatHistoryMessage } from '../../src/pixflow/chat-history-client';

const binding = { projectId: 'history-project', conversationId: 'history-conversation' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
describe('durable transcript client', () => {
  beforeEach(() => { transport.mockReset(); owner.id = 1; });
  it('stops a multi-batch import when the account changes between requests', async () => {
    transport.mockImplementation(async () => { owner.id = 2; return response({ messages: [], deletedMessageIds: [] }); });
    await expect(importChatHistory(binding, Array.from({length: 101}, (_, index) => ({id: `owner-${index}`})))).rejects.toThrow('signed-in account changed');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('imports all old messages in bounded requests without shortening content or events', async () => {
    transport.mockImplementation(async (_url, init) => response({ messages: JSON.parse(init.body).messages, deletedMessageIds: [] }));
    const messages = Array.from({ length: 247 }, (_, index) => ({ id: `message-${index}`, role: 'assistant', content: 'full'.repeat(5000), events: [{ kind: 'tool_result', content: 'preserved' }] }));
    const result = await importChatHistory(binding, messages);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(result.messages).toEqual(messages);
    for (const [, init] of transport.mock.calls) expect(JSON.parse(init.body).importOnly).toBe(true);
  });
  it('preserves deleted identities returned during a cache migration', async () => {
    transport.mockResolvedValue(response({ messages: [], deletedMessageIds: ['deleted'] }));
    expect((await importChatHistory(binding, [{ id: 'deleted', content: 'old cache' }])).deletedMessageIds).toEqual(['deleted']);
  });
  it('loads a bounded chronological page using the opaque older cursor', async () => {
    transport.mockResolvedValue(response({ messages: [], hasMore: false, nextCursor: null }));
    await readChatHistory(binding, 'cursor/+==');
    expect(transport.mock.calls[0]?.[0]).toContain('?limit=50&before=cursor%2F%2B%3D%3D');
  });
  it('serializes snapshots and advances only its acknowledged revision', async () => {
    const revisions: number[] = [];
    transport.mockImplementation(async (_url, init) => {
      const message = JSON.parse(init.body);
      revisions.push(message.historyRevision);
      return response({ ok: true, message: { ...message, historyRevision: message.historyRevision + 1 }, revision: message.historyRevision + 1 });
    });
    await Promise.all(['a', 'ab', 'abc'].map(content => saveChatHistoryMessage(binding, { id: 'stream', role: 'assistant', content, historyRevision: 5 })));
    expect(revisions).toEqual([5, 6, 7]);
  });
  it('does not retry a stale-tab conflict with a newer server revision', async () => {
    transport.mockResolvedValue(response({ message: 'A newer revision exists', current: { historyRevision: 30 } }, 409));
    await expect(saveChatHistoryMessage(binding, { id: 'conflict', content: 'old', historyRevision: 2 })).rejects.toThrow('A newer revision exists');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.parse(transport.mock.calls[0]?.[1].body).historyRevision).toBe(2);
  });
  it('recovers a revision lost on reload only for an append-only snapshot of the same active run', async () => {
    const saved = { id: 'reload-stream', role: 'assistant', content: 'First paragraph.', runId: 'run-1', runStatus: 'running', lastRunEventId: '20', historyRevision: 9, events: [{kind:'status',label:'starting'}] };
    const complete = { ...saved, content: 'First paragraph.\n\nComplete reply.', runStatus: 'succeeded', lastRunEventId: '40', historyRevision: 0 };
    transport.mockResolvedValueOnce(response({code:'pixflow_history_conflict',message:'Newer saved version',data:{message:saved}},409))
      .mockImplementationOnce(async (_url,init) => response({message:{...JSON.parse(init.body),historyRevision:10},revision:10}));
    await expect(saveChatHistoryMessage(binding,complete)).resolves.toMatchObject({content:complete.content,historyRevision:10});
    expect(JSON.parse(transport.mock.calls[1]![1].body).historyRevision).toBe(9);
  });
  it.each(['divergent', 'terminal', 'different-run', 'older-cursor', 'missing-event'])('never rebases a %s conflict', async scenario => {
    const saved = { id:`unsafe-${scenario}`,role:'assistant',content:'Saved reply',runId:'run-1',runStatus:'running',lastRunEventId:'20',historyRevision:9,events:[{kind:'tool_result',content:'preserve'}] };
    const incoming = {...saved,content:'Saved reply continued',lastRunEventId:'30',historyRevision:0};
    if(scenario==='divergent')incoming.content='Different branch';
    if(scenario==='terminal')saved.runStatus='succeeded';
    if(scenario==='different-run')incoming.runId='other';
    if(scenario==='older-cursor')incoming.lastRunEventId='10';
    if(scenario==='missing-event')incoming.events=[];
    transport.mockResolvedValue(response({code:'pixflow_history_conflict',message:'Keep both',data:{message:saved}},409));
    await expect(saveChatHistoryMessage(binding,incoming)).rejects.toThrow('Keep both');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('acknowledges an identical terminal replay tail only when every pending field is preserved',async()=>{
    const incoming={id:'replay-tail',role:'assistant',content:'tail',runId:'r',runStatus:'succeeded',lastRunEventId:'80',historyRevision:0,events:[{kind:'text',text:'tail'},{kind:'status',label:'done'}]};
    const saved={...incoming,content:'Complete reply tail',historyRevision:8,events:[{kind:'status',label:'starting'},...incoming.events]};
    transport.mockResolvedValue(response({code:'pixflow_history_conflict',message:'Conflict',data:{message:saved}},409));
    await expect(saveChatHistoryMessage(binding,incoming)).resolves.toEqual(saved);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('remembers acknowledged revisions after the previous write has fully drained', async () => {
    const revisions: number[] = [];
    transport.mockImplementation(async (_url, init) => {
      const message = JSON.parse(init.body);
      revisions.push(message.historyRevision);
      return response({ok:true,message:{...message,historyRevision:message.historyRevision+1},revision:message.historyRevision+1});
    });
    await saveChatHistoryMessage(binding,{id:'sequential',role:'assistant',content:'First',historyRevision:1});
    await new Promise(resolve => setTimeout(resolve,0));
    await saveChatHistoryMessage(binding,{id:'sequential',role:'assistant',content:'Finished',historyRevision:1});
    expect(revisions).toEqual([1,2]);
  });
  it('deduplicates by identity while preserving attachments and complete tool data', () => {
    const payload = { id: 'one', role: 'assistant', content: 'answer', attachments: [{ name: 'image.png' }], events: [{ kind: 'tool_result', content: 'full result' }], historySequence: 1 };
    expect(mergeChatHistory<import('../../src/pixflow/chat-history-client').HistoryMessage>([payload], [{ ...payload, historyRevision: 2 }, { id: 'two', historySequence: 2 }])).toEqual([{ ...payload, historyRevision: 2 }, { id: 'two', historySequence: 2 }]);
  });
  it('advances revisionless streamed snapshots only through this browser writer acknowledgements', async () => {
    const revisions: number[] = [];
    transport.mockImplementation(async (_url, init) => {
      const message = JSON.parse(init.body);
      revisions.push(message.historyRevision);
      return response({ ok: true, message: { ...message, historyRevision: message.historyRevision + 1 }, revision: message.historyRevision + 1 });
    });
    const partial = { id: 'revisionless-stream', role: 'assistant', content: 'Partial' };
    await saveChatHistoryMessage(binding, partial);
    await saveChatHistoryMessage(binding, { ...partial, content: 'Complete answer', events: [{ kind: 'tool_result', content: 'Full saved result' }] });
    expect(revisions).toEqual([0, 1]);
    expect(partial).not.toHaveProperty('historyRevision');
  });
  it('does not reuse another account acknowledgement for a revisionless snapshot', async () => {
    transport.mockImplementationOnce(async (_url, init) => {
      const message = JSON.parse(init.body);
      return response({ ok: true, message: { ...message, historyRevision: 7 }, revision: 7 });
    });
    const snapshot = { id: 'revisionless-owner', role: 'assistant', content: 'Original account snapshot' };
    await saveChatHistoryMessage(binding, snapshot);
    owner.id = 2;
    transport.mockResolvedValueOnce(response({ message: 'A newer revision exists', current: { historyRevision: 8 } }, 409));
    await expect(saveChatHistoryMessage(binding, { ...snapshot, content: 'Stale snapshot' })).rejects.toThrow('A newer revision exists');
    expect(JSON.parse(transport.mock.calls[1]?.[1].body).historyRevision).toBe(0);
    expect(transport).toHaveBeenCalledTimes(2);
  });
});

it('acknowledges an exact insert-only import before streaming its next revision',async()=>{
 transport.mockReset(); owner.id=1;
 const initial={id:'import-then-stream',role:'assistant',content:'',status:'streaming'};
 transport.mockResolvedValueOnce(response({messages:[{...initial,historyRevision:1}],deletedMessageIds:[]}));
 await importChatHistory(binding,[initial]);
 transport.mockImplementationOnce(async(_url,init)=>{
  const next=JSON.parse(init.body);
  expect(next.historyRevision).toBe(1);
  return response({message:{...next,historyRevision:2},revision:2});
 });
 await saveChatHistoryMessage(binding,{...initial,content:'Completed answer'});
});
it('does not acknowledge a different payload returned by an insert-only import',async()=>{
 transport.mockReset(); owner.id=1;
 const initial={id:'import-other-tab',role:'assistant',content:'old'};
 transport.mockResolvedValueOnce(response({messages:[{...initial,content:'newer',historyRevision:9}],deletedMessageIds:[]}));
 await importChatHistory(binding,[initial]);
 transport.mockResolvedValueOnce(response({code:'pixflow_history_conflict',message:'Conflict'},409));
 await expect(saveChatHistoryMessage(binding,{...initial,content:'stale edit'})).rejects.toThrow('Conflict');
 expect(JSON.parse(transport.mock.calls[1]![1].body).historyRevision).toBe(0);
});

it('recovers a legacy Bricks display-only cache of an identical saved terminal reply without rewriting it',async()=>{
 transport.mockReset();owner.id=1;
 const saved={id:'legacy-display',role:'assistant',content:'Complete',createdAt:1,endedAt:2,status:'complete',runStatus:'succeeded',awaitingInput:false,events:[{kind:'tool_use',input:{settings:{text:'preserved'}}}],historyRevision:7};
 const incoming={id:saved.id,role:saved.role,content:saved.content,createdAt:1,startedAt:1,endedAt:2,status:'complete',runStatus:'succeeded',events:[{kind:'tool_use',input:{settings:{}}}],provenance:'session_restore_v2',attachments:[]};
 transport.mockResolvedValue(response({code:'pixflow_history_conflict',message:'Conflict',data:{message:saved}},409));
 await expect(saveChatHistoryMessage(binding,incoming)).resolves.toEqual(saved);
 expect(transport).toHaveBeenCalledTimes(1);
});
it.each(['content','events','attachment','metadata'])('does not discard a real %s difference as legacy display metadata',async field=>{
 transport.mockReset();owner.id=1;
 const saved={id:`legacy-difference-${field}`,role:'assistant',content:'Complete',createdAt:1,endedAt:2,status:'complete',runStatus:'succeeded',events:[],historyRevision:7};
 const incoming:Record<string,any>={...saved,historyRevision:0,provenance:'session_restore_v2'};
 if(field==='content')incoming.content='Different';
 if(field==='events')incoming.events=[{kind:'text',text:'Different'}];
 if(field==='attachment')incoming.attachments=[{path:'keep.png'}];
 if(field==='metadata')incoming.runId='different-run';
 transport.mockResolvedValue(response({code:'pixflow_history_conflict',message:'Conflict',data:{message:saved}},409));
 await expect(saveChatHistoryMessage(binding,incoming)).rejects.toThrow('Conflict');
 expect(transport).toHaveBeenCalledTimes(1);
});
it('acknowledges legacy user display defaults without changing the stored user message',async()=>{
 transport.mockReset();owner.id=1;
 const saved={id:'legacy-user',role:'user',content:'Keep my request',createdAt:1,commentAttachments:[],historyRevision:1};
 const incoming={...saved,historyRevision:0,provenance:'session_restore_v2',startedAt:1,endedAt:42,status:'complete',runStatus:'succeeded',sessionMode:'design',events:[],attachments:[]};
 transport.mockResolvedValue(response({code:'pixflow_history_conflict',message:'Conflict',data:{message:saved}},409));
 await expect(saveChatHistoryMessage(binding,incoming)).resolves.toEqual(saved);
 expect(transport).toHaveBeenCalledTimes(1);
});

it.each(['session_restore_v2', 'device_restore_v2'].flatMap(provenance => ['failed', 'interrupted'].map(runStatus => [provenance, runStatus])))('recovers %s %s terminal display snapshots with omitted events', async (provenance, runStatus) => {
 transport.mockReset(); owner.id=1;
 const saved={id:`empty-events-${provenance}`,role:'assistant',content:'Complete reply',createdAt:1,endedAt:2,status:'complete',runStatus,events:[{kind:'tool_use',input:{text:'retain all details'}}],historyRevision:31};
 const incoming={...saved,historyRevision:0,events:[],provenance,startedAt:1,attachments:[]};
 transport.mockResolvedValue(response({code:'pixflow_history_conflict',message:'Conflict',data:{message:saved}},409));
 await expect(saveChatHistoryMessage(binding,incoming)).resolves.toEqual(saved);
 expect(transport).toHaveBeenCalledTimes(1);
});
it.each(['running', 'unknown-provenance', 'different-content'])('does not accept omitted events for %s', async scenario => {
 transport.mockReset(); owner.id=1;
 const saved={id:`empty-events-reject-${scenario}`,role:'assistant',content:'Reply',status:'complete',runStatus:scenario==='running'?'running':'succeeded',events:[{kind:'tool_use',input:{text:'keep'}}],historyRevision:31};
 const incoming={...saved,historyRevision:0,events:[],provenance:scenario==='unknown-provenance'?'other':'session_restore_v2',content:scenario==='different-content'?'Edited reply':saved.content};
 transport.mockResolvedValue(response({code:'pixflow_history_conflict',message:'Conflict',data:{message:saved}},409));
 await expect(saveChatHistoryMessage(binding,incoming)).rejects.toThrow('Conflict');
 expect(transport).toHaveBeenCalledTimes(1);
});

it('does not overwrite durable events after an exact import acknowledged revision zero', async()=>{
 transport.mockReset(); owner.id=1;
 const saved={id:'warm-restore',role:'assistant',content:'Complete',runStatus:'succeeded',events:[{kind:'tool_use',input:{keep:true}}],historyRevision:1};
 transport.mockResolvedValueOnce(response({messages:[saved],deletedMessageIds:[]}));
 await importChatHistory(binding,[{...saved,historyRevision:undefined}]);
 transport.mockImplementation(async(_url,init)=>{
  if(init.method==='POST')return response({messages:[saved],deletedMessageIds:[]});
  const sent=JSON.parse(init.body);return response({message:{...sent,historyRevision:2},revision:2});
 });
 const restored=await saveChatHistoryMessage(binding,{...saved,historyRevision:0,events:[],provenance:'session_restore_v2'});
 expect(restored).toEqual(saved);
 expect(transport.mock.calls.some(([,init])=>init.method==='PUT')).toBe(false);
});

it('keeps a genuinely different restored reply pending without overwriting the canonical reply', async()=>{
 transport.mockReset(); owner.id=1;
 const saved={id:'restore-real-conflict',role:'assistant',content:'Newer reply',runStatus:'succeeded',events:[],historyRevision:9};
 transport.mockResolvedValue(response({messages:[saved],deletedMessageIds:[]}));
 await expect(saveChatHistoryMessage(binding,{...saved,content:'Unsaved different reply',historyRevision:0,provenance:'session_restore_v2'})).rejects.toThrow('newer saved version');
 expect(transport).toHaveBeenCalledTimes(1);
 expect(transport.mock.calls[0]![1].method).toBe('POST');
 expect(JSON.parse(transport.mock.calls[0]![1].body).importOnly).toBe(true);
});

it('does not recreate a deleted message from a restore snapshot', async()=>{
 transport.mockReset(); owner.id=1;
 transport.mockResolvedValue(response({messages:[],deletedMessageIds:['restore-deleted']}));
 await expect(saveChatHistoryMessage(binding,{id:'restore-deleted',role:'assistant',content:'Old reply',provenance:'device_restore_v2'})).rejects.toThrow('no longer available');
 expect(transport).toHaveBeenCalledTimes(1);
 expect(transport.mock.calls[0]![1].method).toBe('POST');
});

it.each(['session_restore_v2', 'device_restore_v2'])('recovers coalesced text chunks from %s without changing durable events', async provenance => {
 transport.mockReset(); owner.id=1;
 const start={kind:'assistant_message_boundary',phase:'started'};
 const end={kind:'assistant_message_boundary',phase:'completed'};
 const saved={id:`coalesced-${provenance}`,role:'assistant',content:'Hello world',runStatus:'succeeded',events:[start,{kind:'text',text:'Hello'},{kind:'text',text:' world'},end],historyRevision:3};
 const incoming={...saved,historyRevision:0,provenance,events:[start,{kind:'text',text:'Hello world'},end]};
 transport.mockResolvedValue(response({messages:[saved],deletedMessageIds:[]}));
 await expect(saveChatHistoryMessage(binding,incoming)).resolves.toEqual(saved);
 expect(transport).toHaveBeenCalledTimes(1);
 expect(transport.mock.calls[0]![1].method).toBe('POST');
 expect(saved.events).toHaveLength(4);
});

it.each(['different-text','intervening-tool','text-metadata'])('does not coalesce away a %s conflict', async scenario => {
 transport.mockReset(); owner.id=1;
 const events:Record<string,unknown>[]=[{kind:'text',text:'Hello'},{kind:'text',text:' world'}];
 if(scenario==='intervening-tool')events.splice(1,0,{kind:'tool_use',name:'read'});
 if(scenario==='text-metadata')events[0]!.channel='analysis';
 const saved={id:`coalesced-reject-${scenario}`,role:'assistant',content:'Hello world',runStatus:'succeeded',events,historyRevision:3};
 const incoming={...saved,historyRevision:0,provenance:'session_restore_v2',events:[{kind:'text',text:scenario==='different-text'?'Different':'Hello world'}]};
 transport.mockResolvedValue(response({messages:[saved],deletedMessageIds:[]}));
 await expect(saveChatHistoryMessage(binding,incoming)).rejects.toThrow('newer saved version');
 expect(transport).toHaveBeenCalledTimes(1);
});

it.each(['session_restore_v2','device_restore_v2'])('acknowledges inferred completion in %s without completing the saved run', async provenance => {
 transport.mockReset(); owner.id=1;
 const saved={id:`interrupted-${provenance}`,role:'assistant',content:'Retained reply',createdAt:1,status:'streaming',runStatus:'running',events:[{kind:'tool_use',name:'read',input:{keep:true}}],historyRevision:78};
 const incoming={...saved,historyRevision:0,provenance,startedAt:1,endedAt:10,status:'complete',runStatus:'succeeded',events:[]};
 transport.mockResolvedValue(response({messages:[saved],deletedMessageIds:[]}));
 await expect(saveChatHistoryMessage(binding,incoming)).resolves.toEqual(saved);
 expect(transport).toHaveBeenCalledTimes(1);
 expect(transport.mock.calls[0]![1].method).toBe('POST');
 expect(saved.runStatus).toBe('running');
 expect(saved.events).toHaveLength(1);
});

it.each(['changed-content','changed-run','terminal-saved'])('rejects inferred completion with %s', async scenario => {
 transport.mockReset(); owner.id=1;
 const saved={id:`interrupted-reject-${scenario}`,role:'assistant',content:'Retained reply',status:'streaming',runStatus:scenario==='terminal-saved'?'failed':'running',runId:'original',events:[],historyRevision:78};
 const incoming={...saved,historyRevision:0,provenance:'session_restore_v2',endedAt:10,status:'complete',runStatus:'succeeded',content:scenario==='changed-content'?'Unsaved edit':saved.content,runId:scenario==='changed-run'?'other':saved.runId};
 transport.mockResolvedValue(response({messages:[saved],deletedMessageIds:[]}));
 await expect(saveChatHistoryMessage(binding,incoming)).rejects.toThrow('newer saved version');
 expect(transport).toHaveBeenCalledTimes(1);
});

it('saves the exact native event continuation after losing the envelope revision', async()=>{
 transport.mockReset(); owner.id=1;
 const boundary={kind:'assistant_message_boundary',runId:'native-run',sequence:4};
 const saved={id:'native-recovered',role:'assistant',content:'First',status:'streaming',runStatus:'running',events:[boundary],historyRevision:78};
 const next={...saved,historyRevision:0,content:'First and last',status:'error',runStatus:'interrupted',endedAt:20,events:[boundary,{...boundary,sequence:10}]};
 transport.mockResolvedValueOnce(response({code:'pixflow_history_conflict',message:'Conflict',data:{message:saved}},409));
 transport.mockImplementationOnce(async(_url,init)=>{
  const sent=JSON.parse(init.body); expect(sent.historyRevision).toBe(78);
  expect(sent.events).toEqual(next.events);
  return response({message:{...sent,historyRevision:79},revision:79});
 });
 await expect(saveChatHistoryMessage(binding,next)).resolves.toMatchObject({content:'First and last',historyRevision:79,runStatus:'interrupted'});
 expect(transport).toHaveBeenCalledTimes(2);
});
it.each(['event-edit','other-run','no-progress','newer-terminal','second-conflict'])('protects native recovery against %s',async scenario=>{
 transport.mockReset();owner.id=1;
 const boundary={kind:'assistant_message_boundary',runId:'native-run',sequence:4};
 const saved={id:`native-reject-${scenario}`,role:'assistant',content:'First',status:'streaming',runStatus:scenario==='newer-terminal'?'succeeded':'running',events:[boundary],historyRevision:78};
 const next={...saved,historyRevision:0,content:'First and last',runStatus:'interrupted',events:[scenario==='event-edit'?{...boundary,sequence:3}:boundary,{...boundary,runId:scenario==='other-run'?'other':'native-run',sequence:scenario==='no-progress'?4:10}]};
 transport.mockImplementation(async()=>response({code:'pixflow_history_conflict',message:'Conflict',data:{message:saved}},409));
 await expect(saveChatHistoryMessage(binding,next)).rejects.toThrow('Conflict');
 expect(transport).toHaveBeenCalledTimes(scenario==='second-conflict'?2:1);
});


it.each(['user','assistant'])('acknowledges an unversioned %s outbox row already saved with legacy display metadata', async role => {
 transport.mockReset(); owner.id=1;
 const pending={id:`raw-${role}`,role,content:'Retained content',createdAt:100,...(role==='user'?{commentAttachments:[]}:{status:'error',runStatus:'failed',endedAt:200,events:[{kind:'text',text:'Retained content'}]})};
 const saved={...pending,commentAttachments:undefined,historyRevision:1,historySequence:12,provenance:'floating_panel_live_v2',authority:'fluency_only',startedAt:100,...(role==='user'?{endedAt:200,status:'complete',events:[],sessionMode:'design',awaitingInput:false}:{})};
 transport.mockResolvedValue(response({code:'pixflow_history_conflict',message:'Conflict',data:{message:saved}},409));
 await expect(saveChatHistoryMessage(binding,pending)).resolves.toEqual(saved);
 expect(transport).toHaveBeenCalledTimes(1);
});
it.each(['content','events','run','revision','attachment'])('rejects changed %s in an unversioned legacy live replay',async field=>{
 transport.mockReset(); owner.id=1;
 const pending:Record<string,unknown>={id:`raw-reject-${field}`,role:'assistant',content:'Original',createdAt:100,runId:'run',status:'complete',runStatus:'succeeded',events:[{kind:'text',text:'Original'}]};
 const saved={...pending,historyRevision:7,provenance:'floating_panel_live_v2',authority:'fluency_only',startedAt:100};
 if(field==='content')pending.content='Changed';
 if(field==='events')pending.events=[];
 if(field==='run')pending.runId='another';
 if(field==='revision')pending.historyRevision=2;
 if(field==='attachment')pending.attachments=[{id:123}];
 transport.mockResolvedValue(response({code:'pixflow_history_conflict',message:'Conflict',data:{message:saved}},409));
 await expect(saveChatHistoryMessage(binding,pending)).rejects.toThrow('Conflict');
 expect(transport).toHaveBeenCalledTimes(1);
});

it.each(['same','changed-text','changed-status','explicit-empty-events'])('handles event-less recovery projection: %s',async scenario=>{
 transport.mockReset();owner.id=1;
 const saved={id:`lost-events-${scenario}`,role:'assistant',content:'Preserved',status:'error',runStatus:'failed',historyRevision:4,events:[{kind:'text',text:'Preserved'}]};
 const {events,...prior}=saved;
 const pending={...prior,historyRevision:1,...(scenario==='changed-text'?{content:'Different'}:{}),...(scenario==='changed-status'?{runStatus:'succeeded'}:{}),...(scenario==='explicit-empty-events'?{events:[]}: {})};
 transport.mockResolvedValue(response({code:'pixflow_history_conflict',message:'Conflict',data:{message:saved}},409));
 if(scenario==='same')await expect(saveChatHistoryMessage(binding,pending)).resolves.toEqual(saved);
 else await expect(saveChatHistoryMessage(binding,pending)).rejects.toThrow('Conflict');
 expect(transport).toHaveBeenCalledTimes(1);
});

it('never grants an event-less replay the newer write revision',async()=>{
 transport.mockReset();owner.id=1;
 const saved={id:'eventless-twice',role:'assistant',content:'Keep',runStatus:'failed',historyRevision:4,events:[{kind:'text',text:'Keep'}]};
 const {events,...old}=saved;const pending={...old,historyRevision:1};
 transport.mockImplementation(async()=>response({code:'pixflow_history_conflict',message:'Conflict',data:{message:saved}},409));
 await saveChatHistoryMessage(binding,pending);await saveChatHistoryMessage(binding,pending);
 expect(transport.mock.calls.map(([,init])=>JSON.parse(init.body).historyRevision)).toEqual([1,1]);
});

it.each(['prefix','edited'])('handles legacy clipped tool-result strings: %s',async scenario=>{
 transport.mockReset();owner.id=1;
 const saved={id:`clipped-result-${scenario}`,role:'assistant',content:'Done',runStatus:'succeeded',events:[{kind:'tool_result',content:'a'.repeat(6000)}],historyRevision:9};
 const pending={...saved,historyRevision:0,provenance:'session_restore_v2',events:[{kind:'tool_result',content:(scenario==='prefix'?'a':'b').repeat(4000)}]};
 transport.mockResolvedValue(response({messages:[saved]},200));
 if(scenario==='prefix')await expect(saveChatHistoryMessage(binding,pending)).resolves.toEqual(saved);
 else await expect(saveChatHistoryMessage(binding,pending)).rejects.toThrow('newer saved version');
 expect(transport).toHaveBeenCalledTimes(1);
});
