import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const cli = resolve(repoRoot, 'tools/pixflow-design-bridge/pixflow-design-bridge.mjs');
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('installed Pixflow Design Bridge defaults', () => {
  it('keeps direct CLI starts on the installer-owned data root', () => {
    const localAppData = mkdtempSync(resolve(tmpdir(), 'pixflow-bridge-default-root-'));
    temporaryRoots.push(localAppData);
    const env: NodeJS.ProcessEnv = { ...process.env, LOCALAPPDATA: localAppData };
    delete env.PIXFLOW_DESIGN_BRIDGE_DATA_DIR;
    delete env.PIXFLOW_DESIGN_BRIDGE_INSTALL_ROOT;
    delete env.PIXFLOW_DESIGN_OD_DATA_DIR;

    const output = execFileSync(process.execPath, [
      cli,
      'config',
      'get',
      '--site-key',
      'acceptance-site',
      '--json',
    ], { cwd: repoRoot, env, encoding: 'utf8' });
    const config = JSON.parse(output) as {
      dataDir: string;
      installRoot: string;
      odDataDir: string;
      site?: { dataDir?: string; odDataDir?: string };
    };
    const installRoot = resolve(localAppData, 'Pixflow Design Bridge');
    const dataDir = resolve(installRoot, 'data');
    const siteDataDir = resolve(dataDir, 'sites', 'acceptance-site');

    expect(config.installRoot).toBe(installRoot);
    expect(config.dataDir).toBe(dataDir);
    expect(config.site?.dataDir).toBe(siteDataDir);
    expect(config.site?.odDataDir).toBe(resolve(siteDataDir, 'od'));
    expect(config.odDataDir).toBe(resolve(siteDataDir, 'od'));
  });
});
