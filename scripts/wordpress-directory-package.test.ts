import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  assertDistributionAssets, directoryPluginEntry, directoryTranslationDomains,
  prepareDirectoryPhp, wordpressDistribution,
} from './wordpress-directory-package.ts';

test('directory entry keeps activation migrations and identity while removing every private updater hook', async () => {
  const source = await readFile(new URL('../pixflow-design.php', import.meta.url), 'utf8');
  const directory = directoryPluginEntry(source);
  assert.match(source, /Update URI: https:\/\/pixflow.dev/);
  assert.match(source, /seed_default_auto_update_setting/);
  assert.doesNotMatch(directory, /PluginUpdater|plugin_updater|Update URI:|seed_default_auto_update_setting/);
  assert.match(directory, /register_activation_hook\(__FILE__, static function \(\): void \{/);
  assert.match(directory, /\\PixflowDesign\\WordPress\\Plugin::activate\(\)/);
  assert.match(directory, /\\PixflowDesign\\WordPress\\Plugin::boot\(\)/);
  assert.match(directory, /PIXFLOW_DESIGN_DISTRIBUTION', 'directory'/);
  assert.match(directory, /Requires at least: 6\.2/);
  assert.doesNotMatch(directory, /Tested up to:/);
  assert.doesNotMatch(directory, /\r/);
  assert.match(directory, /Text Domain: pixflow-ai/);
  assert.doesNotMatch(directory, /load_plugin_textdomain/);
  assert.match(source, /load_plugin_textdomain\('pixflow-design'/);
  assert.match(directory, /LanguagePackService::load_installed\('pixflow-ai'\)/);
  assert.throws(() => directoryPluginEntry(source.replace('$pixflow_design_plugin_updater = new ', '$renamed = new ')), /identify website updater/);
});

test('translation mapping preserves identifiers, settings, routes, prose and nested expressions', () => {
  const source = `<?php
  $saved = 'pixflow-design';
  get_option('pixflow-design');
  register_rest_route('pixflow-design', '/route', []);
  __('A message, with punctuation', 'pixflow-design');
  esc_html__('A message', 'pixflow-design');
  _x('A label', 'context', 'pixflow-design');
  _n('One', 'Many', count([1, 2]), 'pixflow-design');
  _nx('One', 'Many', count([1, 2]), 'context', 'pixflow-design');
  __('pixflow-design', 'some-other-domain');
  // __('Example', 'pixflow-design');
  `;
  const mapped = directoryTranslationDomains(source);
  assert.equal((mapped.match(/'pixflow-ai'/g) ?? []).length, 5);
  assert.match(mapped, /get_option\('pixflow-design'\)/);
  assert.match(mapped, /register_rest_route\('pixflow-design'/);
  assert.match(mapped, /__\('pixflow-design', 'some-other-domain'\)/);
  assert.match(mapped, /\/\/ __\('Example', 'pixflow-design'\)/);
  assert.equal(directoryTranslationDomains(mapped), mapped);
});

test('distribution selection and runtime marker fail closed on mixed assets', async () => {
  assert.equal(wordpressDistribution(undefined), 'website');
  assert.equal(wordpressDistribution('directory'), 'directory');
  assert.throws(() => wordpressDistribution('wordpres'), /Unknown/);
  const root = await mkdtemp(join(tmpdir(), 'pixflow-distribution-'));
  try {
    await assertDistributionAssets(root, 'website');
    await assert.rejects(assertDistributionAssets(root, 'directory'), /Build directory/);
    await writeFile(join(root, 'distribution.json'), JSON.stringify({ distribution: 'directory' }));
    await assertDistributionAssets(root, 'directory');
    await assert.rejects(assertDistributionAssets(root, 'website'), /Refusing directory/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('directory staging removes updater source and rewrites only translation arguments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-directory-stage-'));
  try {
    await mkdir(join(root, 'src/Admin'), { recursive: true });
    await writeFile(join(root, 'pixflow-ai.php'), await readFile(new URL('../pixflow-design.php', import.meta.url)));
    await writeFile(join(root, 'src/Admin/PluginUpdater.php'), '<?php private_updater();');
    await writeFile(join(root, 'src/Example.php'), "<?php __('Label', 'pixflow-design'); get_option('pixflow-design');");
    await prepareDirectoryPhp(root, 'pixflow-ai.php');
    await assert.rejects(readFile(join(root, 'src/Admin/PluginUpdater.php')), { code: 'ENOENT' });
    assert.equal(await readFile(join(root, 'src/Example.php'), 'utf8'), "<?php __('Label', 'pixflow-ai'); get_option('pixflow-design');");
  } finally { await rm(root, { recursive: true, force: true }); }
});
