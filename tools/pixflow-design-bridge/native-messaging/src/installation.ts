import { access, readFile, writeFile, mkdir, unlink, chmod } from 'node:fs/promises';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';

export type Registration = {
  platform: 'win32' | 'darwin' | 'linux'; home: string; hostName: string;
  extensionId: string; runtimeRoot: string; node: string;
  electron?: boolean;
};
export interface Registry {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}
export const windowsRegistry: Registry = {
  read(key) {
    try {
      const text = execFileSync('reg.exe', ['query', key, '/ve', '/reg:32'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      return text.match(/REG_SZ\s+(.+)$/m)?.[1]?.trim() || null;
    } catch (error) {
      // Missing keys are the only expected read failure. Do not overwrite on access errors.
      const result = error as { status?: number; stderr?: Buffer };
      if (result.status === 1 && /unable to find|not found/i.test(String(result.stderr))) return null;
      throw error;
    }
  },
  write(key, value) { execFileSync('reg.exe', ['add', key, '/ve', '/t', 'REG_SZ', '/d', value, '/f', '/reg:32'], { windowsHide: true }); },
  remove(key) { execFileSync('reg.exe', ['delete', key, '/f', '/reg:32'], { windowsHide: true }); },
};
export function installationPaths(input: Registration) {
  if (!/^dev\.pixflow\.[a-z0-9_]+$/.test(input.hostName) || !/^[a-p]{32}$/.test(input.extensionId)) throw Error('Invalid native host identity');
  for (const path of [input.home, input.runtimeRoot, input.node]) {
    if (!isAbsolute(path) || /[\r\n\0"%]/.test(path)) throw Error('Native host requires safe absolute paths');
  }
  const root = resolve(input.runtimeRoot);
  const launcher = join(root, input.platform === 'win32' ? 'native-host.cmd' : 'native-host');
  const manifest = input.platform === 'win32' ? join(root, 'native-host.json')
    : join(input.home, ...(input.platform === 'darwin' ? ['Library', 'Application Support', 'Google', 'Chrome'] : ['.config', 'google-chrome']), 'NativeMessagingHosts', input.hostName + '.json');
  return { root, launcher, manifest, key: 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\' + input.hostName };
}
const optionalRead = async (path: string) => {
  try { return await readFile(path, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
};
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";

/** Installer-owned registration only. Never changes Chrome site consent or Bridge data. */
export async function installNativeHost(input: Registration, registry: Registry = windowsRegistry) {
  const paths = installationPaths(input);
  // Verify staged runtime before touching registration or a previous installation.
  await readFile(join(paths.root, 'host.mjs'));
  await access(input.node);
  const existing = await optionalRead(paths.manifest);
  if (existing) {
    const manifest = JSON.parse(existing);
    if (manifest.name !== input.hostName || manifest.path !== paths.launcher
      || JSON.stringify(manifest.allowed_origins) !== JSON.stringify([`chrome-extension://${input.extensionId}/`])) throw Error('Native host registration belongs to another installation');
  }
  if (input.platform === 'win32') {
    const registered = registry.read(paths.key);
    if (registered && resolve(registered).toLowerCase() !== resolve(paths.manifest).toLowerCase()) throw Error('Native host registry entry belongs to another installation');
  }
  const launcher = input.platform === 'win32'
    ? `@echo off\r\n${input.electron ? 'set "ELECTRON_RUN_AS_NODE=1"\r\n' : ''}"${input.node}" "${join(paths.root, 'host.mjs')}" %*\r\n`
    : `#!/bin/sh\n${input.electron ? 'export ELECTRON_RUN_AS_NODE=1\n' : ''}exec ${quote(input.node)} ${quote(join(paths.root, 'host.mjs'))} "$@"\n`;
  await writeFile(paths.launcher, launcher, { mode: 0o700 });
  if (input.platform !== 'win32') await chmod(paths.launcher, 0o700);
  await mkdir(dirname(paths.manifest), { recursive: true });
  await writeFile(paths.manifest, JSON.stringify({ name: input.hostName, description: 'Pixflow Bridge connection', path: paths.launcher, type: 'stdio', allowed_origins: [`chrome-extension://${input.extensionId}/`] }, null, 2), { mode: 0o600 });
  if (input.platform === 'win32') registry.write(paths.key, paths.manifest);
  return paths;
}

/** Remove only this installation's exact registration, retaining all user data and consent. */
export async function uninstallNativeHost(input: Registration, registry: Registry = windowsRegistry) {
  const paths = installationPaths(input), existing = await optionalRead(paths.manifest);
  if (!existing) return false;
  const manifest = JSON.parse(existing);
  if (manifest.name !== input.hostName || manifest.path !== paths.launcher
    || JSON.stringify(manifest.allowed_origins) !== JSON.stringify([`chrome-extension://${input.extensionId}/`])) return false;
  if (input.platform === 'win32') {
    const registered = registry.read(paths.key);
    if (registered && resolve(registered).toLowerCase() !== resolve(paths.manifest).toLowerCase()) return false;
    if (registered) registry.remove(paths.key);
  }
  await unlink(paths.manifest);
  // Runtime files belong to the package, not this cleanup operation.
  return true;
}
