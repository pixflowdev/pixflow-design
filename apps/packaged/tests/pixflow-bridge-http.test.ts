import { createServer, request, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  proxyTimeoutForPath,
  startPixflowBridgeHttpGateway,
  type PixflowBridgeGatewayHandle,
} from '../src/pixflow-bridge-http.js';

const handles: PixflowBridgeGatewayHandle[] = [];
const servers: Server[] = [];

it('rejects rebinding hosts before proxying, switching or preflight while retaining loopback clients', async () => {
  const switchSite = vi.fn(async () => ({}));
  const gateway = await startGateway({ version: 'test', getState: () => 'running', getDaemonUrl: () => null, getWebUrl: () => null, switchSite });
  for (const [method, path] of [['GET', '/api/projects/private/files'], ['POST', '/api/pixflow/site-context/switch'], ['OPTIONS', '/api/projects']] as const) {
    const result = await new Promise<{ status: number | undefined; origin: unknown }>((resolve, reject) => {
      const req = request(`${gateway}${path}`, { method, headers: { Host: 'attacker.test' } }, res => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, origin: res.headers['access-control-allow-origin'] }));
      });
      req.on('error', reject);
      req.end();
    });
    expect(result.status).toBe(403);
    expect(result.origin).toBeUndefined();
  }
  expect(switchSite).not.toHaveBeenCalled();
  expect((await fetch(`${gateway}/api/health`)).status).toBe(200);
});

it('keeps sleeping health online, never wakes for polls, and restricts site disclosure', async () => {
  const site = { key: 'site-one', label: 'One', url: 'https://one.test', origin: 'https://one.test', dataDir: '', syncRoot: '' };
  const acquire = vi.fn(async () => () => {});
  const wakeSite = vi.fn(async () => {});
  const gateway = await startGateway({
    version: 'test', getState: () => 'running', getDaemonUrl: () => null, getWebUrl: () => null,
    getSite: () => site, getRuntimeState: () => 'sleeping', acquire, wakeSite,
    resolveSite: (key, origin) => key === site.key && origin === site.origin ? {
      getState: () => 'running', getDaemonUrl: () => null, getWebUrl: () => null, getSite: () => site,
      getRuntimeState: () => 'sleeping', acquire,
    } : null,
    listSites: async () => ({ warmIdleLimit: 5, idleGraceMs: 300000, sites: [
      { key: site.key, label: 'One', url: site.url, state: 'sleeping', lastUsedAt: 1 },
      { key: 'site-two', label: 'Private other site', url: 'https://two.test', state: 'ready', lastUsedAt: 1 },
    ] }),
  });
  const headers = { Origin: site.origin, 'X-Pixflow-Site-Key': site.key };
  expect(await (await fetch(`${gateway}/api/health`, { headers })).json()).toMatchObject({ ok: true, runtimeState: 'sleeping', site: { key: site.key } });
  expect((await fetch(`${gateway}/api/agents`, { headers })).status).toBe(409);
  expect((await fetch(`${gateway}/api/pixflow/central-entitlement`, { method: 'POST', headers })).status).toBe(409);
  expect(acquire).not.toHaveBeenCalled();
  expect((await (await fetch(`${gateway}/api/pixflow/sites`, { headers })).json()).sites).toHaveLength(1);
  expect((await fetch(`${gateway}/api/pixflow/sites/site-two/wake`, { method: 'POST', headers })).status).toBe(403);
  expect((await fetch(`${gateway}/api/pixflow/sites/site-one/wake`, { method: 'POST', headers })).status).toBe(200);
  expect(wakeSite).toHaveBeenCalledExactlyOnceWith('site-one');
  expect((await fetch(`${gateway}/api/pixflow/runtime-idle`, { method: 'POST' })).status).toBe(403);
});

it('keeps a verified connection directory live while its caller sleeps, without retaining management authority', async () => {
  let sleeping = false;
  let valid = true;
  let otherState: 'ready' | 'working' = 'ready';
  const proof = createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ valid })); });
  servers.push(proof);
  await new Promise<void>(resolve => proof.listen(0, '127.0.0.1', resolve));
  const upstream = `http://127.0.0.1:${(proof.address() as import('node:net').AddressInfo).port}`;
  const site = { key: 'one', origin: 'https://one.test', url: 'https://one.test', label: 'One', dataDir: '', syncRoot: '' };
  const gateway = await startGateway({ version: 'test', getState: () => 'running', getWebUrl: () => null,
    getDaemonUrl: () => sleeping ? null : upstream, getSite: () => site,
    getRuntimeState: () => sleeping ? 'sleeping' : 'ready',
    resolveSite: (key, origin) => key === site.key && origin === site.origin ? {
      getState: () => 'running', getDaemonUrl: () => sleeping ? null : upstream, getWebUrl: () => null,
    } : null,
    listSites: async () => ({ warmIdleLimit: 5, idleGraceMs: 300000, sites: [
      { key: 'one', label: 'One', url: site.url, state: sleeping ? 'sleeping' : 'ready', lastUsedAt: 1 },
      { key: 'two', label: 'Two', url: 'https://two.test', state: otherState, lastUsedAt: 1 },
    ] }),
  });
  const headers = { Origin: site.origin, 'X-Pixflow-Site-Key': site.key };
  const list = async () => (await (await fetch(`${gateway}/api/pixflow/sites`, { headers })).json()).sites;
  expect(await list()).toHaveLength(2);
  sleeping = true; otherState = 'working';
  expect(await list()).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'two', state: 'working' })]));
  expect((await fetch(`${gateway}/api/pixflow/sites/two/sleep`, { method: 'POST', headers })).status).toBe(403);
  sleeping = false; valid = false;
  expect(await list()).toHaveLength(1);
  sleeping = true;
  expect(await list()).toHaveLength(1);
});

it('disconnects an upstream Direct stream when the browser stops after sending its request', async () => {
  let closed = false;
  let response: import('node:http').ServerResponse | undefined;
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      response = res;
      res.on('close', () => { closed = true; });
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      res.write('{"type":"text_delta","delta":"started"}\n');
    });
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const upstream = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const gateway = await startGateway({ version: 'test', getState: () => 'running', getDaemonUrl: () => upstream, getWebUrl: () => upstream });
  const controller = new AbortController();
  try {
    const result = await fetch(`${gateway}/api/pixflow/direct-site/run-stream`, { method: 'POST', body: '{}', signal: controller.signal });
    const reader = result.body!.getReader();
    await reader.read();
    controller.abort();
    await reader.cancel().catch(() => undefined);
    await vi.waitFor(() => expect(closed).toBe(true), { timeout: 1500 });
  } finally { response?.end(); server.closeAllConnections(); }
});

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function listenJsonServer(payload: unknown): Promise<string> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(`${JSON.stringify(payload)}\n`);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a TCP port');
  return `http://127.0.0.1:${address.port}`;
}

async function listenLegacyBridgeServer(): Promise<{ baseUrl: string; port: number; shutdownRequests: number }> {
  let shutdownRequests = 0;
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(`${JSON.stringify({
        ok: true,
        product: 'pixflow-design-bridge',
        runtimeVersion: '0.10.1',
        instanceId: 'legacy-instance',
      })}\n`);
      return;
    }
    if (req.method === 'POST' && req.url === '/api/daemon/shutdown') {
      shutdownRequests += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}\n', () => server.close());
      return;
    }
    res.writeHead(404).end();
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('legacy server did not bind to a TCP port');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    port: address.port,
    get shutdownRequests() { return shutdownRequests; },
  };
}

async function startGateway(options: Parameters<typeof startPixflowBridgeHttpGateway>[0]): Promise<string> {
  const handle = await startPixflowBridgeHttpGateway({
    port: 0,
    ...options,
  });
  handles.push(handle);
  const port = (handle as unknown as { port: number }).port;
  return `http://127.0.0.1:${port}`;
}

describe('Pixflow bridge HTTP gateway', () => {
  it('keeps site A streaming while site B is connected', async () => {
    let stream: import('node:http').ServerResponse | undefined;
    const server = createServer((_req, res) => {
      stream = res;
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      res.write('{"site":"a","part":1}\n');
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const a = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    const b = await listenJsonServer({ ok: true, site: { key: 'site-b' } });
    let selected = a;
    const baseUrl = await startGateway({
      version: 'test', getState: () => 'running', getDaemonUrl: () => selected, getWebUrl: () => selected,
      switchSite: async () => { selected = b; return { ok: true }; },
      resolveSite: key => ({ getState: () => 'running', getDaemonUrl: () => key === 'site-a' ? a : b, getWebUrl: () => a }),
    });
    const response = await fetch(`${baseUrl}/api/pixflow/direct-site/run-stream`, { headers: { 'X-Pixflow-Site-Key': 'site-a' } });
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"part":1');
    await fetch(`${baseUrl}/api/pixflow/site-context/switch`, { method: 'POST', body: JSON.stringify({ siteKey: 'site-b' }) });
    stream!.end('{"site":"a","part":2}\n');
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"part":2');
    expect((await reader.read()).done).toBe(true);
  });

  it('routes overlapping site requests independently without changing their selected runtime', async () => {
    const a = await listenJsonServer({ ok: true, site: { key: 'site-a' }, answer: 'a' });
    const b = await listenJsonServer({ ok: true, site: { key: 'site-b' }, answer: 'b' });
    const targets = { 'site-a': a, 'site-b': b };
    const baseUrl = await startGateway({
      version: 'test', getState: () => 'running', getDaemonUrl: () => a, getWebUrl: () => a,
      resolveSite: (key: string, origin: string) => {
        if (origin && origin !== `https://${key}.test`) return null;
        const target = targets[key as keyof typeof targets];
        return target ? { getState: () => 'running' as const, getDaemonUrl: () => target, getWebUrl: () => target } : null;
      },
    });
    const request = (key: string, path: string) => fetch(`${baseUrl}${path}`, {
      headers: { 'X-Pixflow-Site-Key': key, Origin: `https://${key}.test` },
    }).then(response => response.json());
    const [first, second, healthA, healthB] = await Promise.all([
      request('site-a', '/api/agents'), request('site-b', '/api/agents'),
      request('site-a', '/api/health'), request('site-b', '/api/health'),
    ]);
    expect(first.answer).toBe('a');
    expect(second.answer).toBe('b');
    expect(healthA.site.key).toBe('site-a');
    expect(healthB.site.key).toBe('site-b');
    const denied = await fetch(`${baseUrl}/api/agents`, { headers: { 'X-Pixflow-Site-Key': 'site-b', Origin: 'https://site-a.test' } });
    expect(denied.status).toBe(409);
  });

  it('does not report a ready bridge when its runtime is unavailable', async () => {
    const baseUrl = await startGateway({
      version: 'test', getState: () => 'running',
      getDaemonUrl: () => null, getWebUrl: () => null,
    });
    expect(await (await fetch(`${baseUrl}/api/health`)).json()).toMatchObject({ ok: false });
  });

  it('reports runtime failure and then recovers without restarting the gateway', async () => {
    const failed = await listenJsonServer({ ok: false });
    const healthy = await listenJsonServer({ ok: true, site: { key: 'recovered' } });
    let daemon = failed;
    const baseUrl = await startGateway({
      version: 'test', getState: () => 'running',
      getDaemonUrl: () => daemon, getWebUrl: () => null,
    });
    expect(await (await fetch(`${baseUrl}/api/health`)).json()).toMatchObject({ ok: false });
    daemon = healthy;
    expect(await (await fetch(`${baseUrl}/api/health`)).json()).toMatchObject({ ok: true, site: { key: 'recovered' } });
  });

  it('discards a health result from a runtime replaced during the request', async () => {
    let respond: (() => void) | undefined;
    const server = createServer((_req, res) => {
      respond = () => res.end(JSON.stringify({ ok: true, site: { key: 'old-site' } }));
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    let daemon: string | null = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    const baseUrl = await startGateway({ version: 'test', getState: () => 'running', getDaemonUrl: () => daemon, getWebUrl: () => null });
    const pending = fetch(`${baseUrl}/api/health`);
    await vi.waitFor(() => expect(respond).toBeDefined());
    daemon = null;
    respond!();
    expect(await (await pending).json()).toMatchObject({ ok: false, site: null });
  });

  it('admits an explicit run after a concurrent idle release, without waking passive polling', async () => {
    const upstream = await listenJsonServer({ accepted: true });
    let sleeping = true;
    const acquire = vi.fn(async () => { sleeping = false; return () => {}; });
    const baseUrl = await startGateway({ version: 'test', getState: () => 'running',
      getDaemonUrl: () => upstream, getWebUrl: () => upstream,
      getRuntimeState: () => sleeping ? 'sleeping' : 'ready', acquire });
    expect((await fetch(`${baseUrl}/api/agents`)).status).toBe(409);
    expect(acquire).not.toHaveBeenCalled();
    const response = await fetch(`${baseUrl}/api/pixflow/direct-site/run-stream`, { method: 'POST', body: '{}' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true });
    expect(acquire).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('closes active streams when the owned gateway shuts down', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: connected\n\n');
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const upstream = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    const handle = await startPixflowBridgeHttpGateway({
      port: 0, version: 'test', getState: () => 'running',
      getDaemonUrl: () => upstream, getWebUrl: () => upstream,
    });
    const controller = new AbortController();
    let closed = false;
    try {
      const response = await fetch(`http://127.0.0.1:${handle.port}/api/events/stream`, { signal: controller.signal });
      await response.body!.getReader().read();
      void handle.close().then(() => { closed = true; });
      await vi.waitFor(() => expect(closed).toBe(true), { timeout: 600 });
    } finally {
      controller.abort();
      server.closeAllConnections();
      await handle.close();
    }
  });

  it('allows the six-viewport visual acceptance capture to outlive the ordinary API timeout', () => {
    expect(proxyTimeoutForPath(new URL('http://127.0.0.1/api/pixflow/visual-capture'))).toBeGreaterThanOrEqual(5 * 60_000);
    expect(proxyTimeoutForPath(new URL('http://127.0.0.1/api/pixflow/website-clone-source'))).toBeGreaterThanOrEqual(5 * 60_000);
  });

  it('replaces a verified legacy Pixflow daemon that still owns the gateway port', async () => {
    const legacy = await listenLegacyBridgeServer();

    const handle = await startPixflowBridgeHttpGateway({
      port: legacy.port,
      version: '1.0.12',
      getState: () => 'running',
      getDaemonUrl: () => null,
      getWebUrl: () => null,
    });
    handles.push(handle);

    const response = await fetch(`${legacy.baseUrl}/api/health`);
    const json = await response.json() as { product?: string; transport?: string };
    expect(legacy.shutdownRequests).toBe(1);
    expect(json).toMatchObject({
      product: 'pixflow-design-bridge',
      transport: 'tray-gateway',
    });
  });

  it('does not replace an unrelated service that owns the gateway port', async () => {
    const baseUrl = await listenJsonServer({ ok: true, product: 'unrelated-service' });
    const port = Number(new URL(baseUrl).port);

    await expect(startPixflowBridgeHttpGateway({
      port,
      version: '1.0.12',
      getState: () => 'running',
      getDaemonUrl: () => null,
      getWebUrl: () => null,
    })).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });

  it('reports the active tray site in health responses', async () => {
    const site = {
      dataDir: '/tmp/site',
      key: 'site-key-123',
      origin: 'https://example.test',
      syncRoot: '/tmp/site/sync',
      url: 'https://example.test',
      label: 'Example',
    };
    const baseUrl = await startGateway({
      version: '1.0.0',
      getState: () => 'running',
      getDaemonUrl: () => null,
      getWebUrl: () => null,
      getSite: () => site,
    });

    const response = await fetch(`${baseUrl}/api/health`);
    const json = await response.json() as { site?: { key?: string } | null };

    expect(json.site?.key).toBe(site.key);
  });

  it('prefers the daemon-confirmed site in health responses', async () => {
    const daemonUrl = await listenJsonServer({
      ok: true,
      site: {
        dataDir: '/tmp/daemon-site',
        key: 'daemon-site-123',
        origin: 'https://daemon.test',
        syncRoot: '/tmp/daemon-site/sync',
        url: 'https://daemon.test',
        label: 'Daemon',
      },
    });
    const baseUrl = await startGateway({
      version: '1.0.0',
      getState: () => 'running',
      getDaemonUrl: () => daemonUrl,
      getWebUrl: () => null,
      getSite: () => ({
        dataDir: '/tmp/tray-site',
        key: 'tray-site-123',
        origin: 'https://tray.test',
        syncRoot: '/tmp/tray-site/sync',
        url: 'https://tray.test',
        label: 'Tray',
      }),
    });

    const response = await fetch(`${baseUrl}/api/health`);
    const json = await response.json() as { site?: { key?: string } | null };

    expect(json.site?.key).toBe('daemon-site-123');
  });
});
