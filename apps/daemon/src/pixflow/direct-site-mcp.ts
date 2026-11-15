import { PIXFLOW_MCP_NAME, type PixflowMcpCommand } from './structured-tools.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildClaudeMcpJson, buildOpenCodeMcpConfigContent, readMcpConfig, type McpServerConfig } from '../mcp-config.js';
import { isTokenExpired, readAllTokens } from '../mcp-tokens.js';

export type CodexMcpServers = Record<string, Record<string, unknown>>;

/** Each new native process gets the current Bridge configuration, never a global CLI file. */
export function directMcpConfiguration(agentId: string, servers: McpServerConfig[], tokens: Record<string, string> = {}) {
  const enabled = servers.filter(server => server.enabled);
  const supported = ['codex', 'opencode', 'claude'].includes(agentId);
  const warnings: string[] = [];
  if (!supported && enabled.length) warnings.push('External MCP settings are available with Codex, OpenCode and Claude through Bridge. They are not forwarded to this provider.');
  const usable = supported ? enabled.filter(server => {
    if (agentId === 'codex' && server.transport === 'sse') {
      warnings.push(`External MCP “${server.label || server.id}” uses legacy SSE. Codex requires streamable HTTP or a local command.`);
      return false;
    }
    return true;
  }) : [];
  const claude = buildClaudeMcpJson(usable, tokens) as {mcpServers: Record<string, Record<string, unknown>>} | null;
  const codex: CodexMcpServers = {};
  for (const [id, entry] of Object.entries(claude?.mcpServers ?? {})) {
    const { type: _type, headers, ...rest } = entry;
    codex[id] = { ...rest, ...(headers ? { http_headers: headers } : {}), enabled: true };
  }
  return { codex, claude, opencode: buildOpenCodeMcpConfigContent(usable, tokens), warnings };
}

export async function readDirectMcpConfiguration(dataDir: string, agentId: string, available = false) {
  if (!available) return directMcpConfiguration(agentId, []);
  const config = await readMcpConfig(dataDir);
  const stored = await readAllTokens(dataDir);
  const tokens: Record<string, string> = {};
  for (const [id, token] of Object.entries(stored)) if (!isTokenExpired(token)) tokens[id] = token.accessToken;
  const result = directMcpConfiguration(agentId, config.servers, tokens);
  for (const server of config.servers) {
    if (server.enabled && server.authMode === 'oauth' && stored[server.id] && isTokenExpired(stored[server.id]!)) {
      result.warnings.push(`External MCP “${server.label || server.id}” needs reconnection in Settings → External MCP because its authorization expired.`);
    }
  }
  return result;
}

export async function configureDirectMcpProcess(config: ReturnType<typeof directMcpConfiguration>, agentId: string, workspace: string, env: NodeJS.ProcessEnv, args: string[], project = workspace) {
  if ((agentId === 'opencode' || agentId === 'mimo') && config.opencode) {
    const key = agentId === 'mimo' ? 'MIMOCODE_CONFIG_CONTENT' : 'OPENCODE_CONFIG_CONTENT';
    const inherited = env[key] ? JSON.parse(env[key]) : {};
    const external = JSON.parse(config.opencode);
    env[key] = JSON.stringify({ ...inherited, mcp: { ...inherited.mcp, ...external.mcp } });
  }
  if (agentId === 'claude' && config.claude) {
    const file = path.join(workspace, 'external-mcp.json');
    await fs.writeFile(file, JSON.stringify(config.claude), { mode: 0o600 });
    args.push('--mcp-config', file);
  }

  const server = config.claude?.mcpServers[PIXFLOW_MCP_NAME];
  if (!server) return;
  if (agentId === 'antigravity') {
    const toolNames = ['pixflow_tools', 'pixflow_call', 'pixflow_builder_destinations', 'pixflow_builder_handoff', 'pixflow_builder_handoff_status'];
    const tools = Object.fromEntries(toolNames.map(name => [name, { eager: true }]));
    return stageProjectMcpConfig(project, '.agents/mcp_config.json', JSON.stringify({
      mcpServers: { [PIXFLOW_MCP_NAME]: { ...server, cwd: project, tools } },
    }));
  }
  if (agentId === 'cursor-agent') {
    return stageProjectMcpConfig(project, '.cursor/mcp.json', JSON.stringify({ mcpServers: { [PIXFLOW_MCP_NAME]: server } }));
  }
  if (agentId === 'qwen') {
    return stageProjectMcpConfig(project, '.qwen/settings.json', JSON.stringify({ mcpServers: { [PIXFLOW_MCP_NAME]: server } }));
  }
  if (agentId === 'qoder' || agentId === 'copilot') {
    const file = path.join(workspace, 'pixflow-mcp-config.json');
    const entry = agentId === 'copilot' ? { ...server, type: 'local', tools: ['*'] } : server;
    await fs.writeFile(file, JSON.stringify({ mcpServers: { [PIXFLOW_MCP_NAME]: entry } }), { mode: 0o600 });
    if (agentId === 'copilot') args.push(`--additional-mcp-config=@${file}`);
    else args.push('--mcp-config', file);
    return () => fs.rm(file, { force: true });
  }
}

/** Restrict the configuration to this invocation and preserve an existing project file. */
async function stageProjectMcpConfig(project: string, relativePath: string, content: string) {
  const root = await fs.realpath(project);
  const file = path.join(root, relativePath);
  const directory = path.dirname(file);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if (await fs.realpath(directory) !== directory) return;
  try {
    await fs.writeFile(file, content, { mode: 0o600, flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return;
    throw error;
  }
  return async () => {
    if (await fs.realpath(directory).catch(() => null) === directory &&
        await fs.readFile(file, 'utf8').catch(() => null) === content) await fs.rm(file, { force: true });
  };
}

/** Built-in site tools are run-bound and independent of external-MCP entitlement. */
export function withPixflowTools(config: ReturnType<typeof directMcpConfiguration>, server: PixflowMcpCommand): ReturnType<typeof directMcpConfiguration> {
  const open = config.opencode ? JSON.parse(config.opencode) : {};
  if (config.codex[PIXFLOW_MCP_NAME] || config.claude?.mcpServers[PIXFLOW_MCP_NAME] || open.mcp?.[PIXFLOW_MCP_NAME]) {
    throw new Error('The external MCP name pixflow_builtin is reserved for connected site tools. Rename that external server before continuing.');
  }
  return {...config,
    codex: {...config.codex, [PIXFLOW_MCP_NAME]: {...server, enabled:true}},
    claude: {mcpServers:{...config.claude?.mcpServers, [PIXFLOW_MCP_NAME]: server}},
    opencode: JSON.stringify({...open,mcp:{...open.mcp,[PIXFLOW_MCP_NAME]:{type:'local',command:[server.command,...server.args],enabled:true}}}),
  };
}
