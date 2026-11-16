import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWindowsBridgeUpdater } from '../src/windows-bridge-updater.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
const installer = 'disposable installer fixture';
const sha = createHash('sha256').update(installer).digest('hex');

async function fixture(options: { version?: string; digest?: string; busy?: boolean; badUrl?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-bridge-update-'));
  roots.push(root);
  const version = options.version ?? '2.3.3';
  const url = `https://pixflow.dev/downloads/pixflow-design-bridge/packages/pixflow-design-bridge-${version}-win-x64-setup.exe`;
  const fetchImpl = vi.fn<typeof fetch>(async input => String(input) === url ? new Response(installer) : Response.json({
    product: 'pixflow-design-bridge', channel: 'stable', version,
    installerAssets: [{ platform: 'win32', arch: 'x64', sha256: options.digest ?? sha,
      url: options.badUrl ? url.replace('pixflow.dev', 'example.test') : url }],
  }));
  const canInstall = vi.fn(async () => !options.busy);
  const launch = vi.fn(async (path: string) => {
    expect(await readFile(path, 'utf8')).toBe(installer);
  });
  const shutdown = vi.fn(async () => {});
  const updater = createWindowsBridgeUpdater({ version: '2.3.2', arch: 'x64', downloadRoot: root, canInstall, fetch: fetchImpl, openWindow: async () => ({ install: launch, publish: () => {} }), shutdown });
  return { updater, launch, canInstall, fetchImpl, shutdown };
}

describe('WordPress Windows Bridge updater', () => {
  it('schedules the verified installer once and shuts down after scheduling', async () => {
    const { updater, launch, shutdown } = await fixture();
    expect(updater.start().state).toBe('checking');
    updater.start();
    await vi.waitFor(() => expect(launch).toHaveBeenCalledTimes(1));
    expect(updater.isInstalling()).toBe(true);
    updater.start();
    expect(launch).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(shutdown).toHaveBeenCalledOnce());
    expect(updater.status().state).toBe('installing');
    expect(launch.mock.invocationCallOrder[0]).toBeLessThan(shutdown.mock.invocationCallOrder[0]!);
  });
  it.each([
    [{ version: '2.3.1' }, 'up-to-date'],
    [{ badUrl: true }, 'failed'],
    [{ digest: 'a'.repeat(64) }, 'failed'],
    [{ busy: true }, 'busy'],
  ] as const)('does not open an unsafe, unnecessary or disruptive installer (%j)', async (options, state) => {
    const { updater, launch } = await fixture(options);
    updater.start();
    await vi.waitFor(() => expect(updater.status().state).toBe(state));
    expect(launch).not.toHaveBeenCalled();
    expect(updater.isInstalling()).toBe(false);
  });
  it('rechecks the installer checksum immediately before launch', async () => {
    const { updater, launch, canInstall } = await fixture();
    const { readdir } = await import('node:fs/promises');
    canInstall.mockImplementationOnce(async () => {
      const files = await readdir(roots.at(-1)!, { recursive: true });
      const installerPath = files.find(file => file.endsWith('.exe'));
      expect(installerPath).toBeTruthy();
      await writeFile(join(roots.at(-1)!, installerPath!), 'modified after download');
      return true;
    });
    updater.start();
    await vi.waitFor(() => expect(updater.status().state).toBe('failed'));
    expect(launch).not.toHaveBeenCalled();
  });
});
