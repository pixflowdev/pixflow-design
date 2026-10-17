import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { it, expect } from 'vitest';

const root = new URL('../../../', import.meta.url);
it('does not reuse core CSS module names in the separately built Elementor stylesheet', async () => {
  const coreZip = await JSZip.loadAsync(await readFile(fileURLToPath(new URL('dist/pixflow-ai.zip', root))));
  const proZip = await JSZip.loadAsync(await readFile(fileURLToPath(new URL('dist/pixflow-design-pro.zip', root))));
  const core = await coreZip.file('pixflow-ai/assets/app/pixflow-design-app.css')!.async('string');
  const pro = await proZip.file('pixflow-design-pro/assets/elementor/editor.css')!.async('string');
  const classes = (css: string) => new Set(Array.from(css.matchAll(/\.([a-zA-Z_][\w-]*)(?=[\s.{:#>,)\[])/g), match => match[1]!));
  const coreClasses = classes(core);
  const collisions = [...classes(pro)].filter(name => coreClasses.has(name) && !name.startsWith('pixflow-'));
  expect(collisions).toEqual([]);
});

it('ships Elementor implementation, native assets and skills exclusively in the Pro archive', async () => {
  const core = await JSZip.loadAsync(await readFile(fileURLToPath(new URL('dist/pixflow-ai.zip', root))));
  const pro = await JSZip.loadAsync(await readFile(fileURLToPath(new URL('dist/pixflow-design-pro.zip', root))));
  const paths = ['src/Elementor/ElementorModule.php', 'src/Elementor/ElementorTools.php', 'src/Elementor/ElementorDesignSystemAdapter.php',
    'src/Elementor/ElementorDesignSystemCompiler.php', 'src/Elementor/ElementorSaveGuard.php', 'src/Fonts/ElementorFontManager.php',
    'src/Icons/ElementorIconLibrary.php', 'assets/app/pixflow-elementor-editor.js', 'assets/app/pixflow-elementor-extension.js',
    'assets/elementor/editor.css', 'src/Elementor/ElementorSettingDiagnostics.php', 'src/Elementor/ElementorDesignSystemRoutes.php', 'resources/mcp-skills/elementor/live-editor.md', 'resources/mcp-skills/elementor/create-widgets/SKILL.md'];
  for (const path of paths) {
    expect(core.file(`pixflow-ai/${path}`), path).toBeNull();
    expect(pro.file(`pixflow-design-pro/${path}`), path).not.toBeNull();
  }
  expect(core.file('pixflow-ai/src/Fonts/SavedFontAssets.php')).not.toBeNull();
  expect(core.file('pixflow-ai/src/Assets/SavedBuilderStyles.php')).not.toBeNull();
  expect(core.file('pixflow-ai/assets/app/pixflow-gutenberg-editor.js')).not.toBeNull();
  expect(Object.keys(pro.files).some(path => /node_modules|\.tmp|tests\/|\.map$/.test(path))).toBe(false);
});
