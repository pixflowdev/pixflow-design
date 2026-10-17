import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { MCP_TEMPLATES } from '../src/mcp-config.js';

it('lists the shared HTTP catalogue as JSON without exposing saved credentials', async () => {
  const dir = await mkdtemp(join(tmpdir(),'mcp-cli-'));
  const sessionFile = join(dir,'session.json');
  await writeFile(sessionFile, JSON.stringify({token:'test'}));
  const paths: string[] = [];
  const server = http.createServer((request, response) => {
    paths.push(request.url!);
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ templates: MCP_TEMPLATES, servers: [{ env: { SECRET: 'never-print-this' } }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    const { stdout } = await promisify(execFile)(process.execPath, [
      '--import', 'tsx', fileURLToPath(new URL('../src/cli.ts', import.meta.url)),
      'mcp', 'templates', '--session-file', sessionFile, '--json', '--daemon-url', `http://127.0.0.1:${address.port}`,
    ], { windowsHide: true, timeout: 20_000 });
    expect(JSON.parse(stdout).templates).toHaveLength(50);
    expect(stdout).not.toContain('never-print-this');
    expect(paths).toEqual(['/api/mcp/servers']);
  } finally { await rm(dir,{recursive:true,force:true}); await new Promise<void>((resolve) => server.close(() => resolve())); }
}, 25_000);
