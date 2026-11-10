import type { Express, RequestHandler } from 'express';
import { getGrokUsage } from '../runtimes/grok-usage.js';
import type { CodexUsage } from '@open-design/contracts';

export function registerGrokUsageRoute(app: Express, authorize: RequestHandler, env: () => Record<string, string>) {
  const pending = new Map<string, Promise<CodexUsage>>();
  const route = '/api/agents/grok-build/usage';
  app.options(route, authorize, (_req, res) => { res.sendStatus(204); });
  app.get(route, authorize, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const configured = env(), key = JSON.stringify(configured);
      let read = pending.get(key);
      if (!read) {
        read = getGrokUsage(configured).finally(() => pending.delete(key));
        pending.set(key, read);
      }
      res.json(await read);
    }
    catch { res.json({ status: 'unavailable', source: null, checkedAt: new Date().toISOString(), windows: [] }); }
  });
}
