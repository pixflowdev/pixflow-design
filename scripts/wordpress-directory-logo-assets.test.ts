import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { copyDirectoryLogoAssets, validateDirectoryLogoAssets } from './wordpress-directory-logo-assets.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function fixture(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'pixflow-logo-test-'));
  try { await run(directory); } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'pixflow-logo-test-'));
    await rm(directory, { recursive: true, force: true });
  }
}

test('every directory provider mark has pinned compatible source or documented neutral artwork', async () => {
  const manifest = await validateDirectoryLogoAssets(root);
  assert.equal(manifest.assets.length, 42);
  assert.equal(manifest.assets.filter(asset => asset.kind === 'brand').length, 35);
  assert.equal(manifest.assets.filter(asset => asset.kind === 'neutral').length, 7);
  assert.equal(manifest.assets.find(asset => asset.target === 'agent-icons/azure-openai-api.png')?.kind, 'neutral');
  assert.equal(manifest.assets.find(asset => asset.target === 'agent-icons/copilot.svg')?.kind, 'neutral');
  assert.match(manifest.trademarkNotice, /does not grant trademark rights/);
});

test('directory output preserves all runtime filenames and ships notices without touching website artwork', async () => fixture(async directory => {
  const manifest = await validateDirectoryLogoAssets(root);
  const original = await Promise.all(manifest.assets.map(asset => readFile(join(root, 'apps/web/public', asset.target))));
  await copyDirectoryLogoAssets(root, directory);
  for (const [index, asset] of manifest.assets.entries()) {
    const originalBytes = original[index];
    assert.ok(originalBytes, `missing original website artwork snapshot: ${asset.target}`);
    assert.equal(hash(await readFile(join(directory, asset.target))), asset.sha256);
    assert.equal(hash(await readFile(join(root, 'apps/web/public', asset.target))), hash(originalBytes));
  }
  for (const source of manifest.sources) assert.equal(hash(await readFile(join(directory, 'brand-licences', source.licenseFile))), source.licenseSha256);
  assert.ok((await readFile(join(directory, 'provider-asset-sources.json'), 'utf8')).includes('8a1b2821bb768c484fe8da20c5e1838b6bf551a9'));
}));

test('changed image bytes or a new unmapped runtime icon fail closed', async () => fixture(async directory => {
  for (const part of ['apps/web/public/agent-icons', 'apps/web/public/model-icons', 'wordpress/directory/vendor/provider-icons']) {
    await mkdir(dirname(join(directory, part)), { recursive: true });
    await cp(join(root, part), join(directory, part), { recursive: true });
  }
  const image = join(directory, 'wordpress/directory/vendor/provider-icons/agent-icons/codex.svg');
  const original = await readFile(image);
  await writeFile(image, '<svg/>');
  await assert.rejects(validateDirectoryLogoAssets(directory), /Logo asset changed/);
  await writeFile(image, original);
  await writeFile(join(directory, 'apps/web/public/agent-icons/new-provider.svg'), '<svg/>');
  await assert.rejects(validateDirectoryLogoAssets(directory), /cover every runtime asset exactly once/);
}));

test('website builds retain the existing artwork branch and never use directory replacements', async () => {
  const script = await readFile(join(root, 'scripts/build-wordpress-web.mjs'), 'utf8');
  assert.match(script, /if \(distribution === 'directory'\) \{\s*await copyDirectoryLogoAssets\(root, stagingOutdir\);\s*\} else \{\s*await cp\(join\(webPublicDir, 'agent-icons'\)/);
});
