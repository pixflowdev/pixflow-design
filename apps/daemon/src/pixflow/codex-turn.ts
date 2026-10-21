import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { stopChildProcessTree } from '@open-design/platform';
import type { PixflowDirectSiteSteerResponse } from '@open-design/contracts';
import { codexNeedsDangerFullAccessSandbox } from '../runtimes/defs/codex.js';
import { voiceProgress } from './codex-voice.js';
import type { CodexMcpServers } from './direct-site-mcp.js';
import { NativeSessionMissingError } from './native-session-recovery.js';

type Message = Record<string, any>;
export type CodexSteer = (messageId: string, prompt: string) => Promise<PixflowDirectSiteSteerResponse>;

/** One App Server owns one site turn; steering never replaces its process or turn. */
export async function runCodexTurn(options: {
  executable: string; env: NodeJS.ProcessEnv; cwd: string; prompt: string; images: string[];
  mcpServers?: CodexMcpServers | undefined;
  configArgs?: string[];
  /** Direct-site scratch workspaces own AGENTS.md; ancestor repository guidance is unrelated. */
  isolateProjectInstructions?: boolean;
  runtimeWorkspaceRoots?: string[];
  onSettled?: (threadId: string, error?: unknown) => void;
  model?: string | undefined; reasoning?: string | undefined; fastMode?: boolean | undefined; resumeSessionId: string | null;
  signal: AbortSignal; onChild: (child: ReturnType<typeof spawn>) => void;
  onEvent: (event: Message) => void; onSteerReady: (steer: CodexSteer | undefined) => void;
}): Promise<string> {
  const child = spawn(options.executable, ['app-server', '--stdio', ...(options.configArgs ?? []),
    ...(options.isolateProjectInstructions ? ['-c', 'project_root_markers=["AGENTS.md"]'] : [])], {
    cwd: options.cwd, env: options.env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  options.onChild(child);
  let sequence = 0, threadId = '', turnId = '', ended = false, buffer = '', completedCleanly = false;
  let compacting = false;
  let startedMessageId = '', outputMessageId = '', hasText = false, trailingNewlines = 0;
  let activeMessageId = '';
  const replyWaiters = new Set<() => void>();
  const releaseReplyWaiters = () => { for (const release of replyWaiters) release(); replyWaiters.clear(); };
  const completeMessage = () => {
    if (!activeMessageId) return;
    options.onEvent({ type: 'assistant_message_boundary', phase: 'completed', messageId: activeMessageId });
    activeMessageId = '';
    releaseReplyWaiters();
  };
  const startMessage = (id: string) => {
    if (!id || id === activeMessageId) return;
    completeMessage();
    activeMessageId = id;
    options.onEvent({ type: 'assistant_message_boundary', phase: 'started', messageId: id });
  };
  const decoder = new StringDecoder('utf8');
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const deliveries = new Map<string, { prompt: string; result: Promise<PixflowDirectSiteSteerResponse> }>();
  let resolveTurn!: () => void, rejectTurn!: (error: Error) => void;
  const completion = new Promise<void>((resolve, reject) => { resolveTurn = resolve; rejectTurn = reject; });
  // A process failure can arrive while initialize is pending.
  void completion.catch(() => undefined);
  const write = (message: Message) => child.stdin.write(JSON.stringify(message) + '\n');
  const call = (method: string, params: Message): Promise<any> => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Codex delivery could not be confirmed.')); }, 30_000);
    pending.set(id, { resolve, reject, timer });
    write({ id, method, params });
  });
  const fail = (error: Error) => {
    rejectTurn(error);
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    pending.clear();
  };
  const abort = () => { fail(new Error('Stopped.')); };
  options.signal.addEventListener('abort', abort, { once: true });
  child.on('error', fail);
  child.on('close', () => { if (!ended) fail(new Error('Codex disconnected before the turn finished.')); });
  child.stdin.on('error', fail);
  child.stderr.on('data', () => { /* Never expose native diagnostics containing private site data. */ });
  child.stdout.on('data', (chunk: Buffer) => {
    buffer += decoder.write(chunk);
    if (buffer.length > 8_000_000) { fail(new Error('Codex returned an oversized message.')); return; }
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      let message: Message; try { message = JSON.parse(line); } catch { continue; }
      if (message.method && message.id !== undefined) {
        write({ id: message.id, error: { code: -32601, message: 'Interactive requests are not supported by this client.' } });
        continue;
      }
      if (message.id !== undefined) {
        const entry = pending.get(message.id); if (!entry) continue;
        clearTimeout(entry.timer); pending.delete(message.id);
        if (message.error) entry.reject(Object.assign(new Error(message.error.message || 'Codex rejected the request.'), { rejected: true, rpcCode: message.error.code }));
        else entry.resolve(message.result);
        continue;
      }
      const params = message.params || {};
      if (params.threadId && threadId && params.threadId !== threadId) continue;
      if (params.item?.type === 'contextCompaction' && ['item/started','item/completed'].includes(message.method)) {
        compacting = message.method === 'item/started';
        options.onEvent({type:'status',label:compacting?'Compacting working context':'Working context compacted',contextCompaction:compacting?'running':'completed'});
      }
      if (message.method === 'turn/started') turnId = params.turn?.id || turnId;
      if (message.method === 'turn/completed') {
        if (turnId && params.turn?.id !== turnId) continue;
        completeMessage();
        ended = true;
        completedCleanly = params.turn?.status === 'completed';
        options.onSteerReady(undefined);
        if (params.turn?.status === 'completed') resolveTurn();
        else rejectTurn(new Error(params.turn?.error?.message || 'Codex did not complete this turn.'));
      }
      const event = voiceProgress(message.method, params);
      if (message.method === 'item/started' && params.item?.type === 'agentMessage') {
        startedMessageId = String(params.item.id || '');
        startMessage(startedMessageId);
      }
      if (message.method === 'item/completed' && params.item?.type === 'agentMessage' && params.item.id === activeMessageId) completeMessage();
      if (event?.type === 'text_delta' && typeof event.delta === 'string' && event.delta.length) {
        // App Server item identity is the paragraph boundary. Steering may
        // produce another message inside the same turn; chunks within an
        // item must remain byte-for-byte contiguous (including code blocks).
        const messageId = String(params.itemId || startedMessageId);
        startMessage(messageId);
        if (hasText && messageId && outputMessageId && messageId !== outputMessageId) {
          const leading = event.delta.match(/^\n*/)?.[0].length || 0;
          const missing = Math.max(0, 2 - trailingNewlines - leading);
          if (missing) options.onEvent({ type: 'text_delta', delta: '\n'.repeat(missing) });
        }
        if (messageId) outputMessageId = messageId;
        hasText = true;
        const trailing = event.delta.match(/\n*$/)?.[0].length || 0;
        trailingNewlines = trailing === event.delta.length ? Math.min(2, trailingNewlines + trailing) : Math.min(2, trailing);
      }
      if (event) options.onEvent(event);
    }
  });
  try {
    if (options.signal.aborted) throw new Error('Stopped.');
    await call('initialize', { clientInfo: { name: 'pixflow_design', title: 'Pixflow Design', version: '2.0.3' }, capabilities: { experimentalApi: true } });
    write({ method: 'initialized' });
    const settings = {
      cwd: options.cwd, model: options.model, approvalPolicy: 'never',
      ...(options.runtimeWorkspaceRoots?.length ? { runtimeWorkspaceRoots: options.runtimeWorkspaceRoots } : {}),
      sandbox: codexNeedsDangerFullAccessSandbox(process.platform, options.env) ? 'danger-full-access' : 'workspace-write',
      config: { model_reasoning_effort: options.reasoning ?? 'medium', 'sandbox_workspace_write.network_access': true, ...(options.mcpServers ? { mcp_servers: options.mcpServers } : {}) },
    };
    const thread = await call(options.resumeSessionId ? 'thread/resume' : 'thread/start', {
      ...settings, ...(options.resumeSessionId ? { threadId: options.resumeSessionId } : {}),
    }).catch((error: Error & {rejected?:boolean;rpcCode?:unknown}) => {
      // This boundary precedes turn/start, so no user work can have been accepted.
      if (options.resumeSessionId && error.rejected && (['thread_not_found','session_not_found'].includes(String(error.rpcCode))
        || /^(?:thread|session)\b.*\bnot found\b|^no rollout found for thread\b/i.test(error.message))) throw new NativeSessionMissingError();
      throw error;
    });
    threadId = thread.thread.id;
    options.onEvent({ type: 'session', sessionId: threadId });
    const result = await call('turn/start', {
      threadId, input: [{ type: 'text', text: options.prompt }, ...options.images.map(path => ({ type: 'localImage', path }))],
      ...(options.fastMode ? { serviceTier: 'fast' } : {}),
    });
    turnId = result.turn.id;
    if (!ended) options.onSteerReady((messageId, prompt) => {
      const previous = deliveries.get(messageId);
      if (previous) return previous.prompt === prompt ? previous.result : Promise.resolve({ messageId, state: 'rejected', message: 'This message identifier has already been used.' });
      if (ended) return Promise.resolve(completedCleanly && !options.signal.aborted
        ? { messageId, state: 'queued' }
        : { messageId, state: 'rejected', message: 'The current run has finished. Keep this message queued.' });
      // Do not mark the ID delivered: its existing queue entry can be retried after compaction.
      if (compacting) return Promise.resolve({messageId,state:'rejected',message:'Working context is being compacted. This message was not sent; keep it queued until compaction finishes.'});
      const delivery = (async () => {
        // turn/steer can stop the model's current text item mid-sentence. Wait
        // for that item before delivering; a completed final turn stays queued
        // for the ordinary next-turn path instead of being restarted here.
        while (activeMessageId && !ended && !options.signal.aborted) await new Promise<void>(resolve => { replyWaiters.add(resolve); });
        if (ended || options.signal.aborted) return completedCleanly && !options.signal.aborted
          ? { messageId, state: 'queued' as const }
          : { messageId, state: 'rejected' as const, message: 'The run stopped before this guidance was sent. Keep it queued.' };
        if (compacting) { deliveries.delete(messageId); return { messageId, state: 'rejected' as const, message: 'Working context is being compacted. Keep this guidance queued.' }; }
        return call('turn/steer', { threadId, expectedTurnId: turnId, input: [{ type: 'text', text: prompt }], clientUserMessageId: messageId })
        .then((response): PixflowDirectSiteSteerResponse => ({ messageId, state: 'accepted', turnId: response.turnId }))
        .catch((error): PixflowDirectSiteSteerResponse => ({ messageId, state: error.rejected ? 'rejected' : 'unconfirmed', message: error.message }));
      })();
      deliveries.set(messageId, { prompt, result: delivery });
      return delivery;
    });
    await completion;
    options.onSettled?.(threadId);
    return threadId;
  } catch (error) {
    options.onSettled?.(threadId, error);
    throw error;
  } finally {
    ended = true;
    releaseReplyWaiters();
    options.onSteerReady(undefined);
    options.signal.removeEventListener('abort', abort);
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Codex delivery could not be confirmed.')); }
    pending.clear();
    await stopChildProcessTree(child).catch(() => child.kill());
    child.stdin.end();
  }
}
