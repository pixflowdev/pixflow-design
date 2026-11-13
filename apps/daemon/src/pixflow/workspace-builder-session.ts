import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { PixflowDirectSiteSession, PixflowDirectSiteAuthorization, PixflowWorkspaceSource } from '@open-design/contracts';
import { pixflowWorkspaceBuilderHandoffInstructions } from '@open-design/contracts';
import { directSessionUrl, revokeDirectSession } from './direct-site-session.js';

/** Credentials live only on the active run; WordPress supplies the authoritative source binding. */
export async function authorizeWorkspaceBuilderSession(raw: string | undefined, source: Pick<PixflowWorkspaceSource, 'projectId' | 'conversationId'>, siteUrl: string): Promise<PixflowDirectSiteSession | undefined> {
  if (!raw) return undefined;
  let session: PixflowDirectSiteSession;
  try { if (raw.length > 8192) throw new Error(); session = JSON.parse(raw); } catch { throw new Error('Reconnect the Workspace to WordPress.'); }
  const endpoint = new URL(session.endpoint);
  const site = new URL(siteUrl);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.origin !== site.origin || endpoint.username || endpoint.password || !/^pfdirect_[a-f0-9]{64}$/.test(session.token || '')) throw new Error('The Workspace connection does not belong to the active WordPress site.');
  const response = await fetch(directSessionUrl(endpoint.href), { redirect: 'error', signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${session.token}` } });
  if (!response.ok) throw new Error('WordPress did not authorize the Workspace connection.');
  const value = await response.json() as PixflowDirectSiteAuthorization;
  const bound = value.workspaceSource;
  if (!value.identity?.siteId || !Number.isInteger(value.identity.userId) || value.identity.userId! <= 0 || !Number.isInteger(value.identity.blogId) || value.identity.blogId! <= 0 || !bound || bound.projectId !== source.projectId || bound.conversationId !== source.conversationId || !bound.requestId || value.editorTarget) throw new Error('The Workspace connection belongs to a different chat.');
  return { endpoint: endpoint.href, token: session.token, expiresAt: session.expiresAt, writable: value.writable === true, workspaceSource: bound,
    ...(typeof value.siteTitle === 'string' ? { siteTitle: value.siteTitle.slice(0, 512) } : {}) };
}

/** Generated compatibility helper. Its private neighbour is outside project exports and file synchronization. */
const workspaceTools = ['builder.destinations', 'builder.handoff', 'builder.handoff.status'];
export const workspaceBuilderHelperSource = `import fs from 'node:fs/promises';
const allowed = new Set(${JSON.stringify(workspaceTools)});
let dispatchedHandoff = false;
let failureCode = 'INVALID_ARGUMENTS';
let status;
let responseFormat;
let wordpressCode;
try {
  const [tool, input, ...extra] = process.argv.slice(2);
  if (!allowed.has(tool)) throw new Error();
  let args;
  if (tool === 'builder.destinations' && input === '--builder' && extra.length === 1 && ['bricks', 'gutenberg', 'elementor', 'etch'].includes(extra[0])) {
    args = { builder: extra[0] };
  } else {
    if (extra.length) throw new Error();
    args = input ? JSON.parse((input.startsWith('@') ? await fs.readFile(input.slice(1), 'utf8') : input).replace(/^\\uFEFF/, '')) : {};
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be a JSON object.');
  failureCode = 'CONNECTION_UNAVAILABLE';
  const connection = JSON.parse(await fs.readFile(new URL('./connection.json', import.meta.url), 'utf8'));
  dispatchedHandoff = tool === 'builder.handoff';
  failureCode = 'REQUEST_FAILED';
  const response = await fetch(connection.endpoint, {method:'POST',redirect:'error',signal:AbortSignal.timeout(90000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+connection.token},body:JSON.stringify({tool,arguments:args})});
  status = response.status;
  failureCode = response.ok ? 'INVALID_RESPONSE' : 'HTTP_REJECTED';
  if (!response.ok) {
    const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    responseFormat = contentType === 'text/html' ? 'html' : 'other';
    if (contentType === 'application/json' || contentType?.endsWith('+json')) {
      const value = await response.json().catch(() => null);
      responseFormat = value === null ? 'other' : 'json';
      const knownCodes = ['pixflow_builder_handoff', 'pixflow_builder_destination', 'pixflow_pro_required', 'rest_forbidden', 'rest_not_logged_in', 'rest_cookie_invalid_nonce', 'site_tool_error', 'unauthorized'];
      if (knownCodes.includes(value?.code)) wordpressCode = value.code;
    }
    throw new Error();
  }
  console.log(JSON.stringify(await response.json()));
} catch {
  const messages = { INVALID_ARGUMENTS: 'Invalid arguments. Run help. For discovery use builder.destinations --builder bricks. For other arguments use a quoted @arguments.json file.', CONNECTION_UNAVAILABLE: 'The local builder session is unavailable. Reconnect the Workspace.', REQUEST_FAILED: 'The WordPress request could not be completed. Check connectivity and Bridge diagnostics.', HTTP_REJECTED: 'WordPress rejected the request. Check the HTTP status and reconnect if authorization expired.', INVALID_RESPONSE: 'WordPress returned an unexpected response. Check the site and Bridge diagnostics.' };
  const message = responseFormat === 'html'
    ? 'The site returned an HTML denial. Check the site security or hosting logs for this request.'
    : messages[failureCode];
  console.log(JSON.stringify({ok:false,code:failureCode,status,responseFormat,wordpressCode,error:message + (dispatchedHandoff ? ' Read builder.handoff.status before retrying; do not create a second request.' : ' No handoff was dispatched.')})); process.exitCode=1;
}
`;

export async function stageWorkspaceBuilderHelper(root: string, session: PixflowDirectSiteSession): Promise<{ prompt: string; discovery: string; cleanup: () => Promise<void> }> {
  const directory = path.resolve(root, 'workspace-builder-sessions');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const runDirectory = await mkdtemp(path.join(directory, 'run-'));
  const helper = path.join(runDirectory, 'builder-tool.mjs');
  // Only public discovery data enters the child environment. Operations still
  // go through the allowlisted helper and WordPress's per-request checks.
  const discovery = JSON.stringify({ scope: 'workspace', siteOrigin: new URL(session.endpoint).origin,
    siteTitle: session.siteTitle ?? null, helper, tools: workspaceTools });
  const cleanup = async () => { await rm(runDirectory, { recursive: true, force: true }); await revokeDirectSession(session); };
  try {
    await writeFile(path.join(runDirectory, 'connection.json'), JSON.stringify({ endpoint: session.endpoint, token: session.token }), { mode: 0o600 });
    await writeFile(helper, `const workspace = ${discovery};\nif (['context','help','--help','-h'].includes(process.argv[2]) && process.argv.length === 3) { console.log(JSON.stringify(workspace)); process.exit(0); }\n` + workspaceBuilderHelperSource, { mode: 0o600 });
  } catch (error) { await cleanup(); throw error; }
  return { cleanup, discovery, prompt: `${pixflowWorkspaceBuilderHandoffInstructions}\n\nFor the connected site title and origin use the read-only command node ${JSON.stringify(helper)} context. It returns metadata verified by WordPress for this turn. For tool discovery use the same helper with help. No separate pairing or credential lookup is needed.\n\nWorkspace builder tools are available through node ${JSON.stringify(helper)} TOOL '@arguments.json'. The supported tools are builder.destinations, builder.handoff and builder.handoff.status. For discovery prefer builder.destinations --builder bricks (or the selected builder); this requires no JSON or shell quoting. For other calls write JSON arguments to a file in your current workspace with your file-writing tool; quote @file in PowerShell. Do not construct JSON with shell here-strings. UTF-8 files with or without a BOM are accepted. builder.destinations accepts {builder?:"gutenberg"|"bricks"|"etch"|"elementor",search?:string}; omit arguments to list available editors and pages. builder.handoff accepts {action:"create"|"open",builder:"gutenberg"|"bricks"|"etch"|"elementor",title?:string,postId?:number,brief:string,assets?:[{projectId:string,path:string,name:string,mime?:string}]}; create uses title, open uses postId. builder.handoff.status takes {}. The source chat and stable request identity are supplied by WordPress; never set or change them in tool arguments. Credentials are private helper transport; never read, echo, copy or include connection.json in project files. The helper returns the durable handoff receipt; Pixflow opens the selected live editor. Do not launch a second editor yourself. Current source request: ${session.workspaceSource?.requestId}.` };
}
