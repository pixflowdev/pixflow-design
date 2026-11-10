import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { nativeWindowsHooks } from '../../../tools/pack/src/native-transport.js';
import { windowsRegistry } from '../../../tools/pixflow-design-bridge/native-messaging/src/installation.js';

it.skipIf(process.platform !== 'win32' || process.env.PIXFLOW_NATIVE_NSIS_TEST !== '1')('real NSIS hooks install, repair and remove only an isolated native registration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-native-nsis-'));
  const target = join(root, 'installed'), resources = join(target, 'resources', 'open-design');
  const payload = resolve('../.tmp/native-messaging-prototype');
  const hostName = 'dev.pixflow.nsis_' + crypto.randomUUID().replaceAll('-', '');
  const key = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\' + hostName;
  const hooks = nativeWindowsHooks();
  const quote = (value: string) => value.replaceAll('$', '$$').replaceAll('"', '$\\"');
  try {
    await mkdir(join(resources, 'native-transport'), { recursive: true }); await mkdir(join(resources, 'bin'));
    await copyFile(process.execPath, join(resources, 'bin', 'node.exe'));
    for (const file of ['host.mjs', 'install.mjs']) await copyFile(join(payload, file), join(resources, 'native-transport', file));
    await writeFile(join(resources, 'native-transport', 'config.json'), JSON.stringify({ hostName, extensionOrigin: `chrome-extension://${'d'.repeat(32)}/`, bridge: 'http://127.0.0.1:17467', sites: ['https://synthetic.example'] }));
    await writeFile(join(target, 'saved-chat-settings'), 'preserve');
    const script = join(root, 'test.nsi'), installer = join(root, 'install.exe');
    await writeFile(script, `Unicode true\nName "Pixflow isolated native hook test"\nRequestExecutionLevel user\nSilentInstall silent\nSilentUnInstall silent\nOutFile "${quote(installer)}"\nInstallDir "${quote(target)}"\nSection\n${hooks.install}\nWriteUninstaller "$INSTDIR\\uninstall.exe"\nSectionEnd\nSection "Uninstall"\n${hooks.uninstall}\nSectionEnd\n`);
    execFileSync(process.env.PIXFLOW_NSIS_COMPILER || 'C:\\Program Files (x86)\\NSIS\\makensis.exe', ['/V2', script], { windowsHide: true, stdio: 'pipe' });
    expect(windowsRegistry.read(key)).toBeNull();
    for (let index = 0; index < 2; index++) {
      execFileSync(installer, ['/S'], { windowsHide: true, stdio: 'pipe' });
      expect(windowsRegistry.read(key)).toBe(join(resources, 'native-transport', 'native-host.json'));
    }
    execFileSync(join(target, 'uninstall.exe'), ['/S', `_?=${target}`], { windowsHide: true, stdio: 'pipe' });
    expect(windowsRegistry.read(key)).toBeNull();
    expect(await readFile(join(target, 'saved-chat-settings'), 'utf8')).toBe('preserve');
  } finally {
    const owned = windowsRegistry.read(key);
    if (owned === join(resources, 'native-transport', 'native-host.json')) windowsRegistry.remove(key);
    await rm(root, { recursive: true, force: true });
  }
}, 60000);
