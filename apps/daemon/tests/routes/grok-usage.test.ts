import express from 'express';
import { afterEach, expect, test, vi } from 'vitest';
import type { Server } from 'node:http';
vi.mock('../../src/runtimes/grok-usage.js', () => ({ getGrokUsage: vi.fn() }));
import { getGrokUsage } from '../../src/runtimes/grok-usage.js';
import { registerGrokUsageRoute } from '../../src/routes/grok-usage.js';
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }))); vi.clearAllMocks(); });
async function fixture() {
  const app = express();
  registerGrokUsageRoute(app, (req, res, next) => { if (req.headers['x-test-auth'] !== 'allowed') res.sendStatus(403); else next(); }, () => ({}));
  const server = await new Promise<Server>(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); servers.push(server);
  return `http://127.0.0.1:${(server.address() as { port: number }).port}/api/agents/grok-build/usage`;
}
test('usage is protected by the existing Bridge authorization gate', async () => {
  const url = await fixture(); expect((await fetch(url)).status).toBe(403);
  expect(getGrokUsage).not.toHaveBeenCalled();
});

test('concurrent models share the same account read and OPTIONS remains protected', async () => {
  let finish!: (value: any) => void;
  vi.mocked(getGrokUsage).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const url = await fixture(), headers = { 'x-test-auth': 'allowed' };
  expect((await fetch(url, { method: 'OPTIONS' })).status).toBe(403);
  const first = fetch(url + '?model=grok-4.7', { headers });
  await vi.waitFor(() => expect(getGrokUsage).toHaveBeenCalledOnce());
  const second = fetch(url + '?model=grok-4.5', { headers });
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(getGrokUsage).toHaveBeenCalledOnce();
  finish({ status: 'available', source: 'cli', checkedAt: '2026-11-06T00:00:00Z', windows: [] });
  expect((await first).status).toBe(200); expect((await second).status).toBe(200);
});
test('authorized read is never browser-cached and errors contain no diagnostics', async () => {
  vi.mocked(getGrokUsage).mockRejectedValue(new Error('private account details'));
  const response = await fetch(await fixture(), { headers: { 'x-test-auth': 'allowed' } });
  expect(response.headers.get('cache-control')).toBe('no-store');
  const value = await response.json() as { status: string }; expect(value.status).toBe('unavailable'); expect(JSON.stringify(value)).not.toContain('private');
});
