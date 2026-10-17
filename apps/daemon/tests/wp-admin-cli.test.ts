import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runWpAdminCli } from '../src/wp-admin-cli.js';

describe('wp-admin CLI contract client', () => {
  it('writes screenshot evidence through the shared daemon endpoint without a WordPress session', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wp-cli-capture-'));
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, captures: [{ viewport: 'mobile', base64: 'iVBORw==' }], errors: [] }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await runWpAdminCli(['capture', '--daemon-url', 'http://127.0.0.1:7456', '--arguments-json', '{"url":"https://example.test","viewports":[{"id":"mobile","width":390,"height":844}]}', '--output-dir', directory, '--json']);
      expect(result.exitCode).toBe(0);
      expect(fetchMock.mock.calls[0]![0]).toBe('http://127.0.0.1:7456/api/pixflow/visual-capture');
      expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBeUndefined();
      const payload = JSON.parse(String(output.mock.calls[0]![0]));
      expect(payload.captures[0].base64).toBeUndefined();
      expect((await fs.readFile(payload.captures[0].path)).toString('hex')).toBe('89504e47');
    } finally {
      output.mockRestore(); vi.unstubAllGlobals(); await fs.rm(directory, { recursive: true, force: true });
    }
  });
  it('waits for the live browser result through the same WordPress tools endpoint', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: 'pfdirect_fixture' }))
      .mockResolvedValueOnce(Response.json({ pending: true, commandId: 'command-1' }))
      .mockResolvedValueOnce(Response.json({ ok: true, result: { revision: 'canvas:2' } }))
      .mockResolvedValueOnce(Response.json({ closed: true }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await runWpAdminCli(['site-tool', '--site-url', 'http://127.0.0.1:8088', '--token', 'pairing_fixture', '--tool', 'bricks.read', '--canvas-id', 'tab-1', '--mode', 'ask', '--json']);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ tool: 'bricks.read', arguments: { canvasId: 'tab-1' } });
    expect(JSON.parse(fetchMock.mock.calls[2]![1].body)).toEqual({ tool: 'bricks.result', arguments: { commandId: 'command-1' } });
    expect(fetchMock.mock.calls[3]![1].method).toBe('DELETE');
  });
  it('uses a short-lived site token for direct tools and closes it afterward', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: 'pfdirect_fixture' }))
      .mockResolvedValueOnce(Response.json({ result: 1 }))
      .mockResolvedValueOnce(Response.json({ closed: true }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await runWpAdminCli(['site-tool', '--site-url', 'http://127.0.0.1:8088', '--token', 'pairing_fixture', '--tool', 'database.update', '--arguments-json', '{"table":"wp_posts","data":{"post_title":"Updated"},"where":{"ID":1}}', '--json']);
    expect(result.exitCode).toBe(0);
    expect(fetchMock.mock.calls[1]?.[1].headers.authorization).toBe('Bearer pfdirect_fixture');
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1].body).tool).toBe('database.update');
    expect(fetchMock.mock.calls[2]?.[1].method).toBe('DELETE');
  });

  it('saves guarded mode through the same settings endpoint as the panels', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ guarded: true }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await runWpAdminCli(['access-mode', '--site-url', 'http://127.0.0.1:8088', '--token', 'pairing_fixture', '--set', 'guarded', '--json']);
    expect(result.exitCode).toBe(0);
    expect(new URL(fetchMock.mock.calls[0]?.[0]).searchParams.get('rest_route')).toBe('/pixflow-design/v1/wp-admin/direct/settings');
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({ guarded: true });
  });
  it('uses the explicit pairing token and the shared capability route', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => new Response(JSON.stringify({ ok: true, url, body: init.body }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    process.env.PIXFLOW_WP_ADMIN_SITE = 'http://127.0.0.1:8088';
    process.env.PIXFLOW_WP_ADMIN_TOKEN = 'pfwp_test_secret';

    const result = await runWpAdminCli(['capabilities', '--json']);

    expect(result.exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8088/?rest_route=%2Fpixflow-design%2Fv1%2Fwp-admin%2Fcapabilities',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer pfwp_test_secret' }),
      }),
    );
  });

  it('preserves namespaced capability IDs in detail requests', async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({ ok: true, url }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runWpAdminCli([
      'capability',
      '--site-url', 'http://127.0.0.1:8088',
      '--token', 'pfwp_test_secret',
      '--capability-id', 'pixflow/wp-admin/create-post',
      '--json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8088/?rest_route=%2Fpixflow-design%2Fv1%2Fwp-admin%2Fcapabilities%2Fpixflow%2Fwp-admin%2Fcreate-post',
      expect.any(Object),
    );
  });
});

it('completes installation recovery through the same license route using prompt-file JSON', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wp-recovery-'));
  const file = path.join(directory, 'request.json');
  const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const transport = vi.fn().mockResolvedValue(Response.json({ok: true}));
  vi.stubGlobal('fetch', transport);
  try {
    await fs.writeFile(file, JSON.stringify({installation_id: 'pending-id'}));
    const result = await runWpAdminCli(['installation-recovery', '--action', 'complete', '--site-url', 'http://127.0.0.1:8088', '--token', 'pairing_fixture', '--prompt-file', file, '--json']);
    expect(result.exitCode).toBe(0);
    expect(new URL(transport.mock.calls[0]![0]).searchParams.get('rest_route')).toBe('/pixflow-design/v1/license/recovery/complete');
    expect(JSON.parse(transport.mock.calls[0]![1].body)).toEqual({installation_id: 'pending-id'});
  } finally { output.mockRestore(); vi.unstubAllGlobals(); await fs.rm(directory, {recursive: true, force: true}); }
});
