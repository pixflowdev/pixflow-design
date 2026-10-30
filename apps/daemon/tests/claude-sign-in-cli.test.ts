import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
function run(args: string[], input = '') {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), cli, 'agents', 'sign-in', 'claude', ...args, '--json'], { windowsHide: true });
    let stdout = ''; let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('CLI fixture timeout')); }, 30000);
    child.stdout.on('data', chunk => { stdout += String(chunk); }); child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    child.stdin.end(input);
  });
}
test('CLI reopens and submits recovery through the same endpoints without printing codes', async () => {
  const calls: { path: string; body: unknown }[] = [];
  const server = createServer((req, res) => {
    let body = ''; req.on('data', chunk => { body += String(chunk); }); req.on('end', () => {
      calls.push({ path: req.url!, body: body ? JSON.parse(body) : null });
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ state: 'waiting', source: 'desktop', attemptId: 'owned' }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const opened = await run(['--daemon-url', base, '--open-browser']); expect(opened.code).toBe(0);
    const sent = await run(['--daemon-url', base, '--prompt-file', '-'], JSON.stringify({ attemptId: 'owned', code: 'synthetic-code#state' }));
    expect(sent.code).toBe(0); expect(sent.stdout + sent.stderr).not.toContain('synthetic-code');
    expect(calls).toEqual([
      { path: '/api/agents/claude/sign-in', body: null },
      { path: '/api/agents/claude/sign-in/open-browser', body: { attemptId: 'owned' } },
      { path: '/api/agents/claude/sign-in/code', body: { attemptId: 'owned', code: 'synthetic-code#state' } },
    ]);
    const invalid = await run(['--daemon-url', base, '--prompt-file', '-'], 'synthetic-secret-invalid-json');
    expect(invalid.code).not.toBe(0); expect(invalid.stderr).not.toContain('synthetic-secret'); expect(calls).toHaveLength(3);
    const remote = await run(['--daemon-url', 'https://unrelated.test', '--prompt-file', '-'], '{}');
    expect(remote.code).not.toBe(0); expect(remote.stderr).toContain('local Bridge');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}, 90000);
