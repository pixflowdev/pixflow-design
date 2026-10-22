import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), stopTree: vi.fn(async () => {}) }));
vi.mock('@open-design/platform', async original => ({ ...await original<typeof import('@open-design/platform')>(), stopChildProcessTree: mocks.stopTree }));
vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), spawn: mocks.spawn }));
import { runCodexTurn, type CodexSteer } from '../../src/pixflow/codex-turn.js';
afterEach(() => vi.clearAllMocks());
function fixture(reject = false, signal = new AbortController().signal, overrides: Record<string, unknown> = {}, resumeError?: {message:string;code?:string}) {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
  const requests: any[] = [];
  const emit = (message: unknown) => child.stdout.write(JSON.stringify(message) + '\n');
  child.stdin.on('data', chunk => {
    const request = JSON.parse(chunk.toString()); requests.push(request);
    if (!request.id) return;
    if (resumeError && request.method === 'thread/resume') { queueMicrotask(() => emit({id:request.id,error:resumeError})); return; }
    queueMicrotask(() => emit(reject && request.method === 'turn/steer' ? { id: request.id, error: { message: 'Turn no longer active' } } : { id: request.id, result: request.method.startsWith('thread/') ? { thread: { id: 'thread-1' } } : request.method === 'turn/start' ? { turn: { id: 'turn-1' } } : { turnId: 'turn-1' } }));
  });
  mocks.spawn.mockReturnValue(child);
  let steer: CodexSteer | undefined;
  const events = vi.fn();
  const done = runCodexTurn({ executable: 'codex', env: {}, cwd: 'test', prompt: 'Build a hero', images: [], resumeSessionId: null, signal, onChild: vi.fn(), onEvent: events, onSteerReady: value => { steer = value; }, ...overrides });
  return { child, requests, emit, done, events, steer: () => steer };
}
it.each([null, 'existing-thread'])('forwards saved external MCP servers when starting/resuming %s', async (resumeSessionId) => {
  const mcpServers = { docs: { url: 'https://example.com/mcp', enabled: true } };
  const run = fixture(false, undefined, { mcpServers, resumeSessionId });
  await vi.waitFor(() => expect(run.steer()).toBeTypeOf('function'));
  run.emit({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });
  await run.done;
  expect(run.requests.find(item => item.method === (resumeSessionId ? 'thread/resume' : 'thread/start')).params.config.mcp_servers).toEqual(mcpServers);
});
it('identifies a missing native thread before any work is submitted, for safe checkpoint recovery', async () => {
  const run = fixture(false, undefined, {resumeSessionId:'missing-thread'}, {message:'Thread not found',code:'thread_not_found'});
  await expect(run.done).rejects.toMatchObject({code:'PIXFLOW_NATIVE_SESSION_MISSING'});
  expect(run.requests.filter(item=>item.method==='turn/start')).toHaveLength(0);
  expect(run.steer()).toBeUndefined();
});
it.each(['Permission denied', 'Request timed out'])('does not classify %s as a missing native thread', async (message) => {
  const run = fixture(false, undefined, {resumeSessionId:'existing-thread'}, {message});
  await expect(run.done).rejects.not.toMatchObject({code:'PIXFLOW_NATIVE_SESSION_MISSING'});
  expect(run.requests.filter(item=>item.method==='turn/start')).toHaveLength(0);
});
it('steers the same turn without interrupting or starting another and deduplicates retries', async () => {
  const run = fixture(); await vi.waitFor(() => expect(run.steer()).toBeTypeOf('function'));
  const first = await run.steer()!('message-1', 'Make it blue');
  expect(first.state).toBe('accepted');
  await run.steer()!('message-1', 'Make it blue');
  expect(run.requests.filter(item => item.method === 'turn/steer')).toHaveLength(1);
  expect(run.requests.find(item => item.method === 'turn/steer').params).toMatchObject({ threadId: 'thread-1', expectedTurnId: 'turn-1' });
  expect(run.requests.filter(item => item.method === 'turn/start')).toHaveLength(1);
  expect(run.child.kill).not.toHaveBeenCalled();
  run.emit({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', delta: 'Updated.' } });
  run.emit({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });
  await expect(run.done).resolves.toBe('thread-1');
  expect(run.events).toHaveBeenCalledWith({ type: 'text_delta', delta: 'Updated.' });
});

it('waits for a complete native reply before steering without interrupting text', async () => {
  const run = fixture(); await vi.waitFor(() => expect(run.steer()).toBeTypeOf('function'));
  run.emit({ method: 'item/started', params: { threadId: 'thread-1', item: { id: 'reply-1', type: 'agentMessage' } } });
  run.emit({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', itemId: 'reply-1', delta: 'First half ' } });
  const delivery = run.steer()!('message-1', 'Use blue');
  expect(run.requests.filter(request => request.method === 'turn/steer')).toHaveLength(0);
  expect(run.child.kill).not.toHaveBeenCalled();
  expect(run.events.mock.calls.map(([event]) => event.phase).filter(Boolean)).toEqual(['started']);
  run.emit({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', itemId: 'reply-1', delta: 'and the rest.' } });
  run.emit({ method: 'item/completed', params: { threadId: 'thread-1', item: { id: 'reply-1', type: 'agentMessage' } } });
  expect(run.events.mock.calls.filter(([event]) => event.type === 'assistant_message_boundary').map(([event]) => [event.messageId, event.phase])).toEqual([['reply-1', 'started'], ['reply-1', 'completed']]);
  expect((await delivery).state).toBe('accepted');
  run.emit({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });
  await run.done;
  expect(run.events.mock.calls.filter(([event]) => event.type === 'text_delta').map(([event]) => event.delta).join('')).toBe('First half and the rest.');
  expect(run.requests.filter(request => request.method === 'turn/start')).toHaveLength(1);
  expect(run.requests.filter(request => request.method === 'turn/interrupt')).toHaveLength(0);
});
it('keeps guidance queued when a final reply completes the turn, without cutting or restarting it', async () => {
  const run = fixture(); await vi.waitFor(() => expect(run.steer()).toBeTypeOf('function'));
  run.emit({ method: 'item/started', params: { item: { id: 'final', type: 'agentMessage' } } });
  run.emit({ method: 'item/agentMessage/delta', params: { itemId: 'final', delta: 'A complete final reply.' } });
  const delivery = run.steer()!('next', 'Additional guidance');
  run.emit({ method: 'item/completed', params: { item: { id: 'final', type: 'agentMessage' } } });
  run.emit({ method: 'turn/completed', params: { turn: { id: 'turn-1', status: 'completed' } } });
  expect(await delivery).toMatchObject({ state: 'queued' }); await run.done;
  expect(run.requests.some(request => ['turn/steer', 'turn/interrupt'].includes(request.method))).toBe(false);
  expect(run.requests.filter(request => request.method === 'turn/start')).toHaveLength(1);
});
it('does not automatically dispatch a waiting steer when its run is stopped', async () => {
  const controller = new AbortController(), run = fixture(false, controller.signal);
  await vi.waitFor(() => expect(run.steer()).toBeTypeOf('function'));
  run.emit({ method: 'item/started', params: { item: { id: 'active', type: 'agentMessage' } } });
  const delivery = run.steer()!('waiting', 'Do this later');
  const stopped = expect(run.done).rejects.toThrow('Stopped.'); controller.abort();
  await stopped; expect(await delivery).toMatchObject({ state: 'rejected' });
  expect(run.requests.some(request => request.method === 'turn/steer')).toBe(false);
});
it('keeps steering unsent during native compaction and accepts the same queued message afterwards once', async () => {
  const run = fixture(false, undefined, {resumeSessionId:'existing-thread'});
  await vi.waitFor(() => expect(run.steer()).toBeTypeOf('function'));
  run.emit({method:'item/started',params:{threadId:'thread-1',item:{type:'contextCompaction',id:'compact-1'}}});
  expect(await run.steer()!('queued-message','Preserve the original content')).toMatchObject({state:'rejected'});
  expect(run.requests.filter(item=>item.method==='turn/steer')).toHaveLength(0);
  expect(run.events).toHaveBeenCalledWith({type:'status',label:'Compacting working context',contextCompaction:'running'});
  run.emit({method:'item/completed',params:{threadId:'thread-1',item:{type:'contextCompaction',id:'compact-1'}}});
  expect(await run.steer()!('queued-message','Preserve the original content')).toMatchObject({state:'accepted'});
  await run.steer()!('queued-message','Preserve the original content');
  expect(run.requests.filter(item=>item.method==='turn/steer')).toHaveLength(1);
  expect(run.requests.filter(item=>item.method==='turn/start')).toHaveLength(1);
  expect(run.requests.some(item=>item.method==='thread/compact/start')).toBe(false);
  run.emit({method:'turn/completed',params:{threadId:'thread-1',turn:{id:'turn-1',status:'completed'}}});
  await run.done;
});

it('keeps late guidance queued after clean completion and rejects conflicting retry IDs without another request', async () => {
  const run = fixture(); await vi.waitFor(() => expect(run.steer()).toBeTypeOf('function'));
  const steer = run.steer()!;
  await steer('a', 'First direction');
  expect((await steer('a', 'Different direction')).state).toBe('rejected');
  run.emit({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });
  await run.done;
  expect((await steer('b', 'Too late')).state).toBe('queued');
  expect(run.requests.filter(item => item.method === 'turn/steer')).toHaveLength(1);
});

it('aborts the turn when the user stops, rather than leaving accepted steering running', async () => {
  const controller = new AbortController();
  const run = fixture(false, controller.signal); await vi.waitFor(() => expect(run.steer()).toBeTypeOf('function'));
  await run.steer()!('a', 'Another direction');
  const stopped = expect(run.done).rejects.toThrow('Stopped.');
  controller.abort();
  await stopped;
  expect(run.steer()).toBeUndefined();
  expect(mocks.stopTree).toHaveBeenCalledWith(run.child);
});

it('preserves markdown chunks and ignores messages from other threads', async () => {
  const run = fixture(); await vi.waitFor(() => expect(run.steer()).toBeTypeOf('function'));
  for (const delta of ['```ts\n', 'const x = ', '1;\n```']) run.emit({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', itemId: 'a', delta } });
  run.emit({ method: 'item/agentMessage/delta', params: { threadId: 'other', itemId: 'b', delta: 'Wrong thread' } });
  run.emit({ method: 'item/started', params: { threadId: 'thread-1', item: { id: 'b', type: 'agentMessage' } } });
  run.emit({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', delta: 'Explanation.' } });
  run.emit({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });
  await run.done;
  expect(run.events.mock.calls.map(([event]) => event.type === 'text_delta' ? event.delta : '').join('')).toBe('```ts\nconst x = 1;\n```\n\nExplanation.');
});
it('reports rejected steering without canceling the original work', async () => {
  const run = fixture(true); await vi.waitFor(() => expect(run.steer()).toBeTypeOf('function'));
  expect((await run.steer()!('message-2', 'Different'))?.state).toBe('rejected');
  expect(run.child.kill).not.toHaveBeenCalled();
  run.emit({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });
  await run.done;
});

it('separates distinct assistant messages while preserving chunks within each message', async () => {
  const run = fixture(); await vi.waitFor(() => expect(run.steer()).toBeTypeOf('function'));
  run.emit({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', itemId: 'a', delta: 'First ' } });
  run.emit({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', itemId: 'a', delta: 'answer.' } });
  run.emit({ method: 'item/completed', params: { threadId: 'thread-1', item: { type: 'agentMessage', id: 'a' } } });
  await run.steer()!('steering', 'Focus on solo visitors');
  run.emit({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', itemId: 'b', delta: 'For solo ' } });
  run.emit({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', itemId: 'b', delta: 'visitors.' } });
  run.emit({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });
  await run.done;
  expect(run.events.mock.calls.map(([event]) => event.type === 'text_delta' ? event.delta : '').join('')).toBe('First answer.\n\nFor solo visitors.');
});

it('does not add extra whitespace to an existing paragraph boundary', async () => {
  const run = fixture(); await vi.waitFor(() => expect(run.steer()).toBeTypeOf('function'));
  run.emit({ method: 'item/started', params: { threadId: 'thread-1', item: { type: 'agentMessage', id: 'a' } } });
  run.emit({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', delta: 'First.\n' } });
  run.emit({ method: 'item/started', params: { threadId: 'thread-1', item: { type: 'agentMessage', id: 'b' } } });
  run.emit({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', delta: '\nSecond.' } });
  run.emit({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });
  await run.done;
  expect(run.events.mock.calls.map(([event]) => event.type === 'text_delta' ? event.delta : '').join('')).toBe('First.\n\nSecond.');
});

it('isolates direct-site project instructions without disabling personal skills or global config', async () => {
  const run = fixture(false, undefined, { isolateProjectInstructions: true });
  await vi.waitFor(() => expect(run.steer()).toBeTypeOf('function'));
  run.emit({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });
  await run.done;
  expect(mocks.spawn.mock.calls[0]![1]).toContain('project_root_markers=["AGENTS.md"]');
  expect(mocks.spawn.mock.calls[0]![2].env).toEqual({});
});
it('leaves ordinary workspace project discovery unchanged', async () => {
  const run = fixture();
  await vi.waitFor(() => expect(run.steer()).toBeTypeOf('function'));
  run.emit({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });
  await run.done;
  expect(mocks.spawn.mock.calls[0]![1]).not.toContain('project_root_markers=["AGENTS.md"]');
});
