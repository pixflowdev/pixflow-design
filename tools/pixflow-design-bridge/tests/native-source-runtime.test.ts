import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerInstalledNativeHost, resolveRuntimeCopySources, copyRuntime } from '../install.mjs';

test('runtime installation copies the compiled native payload alongside the Bridge', async () => {
 const root = await mkdtemp(join(tmpdir(), 'pixflow-native-copy-'));
 try {
  const source = join(root, 'source');
  for (const dir of ['scripts', 'apps/daemon', 'packages', 'tools/pixflow-design-bridge', 'native-transport']) {
   await mkdir(join(source, dir), { recursive: true });
  }
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) await writeFile(join(source, file), '{}');
  for (const file of ['host.mjs', 'install.mjs', 'config.json']) await writeFile(join(source, 'native-transport', file), file);
  const sources = await resolveRuntimeCopySources(source, []);
  const installed = join(root, 'installed');
  await copyRuntime(sources, installed);
  for (const file of ['host.mjs', 'install.mjs', 'config.json']) assert.equal(await readFile(join(installed, 'native-transport', file), 'utf8'), file);
 } finally { await rm(root, { recursive: true, force: true }); }
});

test('native registration is optional for old installs and failure leaves direct startup available', async () => {
 const root = await mkdtemp(join(tmpdir(), 'pixflow-native-source-'));
 try {
  assert.equal(registerInstalledNativeHost(root), 'absent');
  const native = join(root, 'native-transport'); await mkdir(native);
  await writeFile(join(root, 'saved-chat.json'), '{"preserved":true}');
  await writeFile(join(native, 'install.mjs'), 'process.exit(1)');
  assert.equal(registerInstalledNativeHost(root), 'failed');
  await writeFile(join(native, 'install.mjs'), "import {writeFileSync} from 'node:fs'; if(process.argv[2]!=='install')process.exit(2);writeFileSync('registered.txt','yes');");
  assert.equal(registerInstalledNativeHost(root), 'registered');
  assert.equal(await readFile(join(native, 'registered.txt'),'utf8'), 'yes');
  assert.equal(await readFile(join(root, 'saved-chat.json'),'utf8'), '{"preserved":true}');
 } finally { await rm(root,{recursive:true,force:true}); }
});
