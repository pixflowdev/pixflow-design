import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { decoder, encode } from '../native-messaging/src/relay';

test('real native process caps concurrent work, applies backpressure, cancels and recovers without replay', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-native-load-'));
  let requests = 0;
  const server = createServer((_req, res) => { requests++; res.writeHead(200); res.write(Buffer.alloc(256 * 1024, 65)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('Missing port');
  const bridge = `http://127.0.0.1:${address.port}`, origin = 'https://customer.example', extensionOrigin = `chrome-extension://${'a'.repeat(32)}/`;
  await build({ entryPoints: [fileURLToPath(new URL('../native-messaging/src/host.ts', import.meta.url))], outfile: join(root, 'host.mjs'), bundle: true, platform: 'node', format: 'esm' });
  await writeFile(join(root, 'config.json'), JSON.stringify({ bridge, sites: [origin], extensionOrigin }));
  const child = spawn(process.execPath, [join(root, 'host.mjs'), extensionOrigin], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const events: any[] = []; child.stdout.on('data', decoder(message => events.push(message)));
  const waitFor = async (condition: () => boolean) => { const end = Date.now() + 8000; while (!condition()) { if (Date.now() > end) throw Error('Native load fixture timed out'); await new Promise(resolve => setTimeout(resolve, 15)); } };
  const request = (id: string) => child.stdin.write(encode({ id, origin, url: bridge + '/api/projects', method: 'POST', body: '{}' }));
  try {
    for (let index = 0; index < 8; index++) request('run-' + index);
    await waitFor(() => events.filter(e => e.type === 'chunk').length === 8);
    request('overflow');
    await waitFor(() => events.some(e => e.id === 'overflow' && e.type === 'error'));
    assert.equal(requests, 8);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(events.filter(e => e.type === 'chunk').length, 8, 'one unacknowledged chunk per request');
    for (let index = 0; index < 8; index++) child.stdin.write(encode({ id: 'run-' + index, type: 'cancel' }));
    await waitFor(() => events.filter(e => e.type === 'error' && e.id !== 'overflow').length === 8);
    request('recovered');
    await waitFor(() => events.some(e => e.id === 'recovered' && e.type === 'chunk'));
    assert.equal(requests, 9);
    child.stdin.end();
    await waitFor(() => child.exitCode !== null);
    assert.equal(child.exitCode, 0);
    assert.equal(requests, 9, 'disconnect never replays a mutation');
  } finally {
    child.kill(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
