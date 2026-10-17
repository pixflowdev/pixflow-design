import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express, NextFunction, Request, Response } from 'express';

type PixflowBridgeEntitlementPayload = {
  version: number;
  product: string;
  site_url?: string;
  home_url?: string;
  site_host?: string;
  site_fingerprint?: string;
  license_id?: string;
  purchase_id?: string;
  plugin_version?: string;
  issued_at?: string;
  expires_at?: string;
  grace_expires_at?: string;
  expires_at_unix: number;
  grace_expires_at_unix: number;
};

type StoredEntitlement = {
  token: string;
  payload: PixflowBridgeEntitlementPayload;
  updatedAt: string;
};

const ENTITLEMENT_FILE = 'pixflow-license-entitlement.json';
const PRODUCT_SLUG = 'pixflow-design';
// Pixflow-owned: mirrors the WordPress signer. This is a practical local
// entitlement guard for the bridge, not a substitute for server validation.
const SIGNING_KEY = 'pixflow-design-local-entitlement-v1';

export function isPixflowLicenseEntitlementRequired(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(
    String(env.PIXFLOW_DESIGN_BRIDGE_DATA_DIR ?? '').trim()
    || String(env.PIXFLOW_DESIGN_BRIDGE_INSTALL_ROOT ?? '').trim()
    || String(env.PIXFLOW_DESIGN_BRIDGE_CLI ?? '').trim()
    || String(env.PIXFLOW_DESIGN_BRIDGE_VERSION ?? '').trim(),
  );
}

function entitlementPath(dataDir: string): string {
  return path.join(dataDir, ENTITLEMENT_FILE);
}

function jsonResponse(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function decodeBase64UrlJson(segment: string): PixflowBridgeEntitlementPayload | null {
  try {
    const json = Buffer.from(segment, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<PixflowBridgeEntitlementPayload>;
    if (
      parsed.version !== 1
      || parsed.product !== PRODUCT_SLUG
      || typeof parsed.expires_at_unix !== 'number'
      || typeof parsed.grace_expires_at_unix !== 'number'
    ) {
      return null;
    }
    return parsed as PixflowBridgeEntitlementPayload;
  } catch {
    return null;
  }
}

function verifyToken(token: string): PixflowBridgeEntitlementPayload | null {
  const [payloadSegment, signature] = token.split('.');
  if (!payloadSegment || !signature || token.split('.').length !== 2) return null;

  const expected = crypto.createHmac('sha256', SIGNING_KEY).update(payloadSegment).digest('hex');
  const actualBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  const payload = decodeBase64UrlJson(payloadSegment);
  if (!payload) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.grace_expires_at_unix <= nowSeconds) return null;
  if (payload.expires_at_unix > payload.grace_expires_at_unix) return null;

  return payload;
}

function isWithinGrace(payload: PixflowBridgeEntitlementPayload): boolean {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return nowSeconds > payload.expires_at_unix && nowSeconds <= payload.grace_expires_at_unix;
}

function readStoredEntitlement(filePath: string): StoredEntitlement | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoredEntitlement>;
    if (typeof parsed.token !== 'string') return null;
    const payload = verifyToken(parsed.token);
    if (!payload) return null;
    return {
      token: parsed.token,
      payload,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return null;
  }
}

function shouldBypassEntitlement(req: Request): boolean {
  if (req.method === 'OPTIONS') return true;
  if (req.method === 'GET' || req.method === 'HEAD') return true;

  const requestPath = req.path.replace(/\/+$/u, '') || '/';
  const openMutatingPaths = new Set([
    '/active',
    '/app-config',
    '/pixflow/license-entitlement',
  ]);
  if (openMutatingPaths.has(requestPath)) return true;

  // Pixflow-owned: keep telemetry/config housekeeping out of the license
  // gate; actual workspace mutations and generation requests stay protected.
  if (requestPath.startsWith('/observability/')) return true;

  return false;
}

export function createPixflowLicenseEntitlementGate(dataDir: string) {
  const filePath = entitlementPath(dataDir);
  let stored = readStoredEntitlement(filePath);

  const persist = async (token: string, payload: PixflowBridgeEntitlementPayload) => {
    stored = { token, payload, updatedAt: new Date().toISOString() };
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(stored, null, 2), 'utf8');
  };

  const clear = async () => {
    stored = null;
    await fs.promises.rm(filePath, { force: true }).catch(() => {});
  };

  const statusPayload = () => {
    const payload = stored?.payload ?? null;
    return {
      valid: Boolean(payload),
      grace: payload ? isWithinGrace(payload) : false,
      expires_at: payload?.expires_at ?? '',
      grace_expires_at: payload?.grace_expires_at ?? '',
      plugin_version: payload?.plugin_version ?? '',
      site_host: payload?.site_host ?? '',
      updated_at: stored?.updatedAt ?? '',
    };
  };

  return {
    registerRoutes(app: Express) {
      // Pixflow-owned: WordPress installs/refreshes the bridge entitlement
      // after it validates the user's Pixflow license.
      app.get('/api/pixflow/license-entitlement', (_req, res) => {
        res.json(statusPayload());
      });

      app.post('/api/pixflow/license-entitlement', async (req, res) => {
        const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
        const payload = token ? verifyToken(token) : null;
        if (!payload) {
          return jsonResponse(res, 403, 'PIXFLOW_LICENSE_ENTITLEMENT_INVALID', 'Pixflow license entitlement is invalid or expired.');
        }
        await persist(token, payload);
        return res.json(statusPayload());
      });

      app.delete('/api/pixflow/license-entitlement', async (_req, res) => {
        await clear();
        return res.json(statusPayload());
      });
    },

    middleware(req: Request, res: Response, next: NextFunction) {
      if (shouldBypassEntitlement(req)) return next();

      if (!stored) {
        return jsonResponse(res, 402, 'PIXFLOW_LICENSE_REQUIRED', 'Validate your Pixflow Design license to continue.');
      }

      const payload = verifyToken(stored.token);
      if (!payload) {
        stored = null;
        return jsonResponse(res, 402, 'PIXFLOW_LICENSE_EXPIRED', 'Your Pixflow Design license entitlement has expired. Revalidate your license to continue.');
      }

      stored.payload = payload;
      if (isWithinGrace(payload)) {
        res.setHeader('X-Pixflow-License-Grace', 'true');
      }
      return next();
    },
  };
}
