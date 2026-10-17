import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

export const BRICKS_SYSTEMS_USAGE = `od design-systems bricks <list|show|save|apply> --site-url <WordPress URL>
  --headers-file <private JSON file> [--id <system-id>] [--prompt-file <path|->]
  [--revision <number>] [--theme-styles] [--json]

Uses the same WordPress endpoints as the design-system editor. The private headers
file supplies existing WordPress REST authentication (for example Authorization,
or Cookie plus X-WP-Nonce). Save reads a JSON title/profile/revision document.
AI callers can create that document as part of their normal design workflow.`;

export async function runBricksDesignSystemsCli(args: string[]) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    'site-url': { type: 'string' }, 'headers-file': { type: 'string' }, id: { type: 'string' },
    'prompt-file': { type: 'string' }, revision: { type: 'string' }, 'theme-styles': { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (values.help || !positionals.length) { console.log(BRICKS_SYSTEMS_USAGE); return; }
  if (!values['site-url'] || !values['headers-file']) throw new Error('Provide --site-url and --headers-file.');
  const site = new URL(values['site-url']);
  if (site.protocol !== 'https:' && !(site.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(site.hostname))) throw new Error('Use HTTPS for remote WordPress authentication.');
  const operation = positionals[0];
  if (!['list', 'show', 'save', 'apply'].includes(operation || '')) throw new Error(BRICKS_SYSTEMS_USAGE);
  if (values.id && !/^pds-[a-f0-9]{12}$/.test(values.id)) throw new Error('Invalid design-system ID.');
  if (['show', 'apply'].includes(operation || '') && !values.id) throw new Error('Provide --id.');
  const headers = JSON.parse(await readFile(values['headers-file'], 'utf8')) as Record<string, string>;
  let body: unknown;
  if (operation === 'save') {
    if (!values['prompt-file']) throw new Error('Save requires --prompt-file.');
    let input = '';
    if (values['prompt-file'] === '-') for await (const chunk of process.stdin) input += chunk;
    else input = await readFile(values['prompt-file'], 'utf8');
    body = JSON.parse(input);
  } else if (operation === 'apply') {
    const revision = Number(values.revision);
    if (!Number.isInteger(revision) || revision < 1) throw new Error('Apply requires --revision.');
    body = { revision, themeStyles: values['theme-styles'] === true };
  }
  const endpoint = `${site.href.replace(/\/$/, '')}/wp-json/pixflow-design/v1/od/design-systems/bricks${values.id ? `/${values.id}` : ''}${operation === 'apply' ? '/apply' : ''}`;
  const response = await fetch(endpoint, { redirect: 'error', method: body ? 'POST' : 'GET', headers: { ...headers, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = await response.json() as { message?: string };
  if (!response.ok) throw new Error(payload.message || `WordPress returned ${response.status}.`);
  process.stdout.write(JSON.stringify(payload, null, values.json ? undefined : 2) + '\n');
}
