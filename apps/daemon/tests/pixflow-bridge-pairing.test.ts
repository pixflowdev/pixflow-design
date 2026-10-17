import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, expect, it, vi } from 'vitest';
import type { PixflowPairingFailure } from '@open-design/contracts';
import { registerBridgePairing } from '../src/pixflow-bridge-pairing.js';

const signer = generateKeyPairSync('rsa', { modulusLength: 2048 });
const installation = generateKeyPairSync('rsa', { modulusLength: 2048 });
const installationPublicKey = installation.publicKey.export({ format: 'jwk' });
const keyThumbprint = createHash('sha256').update(JSON.stringify({ e: installationPublicKey.e, kty: 'RSA', n: installationPublicKey.n })).digest('base64url');
const identity = { issuer: 'https://pixflow.dev', audience: 'pixflow-design-bridge', installationId: 'qa', siteFingerprint: 'qa.test', keyThumbprint, licenseId: 'license' };
const now = 1800000000;
const configuration = { identity, installationPublicKey, keys: {}, wordpressUrl: 'https://qa.test', wordpressPairingToken: `pfwp_1_${'a'.repeat(64)}` };
function token() {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'pixflow-entitlement+jwt', kid: 'qa' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ ver: 2, iss: identity.issuer, aud: identity.audience, sub: 'license', license_id: 'license', installation_id: 'qa', site_fingerprint: 'qa.test', cnf: { jkt: keyThumbprint }, jti: 'test', revocation_version: 1, scopes: ['bridge:mutate'], iat: now, nbf: now, exp: now + 900, refresh_after: now + 300, offline_until: now + 86400, access_until: now + 86400 })).toString('base64url');
  return `${header}.${payload}.${sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), signer.privateKey).toString('base64url')}`;
}
const roots: string[] = []; const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
async function setup(options: { failInstall?: boolean; reject?: boolean; wrongIssuer?: boolean; free?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'pairing-test-')); roots.push(root);
  const pairingPath = join(root, 'pairing.json');
  let time = now; let site = 'https://qa.test';
  const installed = vi.fn(() => { if (options.failInstall) throw new Error('Disk failure'); });
  const transport = vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith('/keys')) return Response.json({ keys: [{ ...signer.publicKey.export({ format: 'jwk' }), kid: 'qa', alg: 'RS256', use: 'sig' }] });
    if (options.free) return Response.json({configuration: {...configuration, freeAccess: true}, token: ''});
    return Response.json({ configuration: options.wrongIssuer ? { ...configuration, identity: { ...identity, issuer: 'https://preview.pixflow.dev' } } : configuration, token: token() });
  });
  const app = express(); app.use(express.json());
  registerBridgePairing(app, { pairingPath, site: () => site, issuer: () => identity.issuer, clock: () => time, installed, accepts: () => !options.reject, fetch: transport });
  const server = app.listen(0, '127.0.0.1'); servers.push(server);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing address');
  const post = (operation: string, body: unknown = {}, origin = 'https://qa.test') => fetch(`http://127.0.0.1:${address.port}/api/pixflow/pairing/${operation}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
  const start = async () => await (await post('start')).json() as { requestId: string; challenge: string };
  const complete = (requestId: string) => post('complete', { requestId, code: 'b'.repeat(64) });
  return { baseUrl: `http://127.0.0.1:${address.port}`, pairingPath, post, start, complete, transport, installed, expire: () => { time += 120; }, switchSite: () => { site = 'https://another.test'; } };
}
it('exchanges only server-side, pins central keys, persists privately and consumes the request once', async () => {
  const qa = await setup(); const started = await qa.start();
  expect(Object.keys(started).sort()).toEqual(['challenge', 'expiresAt', 'requestId', 'siteUrl']);
  const response = await qa.complete(started.requestId);
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true, valid: true });
  const exchange = JSON.parse(String(qa.transport.mock.calls[0]?.[1]?.body)) as { verifier: string };
  expect(createHash('sha256').update(exchange.verifier).digest('base64url')).toBe(started.challenge);
  expect(qa.transport.mock.calls[1]?.[0]).toBe('https://pixflow.dev/api/licensing/v2/keys');
  expect(JSON.parse(readFileSync(qa.pairingPath, 'utf8')).wordpressPairingToken).toBe(configuration.wordpressPairingToken);
  expect(qa.installed).toHaveBeenCalledOnce(); expect((await qa.complete(started.requestId)).status).toBe(403);
});
it('denies unrelated origins and never returns pairing material', async () => {
  const qa = await setup(); const response = await qa.post('start', {}, 'https://unrelated.test');
  expect(response.status).toBe(403); expect(response.headers.get('access-control-allow-origin')).toBeNull(); expect(qa.transport).not.toHaveBeenCalled();
});
it.each(['expiry', 'site-switch'] as const)('rejects %s before contacting WordPress', async mode => {
  const qa = await setup(); const started = await qa.start();
  if (mode === 'expiry') qa.expire(); else qa.switchSite();
  expect((await qa.complete(started.requestId)).status).toBe(403); expect(qa.transport).not.toHaveBeenCalled();
});
it.each([{ wrongIssuer: true }, { reject: true }])('rejects untrusted or previously revoked pairing without writing: %j', async options => {
  const qa = await setup(options); const started = await qa.start();
  expect((await qa.complete(started.requestId)).status).toBe(403); expect(existsSync(qa.pairingPath)).toBe(false); expect(qa.installed).not.toHaveBeenCalled();
});
it('restores previous pairing when grant installation fails', async () => {
  const qa = await setup({ failInstall: true }); writeFileSync(qa.pairingPath, 'previous');
  const started = await qa.start(); expect((await qa.complete(started.requestId)).status).toBe(403);
  expect(readFileSync(qa.pairingPath, 'utf8')).toBe('previous');
});

it('allows the multi-site header on both pairing browser requests', async () => {
 const qa=await setup();
 for(const operation of ['start','complete']) {
  const response=await fetch(`${qa.baseUrl}/api/pixflow/pairing/${operation}`,{method:'OPTIONS',headers:{Origin:'https://qa.test','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-pixflow-site-key'}});
  expect(response.status).toBe(204);
  expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('x-pixflow-site-key');
 }
});

it.each([
  ['CERT_HAS_EXPIRED', 'pairing_certificate_expired'],
  ['ERR_TLS_CERT_ALTNAME_INVALID', 'pairing_certificate_hostname'],
  ['DEPTH_ZERO_SELF_SIGNED_CERT', 'pairing_certificate_untrusted'],
  ['ENOTFOUND', 'pairing_dns_failed'],
  ['ECONNREFUSED', 'pairing_connection_refused'],
  ['UND_ERR_CONNECT_TIMEOUT', 'pairing_timeout'],
])('reports %s without exposing transport details', async (cause, code) => {
  const qa = await setup(); const started = await qa.start();
  qa.transport.mockRejectedValueOnce(Object.assign(new Error('secret transport details'), { cause: { code: cause } }));
  const response = await qa.complete(started.requestId);
  const body = await response.json() as PixflowPairingFailure;
  expect(body.code).toBe(code); expect(body.stage).toBe('wordpress_exchange');
  expect(JSON.stringify(body)).not.toContain('secret'); expect(qa.installed).not.toHaveBeenCalled();
});
it('reports HTTP Local domains before any outbound request', async () => {
  const qa = await setup();
  const response = await qa.post('start', {siteUrl:'http://qa.local'});
  expect((await response.json() as PixflowPairingFailure).code).toBe('pairing_https_required');
  expect(qa.transport).not.toHaveBeenCalled();
});
it('identifies the license-server stage separately from WordPress', async () => {
  const qa = await setup(); const started = await qa.start();
  const original = qa.transport.getMockImplementation()!;
  qa.transport.mockImplementation(async (url, init) => {
    if (String(url).endsWith('/keys')) throw Object.assign(new Error('private'), {cause:{code:'ENOTFOUND'}});
    return original(url, init);
  });
  const body = await (await qa.complete(started.requestId)).json() as PixflowPairingFailure;
  expect(body.code).toBe('pairing_dns_failed'); expect(body.stage).toBe('license_keys');
  expect(qa.installed).not.toHaveBeenCalled();
});
it('reports HTML success responses as invalid data rather than license failures', async () => {
  const qa = await setup(); const started = await qa.start();
  qa.transport.mockResolvedValueOnce(new Response('<html>private login page</html>'));
  const body = await (await qa.complete(started.requestId)).json() as PixflowPairingFailure;
  expect(body.code).toBe('pairing_invalid_response');
  expect(JSON.stringify(body)).not.toContain('private');
});
it('identifies redirects without following or exposing their destination', async () => {
  const qa = await setup(); const started = await qa.start();
  qa.transport.mockResolvedValueOnce(new Response(null, {status:301,headers:{Location:'https://other.test/?token=secret'}}));
  const response = await qa.complete(started.requestId); const body = await response.json() as PixflowPairingFailure;
  expect(body.code).toBe('pairing_redirect'); expect(body.httpStatus).toBe(301);
  expect(qa.transport.mock.calls[0]?.[1]?.redirect).toBe('manual');
  expect(JSON.stringify(body)).not.toContain('secret'); expect(qa.transport).toHaveBeenCalledTimes(1);
});
it('preserves a recognised WordPress failure and handles unknown upstream errors safely', async () => {
  const qa = await setup();
  for (const code of ['license_required','invalid_pairing_request','rest_no_route','unknown']) {
    const started = await qa.start();
    qa.transport.mockResolvedValueOnce(Response.json({code,message:'secret upstream content'}, {status:403}));
    const body = await (await qa.complete(started.requestId)).json() as PixflowPairingFailure;
    expect(body.code).toBe(code === 'unknown' ? 'pairing_http_error' : code);
    expect(body.stage).toBe('wordpress_exchange'); expect(body.httpStatus).toBe(403);
    expect(JSON.stringify(body)).not.toContain('secret');
  }
});

it('pairs Free through the same admin PKCE exchange without contacting licensing or granting Pro', async () => {
  const qa = await setup({free: true});
  const started = await qa.start();
  expect((await qa.complete(started.requestId)).status).toBe(200);
  expect(qa.transport).toHaveBeenCalledTimes(1);
  expect(qa.installed).toHaveBeenCalledWith('', expect.objectContaining({freeAccess:true, keys:{}}));
  expect(JSON.parse(readFileSync(qa.pairingPath, 'utf8'))).toMatchObject({freeAccess:true,wordpressUrl:'https://qa.test'});
});
