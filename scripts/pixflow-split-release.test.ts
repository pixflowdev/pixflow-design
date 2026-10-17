import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { prepareRelease } from './lib/pixflow-release-build.ts';
import { publishPlan, readBase, validateSnapshot } from './lib/pixflow-release-store.ts';
import type { Store } from './lib/pixflow-release-store.ts';

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-split-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store: Store = { target: 'staging', privateRoot: join(root, 'private'), publicRoot: join(root, 'public') };
  await mkdir(store.privateRoot); await mkdir(store.publicRoot);
  async function zip(pro: boolean, version: string, suffix = '') {
    const archive = new JSZip(), slug = pro ? 'pixflow-design-pro' : 'pixflow-ai';
    archive.file(`${slug}/${slug}.php`, `<?php\n/*\nPlugin Name: Pixflow Design${pro ? ' Pro' : ''}\nVersion: ${version}\nRequires at least: 6.0\nRequires PHP: 8.1\n${pro ? 'Requires Plugins: pixflow-ai\n' : ''}*/\n${suffix}`);
    const path = join(root, `${slug}-${version}-${suffix || 'base'}.zip`);
    await writeFile(path, await archive.generateAsync({ type: 'nodebuffer' })); return path;
  }
  const legacy = await prepareRelease(await readBase(store), { product: 'plugin', target: 'staging', source: await zip(false, '2.0.3') });
  await publishPlan(store, legacy, true);
  return { root, store, zip };
}

test('Free and Pro publish atomically, retaining bundled history and production isolation', async t => {
  const f = await fixture(t), before = await readBase(f.store);
  const plan = await prepareRelease(before, { product: 'plugin', target: 'staging', source: await f.zip(false, '2.0.4'), edition: 'free', proSource: await f.zip(true, '2.0.4') });
  assert.equal(plan.files.length, 2);
  assert.equal((await publishPlan(f.store, plan)).applied, false);
  assert.equal((await readBase(f.store)).hash, before.hash);
  await publishPlan(f.store, plan, true);
  const after = await readBase(f.store), current = after.snapshot.artifacts.filter(a => a.current);
  assert.deepEqual(current.map(a => [a.slug, a.edition]), [['pixflow-design', 'free'], ['pixflow-design-pro', undefined]]);
  for (const artifact of current) assert.deepEqual(artifact.icons, { svg: 'https://pixflow.dev/icon.svg' });
  assert.deepEqual(after.snapshot.artifacts[0], { ...before.snapshot.artifacts[0], current: false });
  assert.equal((await readBase({ ...f.store, target: 'production' })).snapshot.artifacts.length, 0);
  for (const file of plan.files) assert.deepEqual(await readFile(join(f.store.privateRoot, file.destination)), await readFile(file.source));
});

test('missing or corrupt Pro cannot activate the Free transition', async t => {
  const f = await fixture(t), base = await readBase(f.store), source = await f.zip(false, '2.0.4');
  await assert.rejects(prepareRelease(base, { product: 'plugin', target: 'staging', source, edition: 'free' }), /Pro download/);
  const proSource = await f.zip(true, '2.0.4');
  const plan = await prepareRelease(base, { product: 'plugin', target: 'staging', source, edition: 'free', proSource });
  await writeFile(proSource, 'corrupt');
  await assert.rejects(publishPlan(f.store, plan, true), /checksum/);
  assert.equal((await readBase(f.store)).hash, base.hash);
});

test('independent Pro upgrades preserve Free and reject downgrade or changed published bytes', async t => {
  const f = await fixture(t);
  await publishPlan(f.store, await prepareRelease(await readBase(f.store), { product: 'plugin', target: 'staging', source: await f.zip(false, '2.0.4'), edition: 'free', proSource: await f.zip(true, '2.0.4') }), true);
  const base = await readBase(f.store), core = base.snapshot.artifacts.find(a => a.current && a.slug === 'pixflow-design');
  await assert.rejects(prepareRelease(base, { product: 'pro', target: 'staging', source: await f.zip(true, '2.0.4', 'changed') }), /cannot change bytes/);
  await assert.rejects(publishPlan(f.store, await prepareRelease(base, { product: 'pro', target: 'staging', source: await f.zip(true, '2.0.3') }), true), /downgrade/);
  await publishPlan(f.store, await prepareRelease(base, { product: 'pro', target: 'staging', source: await f.zip(true, '2.0.5') }), true);
  assert.deepEqual((await readBase(f.store)).snapshot.artifacts.find(a => a.current && a.slug === 'pixflow-design'), core);
  assert.deepEqual((await readBase(f.store)).snapshot.artifacts.find(a => a.current && a.slug === 'pixflow-design-pro')?.icons, { svg: 'https://pixflow.dev/icon.svg' });
});

test('catalogue rejects Pro-only state and core editions on Pro artifacts', async t => {
  const f = await fixture(t), plan = await prepareRelease(await readBase(f.store), { product: 'plugin', target: 'staging', source: await f.zip(false, '2.0.4'), edition: 'free', proSource: await f.zip(true, '2.0.4') });
  const pro = plan.snapshot.artifacts.find(a => a.slug === 'pixflow-design-pro')!;
  assert.throws(() => validateSnapshot({ ...plan.snapshot, artifacts: [pro] }), /current core/);
  pro.edition = 'free';
  assert.throws(() => validateSnapshot(plan.snapshot), /Edition/);
});
