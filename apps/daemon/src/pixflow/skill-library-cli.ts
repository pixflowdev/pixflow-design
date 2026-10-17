import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { SkillLibraryMutation, SkillLibraryResponse } from '@open-design/contracts';

export const SKILL_LIBRARY_USAGE = `od skills library <list|preview|install|update-all|enable|disable|rollback|remove>
  --site-url <WordPress URL> --headers-file <private JSON file>
  [--id <skill-id> --digest <reviewed SHA-256>] [--prompt-file <path|->] [--json]
Uses the same site-owned API as Settings. Headers require administrator Cookie and
X-WP-Nonce. No Bridge account, agent tool grant or Pro body is stored in this CLI.
--prompt-file accepts a JSON mutation instead of --id/--digest.`;

export async function runSkillLibraryCli(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    'site-url': { type: 'string' }, 'headers-file': { type: 'string' }, id: { type: 'string' }, digest: { type: 'string' },
    'prompt-file': { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (values.help || !positionals.length) { console.log(SKILL_LIBRARY_USAGE); return; }
  const action = positionals[0]!;
  if (!['list', 'preview', 'install', 'update-all', 'enable', 'disable', 'rollback', 'remove'].includes(action)) throw new Error(SKILL_LIBRARY_USAGE);
  if (action === 'update-all' && (values['prompt-file'] || values.id || values.digest)) throw new Error('update-all uses the current catalogue; omit individual mutation arguments.');
  if (!values['site-url'] || !values['headers-file']) throw new Error('Provide --site-url and --headers-file.');
  const site = new URL(values['site-url']);
  if (site.username || site.password || site.search || site.hash || (site.protocol !== 'https:' && !(site.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(site.hostname)))) throw new Error('Use an HTTPS WordPress URL (HTTP is allowed only on loopback).');
  const headers = JSON.parse(await readFile(values['headers-file'], 'utf8')) as Record<string, string>;
  let body = { id: values.id, action, digest: values.digest } as SkillLibraryMutation;
  if (values['prompt-file']) {
    let input = '';
    if (values['prompt-file'] === '-') for await (const chunk of process.stdin) input += chunk;
    else input = await readFile(values['prompt-file'], 'utf8');
    body = { ...JSON.parse(input), action } as SkillLibraryMutation;
  }
  // Query transport works with or without pretty permalinks.
  const endpoint = new URL(`${site.href.replace(/\/$/, '')}/`);
  endpoint.searchParams.set('rest_route', '/pixflow-design/v1/skill-library');
  if (action === 'preview') {
    if (!body.id || !body.digest) throw new Error('Preview requires --id and --digest from the catalogue.');
    endpoint.searchParams.set('action', 'preview');
    endpoint.searchParams.set('id', body.id);
    endpoint.searchParams.set('digest', body.digest);
  }
  if (action === 'update-all') {
    const catalogue = await fetch(endpoint, { redirect: 'error', headers });
    const data = await catalogue.json() as SkillLibraryResponse;
    if (!catalogue.ok || data.error) throw new Error(data.error || `WordPress returned ${catalogue.status}.`);
    if (!data.pro) throw new Error('Active Pixflow Design Pro is required to update skills.');
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const item of data.skills.filter(item => item.installedVersion && item.updateAvailable && item.canInstall && item.digest)) {
      try {
        const response = await fetch(endpoint, { method: 'POST', redirect: 'error', headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, action: 'install', digest: item.digest }) });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || `WordPress returned ${response.status}.`);
        results.push({ id: item.id, ok: true });
      } catch (error) { results.push({ id: item.id, ok: false, error: error instanceof Error ? error.message : String(error) }); }
    }
    const ok = results.every(result => result.ok);
    process.stdout.write(JSON.stringify({ ok, results }, null, values.json ? undefined : 2) + '\n');
    if (!ok) throw new Error('Some skills could not be updated. See individual results.');
    return;
  }
  const readOnly = action === 'list' || action === 'preview';
  const response = await fetch(endpoint, { method: readOnly ? 'GET' : 'POST', redirect: 'error',
    headers: { ...headers, 'Content-Type': 'application/json' }, ...(readOnly ? {} : { body: JSON.stringify(body) }) });
  const payload = await response.json() as { error?: string };
  if (!response.ok) throw new Error(payload.error || `WordPress returned ${response.status}.`);
  process.stdout.write(JSON.stringify(payload, null, values.json ? undefined : 2) + '\n');
}
