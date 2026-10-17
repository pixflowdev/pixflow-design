import crypto from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';

import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createPixflowLicenseEntitlementGate,
  isPixflowLicenseEntitlementRequired,
} from '../src/pixflow-license-entitlement.js';

const roots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function entitlementToken(expiresAt: number, graceExpiresAt: number): string {
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    product: 'pixflow-design',
    expires_at_unix: expiresAt,
    grace_expires_at_unix: graceExpiresAt,
    site_host: 'local.test',
  })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', 'pixflow-design-local-entitlement-v1')
    .update(payload)
    .digest('hex');
  return `${payload}.${signature}`;
}

async function startGate(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'pixflow-entitlement-'));
  roots.push(root);
  const app = express();
  app.use(express.json());
  const gate = createPixflowLicenseEntitlementGate(root);
  gate.registerRoutes(app);
  app.use('/api', gate.middleware);
  app.get('/api/catalog', (_req, res) => res.json({ ok: true }));
  app.post('/api/generate', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (address == null || typeof address === 'string') throw new Error('test server did not bind');
  return `http://127.0.0.1:${address.port}`;
}

describe('Pixflow bridge license entitlement', () => {
  it('only enables enforcement for the standalone bridge runtime', () => {
    expect(isPixflowLicenseEntitlementRequired({})).toBe(false);
    expect(isPixflowLicenseEntitlementRequired({ PIXFLOW_DESIGN_BRIDGE_VERSION: '1.0.9' })).toBe(true);
    expect(isPixflowLicenseEntitlementRequired({ PIXFLOW_DESIGN_BRIDGE_DATA_DIR: 'C:/Pixflow/data' })).toBe(true);
  });

  it('allows catalog reads but blocks protected writes without entitlement', async () => {
    const baseUrl = await startGate();
    expect((await fetch(`${baseUrl}/api/catalog`)).status).toBe(200);
    const response = await fetch(`${baseUrl}/api/generate`, { method: 'POST' });
    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'PIXFLOW_LICENSE_REQUIRED' },
    });
  });

  it('accepts a valid WordPress-issued entitlement and unlocks writes', async () => {
    const baseUrl = await startGate();
    const now = Math.floor(Date.now() / 1000);
    const install = await fetch(`${baseUrl}/api/pixflow/license-entitlement`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: entitlementToken(now + 3600, now + 7200) }),
    });
    expect(install.status).toBe(200);
    await expect(install.json()).resolves.toMatchObject({ valid: true, grace: false });
    expect((await fetch(`${baseUrl}/api/generate`, { method: 'POST' })).status).toBe(200);
  });

  it('rejects an expired entitlement without entering a valid state', async () => {
    const baseUrl = await startGate();
    const now = Math.floor(Date.now() / 1000);
    const install = await fetch(`${baseUrl}/api/pixflow/license-entitlement`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: entitlementToken(now - 7200, now - 3600) }),
    });
    expect(install.status).toBe(403);
    expect((await fetch(`${baseUrl}/api/generate`, { method: 'POST' })).status).toBe(402);
  });
});
