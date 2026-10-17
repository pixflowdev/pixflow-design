import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { stopChildProcessTree } from '@open-design/platform';
import { codexNeedsDangerFullAccessSandbox } from '../runtimes/defs/codex.js';
import { VoiceDrain } from './voice-drain.js';
import type { CodexMcpServers } from './direct-site-mcp.js';

type Event = Record<string, unknown>;

/** Voice policy belongs to the agent; no transcript keyword matching selects actions. */
export const VOICE_WORK_CONTROL_RULE = `When the user asks to stop or cancel the work in progress, use cancel_current_work rather than merely acknowledging the request. Interpret their intent in context; discussion or quoted wording is not a cancellation request. If you are the realtime voice agent, delegate the cancellation request to Codex so it can invoke that tool. Report cancellation only after the tool confirms it. Canceling work does not end the voice conversation or undo changes already completed. Ending voice through the orb is a separate action that lets accepted work finish.`;

/** Translate public app-server progress, never private reasoning or raw protocol dumps. */
export function voiceProgress(method: string, params: Event): Event | null {
  if (method === 'item/agentMessage/delta') return { type: 'text_delta', delta: params.delta };
  if (method === 'item/reasoning/summaryTextDelta') return { type: 'thinking_delta', delta: params.delta };
  if (method === 'thread/realtime/transcript/done') return {
    type: 'voice_transcript', role: params.role === 'user' ? 'user' : 'assistant', text: String(params.text ?? ''),
  };
  const item = params.item as Event | undefined;
  if (method === 'thread/realtime/item/completed' && item?.type === 'transcriptSegment') return {
    type: 'voice_transcript', role: item.role === 'user' ? 'user' : 'assistant', text: String(item.text ?? ''), id: item.id,
  };
  if (!item || !['item/started', 'item/completed'].includes(method)) return null;
  const name = item.type === 'commandExecution' ? 'Bash' : item.type === 'fileChange' ? 'Edit'
    : item.type === 'webSearch' ? 'WebSearch' : item.type === 'mcpToolCall' ? String(item.tool) : null;
  if (!name) return null;
  const output = item.aggregatedOutput ?? item.result ?? item.changes ?? '';
  return method === 'item/started'
    ? { type: 'tool_use', id: item.id, name, input: item.type === 'commandExecution' ? { command: item.command } : item.arguments ?? { changes: item.changes, query: item.query } }
    : { type: 'tool_result', toolUseId: item.id, content: typeof output === 'string' ? output : JSON.stringify(output), isError: item.status === 'failed' || !!item.error || (typeof item.exitCode === 'number' && item.exitCode !== 0) };
}

/** One authenticated site run owns one native voice process and its lifetime. */
export async function runCodexVoice(options: {
  executable: string; env: NodeJS.ProcessEnv; cwd: string; sdp: string; instructions: string;
  mcpServers?: CodexMcpServers | undefined;
  model?: string | undefined; reasoning?: string | undefined; fastMode?: boolean | undefined; writable: boolean; signal: AbortSignal; expiresAt: number;
  onChild: (child: ReturnType<typeof spawn>) => void; onEvent: (event: Event) => void;
  onSdp: (sdp: string) => void;
  onEndReady?: (end: () => void) => void;
  voice?: string | undefined;
}): Promise<void> {
  if (options.signal.aborted) throw new Error('Voice canceled.');
  const expires = options.expiresAt < 1e12 ? options.expiresAt * 1000 : options.expiresAt;
  if (!Number.isFinite(expires) || expires <= Date.now()) throw new Error('The WordPress voice session expired. Start a new call to reconnect.');
  const child = spawn(options.executable, ['app-server', '--stdio'], {
    cwd: options.cwd, env: options.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  options.onChild(child);
  let id = 0;
  let buffer = '';
  let threadId = '';
  let finished = false;
  const activeTurns = new Set<string>();
  let canonicalTranscript = false;
  const committedTranscripts = new Set<string>();
  const decoder = new StringDecoder('utf8');
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const write = (value: unknown) => { if (!child.stdin.destroyed) child.stdin.write(JSON.stringify(value) + '\n'); };
  const call = (method: string, params: unknown): Promise<any> => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Codex voice did not answer ${method}.`)); }, 30_000);
    pending.set(requestId, { resolve, reject, timer }); write({ id: requestId, method, params });
  });
  let resolveEnd!: () => void;
  let rejectEnd!: (error: Error) => void;
  const ended = new Promise<void>((resolve, reject) => { resolveEnd = resolve; rejectEnd = reject; });
  // Attach immediately: startup can fail before the handshake awaits this promise.
  void ended.catch(() => undefined);
  const finish = (error?: Error) => {
    if (finished) return; finished = true;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error ?? new Error('Voice ended.')); }
    pending.clear(); error ? rejectEnd(error) : resolveEnd();
  };
  const abort = () => { if (threadId) write({ id: ++id, method: 'thread/realtime/stop', params: { threadId } }); finish(); };
  const drain = new VoiceDrain(() => {
    void call('thread/realtime/stop', {threadId}).catch(finish);
  }, () => finish());
  options.signal.addEventListener('abort', abort, { once: true });
  const expiry = setTimeout(() => finish(new Error('The WordPress voice session expired. Start a new call to reconnect.')), Math.max(1, expires - Date.now()));
  let negotiation: ReturnType<typeof setTimeout> | undefined;
  child.stdin.on('error', error => finish(error));
  child.stderr.on('data', () => { /* Native diagnostics may contain private connection data. */ });
  child.on('error', finish);
  child.on('close', () => finish(options.signal.aborted || finished ? undefined : new Error('The Codex voice connection closed.')));
  child.stdout.on('data', (chunk: Buffer) => {
    if (finished) return;
    buffer += decoder.write(chunk);
    if (buffer.length > 8_000_000) { finish(new Error('Codex voice returned an oversized message.')); return; }
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      let message: any; try { message = JSON.parse(line); } catch { continue; }
      if (message.method && message.id !== undefined) {
        if (message.method === 'item/tool/call' && message.params?.tool === 'cancel_current_work' && message.params.threadId === threadId) {
          const turns = [...activeTurns];
          void Promise.all(turns.map(turnId => call('turn/interrupt', { threadId, turnId }))).then(() => {
            write({ id: message.id, result: { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify({ cancellationRequested: turns.length > 0, interruptedTurns: turns, voiceContinues: true, completedChangesRetained: true }) }] } });
          }).catch(error => {
            write({ id: message.id, result: { success: false, contentItems: [{ type: 'inputText', text: error instanceof Error ? error.message : 'Cancellation could not be confirmed.' }] } });
          });
          continue;
        }
        write({ id: message.id, error: { code: -32601, message: 'This voice client does not support this interactive request.' } }); continue;
      }
      if (message.id !== undefined) {
        const request = pending.get(message.id); if (!request) continue;
        clearTimeout(request.timer); pending.delete(message.id);
        message.error ? request.reject(new Error(message.error.message || 'Codex voice request failed.')) : request.resolve(message.result);
        continue;
      }
      const params = message.params ?? {};
      if (message.method === 'turn/started' && params.turn?.id) { activeTurns.add(params.turn.id); drain.started(params.turn.id); }
      if (message.method === 'turn/completed' && params.turn?.id) { activeTurns.delete(params.turn.id); drain.completed(params.turn.id); }
      if (message.method === 'thread/status/changed') drain.status(params.status?.type === 'active');
      if (message.method === 'thread/realtime/item/started' || message.method === 'thread/realtime/item/completed') canonicalTranscript = true;
      if (canonicalTranscript && message.method === 'thread/realtime/transcript/done') continue;
      if (message.method === 'thread/realtime/item/completed' && params.item?.type === 'transcriptSegment') {
        if (typeof params.item.id === 'string' && params.item.id) {
          if (committedTranscripts.has(params.item.id)) continue;
          committedTranscripts.add(params.item.id);
        }
      }
      if (message.method === 'thread/realtime/sdp' && typeof params.sdp === 'string') { clearTimeout(negotiation); options.onSdp(params.sdp); }
      else if (message.method === 'thread/realtime/error') finish(new Error(String(params.message || 'Codex voice is unavailable for this sign-in.')));
      else if (message.method === 'thread/realtime/closed') drain.audioClosed();
      else { const event = voiceProgress(message.method, params); if (event) options.onEvent(event); }
    }
  });
  try {
    await call('initialize', { clientInfo: { name: 'pixflow_voice', title: 'Pixflow Design', version: '2.0.1' }, capabilities: { experimentalApi: true, requestAttestation: false } });
    write({ method: 'initialized' });
    const result = await call('thread/start', {
      model: options.model, cwd: options.cwd, ephemeral: true, approvalPolicy: 'never',
      // Match typed Direct execution. The renewed WordPress session owns site
      // write authority; local workspace tools must still reach its HTTP helper.
      sandbox: codexNeedsDangerFullAccessSandbox(process.platform, options.env) ? 'danger-full-access' : 'workspace-write',
      config: { model_reasoning_effort: options.reasoning ?? 'medium', default_permissions: ':workspace', 'sandbox_workspace_write.network_access': true, ...(options.mcpServers ? { mcp_servers: options.mcpServers } : {}) },
      ...(options.fastMode ? { serviceTier: 'fast' } : {}), developerInstructions: `${options.instructions}\n\n${VOICE_WORK_CONTROL_RULE}`,
      dynamicTools: [{ type: 'function', name: 'cancel_current_work', description: 'Cancel the current voice conversation’s active Codex work when the user requests it. Retains completed changes and leaves voice connected.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }],
    });
    threadId = result.thread.id;
    negotiation = setTimeout(() => finish(new Error('Codex voice audio negotiation timed out.')), 30_000);
    await call('thread/realtime/start', {
      threadId, version: 'v3', outputModality: 'audio', transport: { type: 'webrtc', sdp: options.sdp },
      ...(options.voice ? {voice: options.voice} : {}),
      includeStartupContext: true, flushTranscriptTailOnSessionEnd: true,
      prompt: VOICE_WORK_CONTROL_RULE,
    });
    options.onEndReady?.(() => drain.requestEnd());
    await ended;
  } finally {
    clearTimeout(expiry); clearTimeout(negotiation);
    options.signal.removeEventListener('abort', abort);
    finish();
    await stopChildProcessTree(child).catch(() => child.kill());
    child.stdin.end();
  }
}
