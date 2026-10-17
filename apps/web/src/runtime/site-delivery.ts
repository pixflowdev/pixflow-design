import type { ChatMessage, AgentEvent } from '../types';

export const SITE_DELIVERY_UNCERTAIN = 'PIXFLOW_SITE_DELIVERY_UNCERTAIN';
export const SITE_DELIVERY_INSPECT_FIRST = 'The connection ended before this site operation could be confirmed. It has not been repeated. Check the handoff status and the latest site state before continuing; do not replay the previous request.';

/** A lost mutation receipt is not permission to repeat the original user turn. */
export function hasUncertainSiteDelivery(message: Pick<ChatMessage, 'events'>): boolean {
  return (message.events ?? []).some(event => event.kind === 'status' && event.code === SITE_DELIVERY_UNCERTAIN);
}

/** Native tool-only answers have observable output even without a final text paragraph. */
export function hasSuccessfulToolResult(events: AgentEvent[] | undefined): boolean {
  return (events ?? []).some(event => event.kind === 'tool_result' && !event.isError);
}

/** Tool admission without a result is uncertain even when the user interrupts the run. */
export function hasUnresolvedToolCall(events: AgentEvent[] | undefined): boolean {
  const pending = new Set<string>();
  for (const event of events ?? []) {
    if (event.kind === 'tool_use') pending.add(event.id);
    else if (event.kind === 'tool_result') pending.delete(event.toolUseId);
  }
  return pending.size > 0;
}
