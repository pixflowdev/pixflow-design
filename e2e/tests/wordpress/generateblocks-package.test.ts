import { freeWordPressPackage, testWordPressPackages } from '@/vitest/wordpress-packages';
import { expect } from 'vitest';
testWordPressPackages('ships GenerateBlocks implementations and guidance only in Pro while retaining core Gutenberg', async (pro) => {
  const core = await freeWordPressPackage();
  for (const path of ['src/Admin/Gutenberg/GenerateBlocksAssets.php','src/Admin/Gutenberg/GenerateBlocksGlobalStyles.php','src/Admin/Gutenberg/GenerateBlocksNavigation.php','src/Admin/Gutenberg/Adapters/GenerateBlocksAdapter.php','assets/app/pixflow-generateblocks-navigation.js']) {
    expect(core.file('pixflow-ai/'+path),path).toBeNull();
    if (pro) expect(pro.file('pixflow-design-pro/'+path),path).not.toBeNull();
  }
  expect(core.file('pixflow-ai/assets/app/pixflow-generateblocks-lifecycle.js')).toBeNull();
  expect(core.file('pixflow-ai/resources/mcp-skills/wp-admin/integrations/generateblocks.md')).toBeNull();
  if (pro) expect(pro.file('pixflow-design-pro/resources/mcp-skills/generateblocks/generateblocks.md')).not.toBeNull();
  if (pro) expect(pro.file('pixflow-design-pro/assets/app/pixflow-generateblocks-editor.js')).not.toBeNull();
  const editor=await core.file('pixflow-ai/assets/app/pixflow-gutenberg-editor.js')!.async('string');
  for(const implementation of ['generateblocks.editor.toolbarAppenders','GenerateBlocks style compilation timed out','generateblocks.editor.iconSVGSets','X-Pixflow-GB-Revision']) expect(editor).not.toContain(implementation);
  expect(editor).toContain('core/block-editor');
});
