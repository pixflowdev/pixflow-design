// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { persistMessages, restoreMessages, readRawWpAdminHistory } from '../../src/pixflow/WpAdminAgentFrameApp';
import { builderHandoffConversationKey } from '../../src/pixflow/builder-handoff-receiver';

it('replaces a stale running shared transcript with completed text when tool events exceed quota', () => {
  const key = 'pixflow-direct:quota-site:1';
  localStorage.setItem(key, JSON.stringify([{ id: 'run', role: 'assistant', content: 'Starting', status: 'streaming', runStatus: 'running' }]));
  const original = Storage.prototype.setItem;
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) {
    if (this === localStorage && name === key && value.length > 1000) throw new DOMException('Full', 'QuotaExceededError');
    return original.call(this, name, value);
  });
  try {
    persistMessages(key, [{ id: 'run', role: 'assistant', content: 'Saved the completed page.', status: 'complete', runStatus: 'succeeded', events: [{ kind: 'text', text: 'x'.repeat(2000) }] }], undefined, true);
    sessionStorage.clear(); // A new tab has no owner-tab recovery record.
    expect(restoreMessages(key)).toMatchObject([{ id: 'run', content: 'Saved the completed page.', status: 'complete', runStatus: 'succeeded' }]);
  } finally { write.mockRestore(); }
});
import { directTabStorageKey } from '../../src/pixflow/direct-tab-storage';

afterEach(()=>{vi.restoreAllMocks();sessionStorage.clear();localStorage.clear();});
it.each([false,true])('does not terminate another tab’s run after an observer reload (tab copy: %s)',tabCopy=>{
 const key='pixflow-direct:other-tab:1';
 const rows=[{id:'remote',role:'assistant',content:'',status:'streaming',runStatus:'running',events:[],historyRevision:4}];
 localStorage.setItem(key,JSON.stringify(rows));
 if(tabCopy)sessionStorage.setItem(`pixflow:admin-transcript:${key}`,JSON.stringify(rows));
 expect(restoreMessages(key)).toEqual(rows);
});
describe('Direct admin transcript durability',()=>{
  it.each(['etch', 'elementor'] as const)('keeps a %s handoff transcript separate from concurrent ordinary panel writes and recovers its run', builder => {
    const base = 'pixflow-direct:fixture-site:1';
    const surface = `admin-handoff:${'a'.repeat(64)}:tab-1234567890123456`;
    const key = builderHandoffConversationKey(base, surface, builder);
    persistMessages(base, [{ id: 'personal', role: 'user', content: 'Keep this original conversation' }]);
    persistMessages(key, [{ id: 'handoff-run', role: 'assistant', content: 'Building the page', status: 'streaming', runStatus: 'running' }]);
    persistMessages(base, [{ id: 'personal', role: 'user', content: 'Keep this original conversation' }, { id: 'other', role: 'assistant', content: 'An unrelated answer', status: 'complete' }]);
    sessionStorage.clear(); // Recover from durable storage after a page reload/new tab.
    sessionStorage.setItem(directTabStorageKey(`pixflow:direct-bricks-run:${surface}`), JSON.stringify({
      connection: { id: 'a'.repeat(32), token: 'b'.repeat(64) },
      metadata: { sessionKey: key, messageId: 'handoff-run', messages: [] },
    }));
    expect(restoreMessages(key, surface)).toMatchObject([{ id: 'handoff-run', content: 'Building the page', status: 'streaming', runStatus: 'running' }]);
    expect(restoreMessages(base)).toMatchObject([{ id: 'personal', content: 'Keep this original conversation' }, { id: 'other', content: 'An unrelated answer' }]);
    persistMessages(key, [{ id: 'handoff-run', role: 'assistant', content: 'Page complete', status: 'complete', runStatus: 'succeeded' }]);
    expect(restoreMessages(key, surface)).toMatchObject([{ content: 'Page complete', runStatus: 'succeeded' }]);
    expect(restoreMessages(base)).toHaveLength(2);
  });
  it('keeps Bridge browser history lightweight and API diagnostics until quota requires purging',()=>{
    const messages=[{id:'done',role:'assistant' as const,content:'Saved.',status:'complete' as const,events:[{kind:'tool_result' as const,toolUseId:'x',content:'Full diagnostic'}]}];
    persistMessages('pixflow-direct:bridge:1',messages,'daemon',true);
    expect(JSON.parse(localStorage.getItem('pixflow-direct:bridge:1')!)[0].events).toEqual([]);
    persistMessages('pixflow-direct:api:1',messages,'api');
    expect(JSON.parse(localStorage.getItem('pixflow-direct:api:1')!)[0].events).toEqual(messages[0]!.events);
  });
  it('keeps the complete unacknowledged transcript and raw interrupted event payload for migration',()=>{
    const key='pixflow-direct:unacknowledged:1';
    const messages=Array.from({length:125},(_,index)=>({id:`raw-${index}`,role:'assistant',content:'Full answer '.repeat(1000),status:'streaming',events:[{kind:'tool_result',content:'Complete diagnostic'}]}));
    persistMessages(key,messages,'daemon');
    expect(readRawWpAdminHistory(key)).toEqual(messages);
    persistMessages(key,messages,'daemon',true);
    expect(readRawWpAdminHistory(key)).toHaveLength(50);
  });
  it('retains real question forms across reload in Direct conversations',()=>{
    const key='pixflow-direct:fixture-site:1';
    const content='Choose a colour.\n<question-form>{"id":"choice","questions":[]}</question-form>';
    persistMessages(key,[{id:'question',role:'assistant',content,status:'complete',runStatus:'succeeded'}]);
    expect(restoreMessages(key)[0]?.content).toBe(content);
  });
  it('restores the current tab transcript when shared browser storage is full',()=>{
    const key='pixflow-direct:fixture-site:1';
    localStorage.setItem(key,JSON.stringify([{id:'old',role:'assistant',content:'Older answer',status:'complete'}]));
    const original=Storage.prototype.setItem;
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,name,value){
      if(this===localStorage)throw new DOMException('Full','QuotaExceededError');original.call(this,name,value);
    });
    persistMessages(key,[{id:'new',role:'assistant',content:'Current answer',status:'complete',runStatus:'succeeded'}]);
    expect(restoreMessages(key)).toMatchObject([{id:'new',content:'Current answer',runStatus:'succeeded'}]);
  });
  it('does not infer a terminal state from a transcript without its owning run receipt',()=>{
    const key='pixflow-direct:fixture-site:1';
    persistMessages(key,[{id:'running',role:'assistant',content:'Partial answer',status:'streaming',runStatus:'running'}]);
    expect(restoreMessages(key)).toMatchObject([{id:'running',content:'Partial answer',runStatus:'running'}]);
  });
  it('keeps a resumable run nonterminal while the panel reconnects',()=>{
    const key='pixflow-direct:fixture-site:1';
    persistMessages(key,[{id:'running',role:'assistant',content:'Partial answer',status:'streaming',runStatus:'running'}]);
    sessionStorage.setItem(directTabStorageKey('pixflow:direct-bricks-run:admin'),JSON.stringify({
      connection:{id:'a'.repeat(32),token:'b'.repeat(64)},
      metadata:{sessionKey:key,messageId:'running',messages:[]},
    }));
    const restored=restoreMessages(key)[0];
    expect(restored).toMatchObject({status:'streaming',runStatus:'running'});
    expect(restored?.endedAt).toBeUndefined();
    expect(restored?.events).toContainEqual({kind:'status',label:'Reconnecting…'});
    expect(restored?.events).not.toContainEqual({kind:'status',label:'interrupted'});
    expect(restoreMessages('pixflow-direct:another-site:1')).toEqual([]);
  });
  it('does not leak a tab fallback to another user or site',()=>{
    persistMessages('pixflow-direct:site-one:1',[{id:'mine',role:'assistant',content:'Owned answer',status:'complete'}]);
    expect(restoreMessages('pixflow-direct:site-one:2')).toEqual([]);
    expect(restoreMessages('pixflow-direct:site-two:1')).toEqual([]);
  });
  it.each(['other-owner','completed'] as const)('does not reconnect %s pending data',scenario=>{
    const key='pixflow-direct:fixture-site:1';
    persistMessages(key,[{id:'running',role:'assistant',content:'Partial answer',status:'streaming',runStatus:'running'}]);
    sessionStorage.setItem(directTabStorageKey('pixflow:direct-bricks-run:admin'),JSON.stringify({
      connection:{id:'a'.repeat(32),token:'b'.repeat(64)},
      metadata:{sessionKey:scenario==='other-owner'?'pixflow-direct:another-site:1':key,messageId:'running',messages:[]},
      ...(scenario==='completed'?{checkpoint:{outcome:'succeeded'}}:{}),
    }));
    expect(restoreMessages(key)[0]).toMatchObject({runStatus:scenario==='other-owner'?'running':'interrupted'});
    if(scenario==='completed')expect(restoreMessages(key)[0]?.status).not.toBe('streaming');
  });
});

it('restores a Bricks-owned active reply in the admin renderer after navigation', async () => {
  const { rememberFloatingConversation, floatingRunStorageKey } = await import('../../src/pixflow/floating-conversation');
  const key='bricks:cross-editor-task';
  rememberFloatingConversation(key,'bricks');
  sessionStorage.setItem(floatingRunStorageKey('bricks'),JSON.stringify({
    connection:{id:'a'.repeat(32),token:'b'.repeat(64)},
    metadata:{sessionKey:key,initial:[{id:'user',role:'user',content:'Update the ACF fields'},{id:'reply',role:'assistant',content:'Inspecting fields',status:'streaming',runStatus:'running',agentId:'codex'}],id:'reply',agentId:'codex'},
  }));
  expect(restoreMessages(key,'bricks')).toMatchObject([{id:'user',content:'Update the ACF fields'},{id:'reply',content:'Inspecting fields',status:'streaming',runStatus:'running'}]);
  expect(readRawWpAdminHistory('pixflow-direct:unrelated:1')).toEqual([]);
});
