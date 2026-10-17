import type { PixflowSiteRuntimeState } from '@open-design/contracts';

type Entry<T> = { start: () => Promise<T>; value?: T; transition?: Promise<unknown>; state: PixflowSiteRuntimeState; leases: number; lastUsedAt: number };
/** Retains site identity while independently releasing and recreating its processes. */
export class BridgeSiteRuntimes<T extends { close(): Promise<void> }> {
  private readonly entries = new Map<string, Entry<T>>();
  private closed = false;
  readonly warmIdleLimit: number;
  readonly idleGraceMs: number;
  constructor(private readonly options: {
    now?: () => number; warmIdleLimit?: number; idleGraceMs?: number;
    busy?: (runtime: T) => Promise<boolean>;
    drain?: (runtime: T) => Promise<boolean>;
    alive?: (runtime: T) => boolean;
  } = {}) {
    this.warmIdleLimit = options.warmIdleLimit ?? 5;
    this.idleGraceMs = options.idleGraceMs ?? 300_000;
  }
  private now() { return this.options.now?.() ?? Date.now(); }
  get(key: string): T | undefined { return this.entries.get(key)?.value; }
  snapshot(key: string) {
    const entry = this.entries.get(key);
    return entry ? { state: entry.value && this.options.alive?.(entry.value) === false ? 'unavailable' as const : entry.leases ? 'working' as const : entry.state, lastUsedAt: entry.lastUsedAt } : null;
  }
  async connect(key: string, start?: () => Promise<T>): Promise<T> {
    if (this.closed) throw new Error('Bridge is stopping.');
    let entry = this.entries.get(key);
    if (!entry) {
      if (!start) throw new Error('Unknown site.');
      entry = { start, state: 'sleeping', leases: 0, lastUsedAt: this.now() };
      this.entries.set(key, entry);
    } else if (start) entry.start = start;
    if (entry.transition) {
      await entry.transition;
      if (entry.value) return entry.value;
      return this.connect(key);
    }
    if (entry.value && this.options.alive?.(entry.value) === false) {
      // Only a confirmed exited process can be replaced without an idle proof.
      // An unresponsive but living daemon may still own work and is retained.
      const retiring = entry.value.close().then(() => { entry.value = undefined; });
      entry.transition = retiring;
      try { await retiring; } finally { if (entry.transition === retiring) entry.transition = undefined; }
      return this.connect(key);
    }
    if (entry.value) return entry.value;
    entry.state = 'waking';
    const pending = Promise.resolve().then(entry.start).then(value => {
      entry.value = value; entry.state = 'ready'; entry.lastUsedAt = this.now();
      return value;
    }).catch(error => { entry.state = 'unavailable'; throw error; });
    entry.transition = pending;
    try { return await pending; }
    finally { if (entry.transition === pending) entry.transition = undefined; }
  }
  /** A lease spans the entire forwarded request, including its response stream. */
  async acquire(key: string, active = true): Promise<(() => void) | null> {
    while (true) {
      if (active) await this.connect(key);
      else {
        if (this.closed) return null;
        const passive = this.entries.get(key);
        if (!passive?.value || passive.transition || passive.state === 'unavailable') return null;
      }
      if (this.closed) throw new Error('Bridge is stopping.');
      const entry = this.entries.get(key)!;
      if (entry.transition || !entry.value) continue;
      entry.leases++; if (active) entry.lastUsedAt = this.now();
      let released = false;
      return () => { if (!released) { released = true; entry.leases--; if (active) entry.lastUsedAt = this.now(); } };
    }
  }
  async status(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    const snapshot = this.snapshot(key)!;
    if (entry.value && !entry.transition && snapshot.state === 'ready') {
      const busy = await this.options.busy?.(entry.value).catch(() => true);
      if (busy) return { ...snapshot, state: 'working' as const };
    }
    return this.snapshot(key);
  }
  async sleep(key: string): Promise<boolean> {
    const entry = this.entries.get(key);
    if (!entry || entry.leases || entry.transition || this.closed) return false;
    if (!entry.value) return entry.state === 'sleeping';
    const runtime = entry.value;
    entry.state = 'releasing';
    const pending = Promise.resolve().then(async () => {
      if (!this.options.drain || !await this.options.drain(runtime).catch(() => false)) {
        entry.state = 'ready'; return false;
      }
      try { await runtime.close(); }
      catch (error) { entry.state = 'unavailable'; throw error; }
      entry.value = undefined; entry.state = 'sleeping'; return true;
    });
    entry.transition = pending;
    try { return await pending; }
    finally { if (entry.transition === pending) entry.transition = undefined; }
  }
  async releaseExcess(): Promise<void> {
    const idle: Array<[string, Entry<T>]> = [];
    for (const [key, entry] of this.entries) {
      if ((await this.status(key))?.state === 'ready') idle.push([key, entry]);
    }
    idle.sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt);
    let excess = idle.length - this.warmIdleLimit;
    for (const [key, entry] of idle) {
      if (excess <= 0) break;
      if (this.now() - entry.lastUsedAt >= this.idleGraceMs && await this.sleep(key)) excess--;
    }
  }
  async close(): Promise<void> {
    this.closed = true;
    await Promise.all([...this.entries.values()].map(async entry => {
      await entry.transition?.catch(() => undefined);
      await entry.value?.close();
    }));
    this.entries.clear();
  }
}
