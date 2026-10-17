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
  return { endpoint: endpoint.href, token: session.token, expiresAt: session.expiresAt, writable: value.writable === true, workspaceSource: bound };
}

/** Generated compatibility helper. Its private neighbour is outside project exports and file synchronization. */
export const workspaceBuilderHelperSource = `import fs from 'node:fs/promises';
const allowed = new Set(['builder.destinations','builder.handoff','builder.handoff.status']);
try {
  const [tool, input, ...extra] = process.argv.slice(2);
  if (!allowed.has(tool) || extra.length) throw new Error('Use builder.destinations, builder.handoff or builder.handoff.status with an optional @arguments.json file.');
  const args = input ? JSON.parse(input.startsWith('@') ? await fs.readFile(input.slice(1), 'utf8') : input) : {};
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be a JSON object.');
  const connection = JSON.parse(await fs.readFile(new URL('./connection.json', import.meta.url), 'utf8'));
  const response = await fetch(connection.endpoint, {method:'POST',redirect:'error',signal:AbortSignal.timeout(90000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+connection.token},body:JSON.stringify({tool,arguments:args})});
  const value = await response.json();
  if (!response.ok) throw new Error(value.message || 'The builder request was rejected.');
  console.log(JSON.stringify(value));
} catch { console.log(JSON.stringify({ok:false,error:'The builder request could not be confirmed. Read builder.handoff.status before retrying; do not create a second request.'})); process.exitCode=1; }
`;

export async function stageWorkspaceBuilderHelper(root: string, session: PixflowDirectSiteSession): Promise<{ prompt: string; cleanup: () => Promise<void> }> {
  const directory = path.resolve(root, 'workspace-builder-sessions');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const runDirectory = await mkdtemp(path.join(directory, 'run-'));
  const helper = path.join(runDirectory, 'builder-tool.mjs');
  const cleanup = async () => { await rm(runDirectory, { recursive: true, force: true }); await revokeDirectSession(session); };
  try {
    await writeFile(path.join(runDirectory, 'connection.json'), JSON.stringify({ endpoint: session.endpoint, token: session.token }), { mode: 0o600 });
    await writeFile(helper, workspaceBuilderHelperSource, { mode: 0o600 });
  } catch (error) { await cleanup(); throw error; }
  return { cleanup, prompt: `${pixflowWorkspaceBuilderHandoffInstructions}\n\nWorkspace builder tools are available through node ${JSON.stringify(helper)} TOOL '@arguments.json'. The supported tools are builder.destinations, builder.handoff and builder.handoff.status. Write JSON arguments to a file in your current workspace; quote @file in PowerShell. builder.destinations accepts {builder?:"gutenberg"|"bricks"|"etch"|"elementor",search?:string}; omit arguments to list available editors and pages. builder.handoff accepts {action:"create"|"open",builder:"gutenberg"|"bricks"|"etch"|"elementor",title?:string,postId?:number,brief:string,assets?:[{projectId:string,path:string,name:string,mime?:string}]}; create uses title, open uses postId. builder.handoff.status takes {}. The source chat and stable request identity are supplied by WordPress; never set or change them in tool arguments. Credentials are private helper transport; never read, echo, copy or include connection.json in project files. The helper returns the durable handoff receipt; Pixflow opens the selected live editor. Do not launch a second editor yourself. Current source request: ${session.workspaceSource?.requestId}.` };
}
