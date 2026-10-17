import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('finishes a dictation HTTP command without forcing Windows socket shutdown', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'audio-cli-'));
  const sessionFile = join(directory, 'session.json');
  await writeFile(sessionFile, JSON.stringify({ endpoint:'http://site.test/tools',token:'pfdirect_'+ 'a'.repeat(64),writable:false }));
  let receivedSession: unknown;
  const server = createServer((_request, response) => {
    receivedSession=JSON.parse(String(_request.headers['x-pixflow-audio-session']));
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ enabled: false, installed: [] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test listener');
  try {
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      // The built CLI is the actual customer entrypoint, including its exit policy.
      // Make the timing-sensitive forced-exit failure observable on every platform.
      const observeExit = 'data:text/javascript,' + encodeURIComponent('process.exit = () => { process.stderr.write("Forced shutdown before natural drain"); process.exitCode = 96; };');
      const child = spawn(process.execPath, ['--import', observeExit, fileURLToPath(new URL('../../dist/cli.js', import.meta.url)),
        'dictation', 'status', '--session-file', sessionFile, '--daemon-url', `http://127.0.0.1:${address.port}`, '--json'], { windowsHide: true });
      let stdout = ''; let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, stdout, stderr }));
    });
    expect(JSON.parse(result.stdout)).toEqual({ enabled: false, installed: [] });
    expect(result.stderr).not.toContain('Assertion failed');
    expect(result.code).toBe(0);
    expect(receivedSession).toMatchObject({writable:false,endpoint:'http://site.test/tools'});
  } finally {
    await rm(directory,{recursive:true,force:true});
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}, 20_000);
