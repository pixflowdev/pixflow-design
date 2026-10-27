import { it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stageNativeTransport, nativeWindowsHooks } from '../src/native-transport.js';

it('stages only explicit native runtime, excludes browser consent, and leaves defaults unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-native-stage-'));
  try {
    const source = join(root, 'source'), output = join(root, 'output');
    await mkdir(source);
    expect(await stageNativeTransport(output, '')).toBe(false);
    const config = { hostName: 'dev.pixflow.bridge_test', extensionOrigin: `chrome-extension://${'a'.repeat(32)}/`, bridge: 'http://127.0.0.1:17467', sites: ['https://customer.example'] };
    await writeFile(join(source, 'config.json'), JSON.stringify(config));
    await expect(stageNativeTransport(output, source)).rejects.toThrow();
    for (const file of ['host.mjs', 'install.mjs', 'session.private.json', 'popup.js']) await writeFile(join(source, file), file);
    expect(await stageNativeTransport(output, source)).toBe(true);
    expect((await readdir(join(output, 'native-transport'))).sort()).toEqual(['config.json', 'host.mjs', 'install.mjs']);
    expect(JSON.parse(await readFile(join(output, 'native-transport/config.json'), 'utf8'))).toEqual(config);
    const discovered = { ...config, sites: [], discoverPairedSite: true };
    await writeFile(join(source, 'config.json'), JSON.stringify(discovered));
    expect(await stageNativeTransport(output, source)).toBe(true);
    expect(JSON.parse(await readFile(join(output, 'native-transport/config.json'), 'utf8'))).toEqual(discovered);
    await writeFile(join(source, 'config.json'), JSON.stringify(config));
    await stageNativeTransport(output, source);
    await writeFile(join(source, 'config.json'), JSON.stringify({ ...config, bridge: 'https://remote.example' }));
    await expect(stageNativeTransport(output, source)).rejects.toThrow(/loopback/);
    expect(JSON.parse(await readFile(join(output, 'native-transport/config.json'), 'utf8'))).toEqual(config);
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('Windows hooks use bundled Node and never delete runtime data or Chrome permissions', () => {
  const hooks = nativeWindowsHooks();
  expect(hooks.install).toContain('bin\\node.exe');
  expect(hooks.install).toContain('IfFileExists');
  expect(hooks.uninstall).toContain('install.mjs" uninstall');
  expect(JSON.stringify(hooks)).not.toMatch(/DeleteRegKey|RMDir|User Data|storage/);
});

it('refuses an extension-free build containing a stale native payload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-native-stale-'));
  try {
    await mkdir(join(root, 'native-transport'));
    await writeFile(join(root, 'native-transport', 'config.json'), 'previous candidate');
    await expect(stageNativeTransport(root, '')).rejects.toThrow(/stale native payload/i);
    expect(await readFile(join(root, 'native-transport', 'config.json'), 'utf8')).toBe('previous candidate');
  } finally { await rm(root, { recursive: true, force: true }); }
});
