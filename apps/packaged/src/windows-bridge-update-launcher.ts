import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { PixflowBridgeUpdateStatus } from '@open-design/contracts';

export type WindowsBridgeUpdateWindow = {
  publish(status: PixflowBridgeUpdateStatus): void;
  install(path: string, version: string): Promise<void>;
};

export async function openWindowsBridgeUpdateWindow(executable: string, launcher: string): Promise<WindowsBridgeUpdateWindow> {
  // The installer may replace every file in the application directory.
  // Run the small progress window from a separate directory for this attempt.
  const root = await mkdtemp(join(tmpdir(), 'pixflow-bridge-update-'));
  const localExe = join(root, 'Pixflow Bridge Update.exe');
  const stateFile = join(root, 'status');
  const grant = join(root, 'install');
  const ready = join(root, 'ready');
  const publish = (status: PixflowBridgeUpdateStatus) => writeFileSync(stateFile, `${status.state}\n${status.percent ?? ''}\n`, 'utf8');
  try {
    await copyFile(executable, localExe);
    publish({ state: 'checking' });
    const child = spawn(localExe, [String(process.pid), stateFile, grant, launcher], {
      cwd: root, detached: true, stdio: 'ignore', windowsHide: false,
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) =>
        !/^(OPEN_DESIGN_|OD_|PIXFLOW_DESIGN_|NODE_OPTIONS$|ELECTRON_RUN_AS_NODE$)/i.test(key))),
    });
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    child.once('close', () => {
      // The updater has exited and no longer holds its temporary executable.
      void Promise.all([ready, stateFile, grant, grant + '.tmp', localExe].map(path => rm(path, { force: true })))
        .then(() => rmdir(root)).catch(() => undefined);
    });
    child.unref();
    const deadline = Date.now() + 8000;
    while (!existsSync(ready)) {
      if (child.exitCode !== null || Date.now() >= deadline) {
        child.kill();
        throw new Error('The Bridge update window did not open.');
      }
      await delay(50);
    }
    await rm(ready, { force: true });
  } catch (error) {
    // All paths below are owned by this attempt.
    await Promise.all([stateFile, localExe].map(path => rm(path, { force: true }))).catch(() => undefined);
    await rmdir(root).catch(() => undefined);
    throw error;
  }
  return {
    publish,
    async install(path, version) {
      await writeFile(grant + '.tmp', `${path}\n${version}\n`, { flag: 'wx' });
      await rename(grant + '.tmp', grant);
    },
  };
}
