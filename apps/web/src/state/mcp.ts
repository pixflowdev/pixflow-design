import { externalMcpContribution } from '../pixflow/external-mcp-contribution';
import type { ExternalMcpContribution as Mcp } from '../pixflow/external-mcp-contract';
export type { McpOAuthStatusResponse, McpServerConfig, McpTemplate, StartMcpOAuthResponse, StartMcpOAuthResult } from '../pixflow/external-mcp-contract';
export const fetchMcpServers: Mcp['fetchMcpServers'] = async () => externalMcpContribution()?.fetchMcpServers() ?? null;
export const saveMcpServers: Mcp['saveMcpServers'] = async (...args) => externalMcpContribution()?.saveMcpServers(...args) ?? null;
export const startMcpOAuth: Mcp['startMcpOAuth'] = async (...args) => externalMcpContribution()?.startMcpOAuth(...args) ?? {ok:false,status:403,message:'External MCP requires Pixflow Design Pro.'};
export const fetchMcpOAuthStatus: Mcp['fetchMcpOAuthStatus'] = async (...args) => externalMcpContribution()?.fetchMcpOAuthStatus(...args) ?? null;
export const disconnectMcpOAuth: Mcp['disconnectMcpOAuth'] = async (...args) => externalMcpContribution()?.disconnectMcpOAuth(...args) ?? false;
export const suggestMcpServerId: Mcp['suggestMcpServerId'] = (...args) => { const c=externalMcpContribution(); if(!c)throw new Error('External MCP requires Pixflow Design Pro.');return c.suggestMcpServerId(...args); };
