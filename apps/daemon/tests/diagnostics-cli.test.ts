import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

it('exits cleanly when Pixflow diagnostics requires a selected licensed site', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'A current installation-bound Pixflow entitlement is required.' }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture address');
  try {
    const failure = await exec(process.execPath, ['--import', import.meta.resolve('tsx'), cli,
      'diagnostics', 'export', '--profile', 'pixflow', '--daemon-url', `http://127.0.0.1:${address.port}`, '--json'],
    { timeout: 30000, windowsHide: true }).then(() => null, error => error);
    expect(failure).not.toBeNull();
    expect(failure.code).toBe(64);
    expect(failure.stderr).not.toContain('Assertion failed');
    expect(JSON.parse(failure.stderr)).toMatchObject({ error: {
      message: 'A current installation-bound Pixflow entitlement is required.',
    } });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 40000);

it('exports the Pixflow profile through the plugin endpoint with flags before the output path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-diag-cli-'));
  const paths: string[] = [];
  const server = createServer((req, res) => {
    paths.push(req.url!);
    res.end('fixture-zip');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture address');
  try {
    const output = join(root, 'diagnostics.zip');
    const result = await exec(process.execPath, ['--import', import.meta.resolve('tsx'), cli, 'diagnostics', 'export',
      '--profile', 'pixflow', '--daemon-url', `http://127.0.0.1:${address.port}`, output, '--json'],
    { cwd: root, timeout: 30000, windowsHide: true,
      // Resolve tsx from this repository even though the output directory is isolated.
      env: process.env });
    expect(paths).toEqual(['/api/pixflow/diagnostics/export']);
    expect(JSON.parse(result.stdout)).toEqual({ path: output, sizeBytes: 11 });
    expect(result.stderr).not.toContain('Assertion failed');
    expect(await readFile(output, 'utf8')).toBe('fixture-zip');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
}, 40000);
