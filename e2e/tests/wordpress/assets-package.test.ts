import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { expect, it } from 'vitest';

it('ships font/icon authoring only in Pro and retains installed-asset rendering/removal in Free', async () => {
  const root = new URL('../../../', import.meta.url);
  const free = await JSZip.loadAsync(await readFile(new URL('dist/pixflow-ai.zip', root)));
  const pro = await JSZip.loadAsync(await readFile(new URL('dist/pixflow-design-pro.zip', root)));
  for (const path of ['src/Fonts/GoogleFontManager.php', 'src/Fonts/WordPressFontInstaller.php', 'src/Fonts/SharedFontRegistrations.php', 'src/Icons/IconSetManager.php', 'src/AssetManagement/AssetRoutes.php', 'src/AssetManagement/AssetTools.php', 'assets/app/pixflow-assets.js', 'assets/app/pixflow-assets.css']) {
    expect(free.file('pixflow-ai/' + path), path).toBeNull();
    expect(pro.file('pixflow-design-pro/' + path), path).not.toBeNull();
  }
  for (const path of ['src/Fonts/WordPressFontManager.php', 'src/Fonts/SavedFontAssets.php', 'src/Icons/WordPressIconLibrary.php', 'src/Icons/IconMediaCleanup.php', 'src/Assets/InstalledAssets.php']) expect(free.file('pixflow-ai/' + path), path).not.toBeNull();
  const coreJs = await free.file('pixflow-ai/assets/app/pixflow-design-app.js')!.async('string');
  const proJs = await pro.file('pixflow-design-pro/assets/app/pixflow-assets.js')!.async('string');
  for (const marker of ['fonts/google/install', 'icons/packs/save-subset', 'icons/packs/install']) {
    expect(coreJs).not.toContain(marker);
    expect(proJs).toContain(marker);
  }
  expect(coreJs).toContain('assets/installed/remove');
});
