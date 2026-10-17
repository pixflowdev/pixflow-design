import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startBricksContextMirror } from '../../src/pixflow/bricks-context-mirror.js';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('clears a previous document when the same page reconnects without a snapshot', async () => {
  vi.useFakeTimers();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'context-reconnect-'));
  const snapshot = { schemaVersion: 1, documentId: 'old', revision: 2, postId: 12, status: 'ready', updatedAt: 'now', markdown: 'OLD DOCUMENT', sections: {} };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ context: null, revision: '', connected: true, postId: 12 })));
  const stop = await startBricksContextMirror(dir, { endpoint: 'https://site.invalid/tools', token: 'private', expiresAt: 9999999999, writable: false }, 'tab', snapshot);
  try {
    await vi.waitFor(async () => {
      const file = await fs.readFile(path.join(dir, 'BRICKS-CONTEXT.md'), 'utf8');
      expect(file).toContain('No compiled snapshot');
      expect(file).not.toContain('OLD DOCUMENT');
    });
  } finally { await stop(); await fs.rm(dir, { recursive: true, force: true }); }
});
it('mirrors revisions, marks transport failure stale, and stops on run completion', async () => {
  vi.useFakeTimers();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'context-mirror-'));
  const snapshot = { schemaVersion: 1, documentId: 'doc', revision: 1, postId: 12, status: 'ready', updatedAt: 'now', markdown: '# Variables\n--brand: blue', sections: { variables: [] } };
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ context: snapshot, connected: true, postId: 12 }))
    .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));
  vi.stubGlobal('fetch', fetcher);
  const stop = await startBricksContextMirror(dir, { endpoint: 'https://site.invalid/tools', token: 'private-token', expiresAt: 9999999999, writable: false }, 'tab', snapshot);
  try {
    // Real filesystem work completes independently of fake timers.
    await vi.waitFor(async () => expect(await fs.readFile(path.join(dir, 'BRICKS-CONTEXT.md'), 'utf8')).toContain('Mirror connection: connected'));
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(async () => expect(await fs.readFile(path.join(dir, 'BRICKS-CONTEXT.md'), 'utf8')).toContain('stale: HTTP 403'));
    expect(JSON.parse(fetcher.mock.calls[1]![1].body).arguments.revision).toBe('doc:1');
    await stop();
    expect(await fs.readFile(path.join(dir, 'BRICKS-CONTEXT.md'), 'utf8')).toContain('mirroring stopped');
    expect(await fs.readFile(path.join(dir, 'BRICKS-CONTEXT.json'), 'utf8')).not.toContain('private-token');
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally { await stop(); await fs.rm(dir, { recursive: true, force: true }); }
});
