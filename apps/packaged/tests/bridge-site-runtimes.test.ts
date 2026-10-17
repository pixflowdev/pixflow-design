import { describe, expect, it, vi } from 'vitest';
import { BridgeSiteRuntimes } from '../src/bridge-site-runtimes.js';

describe('independent Bridge site runtimes', () => {
  it('recreates an exited daemon while retaining the other site', async () => {
    const exited = new Set<number>();
    let id = 0;
    const close = vi.fn(async () => {});
    const start = vi.fn(async () => ({ id: ++id, close }));
    const pool = new BridgeSiteRuntimes<{ id: number; close(): Promise<void> }>({ alive: runtime => !exited.has(runtime.id) });
    const first = await pool.connect('a', start);
    const other = await pool.connect('b', start);
    exited.add(first.id);
    expect(pool.snapshot('a')?.state).toBe('unavailable');
    const replacements = await Promise.all([pool.connect('a'), pool.connect('a')]);
    expect(replacements[0]).toBe(replacements[1]);
    expect(start).toHaveBeenCalledTimes(3);
    expect(pool.get('b')).toBe(other);
    expect(close).toHaveBeenCalledOnce();
    await pool.close();
  });
  it('releases only excess idle sites after the grace period and preserves all identities', async () => {
    let now = 0;
    const busy = new Set<number>();
    const pool = new BridgeSiteRuntimes<{ id: number; close(): Promise<void> }>({
      now: () => now, busy: async value => busy.has(value.id), drain: async value => !busy.has(value.id),
    });
    const closes = Array.from({ length: 8 }, () => vi.fn(async () => {}));
    for (let i = 0; i < 8; i++) { now++; await pool.connect(String(i), async () => ({ id: i, close: closes[i]! })); }
    busy.add(0); busy.add(1);
    await pool.releaseExcess();
    expect(closes.every(close => close.mock.calls.length === 0)).toBe(true);
    now += 300_000;
    await pool.releaseExcess();
    expect(closes[2]).toHaveBeenCalledOnce();
    expect(pool.snapshot('2')?.state).toBe('sleeping');
    expect(pool.snapshot('7')).not.toBeNull();
    expect(closes[0]).not.toHaveBeenCalled();
    await pool.connect('2');
    expect(pool.snapshot('2')?.state).toBe('ready');
    await pool.close();
  });

  it('protects streams and disconnected work; passive requests do not reset idle age', async () => {
    let now = 1;
    let busy = false;
    const drain = vi.fn(async () => !busy);
    const pool = new BridgeSiteRuntimes({ now: () => now, drain, busy: async () => busy });
    await pool.connect('a', async () => ({ close: async () => {} }));
    now = 100;
    const release = await pool.acquire('a', false);
    expect(await pool.sleep('a')).toBe(false);
    expect(drain).not.toHaveBeenCalled();
    release!();
    expect(pool.snapshot('a')?.lastUsedAt).toBe(1);
    busy = true;
    expect((await pool.status('a'))?.state).toBe('working');
    expect(await pool.sleep('a')).toBe(false);
    busy = false;
    expect(await pool.sleep('a')).toBe(true);
    await pool.close();
  });

  it('queues a request during release and wakes exactly once without duplicating delivery', async () => {
    let complete!: () => void;
    const start = vi.fn(async () => ({ close: vi.fn(() => new Promise<void>(resolve => { complete = resolve; })) }));
    const pool = new BridgeSiteRuntimes({ drain: async () => true });
    await pool.connect('a', start);
    const sleeping = pool.sleep('a');
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const first = pool.acquire('a');
    const second = pool.acquire('a');
    expect(start).toHaveBeenCalledOnce();
    complete();
    await sleeping;
    const releases = await Promise.all([first, second]);
    expect(start).toHaveBeenCalledTimes(2);
    releases.forEach(release => release!());
    const closing = pool.close();
    await Promise.resolve(); complete(); await closing;
  });
  it('keeps two sites alive and coalesces reconnects to the same site', async () => {
    const pool = new BridgeSiteRuntimes<{ close(): Promise<void> }>();
    const first = { close: vi.fn(async () => {}) };
    const second = { close: vi.fn(async () => {}) };
    const start = vi.fn(async () => first);
    const results = await Promise.all([pool.connect('a', start), pool.connect('a', start), pool.connect('b', async () => second)]);
    expect(results).toEqual([first, first, second]);
    expect(start).toHaveBeenCalledTimes(1);
    expect(first.close).not.toHaveBeenCalled();
    await pool.close();
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(second.close).toHaveBeenCalledTimes(1);
  });

  it('does not cap connected sites at five or stop existing work after a failed start', async () => {
    const pool = new BridgeSiteRuntimes<{ close(): Promise<void> }>();
    const close = vi.fn(async () => {});
    await Promise.all(Array.from({ length: 12 }, (_, i) => pool.connect(String(i), async () => ({ close }))));
    await expect(pool.connect('failed', async () => { throw new Error('startup failed'); })).rejects.toThrow('startup failed');
    expect(close).not.toHaveBeenCalled();
    await pool.connect('failed', async () => ({ close }));
    await pool.close();
    expect(close).toHaveBeenCalledTimes(13);
  });

  it('closes a runtime that finishes starting during shutdown', async () => {
    const pool = new BridgeSiteRuntimes<{ close(): Promise<void> }>();
    const close = vi.fn(async () => {});
    let ready!: (value: { close(): Promise<void> }) => void;
    const starting = pool.connect('a', () => new Promise(resolve => { ready = resolve; }));
    await Promise.resolve();
    const closing = pool.close();
    await expect(pool.connect('b', async () => ({ close }))).rejects.toThrow('stopping');
    ready({ close });
    await starting;
    await closing;
    expect(close).toHaveBeenCalledTimes(1);
  });
});
