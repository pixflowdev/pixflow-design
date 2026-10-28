import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reattachDaemonRun } from '../../src/providers/daemon';

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function event(id: number, name: string, data: Record<string, unknown>): string {
  return `id: ${id}\nevent: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

type ReadResult = { value: Uint8Array; done: false } | { value: undefined; done: true };

function reader(chunks: Uint8Array[], failure?: Error) {
  let index = 0;
  return {
    read: (): Promise<ReadResult> => {
      if (index < chunks.length) return Promise.resolve({ value: chunks[index++]!, done: false });
      if (failure) return Promise.reject(failure);
      return Promise.resolve({ value: undefined, done: true });
    },
    cancel: vi.fn(() => Promise.resolve()),
  };
}

function streamResponse(streamReader: ReturnType<typeof reader>): Response {
  return {
    ok: true,
    status: 200,
    body: { getReader: () => streamReader } as unknown as ReadableStream<Uint8Array>,
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

describe('daemon SSE reconnection', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
  it('never treats an unavailable full replay as success just because the run finished',async()=>{
    const fetchMock=vi.fn(async()=>streamResponse(reader([bytes(event(1,'error',{error:{code:'RUN_REPLAY_UNAVAILABLE',message:'Keep this tab open and retry.'}}))])));
    globalThis.fetch=fetchMock as unknown as typeof fetch;const onDone=vi.fn(),onError=vi.fn();
    await reattachDaemonRun({runId:'missing-replay',signal:new AbortController().signal,handlers:{onDelta:vi.fn(),onAgentEvent:vi.fn(),onDone,onError}});
    expect(onDone).not.toHaveBeenCalled();expect(onError).toHaveBeenCalledWith(expect.objectContaining({code:'RUN_REPLAY_UNAVAILABLE'}));expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces an explicit native disconnect without falling back or replaying a run', async () => {
    const failure=Object.assign(new Error('Native connection closed; request not replayed'),{name:'PixflowNativeDisconnectedError'});
    const fetchMock=vi.fn(async()=>streamResponse(reader([],failure)));
    globalThis.fetch=fetchMock as unknown as typeof fetch;
    const onError=vi.fn(),onDone=vi.fn();
    await reattachDaemonRun({runId:'native-disconnect',signal:new AbortController().signal,handlers:{onDelta:vi.fn(),onAgentEvent:vi.fn(),onDone,onError}});
    expect(onError).toHaveBeenCalledWith(failure);expect(onDone).not.toHaveBeenCalled();expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resumes from the last event when reader.read rejects', async () => {
    const first = reader([
      bytes(event(1, 'start', { bin: 'codex' })),
      bytes(event(2, 'stdout', { chunk: 'hello ' })),
    ], new TypeError('network dropped'));
    const second = reader([
      bytes(event(3, 'stdout', { chunk: 'world' })),
      bytes(event(4, 'end', { status: 'succeeded', code: 0 })),
    ]);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/events')) return streamResponse(url.includes('after=2') ? second : first);
      return jsonResponse({ status: 'succeeded', exitCode: 0, signal: null });
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const deltas: string[] = [];
    let completed = '';
    let failure: Error | null = null;
    await reattachDaemonRun({
      runId: 'sse-reconnect',
      signal: new AbortController().signal,
      handlers: {
        onDelta: (text) => deltas.push(text),
        onDone: (text) => { completed = text; },
        onError: (error) => { failure = error; },
        onAgentEvent: () => {},
      },
      onRunStatus: () => {},
    });

    expect(deltas).toEqual(['hello ', 'world']);
    expect(completed).toBe('hello world');
    expect(failure).toBeNull();
    expect(first.cancel).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/events'))).toHaveLength(2);
  });

  it('does not treat handler exceptions as reconnectable network failures', async () => {
    const finite = reader([
      bytes(event(1, 'start', { bin: 'codex' })),
      bytes(event(2, 'stdout', { chunk: 'boom' })),
    ]);
    const fetchMock = vi.fn(async () => streamResponse(finite));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(reattachDaemonRun({
      runId: 'handler-error',
      signal: new AbortController().signal,
      handlers: {
        onDelta: () => { throw new Error('handler crashed'); },
        onDone: () => {},
        onError: () => {},
        onAgentEvent: () => {},
      },
      onRunStatus: () => {},
    })).rejects.toThrow('handler crashed');

    expect(fetchMock.mock.calls).toHaveLength(1);
  });
});
