import express from 'express';
import { afterEach, expect, test, vi } from 'vitest';
import type { Server } from 'node:http';
vi.mock('../../src/runtimes/claude-usage.js', () => ({ getClaudeUsage: vi.fn() }));
import { getClaudeUsage } from '../../src/runtimes/claude-usage.js';
import { registerClaudeUsageRoute } from '../../src/routes/claude-usage.js';
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }))); vi.clearAllMocks(); });
async function fixture() {
  const app = express();
  registerClaudeUsageRoute(app, (req, res, next) => { if (req.headers['x-test-auth'] !== 'allowed') res.sendStatus(403); else next(); }, () => ({}));
  const server = await new Promise<Server>(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); servers.push(server);
  return `http://127.0.0.1:${(server.address() as { port: number }).port}/api/agents/claude/usage`;
}
test('usage is protected by the existing Bridge authorization gate', async () => {
  const url = await fixture(); expect((await fetch(url)).status).toBe(403);
  expect(getClaudeUsage).not.toHaveBeenCalled();
});
test('authorized read is never browser-cached and errors contain no diagnostics', async () => {
  vi.mocked(getClaudeUsage).mockRejectedValue(new Error('private account details'));
  const response = await fetch(await fixture(), { headers: { 'x-test-auth': 'allowed' } });
  expect(response.headers.get('cache-control')).toBe('no-store');
  const value = await response.json() as { status: string }; expect(value.status).toBe('unavailable'); expect(JSON.stringify(value)).not.toContain('private');
});

