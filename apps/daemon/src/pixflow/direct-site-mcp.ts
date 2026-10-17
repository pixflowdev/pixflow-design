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

export async function configureDirectMcpProcess(config: ReturnType<typeof directMcpConfiguration>, agentId: string, workspace: string, env: NodeJS.ProcessEnv, args: string[]) {
  if (agentId === 'opencode' && config.opencode) {
    const inherited = env.OPENCODE_CONFIG_CONTENT ? JSON.parse(env.OPENCODE_CONFIG_CONTENT) : {};
    const external = JSON.parse(config.opencode);
    env.OPENCODE_CONFIG_CONTENT = JSON.stringify({ ...inherited, mcp: { ...inherited.mcp, ...external.mcp } });
  }
  if (agentId === 'claude' && config.claude) {
    const file = path.join(workspace, 'external-mcp.json');
    await fs.writeFile(file, JSON.stringify(config.claude), { mode: 0o600 });
    args.push('--mcp-config', file);
  }
}
