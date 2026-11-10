import { webcrypto } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ owner: 'one', resolve: vi.fn(), import: vi.fn(), read: vi.fn() }));
vi.mock('../../src/pixflow/chat-history-client', () => ({
  chatHistoryOwnerScope: () => state.owner,
  historyMessageFingerprint: (value: Record<string, unknown>) => { const {historyRevision, historySequence, ...payload} = value; return JSON.stringify(payload); },
  resolveChatHistory: state.resolve, importChatHistory: state.import, readChatHistory: state.read,
}));
import { historicalRecoveryCopy, preserveHistoryCopies } from '../../src/pixflow/history-recovery';
const source = {projectId:'source',conversationId:'chat'};
const copy = {id:'same-id',role:'assistant',content:'A complete different reply',status:'complete',historyRevision:2};
it('preserves archived streaming payloads without treating them as active runs', async () => {
  const original={...copy,status:'streaming',runStatus:'running',resumable:true,events:[{kind:'text_delta',text:'Partial'}]};
  const archived=historicalRecoveryCopy(original);
  expect(archived.historyRecoverySnapshot).toEqual(original);
  expect(archived.status).toBe('complete');
  expect(archived.runStatus).toBe('interrupted');
  expect(archived.resumable).toBe(false);
  state.import.mockResolvedValue({messages:[archived]}); state.read.mockResolvedValue({messages:[archived]});
  await preserveHistoryCopies(source,[archived],'Recovery');
  expect(state.import).toHaveBeenCalledWith(expect.anything(),[archived]);
  expect(historicalRecoveryCopy(original)).toEqual(archived);
});
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto); state.owner = 'one'; vi.clearAllMocks();
  state.resolve.mockResolvedValue({projectId:'recovery',conversationId:'copy'});
  state.import.mockResolvedValue({messages:[copy],deletedMessageIds:[]});
  state.read.mockResolvedValue({messages:[copy],hasMore:false,nextCursor:null});
});
it('preserves exact content in an idempotent private copy without writing the original', async () => {
  await preserveHistoryCopies(source,[copy],'Recovered history');
  await preserveHistoryCopies(source,[copy],'Recovered history');
  expect(state.resolve.mock.calls[0]).toEqual(state.resolve.mock.calls[1]);
  expect(state.resolve.mock.calls[0]![0].sessionKey).toMatch(/^history-recovery:[a-f0-9]{64}$/);
  expect(state.import).toHaveBeenCalledWith({projectId:'recovery',conversationId:'copy'},[copy]);
});
it('assigns different recovery identities to genuinely different versions', async () => {
  await preserveHistoryCopies(source,[copy],'Recovery');
  const other={...copy,content:'Other complete version'};
  state.import.mockResolvedValue({messages:[other]}); state.read.mockResolvedValue({messages:[other]});
  await preserveHistoryCopies(source,[other],'Recovery');
  expect(state.resolve.mock.calls[0]![0].sessionKey).not.toEqual(state.resolve.mock.calls[1]![0].sessionKey);
});
it.each(['import','read'])('rejects a mismatched %s response without acknowledging recovery', async method => {
  state[method as 'import'|'read'].mockResolvedValue({messages:[{...copy,content:'Wrong version'}]});
  await expect(preserveHistoryCopies(source,[copy],'Recovery')).rejects.toThrow();
});
it('stops before copying a live reply', async () => {
  const live = {...copy,status:'streaming'};
  await expect(preserveHistoryCopies(source,[live],'Recovery')).rejects.toThrow();
  expect(state.import).not.toHaveBeenCalled();
});
it('does not continue after the account changes', async () => {
  state.resolve.mockImplementation(async () => { state.owner='two'; return source; });
  await expect(preserveHistoryCopies(source,[copy],'Recovery')).rejects.toThrow();
  expect(state.import).not.toHaveBeenCalled();
});
