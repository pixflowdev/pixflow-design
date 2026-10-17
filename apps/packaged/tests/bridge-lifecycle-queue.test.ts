import { describe, expect, it } from 'vitest';
import { createBridgeLifecycleQueue } from '../src/bridge-lifecycle-queue.js';

describe('Bridge lifecycle ownership', () => {
  it('serializes concurrent switches and shares cleanup without admitting new starts', async () => {
    const queue = createBridgeLifecycleQueue();
    const events: string[] = [];
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const first = queue.run(async () => { events.push('stop-first'); await pending; events.push('start-first'); });
    const second = queue.run(async () => { events.push('stop-second'); events.push('start-second'); });
    const cleanup = () => { events.push('cleanup'); return Promise.resolve(); };
    const closing = queue.close(cleanup);
    expect(queue.close(cleanup)).toBe(closing);
    await expect(queue.run(async () => { events.push('late-start'); })).rejects.toThrow('shutting down');
    await Promise.resolve();
    expect(events).toEqual(['stop-first']);
    release();
    await Promise.all([first, second, closing]);
    expect(events).toEqual(['stop-first','start-first','stop-second','start-second','cleanup']);
  });
  it('can stop after a failed startup', async () => {
    const queue = createBridgeLifecycleQueue();
    await expect(queue.run(async () => { throw new Error('start failed'); })).rejects.toThrow('start failed');
    await expect(queue.close(async () => 'closed')).resolves.toBe('closed');
  });
});
