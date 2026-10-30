import type { Express, RequestHandler } from 'express';
import { getClaudeUsage } from '../runtimes/claude-usage.js';
import type { CodexUsage } from '@open-design/contracts';

export function registerClaudeUsageRoute(app: Express, authorize: RequestHandler, env: () => Record<string, string>) {
  const pending = new Map<string, Promise<CodexUsage>>();
  const route = '/api/agents/claude/usage';
  app.options(route, authorize, (_req, res) => { res.sendStatus(204); });
  app.get(route, authorize, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const model = typeof req.query.model === 'string' ? req.query.model.trim().slice(0, 200) : '';
      const configured = env(), key = JSON.stringify([configured, model]);
      let read = pending.get(key);
      if (!read) {
        read = getClaudeUsage(configured, model).finally(() => pending.delete(key));
        pending.set(key, read);
      }
      res.json(await read);
    }
    catch { res.json({ status: 'unavailable', source: null, checkedAt: new Date().toISOString(), windows: [] }); }
  });
}

