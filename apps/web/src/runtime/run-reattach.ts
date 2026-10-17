import type { ChatMessage } from '../types';

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
