import { beforeEach, expect, it, vi } from 'vitest';
import { fetchChatRunStatus, reattachDaemonRun } from '../../src/providers/daemon';
import { recoverCompletedWorkspaceRun } from '../../src/pixflow/completed-workspace-run';
vi.mock('../../src/providers/daemon', () => ({ fetchChatRunStatus: vi.fn(), reattachDaemonRun: vi.fn() }));
const binding = { projectId: 'p', conversationId: 'c' };
const message = { id: 'a', role: 'assistant', content: 'Partial', runId: 'r', runStatus: 'running', historyRevision: 3 };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchChatRunStatus).mockResolvedValue({ id: 'r', ...binding, assistantMessageId: 'a', agentId: 'codex', status: 'succeeded', createdAt: 10, updatedAt: 20 });
  vi.mocked(reattachDaemonRun).mockImplementation(async input => {
    input.handlers.onDelta('Complete reply'); input.onRunEventId?.('40'); input.handlers.onDone('');
  });
});
it('recovers the full completed reply with original identity and revision without canceling or resubmitting', async () => {
  const recovered = await recoverCompletedWorkspaceRun(binding, message, new AbortController().signal);
  expect(recovered).toMatchObject({ ...message, content: 'Complete reply', runStatus: 'succeeded', endedAt: 20, lastRunEventId: '40' });
  expect(vi.mocked(reattachDaemonRun).mock.calls[0]![0]).toMatchObject({ runId: 'r', initialLastEventId: null });
  expect(vi.mocked(reattachDaemonRun).mock.calls[0]![0].cancelSignal).toBeUndefined();
});
it.each(['projectId', 'conversationId', 'assistantMessageId'] as const)('rejects a mismatched %s', async key => {
  const status = await fetchChatRunStatus('r');
  vi.mocked(fetchChatRunStatus).mockResolvedValue({ ...status!, [key]: 'other' });
  expect(await recoverCompletedWorkspaceRun(binding, message, new AbortController().signal)).toBeNull();
  expect(reattachDaemonRun).not.toHaveBeenCalled();
});
it('preserves the partial reply on replay failure', async () => {
  vi.mocked(reattachDaemonRun).mockImplementation(async input => { input.handlers.onDelta('Incomplete'); input.handlers.onError(new Error('Offline')); });
  expect(await recoverCompletedWorkspaceRun(binding, message, new AbortController().signal)).toBeNull();
  expect(message.content).toBe('Partial');
});
it('discards replay after leaving the conversation', async () => {
  const controller = new AbortController();
  vi.mocked(reattachDaemonRun).mockImplementation(async input => { controller.abort(); input.handlers.onDone(''); });
  expect(await recoverCompletedWorkspaceRun(binding, message, controller.signal)).toBeNull();
});
