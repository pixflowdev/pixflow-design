import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import type { PixflowFrameworkDesignSystemProfile } from '@open-design/contracts';

import { registerPixflowFrameworkDesignSystemRoutes } from '../src/routes/pixflow-framework-design-systems.js';

const roots: string[] = [];
const servers: Array<{ close: (callback: (error?: Error) => void) => void }> = [];

const profile: PixflowFrameworkDesignSystemProfile = {
  colors: {
    main: { background: '#ffffff', foreground: '#f8fafc', heading: '#0f172a', text: '#334155', accent: '#2563eb' },
    secondary: { background: '#eff6ff', foreground: '#dbeafe', heading: '#172554', text: '#1e3a8a', accent: '#3b82f6' },
    tertiary: { background: '#020617', foreground: '#0f172a', heading: '#ffffff', text: '#cbd5e1', accent: '#60a5fa' },
  },
  headingFont: 'Inter',
  bodyFont: 'Inter',
  designStyle: 'default',
  buttonRadius: 'medium',
  surfaceRadius: 'medium',
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function startRoutes(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pixflow-framework-routes-'));
  roots.push(root);
  const app = express();
  app.use(express.json());
  registerPixflowFrameworkDesignSystemRoutes(app, { userDesignSystemsRoot: root });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  servers.push(server);
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe('Pixflow Framework design-system routes', () => {
  it('publishes and reads the same lossless profile through HTTP', async () => {
    const base = await startRoutes();
    const published = await fetch(`${base}/api/design-systems/pixflow-framework`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'HTTP Route System',
        routeId: 'pixflow-native-bricks',
        profile,
      }),
    });
    expect(published.status).toBe(201);
    const result = await published.json() as { designSystemId: string; syncHash: string };
    expect(result.designSystemId).toMatch(/^user:/);
    expect(result.syncHash).toMatch(/^[a-f0-9]{64}$/);

    const roundTrip = await fetch(
      `${base}/api/design-systems/${encodeURIComponent(result.designSystemId)}/pixflow-profile`,
    );
    expect(roundTrip.status).toBe(200);
    await expect(roundTrip.json()).resolves.toMatchObject({
      document: {
        schemaVersion: 'pixflow-framework-profile/v1',
        syncHash: result.syncHash,
        profile,
      },
    });
  });

  it('returns useful validation failures', async () => {
    const base = await startRoutes();
    const response = await fetch(`${base}/api/design-systems/pixflow-framework`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', routeId: '', profile: {} }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'title is required' });
  });
});
