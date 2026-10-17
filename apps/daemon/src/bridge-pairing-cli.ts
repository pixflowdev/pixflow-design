import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolveDaemonUrl } from './daemon-url.js';
import { pixflowPairingErrorMessage } from '@open-design/contracts';

/** Pair through the same local HTTP endpoints used by License settings. */
export async function runBridgePairingCli(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    json: { type: 'boolean' }, help: { type: 'boolean' },
    'daemon-url': { type: 'string' }, 'site-url': { type: 'string' },
    'prompt-file': { type: 'string' },
  } });
  if (values.help) {
    process.stdout.write('od bridge-pair start [--site-url URL] [--daemon-url URL] [--json]\nod bridge-pair complete --prompt-file <path|-> [--daemon-url URL] [--json]\nAuthorize the start challenge in WordPress License settings; complete accepts JSON {requestId,code}.\n');
    return;
  }
  const operation = positionals[0];
  if (positionals.length !== 1 || !['start', 'complete'].includes(operation ?? '')) throw new Error('Choose bridge-pair start or complete.');
  let body: unknown = values['site-url'] ? { siteUrl: values['site-url'] } : {};
  const file = values['prompt-file'];
  if (file) {
    let input = '';
    if (file === '-') for await (const chunk of process.stdin) input += String(chunk);
    else input = await readFile(file, 'utf8');
    body = JSON.parse(input);
  } else if (operation === 'complete') throw new Error('Provide --prompt-file containing requestId and the one-time authorization code.');
  const url = new URL(await resolveDaemonUrl({ flagUrl: values['daemon-url'] ?? null }));
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) throw new Error('Pairing requires a local bridge URL.');
  const response = await fetch(new URL(`/api/pixflow/pairing/${operation}`, url), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    redirect: 'error', signal: AbortSignal.timeout(45000),
  });
  const result: unknown = await response.json().catch(() => null);
  const stage = operation === 'start' ? 'bridge_start' : 'wordpress_exchange';
  if (!response.ok) throw new Error(pixflowPairingErrorMessage(result, stage, response.status));
  if (!result || typeof result !== 'object') throw new Error(pixflowPairingErrorMessage({code:'pairing_invalid_response'}, stage, response.status));
  process.stdout.write(`${JSON.stringify(result, null, values.json ? undefined : 2)}\n`);
}
