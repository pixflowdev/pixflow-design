import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { dynamicImports, writeAssetRevisions } from './wordpress-lazy-assets.ts';

test('extracts executable literal imports, not comments or string contents', () => {
  const source = `// import('ignored')\nconst description = "import('also ignored')";\nconst load = () => import('./fr').then(x => x.fr);\nimport(variable);`;
  const imports = dynamicImports(source, 'test.ts');
  assert.equal(imports.length, 1);
  assert.equal(imports[0]?.specifier, './fr');
  assert.equal(source.slice(imports[0]!.start, imports[0]!.end), "import('./fr')");
});

test('revision manifest describes exact final bundle bytes and changes on same-version rebuilds', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'pixflow-revisions-'));
  try {
    await writeFile(join(folder, 'pixflow-app.js'), 'one');
    await writeFile(join(folder, 'notes.txt'), 'not a bundle');
    await writeAssetRevisions(folder);
    let manifest = JSON.parse(await readFile(join(folder, 'asset-revisions.json'), 'utf8'));
    assert.deepEqual(Object.keys(manifest.files), ['pixflow-app.js']);
    assert.equal(manifest.files['pixflow-app.js'].sha256, createHash('sha256').update('one').digest('hex'));
    await writeFile(join(folder, 'pixflow-app.js'), 'two');
    await writeAssetRevisions(folder);
    manifest = JSON.parse(await readFile(join(folder, 'asset-revisions.json'), 'utf8'));
    assert.equal(manifest.files['pixflow-app.js'].sha256, createHash('sha256').update('two').digest('hex'));
    assert.equal(manifest.files['pixflow-app.js'].size, 3);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
