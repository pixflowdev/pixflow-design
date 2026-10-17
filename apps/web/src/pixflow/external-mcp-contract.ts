import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import type {
  McpOAuthStatusResponse, McpServerConfig, McpServersResponse,
  StartMcpOAuthResponse,
} from '@open-design/contracts';

export type { McpOAuthStatusResponse, McpServerConfig, McpTemplate, StartMcpOAuthResponse } from '@open-design/contracts';

export type StartMcpOAuthResult =
  | { ok: true; response: StartMcpOAuthResponse }
  | { ok: false; status: number | null; message: string };

export interface McpClientSectionProps {
  onServersChanged?: (servers: McpServerConfig[]) => void;
  onDirtyChange?: (dirty: boolean) => void;
  surface?: 'integrations' | 'settings';
}

export interface McpClientSectionHandle {
  save: () => Promise<boolean>;
  hasDirty: () => boolean;
}

/** The optional implementation supplies transport; Free owns the public API. */
export interface ExternalMcpContribution {
  McpClientSection: ForwardRefExoticComponent<McpClientSectionProps & RefAttributes<McpClientSectionHandle>>;
  fetchMcpServers: () => Promise<McpServersResponse | null>;
  saveMcpServers: (servers: McpServerConfig[]) => Promise<McpServersResponse | null>;
  startMcpOAuth: (serverId: string) => Promise<StartMcpOAuthResult>;
  fetchMcpOAuthStatus: (serverId: string) => Promise<McpOAuthStatusResponse | null>;
  disconnectMcpOAuth: (serverId: string) => Promise<boolean>;
  suggestMcpServerId: (label: string, taken: ReadonlySet<string>) => string;
}
