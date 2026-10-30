import type { Express, RequestHandler } from 'express';
import { getCodexUsage } from '../runtimes/codex-usage.js';
import type { CodexUsage } from '@open-design/contracts';

export function registerCodexUsageRoute(app: Express, authorize: RequestHandler, env: () => Record<string, string>) {
  const pending = new Map<string, Promise<CodexUsage>>();
  const route = '/api/agents/codex/usage';
  app.options(route, authorize, (_req, res) => { res.sendStatus(204); });
  app.get(route, authorize, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const configured = env(), key = JSON.stringify(configured);
      let read = pending.get(key);
      if (!read) {
        read = getCodexUsage(configured).finally(() => pending.delete(key));
        pending.set(key, read);
      }
      res.json(await read);
    }
    catch { res.json({ status: 'unavailable', source: null, checkedAt: new Date().toISOString(), windows: [] }); }
  });
}
