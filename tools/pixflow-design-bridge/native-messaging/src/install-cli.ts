import { readFile } from 'node:fs/promises';
import { registerPortableHost, removePortableHost } from './portable-installation';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { installNativeHost, uninstallNativeHost, type Registration } from './installation';

const operation = process.argv[2];
if (!['install', 'uninstall'].includes(operation)) throw Error('Expected install or uninstall');
if (!['win32', 'darwin', 'linux'].includes(process.platform)) throw Error('Unsupported native host platform');
const configuration = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));
const extensionId = /^chrome-extension:\/\/([a-p]{32})\/$/.exec(configuration.extensionOrigin)?.[1];
if (!extensionId || !configuration.hostName) throw Error('Installer requires an explicit extension and host identity');
const input: Registration = {
  platform: process.platform as Registration['platform'], home: homedir(),
  runtimeRoot: fileURLToPath(new URL('.', import.meta.url)), node: process.execPath,
  electron: Boolean(process.versions.electron),
  extensionId, hostName: configuration.hostName,
};
if (process.platform === 'darwin' || process.platform === 'linux') {
  const portable = { platform: process.platform, home: input.home, source: input.runtimeRoot, executable: input.node, appImage: process.env.APPIMAGE, electron: input.electron === true } as const;
  if (operation === 'install') await registerPortableHost(portable); else await removePortableHost(portable);
} else if (operation === 'install') await installNativeHost(input);
else await uninstallNativeHost(input);
