// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readWorkspaceFirstTurn, stageWorkspaceFirstTurn, clearWorkspaceFirstTurn } from '../../src/components/workspace-first-turn';

afterEach(() => { clearWorkspaceFirstTurn('chat-1'); sessionStorage.clear(); });
describe('workspace first-turn handoff', () => {
  it('carries a voice start only in memory and never restarts audio from saved state', () => {
    const turn = { prompt: 'Voice conversation', attachments: [], comments: [], sessionMode: 'chat' as const, startVoice: true };
    stageWorkspaceFirstTurn('chat-1', turn);
    expect(readWorkspaceFirstTurn('chat-1')?.startVoice).toBe(true);
    const saved = sessionStorage.getItem('pixflow:workspace-first-turn:chat-1')!;
    clearWorkspaceFirstTurn('chat-1');
    sessionStorage.setItem('pixflow:workspace-first-turn:chat-1', saved);
    expect(readWorkspaceFirstTurn('chat-1')).toMatchObject({ autoSend: false });
    expect(readWorkspaceFirstTurn('chat-1')?.startVoice).toBeUndefined();
  });
  it('preserves every shared-composer selection and attachment', () => {
    const turn = { prompt: 'Improve this page', attachments: [{ path: 'a.png', name: 'a.png', kind: 'image' as const }], comments: [], meta: { skillIds: ['motion'], context: { connectorIds: ['github'], mcpServerIds: ['figma'] } }, sessionMode: 'plan' as const };
    stageWorkspaceFirstTurn('chat-1', turn);
    expect(readWorkspaceFirstTurn('chat-1')).toEqual(turn);
    clearWorkspaceFirstTurn('chat-1');
    expect(readWorkspaceFirstTurn('chat-1')).toBeNull();
  });
  it('keeps in-memory delivery when browser storage fails', () => {
    const turn = { prompt: '', attachments: [], comments: [], meta: { skillIds: ['typography'] }, sessionMode: 'design' as const };
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('storage blocked'); };
    try { stageWorkspaceFirstTurn('chat-1', turn); } finally { Storage.prototype.setItem = original; }
    expect(readWorkspaceFirstTurn('chat-1')).toEqual(turn);
  });
  it('rejects malformed persisted payloads', () => {
    sessionStorage.setItem('pixflow:workspace-first-turn:chat-1', '{"prompt":123}');
    expect(readWorkspaceFirstTurn('chat-1')).toBeNull();
  });
});
