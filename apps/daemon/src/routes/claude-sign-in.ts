import type { Express, RequestHandler } from 'express';
import { createClaudeSignIn } from '../runtimes/claude-sign-in.js';

export function registerClaudeSignInRoutes(app: Express, authorize: RequestHandler, env: () => Record<string, string>) {
  const login = createClaudeSignIn(env);
  const route = '/api/agents/claude/sign-in';
  app.options([route, `${route}/cancel`], authorize, (_req, res) => { res.sendStatus(204); });
  app.get(route, authorize, (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(login.status()); });
  app.post(route, authorize, (_req, res) => { res.json(login.start()); });
  app.post(`${route}/cancel`, authorize, (_req, res) => { res.json(login.cancel()); });
  return () => login.cancel();
}
