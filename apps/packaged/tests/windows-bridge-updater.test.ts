import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWindowsBridgeUpdater } from '../src/windows-bridge-updater.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
const installer = 'disposable installer fixture';
const sha = createHash('sha256').update(installer).digest('hex');

async function fixture(options: { version?: string; digest?: string; busy?: boolean; badUrl?: boolean; root?: string } = {}) {
  const root = options.root ?? await mkdtemp(join(tmpdir(), 'pixflow-bridge-update-'));
  if (!options.root) roots.push(root);
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
  return { updater, launch, canInstall, fetchImpl, shutdown, root, url };
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

  it.each([true, false])('redownloads a missing cached installer on the next attempt (restarted: %s)', async restarted => {
    const first = await fixture({ busy: true });
    first.updater.start();
    await vi.waitFor(() => expect(first.updater.status().state).toBe('busy'));
    const metadata = JSON.parse(await readFile(join(first.root, 'metadata.json'), 'utf8'));
    const installerPath = join(first.root, metadata.active.artifactPath);
    await rm(installerPath);

    const retry = restarted ? await fixture({ root: first.root }) : first;
    retry.canInstall.mockResolvedValue(true);
    retry.fetchImpl.mockClear();
    retry.updater.start();
    await vi.waitFor(() => expect(retry.shutdown).toHaveBeenCalledOnce());
    expect(retry.fetchImpl.mock.calls.filter(([url]) => url === retry.url)).toHaveLength(1);
    expect(retry.launch).toHaveBeenCalledWith(installerPath, '2.3.3');
    expect(await readFile(installerPath, 'utf8')).toBe(installer);
  });

  it('preserves unrecognized files in a stale release directory', async () => {
    const first = await fixture({ busy: true });
    first.updater.start();
    await vi.waitFor(() => expect(first.updater.status().state).toBe('busy'));
    const metadata = JSON.parse(await readFile(join(first.root, 'metadata.json'), 'utf8'));
    const installerPath = join(first.root, metadata.active.artifactPath);
    const extraFile = join(dirname(installerPath), 'unrecognized.txt');
    await writeFile(extraFile, 'preserve me');
    await rm(installerPath);

    const restarted = await fixture({ root: first.root });
    restarted.updater.start();
    await vi.waitFor(() => expect(restarted.updater.status().state).toBe('failed'));
    expect(restarted.fetchImpl).not.toHaveBeenCalled();
    expect(restarted.launch).not.toHaveBeenCalled();
    expect(await readFile(extraFile, 'utf8')).toBe('preserve me');
  });
});
