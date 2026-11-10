import { readFile, mkdir, copyFile, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Only an explicitly staged payload may enter a candidate. Never discover dev configuration. */
export async function stageNativeTransport(resourceRoot: string, payload = process.env.PIXFLOW_DESIGN_NATIVE_PAYLOAD_DIR) {
  if (!payload) {
    // Reused build output must not silently ship a previous optional integration.
    const existing = await lstat(join(resourceRoot, 'native-transport')).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (existing) throw Error('Stale native payload in build output; use a clean resource directory for an extension-free release');
    return false;
  }
  const source = resolve(payload);
  const config = JSON.parse(await readFile(join(source, 'config.json'), 'utf8'));
  if (Object.keys(config).some(key => !['hostName', 'extensionOrigin', 'bridge', 'sites', 'discoverPairedSite'].includes(key))) throw Error('Native payload configuration contains unexpected fields');
  if (config.discoverPairedSite !== undefined && config.discoverPairedSite !== true) throw Error('Invalid native discovery mode');
  if (!/^dev\.pixflow\.[a-z0-9_]+$/.test(config.hostName || '')
    || !/^chrome-extension:\/\/[a-p]{32}\/$/.test(config.extensionOrigin || '')) throw Error('Native payload identity is missing or invalid');
  const bridge = new URL(config.bridge);
  if (bridge.protocol !== 'http:' || bridge.hostname !== '127.0.0.1' || bridge.origin !== config.bridge) throw Error('Native payload requires an exact loopback origin');
  if (!Array.isArray(config.sites) || (!config.sites.length && !config.discoverPairedSite) || (config.discoverPairedSite && config.sites.length) || config.sites.some((site: unknown) => {
    if (typeof site !== 'string') return true;
    const url = new URL(site);
    return url.origin !== site || !(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1'));
  })) throw Error('Native payload requires explicit approved origins');
  const files = ['host.mjs', 'install.mjs', 'config.json'];
  // Read all required files before creating incomplete installer output.
  await Promise.all(files.map(file => readFile(join(source, file))));
  const target = join(resourceRoot, 'native-transport');
  await mkdir(target, { recursive: true });
  for (const file of files) await copyFile(join(source, file), join(target, file));
  return true;
}

/** Use the packaged Node runtime (standalone or Electron); absent payload leaves direct Bridge unchanged. */
export function nativeWindowsHooks() {
  const root = '$INSTDIR\\resources\\open-design';
  const call = (operation: string) => `
  IfFileExists "${root}\\native-transport\\install.mjs" 0 native_${operation}_done
  IfFileExists "${root}\\bin\\node.exe" native_${operation}_node 0
  System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "1") i.r0'
  nsExec::ExecToLog '"$INSTDIR\\Pixflow Design Bridge.exe" "${root}\\native-transport\\install.mjs" ${operation}'
  Pop $0
  System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", p 0)'
  Goto native_${operation}_result
native_${operation}_node:
  nsExec::ExecToLog '"${root}\\bin\\node.exe" "${root}\\native-transport\\install.mjs" ${operation}'
  Pop $0
native_${operation}_result:
  DetailPrint "Optional Chrome connection ${operation} exit=$0 (direct connection remains available)"
native_${operation}_done:
`;
  return { install: call('install'), uninstall: call('uninstall') };
}
