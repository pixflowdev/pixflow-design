import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { PixflowBuilderDestinationRequest, PixflowBuilderId } from '@open-design/contracts';

const BUILDER_IDS = ['gutenberg', 'bricks', 'etch', 'elementor'] as const satisfies readonly PixflowBuilderId[];
function isBuilderId(value: unknown): value is PixflowBuilderId {
  return typeof value === 'string' && (BUILDER_IDS as readonly string[]).includes(value);
}
const BUILDER_CHOICE_ERROR = 'Choose --builder gutenberg, bricks, etch or elementor.';

export const BUILDER_DESTINATIONS_USAGE = `od builder <list|create|open|handoff|handoff-status>
  --site-url <WordPress URL> --headers-file <private JSON file>
  [--builder gutenberg|bricks|etch|elementor] [--search <page title>]
  [--title <new draft title> --request-id <stable unique ID> | --post-id <existing page ID>]
  [--prompt-file <path|->] [--json]
  handoff --prompt-file <JSON path|-> prepares an explicitly approved build brief.
  handoff-status --handoff-id <id> reads its durable progress.
Uses the same site-owned destination API as Workspace. The private headers file
contains administrator Cookie and X-WP-Nonce (or supported site authentication).
create requires a stable request ID of 16–128 letters, digits, underscores or
hyphens; reuse it when retrying the same request to avoid duplicate drafts.
--prompt-file accepts a JSON create/open request. open returns the editor URL;
it does not navigate a browser, start an agent, convert content or publish pages.
handoff returns an editor URL: opening it allows that destination editor to claim
and start the approved brief once. Reuse the same requestId on uncertain retries.`;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requestBody(action: 'create' | 'open', value: Record<string, unknown>): PixflowBuilderDestinationRequest {
  const allowed = new Set(['action', 'builder', ...(action === 'create' ? ['title', 'requestId'] : ['postId'])]);
  if (Object.keys(value).some(key => !allowed.has(key))) throw new Error('Unsupported destination field. This command only selects a page or creates an empty draft.');
  if (value.action !== undefined && value.action !== action) throw new Error('The request action must match the command.');
  if (!isBuilderId(value.builder)) throw new Error(BUILDER_CHOICE_ERROR);
  if (action === 'create') {
    if (typeof value.title !== 'string' || !value.title.trim() || [...value.title.trim()].length > 200) throw new Error('Provide a draft title of 1–200 characters.');
    if (typeof value.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value.requestId)) throw new Error('Provide a stable --request-id of 16–128 letters, digits, underscores or hyphens. Reuse it when retrying this draft.');
    return { action, builder: value.builder, title: value.title.trim(), requestId: value.requestId };
  }
  if (typeof value.postId !== 'number' || !Number.isSafeInteger(value.postId) || value.postId <= 0) throw new Error('Provide a positive integer --post-id.');
  return { action, builder: value.builder, postId: value.postId };
}

export async function runBuilderDestinationsCli(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    'site-url': { type: 'string' }, 'headers-file': { type: 'string' }, builder: { type: 'string' },
    title: { type: 'string' }, 'post-id': { type: 'string' }, 'request-id': { type: 'string' }, search: { type: 'string' },
    'prompt-file': { type: 'string' }, 'handoff-id': { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (values.help || !positionals.length) { console.log(BUILDER_DESTINATIONS_USAGE); return; }
  const action = positionals[0];
  if (positionals.length !== 1 || !['list', 'create', 'open', 'handoff', 'handoff-status'].includes(action!)) throw new Error(BUILDER_DESTINATIONS_USAGE);
  if (!values['site-url'] || !values['headers-file']) throw new Error('Provide --site-url and --headers-file.');
  const site = new URL(values['site-url']);
  if (site.username || site.password || site.search || site.hash || (site.protocol !== 'https:' && !(site.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(site.hostname)))) throw new Error('Use an HTTPS WordPress URL (HTTP is allowed only on loopback).');
  const endpoint = new URL(`${site.href.replace(/\/$/, '')}/`);
  endpoint.searchParams.set('rest_route', '/pixflow-design/v1/builder-destinations');
  let body: PixflowBuilderDestinationRequest | Record<string, unknown> | undefined;
  const handoff = action === 'handoff' || action === 'handoff-status';
  if (handoff) {
    endpoint.searchParams.set('rest_route', '/pixflow-design/v1/builder-handoffs');
    if (values.builder || values.title || values['post-id'] || values['request-id'] || values.search) throw new Error('Use the complete handoff JSON request, or --handoff-id for status.');
    if (action === 'handoff-status') {
      if (!values['handoff-id'] || values['prompt-file']) throw new Error('Provide --handoff-id for status.');
      endpoint.searchParams.set('id', values['handoff-id']);
    } else {
      if (!values['prompt-file'] || values['handoff-id']) throw new Error('Provide the approved handoff JSON with --prompt-file.');
      let text = '';
      if (values['prompt-file'] === '-') for await (const chunk of process.stdin) text += chunk;
      else text = await readFile(values['prompt-file'], 'utf8');
      const input: unknown = JSON.parse(text);
      const allowed = new Set(['action','requestId','projectId','conversationId','builder','postId','targetTabId','brief','assets']);
      if (!object(input) || Object.keys(input).some(key=>!allowed.has(key)) || (input.action !== undefined && input.action !== 'prepare')) throw new Error('Only an approved prepare handoff request is accepted.');
      if (typeof input.brief !== 'string' || !input.brief.trim() || Buffer.byteLength(input.brief)>65536) throw new Error('Provide a non-empty build brief up to 65,536 bytes.');
      for (const key of ['requestId','projectId','conversationId','targetTabId']) if (typeof input[key] !== 'string' || !input[key]) throw new Error(`Missing handoff ${key}.`);
      requestBody('open',{builder:input.builder,postId:input.postId});
      body = {...input,action:'prepare'};
    }
  } else if (values['handoff-id']) throw new Error('--handoff-id requires handoff-status.');
  else if (action === 'list') {
    if (values.title || values['post-id'] || values['request-id'] || values['prompt-file']) throw new Error('list accepts only --builder and --search filters.');
    if (values.builder && !isBuilderId(values.builder)) throw new Error(BUILDER_CHOICE_ERROR);
    if (values.builder) endpoint.searchParams.set('builder', values.builder);
    if (values.search) endpoint.searchParams.set('search', values.search);
  } else {
    if (values.search) throw new Error('--search is only available for list.');
    let input: Record<string, unknown>;
    if (values['prompt-file']) {
      if (values.builder || values.title || values['post-id'] || values['request-id']) throw new Error('Use either --prompt-file or destination flags, not both.');
      let text = '';
      if (values['prompt-file'] === '-') for await (const chunk of process.stdin) text += chunk;
      else text = await readFile(values['prompt-file'], 'utf8');
      const parsed: unknown = JSON.parse(text);
      if (!object(parsed)) throw new Error('The request file must contain a JSON object.');
      input = parsed;
    } else {
      input = { builder: values.builder };
      if (values.title !== undefined) input.title = values.title;
      if (values['request-id'] !== undefined) input.requestId = values['request-id'];
      if (values['post-id'] !== undefined) input.postId = Number(values['post-id']);
    }
    body = requestBody(action as 'create' | 'open', input);
  }
  const privateHeaders: unknown = JSON.parse(await readFile(values['headers-file'], 'utf8'));
  if (!object(privateHeaders) || Object.entries(privateHeaders).some(([name, value]) => typeof value !== 'string' || /^(host|content-length)$/i.test(name))) throw new Error('The headers file must contain an object of HTTP header strings without Host or Content-Length.');
  const headers = new Headers(privateHeaders as Record<string, string>);
  headers.set('Content-Type', 'application/json');
  const response = await fetch(endpoint, { method: body ? 'POST' : 'GET', headers, redirect: 'error', ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload: unknown = await response.json();
  if (!response.ok || !object(payload) || payload.error || payload.ok === false) {
    const message = object(payload) ? payload.error || payload.message : undefined;
    throw new Error(typeof message === 'string' ? message : `WordPress returned ${response.status}.`);
  }
  // Do not return cross-site editor URLs as trusted destinations, even when a
  // site plugin/proxy accidentally supplies one. Never open URLs from this CLI.
  const receipt = object(payload.handoff) ? payload.handoff : null;
  const destinations = handoff ? receipt ? [{...object(receipt.destination) ? receipt.destination : {},editorUrl:receipt.editorUrl}] : [] : body ? [payload.destination] : payload.pages;
  if (!Array.isArray(destinations)) throw new Error('WordPress returned an invalid destination response.');
  for (const destination of destinations) {
    if (!object(destination) || typeof destination.editorUrl !== 'string') throw new Error('WordPress returned an invalid editor URL.');
    const editor = new URL(destination.editorUrl);
    if (editor.origin !== site.origin || editor.username || editor.password) throw new Error('WordPress returned an editor URL outside the selected site.');
  }
  process.stdout.write(JSON.stringify(payload, null, values.json ? undefined : 2) + '\n');
}
