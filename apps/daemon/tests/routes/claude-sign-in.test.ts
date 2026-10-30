import express from 'express';
import type { Server } from 'node:http';
import { afterEach, expect, test, vi } from 'vitest';
const login = vi.hoisted(() => ({ status: vi.fn(), start: vi.fn(), cancel: vi.fn(), openLoginPage: vi.fn(), submitCode: vi.fn() }));
vi.mock('../../src/runtimes/claude-sign-in.js', () => ({ createClaudeSignIn: () => login }));
import { registerClaudeSignInRoutes } from '../../src/routes/claude-sign-in.js';
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); })));
  vi.resetAllMocks();
});
async function fixture() {
  const app = express(); app.use(express.json({ limit: '16kb' }));
  registerClaudeSignInRoutes(app, (req, res, next) => {
    if (req.headers['x-test-auth'] !== 'allowed') res.sendStatus(403); else next();
  }, () => ({}));
  const server = await new Promise<Server>(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as { port: number }).port}/api/agents/claude/sign-in`;
}
test('every sign-in recovery action requires the existing Bridge authorization', async () => {
  const url = await fixture();
  for (const action of ['', '/cancel', '/open-browser', '/code']) {
    expect((await fetch(url + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(403);
    expect((await fetch(url + action, { method: 'OPTIONS' })).status).toBe(403);
  }
  expect((await fetch(url)).status).toBe(403);
  for (const method of Object.values(login)) expect(method).not.toHaveBeenCalled();
});
test('submits only the active-attempt fields and returns status without reflecting the code', async () => {
  const url = await fixture();
  login.submitCode.mockReturnValue({ state: 'waiting', source: 'desktop', attemptId: 'owned', acceptsCode: false });
  const response = await fetch(url + '/code', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-auth': 'allowed' }, body: JSON.stringify({ attemptId: 'owned', code: 'synthetic-code' }) });
  expect(response.status).toBe(200);
  expect(login.submitCode).toHaveBeenCalledWith('owned', 'synthetic-code');
  expect(await response.text()).not.toContain('synthetic-code');
});
test('recovery errors never expose process output and status is not cached', async () => {
  const url = await fixture();
  login.openLoginPage.mockImplementation(() => { throw new Error('private OAuth URL or code'); });
  const response = await fetch(url + '/open-browser', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-auth': 'allowed' }, body: '{}' });
  expect(response.status).toBe(409); expect(await response.text()).not.toContain('private');
  login.status.mockReturnValue({ state: 'idle', source: null });
  expect((await fetch(url, { headers: { 'x-test-auth': 'allowed' } })).headers.get('cache-control')).toBe('no-store');
});
