import fs from 'node:fs/promises';
import path from 'node:path';
import type { PixflowBricksLiveContext, PixflowDirectSiteSession } from '@open-design/contracts';

function isContext(value: unknown): value is PixflowBricksLiveContext {
  const item = value as PixflowBricksLiveContext | undefined;
  return item?.schemaVersion === 1 && typeof item.documentId === 'string'
    && typeof item.revision === 'number' && typeof item.postId === 'number'
    && typeof item.markdown === 'string' && Boolean(item.sections && typeof item.sections === 'object');
}

/** Mirrors existing builder snapshots, never asks Bricks to compile or inspect DOM. */
export async function startBricksContextMirror(workspace: string, session: PixflowDirectSiteSession, canvasId: string, initial?: unknown) {
  let snapshot = isContext(initial) ? initial : undefined;
  let knownRevision = '';
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  let lastState = '';
  let failures = 0;
  const controller = new AbortController();
  const write = async (connection: string) => {
    const signature = `${knownRevision}:${connection}`;
    if (signature === lastState) return;
    const metadata = { canvasId, connection, mirroredAt: new Date().toISOString(), context: snapshot || null };
    const markdown = `Mirror connection: ${connection}. Canvas: ${canvasId}.\n\n${snapshot?.markdown || '# Live Bricks context\n\nNo compiled snapshot has reached the bridge yet.'}`;
    // Each file is atomically replaced. Revision headers identify the pair during a read.
    for (const [name, content] of [['BRICKS-CONTEXT.json', JSON.stringify(metadata)], ['BRICKS-CONTEXT.md', markdown]] as const) {
      const target = path.join(workspace, name);
      await fs.writeFile(`${target}.tmp`, content, 'utf8');
      await fs.rename(`${target}.tmp`, target);
    }
    lastState = signature;
  };
  if (snapshot) knownRevision = `${snapshot.documentId}:${snapshot.revision}`;
  await write('awaiting connection confirmation');
  const poll = async () => {
    try {
      const response = await fetch(session.endpoint, { method: 'POST', redirect: 'error',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ tool: 'bricks.context', arguments: { canvasId, revision: knownRevision } }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const value = await response.json() as { context?: unknown; connected?: boolean; postId?: number; revision?: string };
      if (stopped) return;
      if (isContext(value.context)) { snapshot = value.context; knownRevision = `${snapshot.documentId}:${snapshot.revision}`; }
      else if (snapshot && (value.postId !== snapshot.postId || !value.revision)) { snapshot = undefined; knownRevision = ''; }
      failures = 0;
      await write(value.connected ? 'connected' : 'stale: builder heartbeat unavailable');
    } catch (error) {
      if (!stopped) { failures++; await write(`stale: ${error instanceof Error ? error.message : 'transport unavailable'}`); }
    }
    if (!stopped) timer = setTimeout(() => { inFlight = poll(); void inFlight.catch(() => undefined); }, Math.min(30000, 5000 * 2 ** Math.min(failures, 3)));
  };
  inFlight = poll(); void inFlight.catch(() => undefined);
  return async () => {
    stopped = true; clearTimeout(timer); controller.abort();
    await inFlight?.catch(() => undefined);
    await write('stale: agent run ended; mirroring stopped');
  };
}
