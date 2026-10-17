import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { directorySourceBuild } from './wordpress-directory-source.ts';
import { sourceRegistryDependency } from './wordpress-directory-source-dependencies.ts';

test('registry source references require exact unmodified package bytes and pinned identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-source-registry-'));
  try {
    const dir = join(root, 'node_modules/.pnpm/example@1.2.3/node_modules/example');
    await mkdir(dir, {recursive:true});
    await writeFile(join(dir, 'package.json'), JSON.stringify({name:'example',version:'1.2.3'}));
    await writeFile(join(dir, 'index.js'), 'export const value = 1;');
    const file = 'node_modules/.pnpm/example@1.2.3/node_modules/example/index.js';
    assert.equal((await sourceRegistryDependency(root, file, Buffer.from('export const value = 1;')))?.version, '1.2.3');
    assert.equal(await sourceRegistryDependency(root, file, Buffer.from('transformed virtual source')), undefined);
    assert.equal(await sourceRegistryDependency(root, 'apps/web/source.ts', Buffer.from('source')), undefined);
    assert.equal(await sourceRegistryDependency(root, file.replace('index.js', '../index.js'), Buffer.from('source')), undefined);
  } finally { await rm(root, {recursive:true,force:true}); }
});

test('directory snapshot captures real and virtual Free inputs, while website builds do not create snapshots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-source-'));
  const old = process.env.PIXFLOW_DESIGN_WORDPRESS_DISTRIBUTION;
  try {
    await writeFile(join(root, 'entry.ts'), 'import { value } from "virtual-guidance"; console.log(value);');
    const options = { absWorkingDir: root, entryPoints: [join(root, 'entry.ts')], outfile: join(root, 'app.js'), bundle: true,
      plugins: [{ name: 'guidance', setup(build: import('esbuild').PluginBuild) {
        build.onResolve({ filter: /^virtual-guidance$/ }, () => ({ path: 'guidance', namespace: 'free' }));
        build.onLoad({ filter: /.*/, namespace: 'free' }, () => ({ contents: 'export const value = "bundled Free guidance";', loader: 'ts' }));
      } }],
    };
    process.env.PIXFLOW_DESIGN_WORDPRESS_DISTRIBUTION = 'website';
    await directorySourceBuild(root, 'core', options);
    await assert.rejects(readFile(join(root, '.tmp/wordpress-directory/source-project/core.json')));
    process.env.PIXFLOW_DESIGN_WORDPRESS_DISTRIBUTION = 'directory';
    await directorySourceBuild(root, 'core', options);
    const recipe = JSON.parse(await readFile(join(root, '.tmp/wordpress-directory/source-project/core.json'), 'utf8'));
    assert.deepEqual(Object.keys(recipe.inputs).sort(), ['entry.ts', 'free:guidance']);
    const captured = await readFile(join(root, '.tmp/wordpress-directory/source-project', recipe.inputs['free:guidance'].file), 'utf8');
    assert.match(captured, /bundled Free guidance/);
    assert.equal(recipe.inputs['entry.ts'].imports[0].path, 'free:guidance');
    await mkdir(join(root, 'apps/web/src/pro'), { recursive: true });
    await writeFile(join(root, 'apps/web/src/pro/private.ts'), 'console.log("private implementation");');
    await assert.rejects(directorySourceBuild(root, 'forbidden', { absWorkingDir: root,
      entryPoints: [join(root, 'apps/web/src/pro/private.ts')], outfile: join(root, 'private.js'), bundle: true }), /Private Pro source/);
  } finally {
    if (old === undefined) delete process.env.PIXFLOW_DESIGN_WORDPRESS_DISTRIBUTION;
    else process.env.PIXFLOW_DESIGN_WORDPRESS_DISTRIBUTION = old;
    await rm(root, { recursive: true, force: true });
  }
});
