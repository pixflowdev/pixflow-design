import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { build } from 'esbuild';
import { parseWordPressWebBuildArguments, resolveWordPressBuild, wordpressCoreSource } from './wordpress-build-contract.ts';

test('Free build does not inspect an optional Pro source path', () => {
  assert.equal(resolveWordPressBuild('/nonexistent-core', { proRoot: '/nonexistent-private-repository' }).target, 'free');
  assert.deepEqual(parseWordPressWebBuildArguments([]), {});
});

test('Pro builds require explicit compatible source before executing a recipe', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pixflow-build-contract-'));
  try {
    const core = join(directory, 'core');
    const pro = join(directory, 'pro');
    await mkdir(join(core, 'wordpress/src/Modules'), { recursive: true });
    await mkdir(join(pro, 'scripts'), { recursive: true });
    await writeFile(join(core, 'wordpress/src/Modules/ModuleHost.php'), '<?php public const API_VERSION = 14;');
    await writeFile(join(pro, 'scripts/wordpress-web-build.ts'), 'throw new Error("Recipes must not execute during validation");');
    await writeFile(join(pro, 'pixflow-pro.json'), JSON.stringify({ buildContract: 1, core: { moduleApi: 13 } }));
    assert.throws(() => resolveWordPressBuild(core, { target: 'pro', proRoot: pro }), /Incompatible Pro checkout/);
    await writeFile(join(pro, 'pixflow-pro.json'), JSON.stringify({ buildContract: 1, core: { moduleApi: 14 } }));
    const result = resolveWordPressBuild(core, { target: 'pro', proRoot: pro });
    assert.equal(result.proRoot, pro);
    assert.equal(result.outdir, join(pro, '.tmp/build/wordpress-pro/assets/app'));
    await writeFile(join(core, 'pixflow-design.php'), '<?php /*\nVersion: 2.0.3\n*/');
    await writeFile(join(pro, 'pixflow-pro.json'), JSON.stringify({ buildContract: 1, core: { moduleApi: 14, minimumVersion: '2.0.4' } }));
    assert.throws(() => resolveWordPressBuild(core, { target: 'pro', proRoot: pro }), /Incompatible core version/);
    await writeFile(join(pro, 'pixflow-pro.json'), JSON.stringify({ buildContract: 2, core: { moduleApi: 14 } }));
    assert.throws(() => resolveWordPressBuild(core, { target: 'pro', proRoot: pro }), /Unsupported Pro build contract/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Build CLI rejects ambiguous or unknown options', () => {
  assert.deepEqual(parseWordPressWebBuildArguments(['--target', 'pro', '--pro-root', 'private', '--outdir', 'staging']), { target: 'pro', proRoot: 'private', outdir: 'staging' });
  assert.throws(() => parseWordPressWebBuildArguments(['--pro-root']), /Missing value/);
  assert.throws(() => parseWordPressWebBuildArguments(['--target', 'both']), /Unknown WordPress build target/);
  assert.throws(() => parseWordPressWebBuildArguments(['--typo', 'value']), /Unknown WordPress build option/);
});

test('Named shared-source imports resolve to the core owner and forbid private paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pixflow-source-api-'));
  try {
    await mkdir(join(directory, 'apps/web/src'), { recursive: true });
    await writeFile(join(directory, 'apps/web/src/shared.ts'), 'export const value = "sole-core-owner";');
    const bundle = await build({ stdin: { contents: 'import {value} from "@pixflow-design/core/shared"; console.log(value);', loader: 'ts' }, bundle: true, write: false, metafile: true, plugins: [wordpressCoreSource(directory)] });
    assert.match(bundle.outputFiles![0]!.text, /sole-core-owner/);
    assert.equal(Object.keys(bundle.metafile!.inputs).filter(file => file.endsWith('shared.ts')).length, 1);
    await assert.rejects(build({ stdin: { contents: 'import "@pixflow-design/core/../secret";', loader: 'ts' }, bundle: true, write: false, logLevel: 'silent', plugins: [wordpressCoreSource(directory)] }), /Invalid core source import/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
