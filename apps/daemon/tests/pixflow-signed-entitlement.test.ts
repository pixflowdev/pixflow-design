import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifySignedEntitlement, type SignedEntitlementClaims, type EntitlementVerification } from '../src/pixflow-signed-entitlement.js';

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const now = 1800000000;
const claims: SignedEntitlementClaims = {
  ver: 2, iss: 'https://preview.pixflow.dev', aud: 'pixflow-design-bridge',
  sub: 'license', license_id: 'license', installation_id: 'installation', site_fingerprint: 'site',
  cnf: { jkt: 'installation-key' }, scopes: ['bridge:mutate'], jti: 'grant',
  iat: now, nbf: now, exp: now + 900, refresh_after: now + 300,
  offline_until: now + 86400, access_until: now + 86400, revocation_version: 3,
};
const context: EntitlementVerification = {
  identity: { issuer: claims.iss, audience: claims.aud, installationId: 'installation', siteFingerprint: 'site', keyThumbprint: 'installation-key', licenseId: 'license' },
  keys: { staging: pair.publicKey.export({ format: 'jwk' }) }, scope: 'bridge:mutate', now,
};
function token(changes: Partial<SignedEntitlementClaims> = {}, headerChanges: Record<string, unknown> = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'pixflow-entitlement+jwt', kid: 'staging', ...headerChanges })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ ...claims, ...changes })).toString('base64url');
  return `${header}.${payload}.${sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), pair.privateKey).toString('base64url')}`;
}

describe('central signed entitlement verification', () => {
  it('accepts the authorized bound grant without a network call', () => {
    expect(verifySignedEntitlement(token(), context)).toEqual(claims);
  });
  it.each([
    { iss: 'https://wrong.example' }, { aud: 'pixflow-design-wordpress-local' },
    { installation_id: 'other' }, { site_fingerprint: 'other' }, { cnf: { jkt: 'other' } },
    { license_id: 'other' }, { sub: 'other' }, { scopes: ['templates:download'] },
    { ver: 1 }, { exp: now + 901 }, { iat: now + 61 }, { nbf: now + 61 },
    { offline_until: now + 86401 }, { access_until: now + 500 }, { revocation_version: -1 },
  ])('rejects wrong claims %j', change => {
    expect(verifySignedEntitlement(token(change as Partial<SignedEntitlementClaims>), context)).toBeNull();
  });
  it.each([{ alg: 'HS256' }, { alg: 'none' }, { kid: 'unknown' }, { typ: 'JWT' }, { crit: ['custom'] }])('rejects header %j', header => {
    expect(verifySignedEntitlement(token({}, header), context)).toBeNull();
  });
  it('rejects tampering, legacy HMAC and trailing segments', () => {
    const valid = token();
    expect(verifySignedEntitlement(valid.replace(/.$/u, '!'), context)).toBeNull();
    expect(verifySignedEntitlement(`${valid}.extra`, context)).toBeNull();
    expect(verifySignedEntitlement('payload.shared-hmac', context)).toBeNull();
  });
  it('requires actual network failure for bounded offline use', () => {
    expect(verifySignedEntitlement(token(), { ...context, now: now + 900 })).toBeNull();
    expect(verifySignedEntitlement(token(), { ...context, now: now + 900, networkUnavailable: true })).not.toBeNull();
    expect(verifySignedEntitlement(token(), { ...context, now: now + 86400, networkUnavailable: true })).toBeNull();
  });
  it('never overrides an explicit denial or newer revocation version', () => {
    expect(verifySignedEntitlement(token(), { ...context, denied: true, networkUnavailable: true })).toBeNull();
    expect(verifySignedEntitlement(token(), { ...context, minimumRevocationVersion: 4 })).toBeNull();
  });
});
