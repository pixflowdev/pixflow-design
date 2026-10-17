import { freeWordPressPackage, testWordPressPackages } from '@/vitest/wordpress-packages';
import { expect } from 'vitest';
testWordPressPackages('packages external MCP management and catalogue only in Pro, retaining shared message metadata in Free', async (pro) => {
 const free=await freeWordPressPackage();
 for(const path of ['src/ExternalMcp/ExternalMcpModule.php','assets/app/pixflow-external-mcp.js','assets/app/pixflow-external-mcp.css']){
  expect(free.file('pixflow-ai/'+path)).toBeNull();if (pro) expect(pro.file('pixflow-design-pro/'+path)).not.toBeNull();
 }
 const core=await free.file('pixflow-ai/assets/app/pixflow-design-app.js')!.async('string');
 const premium=pro ? await pro.file('pixflow-design-pro/assets/app/pixflow-external-mcp.js')!.async('string') : '';
 for(const marker of ['/api/mcp/oauth/start','https://developers.openai.com/mcp']){
  expect(core).not.toContain(marker);if (pro) expect(premium).toContain(marker);
 }
 const coreCss=await free.file('pixflow-ai/assets/app/pixflow-design-app.css')!.async('string');
 expect(coreCss).not.toContain('.mcp-oauth-control');
 expect(core).toContain('mcpServerIds');
});
