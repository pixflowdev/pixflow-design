import type { McpServerConfig, RunContextSelection } from '@open-design/contracts';

export function availableMcpMentions(servers: McpServerConfig[], provider: string | null) {
  if (!provider || !['codex', 'opencode', 'claude'].includes(provider)) return [];
  return servers.filter(server => server.enabled && !(provider === 'codex' && server.transport === 'sse'));
}

/** A mention prioritises a source; it never grants access or limits other tools. */
export function directMcpMentionContext(meta?: { context?: RunContextSelection }) {
  const ids = [...new Set((meta?.context?.mcpServerIds ?? []).filter(id => typeof id === 'string' && id.trim()))];
  return ids.length ? {
    mcpServerIds: ids,
    mcpMentions: (meta?.context?.mcpMentions ?? []).filter(item => ids.includes(item.id)).map(({id,label}) => ({id,label})),
    externalToolGuidance: 'The user mentioned these external MCP servers. Prioritise their available tools when relevant. Other tools and skills remain available. If a mentioned server is unavailable, explain that; do not claim it was used.',
  } : {};
}

export function restoreMcpMentions(context: RunContextSelection | undefined, servers: McpServerConfig[]): McpServerConfig[] {
  return (context?.mcpServerIds ?? []).map(id => servers.find(server => server.id === id) ?? {
    id, label: context?.mcpMentions?.find(item => item.id === id)?.label || id,
    enabled: false, transport: 'http' as const,
  });
}
