import fs from 'node:fs/promises';
import { resolveDaemonUrl } from '../daemon-url.js';

/** External MCP management uses the same site-authorized endpoints as Pro settings. */
export async function runExternalMcpCli(args: string[]): Promise<void> {
  const action = args[0];
  const flags = new Map<string,string>();
  for (let i=1;i<args.length;i++) {
    if (args[i] === '--json') continue;
    if (!['--session-file','--config-file','--server-id','--daemon-url'].includes(args[i]!) || !args[i+1]) throw new Error('Invalid MCP argument.');
    flags.set(args[i]!,args[++i]!);
  }
  const sessionFile = flags.get('--session-file');
  if (!sessionFile) throw new Error('Supply --session-file with a current WordPress direct session for Pro external MCP.');
  const session = JSON.parse(await fs.readFile(sessionFile,'utf8'));
  const base = await resolveDaemonUrl({flagUrl:flags.get('--daemon-url') ?? null});
  const routes: Record<string,string> = {templates:'servers',servers:'servers',save:'servers',connect:'oauth/start',disconnect:'oauth/disconnect',status:'oauth/status'};
  if (!action || !routes[action]) throw new Error('Unknown external MCP action.');
  const serverId = flags.get('--server-id');
  if (['connect','disconnect','status'].includes(action) && !serverId) throw new Error('Supply --server-id.');
  const configFile = flags.get('--config-file');
  if (action === 'save' && !configFile) throw new Error('Supply --config-file with the complete server configuration.');
  const body = action === 'save' ? await fs.readFile(configFile!,'utf8') : ['connect','disconnect'].includes(action) ? JSON.stringify({serverId}) : undefined;
  const response = await fetch(base.replace(/\/$/,'')+'/api/mcp/'+routes[action]+(action === 'status' ? '?serverId='+encodeURIComponent(serverId!) : ''), {
    method:action === 'save' ? 'PUT' : body ? 'POST' : 'GET',
    headers:{'Content-Type':'application/json','X-Pixflow-Mcp-Session':JSON.stringify(session)}, ...(body === undefined ? {} : {body}),
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json() as Record<string,unknown>;
  process.stdout.write(JSON.stringify(action === 'templates' ? {templates:data.templates} : data)+'\n');
}
