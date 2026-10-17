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
