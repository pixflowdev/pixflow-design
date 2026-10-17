// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { McpClientSection, externalMcpAvailable } from '../../src/pixflow/external-mcp-contribution';
import { fetchMcpServers } from '../../src/state/mcp';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('Free exposes neither external MCP management nor discovery and makes no Bridge request',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 expect(externalMcpAvailable()).toBe(false);
 const {container}=render(<McpClientSection/>);expect(container.innerHTML).toBe('');
 expect(await fetchMcpServers()).toBeNull();expect(fetch).not.toHaveBeenCalled();
});
