import type { Express } from 'express';

const readersByApp = new WeakMap<Express, Set<() => boolean>>();
/** Work ownership survives a disconnected HTTP client, including voice calls. */
export function registerPixflowRuntimeWork(app: Express, reader: () => boolean): () => void {
  const workReaders = readersByApp.get(app) ?? new Set<() => boolean>();
  readersByApp.set(app, workReaders);
  workReaders.add(reader);
  return () => workReaders.delete(reader);
}

export function installPixflowRuntimeIdle(app: Express, options: {
  token?: string; busy: () => boolean;
}): void {
  if (!options.token) return;
  let requests = 0;
  let draining = false;
  const busy = () => requests > 0 || options.busy() || [...(readersByApp.get(app) ?? [])].some(reader => reader());
  app.use((req, res, next) => {
    if (req.path === '/api/pixflow/runtime-idle') {
      if (req.headers.authorization !== `Bearer ${options.token}` || req.headers.origin) { res.status(403).end(); return; }
      if (req.method === 'POST') {
        if (busy()) { res.json({ ok: false, busy: true }); return; }
        // Admission and observation happen in the same event-loop turn. Once
        // acknowledged, the owning gateway closes this runtime before waking it.
        draining = true;
      }
      res.json({ ok: true, busy: busy(), draining });
      return;
    }
    if (draining) { res.status(503).json({ code: 'PIXFLOW_RUNTIME_SLEEPING' }); return; }
    if (req.path === '/api/health' || req.path === '/api/pixflow/site-context') { next(); return; }
    requests++;
    let finished = false;
    const release = () => { if (!finished) { finished = true; requests--; } };
    res.once('finish', release); res.once('close', release);
    next();
  });
}
