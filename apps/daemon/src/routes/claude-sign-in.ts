import type { Express, RequestHandler } from 'express';
import { createClaudeSignIn } from '../runtimes/claude-sign-in.js';

export function registerClaudeSignInRoutes(app: Express, authorize: RequestHandler, env: () => Record<string, string>) {
  const login = createClaudeSignIn(env);
  const route = '/api/agents/claude/sign-in';
  app.options([route, `${route}/cancel`, `${route}/open-browser`, `${route}/code`], authorize, (_req, res) => { res.sendStatus(204); });
  app.get(route, authorize, (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(login.status()); });
  app.post(route, authorize, (_req, res) => { res.json(login.start()); });
  app.post(`${route}/cancel`, authorize, (_req, res) => { res.json(login.cancel()); });
  app.post(`${route}/open-browser`, authorize, (req, res) => {
    try { res.json(login.openLoginPage(req.body?.attemptId)); }
    catch { res.status(409).json({ error: 'The sign-in page is unavailable for this attempt. Check its current status.' }); }
  });
  app.post(`${route}/code`, authorize, (req, res) => {
    try { res.json(login.submitCode(req.body?.attemptId, req.body?.code)); }
    catch { res.status(409).json({ error: 'The code was not accepted for this attempt. Check its current status.' }); }
  });
  return () => login.cancel();
}
