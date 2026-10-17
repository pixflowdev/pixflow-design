import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reuseWordPressHostIconStyles, reuseWordPressHostStyles } from './wordpress-shared-styles.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function fixture(run: (dir: string) => Promise<void>): Promise<void> {
  const scratch = join(root, '.tmp/shared-style-tests');
  await mkdir(scratch, { recursive: true });
  const dir = await mkdtemp(join(scratch, 'case-'));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('Pro reuses host icons without changing component cascade or module names', async () => {
  await fixture(async dir => {
    await writeFile(join(dir, 'entry.ts'), `import ${JSON.stringify(join(root, 'apps/web/src/styles/remixicon/remixicon.css'))}; import styles from './panel.module.css'; console.log(styles.panel);`);
    await writeFile(join(dir, 'panel.module.css'), '.panel { color: red } @media (min-width: 600px) { .panel { color: blue } } .panel { color: green }');
    const options = {
      entryPoints: [join(dir, 'entry.ts')], outdir: join(dir, 'out'), bundle: true,
      write: false, metafile: true, loader: { '.woff2': 'file' as const },
      plugins: [{ name: 'fixture-font', setup(build: Parameters<NonNullable<import('esbuild').Plugin['setup']>>[0]) {
        build.onResolve({ filter: /^\/remixicon\.woff2$/ }, () => ({ path: join(root, 'apps/web/public/remixicon.woff2') }));
      } }],
    };
    const before = await build(options);
    const after = await build({ ...options, plugins: [reuseWordPressHostIconStyles(root), ...options.plugins] });
    const beforeCss = before.outputFiles!.find(file => file.path.endsWith('.css'))!.text;
    const afterCss = after.outputFiles!.find(file => file.path.endsWith('.css'))!.text;
    assert.match(beforeCss, /@font-face/);
    assert.match(beforeCss, /ri-arrow/);
    assert.ok(before.outputFiles!.some(file => file.path.endsWith('.woff2')));
    assert.doesNotMatch(afterCss, /@font-face|ri-arrow/);
    assert.ok(!after.outputFiles!.some(file => file.path.endsWith('.woff2')));
    const componentMarker = `/* ${join(dir, 'panel.module.css').replaceAll('\\', '/').replace(root.replaceAll('\\', '/') + '/', '')} */`;
    assert.ok(beforeCss.includes(componentMarker));
    assert.equal(afterCss.slice(afterCss.indexOf(componentMarker)), beforeCss.slice(beforeCss.indexOf(componentMarker)));
    assert.equal(after.outputFiles!.find(file => file.path.endsWith('.js'))!.text, before.outputFiles!.find(file => file.path.endsWith('.js'))!.text);
  });
});

test('similarly named external styles and isolated Free builds retain their styles', async () => {
  await fixture(async dir => {
    await writeFile(join(dir, 'remixicon.css'), '.third-party-icon { color: purple }');
    const output = await build({ entryPoints: [join(dir, 'remixicon.css')], bundle: true, write: false, plugins: [reuseWordPressHostIconStyles(root)] });
    assert.match(output.outputFiles![0]!.text, /third-party-icon/);
  });
});

test('Free enqueues its baseline stylesheet independently of contributions', async () => {
  for (const source of ['wordpress/src/Assets/AssetRegistrar.php']) {
    const php = await readFile(join(root, source), 'utf8');
    assert.match(php, /wp_enqueue_style\(\s*self::APP_STYLE_HANDLE,\s*PIXFLOW_DESIGN_ASSETS_URL \. 'app\/pixflow-design-app\.css'/);
    const hostStyle = php.indexOf("PIXFLOW_DESIGN_ASSETS_URL . 'app/pixflow-design-app.css'");
    const proClients = php.indexOf('$this->extension_dependencies(', hostStyle);
    assert.ok(proClients > hostStyle, `${source} must enqueue the global baseline before Pro clients`);
  }
  const css = await readFile(join(root, 'apps/web/src/pixflow/wordpress-shared.css'), 'utf8');
  assert.match(css, /@import '\.\.\/styles\/remixicon\/remixicon\.css'/);
});

test('global entry ownership preserves all feature CSS, module identifiers and relative order', async () => {
  await fixture(async dir => {
    const fixtureRoot = join(dir, 'fixture');
    const shared = join(fixtureRoot, 'apps/web/src/pixflow');
    const home = join(fixtureRoot, 'apps/web/src/styles/home');
    await mkdir(shared, { recursive: true });
    await mkdir(home, { recursive: true });
    await writeFile(join(shared, 'wordpress-shared.css'), '.host-baseline { color: red }');
    await writeFile(join(home, 'wordpress-shared.css'), '.host-home { color: blue }');
    await writeFile(join(dir, 'entry.ts'), `import styles from './panel.module.css'; import ${JSON.stringify(join(shared, 'wordpress-shared.css'))}; import ${JSON.stringify(join(home, 'wordpress-shared.css'))}; import './feature.css'; console.log(styles.panel);`);
    await writeFile(join(dir, 'panel.module.css'), '.panel { color: purple } @media (min-width: 600px) { .panel { color: green } }');
    await writeFile(join(dir, 'feature.css'), '.pro-feature { color: orange }');
    const options = { entryPoints: [join(dir, 'entry.ts')], outdir: join(dir, 'out'), bundle: true, write: false };
    const before = await build(options);
    const after = await build({ ...options, plugins: [reuseWordPressHostStyles(fixtureRoot)] });
    const beforeCss = before.outputFiles!.find(file => file.path.endsWith('.css'))!.text;
    const afterCss = after.outputFiles!.find(file => file.path.endsWith('.css'))!.text;
    assert.match(beforeCss, /host-baseline/);
    assert.match(beforeCss, /host-home/);
    assert.doesNotMatch(afterCss, /host-baseline|host-home/);
    // Ignore generated source comments; all remaining CSS must be unchanged.
    const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ');
    const expected = beforeCss.replace(/\.host-baseline\s*\{[^}]*\}/, '').replace(/\.host-home\s*\{[^}]*\}/, '');
    assert.equal(withoutComments(afterCss), withoutComments(expected));
    assert.equal(after.outputFiles!.find(file => file.path.endsWith('.js'))!.text, before.outputFiles!.find(file => file.path.endsWith('.js'))!.text);
  });
});

test('matching filenames outside the host-owned entries remain emitted', async () => {
  await fixture(async dir => {
    await writeFile(join(dir, 'wordpress-shared.css'), '.third-party-baseline { color: purple }');
    const result = await build({ entryPoints: [join(dir, 'wordpress-shared.css')], bundle: true, write: false, plugins: [reuseWordPressHostStyles(root)] });
    assert.match(result.outputFiles![0]!.text, /third-party-baseline/);
  });
});
