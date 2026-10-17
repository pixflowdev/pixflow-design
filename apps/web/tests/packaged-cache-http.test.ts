import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { cp, lstat, mkdtemp, readdir, readFile, readlink, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createStandaloneBackendEnv, createStandaloneServerArgs } from '../sidecar/server';

// Run after OD_WEB_OUTPUT_MODE=standalone pnpm --filter @open-design/web build.
// May also point to the web resource directory inside an unpacked real installer.
const artifact = process.env.PIXFLOW_CACHE_QA_STANDALONE;
const regular = process.env.PIXFLOW_CACHE_QA_SERVER;

async function snapshot(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function visit(path: string, prefix: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const name = `${prefix}${entry.name}`;
      const full = join(path, entry.name);
      if (entry.isSymbolicLink()) files[name] = `link:${await readlink(full)}`;
      else if (entry.isDirectory()) await visit(full, `${name}/`);
      else files[name] = createHash('sha256').update(await readFile(full)).digest('hex');
    }
  }
  await visit(root, '');
  return files;
}

async function start(entry: string, cacheRoot: string, serverMode = false) {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('Missing test port');
  const port = address.port;
  await new Promise<void>(done => socket.close(() => done()));
  let output = '';
  const args = serverMode ? ['--input-type=module', '--eval', `
    import { createRequire } from 'node:module';
    import { createServer } from 'node:http';
    const require = createRequire(${JSON.stringify(entry)});
    const app = require('next')({ dev: false, dir: ${JSON.stringify(dirname(entry))} });
    await app.prepare();
    const server = createServer(app.getRequestHandler());
    server.listen(Number(process.env.PORT), '127.0.0.1');
    process.on('SIGTERM', () => { server.close(); void app.close().finally(() => process.exit(0)); });
  `] : createStandaloneServerArgs(entry);
  const child = spawn(process.execPath, args, {
    cwd: dirname(entry), windowsHide: true,
    env: createStandaloneBackendEnv({ port, baseEnv: { ...process.env, OD_WEB_OUTPUT_MODE: serverMode ? 'server' : 'standalone', OD_WEB_CACHE_ROOT: cacheRoot, OD_WEB_CACHE_REQUIRED: '1' } }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const origin = `http://127.0.0.1:${port}`;
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (child.exitCode !== null) throw new Error(output);
      try {
        const response = await fetch(origin, { signal: AbortSignal.timeout(1000) });
        if (response.status === 200) return { child, origin, output: () => output };
      } catch { /* Wait for the real HTTP listener. */ }
      await new Promise(done => setTimeout(done, 100));
    }
    throw new Error(`Standalone did not become healthy: ${output}`);
  } catch (error) { await stop(child); throw error; }
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exit = once(child, 'exit');
  child.kill();
  const timeout = setTimeout(() => child.kill('SIGKILL'), 3000);
  try { await exit; } finally { clearTimeout(timeout); }
}

describe.skipIf(!artifact && !regular)('real packaged Next HTTP cache', () => {
  it('preserves every packaged file across root, fallback, image, restart and concurrent namespace requests', async () => {
    const standalone = resolve((regular ?? artifact)!);
    const web = regular ? standalone : join(standalone, 'apps', 'web');
    const entry = join(web, regular ? 'package.json' : 'server.js');
    const immutable = regular ? join(web, '.next') : standalone;
    // Next omits public/static from its traced tree. Match the package assembly
    // before taking the immutable baseline; never alter an actual installed app.
    if (!regular && process.env.PIXFLOW_CACHE_QA_ASSEMBLE === '1') {
      await cp(resolve('public'), join(web, 'public'), { recursive: true });
      await cp(resolve('.next/static'), join(web, '.next/static'), { recursive: true });
    }
    expect((await lstat(join(web, 'dist/sidecar/next-cache-handler.js'))).isFile()).toBe(true);
    const before = await snapshot(immutable);
    const runtime = await mkdtemp(join(tmpdir(), 'pixflow-http-cache-'));
    const children: ChildProcess[] = [];
    const exercise = async (server: Awaited<ReturnType<typeof start>>) => {
      for (const path of ['/', '/health', '/unrecognised-cache-check', '/desktop-pet']) {
        const response = await fetch(`${server.origin}${path}`);
        expect(response.status, `${path}: ${server.output()}`).toBe(200);
        expect(await response.text()).toContain('<html');
      }
      const image = await fetch(`${server.origin}/_next/image?url=%2Favatar.png&w=64&q=75`);
      expect(image.status, server.output()).toBe(200);
      expect(image.headers.get('content-type')).toMatch(/^image\//);
      expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0);
      expect(server.output()).not.toMatch(/Failed to (?:set|write).*cache|ENOENT|EACCES/);
    };
    try {
      const a = await start(entry, join(runtime, 'a/cache/web'), !!regular); children.push(a.child);
      const b = await start(entry, join(runtime, 'b/cache/web'), !!regular); children.push(b.child);
      await Promise.all([exercise(a), exercise(b)]);
      await stop(a.child);
      const restarted = await start(entry, join(runtime, 'a/cache/web'), !!regular); children.push(restarted.child);
      await exercise(restarted);
      for (const namespace of ['a', 'b']) {
        const external = await snapshot(join(runtime, namespace, 'cache/web'));
        expect(Object.keys(external).some(name => name.includes('/server/route-cache/'))).toBe(true);
        expect(Object.keys(external).some(name => name.includes('/cache/images/'))).toBe(true);
      }
      for (const child of children) await stop(child);
      expect(await snapshot(immutable)).toEqual(before);
      console.log(`Verified ${Object.keys(before).length} immutable packaged files across two namespaces and restart.`);
    } finally {
      for (const child of children) await stop(child);
      await rm(runtime, { recursive: true, force: true });
    }
  }, 120_000);
});
