import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import {
  registerPixflowProjectSyncRoutes,
  resolveSyncModulePath,
} from '../src/routes/pixflow-project-sync.js';

const roots: string[] = [];
const servers: Server[] = [];
const originalWorkspaceRoot = process.env.PIXFLOW_DESIGN_WORKSPACE_ROOT;
const originalInstallRoot = process.env.PIXFLOW_DESIGN_BRIDGE_INSTALL_ROOT;

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (originalWorkspaceRoot === undefined) delete process.env.PIXFLOW_DESIGN_WORKSPACE_ROOT;
  else process.env.PIXFLOW_DESIGN_WORKSPACE_ROOT = originalWorkspaceRoot;
  if (originalInstallRoot === undefined) delete process.env.PIXFLOW_DESIGN_BRIDGE_INSTALL_ROOT;
  else process.env.PIXFLOW_DESIGN_BRIDGE_INSTALL_ROOT = originalInstallRoot;
});

async function startServer(): Promise<string> {
  const app = express();
  app.use(express.json());
  registerPixflowProjectSyncRoutes(app);
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (address == null || typeof address === 'string') throw new Error('test server did not bind');
  return `http://127.0.0.1:${address.port}`;
}

describe('Pixflow project sync routes', () => {
  it('finds sync inside the packaged Bridge app instead of assuming the executable cwd is the workspace', () => {
    const installRoot = mkdtempSync(join(tmpdir(), 'pixflow-sync-packaged-'));
    roots.push(installRoot);
    const expected = join(
      installRoot,
      'app',
      'tools',
      'pixflow-design-bridge',
      'sync',
      'index.mjs',
    );
    mkdirSync(dirname(expected), { recursive: true });
    writeFileSync(expected, 'export {};');
    delete process.env.PIXFLOW_DESIGN_WORKSPACE_ROOT;
    process.env.PIXFLOW_DESIGN_BRIDGE_INSTALL_ROOT = installRoot;

    expect(resolveSyncModulePath()).toBe(expected);
  });

  it('reports sync as unavailable without turning the workspace probe into a console error', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pixflow-sync-missing-'));
    roots.push(root);
    process.env.PIXFLOW_DESIGN_WORKSPACE_ROOT = root;
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/pixflow-sync/projects`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      available: false,
      state: { schema: 1, projects: {} },
    });
  });

  it('keeps sync mutations unavailable when the installed bridge lacks the sync runtime', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pixflow-sync-missing-'));
    roots.push(root);
    process.env.PIXFLOW_DESIGN_WORKSPACE_ROOT = root;
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/pixflow-sync/projects/project-1/export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: 'pixflow_sync_unavailable',
    });
  });
});
