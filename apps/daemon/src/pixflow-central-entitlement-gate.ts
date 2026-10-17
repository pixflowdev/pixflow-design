import { randomBytes, createPublicKey, createHash, verify, type JsonWebKey } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response, NextFunction } from 'express';
import type { PixflowBridgeFeatureGrant } from '@open-design/contracts';
import { verifySignedEntitlement, type EntitlementIdentity } from './pixflow-signed-entitlement.js';
import { isPixflowLicenseEntitlementRequired } from './pixflow-license-entitlement.js';
import { registerBridgePairing } from './pixflow-bridge-pairing.js';
import { licenseKeyRequest } from './pixflow-license-transport.js';

interface Pairing {
  freeAccess?: boolean;
  identity: EntitlementIdentity;
  keys: Record<string, JsonWebKey>;
  installationPublicKey: JsonWebKey;
  wordpressUrl?: string;
  wordpressPairingToken?: string;
}
interface State {
  freeUntil: number;
  token: string;
  denied: boolean;
  deniedAt: number;
  networkUnavailable: boolean;
  revision: number;
}
const empty = (): State => ({ freeUntil: 0, token: '', denied: true, deniedAt: 0, networkUnavailable: false, revision: 0 });

export function centralEntitlementsEnabled(env = process.env): boolean {
  return isPixflowLicenseEntitlementRequired(env) || env.PIXFLOW_DESIGN_CENTRAL_ENTITLEMENTS_V2 === '1';
}

/** Paired installation config is provisioned outside browser requests; missing config fails closed. */
export function createCentralEntitlementGate(dataDir: string, pairingPath: string, clock = () => Math.floor(Date.now() / 1000), activeSiteUrl?: () => string) {
  pairingPath ||= path.join(dataDir, 'pixflow-installation-pairing.json');
  const file = path.join(dataDir, 'pixflow-central-entitlement-v2.json');
  let state = empty();
  // Module availability is short-lived and installation-bound. Never restore it
  // from disk: a licence alone does not prove the Pro add-on is still active.
  let features: { ids: string[]; until: number; identity: string } | undefined;
  try { state = { ...empty(), ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* No grant. */ }
  const challenges = new Map<string, number>();
  const readPairing = (): Pairing | null => {
    try {
      const pairing = JSON.parse(fs.readFileSync(pairingPath, 'utf8')) as Pairing;
      // The protected pairing file pins the authority, never the incoming JWT.
      if (!['https://pixflow.dev', 'https://preview.pixflow.dev'].includes(pairing.identity.issuer)
        || pairing.identity.audience !== 'pixflow-design-bridge') return null;
      if (process.env.PIXFLOW_DESIGN_LICENSE_AUTHORITY && pairing.identity.issuer !== process.env.PIXFLOW_DESIGN_LICENSE_AUTHORITY) return null;
      const key = pairing.installationPublicKey;
      if (key.kty !== 'RSA' || key.d || !key.e || !key.n) return null;
      const thumbprint = createHash('sha256').update(JSON.stringify({ e: key.e, kty: 'RSA', n: key.n })).digest('base64url');
      if (thumbprint !== pairing.identity.keyThumbprint) return null;
      if (activeSiteUrl) {
        const active = new URL(activeSiteUrl());
        const fingerprint = active.host.toLowerCase() + active.pathname.replace(/\/+$/u, '');
        if (fingerprint !== pairing.identity.siteFingerprint) return null;
      }
      return pairing;
    } catch { return null; }
  };
  const claims = (scope: string) => {
    const pairing = readPairing();
    if (!pairing) return null;
    const grant = verifySignedEntitlement(state.token, {
      identity: pairing.identity, keys: pairing.keys, scope, now: clock(),
      denied: state.denied, networkUnavailable: state.networkUnavailable, minimumRevocationVersion: state.revision,
    });
    return grant && grant.iat > state.deniedAt ? grant : null;
  };
  const persist = () => {
    fs.mkdirSync(dataDir, { recursive: true });
    const temporary = `${file}.${randomBytes(6).toString('hex')}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temporary, file);
  };
  const local = (req: Request) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
  const freeReady = () => readPairing()?.freeAccess === true && state.freeUntil > clock();
  const allowsFeature = (id: string) => Boolean(features && features.until > clock()
    && features.identity === JSON.stringify(readPairing()?.identity)
    && features.ids.includes(id) && claims('bridge:mutate'));
  const status = () => {
    const grant = claims('bridge:mutate');
    return { valid: Boolean(grant) || freeReady(), free_access: freeReady(), pro_valid: Boolean(grant), grace: Boolean(grant && clock() >= grant.exp), expires_at: grant?.exp ?? 0 };
  };
  const error = (res: Response, code: string) => res.status(403).json({ error: { code, message: 'A current installation-bound Pixflow entitlement is required.' } });
  /** Bootstrap responses precede API CORS; the active site must be able to read them to recover pairing. */
  const exposeToActiveSite = (req: Request, res: Response) => {
    res.vary('Origin');
    try {
      const origin = new URL(activeSiteUrl?.() ?? '').origin;
      if (req.headers.origin === origin) res.setHeader('Access-Control-Allow-Origin', origin);
    } catch { /* No active site has been selected. */ }
  };
  let refreshing: Promise<void> | undefined;
  const refresh = (): Promise<void> => {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const pairing = readPairing();
      if (!pairing?.wordpressUrl || !pairing.wordpressPairingToken) return;
      const url = new URL(pairing.wordpressUrl);
      if (url.username || url.password || url.search || url.hash
        || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) return;
      const before = state;
      let transportFailed = false;
      let authenticatedFreeUntil = 0;
      try {
        const response = await fetch(`${url.href.replace(/\/$/u, '')}/?rest_route=/pixflow-design/v1/license/central-bridge`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
          headers: { Authorization: `Bearer ${pairing.wordpressPairingToken}`, Accept: 'application/json' },
        }).catch(error => { transportFailed = true; throw error; });
        if (state !== before) return;
        if (!response.ok) {
          if ([408, 429].includes(response.status) || response.status >= 500) {
            state = { ...state, networkUnavailable: true }; persist(); return;
          }
          state = { ...empty(), deniedAt: clock(), revision: state.revision }; persist(); return;
        }
        const body = await response.json() as PixflowBridgeFeatureGrant;
        features = { ids: Array.isArray(body.features) ? body.features.filter((id): id is string => typeof id === 'string') : [], until: clock() + 300, identity: JSON.stringify(pairing.identity) };
        // A revoked credential is rejected above. A missing/expired Pro licence
        // still allows a short, renewable Free lease from the paired WordPress site.
        const freeUntil = pairing.freeAccess === true && body.free_access === true ? clock() + 300 : 0;
        authenticatedFreeUntil = freeUntil;
        if (!body.token && freeUntil) {
          state = { ...empty(), freeUntil, deniedAt: state.deniedAt, revision: state.revision }; persist(); return;
        }
        // Verification keys come directly from the pinned authority, not the WordPress installation.
        const keyRequest = licenseKeyRequest(pairing.identity.issuer);
        const keyResponse = await fetch(keyRequest.url, keyRequest.options)
          .catch(error => { transportFailed = true; throw error; });
        if (!keyResponse.ok) {
          if (state === before) {
            state = [408, 429].includes(keyResponse.status) || keyResponse.status >= 500
              ? { ...state, freeUntil, networkUnavailable: true }
              : { ...empty(), freeUntil, deniedAt: clock(), revision: state.revision };
            persist();
          }
          return;
        }
        const jwks = await keyResponse.json() as { keys?: Array<JsonWebKey & { kid?: string; alg?: string; use?: string }> };
        const keys: Record<string, JsonWebKey> = {};
        for (const key of jwks.keys ?? []) if (key.kid && key.kty === 'RSA' && !key.d && key.alg === 'RS256' && key.use === 'sig') keys[key.kid] = key;
        const grant = verifySignedEntitlement(body.token ?? '', { identity: pairing.identity, keys, scope: 'bridge:mutate', now: clock(),
          minimumRevocationVersion: state.revision, networkUnavailable: body.network_unavailable === true });
        if (state !== before) return;
        if (!grant || grant.iat <= state.deniedAt) { state = { ...empty(), freeUntil, deniedAt: clock(), revision: state.revision }; persist(); return; }
        // Persist public rotation keys for subsequent local verification and restart.
        const currentPairing = readPairing();
        if (JSON.stringify(currentPairing?.identity) !== JSON.stringify(pairing.identity)) return;
        fs.writeFileSync(pairingPath, JSON.stringify({ ...pairing, keys }), { mode: 0o600 });
        state = { freeUntil, token: body.token!, denied: false, deniedAt: state.deniedAt, networkUnavailable: body.network_unavailable === true, revision: grant.revocation_version };
        persist();
      } catch {
        if (state === before) {
          state = transportFailed
            ? { ...state, freeUntil: authenticatedFreeUntil || state.freeUntil, networkUnavailable: true }
            : { ...empty(), freeUntil: authenticatedFreeUntil, deniedAt: clock(), revision: state.revision };
          persist();
        }
      }
    })().finally(() => { refreshing = undefined; });
    return refreshing;
  };
  return {
    refresh,
    allowsFeature,
    startRefresh() {
      void refresh();
      const timer = setInterval(() => {
        const grant = claims('bridge:mutate');
        if (!grant || clock() >= grant.refresh_after || !features || features.until <= clock() + 60) void refresh();
      }, 60000);
      timer.unref();
      return () => clearInterval(timer);
    },
    registerRoutes(app: Express) {
      registerBridgePairing(app, {
        pairingPath, clock, site: () => activeSiteUrl?.() ?? '',
        // New pairing follows the configured authority. An old QA pairing must
        // not silently keep a production install pinned to preview forever.
        issuer: () => process.env.PIXFLOW_DESIGN_LICENSE_AUTHORITY || 'https://pixflow.dev',
        accepts: (token, configuration) => {
          if (!token && configuration.freeAccess === true) return true;
          const same = JSON.stringify(readPairing()?.identity) === JSON.stringify(configuration.identity);
          const grant = verifySignedEntitlement(token, {identity:configuration.identity,keys:configuration.keys,scope:'bridge:mutate',now:clock(),minimumRevocationVersion:same ? state.revision : 0});
          return Boolean(grant && (!same || grant.iat > state.deniedAt));
        },
        installed: (token, configuration) => {
          const grant = verifySignedEntitlement(token, {identity:configuration.identity,keys:configuration.keys,scope:'bridge:mutate',now:clock()});
          if (!grant && !(configuration.freeAccess === true && !token)) throw new Error('Invalid pairing grant');
            const previous = state;
            state = {token, freeUntil:configuration.freeAccess === true ? clock() + 300 : 0, denied:!grant, deniedAt:0, networkUnavailable:false, revision:grant?.revocation_version ?? 0};
            try { persist(); } catch (error) { state = previous; throw error; }
        },
      });
      app.get('/api/pixflow/central-entitlement/challenge', (req, res) => {
        if (!local(req)) return error(res, 'LOCAL_PAIRING_REQUIRED');
        for (const [key, expiry] of challenges) if (expiry <= clock()) challenges.delete(key);
        if (challenges.size >= 64) return res.status(429).json({ error: { code: 'CHALLENGE_LIMIT' } });
        const nonce = randomBytes(32).toString('base64url');
        challenges.set(nonce, clock() + 60);
        return res.json({ nonce, expires_at: clock() + 60 });
      });
      app.get('/api/pixflow/central-entitlement', (req, res) => {
        // This bootstrap route precedes general API CORS handling. Only the
        // currently paired WordPress origin may read its credential-free status.
        exposeToActiveSite(req, res);
        return res.json(status());
      });
      app.post('/api/pixflow/central-entitlement', (req, res) => {
        const pairing = readPairing();
        const { nonce, payload, signature } = req.body ?? {};
        if (!local(req) || !pairing || typeof nonce !== 'string' || typeof payload !== 'string'
          || payload.length > 24000 || typeof signature !== 'string') return error(res, 'INVALID_INSTALLATION_PROOF');
        const expiry = challenges.get(nonce) ?? 0;
        challenges.delete(nonce);
        if (expiry <= clock()) return error(res, 'EXPIRED_INSTALLATION_CHALLENGE');
        try {
          const key = createPublicKey({ key: pairing.installationPublicKey, format: 'jwk' });
          const message = `pixflow-bridge-entitlement-v2\n${nonce}\n${payload}`;
          if (!verify('RSA-SHA256', Buffer.from(message), key, Buffer.from(signature, 'base64url'))) return error(res, 'INVALID_INSTALLATION_PROOF');
          const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { operation: string; token?: string };
          if (body.operation === 'deny') {
            // Licence reset revokes Pro, not the independently authenticated
            // WordPress pairing. Its Free lease still expires/rechecks normally.
            state = { ...empty(), freeUntil: state.freeUntil, deniedAt: clock(), revision: state.revision };
          } else if (body.operation === 'network-unavailable') {
            state.networkUnavailable = true;
          } else if (body.operation === 'install' && typeof body.token === 'string') {
            const grant = verifySignedEntitlement(body.token, { identity: pairing.identity, keys: pairing.keys,
              scope: 'bridge:mutate', now: clock(), minimumRevocationVersion: state.revision });
            if (!grant || grant.iat <= state.deniedAt) return error(res, 'INVALID_CENTRAL_ENTITLEMENT');
            state = { freeUntil: state.freeUntil, token: body.token, denied: false, deniedAt: state.deniedAt, networkUnavailable: false, revision: grant.revocation_version };
          } else return error(res, 'INVALID_ENTITLEMENT_OPERATION');
          persist();
          return res.json(status());
        } catch { return error(res, 'INVALID_INSTALLATION_PROOF'); }
      });
    },
    async middleware(req: Request, res: Response, next: NextFunction) {
      if (req.method === 'OPTIONS') return next();
      const route = req.path.replace(/\/+$/u, '') || '/';
      // Public probes and pairing only. GET/HEAD are otherwise authorized like other methods.
      if (['/health', '/ready', '/version', '/pixflow/site-context', '/pixflow/site-context/switch', '/daemon/shutdown'].includes(route)) return next();
      if (/^\/skills(?:\/|$)/u.test(route) && !['GET', 'HEAD'].includes(req.method)) {
        await refresh();
        if (!allowsFeature('custom-skills')) return error(res, 'PIXFLOW_CUSTOM_SKILLS_PRO_REQUIRED');
      }
      const scope = /(?:chat|generate|convert|stream)/u.test(route) ? 'ai:generate'
        : /(?:terminal|cli)/u.test(route) ? 'cli:execute'
          : /(?:mcp)/u.test(route) ? 'mcp:execute' : 'bridge:mutate';
      const grant = claims(scope);
      // Premium endpoints still require central grants; feature-specific handlers
      // also verify that Pro is active on this site. Text runs/queues remain Free.
      const premium = /^\/(?:mcp|design-systems|tools\/design-systems)(?:\/|$)/u.test(route);
      if (!premium && freeReady()) return next();
      if (!grant) {
        exposeToActiveSite(req, res);
        return error(res, 'PIXFLOW_CENTRAL_ENTITLEMENT_REQUIRED');
      }
      if (clock() >= grant.exp) res.setHeader('X-Pixflow-License-Grace', 'true');
      return next();
    },
  };
}
