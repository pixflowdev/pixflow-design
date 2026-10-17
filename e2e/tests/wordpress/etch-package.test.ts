import { freeWordPressPackage, proPackagePath, proWordPressPackage, testWordPressPackages } from '@/vitest/wordpress-packages';
import { it, expect } from 'vitest';
it.skipIf(!proPackagePath)('does not reuse core CSS module names in the separately built Etch stylesheet', async () => {
  const coreZip = await freeWordPressPackage();
  const proZip = await proWordPressPackage();
  const core = await coreZip.file('pixflow-ai/assets/app/pixflow-design-app.css')!.async('string');
  const pro = await proZip.file('pixflow-design-pro/assets/app/pixflow-etch-editor.css')!.async('string');
  const classes = (css: string) => new Set(Array.from(css.matchAll(/\.([a-zA-Z_][\w-]*)(?=[\s.{:#>,)\[])/g), match => match[1]!));
  const coreClasses = classes(core);
  const collisions = [...classes(pro)].filter(name => coreClasses.has(name) && !name.startsWith('pixflow-'));
  expect(collisions).toEqual([]);
});

testWordPressPackages('ships Etch implementation, native assets and skills exclusively in the Pro archive', async (pro) => {
  const core = await freeWordPressPackage();
  const paths = ['src/Etch/EtchModule.php', 'src/Etch/EtchTools.php', 'src/Etch/EtchDesignSystemAdapter.php',
    'src/Etch/EtchDesignSystemCompiler.php', 'src/Etch/EtchSaveGuard.php', 'src/Fonts/EtchFontManager.php',
    'src/Icons/EtchIconCollections.php', 'assets/app/pixflow-etch-editor.js', 'assets/app/pixflow-etch-extension.js',
    'assets/app/pixflow-etch-editor.css', 'assets/etch/editor.css', 'resources/mcp-skills/etch/live-editor.md', 'resources/mcp-skills/etch/design-systems.md'];
  for (const path of paths) {
    expect(core.file(`pixflow-ai/${path}`), path).toBeNull();
    if (pro) expect(pro.file(`pixflow-design-pro/${path}`), path).not.toBeNull();
  }
  expect(core.file('pixflow-ai/src/Fonts/SavedFontAssets.php')).not.toBeNull();
  expect(core.file('pixflow-ai/assets/app/pixflow-gutenberg-editor.js')).not.toBeNull();
  if (pro) expect(Object.keys(pro.files).some(path => /node_modules|\.tmp|tests\/|\.map$/.test(path))).toBe(false);
});
