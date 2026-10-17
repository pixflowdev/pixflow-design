import { afterEach, expect, it, vi } from 'vitest';
import { runConnectorsToolCli } from '../src/tools-connectors-cli.js';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('uses the settings endpoint for global and individual writes without an agent credential', async () => {
  vi.stubEnv('OD_TOOL_TOKEN', ''); vi.stubEnv('OD_DAEMON_URL', 'http://127.0.0.1:17457');
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const fetch = vi.fn(async () => new Response(JSON.stringify({ allowWrites: false, connectorWrites: { github: true } })));
  vi.stubGlobal('fetch', fetch);
  expect(await runConnectorsToolCli(['write-policy', '--connector', 'github', '--allow-writes', 'true', '--json'])).toEqual({ exitCode: 0 });
  expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:17457/api/connectors/composio/write-policy', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ allowWrites: true, connectorId: 'github' }) }));
  expect(await runConnectorsToolCli(['write-policy', '--allow-writes', 'false', '--json'])).toEqual({ exitCode: 0 });
  expect(fetch).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ body: JSON.stringify({ allowWrites: false }) }));
});
it('refuses agent-run changes before making a request', async () => {
  vi.stubEnv('OD_TOOL_TOKEN', 'run-token'); vi.stubEnv('OD_DAEMON_URL', 'http://127.0.0.1:17457');
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect(await runConnectorsToolCli(['write-policy', '--allow-writes', 'true'])).toEqual({ exitCode: 1 });
  expect(fetch).not.toHaveBeenCalled();
});
