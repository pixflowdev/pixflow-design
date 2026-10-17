import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { wordpressRetiredSurfaces, RETIRED_WORDPRESS_SURFACES } from './wordpress-retired-surfaces.ts';
import { isWordPressRuntimePath } from './wordpress-package-hygiene.ts';

test('WordPress excludes retired catalogue imports; standalone retains them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-catalogue-boundary-'));
  const directory = join(root, 'apps/web/src/components');
  try {
    await mkdir(directory, { recursive: true });
    for (const name of RETIRED_WORDPRESS_SURFACES) {
      await writeFile(join(directory, `${name}.tsx`), `export function ${name}() { return 'retired-catalogue-${name}'; }`);
    }
    await writeFile(join(directory, 'DesignSystemPreviewModal.tsx'), "export function DesignSystemPreviewModal() { return 'preserved-design-preview'; }");
    await writeFile(join(directory, 'PluginDetailsModal.tsx'), "export function PluginDetailsModal() { return 'preserved-chat-context'; }");
    const names = [...RETIRED_WORDPRESS_SURFACES, 'DesignSystemPreviewModal', 'PluginDetailsModal'];
    const contents = names.map(name => `import { ${name} } from './${name}';`).join('\n')
      + `\nconsole.log([${names.map(name => `${name}()`).join(',')}]);`;
    const options = { stdin: { contents, resolveDir: directory, loader: 'ts' as const }, bundle: true, write: false, metafile: true };
    const wordpress = await build({ ...options, plugins: [wordpressRetiredSurfaces(root)] });
    const standalone = await build(options);
    for (const name of RETIRED_WORDPRESS_SURFACES) {
      assert.ok(!wordpress.outputFiles![0]!.text.includes(`retired-catalogue-${name}`));
      assert.ok(standalone.outputFiles![0]!.text.includes(`retired-catalogue-${name}`));
      assert.ok(!Object.keys(wordpress.metafile!.inputs).some(path => path.endsWith(`/${name}.tsx`)));
    }
    for (const retained of ['preserved-design-preview', 'preserved-chat-context']) {
      assert.ok(wordpress.outputFiles![0]!.text.includes(retained));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('retired WordPress catalogue entry points are redirected or hidden', async () => {
  const root = resolve(import.meta.dirname, '..');
  const router = await readFile(join(root, 'apps/web/src/router.ts'), 'utf8');
  const settings = await readFile(join(root, 'apps/web/src/components/SettingsDialog.tsx'), 'utf8');
  assert.match(router, /hasPixflowWordPressContext\(\) && \['plugins', 'marketplace'\]\.includes/);
  assert.match(settings, /section !== 'resources' \|\| !hasPixflowWordPressContext\(\)/);
});

test('Pro package hygiene excludes dev files without stripping runtime or skill credits', () => {
  for (const path of ['assets/app/app.js.map', 'src/Example.test.php', 'src/tests/fixture.php', 'assets/.DS_Store', 'assets/Thumbs.db', 'assets/src/widget.tsx', 'resources/node_modules/pkg/package.json', 'languages/fr_FR.mo', 'languages/fr_FR.po']) {
    assert.equal(isWordPressRuntimePath(path), false, path);
    assert.equal(isWordPressRuntimePath(path.replaceAll('/', '\\')), false, path);
  }
  for (const path of ['src/Plugin.php', 'assets/app/app.js', 'assets/app/app.css', 'resources/bundled-library.zip', 'resources/mcp-skills/bricks/references/README.md', 'resources/mcp-skills/bricks/LICENSE', 'languages/pixflow-design-pro.pot']) {
    assert.equal(isWordPressRuntimePath(path), true, path);
  }
});
