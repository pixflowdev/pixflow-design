import { expect, it } from 'vitest';
import { directMcpConfiguration, configureDirectMcpProcess } from '../../src/pixflow/direct-site-mcp.js';
import type { McpServerConfig } from '../../src/mcp-config.js';

const servers: McpServerConfig[] = [
  {id:'local',enabled:true,transport:'stdio',command:'node',args:['C:/My server/tool.ts'],env:{TEST:'value'}},
  {id:'remote',enabled:true,transport:'http',url:'https://example.com/mcp',authMode:'oauth',headers:{Accept:'application/json'}},
  {id:'legacy',enabled:true,transport:'sse',url:'https://example.com/sse'},
  {id:'off',enabled:false,transport:'stdio',command:'must-not-run'},
];
it('maps local and HTTP servers for Codex, preserving argument boundaries and OAuth',()=>{
  const config=directMcpConfiguration('codex',servers,{remote:'test-token'});
  expect(config.codex.local).toEqual({command:'node',args:['C:/My server/tool.ts'],env:{TEST:'value'},enabled:true});
  expect(config.codex.remote).toEqual({url:'https://example.com/mcp',http_headers:{Accept:'application/json',Authorization:'Bearer test-token'},enabled:true});
  expect(config.codex.off).toBeUndefined();
  expect(config.codex.legacy).toBeUndefined();
  expect(config.warnings[0]).toContain('legacy SSE');
});
it('preserves explicitly supplied authorization over a stored token',()=>{
  const config=directMcpConfiguration('codex',[{...servers[1]!,headers:{authorization:'Bearer pinned'}}],{remote:'stored'});
  expect(config.codex.remote?.http_headers).toEqual({authorization:'Bearer pinned'});
});
it('merges OpenCode MCP config without replacing other native settings',async()=>{
  const env={OPENCODE_CONFIG_CONTENT:JSON.stringify({model:'existing',permission:'allow',mcp:{previous:{type:'remote',url:'https://previous.example/mcp'}}})};
  await configureDirectMcpProcess(directMcpConfiguration('opencode',servers),'opencode','unused',env,[]);
  const config=JSON.parse(env.OPENCODE_CONFIG_CONTENT);
  expect(config.model).toBe('existing');
  expect(config.permission).toBe('allow');
  expect(config.mcp.previous).toBeDefined();
  expect(config.mcp.local.command).toEqual(['node','C:/My server/tool.ts']);
  expect(config.mcp.legacy.type).toBe('remote');
  expect(config.mcp.off).toBeUndefined();
});
it('does not inject settings for unsupported providers and makes that explicit',()=>{
  const config=directMcpConfiguration('antigravity',servers);
  expect(config.codex).toEqual({});
  expect(config.claude).toBeNull();
  expect(config.opencode).toBeNull();
  expect(config.warnings[0]).toContain('not forwarded');
});
it('removes disabled servers from a fresh process configuration',()=>{
  expect(directMcpConfiguration('codex',servers.map(server=>({...server,enabled:false}))).codex).toEqual({});
  expect(directMcpConfiguration('claude',servers).claude?.mcpServers.legacy).toMatchObject({type:'sse'});
});
