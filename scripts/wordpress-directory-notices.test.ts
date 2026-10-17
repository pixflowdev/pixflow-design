import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { writeDirectoryNotices } from './wordpress-directory-notices.ts';
import { copyDirectoryLogoAssets } from './wordpress-directory-logo-assets.ts';

test('directory attribution includes only emitted dependencies and their real licence text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-notices-'));
  try {
    const plugin = join(root, 'package');
    const dependency = join(root, 'node_modules/.pnpm/@example+used@1.2.3/node_modules/@example/used');
    await mkdir(dependency, { recursive: true });
    await mkdir(join(plugin, 'assets/app'), { recursive: true });
    await copyDirectoryLogoAssets(fileURLToPath(new URL('..', import.meta.url)), join(plugin, 'assets/app'));
    await mkdir(join(plugin, 'resources'), { recursive: true });
    await mkdir(join(root, 'wordpress/directory/vendor/remixicon'), { recursive: true });
    await writeFile(join(root, 'wordpress/directory/vendor/remixicon/LICENSE.txt'), 'Apache License Version 2.0');
    await writeFile(join(dependency, 'package.json'), JSON.stringify({ name: '@example/used', version: '1.2.3', license: 'MIT' }));
    await writeFile(join(dependency, 'LICENSE'), 'Copyright Example. Permission to use this fixture.');
    await writeFile(join(plugin, 'assets/app/runtime.js'), '// node_modules/.pnpm/@example+used@1.2.3/node_modules/@example/used/main.js\nvar used = true;');
    await writeDirectoryNotices(root, plugin);
    const notices = await readFile(join(plugin, 'THIRD-PARTY-NOTICES.txt'), 'utf8');
    assert.match(notices, /@example\/used 1\.2\.3/);
    assert.match(notices, /Copyright Example/);
    assert.match(notices, /Lobe Icons v6\.0\.0/);
    assert.match(notices, /Copyright \(c\) 2023 LobeHub/);
    assert.match(notices, /Copyright \(c\) 2026 Pixflow/);
    assert.match(notices, /copyright licensing does not grant trademark rights/);
    assert.doesNotMatch(notices, /requires confirmation before directory submission/);
    const inventory = JSON.parse(await readFile(join(plugin, 'resources/dependency-licences.json'), 'utf8'));
    assert.deepEqual(inventory.packages, [{ name: '@example/used', version: '1.2.3', license: 'MIT', texts: ['LICENSE'] }]);
    const snapshotOnly = 'node_modules/.pnpm/source-only@1.0.0/node_modules/source-only';
    await mkdir(join(root, snapshotOnly), { recursive: true });
    await writeFile(join(root, snapshotOnly, 'package.json'), JSON.stringify({ name: 'source-only', version: '1.0.0', license: 'MIT' }));
    await writeFile(join(root, snapshotOnly, 'LICENSE'), 'Source-only package licence.');
    await mkdir(join(plugin, 'source'), { recursive: true });
    await writeFile(join(plugin, 'source/core.json'), JSON.stringify({ schema: 1, inputs: { [snapshotOnly + '/index.js']: {} } }));
    await writeDirectoryNotices(root, plugin);
    assert.match(await readFile(join(plugin, 'THIRD-PARTY-NOTICES.txt'), 'utf8'), /Source-only package licence/);
    await rm(join(dependency, 'LICENSE'));
    await assert.rejects(writeDirectoryNotices(root, plugin), /has no licence text/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
