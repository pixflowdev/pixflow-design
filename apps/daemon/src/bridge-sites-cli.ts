import { parseArgs } from 'node:util';
import type { PixflowBridgeSitesResponse, PixflowBridgeSiteActionResponse } from '@open-design/contracts';

/** Same site lifecycle API as the floating-panel connection popout. */
export async function runBridgeSitesCli(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    json: { type: 'boolean' }, help: { type: 'boolean' },
    'daemon-url': { type: 'string' }, site: { type: 'string' },
  } });
  if (values.help) { process.stdout.write('od bridge-sites list|sleep|wake [--site KEY] [--daemon-url URL] [--json]\n'); return; }
  const operation = positionals[0] ?? 'list';
  if (!['list', 'sleep', 'wake'].includes(operation) || positionals.length > 1) throw new Error('Choose list, sleep or wake.');
  const base = new URL(values['daemon-url'] ?? 'http://127.0.0.1:7456');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.username || base.password) throw new Error('Use a local Bridge URL.');
  const key = values.site;
  if (operation !== 'list' && (!key || !/^[a-zA-Z0-9._-]{8,128}$/.test(key))) throw new Error('Provide --site KEY from bridge-sites list.');
  const response = await fetch(new URL(`/api/pixflow/sites${operation === 'list' ? '' : `/${key}/${operation}`}`, base), {
    method: operation === 'list' ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`Bridge request failed (${response.status}).`);
  const result = await response.json() as PixflowBridgeSitesResponse | PixflowBridgeSiteActionResponse;
  process.stdout.write(`${JSON.stringify(result, null, values.json ? undefined : 2)}\n`);
  if ('ok' in result && !result.ok) process.exitCode = 1;
}
