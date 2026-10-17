import crypto from 'node:crypto';
import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('POST /api/projects/:id/files/batch', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
    await installTestEntitlement(baseUrl);
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('writes multiple text project files in one request', async () => {
    const projectId = `batch-files-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const resp = await fetch(`${baseUrl}/api/projects/${projectId}/files/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [
          { name: 'pixflow/handoffs/bricks/test/a.json', content: '{"a":1}\n' },
          { name: 'pixflow/handoffs/bricks/test/b.md', content: '# Bricks handoff\n' },
        ],
      }),
    });

    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { files?: Array<{ name: string; size: number }> };
    expect(body.files?.map((file) => file.name)).toEqual([
      'pixflow/handoffs/bricks/test/a.json',
      'pixflow/handoffs/bricks/test/b.md',
    ]);
    expect(body.files?.map((file) => file.size)).toEqual([8, 17]);
  });
});

async function installTestEntitlement(baseUrl: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    version: 1,
    product: 'pixflow-design',
    expires_at_unix: now + 60 * 60,
    grace_expires_at_unix: now + 60 * 60 * 2,
    issued_at: new Date().toISOString(),
    expires_at: new Date((now + 60 * 60) * 1000).toISOString(),
    grace_expires_at: new Date((now + 60 * 60 * 2) * 1000).toISOString(),
  };
  const segment = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', 'pixflow-design-local-entitlement-v1')
    .update(segment)
    .digest('hex');
  const resp = await fetch(`${baseUrl}/api/pixflow/license-entitlement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: `${segment}.${signature}` }),
  });
  expect(resp.status).toBe(200);
}
