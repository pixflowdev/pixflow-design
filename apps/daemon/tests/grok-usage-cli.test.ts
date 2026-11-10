import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

test('od agents usage grok-build uses the same read-only account endpoint as the composer', async () => {
  const paths: string[] = [];
  const usage = { status: 'available', source: 'cli', checkedAt: '2026-11-06T00:00:00Z', windows: [{ bucket: 'grok-build', durationMinutes: 10080, remainingPercent: 96, resetsAt: null }] };
  const server = createServer((req, res) => { paths.push(req.url!); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(usage)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('../src/cli.ts', import.meta.url)), 'agents', 'usage', 'grok-build', '--daemon-url', `http://127.0.0.1:${(server.address() as {port:number}).port}`, '--json'], { windowsHide: true });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('CLI fixture timeout')); }, 20000);
      child.stdout.on('data', chunk => { stdout += String(chunk); }); child.stderr.on('data', chunk => { stderr += String(chunk); });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); resolve({code, stdout, stderr}); }); child.stdin.end();
    });
    expect(result.code, result.stderr).toBe(0); expect(JSON.parse(result.stdout)).toEqual(usage);
    expect(paths).toEqual(['/api/agents/grok-build/usage?model=']);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}, 30000);
