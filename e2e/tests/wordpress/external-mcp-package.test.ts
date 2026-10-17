import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { expect, it } from 'vitest';
it('packages external MCP management and catalogue only in Pro, retaining shared message metadata in Free',async()=>{
 const root=new URL('../../../',import.meta.url);
 const free=await JSZip.loadAsync(await readFile(new URL('dist/pixflow-ai.zip',root)));
 const pro=await JSZip.loadAsync(await readFile(new URL('dist/pixflow-design-pro.zip',root)));
 for(const path of ['src/ExternalMcp/ExternalMcpModule.php','assets/app/pixflow-external-mcp.js','assets/app/pixflow-external-mcp.css']){
  expect(free.file('pixflow-ai/'+path)).toBeNull();expect(pro.file('pixflow-design-pro/'+path)).not.toBeNull();
 }
 const core=await free.file('pixflow-ai/assets/app/pixflow-design-app.js')!.async('string');
 const premium=await pro.file('pixflow-design-pro/assets/app/pixflow-external-mcp.js')!.async('string');
 for(const marker of ['/api/mcp/oauth/start','https://developers.openai.com/mcp']){
  expect(core).not.toContain(marker);expect(premium).toContain(marker);
 }
 const coreCss=await free.file('pixflow-ai/assets/app/pixflow-design-app.css')!.async('string');
 expect(coreCss).not.toContain('.mcp-oauth-control');
 expect(core).toContain('mcpServerIds');
});
