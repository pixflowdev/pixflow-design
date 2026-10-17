import { expect, it } from 'vitest';
import { availableMcpMentions, directMcpMentionContext, restoreMcpMentions } from '../src/pixflow/mcp-mentions';
import type { McpServerConfig } from '@open-design/contracts';
const servers: McpServerConfig[] = [
  {id:'docs',label:'OpenAI Docs',transport:'http',enabled:true,url:'https://developers.openai.com/mcp',headers:{Authorization:'private'}},
  {id:'off',transport:'stdio',enabled:false,command:'node'},
  {id:'legacy',transport:'sse',enabled:true,url:'https://example.com/sse'},
];
it('offers only enabled, supported transports for the selected native provider',()=>{
  expect(availableMcpMentions(servers,'codex').map(s=>s.id)).toEqual(['docs']);
  expect(availableMcpMentions(servers,'opencode').map(s=>s.id)).toEqual(['docs','legacy']);
  expect(availableMcpMentions(servers,'claude')).toHaveLength(2);
  expect(availableMcpMentions(servers,null)).toEqual([]);
  expect(availableMcpMentions(servers,'antigravity')).toEqual([]);
});
it('restores an offline queued mention by name without restoring credentials or enabling it',()=>{
  const context={mcpServerIds:['docs'],mcpMentions:[{id:'docs',label:'OpenAI Docs'}]};
  expect(restoreMcpMentions(context,[])).toEqual([{id:'docs',label:'OpenAI Docs',transport:'http',enabled:false}]);
  expect(directMcpMentionContext({context})).toMatchObject({...context,externalToolGuidance:expect.stringContaining('Other tools and skills remain available')});
  expect(JSON.stringify(directMcpMentionContext({context}))).not.toContain('Authorization');
});
