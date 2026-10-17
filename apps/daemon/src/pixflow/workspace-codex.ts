import type { ChildProcess } from 'node:child_process';
import { runCodexTurn, type CodexSteer } from './codex-turn.js';

/** Keep the normal Workspace run/file lifecycle while using Codex's native turn transport. */
export function startWorkspaceCodex(options: Omit<Parameters<typeof runCodexTurn>[0], 'onEvent' | 'onSteerReady' | 'onSettled' | 'onChild'> & {
  onChild: (child: ChildProcess) => void;
}) {
  let emit: ((event: Record<string, any>) => void) | undefined;
  const pending: Record<string, any>[] = [];
  let steer: CodexSteer | undefined;
  let offset = 0, succeeded = false, fatal = false;
  const recorded = new Set<string>();
  const send = (event: Record<string, any>) => emit ? emit(event) : pending.push(event);
  const completion = runCodexTurn({ ...options,
    onEvent: event => {
      if (event.type === 'text_delta') offset += String(event.delta).length;
      send(event.type === 'assistant_message_boundary' ? { ...event, contentOffset: offset } : event);
    },
    onSteerReady: value => { steer = value; },
    onSettled: (_threadId, error) => {
      succeeded = !error;
      fatal = !!error && !options.signal.aborted;
      if (error && !options.signal.aborted) send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    },
  });
  // The existing child close handler owns the run outcome, artifacts and cleanup.
  void completion.catch(() => undefined);
  return {
    get succeeded() { return succeeded; },
    hasFatalError() { return fatal; },
    connect(listener: NonNullable<typeof emit>) { emit = listener; pending.splice(0).forEach(listener); },
    async steer(messageId: string, prompt: string, references: Record<string, unknown> = {}) {
      if (!steer) return { messageId, state: 'rejected' as const, message: 'Steering is not ready for this run. Keep the message queued.' };
      const result = await steer(messageId, prompt + (Object.keys(references).length ? '\n\nAttached request context:\n' + JSON.stringify(references) : ''));
      if (result.state === 'accepted' && !recorded.has(messageId)) {
        recorded.add(messageId);
        send({ type: 'steering_message', id: messageId, text: prompt, contentOffset: offset, createdAt: Date.now(), ...references });
      }
      return result;
    },
  };
}

/** Execution-only flags are not valid App Server flags; preserve explicit configuration. */
export function codexAppServerConfigArgs(args: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (['-c', '--config', '--enable', '--disable'].includes(args[i]!) && args[i + 1]) result.push(args[i]!, args[++i]!);
    else if (args[i]!.startsWith('--config=')) result.push(args[i]!);
  }
  return result;
}
