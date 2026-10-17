// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { save, config } = vi.hoisted(() => ({ save: vi.fn(), config: {siteHash:'site',userId:1} }));
vi.mock('../../src/pixflow/chat-history-client', () => ({saveChatHistoryMessage:save}));
vi.mock('../../src/pixflow/wordpress-context', () => ({getPixflowWordPressConfig:()=>config}));
import {queueWorkspaceHistoryMessage,retryWorkspaceHistoryWrites,workspaceHistoryWriteFailed,workspaceHistoryPendingMessages} from '../../src/state/workspace-history-persistence';

describe('Workspace durable write outbox', () => {
  beforeEach(() => { localStorage.clear(); save.mockReset(); config.userId=1; });
  afterEach(() => vi.restoreAllMocks());
  it('does not show a failed-save warning while a quota-blocked recovery copy is being saved to WordPress', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    let resolve!: (value: unknown) => void;
    save.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const message = { id: 'quota', role: 'user' as const, content: 'Preserve me' };
    const task = queueWorkspaceHistoryMessage('quota-ok', 'chat', message);
    expect(workspaceHistoryWriteFailed('quota-ok', 'chat')).toBe(false);
    expect(workspaceHistoryPendingMessages('quota-ok', 'chat')).toEqual([message]);
    resolve({ ...message, historyRevision: 1 }); await task;
    expect(workspaceHistoryWriteFailed('quota-ok', 'chat')).toBe(false);
    save.mockRejectedValueOnce(new Error('offline'));
    await queueWorkspaceHistoryMessage('quota-failed', 'chat', message);
    expect(workspaceHistoryWriteFailed('quota-failed', 'chat')).toBe(true);
    expect(workspaceHistoryPendingMessages('quota-failed', 'chat')).toEqual([message]);
  });
  it('retains a failed write and clears its recovery copy only after acknowledgement', async () => {
    const message={id:'a',role:'user' as const,content:'Keep all of this'};
    save.mockRejectedValueOnce(new Error('offline'));
    await queueWorkspaceHistoryMessage('p1','c1',message);
    expect(workspaceHistoryWriteFailed('p1','c1')).toBe(true);
    expect(workspaceHistoryPendingMessages('p1','c1')).toEqual([message]);
    expect(Object.keys(localStorage)).toHaveLength(1);
    save.mockResolvedValueOnce({...message,historyRevision:1});
    await retryWorkspaceHistoryWrites('p1','c1');
    expect(workspaceHistoryWriteFailed('p1','c1')).toBe(false);
    expect(Object.keys(localStorage)).toHaveLength(0);
  });
  it('does not delete a newer streaming snapshot when an earlier write completes', async () => {
    let resolve!: (value: unknown)=>void;
    save.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
    const first=queueWorkspaceHistoryMessage('p2','c2',{id:'a',role:'assistant',content:'First'});
    await queueMicrotaskPromise();
    void queueWorkspaceHistoryMessage('p2','c2',{id:'a',role:'assistant',content:'Complete',runStatus:'succeeded'});
    save.mockImplementationOnce(async (_b,m)=>({...m,historyRevision:2}));
    resolve({id:'a',role:'assistant',content:'First',historyRevision:1}); await first;
    expect(save).toHaveBeenLastCalledWith({projectId:'p2',conversationId:'c2'},expect.objectContaining({content:'Complete',historyRevision:1}));
    expect(workspaceHistoryPendingMessages('p2','c2')).toEqual([]);
  });
  it('keeps a stale-tab conflict for explicit recovery rather than overwriting the server', async () => {
    save.mockRejectedValue(new Error('conflict'));
    await queueWorkspaceHistoryMessage('p3','c3',{id:'a',role:'assistant',content:'old',historyRevision:1});
    await retryWorkspaceHistoryWrites('p3','c3');
    expect(save).toHaveBeenLastCalledWith(expect.anything(),expect.objectContaining({historyRevision:1}));
    expect(workspaceHistoryWriteFailed('p3','c3')).toBe(true);
    config.userId=2;
    await retryWorkspaceHistoryWrites('p3','c3');
    expect(workspaceHistoryPendingMessages('p3','c3')).toEqual([]);
    expect(save).toHaveBeenCalledTimes(2);
  });
  it('stops draining the previous account outbox when the signed-in account changes', async () => {
    let resolve!: (value: unknown)=>void;
    save.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
    const first=queueWorkspaceHistoryMessage('account-switch','chat',{id:'first',role:'user',content:'Previous account'});
    await queueMicrotaskPromise();
    void queueWorkspaceHistoryMessage('account-switch','chat',{id:'second',role:'user',content:'Do not send as another account'});
    config.userId=2;
    resolve({id:'first',role:'user',content:'Previous account',historyRevision:1});
    await first;
    expect(save).toHaveBeenCalledTimes(1);
    expect(workspaceHistoryPendingMessages('account-switch','chat')).toEqual([]);
    config.userId=1;
    expect(workspaceHistoryPendingMessages('account-switch','chat').map(item=>item.id)).toEqual(['second']);
    expect(Object.keys(localStorage)).toHaveLength(1);
  });
});
function queueMicrotaskPromise() { return new Promise<void>(resolve=>queueMicrotask(resolve)); }
