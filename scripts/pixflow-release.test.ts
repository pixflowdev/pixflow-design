import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { prepareRelease } from './lib/pixflow-release-build.ts';
import { containerArgs, nodeImage } from './lib/pixflow-release-cli.ts';
import { contained, fileDigest, manifestPaths, publishPlan, readBase, serialize } from './lib/pixflow-release-store.ts';
import type { Store } from './lib/pixflow-release-store.ts';

async function fixture(t: {after(fn: () => Promise<void>): void}) {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-release-test-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  const store: Store = {target:'staging',privateRoot:join(root,'private'),publicRoot:join(root,'public')};
  await mkdir(store.privateRoot); await mkdir(store.publicRoot);
  const plugin = async (v: string, content = '') => {
    const zip = new JSZip(); zip.file('pixflow-ai/pixflow-ai.php', `<?php\n/*\nPlugin Name: Pixflow Design\nVersion: ${v}\nRequires at least: 6.0\nTested up to: 6.8\nRequires PHP: 8.1\n*/\n${content}`);
    const source = join(root,`plugin-${v}.zip`); await writeFile(source,await zip.generateAsync({type:'nodebuffer'}));
    return prepareRelease(await readBase(store),{product:'plugin',target:'staging',source});
  };
  const resources = async () => {
    const source = join(root,'resources'); await mkdir(join(source,'packages'),{recursive:true});
    const packs = [];
    for (const slug of ['plugins','design-templates','design-systems']) {
      const zip = new JSZip(), identity = {slug,version:'1.1.4',revision:'sha256:fixture'};
      zip.file('pixflow-pack.json',JSON.stringify(identity)); zip.file(`${slug}/example.txt`,'Resource');
      const path = join(source,'packages',slug+'.zip'); await writeFile(path,await zip.generateAsync({type:'nodebuffer'}));
      const info = await fileDigest(path);
      packs.push({...identity,name:slug,size:info.bytes,checksum:'sha256:'+info.sha256,compatibility:{minPluginVersion:'1.1.4'},archiveUrl:'https://pixflow.dev/downloads/pixflow-design/resources/packages/'+slug+'.zip'});
    }
    await writeFile(join(source,'latest.json'),serialize({minimumPluginVersion:'1.1.4',packs}));
    return prepareRelease(await readBase(store),{product:'resources',target:'staging',source});
  };
  return {root,store,plugin,resources};
}

test('dry run is write-free; activation and rollback pointers are scoped to staging',async t => {
  const f = await fixture(t), plan = await f.plugin('2.0.0');
  assert.equal((await publishPlan(f.store,plan)).applied,false);
  assert.deepEqual(await readdir(f.store.privateRoot),[]);
  await publishPlan(f.store,plan,true);
  assert.equal((await readBase(f.store)).snapshot.artifacts[0]?.version,'2.0.0');
  assert.equal((await readBase({...f.store,target:'production'})).snapshot.artifacts.length,0);
  assert.equal(JSON.parse(await readFile(join(f.store.privateRoot,'previous-release.staging.json'),'utf8')).schemaVersion,1);
  assert.ok(!(await readdir(f.store.privateRoot)).includes('.publish-lock'));
});
test('updates retain old packages, metadata and signed download identities',async t => {
  const f = await fixture(t), first = await f.plugin('1.1.5'); await publishPlan(f.store,first,true);
  const second = await f.plugin('2.0.0'); await publishPlan(f.store,second,true);
  const {snapshot} = await readBase(f.store);
  assert.equal(snapshot.artifacts.length,2); assert.equal(snapshot.artifacts[0]?.current,false);
  assert.equal(snapshot.artifacts[1]?.requires_php,'8.1');
  assert.equal((await fileDigest(join(f.store.privateRoot,first.files[0]!.destination))).sha256,first.files[0]!.sha256);
  await assert.rejects(publishPlan(f.store,first,true),/base changed/);
  await assert.rejects(publishPlan(f.store,await f.plugin('1.1.4'),true),/downgrade/);
  await assert.rejects(f.plugin('2.0.0','changed'),/cannot change bytes/);
});
test('resources stay private, preserve plugin release and legacy manifest, and map all supported packs',async t => {
  const f = await fixture(t); await publishPlan(f.store,await f.plugin('2.0.0'),true);
  const legacy = join(f.store.publicRoot,...manifestPaths[0].split('/')); await mkdir(join(legacy,'..'),{recursive:true}); await writeFile(legacy,'{"packs":[]}');
  const before = (await readBase(f.store)).snapshot.artifacts[0];
  const plan = await f.resources(); await publishPlan(f.store,plan,true);
  const {snapshot} = await readBase(f.store);
  assert.deepEqual(snapshot.artifacts[0],before); assert.equal(snapshot.artifacts.length,4);
  for (const pack of snapshot.public_manifests[manifestPaths[0]]!.packs as Record<string,unknown>[]) {
    assert.equal(pack.licenseRequired,true); assert.equal(pack.archiveUrl,undefined); assert.ok(pack.artifact_id);
  }
  assert.equal(await readFile(legacy,'utf8'),'{"packs":[]}');
  assert.ok(plan.files.every(f => f.visibility === 'private'));
});
test('major plugin release preserves installed resource versions and catalog',async t => {
  const f = await fixture(t);
  await publishPlan(f.store,await f.plugin('1.1.5'),true);
  await publishPlan(f.store,await f.resources(),true);
  const before = (await readBase(f.store)).snapshot;
  await publishPlan(f.store,await f.plugin('2.0.0'),true);
  const after = (await readBase(f.store)).snapshot;
  assert.deepEqual(after.public_manifests,before.public_manifests);
  assert.deepEqual(after.artifacts.filter(a => a.type === 'resource-pack'),before.artifacts.filter(a => a.type === 'resource-pack'));
});

test('corrupt source, catalog or pointer and unrelated mutations cannot activate',async t => {
  const f = await fixture(t), plan = await f.plugin('1.1.5'); await publishPlan(f.store,plan,true);
  const base = await readBase(f.store), next = await f.plugin('2.0.0');
  next.snapshot.public_manifests[manifestPaths[1]] = {version:'2.0.0'};
  await assert.rejects(publishPlan(f.store,next,true),/Unrelated/); delete next.snapshot.public_manifests[manifestPaths[1]];
  await writeFile(next.files[0]!.source,'damaged'); await assert.rejects(publishPlan(f.store,next,true),/checksum/);
  assert.equal((await readBase(f.store)).hash,base.hash);
  await writeFile(join(f.store.privateRoot,plan.files[0]!.destination),'corrupt retained history');
  const good = await f.plugin('2.0.1'); await assert.rejects(publishPlan(f.store,good),/absent or corrupt/);
  await writeFile(join(f.store.privateRoot,'current-release.staging.json'),'{}');
  await assert.rejects(readBase(f.store),/Invalid release pointer/);
});
test('paths, overlapping roots and public visibility prevent exposing paid artifacts',async t => {
  const f = await fixture(t), plan = await f.plugin('2.0.0');
  await assert.rejects(contained(f.store.privateRoot,'../secret'),/Invalid release path/);
  await assert.rejects(publishPlan({...f.store,privateRoot:f.store.publicRoot},plan),/overlap/);
  plan.files[0]!.visibility = 'public'; await assert.rejects(publishPlan(f.store,plan),/visibility/);
});
test('remote runtime is pinned and network-disabled; dry-run mounts are read-only',() => {
  const args = containerArgs('/tmp/test',{target:'staging',privateRoot:'/private-root',publicRoot:'/public-root'},'read',false);
  assert.ok(args.includes(nodeImage)); assert.ok(args.includes('none')); assert.ok(args.includes('type=bind,src=/private-root,dst=/private,readonly'));
  assert.throws(() => containerArgs('/tmp/test',{target:'staging',privateRoot:'/x,unsafe',publicRoot:'/public-root'},'read',false));
});
test('bridge assets are verified, installer aliases become immutable, and macOS is required by default',async t => {
  const f = await fixture(t), source = join(f.root,'bridge'); await mkdir(join(source,'packages'),{recursive:true});
  const path = join(source,'packages','bridge-2.0.0.exe'); await writeFile(path,'installer fixture');
  await writeFile(join(source,'install.sh'),'#!/bin/sh\necho installer fixture');
  const info = await fileDigest(path);
  await writeFile(join(source,'latest.json'),serialize({version:'2.0.0',channel:'stable',assets:[],installerAssets:[{platform:'win32',arch:'x64',url:'https://pixflow.dev/downloads/pixflow-design-bridge/packages/bridge-2.0.0.exe',sha256:info.sha256,size:info.bytes}],installers:{windows:'https://pixflow.dev/downloads/pixflow-design-bridge/packages/latest.exe',linux:'https://pixflow.dev/downloads/pixflow-design-bridge/install.sh'}}));
  const options = {product:'bridge',target:'staging',source} as const, base = await readBase(f.store);
  await assert.rejects(prepareRelease(base,options),/macOS ARM/);
  const plan = await prepareRelease(base,{...options,allowWindowsOnly:true}); await publishPlan(f.store,plan,true);
  const installers = (await readBase(f.store)).snapshot.public_manifests[manifestPaths[1]]!.installers as Record<string,string>;
  assert.match(installers.windows!,/bridge-2\.0\.0\.exe$/); assert.match(installers.linux!,/releases\/2\.0\.0-/);
  assert.equal((await readBase({...f.store,target:'production'})).snapshot.public_manifests[manifestPaths[1]],undefined);
  await writeFile(path,'changed bytes'); await assert.rejects(prepareRelease(await readBase(f.store),{...options,allowWindowsOnly:true}),/checksum/);
});

test('Intel and Apple Silicon downloads publish as verified immutable URLs', async t => {
  const f = await fixture(t), source = join(f.root, 'dual-mac');
  await mkdir(join(source, 'packages'), {recursive:true});
  const assets = [];
  for (const [platform, arch] of [['win32','x64'], ['darwin','arm64'], ['darwin','x64']]) {
    const name = `bridge-2.0.2-${platform}-${arch}.bin`;
    const path = join(source, 'packages', name);
    await writeFile(path, `${platform}-${arch}`);
    const info = await fileDigest(path);
    assets.push({platform,arch,url:`https://pixflow.dev/downloads/pixflow-design-bridge/packages/${name}`,sha256:info.sha256,size:info.bytes});
  }
  await writeFile(join(source,'latest.json'),serialize({version:'2.0.2',channel:'stable',assets:[],installerAssets:assets,installers:{macosX64:'https://pixflow.dev/downloads/pixflow-design-bridge/packages/latest-intel.dmg'}}));
  const plan = await prepareRelease(await readBase(f.store),{product:'bridge',target:'staging',source});
  await publishPlan(f.store,plan,true);
  const installers = (await readBase(f.store)).snapshot.public_manifests[manifestPaths[1]]!.installers as Record<string,string>;
  assert.equal(installers.macosX64,assets[2]!.url);
  assert.equal(installers.macos,assets[2]!.url);
  assert.equal(installers.macosArm64,assets[1]!.url);
});

test('four-part WordPress hotfix versions publish and reject downgrades', async t => {
  const f = await fixture(t);
  await publishPlan(f.store, await f.plugin('2.0.1'), true);
  await publishPlan(f.store, await f.plugin('2.0.1.1'), true);
  assert.equal((await readBase(f.store)).snapshot.artifacts.find(a => a.current)?.version, '2.0.1.1');
  await assert.rejects(async () => publishPlan(f.store, await f.plugin('2.0.1'), true), /downgrade/);
  await publishPlan(f.store, await f.plugin('2.0.2'), true);
});
