// @vitest-environment node

import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const enabled = !!process.env.PIXFLOW_QA_WP_ROOT && !!process.env.PIXFLOW_QA_SITE_URL;

describe.skipIf(!enabled)('WordPress administration CLI over real HTTP', () => {
  test('prints a normal Pro explanation and keeps native tools available; forged authentication fails', async () => {
    const pairingHelper = fileURLToPath(new URL('../../../wordpress/tests/directory-cli-pairing.integration.php', import.meta.url));
    const cli = fileURLToPath(new URL('../../../apps/daemon/src/cli.ts', import.meta.url));
    const php = process.env.PIXFLOW_QA_PHP || 'php';
    const pairing = JSON.parse(execFileSync(php, [pairingHelper], { encoding: 'utf8', windowsHide: true }));
    const env = { ...process.env, PIXFLOW_WP_ADMIN_SITE: process.env.PIXFLOW_QA_SITE_URL, PIXFLOW_WP_ADMIN_TOKEN: pairing.token };
    const call = (tool: string, token = pairing.token) => spawnSync(process.execPath, ['--import', 'tsx', cli, 'wp-admin', 'site-tool', '--tool', tool, '--json'], {
      env: { ...env, PIXFLOW_WP_ADMIN_TOKEN: token }, encoding: 'utf8', windowsHide: true, timeout: 30_000,
    });
    try {
      for (const tool of ['wordpress.run', 'files.read', 'database.select']) {
        const result = call(tool);
        expect(result.status, result.stderr || result.stdout).toBe(0);
        expect(JSON.parse(result.stdout)).toMatchObject({ allowed: false, code: 'pro_required', message: expect.any(String) });
      }
      const native = call('wordpress.posts.list');
      expect(native.status, native.stderr).toBe(0);
      expect(JSON.parse(native.stdout).allowed).not.toBe(false);
      const forged = call('wordpress.posts.list', 'pfwp_1_invalid');
      expect(forged.status).not.toBe(0);
      expect(forged.stdout).not.toContain('pro_required');
      if (process.env.PIXFLOW_QA_TOOL_HELPER) {
        const source = process.env.PIXFLOW_QA_TOOL_HELPER;
        const scratchRoot = fileURLToPath(new URL('../../../.tmp/', import.meta.url));
        await mkdir(scratchRoot, { recursive: true });
        const workspace = await mkdtemp(path.join(scratchRoot, 'wp-admin-helper-'));
        const endpoint = new URL(process.env.PIXFLOW_QA_SITE_URL!);
        endpoint.searchParams.set('rest_route', '/pixflow-design/v1/wp-admin/direct/sessions');
        const sessionResponse = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pairing.token}` }, body: '{}' });
        expect(sessionResponse.status).toBe(200);
        const session = await sessionResponse.json() as { token: string };
        endpoint.searchParams.set('rest_route', '/pixflow-design/v1/wp-admin/direct/tools');
        let complete = false;
        try {
          await copyFile(source, path.join(workspace, 'site-tool.mjs'));
          await copyFile(path.join(path.dirname(source), 'visual-capture.mjs'), path.join(workspace, 'visual-capture.mjs'));
          await writeFile(path.join(workspace, 'site-connection.json'), JSON.stringify({ endpoint: endpoint.href, token: session.token, runId: 'qa-normal-pro-explanation' }), { mode: 0o600 });
          for (const tool of ['wordpress.run', 'files.read', 'database.select']) {
            const result = spawnSync(process.execPath, [path.join(workspace, 'site-tool.mjs'), tool], { cwd: workspace, encoding: 'utf8', windowsHide: true, timeout: 30_000 });
            expect(result.status, result.stderr || result.stdout).toBe(0);
            expect(JSON.parse(result.stdout)).toMatchObject({ allowed: false, code: 'pro_required' });
          }
          complete = true;
        } finally {
          endpoint.searchParams.set('rest_route', '/pixflow-design/v1/wp-admin/direct/session');
          await fetch(endpoint, { method: 'DELETE', headers: { Authorization: `Bearer ${session.token}` } });
          if (complete && path.resolve(workspace).startsWith(path.resolve(scratchRoot) + path.sep)) await rm(workspace, { recursive: true });
        }
      }
    } finally {
      execFileSync(php, [pairingHelper, 'revoke', pairing.tokenId], { encoding: 'utf8', windowsHide: true });
    }
  }, 120_000);
});
