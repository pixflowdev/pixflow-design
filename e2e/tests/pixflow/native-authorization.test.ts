import { it, expect } from 'vitest';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCentralEntitlementGate } from '../../../apps/daemon/src/pixflow-central-entitlement-gate.js';
import { relay } from '../../../tools/pixflow-design-bridge/native-messaging/src/relay.js';

it('native relay retains production signed-grant expiry, revocation and installation boundaries', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pixflow-native-auth-'));
  const signer = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const installation = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'jwk' });
  const thumb = createHash('sha256').update(JSON.stringify({ e: installation.e, kty: 'RSA', n: installation.n })).digest('base64url');
  const identity = { issuer: 'https://pixflow.dev', audience: 'pixflow-design-bridge', installationId: 'synthetic', siteFingerprint: 'customer.example', keyThumbprint: thumb, licenseId: 'synthetic' };
  const now = 1800000000;
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'pixflow-entitlement+jwt', kid: 'test' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ ver: 2, iss: identity.issuer, aud: identity.audience, sub: 'synthetic', license_id: 'synthetic', installation_id: 'synthetic', site_fingerprint: identity.siteFingerprint, cnf: { jkt: thumb }, jti: 'synthetic', revocation_version: 1, scopes: ['bridge:mutate'], iat: now, nbf: now, exp: now + 900, refresh_after: now + 300, offline_until: now + 86400, access_until: now + 86400 })).toString('base64url');
  const token = `${header}.${payload}.${sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), signer.privateKey).toString('base64url')}`;
  const pairingPath = join(root, 'pairing.json');
  writeFileSync(pairingPath, JSON.stringify({ identity, keys: { test: signer.publicKey.export({ format: 'jwk' }) }, installationPublicKey: installation }));
  let writes = 0;
  try {
    for (const scenario of ['missing', 'valid', 'expired', 'revoked', 'wrong-site'] as const) {
      writeFileSync(join(root, 'pixflow-central-entitlement-v2.json'), JSON.stringify({ token: scenario === 'missing' ? '' : token, denied: scenario === 'revoked', deniedAt: scenario === 'revoked' ? now + 1 : 0, revision: 1, networkUnavailable: false }));
      const gate = createCentralEntitlementGate(root, pairingPath, () => scenario === 'expired' ? now + 901 : now + 1, () => scenario === 'wrong-site' ? 'https://other.example' : 'https://customer.example');
      // Node HTTP adapter exercises the actual production gate and signed verifier.
      const server = createServer((req, res) => {
        const request = Object.assign(req, { path: '/projects' });
        const response = Object.assign(res, { status(code: number) { res.statusCode = code; return response; }, json(body: unknown) { res.end(JSON.stringify(body)); return response; }, vary() {} });
        void gate.middleware(request as Parameters<typeof gate.middleware>[0], response as unknown as Parameters<typeof gate.middleware>[1], () => { writes++; res.end('{"ok":true}'); });
      });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const address = server.address(); if (!address || typeof address === 'string') throw Error('Missing fixture port');
      const base = `http://127.0.0.1:${address.port}`, messages: any[] = [];
      try {
        await relay({ id: 'auth', origin: 'https://customer.example', url: base + '/api/projects', method: 'POST', body: '{}' }, { extensionOrigin: `chrome-extension://${'a'.repeat(32)}/`, bridge: base, sites: ['https://customer.example'] }, new AbortController().signal, async message => { messages.push(message); });
        expect(messages[0].status, scenario).toBe(scenario === 'valid' ? 200 : 403);
        expect(messages.at(-1).type).toBe('end');
      } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    }
    expect(writes).toBe(1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
