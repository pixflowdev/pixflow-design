import type { ChatMessage } from '../types';

/** Direct floating-panel runs have their own persisted stream receipt and
 * recovery owner. They are visible in unified Workspace chats but never appear
 * in the daemon /api/runs index; absence there is not evidence of failure.
 */
export function isDaemonRecoveryMessage(message: ChatMessage): boolean {
  return message.role === 'assistant' && !message.id.startsWith('direct:');
}

/** Empty failed rows with a daemon run may be browser-disconnect artifacts. */
export function isSpuriouslyFailedAssistantMessage(message: ChatMessage): boolean {
  return (
    message.role === 'assistant' &&
    message.runStatus === 'failed' &&
    typeof message.runId === 'string' &&
    message.runId.length > 0 &&
    message.content.trim().length === 0 &&
    (message.producedFiles?.length ?? 0) === 0
  );
}
