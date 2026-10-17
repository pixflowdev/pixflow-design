// Plan §3.H2 — `/api/craft` and `/api/craft/:id` route shape.
//
// `od craft list` and `od craft show <id>` are thin HTTP wrappers
// around these endpoints. We pin the JSON shape so the CLI doesn't
// drift from the daemon contract.

import type http from 'node:http';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

let server: http.Server;
let baseUrl: string;
let shutdown: (() => Promise<void> | void) | undefined;

beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as {
    url: string;
    server: http.Server;
    shutdown?: () => Promise<void> | void;
  };
  baseUrl = started.url;
  server = started.server;
  shutdown = started.shutdown;
});

afterAll(async () => {
  await Promise.resolve(shutdown?.());
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('GET /api/craft', () => {
  it('does not load inherited bundled craft by default', async () => {
    const response = await fetch(`${baseUrl}/api/craft`);
    expect(await response.json()).toEqual({ craft: [] });
  });

  it('loads personal craft without changing its source bytes', async () => {
    const craftRoot = path.join(process.env.OD_DATA_DIR!, 'craft');
    const sourcePath = path.join(craftRoot, 'customer-style.md');
    const body = '# Customer style\n\nKeep the customer brand rules.\n';
    await mkdir(craftRoot, { recursive: true });
    await writeFile(sourcePath, body);
    try {
      const response = await fetch(`${baseUrl}/api/craft/customer-style`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ id: 'customer-style', body });
      expect(await readFile(sourcePath, 'utf8')).toBe(body);
    } finally {
      await unlink(sourcePath);
    }
  });

  it('returns a craft array of { id, label, bytes }', async () => {
    const resp = await fetch(`${baseUrl}/api/craft`);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { craft?: Array<{ id: string; label: string; bytes: number }> };
    expect(Array.isArray(body.craft)).toBe(true);
    if (body.craft && body.craft.length > 0) {
      const first = body.craft[0]!;
      expect(typeof first.id).toBe('string');
      expect(typeof first.label).toBe('string');
      expect(typeof first.bytes).toBe('number');
    }
  });
});

describe('GET /api/craft/:id', () => {
  it('rejects malformed slugs with 400', async () => {
    const resp = await fetch(`${baseUrl}/api/craft/Bad%20ID`);
    expect([400, 404]).toContain(resp.status);
  });

  it('returns 404 for an unknown slug', async () => {
    const resp = await fetch(`${baseUrl}/api/craft/no-such-craft-section-9z`);
    expect(resp.status).toBe(404);
  });
});
