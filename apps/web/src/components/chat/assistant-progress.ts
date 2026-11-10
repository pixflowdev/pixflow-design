import type { AgentEvent } from '../../types';

/** Describe the latest observed phase, never infer thinking from elapsed time or token counts. */
export function assistantProgress(events: readonly AgentEvent[]): 'preparing' | 'waiting' | 'thinking' | 'working' | 'finishing' {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]!;
    if (event.kind === 'status') {
      if (['response_complete', 'completed'].includes(event.label)) return 'finishing';
      if (['provider_waiting', 'initializing', 'requesting'].includes(event.label)) return 'waiting';
      if (event.label === 'thinking') return 'thinking';
    }
    if (event.kind === 'thinking' && event.text.trim()) return 'thinking';
    if (event.kind === 'text' && event.text.trim()) return 'working';
    if (event.kind === 'tool_use' || event.kind === 'tool_result' || event.kind === 'steering_message') return 'working';
    if (event.kind === 'activity' && event.phase !== 'preparing') return event.phase === 'thinking' ? 'thinking' : 'working';
  }
  return 'preparing';
}
