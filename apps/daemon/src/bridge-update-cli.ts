import { parseArgs } from 'node:util';
import type { PixflowBridgeUpdateStatus } from '@open-design/contracts';

export async function runBridgeUpdateCli(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    json: { type: 'boolean' }, help: { type: 'boolean' }, 'bridge-url': { type: 'string' },
  } });
  if (values.help) {
    process.stdout.write('od bridge-update status|install [--bridge-url URL] [--json]\n');
    return;
  }
  const action = positionals[0] ?? 'status';
  if (!['status', 'install'].includes(action) || positionals.length > 1) throw new Error('Choose status or install.');
  const url = new URL(values['bridge-url'] ?? 'http://127.0.0.1:7456');
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) throw new Error('Use a local Bridge URL.');
  const response = await fetch(new URL('/api/pixflow/bridge-update', url), {
    method: action === 'status' ? 'GET' : 'POST', headers: { 'X-Pixflow-Local-Update': '1' },
    redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Bridge update request failed (${response.status}).`);
  const result = await response.json() as PixflowBridgeUpdateStatus;
  process.stdout.write(values.json ? JSON.stringify(result) + '\n' : `Bridge update: ${result.state}\n`);
  if (result.state === 'failed' || result.state === 'busy') process.exitCode = 1;
}
