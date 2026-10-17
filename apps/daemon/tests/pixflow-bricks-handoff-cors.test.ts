import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

describe('Pixflow Bricks handoff CORS', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('allows the site-binding header on a browser baseline preflight', async () => {
    const response = await fetch(`${baseUrl}/api/pixflow/bricks-handoff/baseline`, {
      method: 'OPTIONS',
      headers: {
        Origin: baseUrl,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-pixflow-site-key',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(baseUrl);
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase())
      .toContain('x-pixflow-site-key');
  });
});
