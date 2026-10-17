import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { createCommandInvocation } from '@open-design/platform';
import type { PixflowDirectSiteSteerResponse } from '@open-design/contracts';
import type { runCodexTurn } from './codex-turn.js';
import { NativeSessionMissingError } from './native-session-recovery.js';

type Options = Parameters<typeof runCodexTurn>[0];
interface Part { id: string; type: string; text?: string; tool?: string; callID?: string; state?: { status: string; input?: unknown; output?: string; error?: string } }
interface NativeMessage { info: { id: string; role: string; parentID?: string; summary?: boolean; finish?: string; error?: { name?: string }; time?: { completed?: number } }; parts: Part[] }

async function availablePort(): Promise<number> {
  const socket = createServer();
  await new Promise<void>((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const address = socket.address();
  await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  if (!address || typeof address === 'string') throw new Error('Cannot allocate OpenCode port.');
  return address.port;
}

/** Emit only new presentation data from native snapshots, including complete fast tool calls. */
export function createOpenCodePresenter(emit: Options['onEvent'], baseline: Set<string>) {
  const lengths = new Map<string, number>(), started = new Set<string>(), finished = new Set<string>();
  const compactions = new Map<string, boolean>();
  let lastText = '';
  return (messages: NativeMessage[]) => {
    let compacting = false;
    for (const message of messages) {
      if (message.info.role !== 'assistant' || baseline.has(message.info.id)) continue;
      if (message.info.summary === true) {
        const completed = !!message.info.time?.completed;
        compacting ||= !completed;
        if (compactions.get(message.info.id) !== completed) {
          compactions.set(message.info.id, completed);
          emit({type:'status',label:completed?'Working context compacted':'Compacting working context',contextCompaction:completed?'completed':'running'});
        }
        continue;
      }
      for (const part of message.parts) {
        if (part.type === 'text' && part.text) {
          const length = lengths.get(part.id) ?? 0;
          if (part.text.length > length) {
            if (lastText && lastText !== part.id) emit({ type: 'text_delta', delta: '\n\n' });
            emit({ type: 'text_delta', delta: part.text.slice(length) });
            lengths.set(part.id, part.text.length); lastText = part.id;
          }
        }
        if (part.type === 'tool' && part.state && part.state.status !== 'pending') {
          const id = part.callID || part.id;
          if (!started.has(id)) { started.add(id); emit({ type: 'tool_use', id, name: part.tool, input: part.state.input ?? {} }); }
          if (['completed', 'error'].includes(part.state.status) && !finished.has(id)) {
            finished.add(id); emit({ type: 'tool_result', toolUseId: id, content: part.state.output ?? part.state.error ?? '', isError: part.state.status === 'error' });
          }
        }
      }
    }
    return compacting;
  };
}

/** Own one authenticated loopback server per active site run. Never replay an uncertain POST. */
export async function runOpenCodeTurn(options: Options): Promise<string> {
  options.signal.throwIfAborted();
  const model = options.model && options.model !== 'default' ? (() => {
    const slash = options.model.indexOf('/');
    if (slash < 1) throw new Error('Select an OpenCode provider/model.');
    return { providerID: options.model.slice(0, slash), modelID: options.model.slice(slash + 1) };
  })() : undefined;
  const port = await availablePort(), password = randomBytes(32).toString('hex');
  const origin = `http://127.0.0.1:${port}`;
  const env = { ...options.env, OPENCODE_SERVER_USERNAME: 'pixflow', OPENCODE_SERVER_PASSWORD: password };
  const invocation = createCommandInvocation({ command: options.executable, args: ['serve', '--hostname', '127.0.0.1', '--port', String(port)], env });
  const child = spawn(invocation.command, invocation.args, { cwd: options.cwd, env, shell: false, windowsHide: true, windowsVerbatimArguments: invocation.windowsVerbatimArguments, stdio: ['pipe', 'pipe', 'pipe'] });
  options.onChild(child);
  // Drain diagnostics without persisting credentials or private provider output.
  let readyResolve!: () => void, readyReject!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  void ready.catch(() => undefined);
  let startup = '';
  child.stdout.on('data', (chunk: Buffer) => {
    startup = (startup + chunk.toString()).slice(-4000);
    if (startup.includes(`server listening on ${origin}`)) readyResolve();
  });
  child.stderr.on('data', () => {});
  let processError: Error | undefined, sessionId = '', ended = false, compacting = false, inflight = 0, generation = 0;
  child.on('error', () => { processError = new Error('OpenCode could not start.'); readyReject(processError); });
  child.on('exit', () => { processError ??= new Error('OpenCode disconnected before the run finished.'); readyReject(processError); });
  const headers = { Authorization: `Basic ${Buffer.from('pixflow:' + password).toString('base64')}`, 'Content-Type': 'application/json' };
  async function request<T>(route: string, body?: unknown, signal = options.signal): Promise<T> {
    const response = await fetch(origin + route, { method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
    if (!response.ok) throw Object.assign(new Error(`OpenCode request failed (HTTP ${response.status}).`), { rejected: response.status >= 400 && response.status < 500, status: response.status });
    return (response.status === 204 ? undefined : await response.json()) as T;
  }
  const deliveries = new Map<string, { prompt: string; result: Promise<PixflowDirectSiteSteerResponse> }>();
  const submit = (prompt: string) => request<void>(`/session/${sessionId}/prompt_async`, { ...(model ? { model } : {}), parts: [{ type: 'text', text: prompt }] });
  try {
    // Wait for the listener before contacting a newly reserved Windows ephemeral
    // port: probing before bind can connect a client socket to itself.
    const startupStop = new AbortController();
    try {
      await Promise.race([ready, delay(30_000, undefined, { signal: AbortSignal.any([options.signal, startupStop.signal]) }).then(() => { throw new Error('OpenCode server startup timed out.'); })]);
    } finally { startupStop.abort(); }
    await request('/global/health');
    if (options.resumeSessionId) {
      const session = await request<{ id: string }>(`/session/${encodeURIComponent(options.resumeSessionId)}`).catch((error: Error & {status?:number}) => {
        if (error.status === 404) throw new NativeSessionMissingError();
        throw error;
      });
      sessionId = session.id;
    } else sessionId = (await request<{ id: string }>('/session', { title: 'Pixflow Direct' })).id;
    const baseline = new Set((await request<NativeMessage[]>(`/session/${sessionId}/message`)).map(message => message.info.id));
    const present = createOpenCodePresenter(options.onEvent, baseline);
    options.onEvent({ type: 'session', sessionId });
    await submit(options.prompt);
    options.onSteerReady((messageId, prompt) => {
      const previous = deliveries.get(messageId);
      if (previous) return previous.prompt === prompt ? previous.result : Promise.resolve({ messageId, state: 'rejected', message: 'This message identifier has already been used.' });
      if (ended || options.signal.aborted) return Promise.resolve({ messageId, state: 'rejected', message: 'The active run has finished. Keep this message queued.' });
      if (compacting) return Promise.resolve({messageId,state:'rejected',message:'Working context is being compacted. This message was not sent; keep it queued until compaction finishes.'});
      inflight++; generation++;
      const result = submit(prompt).then((): PixflowDirectSiteSteerResponse => ({ messageId, state: 'accepted', turnId: sessionId }))
        .catch((error): PixflowDirectSiteSteerResponse => ({ messageId, state: error.rejected ? 'rejected' : 'unconfirmed', message: 'OpenCode delivery ' + (error.rejected ? 'was rejected.' : 'could not be confirmed. Check the conversation before retrying.') }))
        .finally(() => { inflight--; });
      deliveries.set(messageId, { prompt, result }); return result;
    });
    while (true) {
      options.signal.throwIfAborted(); if (processError) throw processError;
      const observed = generation;
      const messages = await request<NativeMessage[]>(`/session/${sessionId}/message`);
      compacting = present(messages);
      const status = await request<Record<string, { type: string }>>('/session/status');
      const recent = messages.filter(message => !baseline.has(message.info.id));
      const last = recent.at(-1), user = [...recent].reverse().find(message => message.info.role === 'user');
      if (!compacting && !inflight && observed === generation && (!status[sessionId] || status[sessionId]?.type === 'idle') && last?.info.role === 'assistant' && last.info.summary !== true && last.info.parentID === user?.info.id && last.info.time?.completed) {
        if (last.info.error) throw new Error('OpenCode did not complete the run.');
        if (last.info.finish && !['tool-calls', 'unknown'].includes(last.info.finish)) { ended = true; options.onSteerReady(undefined); return sessionId; }
      }
      await delay(350, undefined, { signal: options.signal });
    }
  } finally {
    ended = true; options.onSteerReady(undefined);
    if (sessionId) await request(`/session/${sessionId}/abort`, {}, AbortSignal.timeout(2000)).catch(() => undefined);
    child.stdin.end(); child.kill();
  }
}
