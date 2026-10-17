import express from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { installPixflowRuntimeIdle, registerPixflowRuntimeWork } from '../../src/pixflow/runtime-idle.js';

describe('runtime work ownership', () => {
  it('requires the private control token, protects detached work and drains atomically', async () => {
    const app = express();
    let voice = false;
    installPixflowRuntimeIdle(app, { token: 'private-test-token', busy: () => false });
    registerPixflowRuntimeWork(app, () => voice);
    app.post('/work', (_req, res) => res.json({ accepted: true }));
    const server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const headers = { Authorization: 'Bearer private-test-token' };
    try {
      expect((await fetch(`${base}/api/pixflow/runtime-idle`)).status).toBe(403);
      expect((await fetch(`${base}/api/pixflow/runtime-idle`, { headers: { ...headers, Origin: 'https://site.test' } })).status).toBe(403);
      voice = true;
      expect(await (await fetch(`${base}/api/pixflow/runtime-idle`, { method: 'POST', headers })).json()).toEqual({ ok: false, busy: true });
      expect((await fetch(`${base}/work`, { method: 'POST' })).status).toBe(200);
      voice = false;
      expect(await (await fetch(`${base}/api/pixflow/runtime-idle`, { method: 'POST', headers })).json()).toEqual({ ok: true, busy: false, draining: true });
      expect((await fetch(`${base}/work`, { method: 'POST' })).status).toBe(503);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
