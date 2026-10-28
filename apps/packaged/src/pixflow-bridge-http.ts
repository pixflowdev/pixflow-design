import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";
import type { AddressInfo } from "node:net";
import { URL } from "node:url";
import type { PixflowBridgeSitesResponse, PixflowSiteRuntimeState } from '@open-design/contracts';

type BridgeGatewayState = "starting" | "running" | "stopped" | "stopping" | "failed";

export interface PixflowBridgeGatewayOptions {
  port?: number;
  version: string;
  getState(): BridgeGatewayState;
  getDaemonUrl(): string | null;
  getWebUrl(): string | null;
  getSite?(): PixflowBridgeGatewaySite | null;
  switchSite?(site: PixflowBridgeGatewaySiteInput): Promise<unknown>;
  resolveSite?(key: string, origin: string): Pick<PixflowBridgeGatewayOptions, 'getState' | 'getDaemonUrl' | 'getWebUrl' | 'getSite' | 'getRuntimeState' | 'acquire'> | null;
  getRuntimeState?(): PixflowSiteRuntimeState;
  acquire?(active: boolean): Promise<(() => void) | null>;
  listSites?(): Promise<PixflowBridgeSitesResponse>;
  sleepSite?(key: string): Promise<boolean>;
  wakeSite?(key: string): Promise<void>;
}

export interface PixflowBridgeGatewaySite {
  key: string;
  dataDir: string;
  odDataDir?: string;
  syncRoot: string;
  origin: string;
  url: string;
  label: string;
}

export interface PixflowBridgeGatewaySiteInput {
  siteKey: string;
  siteLabel?: string;
  siteOrigin?: string;
  siteUrl?: string;
}

export interface PixflowBridgeGatewayHandle {
  close(): Promise<void>;
  port: number;
}

const DEFAULT_PORT = 7456;
const DEFAULT_PROXY_TIMEOUT_MS = 25_000;
const AGENTS_PROXY_TIMEOUT_MS = 15_000;
const STREAM_PROXY_TIMEOUT_MS = 10 * 60_000;
const VISUAL_CAPTURE_PROXY_TIMEOUT_MS = 5 * 60_000;
const LEGACY_DAEMON_SHUTDOWN_TIMEOUT_MS = 10_000;

export async function startPixflowBridgeHttpGateway(options: PixflowBridgeGatewayOptions): Promise<PixflowBridgeGatewayHandle> {
  const port = options.port ?? DEFAULT_PORT;
  // Read-only directory membership belongs to this Bridge session, not to the
  // lifetime of a site's optional worker. It grants no execution or management.
  const directoryReaders = new Set<string>();
  const server = createServer((req, res) => {
    void handleRequest(req, res, options, directoryReaders).catch((error: unknown) => {
      writeCorsHeaders(req, res);
      writeJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });

  try {
    await listen(server, port);
  } catch (error) {
    if (!isAddressInUseError(error) || !await stopLegacyPixflowBridgeDaemon(port)) {
      throw error;
    }
    await waitForLegacyDaemonPortRelease(server, port);
  }

  let closing: Promise<void> | undefined;
  return {
    port: (server.address() as AddressInfo).port,
    close: () => closing ??= new Promise<void>((resolve) => {
      // Stop accepting first, then release owned streaming connections. Waiting
      // for SSE clients to finish by themselves can prevent Electron quitting.
      server.close(() => resolve());
      server.closeAllConnections();
    }),
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: PixflowBridgeGatewayOptions,
  directoryReaders: Set<string>,
): Promise<void> {
  // Browsers must address this loopback service by its literal local authority.
  // Checking Origin alone misses same-origin requests after DNS rebinding.
  const host = req.headers.host;
  const port = req.socket.localPort;
  if (!host || !port || ![`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host.toLowerCase())) {
    writeJson(res, 403, { ok: false, error: 'Invalid Bridge host.' });
    return;
  }
  writeCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = `${requestUrl.pathname}${requestUrl.search}`;
  const isApi = requestUrl.pathname === "/api" || requestUrl.pathname.startsWith("/api/");

  const siteKey = typeof req.headers['x-pixflow-site-key'] === 'string' ? req.headers['x-pixflow-site-key'].trim().toLowerCase() : '';
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (requestUrl.pathname === '/api/pixflow/runtime-idle') { writeJson(res, 403, { ok: false }); return; }
  if (options.resolveSite && (siteKey || origin) && requestUrl.pathname !== '/api/pixflow/site-context/switch') {
    const selected = options.resolveSite(siteKey, origin);
    if (selected) options = { ...options, ...selected };
    else {
      writeJson(res, requestUrl.pathname === '/api/health' ? 200 : 409, {
        ok: requestUrl.pathname === '/api/health' && options.getState() === 'running', product: 'pixflow-design-bridge', version: options.version,
        state: options.getState(), site: null, code: 'PIXFLOW_SITE_NOT_CONNECTED',
        error: 'Connect this site to Pixflow Design Bridge to continue.',
      });
      return;
    }
  }

  const management = requestUrl.pathname.match(/^\/api\/pixflow\/sites(?:\/([a-zA-Z0-9._-]+)\/(sleep|wake))?$/);
  if (management && options.listSites) {
    const ownKey = options.getSite?.()?.key;
    const currentState = options.getRuntimeState?.();
    const sleeping = currentState === 'sleeping' || currentState === 'releasing' || currentState === 'waking';
    const readerKey = JSON.stringify([origin, ownKey]);
    let authorized = !origin;
    if (!authorized && !sleeping && options.getDaemonUrl()) {
      const proof = await requestJson(new URL('/api/pixflow/central-entitlement', options.getDaemonUrl()!), 2000).catch(() => null);
      authorized = isRecord(proof) && proof.valid === true;
      if (authorized) directoryReaders.add(readerKey);
      else directoryReaders.delete(readerKey);
    }
    if (req.method === 'GET' && !management[1]) {
      const result = await options.listSites();
      // Return fresh states, never a cached directory. Previously verified
      // callers retain read-only visibility while asleep; mutations below still
      // require current authorization. New/unverified origins see only themselves.
      const canReadDirectory = authorized || (sleeping && directoryReaders.has(readerKey));
      writeJson(res, 200, { ...result, sites: canReadDirectory ? result.sites : result.sites.filter(site => site.key === ownKey) });
      return;
    }
    if (req.method !== 'POST' || !management[1]) { writeJson(res, 405, { ok: false }); return; }
    const target = management[1];
    if (!authorized && !(management[2] === 'wake' && target === ownKey)) { writeJson(res, 403, { ok: false, reason: 'Connect and verify this site first.' }); return; }
    if (management[2] === 'wake' && options.wakeSite) {
      await options.wakeSite(target); writeJson(res, 200, { ok: true }); return;
    }
    const ok = await options.sleepSite?.(target) ?? false;
    writeJson(res, 200, { ok, ...(!ok ? { reason: 'This site is still working. Try again after it finishes.' } : {}) }); return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/health") {
    const runtimeState = options.getRuntimeState?.();
    const dormant = runtimeState === 'sleeping' || runtimeState === 'waking' || runtimeState === 'releasing';
    const daemon = await readDaemonStatus(options).catch(() => null);
    writeJson(res, 200, {
      ok: options.getState() === "running" && (dormant || daemon !== null),
      ...(runtimeState ? { runtimeState } : {}),
      product: "pixflow-design-bridge",
      transport: "tray-gateway",
      state: options.getState(),
      version: options.version,
      site: daemon?.site ?? options.getSite?.() ?? null,
    });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/pixflow/site-context/switch" && options.switchSite != null) {
    const body = await readJsonBody(req);
    const site = {
      siteKey: stringField(body, "siteKey"),
      siteOrigin: stringField(body, "siteOrigin"),
      siteUrl: stringField(body, "siteUrl"),
      siteLabel: stringField(body, "siteLabel"),
    };
    if ((siteKey && siteKey !== site.siteKey.toLowerCase()) || (origin && origin !== site.siteOrigin)) {
      writeJson(res, 403, { ok: false, error: 'The requested site does not match this browser origin.' });
      return;
    }
    const result = await options.switchSite(site);
    writeJson(res, 200, result);
    return;
  }

  // An explicit run owns an active lease before forwarding. If memory was
  // released between the client's readiness check and submission, acquisition
  // recreates the runtime; the protected daemon still authorizes the request.
  const startsRun = req.method === 'POST' && requestUrl.pathname === '/api/pixflow/direct-site/run-stream';
  if (!startsRun && ['sleeping', 'releasing'].includes(options.getRuntimeState?.() ?? '')) {
    writeJson(res, 409, { ok: false, code: 'PIXFLOW_RUNTIME_SLEEPING', error: 'This site is sleeping. It will reconnect when you send a request.' }); return;
  }
  const release = await options.acquire?.(req.method !== 'GET');
  if (release === null) {
    writeJson(res, 409, { ok: false, code: 'PIXFLOW_RUNTIME_SLEEPING', error: 'This site is reconnecting or sleeping.' }); return;
  }
  try {
  if (res.destroyed || req.aborted) return;
  const targetBase = isApi ? options.getDaemonUrl() : options.getWebUrl();

  if (targetBase == null || options.getState() !== "running") {
    writeJson(res, 503, {
      ok: false,
      state: options.getState(),
      version: options.version,
      error: "Pixflow Design Bridge is starting.",
    });
    return;
  }

  await proxyRequest(req, res, new URL(path, `${targetBase.replace(/\/+$/, "")}/`), {
    timeoutMs: proxyTimeoutForPath(requestUrl),
  });
  } finally { release?.(); }
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

function isAddressInUseError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}

async function stopLegacyPixflowBridgeDaemon(port: number): Promise<boolean> {
  const baseUrl = new URL(`http://127.0.0.1:${port}`);
  const health = await requestJson(new URL("/api/health", baseUrl), 1_500).catch(() => null);
  if (
    !isRecord(health)
    || health.product !== "pixflow-design-bridge"
    || typeof health.runtimeVersion !== "string"
    || typeof health.instanceId !== "string"
    || health.transport === "tray-gateway"
  ) {
    return false;
  }

  const shutdown = await requestJson(new URL("/api/daemon/shutdown", baseUrl), 2_500, "POST").catch(() => null);
  return shutdown != null;
}

async function waitForLegacyDaemonPortRelease(server: Server, port: number): Promise<void> {
  const deadline = Date.now() + LEGACY_DAEMON_SHUTDOWN_TIMEOUT_MS;
  let lastError: unknown = new Error(`Port ${port} remained occupied after legacy bridge shutdown.`);
  while (Date.now() < deadline) {
    try {
      await listen(server, port);
      return;
    } catch (error) {
      lastError = error;
      if (!isAddressInUseError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError;
}

async function readDaemonStatus(options: PixflowBridgeGatewayOptions): Promise<{ site: unknown } | null> {
  const daemonUrl = options.getDaemonUrl();
  if (daemonUrl == null || options.getState() !== "running") return null;
  const response = await requestJson(new URL("/api/pixflow/site-context", `${daemonUrl.replace(/\/+$/, "")}/`), 1_500);
  // A tray lifecycle flag alone does not prove the sidecar is responding. Also
  // discard a response from a runtime replaced while this probe was in flight.
  return isRecord(response) && response.ok === true
    && options.getDaemonUrl() === daemonUrl && options.getState() === "running"
    ? { site: response.site ?? null }
    : null;
}

export function proxyTimeoutForPath(requestUrl: URL): number {
  const pathname = requestUrl.pathname;
  // Native guidance waits for a text boundary; match the browser continuation budget.
  if (pathname === "/api/pixflow/direct-site/steer" || /^\/api\/runs\/[^/]+\/steer$/.test(pathname)) return 240_000;
  if (pathname === "/api/agents" && requestUrl.searchParams.get("stream") === "1") {
    return STREAM_PROXY_TIMEOUT_MS;
  }
  if (pathname === "/api/agents") return AGENTS_PROXY_TIMEOUT_MS;
  if (pathname === "/api/pixflow/license-entitlement") return STREAM_PROXY_TIMEOUT_MS;
  // Final Bricks acceptance captures six desktop/mobile positions. The daemon
  // intentionally settles and renders them in bounded concurrent batches, so
  // a healthy capture can exceed the ordinary 25-second API proxy deadline.
  if (
    pathname === "/api/pixflow/visual-capture"
    || pathname === "/api/pixflow/website-clone-source"
  ) return VISUAL_CAPTURE_PROXY_TIMEOUT_MS;
  if (
    pathname.endsWith("/stream")
    || pathname.endsWith("-stream")
    || pathname.includes("/run-stream")
  ) {
    return STREAM_PROXY_TIMEOUT_MS;
  }
  return DEFAULT_PROXY_TIMEOUT_MS;
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text.length === 0) return {};
  const parsed = JSON.parse(text) as unknown;
  return parsed != null && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function writeCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = typeof req.headers.origin === "string" && req.headers.origin.length > 0 ? req.headers.origin : "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "Accept, Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
}

function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(payload)}\n`);
}

async function requestJson(targetUrl: URL, timeoutMs: number, method = "GET"): Promise<unknown> {
  const client = targetUrl.protocol === "https:" ? httpsRequest : httpRequest;
  return await new Promise<unknown>((resolve, reject) => {
    const req = client({
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      method,
      headers: { Accept: "application/json" },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on("end", () => {
        if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
          reject(new Error(`HTTP ${response.statusCode ?? 0}`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    req.end();
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

async function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  targetUrl: URL,
  options: { timeoutMs: number },
): Promise<void> {
  const client = targetUrl.protocol === "https:" ? httpsRequest : httpRequest;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.origin;

    const upstream = client({
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      method: req.method,
      headers,
    }, (upstreamRes) => {
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        if (value !== undefined && !key.toLowerCase().startsWith("access-control-")) {
          res.setHeader(key, value);
        }
      }
      writeCorsHeaders(req, res);
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.statusMessage);
      upstreamRes.pipe(res);
      upstreamRes.on("end", finish);
    });

    upstream.setTimeout(options.timeoutMs, () => {
      upstream.destroy(new Error("Pixflow Design Bridge upstream request timed out."));
    });

    upstream.on("error", (error) => {
      if (res.headersSent || res.destroyed) {
        res.destroy(error);
        finish();
        return;
      }
      writeCorsHeaders(req, res);
      writeJson(res, error.message.includes("timed out") ? 504 : 502, {
        ok: false,
        error: error.message,
      });
      finish();
    });

    const disconnect = () => {
      upstream.destroy();
      finish();
    };
    req.on("aborted", disconnect);
    // Once a POST body has arrived, browser cancellation closes the response,
    // not the IncomingMessage. Forward that close so the daemon stops its CLI.
    res.on("close", () => { if (!res.writableFinished) disconnect(); });

    req.pipe(upstream);
  });
}
