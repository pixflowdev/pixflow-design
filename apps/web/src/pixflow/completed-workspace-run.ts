import type { AgentEvent } from '../types';
import { fetchChatRunStatus, reattachDaemonRun } from '../providers/daemon';
import type { ChatHistoryBinding, HistoryMessage } from './chat-history-client';

/** Replay a completed Workspace run as data only. Never submit or repeat tools.
 * The caller retains revision checks and must discard results after ownership changes. */
export async function recoverCompletedWorkspaceRun<T extends HistoryMessage>(binding: ChatHistoryBinding, message: T, signal: AbortSignal): Promise<T | null> {
  const row = message as T & { runId?: string; runStatus?: string; endedAt?: number };
  if (row.role !== 'assistant' || !row.runId || row.endedAt || !['queued', 'running'].includes(row.runStatus || '') || signal.aborted) return null;
  const status = await fetchChatRunStatus(row.runId);
  if (signal.aborted || !status || status.status !== 'succeeded'
    || status.projectId !== binding.projectId || status.conversationId !== binding.conversationId
    || status.assistantMessageId !== row.id) return null;
  let content = '';
  const events: AgentEvent[] = [];
  let complete = false;
  let failed = false;
  let lastRunEventId: string | undefined;
  await reattachDaemonRun({
    runId: row.runId, signal, initialLastEventId: null,
    onRunEventId: id => { lastRunEventId = id; },
    handlers: {
      onDelta: delta => { content += delta; },
      onAgentEvent: event => { events.push(event); },
      onDone: () => { complete = true; },
      onError: () => { failed = true; },
    },
  });
  if (signal.aborted || failed || !complete) return null;
  return { ...message, content, events, runStatus: 'succeeded', endedAt: status.updatedAt,
    ...(lastRunEventId ? { lastRunEventId } : {}),
    ...('status' in message ? { status: 'complete' } : {}),
  };
}
