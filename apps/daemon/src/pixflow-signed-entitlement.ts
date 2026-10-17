import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';

/** Expected identity comes from authenticated pairing, never from the submitted token. */
export interface EntitlementIdentity {
  issuer: string;
  audience: string;
  installationId: string;
  siteFingerprint: string;
  keyThumbprint: string;
  licenseId: string;
}

export interface SignedEntitlementClaims {
  ver: 2;
  iss: string;
  aud: string;
  sub: string;
  license_id: string;
  installation_id: string;
  site_fingerprint: string;
  scopes: string[];
  iat: number;
  nbf: number;
  exp: number;
  refresh_after: number;
  offline_until: number;
  access_until: number;
  revocation_version: number;
  jti: string;
  cnf: { jkt: string };
}

export interface EntitlementVerification {
  identity: EntitlementIdentity;
  keys: Record<string, JsonWebKey>;
  scope: string;
  now: number;
  /** Set only after an actual transport failure, never after an HTTP denial. */
  networkUnavailable?: boolean;
  denied?: boolean;
  minimumRevocationVersion?: number;
}

function decode(segment: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/u.test(segment)) throw new Error('Invalid encoding');
  const bytes = Buffer.from(segment, 'base64url');
  if (bytes.toString('base64url') !== segment) throw new Error('Noncanonical encoding');
  return JSON.parse(bytes.toString('utf8'));
}

/** Pure verification: no remote requests, status booleans, or locally issued grants. */
export function verifySignedEntitlement(token: string, context: EntitlementVerification): SignedEntitlementClaims | null {
  try {
    if (context.denied || token.length > 16384 || !Number.isSafeInteger(context.now)) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
    const header = decode(headerPart) as Record<string, unknown>;
    if (header.alg !== 'RS256' || header.typ !== 'pixflow-entitlement+jwt'
      || typeof header.kid !== 'string' || header.crit !== undefined
      || !Object.hasOwn(context.keys, header.kid)) return null;
    const jwk = context.keys[header.kid];
    if (!jwk || jwk.kty !== 'RSA' || jwk.d !== undefined) return null;
    const key = createPublicKey({ key: jwk, format: 'jwk' });
    if ((key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) return null;
    if (!/^[A-Za-z0-9_-]+$/u.test(signaturePart)) return null;
    const signature = Buffer.from(signaturePart, 'base64url');
    if (signature.toString('base64url') !== signaturePart
      || !verify('RSA-SHA256', Buffer.from(`${headerPart}.${payloadPart}`), key, signature)) return null;
    const claims = decode(payloadPart) as SignedEntitlementClaims;
    const expected = context.identity;
    if (claims.ver !== 2 || claims.iss !== expected.issuer || claims.aud !== expected.audience
      || !expected.installationId || claims.installation_id !== expected.installationId
      || !expected.siteFingerprint || claims.site_fingerprint !== expected.siteFingerprint
      || !expected.keyThumbprint || claims.cnf?.jkt !== expected.keyThumbprint
      || !expected.licenseId || claims.license_id !== expected.licenseId || claims.sub !== expected.licenseId
      || typeof claims.jti !== 'string' || !claims.jti
      || !Array.isArray(claims.scopes) || !claims.scopes.every(scope => typeof scope === 'string')
      || !claims.scopes.includes(context.scope)) return null;
    for (const field of ['iat', 'nbf', 'exp', 'refresh_after', 'offline_until', 'access_until', 'revocation_version'] as const) {
      if (!Number.isSafeInteger(claims[field]) || claims[field] < 0) return null;
    }
    if (claims.revocation_version < (context.minimumRevocationVersion ?? 0)
      || claims.iat > context.now + 60 || claims.nbf > context.now + 60
      || claims.exp <= claims.iat || claims.exp - claims.iat > 900
      || claims.nbf > claims.exp || claims.refresh_after < claims.iat || claims.refresh_after > claims.exp
      || claims.offline_until < claims.exp || claims.offline_until > claims.iat + 86400
      || claims.offline_until > claims.access_until || context.now >= claims.access_until) return null;
    if (context.now >= claims.exp && (!context.networkUnavailable || context.now >= claims.offline_until)) return null;
    return claims;
  } catch {
    return null;
  }
}
