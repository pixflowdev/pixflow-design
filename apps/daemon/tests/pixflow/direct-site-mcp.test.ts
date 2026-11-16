import { expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { directMcpConfiguration, configureDirectMcpProcess, withPixflowTools } from '../../src/pixflow/direct-site-mcp.js';
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

const builtIn = { command: 'C:/Program Files/nodejs/node.exe', args: ['D:/Run folder/pixflow-tools.mjs'] };

it('allows only the run-bound Pixflow tool surface in non-interactive Codex sessions', () => {
  const external = directMcpConfiguration('codex', servers);
  const config = withPixflowTools(external, builtIn);
  expect(config.codex.pixflow_builtin?.tools).toEqual(Object.fromEntries([
    'pixflow_tools', 'pixflow_call', 'pixflow_result_read', 'pixflow_builder_destinations',
    'pixflow_builder_handoff', 'pixflow_builder_handoff_status', 'pixflow_plan_read', 'pixflow_plan_update',
  ].map(name => [name, { approval_mode: 'approve' }])));
  expect(config.codex.local).toEqual(external.codex.local);
  expect(config.codex.remote).toEqual(external.codex.remote);
  expect(config.claude?.mcpServers.pixflow_builtin).toEqual(builtIn);
});

it('stages Antigravity MCP in the caller workspace and preserves existing configuration', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'pixflow-agy-mcp-'));
  try {
    const config = withPixflowTools(directMcpConfiguration('antigravity', []), builtIn);
    const file = path.join(project, '.agents', 'mcp_config.json');
    const cleanup = await configureDirectMcpProcess(config, 'antigravity', project, {}, []);
    expect(JSON.parse(await readFile(file, 'utf8')).mcpServers.pixflow_builtin).toMatchObject({
      ...builtIn, cwd: project, tools: { pixflow_call: { eager: true } },
    });
    await cleanup?.();
    await expect(readFile(file, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '{"mcpServers":{"existing":{}}}');
    expect(await configureDirectMcpProcess(config, 'antigravity', project, {}, [])).toBeUndefined();
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ mcpServers: { existing: {} } });
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

it.each([
  ['cursor-agent', '.cursor/mcp.json'],
  ['qwen', '.qwen/settings.json'],
  ['qoder', 'pixflow-mcp-config.json'],
  ['copilot', 'pixflow-mcp-config.json'],
])('installs and removes the run-local Pixflow configuration for %s', async (agent, relative) => {
  const project = await mkdtemp(path.join(tmpdir(), 'pixflow-provider-mcp-'));
  try {
    const config = withPixflowTools(directMcpConfiguration(agent, []), builtIn);
    const args: string[] = [];
    const cleanup = await configureDirectMcpProcess(config, agent, project, {}, args);
    const file = path.join(project, relative);
    expect(JSON.parse(await readFile(file, 'utf8')).mcpServers.pixflow_builtin).toMatchObject(builtIn);
    expect(args).toEqual(agent === 'copilot' ? [`--additional-mcp-config=@${file}`] : agent === 'qoder' ? ['--mcp-config', file] : []);
    await cleanup?.();
    await expect(readFile(file, 'utf8')).rejects.toMatchObject({code: 'ENOENT'});
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

it('adds the Pixflow server through the isolated MiMo config variable', async () => {
  const config = withPixflowTools(directMcpConfiguration('mimo', []), builtIn);
  const env = { MIMOCODE_CONFIG_CONTENT: JSON.stringify({ model: 'existing' }) };
  await configureDirectMcpProcess(config, 'mimo', 'unused', env, []);
  expect(JSON.parse(env.MIMOCODE_CONFIG_CONTENT)).toMatchObject({
    model: 'existing',
    mcp: { pixflow_builtin: { enabled: true, type: 'local', command: [builtIn.command, ...builtIn.args] } },
  });
});
