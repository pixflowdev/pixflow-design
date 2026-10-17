import { afterEach, expect, it, vi } from 'vitest';
import path from 'node:path';

const child = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: child.exec }));
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
afterEach(() => { Object.defineProperty(process, 'platform', platform); vi.unstubAllEnvs(); vi.resetModules(); child.exec.mockReset(); });

it('maps current Mac CLI launchers to the containing app archive without escaping a scoped home', async () => {
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  const home = path.resolve('scoped-mac-home');
  vi.stubEnv('OD_AGENT_HOME', home); vi.stubEnv('OD_SANDBOX_MODE', ''); vi.stubEnv('OD_DATA_DIR', '');
  const { codexAppArchiveCandidates } = await import('../../src/runtimes/executables.js');
  expect(await codexAppArchiveCandidates()).toEqual(['ChatGPT.app', 'Codex.app'].map(app =>
    path.join(home, 'Applications', app, 'Contents', 'Resources', 'app.asar')));
  expect(child.exec).not.toHaveBeenCalled();
});

it('shares provider discovery with voice-preview discovery and retains roots after lookup failure', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  vi.stubEnv('OD_AGENT_HOME', ''); vi.stubEnv('OD_SANDBOX_MODE', ''); vi.stubEnv('OD_DATA_DIR', '');
  let complete!: (error: Error | null, value: string) => void;
  child.exec.mockImplementation((_file, _args, _options, callback) => { complete = (error, stdout) => callback(error, { stdout }); });
  const discovery = await import('../../src/runtimes/executables.js');
  const provider = discovery.refreshCodexAppDiscovery();
  const previews = discovery.codexAppArchiveCandidates();
  expect(child.exec).toHaveBeenCalledTimes(1);
  const registeredRoot = path.resolve('WindowsApps', 'OpenAI.Codex_test');
  const archive = path.join(registeredRoot, 'app', 'resources', 'app.asar');
  complete(null, JSON.stringify([registeredRoot]));
  await provider;
  expect(await previews).toContain(archive);
  await discovery.codexAppArchiveCandidates();
  expect(child.exec).toHaveBeenCalledTimes(1);
  const retry = discovery.refreshCodexAppDiscovery({ force: true });
  complete(new Error('Store unavailable'), ''); await retry;
  expect(await discovery.codexAppArchiveCandidates()).toContain(archive);
});

it('shares an asynchronous hidden Store lookup while the event loop stays responsive', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  vi.stubEnv('OD_AGENT_HOME', ''); vi.stubEnv('OD_SANDBOX_MODE', ''); vi.stubEnv('OD_DATA_DIR', '');
  let complete!: (error: Error | null, value: string) => void;
  child.exec.mockImplementation((_file, _args, _options, callback) => { complete = (error, stdout) => callback(error, { stdout }); });
  const { refreshCodexAppDiscovery } = await import('../../src/runtimes/executables.js');
  let finished = false;
  const first = refreshCodexAppDiscovery().then(() => { finished = true; });
  const second = refreshCodexAppDiscovery();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(finished).toBe(false);
  expect(child.exec).toHaveBeenCalledTimes(1);
  expect(child.exec.mock.calls[0]?.[1]).toContain('Hidden');
  expect(child.exec.mock.calls[0]?.[2]).toMatchObject({ windowsHide: true, timeout: 3000 });
  complete(null, '[]');
  await Promise.all([first, second]);
  await refreshCodexAppDiscovery();
  expect(child.exec).toHaveBeenCalledTimes(1);
});

it('keeps scoped discovery inside the selected home without launching PowerShell', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  const home = path.resolve('isolated-agent');
  vi.stubEnv('OD_AGENT_HOME', home);
  const { codexAppArchiveCandidates } = await import('../../src/runtimes/executables.js');
  const archives = await codexAppArchiveCandidates();
  expect(child.exec).not.toHaveBeenCalled();
  expect(archives.length).toBeGreaterThan(0);
  expect(archives.every(archive => archive.startsWith(home + path.sep))).toBe(true);
});
