import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { it, expect } from 'vitest';

const root = new URL('../../../', import.meta.url);
it('does not reuse core CSS module names in the separately built Etch stylesheet', async () => {
  const coreZip = await JSZip.loadAsync(await readFile(fileURLToPath(new URL('dist/pixflow-ai.zip', root))));
  const proZip = await JSZip.loadAsync(await readFile(fileURLToPath(new URL('dist/pixflow-design-pro.zip', root))));
  const core = await coreZip.file('pixflow-ai/assets/app/pixflow-design-app.css')!.async('string');
  const pro = await proZip.file('pixflow-design-pro/assets/app/pixflow-etch-editor.css')!.async('string');
  const classes = (css: string) => new Set(Array.from(css.matchAll(/\.([a-zA-Z_][\w-]*)(?=[\s.{:#>,)\[])/g), match => match[1]!));
  const coreClasses = classes(core);
  const collisions = [...classes(pro)].filter(name => coreClasses.has(name) && !name.startsWith('pixflow-'));
  expect(collisions).toEqual([]);
});

it('ships Etch implementation, native assets and skills exclusively in the Pro archive', async () => {
  const core = await JSZip.loadAsync(await readFile(fileURLToPath(new URL('dist/pixflow-ai.zip', root))));
  const pro = await JSZip.loadAsync(await readFile(fileURLToPath(new URL('dist/pixflow-design-pro.zip', root))));
  const paths = ['src/Etch/EtchModule.php', 'src/Etch/EtchTools.php', 'src/Etch/EtchDesignSystemAdapter.php',
    'src/Etch/EtchDesignSystemCompiler.php', 'src/Etch/EtchSaveGuard.php', 'src/Fonts/EtchFontManager.php',
    'src/Icons/EtchIconCollections.php', 'assets/app/pixflow-etch-editor.js', 'assets/app/pixflow-etch-extension.js',
    'assets/app/pixflow-etch-editor.css', 'assets/etch/editor.css', 'resources/mcp-skills/etch/live-editor.md', 'resources/mcp-skills/etch/design-systems.md'];
  for (const path of paths) {
    expect(core.file(`pixflow-ai/${path}`), path).toBeNull();
    expect(pro.file(`pixflow-design-pro/${path}`), path).not.toBeNull();
  }
  expect(core.file('pixflow-ai/src/Fonts/SavedFontAssets.php')).not.toBeNull();
  expect(core.file('pixflow-ai/assets/app/pixflow-gutenberg-editor.js')).not.toBeNull();
  expect(Object.keys(pro.files).some(path => /node_modules|\.tmp|tests\/|\.map$/.test(path))).toBe(false);
});
