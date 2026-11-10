import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installNativeHost, uninstallNativeHost, installationPaths, windowsRegistry, type Registration, type Registry } from '../native-messaging/src/installation';

for (const platform of ['win32', 'darwin', 'linux'] as const) test(`${platform}: install, repair and uninstall preserve consent and unrelated data`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-native-install-'));
  const config: Registration = { platform, home: root, runtimeRoot: join(root, 'runtime with spaces'), node: process.execPath, hostName: 'dev.pixflow.bridge_test', extensionId: 'a'.repeat(32) };
  const entries = new Map<string, string>();
  const registry: Registry = { read: key => entries.get(key) || null, write: (key, value) => { entries.set(key, value); }, remove: key => { entries.delete(key); } };
  try {
    await mkdir(config.runtimeRoot); await writeFile(join(config.runtimeRoot, 'host.mjs'), '// fixture');
    await writeFile(join(root, 'customer-data'), 'preserve');
    entries.set('unrelated', 'keep');
    const paths = await installNativeHost(config, registry);
    const first = await readFile(paths.manifest, 'utf8');
    assert.deepEqual(JSON.parse(first).allowed_origins, [`chrome-extension://${config.extensionId}/`]);
    await installNativeHost(config, registry);
    assert.equal(await readFile(paths.manifest, 'utf8'), first);
    await installNativeHost({ ...config, electron: true }, registry);
    const electronLauncher = await readFile(paths.launcher, 'utf8');
    assert.match(electronLauncher, /ELECTRON_RUN_AS_NODE=1/);
    assert.ok(electronLauncher.includes(config.node));
    await installNativeHost(config, registry);
    assert.doesNotMatch(await readFile(paths.launcher, 'utf8'), /ELECTRON_RUN_AS_NODE/);
    assert.equal(await uninstallNativeHost(config, registry), true);
    assert.equal(await uninstallNativeHost(config, registry), false);
    assert.equal(await readFile(join(root, 'customer-data'), 'utf8'), 'preserve');
    assert.equal(await readFile(join(config.runtimeRoot, 'host.mjs'), 'utf8'), '// fixture');
    assert.deepEqual([...entries], [['unrelated', 'keep']]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('registration refuses foreign ownership and invalid extension identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-native-owner-'));
  const input: Registration = { platform: 'win32', home: root, runtimeRoot: root, node: process.execPath, hostName: 'dev.pixflow.bridge_test', extensionId: 'b'.repeat(32) };
  let writes = 0;
  const registry: Registry = { read: () => join(root, 'other-install', 'native-host.json'), write: () => { writes++; }, remove: () => { writes++; } };
  try {
    await writeFile(join(root, 'host.mjs'), '// fixture');
    await assert.rejects(installNativeHost(input, registry), /another installation/);
    assert.equal(writes, 0);
    assert.throws(() => installationPaths({ ...input, extensionId: '*' }), /identity/);
    assert.throws(() => installationPaths({ ...input, node: 'relative.exe' }), /absolute/);
    const path = installationPaths(input).manifest;
    await writeFile(path, JSON.stringify({ name: input.hostName, path: 'someone else', allowed_origins: [] }));
    assert.equal(await uninstallNativeHost(input, registry), false);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).path, 'someone else');
    assert.equal(writes, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Windows actual registry install/repair/uninstall is isolated to a unique test host', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-native-registry-'));
  const input: Registration = { platform: 'win32', home: root, runtimeRoot: root, node: process.execPath, hostName: 'dev.pixflow.test_' + crypto.randomUUID().replaceAll('-', ''), extensionId: 'c'.repeat(32) };
  const paths = installationPaths(input);
  try {
    assert.equal(windowsRegistry.read(paths.key), null);
    await writeFile(join(root, 'host.mjs'), '// fixture');
    await installNativeHost(input);
    assert.equal(windowsRegistry.read(paths.key), paths.manifest);
    await installNativeHost(input);
    assert.equal(await uninstallNativeHost(input), true);
    assert.equal(windowsRegistry.read(paths.key), null);
  } finally {
    await uninstallNativeHost(input);
    await rm(root, { recursive: true, force: true });
  }
});
