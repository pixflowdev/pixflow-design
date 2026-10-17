import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { expect, it } from 'vitest';

it('keeps saved rendering in Free and ships design-system and sitemap authoring only in Pro', async () => {
  const root = new URL('../../../', import.meta.url);
  const free = await JSZip.loadAsync(await readFile(new URL('dist/pixflow-ai.zip', root)));
  const pro = await JSZip.loadAsync(await readFile(new URL('dist/pixflow-design-pro.zip', root)));
  for (const path of [
    'assets/app/pixflow-planning.js', 'assets/app/pixflow-planning.css',
    'src/Planning/PlanningModule.php', 'src/Sitemap/SitemapStateRepository.php',
    'src/Http/Routes/SitemapRoutes.php', 'src/Framework/DesignSystem/DesignSystemLibrary.php',
    'src/Admin/Gutenberg/GutenbergDesignSystemAdapter.php',
    'resources/mcp-skills/pixflow/sitemap/manifest.php', 'resources/mcp-skills/pixflow/design-systems/SKILL.md',
  ]) {
    expect(free.file('pixflow-ai/' + path), path).toBeNull();
    expect(pro.file('pixflow-design-pro/' + path), path).not.toBeNull();
  }
  for (const path of ['src/Admin/Gutenberg/SavedGutenbergDesignSystem.php', 'src/Framework/DesignSystem/SavedDesignSystems.php']) {
    expect(free.file('pixflow-ai/' + path), path).not.toBeNull();
  }
  const coreJs = await free.file('pixflow-ai/assets/app/pixflow-design-app.js')!.async('string');
  const proJs = await pro.file('pixflow-design-pro/assets/app/pixflow-planning.js')!.async('string');
  for (const marker of ['sitemap/queue/enqueue', 'sitemap/pages/sync', 'od/design-systems/gutenberg']) {
    expect(coreJs).not.toContain(marker);
    expect(proJs).toContain(marker);
  }
});
