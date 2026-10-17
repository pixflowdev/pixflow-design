import { createHash, randomBytes, type JsonWebKey } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import type { PixflowPairingStart, PixflowPairingComplete } from '@open-design/contracts';
import { verifySignedEntitlement, type EntitlementIdentity } from './pixflow-signed-entitlement.js';
import { licenseKeyRequest } from './pixflow-license-transport.js';
import { PIXFLOW_PAIRING_ERRORS, pixflowPairingErrorCode, type PixflowPairingErrorCode, type PixflowPairingStage, type PixflowPairingFailure } from '@open-design/contracts';

/** Classify structured causes without returning transport text or credentials. */
function transportFailure(error: unknown): PixflowPairingErrorCode {
  const codes = new Set<string>();
  const visit = (value: unknown, depth = 0): void => {
    if (!value || typeof value !== 'object' || depth > 5) return;
    const item = value as {code?: string; name?: string; cause?: unknown; errors?: unknown[]};
    if (item.code) codes.add(item.code); if (item.name) codes.add(item.name);
    visit(item.cause, depth + 1);
    if (Array.isArray(item.errors)) for (const nested of item.errors) visit(nested, depth + 1);
  };
  visit(error);
  if (codes.has('CERT_HAS_EXPIRED')) return 'pairing_certificate_expired';
  if (codes.has('ERR_TLS_CERT_ALTNAME_INVALID')) return 'pairing_certificate_hostname';
  if (['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','CERT_NOT_YET_VALID'].some(code => codes.has(code))) return 'pairing_certificate_untrusted';
  if (['ENOTFOUND','EAI_AGAIN'].some(code => codes.has(code))) return 'pairing_dns_failed';
  if (codes.has('ECONNREFUSED')) return 'pairing_connection_refused';
  if (['TimeoutError','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'].some(code => codes.has(code))) return 'pairing_timeout';
  return 'pairing_network_error';
}
class PairingError extends Error {
  constructor(readonly code: PixflowPairingErrorCode) { super(code); }
}

export interface BridgePairingConfiguration {
  freeAccess?: boolean;
  identity: EntitlementIdentity;
  keys: Record<string, JsonWebKey>;
  installationPublicKey: JsonWebKey;
  wordpressUrl?: string;
  wordpressPairingToken?: string;
}

type Pending = { verifier: string; site: string; issuer: string; expires: number };
export function registerBridgePairing(app: Express, options: {
  pairingPath: string;
  site: () => string;
  issuer: () => string;
  installed: (token: string, configuration: BridgePairingConfiguration) => void;
  accepts?: (token: string, configuration: BridgePairingConfiguration) => boolean;
  clock?: () => number;
  fetch?: typeof fetch;
}) {
  const clock = options.clock ?? (() => Math.floor(Date.now() / 1000));
  const transport = options.fetch ?? fetch;
  const pending = new Map<string, Pending>();
  const normalize = (raw: string) => {
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash || !['http:', 'https:'].includes(url.protocol)) throw new PairingError('pairing_invalid_site');
    if (url.protocol === 'http:' && !['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw new PairingError('pairing_https_required');
    return url.href.replace(/\/+$/u, '');
  };
  const deny = (res: Response, code: PixflowPairingErrorCode = 'pairing_request_denied', stage: PixflowPairingStage = 'bridge_start', httpStatus?: number) => {
    const body: PixflowPairingFailure = {ok:false, code, error:PIXFLOW_PAIRING_ERRORS[code], stage, ...(httpStatus ? {httpStatus} : {})};
    return res.status(code === 'pairing_rate_limit' ? 429 : 403).json(body);
  };
  const rejectResponse = async (res: Response, response: globalThis.Response, stage: PixflowPairingStage) => {
    if (response.status >= 300 && response.status < 400) return deny(res, 'pairing_redirect', stage, response.status);
    const body = await response.json().catch(() => null) as {code?:unknown} | null;
    return deny(res, pixflowPairingErrorCode(body?.code) ?? 'pairing_http_error', stage, response.status);
  };
  const localRequest = (req: Request, res: Response): boolean => {
    try {
      if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) return false;
      if (!['127.0.0.1','localhost','[::1]'].includes(new URL(`http://${req.headers.host}`).hostname)) return false;
      const origin = req.headers.origin;
      if (origin && origin !== new URL(options.site()).origin) return false;
      if (origin) {
        res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Pixflow-Site-Key');
        if (req.headers['access-control-request-private-network'] === 'true') res.setHeader('Access-Control-Allow-Private-Network','true');
      }
      res.setHeader('Cache-Control', 'no-store');
      return true;
    } catch { return false; }
  };
  for (const suffix of ['start','complete']) app.options(`/api/pixflow/pairing/${suffix}`, (req, res) => {
    if (!localRequest(req,res)) return deny(res);
    return res.status(204).end();
  });
  app.post('/api/pixflow/pairing/start', (req,res) => {
    if (!localRequest(req,res)) return deny(res);
    for (const [id, item] of pending) if (item.expires <= clock()) pending.delete(id);
    if (pending.size >= 8) return deny(res, 'pairing_rate_limit');
    try {
      const site = normalize(options.site());
      if (req.body?.siteUrl && normalize(req.body.siteUrl) !== site) return deny(res, 'pairing_site_mismatch');
      const issuer = options.issuer();
      if (!['https://pixflow.dev','https://preview.pixflow.dev'].includes(issuer)) return deny(res, 'pairing_issuer_invalid');
      const requestId = randomBytes(24).toString('hex');
      const verifier = randomBytes(48).toString('base64url');
      const expiresAt = clock()+120;
      pending.set(requestId,{site,verifier,issuer,expires:expiresAt});
      const result: PixflowPairingStart = {requestId,siteUrl:site,expiresAt,challenge:createHash('sha256').update(verifier).digest('base64url')};
      return res.json(result);
    } catch (error) { return deny(res, error instanceof PairingError ? error.code : 'pairing_invalid_site'); }
  });
  app.post('/api/pixflow/pairing/complete', async (req,res) => {
    if (!localRequest(req,res)) return deny(res);
    const body = (req.body ?? {}) as Partial<PixflowPairingComplete>;
    const record = typeof body.requestId === 'string' ? pending.get(body.requestId) : undefined;
    if (!record) return deny(res, 'pairing_expired', 'wordpress_exchange');
    if (typeof body.code !== 'string' || !/^[a-f0-9]{64}$/u.test(body.code)) return deny(res, 'pairing_invalid_code', 'wordpress_exchange');
    pending.delete(body.requestId!);
    let stage: PixflowPairingStage = 'wordpress_exchange';
    try {
      if (record.expires <= clock()) return deny(res, 'pairing_expired', stage);
      if (record.site !== normalize(options.site()) || record.issuer !== options.issuer()) return deny(res, 'pairing_site_changed', stage);
      const response = await transport(`${record.site}/?rest_route=/pixflow-design/v1/license/pairing/exchange`, {
        method:'POST',redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json'},
        body:JSON.stringify({code:body.code,verifier:record.verifier}),
      });
      if (!response.ok) return rejectResponse(res, response, stage);
      const exchange = await response.json().catch(() => { throw new PairingError('pairing_invalid_response'); }) as {configuration:BridgePairingConfiguration;token:string};
      const config = exchange?.configuration;
      if (!config?.identity || !config.installationPublicKey || typeof exchange.token !== 'string') return deny(res, 'pairing_invalid_response', stage);
      stage = 'verification';
      const site = new URL(record.site);
      const identity = config.identity;
      if (identity.issuer !== record.issuer || identity.audience !== 'pixflow-design-bridge'
        || identity.siteFingerprint !== site.host.toLowerCase()+site.pathname.replace(/\/+$/u,'')
        || normalize(config.wordpressUrl ?? '') !== record.site || !/^pfwp_\d+_[A-Za-z0-9_-]+$/u.test(config.wordpressPairingToken ?? '')) return deny(res, 'pairing_identity_invalid', stage);
      const key = config.installationPublicKey;
      if (key.kty !== 'RSA' || key.d || !key.e || !key.n
        || createHash('sha256').update(JSON.stringify({e:key.e,kty:'RSA',n:key.n})).digest('base64url') !== identity.keyThumbprint) return deny(res, 'pairing_key_invalid', stage);
      // Free is authorized by this server-to-server, PKCE-protected exchange.
      // It never grants Pro scopes. Only the pinned authority can do that.
      const freeAccess = config.freeAccess === true;
      let keys: Record<string, JsonWebKey> = {};
      let token = exchange.token;
      if (token) {
      // A selected WP admin binds identity; only the pinned central authority grants permission.
      stage = 'license_keys';
      const keyRequest = licenseKeyRequest(record.issuer);
      const keyResponse = await transport(keyRequest.url, {...keyRequest.options, redirect:'manual', signal:AbortSignal.timeout(20000)});
      if (!keyResponse.ok) return rejectResponse(res, keyResponse, stage);
      const jwks = await keyResponse.json().catch(() => { throw new PairingError('pairing_invalid_response'); }) as {keys:Array<JsonWebKey & {kid?:string;alg?:string;use?:string}>};
      if (!jwks || !Array.isArray(jwks.keys)) return deny(res, 'pairing_invalid_response', stage);
      stage = 'verification';
      keys = {};
      for (const publicKey of jwks.keys ?? []) if (publicKey.kid && publicKey.kty==='RSA' && !publicKey.d && publicKey.alg==='RS256' && publicKey.use==='sig') keys[publicKey.kid]=publicKey;
      if (record.site !== normalize(options.site()) || record.issuer !== options.issuer()) return deny(res, 'pairing_site_changed', stage);
      if (!verifySignedEntitlement(token,{identity,keys,scope:'bridge:mutate',now:clock()})) return deny(res, 'pairing_signature_invalid', stage);
      } else if (!freeAccess) return deny(res, 'pairing_signature_invalid', stage);
      if (record.site !== normalize(options.site()) || record.issuer !== options.issuer()) return deny(res, 'pairing_site_changed', stage);
      // Whitelist the persisted fields; never persist arbitrary exchange fields.
      const paired:BridgePairingConfiguration={identity,keys,installationPublicKey:key,wordpressUrl:record.site,wordpressPairingToken:config.wordpressPairingToken!, ...(freeAccess ? {freeAccess: true} : {})};
      if (options.accepts && !options.accepts(exchange.token, paired)) return deny(res, 'pairing_grant_rejected', stage);
      stage = 'save';
      fs.mkdirSync(path.dirname(options.pairingPath),{recursive:true});
      const temporary=`${options.pairingPath}.${randomBytes(6).toString('hex')}.tmp`;
      const previous = fs.existsSync(options.pairingPath) ? fs.readFileSync(options.pairingPath) : null;
      try {
        fs.writeFileSync(temporary,JSON.stringify(paired),{mode:0o600});
        fs.renameSync(temporary,options.pairingPath);
        try { options.installed(exchange.token,paired); }
        catch (error) {
          if (previous) {
            fs.writeFileSync(temporary,previous,{mode:0o600});
            fs.renameSync(temporary,options.pairingPath);
          } else fs.unlinkSync(options.pairingPath);
          throw error;
        }
      } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
      return res.json({ok:true,valid:true});
    } catch (error) { return deny(res, error instanceof PairingError ? error.code : stage === 'save' ? 'pairing_save_failed' : stage === 'verification' ? 'pairing_invalid_response' : transportFailure(error), stage); }
  });
}
