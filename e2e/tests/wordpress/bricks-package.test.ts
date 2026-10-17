import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { expect, it } from 'vitest';

it('ships the complete Bricks implementation and references only in Pro', async () => {
  const root = new URL('../../../', import.meta.url);
  const core = await JSZip.loadAsync(await readFile(new URL('dist/pixflow-ai.zip', root)));
  const pro = await JSZip.loadAsync(await readFile(new URL('dist/pixflow-design-pro.zip', root)));
  const owned = ['src/Bricks/BricksModule.php', 'src/Bricks/ContentMutationService.php',
    'src/Bricks/Extensions/ExtensionRegistry.php', 'src/Mcp/ToolRegistry.php', 'src/Framework/DesignSystem/DesignSystemCompiler.php', 'vendor/lbuchs/webauthn/src/WebAuthn.php', 'src/Http/BricksRestController.php',
    'src/Templates/TemplateLibraryService.php', 'src/Fonts/BricksFontManager.php',
    'assets/pixflow-design-builder.js', 'assets/builder/bricks-context.js',
    'assets/app/pixflow-bricks-live-context.js', 'assets/app/pixflow-bricks-agent.js',
    'resources/mcp-skills/bricks/operations/live-builder.md'];
  for (const path of owned) {
    expect(core.file(`pixflow-ai/${path}`), path).toBeNull();
    expect(pro.file(`pixflow-design-pro/${path}`), path).not.toBeNull();
  }
  expect(Object.keys(core.files).filter(path => /\/src\/Bricks\/|\/resources\/mcp-skills\/bricks\//.test(path))).toEqual([]);
  expect(core.file('pixflow-ai/assets/app/pixflow-gutenberg-editor.js')).not.toBeNull();
  expect(core.file('pixflow-ai/assets/app/pixflow-editor-save-guard.js')).not.toBeNull();
  const bundle = await pro.file('pixflow-design-pro/assets/app/pixflow-bricks-agent.js')!.async('string');
  expect(bundle).not.toContain('process.env.');
  expect(bundle).toContain('PixflowProBricks');
});
