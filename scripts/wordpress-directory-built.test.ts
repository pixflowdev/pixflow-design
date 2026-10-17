import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';

const directoryZipBytes = await readFile(process.env.PIXFLOW_DESIGN_DIRECTORY_TEST_ZIP || new URL('../dist/wordpress-directory/pixflow-design-2.0.4.zip', import.meta.url));
const directoryZip = await JSZip.loadAsync(directoryZipBytes);
const prefix = 'pixflow-ai/';

test('directory review ZIP stays below the official 10 MB upload limit', async () => {
  assert.ok(directoryZipBytes.length < 10_000_000);
});

test('Free ships native administration and polite Pro boundaries without advanced implementations', async () => {
  for (const path of ['src/AdvancedSiteTools/AdvancedSiteTools.php', 'src/Admin/WpAdminCodeProjectService.php', 'src/Admin/WpAdminPluginSourceService.php', 'src/Source/WordPressSourceInspector.php', 'resources/mcp-skills/wp-admin/code-projects/SKILL.md', 'resources/mcp-skills/advanced-admin/code-projects/SKILL.md']) assert.equal(directoryZip.file(prefix + path), null, path);
  assert.ok(directoryZip.file(prefix + 'src/Admin/WordPressAdminOperations.php'));
  const workspace = await directoryZip.file(prefix + 'src/Admin/DirectSiteWorkspace.php')!.async('string');
  assert.doesNotMatch(workspace, /\beval\s*\(/);
  const boundary = await directoryZip.file(prefix + 'src/Modules/AdvancedSiteAccess.php')!.async('string');
  assert.match(boundary, /'allowed' => false/);
  assert.match(boundary, /'code' => 'pro_required'/);
  assert.match(boundary, /https:\/\/pixflow\.dev\/free-pro#advanced-site-tools/);
  const guidance = await directoryZip.file(prefix + 'resources/mcp-skills/wp-admin/index.md')!.async('string');
  assert.match(guidance, /wordpress\.posts\.\*/);
  assert.match(guidance, /normal availability result/);
  assert.doesNotMatch(guidance, /expose `files\.\*`|evaluates PHP in function scope/);
});

test('built directory archive has no updater or nested archives and retains the installed plugin identity', async () => {
  assert.ok(directoryZip.file(prefix + 'pixflow-ai.php'));
  assert.equal(directoryZip.file(prefix + 'src/Admin/PluginUpdater.php'), null);
  assert.equal(Object.keys(directoryZip.files).some(name => /\.(?:zip|gz|tgz|tar|rar|7z)$/i.test(name)), false);
  const entry = await directoryZip.file(prefix + 'pixflow-ai.php')!.async('string');
  assert.doesNotMatch(entry, /PluginUpdater|Update URI:|seed_default_auto_update_setting/);
  assert.match(entry, /Text Domain: pixflow-ai/);
  assert.match(entry, /Requires at least: 6\.2/);
  const readme = await directoryZip.file(prefix + 'readme.txt')!.async('string');
  assert.equal(entry.match(/Tested up to: ([^\r\n]+)/)?.[1], readme.match(/Tested up to: ([^\r\n]+)/)?.[1]);
  assert.doesNotMatch(entry, /\r/);
});

test('unpacked directory guidance exactly matches the ordinary bundled instructions', async () => {
  let count = 0;
  for (const [name, file] of Object.entries(directoryZip.files)) {
    if (file.dir || !name.startsWith(prefix + 'resources/bundled-library/')) continue;
    const relative = name.slice((prefix + 'resources/bundled-library/').length);
    const other = prefix + 'resources/bundled-' + relative;
    assert.ok(directoryZip.file(other), `missing matching bundled guidance ${relative}`);
    assert.deepEqual(await file.async('nodebuffer'), await directoryZip.file(other)!.async('nodebuffer'));
    count++;
  }
  assert.ok(count > 10, 'required bundled guidance was not packaged');
});

test('directory third-party inventory has actual dependency licences and no bundled React claim', async () => {
  const inventory = JSON.parse(await directoryZip.file(prefix + 'resources/dependency-licences.json')!.async('string'));
  assert.ok(inventory.packages.some((item: { name: string }) => item.name === 'zod'));
  assert.ok(inventory.packages.some((item: { name: string }) => item.name === 'framer-motion'));
  assert.ok(!inventory.packages.some((item: { name: string }) => item.name === 'react' || item.name === 'react-dom'));
  const notice = await directoryZip.file(prefix + 'THIRD-PARTY-NOTICES.txt')!.async('string');
  assert.match(notice, /Permission is hereby granted/);
  assert.match(notice, /Lobe Icons v6\.0\.0/);
  assert.match(notice, /Copyright \(c\) 2023 LobeHub/);
  assert.match(notice, /copyright licensing does not grant trademark rights/);
  assert.doesNotMatch(notice, /requires confirmation before directory submission/);
});

test('packaged directory provider artwork matches the reviewed provenance and includes original licence texts', async () => {
  const vendor = new URL('../wordpress/directory/vendor/provider-icons/', import.meta.url);
  const expected = JSON.parse(await readFile(new URL('manifest.json', vendor), 'utf8'));
  const manifest = JSON.parse(await directoryZip.file(prefix + 'assets/app/provider-asset-sources.json')!.async('string'));
  assert.deepEqual(manifest, expected);
  assert.equal(manifest.assets.length, 42);
  for (const asset of manifest.assets) {
    const file = directoryZip.file(prefix + 'assets/app/' + asset.target);
    assert.ok(file, `missing provider artwork ${asset.target}`);
    assert.equal(createHash('sha256').update(await file.async('nodebuffer')).digest('hex'), asset.sha256);
  }
  for (const source of manifest.sources) {
    const file = directoryZip.file(prefix + 'assets/app/brand-licences/' + source.licenseFile);
    assert.ok(file, `missing provider artwork licence ${source.licenseFile}`);
    assert.deepEqual(await file.async('nodebuffer'), await readFile(new URL(source.licenseFile, vendor)));
  }
  assert.deepEqual(
    await directoryZip.file(prefix + 'assets/app/brand-licences/original-neutral.svg')!.async('nodebuffer'),
    await readFile(new URL('original-neutral.svg', vendor)),
  );
});

test('packaged Free source recipes include every immutable input without private Pro modules', async () => {
  const root = prefix + 'source/';
  let recipeCount = 0;
  let inputCount = 0;
  for (const [name, file] of Object.entries(directoryZip.files)) {
    if (!name.startsWith(root) || !name.endsWith('.json') || name.slice(root.length).includes('/')) continue;
    const recipe = JSON.parse(await file.async('string'));
    if (recipe.schema !== 1 || !recipe.inputs) continue;
    recipeCount++;
    for (const [key, input] of Object.entries(recipe.inputs) as [string, { file: string; registry?: {name:string;version:string;path:string;sha256:string} }][]) {
      assert.doesNotMatch(key, /(?:^|\/)apps\/web\/src\/pro\//);
      assert.match(input.file, /^inputs\/[a-f0-9]{64}\.[a-z0-9]+$/i);
      let bytes: Buffer;
      if (input.registry) {
        assert.match(key, /^node_modules\//);
        const lock = JSON.parse(await directoryZip.file(root + 'package-lock.json')!.async('string'));
        assert.equal(lock.packages[''].dependencies[input.registry.name], input.registry.version);
        assert.equal(lock.packages['node_modules/' + input.registry.name].version, input.registry.version);
        assert.match(lock.packages['node_modules/' + input.registry.name].integrity, /^sha512-/);
        bytes = await readFile(new URL('../' + key, import.meta.url));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), input.registry.sha256);
      } else {
        const source = directoryZip.file(root + input.file);
        assert.ok(source, `missing source input ${key}`);
        bytes = await source.async('nodebuffer');
      }
      const hash = createHash('sha256').update(bytes).digest('hex');
      assert.equal(input.file.split('/')[1]?.split('.')[0], hash);
      inputCount++;
    }
  }
  assert.ok(recipeCount >= 7);
  assert.ok(inputCount > 1000);
  for (const file of ['rebuild.ts', 'css-scope.ts', 'wordpress-language-scope.ts', 'package.json', 'package-lock.json']) {
    assert.ok(directoryZip.file(root + file), `missing standalone build input ${file}`);
  }
});
