import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCentralEntitlementGate, centralEntitlementsEnabled } from '../src/pixflow-central-entitlement-gate.js';

const signer = generateKeyPairSync('rsa', { modulusLength: 2048 });
const installation = generateKeyPairSync('rsa', { modulusLength: 2048 });
const roots: string[] = [];
const servers: Server[] = [];
const start = 1800000000;
const installationJwk = installation.publicKey.export({ format: 'jwk' });
const keyThumbprint = createHash('sha256').update(JSON.stringify({ e: installationJwk.e, kty: 'RSA', n: installationJwk.n })).digest('base64url');
const identity = { issuer: 'https://preview.pixflow.dev', audience: 'pixflow-design-bridge', installationId: 'qa', siteFingerprint: 'qa.test', keyThumbprint, licenseId: 'license' };
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function grant(issued = start) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'pixflow-entitlement+jwt', kid: 'qa' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ ver: 2, iss: identity.issuer, aud: identity.audience, sub: 'license', license_id: 'license',
    installation_id: 'qa', site_fingerprint: 'qa.test', cnf: { jkt: keyThumbprint }, jti: `qa-${issued}`, revocation_version: 1,
    scopes: ['bridge:mutate', 'ai:generate', 'cli:execute', 'mcp:execute'], iat: issued, nbf: issued, exp: issued + 900,
    refresh_after: issued + 300, offline_until: issued + 86400, access_until: issued + 86400 })).toString('base64url');
  return `${header}.${payload}.${sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), signer.privateKey).toString('base64url')}`;
}
async function startServer(root?: string, clock = () => start, activeSiteUrl?: () => string) {
  if (!root) { root = mkdtempSync(join(tmpdir(), 'pixflow-central-')); roots.push(root); }
  const pairing = join(root, 'pairing.json');
  writeFileSync(pairing, JSON.stringify({ identity, keys: { qa: signer.publicKey.export({ format: 'jwk' }) }, installationPublicKey: installation.publicKey.export({ format: 'jwk' }) }));
  const app = express(); app.use(express.json());
  const gate = createCentralEntitlementGate(root, pairing, clock, activeSiteUrl); gate.registerRoutes(app); app.use('/api', gate.middleware);
  for (const route of ['generate', 'terminal', 'mcp', 'projects', 'skills/import', 'skills/install', 'skills/example', 'pixflow/bricks-handoff/convert']) app.all(`/api/${route}`, (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1'); servers.push(server);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
  return { root, gate, url: `http://127.0.0.1:${address.port}` };
}
async function proof(url: string, operation: string, token?: string) {
  const challenge = await (await fetch(`${url}/api/pixflow/central-entitlement/challenge`)).json() as { nonce: string };
  const payload = Buffer.from(JSON.stringify({ operation, token })).toString('base64url');
  const signature = sign('RSA-SHA256', Buffer.from(`pixflow-bridge-entitlement-v2\n${challenge.nonce}\n${payload}`), installation.privateKey).toString('base64url');
  return { nonce: challenge.nonce, payload, signature };
}
const post = (url: string, body: unknown) => fetch(`${url}/api/pixflow/central-entitlement`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('opt-in central bridge execution boundary', () => {
  it.each([
    ['', 'https://pixflow.dev'],
    ['https://preview.pixflow.dev', 'https://preview.pixflow.dev'],
  ])('re-pairs old preview state using configured authority %s', async (configured, expected) => {
    const nativeFetch = globalThis.fetch;
    const exchangeCalls: string[] = [];
    vi.stubEnv('PIXFLOW_DESIGN_LICENSE_AUTHORITY', configured);
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      exchangeCalls.push(url);
      if (url.includes('pairing/exchange')) return Response.json({
        configuration: {
          identity: { ...identity, issuer: expected },
          installationPublicKey: installationJwk,
          wordpressUrl: 'https://qa.test', wordpressPairingToken: 'pfwp_1_test',
        }, token: 'test-token',
      });
      return new Response('', { status: 503 });
    }));
    try {
      const { url } = await startServer(undefined, () => start, () => 'https://qa.test');
      const pending = await (await nativeFetch(`${url}/api/pixflow/pairing/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })).json() as { requestId: string };
      await nativeFetch(`${url}/api/pixflow/pairing/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: pending.requestId, code: 'a'.repeat(64) }),
      });
      expect(exchangeCalls).toContain(`${expected}/api/licensing/v2/keys`);
    } finally { vi.unstubAllEnvs(); }
  });
  it('exposes entitlement rejection to the active site so normal automatic pairing can recover', async () => {
    const { url } = await startServer(undefined, () => start, () => 'https://qa.test/');
    for (const origin of ['https://qa.test', 'https://unrelated.test']) {
      const response = await fetch(`${url}/api/projects`, { headers: { Origin: origin } });
      expect(response.status).toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBe(origin === 'https://qa.test' ? origin : null);
      expect(await response.json()).toMatchObject({ error: { code: 'PIXFLOW_CENTRAL_ENTITLEMENT_REQUIRED' } });
    }
  });
  it('preserves bounded offline access on temporary refresh failure but denies explicit revocation', async () => {
    let now = start;
    const { root, gate, url } = await startServer(undefined, () => now);
    expect((await post(url, await proof(url, 'install', grant()))).status).toBe(200);
    const pairingPath = join(root, 'pairing.json');
    const pairing = JSON.parse(readFileSync(pairingPath, 'utf8'));
    writeFileSync(pairingPath, JSON.stringify({ ...pairing, wordpressUrl: 'https://qa.test', wordpressPairingToken: 'test-only' }));
    const nativeFetch = globalThis.fetch;
    now += 901;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await gate.refresh();
    expect((await nativeFetch(`${url}/api/generate`)).status).toBe(200);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })));
    await gate.refresh();
    expect((await nativeFetch(`${url}/api/generate`)).status).toBe(403);
  });
  it('requires central authorization for Pixflow even when the old opt-in flag is absent or false', () => {
    expect(centralEntitlementsEnabled({ PIXFLOW_DESIGN_BRIDGE_VERSION: '1.1.6' })).toBe(true);
    expect(centralEntitlementsEnabled({ PIXFLOW_DESIGN_BRIDGE_VERSION: '1.1.6', PIXFLOW_DESIGN_CENTRAL_ENTITLEMENTS_V2: '0' })).toBe(true);
    expect(centralEntitlementsEnabled({})).toBe(false);
  });
  it('verifies production grants only against the explicitly paired issuer', async () => {
    const originalIssuer = identity.issuer;
    try {
      identity.issuer = 'https://pixflow.dev';
      const { root, url } = await startServer();
      expect((await post(url, await proof(url, 'install', grant()))).status).toBe(200);
      const pairingPath = join(root, 'pairing.json');
      const pairing = JSON.parse(readFileSync(pairingPath, 'utf8'));
      pairing.identity.issuer = 'https://preview.pixflow.dev';
      writeFileSync(pairingPath, JSON.stringify(pairing));
      expect((await fetch(`${url}/api/generate`)).status).toBe(403);
    } finally { identity.issuer = originalIssuer; }
  });
  it('allows the active WordPress origin to read status without exposing it to unrelated origins', async () => {
    const { url } = await startServer(undefined, () => start, () => 'https://qa.test/');
    for (const origin of ['https://qa.test', 'https://unrelated.test']) {
      const response = await fetch(`${url}/api/pixflow/central-entitlement`, { headers: { Origin: origin } });
      expect(response.headers.get('access-control-allow-origin')).toBe(origin === 'https://qa.test' ? origin : null);
      expect((await response.json() as { valid: boolean }).valid).toBe(false);
    }
  });
  it('binds pairing to the actual installation public key and active site', async () => {
    let site = 'https://qa.test/';
    const { root, url } = await startServer(undefined, () => start, () => site);
    expect((await post(url, await proof(url, 'install', grant()))).status).toBe(200);
    site = 'https://another.test/';
    expect((await fetch(`${url}/api/generate`, { method: 'POST' })).status).toBe(403);
    site = 'https://qa.test/';
    const file = join(root, 'pairing.json');
    const pairing = JSON.parse(readFileSync(file, 'utf8'));
    pairing.installationPublicKey = signer.publicKey.export({ format: 'jwk' });
    writeFileSync(file, JSON.stringify(pairing));
    expect((await fetch(`${url}/api/generate`, { method: 'POST' })).status).toBe(403);
  });
  it('protects GET, HEAD and generation/conversion/CLI/MCP independently of UI status', async () => {
    const { url } = await startServer();
    for (const method of ['GET', 'HEAD', 'POST']) for (const route of ['generate', 'terminal', 'mcp', 'projects', 'pixflow/bricks-handoff/convert']) {
      expect((await fetch(`${url}/api/${route}`, { method })).status).toBe(403);
    }
    expect((await post(url, { token: grant(), valid: true })).status).toBe(403);
    expect((await post(url, await proof(url, 'install', grant()))).status).toBe(200);
    for (const route of ['generate', 'terminal', 'mcp', 'projects', 'pixflow/bricks-handoff/convert']) expect((await fetch(`${url}/api/${route}`, { method: 'POST' })).status).toBe(200);
  });
  it('rejects replay and persists denial across restart', async () => {
    let now = start;
    const { url, root } = await startServer(undefined, () => now);
    const envelope = await proof(url, 'install', grant());
    expect((await post(url, envelope)).status).toBe(200);
    expect((await post(url, envelope)).status).toBe(403);
    now++;
    expect((await post(url, await proof(url, 'deny'))).status).toBe(200);
    const restarted = await startServer(root, () => now);
    expect((await fetch(`${restarted.url}/api/generate`, { method: 'POST' })).status).toBe(403);
    expect((await post(restarted.url, await proof(restarted.url, 'install', grant()))).status).toBe(403);
  });
  it('requires signed network-failure notification for offline grace and enforces deadline', async () => {
    let now = start;
    const { url } = await startServer(undefined, () => now);
    await post(url, await proof(url, 'install', grant()));
    now += 900;
    expect((await fetch(`${url}/api/generate`, { method: 'POST' })).status).toBe(403);
    await post(url, await proof(url, 'network-unavailable'));
    expect((await fetch(`${url}/api/generate`, { method: 'POST' })).status).toBe(200);
    now = start + 86400;
    expect((await fetch(`${url}/api/generate`, { method: 'POST' })).status).toBe(403);
  });
});


describe('Free access remains separate from Pro grants', () => {
  it('requires both an entitled Pro add-on and the paired site for custom skill mutations', async () => {
    let now = start; let active = 'https://qa.test'; let enabled = true; let licensed = true;
    const qa = await startServer(undefined, () => now, () => active);
    const pairingPath = join(qa.root, 'pairing.json');
    writeFileSync(pairingPath, JSON.stringify({...JSON.parse(readFileSync(pairingPath,'utf8')), freeAccess:true, wordpressUrl:'https://qa.test', wordpressPairingToken:'pfwp_1_fixture'}));
    const nativeFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (input, init) => String(input).startsWith('https://qa.test/')
      ? Response.json({free_access:true, ...(licensed ? {token:grant()} : {}), features:enabled ? ['custom-skills'] : []})
      : String(input).startsWith(identity.issuer) ? Response.json({keys:[{...signer.publicKey.export({format:'jwk'}),kid:'qa',alg:'RS256',use:'sig'}]}) : nativeFetch(input, init)));
    expect(qa.gate.allowsFeature('custom-skills')).toBe(false);
    await qa.gate.refresh();
    expect(qa.gate.allowsFeature('custom-skills')).toBe(true);
    expect((await fetch(`${qa.url}/api/skills/import`, {method:'POST'})).status).toBe(200);
    enabled = false;
    for (const [route,method] of [['import','POST'],['install','POST'],['example','PUT'],['example','DELETE']] as const) {
      expect((await fetch(`${qa.url}/api/skills/${route}`, {method})).status).toBe(403);
    }
    expect((await fetch(`${qa.url}/api/generate`, {method:'POST'})).status).toBe(200);
    enabled = true; licensed = false; await qa.gate.refresh();
    expect(qa.gate.allowsFeature('custom-skills')).toBe(false);
    licensed = true; now++; await qa.gate.refresh();
    expect(qa.gate.allowsFeature('custom-skills')).toBe(true);
    active = 'https://other.test'; expect(qa.gate.allowsFeature('custom-skills')).toBe(false);
    active = 'https://qa.test'; now += 300; expect(qa.gate.allowsFeature('custom-skills')).toBe(false);
  });
  it('renews Free independently when the Pro signing service is unavailable', async () => {
    const qa = await startServer(undefined, () => start, () => 'https://qa.test');
    const pairingPath = join(qa.root, 'pairing.json');
    writeFileSync(pairingPath, JSON.stringify({...JSON.parse(readFileSync(pairingPath,'utf8')), freeAccess:true, wordpressUrl:'https://qa.test', wordpressPairingToken:'pfwp_1_fixture'}));
    const nativeFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (input, init) => String(input).startsWith('https://qa.test/')
      ? Response.json({free_access:true, token:grant()})
      : String(input).startsWith(identity.issuer) ? new Response('', {status:503}) : nativeFetch(input, init)));
    await qa.gate.refresh();
    expect((await fetch(`${qa.url}/api/generate`, {method:'POST'})).status).toBe(200);
    expect((await fetch(`${qa.url}/api/mcp`, {method:'POST'})).status).toBe(403);
  });
  it('keeps text execution after Pro expiry, denies premium routes and follows credential revocation', async () => {
    let time = start;
    const qa = await startServer(undefined, () => time, () => 'https://qa.test');
    const pairingPath = join(qa.root, 'pairing.json');
    writeFileSync(pairingPath, JSON.stringify({...JSON.parse(readFileSync(pairingPath,'utf8')), freeAccess:true, wordpressUrl:'https://qa.test', wordpressPairingToken:'pfwp_1_fixture'}));
    const nativeFetch = globalThis.fetch;
    let revoked = false;
    vi.stubGlobal('fetch', vi.fn(async (input, init) => String(input).startsWith('https://qa.test/')
      ? (revoked ? Response.json({code:'unauthorized'}, {status:403}) : Response.json({free_access:true}))
      : nativeFetch(input, init)));
    expect((await post(qa.url, await proof(qa.url, 'install', grant()))).status).toBe(200);
    expect((await fetch(`${qa.url}/api/mcp`)).status).toBe(200);
    time += 901;
    await qa.gate.refresh();
    expect(await (await fetch(`${qa.url}/api/pixflow/central-entitlement`)).json()).toMatchObject({valid:true, free_access:true, pro_valid:false});
    for (const route of ['generate','terminal','projects']) expect((await fetch(`${qa.url}/api/${route}`, {method:'POST'})).status).toBe(200);
    expect((await fetch(`${qa.url}/api/mcp`, {method:'POST'})).status).toBe(403);
    expect((await fetch(`${qa.url}/api/design-systems`, {method:'POST'})).status).toBe(403);
    expect((await post(qa.url, await proof(qa.url, 'deny'))).status).toBe(200);
    expect((await fetch(`${qa.url}/api/generate`, {method:'POST'})).status).toBe(200);
    revoked = true; await qa.gate.refresh();
    expect((await fetch(`${qa.url}/api/generate`, {method:'POST'})).status).toBe(403);
  });
  it('requires a fresh paired-site lease and cannot take Free access from a browser body', async () => {
    let time = start; let active = 'https://qa.test';
    const qa = await startServer(undefined, () => time, () => active);
    expect((await fetch(`${qa.url}/api/generate`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({free_access:true})})).status).toBe(403);
    const pairingPath = join(qa.root, 'pairing.json');
    writeFileSync(pairingPath, JSON.stringify({...JSON.parse(readFileSync(pairingPath,'utf8')), freeAccess:true, wordpressUrl:'https://qa.test', wordpressPairingToken:'pfwp_1_fixture'}));
    const nativeFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (input, init) => String(input).startsWith('https://qa.test/') ? Response.json({free_access:true}) : nativeFetch(input, init)));
    await qa.gate.refresh();
    expect((await fetch(`${qa.url}/api/generate`)).status).toBe(200);
    active = 'https://other.test'; expect((await fetch(`${qa.url}/api/generate`)).status).toBe(403);
    active = 'https://qa.test'; time += 300;
    expect((await fetch(`${qa.url}/api/generate`)).status).toBe(403);
    await qa.gate.refresh(); expect((await fetch(`${qa.url}/api/generate`)).status).toBe(200);
  });
});
