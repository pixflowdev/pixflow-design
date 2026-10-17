import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveBridgeWorkflowSources } from '../runtime-manifest.mjs';
import { copyRuntime, resolveRuntimeCopySources } from '../install.mjs';

const installer = path.resolve(import.meta.dirname, '../install.mjs');

async function fixture(sourceRoot: string): Promise<void> {
  for (const folder of ['scripts', 'apps/daemon', 'packages', 'tools/pixflow-design-bridge', 'guidance/examples/web-clone']) {
    await mkdir(path.join(sourceRoot, folder), { recursive: true });
  }
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
    await writeFile(path.join(sourceRoot, file), file === 'package.json' ? '{}' : '# fixture');
  }
  await writeFile(path.join(sourceRoot, 'guidance/examples/web-clone/open-design.json'), '{"plugin":{"id":"web-clone"}}');
}

describe('Bridge source installation', () => {
  it('installs a clean Free source tree and generates its compatible partial marker', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'pixflow-install-clean-source-'));
    const sourceRoot = path.join(root, 'source');
    const targetRoot = path.join(root, 'installed');
    try {
      await fixture(sourceRoot);
      const workflows = resolveBridgeWorkflowSources(sourceRoot);
      const sources = await resolveRuntimeCopySources(sourceRoot, workflows);
      await expect(access(path.join(sourceRoot, 'plugins'))).rejects.toThrow();
      await copyRuntime(sources, targetRoot);
      await expect(readFile(path.join(targetRoot, 'plugins/_official/.partial'), 'utf8')).resolves.toContain('only required workflow resources');
      await expect(readFile(path.join(targetRoot, 'plugins/_official/examples/web-clone/open-design.json'), 'utf8')).resolves.toBe('{"plugin":{"id":"web-clone"}}');
      await expect(access(path.join(sourceRoot, 'plugins'))).rejects.toThrow();
      await expect(access(path.join(targetRoot, 'skills/web-clone'))).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('validates workflow sources and resource types before returning a copy plan', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'pixflow-install-source-types-'));
    try {
      await fixture(root);
      const workflows = resolveBridgeWorkflowSources(root);
      await rm(path.join(root, 'guidance/examples/web-clone'), { recursive: true });
      await expect(resolveRuntimeCopySources(root, workflows)).rejects.toThrow();
      await mkdir(path.join(root, 'guidance/examples/web-clone'), { recursive: true });
      await rm(path.join(root, 'packages'), { recursive: true });
      await writeFile(path.join(root, 'packages'), 'invalid source type');
      await expect(resolveRuntimeCopySources(root, workflows)).rejects.toThrow(/packages must be a directory/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects incomplete source before stopping or replacing an existing installation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'pixflow-install-preflight-'));
    const sourceRoot = path.join(root, 'source');
    const installRoot = path.join(root, 'installed');
    const appRoot = path.join(installRoot, 'app');
    const dataFile = path.join(installRoot, 'data/od/projects/customer.txt');
    const stopped = path.join(installRoot, 'stopped.txt');
    try {
      await fixture(sourceRoot);
      await rm(path.join(sourceRoot, 'packages'), { recursive: true });
      await mkdir(path.join(appRoot, 'tools/pixflow-design-bridge'), { recursive: true });
      await mkdir(path.dirname(dataFile), { recursive: true });
      await writeFile(dataFile, 'customer project');
      await writeFile(path.join(appRoot, 'original.txt'), 'working installation');
      await writeFile(path.join(appRoot, 'tools/pixflow-design-bridge/pixflow-design-bridge.mjs'),
        `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(stopped)}, 'stopped');`);
      const manifest = JSON.stringify({ appRoot });
      await writeFile(path.join(installRoot, 'manifest.json'), manifest);
      const result = spawnSync(process.execPath, [installer, '--source', sourceRoot, '--install-root', installRoot, '--skip-install', '--no-autostart'], {
        encoding: 'utf8', timeout: 20_000, windowsHide: true,
        env: { ...process.env, PIXFLOW_DESIGN_PRO_ROOT: '', LOCALAPPDATA: path.join(root, 'home'), HOME: path.join(root, 'home'), XDG_DATA_HOME: path.join(root, 'home') },
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('missing packages');
      await expect(access(stopped)).rejects.toThrow();
      await expect(readFile(path.join(appRoot, 'original.txt'), 'utf8')).resolves.toBe('working installation');
      await expect(readFile(path.join(installRoot, 'manifest.json'), 'utf8')).resolves.toBe(manifest);
      await expect(readFile(dataFile, 'utf8')).resolves.toBe('customer project');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
