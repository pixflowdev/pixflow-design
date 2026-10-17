// External MCP server configuration storage + spawn-time wiring.
//
// Pixflow Design acts as an MCP CLIENT to one or more external MCP servers
// (Higgsfield openclaw, GitHub, filesystem, anything the user configures).
// At spawn time we hand those servers to whichever agent is being launched
// (Claude Code via a project-cwd `.mcp.json`, ACP agents via the existing
// `mcpServers` parameter) so the agent surfaces their tools to the model.
//
// Storage: <dataDir>/mcp-config.json with shape `{ servers: [...] }`. The
// dataDir resolution mirrors app-config.ts so OD_DATA_DIR / packaged daemon
// runtime layouts route this file alongside the rest of the runtime state.
//
// We deliberately keep the schema close to Claude Code's `.mcp.json` and
// Cursor's MCP config — those are the de-facto interchange formats — so
// users can copy-paste between Pixflow Design and other tools without
// translation.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

import type { McpTransport, McpAuthMode, McpServerConfig, McpConfig } from '@open-design/contracts';
export type { McpTransport, McpAuthMode, McpServerConfig, McpConfig, McpTemplate, McpTemplateField, McpTemplateCategory } from '@open-design/contracts';
export { MCP_TEMPLATES } from '@open-design/contracts';

const VALID_TRANSPORTS: ReadonlySet<McpTransport> = new Set([
  'stdio',
  'sse',
  'http',
]);
const VALID_AUTH_MODES: ReadonlySet<McpAuthMode> = new Set(['none', 'oauth']);

// Slug rule for server ids. The id flows into agent-facing config files
// (Claude Code's `mcpServers` map keys, ACP `name`) and in some cases into
// argv / env, so we keep it strictly alphanumeric + `-` / `_`.
const SERVER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function configFile(dataDir: string): string {
  return path.join(dataDir, 'mcp-config.json');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function sanitizeStringMap(raw: unknown): Record<string, string> | undefined {
  if (!isPlainObject(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === '__proto__' || k === 'constructor') continue;
    if (typeof k !== 'string' || !k.trim()) continue;
    if (typeof v !== 'string') continue;
    // Drop empty / whitespace-only values. Persisting them is worse than
    // omitting them: the spawn-time merge treats a present header as
    // "user pinned this", which would block our daemon-issued OAuth
    // Bearer from being injected. The UI also has placeholder fields
    // (e.g. an "Authorization=" template row) the user can leave blank
    // — those should never make it into the saved config.
    if (v.trim() === '') continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.filter((v): v is string => typeof v === 'string');
  return out.length > 0 ? out : undefined;
}

function normalizeHost(hostname: string): string {
  return hostname
    .replace(/^\[|\]$/g, '')
    .toLowerCase()
    .replace(/\.+$/g, '');
}

function isLoopbackHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (host === 'localhost' || host === '::1') return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(host)) return true;
  const mapped = /^::ffff:(127(?:\.\d{1,3}){3})$/i.exec(host)?.[1];
  return Boolean(mapped);
}

export function inferMcpAuthModeForUrl(rawUrl: string | undefined): McpAuthMode {
  if (!rawUrl) return 'oauth';
  try {
    return isLoopbackHost(new URL(rawUrl).hostname) ? 'none' : 'oauth';
  } catch {
    return 'oauth';
  }
}

function sanitizeMcpAuthMode(raw: unknown): McpAuthMode | undefined {
  return typeof raw === 'string' && VALID_AUTH_MODES.has(raw as McpAuthMode)
    ? (raw as McpAuthMode)
    : undefined;
}

function effectiveMcpAuthMode(server: McpServerConfig): McpAuthMode {
  if (server.transport !== 'http' && server.transport !== 'sse') return 'none';
  return server.authMode ?? inferMcpAuthModeForUrl(server.url);
}

/**
 * Validate a single user-supplied entry. Drops invalid fields so a typo in
 * one server doesn't tank the whole config. Returns null when the entry is
 * unsalvageable (no id, or no transport-required fields).
 */
export function sanitizeMcpServer(raw: unknown): McpServerConfig | null {
  if (!isPlainObject(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!SERVER_ID_PATTERN.test(id)) return null;
  const transport = typeof raw.transport === 'string' ? (raw.transport as McpTransport) : 'stdio';
  if (!VALID_TRANSPORTS.has(transport)) return null;

  const next: McpServerConfig = {
    id,
    transport,
    enabled: raw.enabled !== false,
  };
  if (typeof raw.label === 'string' && raw.label.trim()) {
    next.label = raw.label.trim();
  }
  if (typeof raw.templateId === 'string' && raw.templateId.trim()) {
    next.templateId = raw.templateId.trim();
  }

  if (transport === 'stdio') {
    if (typeof raw.command !== 'string' || !raw.command.trim()) return null;
    next.command = raw.command.trim();
    const args = sanitizeStringArray(raw.args);
    if (args) next.args = args;
    const env = sanitizeStringMap(raw.env);
    if (env) next.env = env;
  } else {
    if (typeof raw.url !== 'string' || !raw.url.trim()) return null;
    // Reject anything that isn't an http(s) URL — protects against accidental
    // `file://` / `javascript:` slipping into a config file.
    let parsed: URL;
    try {
      parsed = new URL(raw.url.trim());
    } catch {
      return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    next.url = parsed.toString();
    next.authMode = sanitizeMcpAuthMode(raw.authMode) ?? inferMcpAuthModeForUrl(next.url);
    const headers = sanitizeStringMap(raw.headers);
    if (headers) next.headers = headers;
  }
  return next;
}

export function sanitizeMcpConfig(raw: unknown): McpConfig {
  if (!isPlainObject(raw)) return { servers: [] };
  const list = Array.isArray(raw.servers) ? raw.servers : [];
  const seen = new Set<string>();
  const out: McpServerConfig[] = [];
  for (const entry of list) {
    const ok = sanitizeMcpServer(entry);
    if (!ok) continue;
    if (seen.has(ok.id)) continue; // de-dupe by id
    seen.add(ok.id);
    out.push(ok);
  }
  return { servers: out };
}

export async function readMcpConfig(dataDir: string): Promise<McpConfig> {
  try {
    const raw = await readFile(configFile(dataDir), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return sanitizeMcpConfig(parsed);
  } catch (err: unknown) {
    const e = err as { code?: string; name?: string; message?: string };
    if (e.code === 'ENOENT') return { servers: [] };
    if (e.name === 'SyntaxError') {
      console.error('[mcp-config] Corrupted JSON, returning empty:', e.message);
      return { servers: [] };
    }
    throw err;
  }
}

const writeLocks = new Map<string, Promise<unknown>>();

export async function writeMcpConfig(
  dataDir: string,
  body: unknown,
): Promise<McpConfig> {
  const prev = writeLocks.get(dataDir) ?? Promise.resolve();
  const task = prev.catch(() => {}).then(() => doWrite(dataDir, body));
  writeLocks.set(dataDir, task);
  try {
    return await task;
  } finally {
    if (writeLocks.get(dataDir) === task) writeLocks.delete(dataDir);
  }
}

async function doWrite(dataDir: string, body: unknown): Promise<McpConfig> {
  const next = sanitizeMcpConfig(body);
  const file = configFile(dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.' + randomBytes(4).toString('hex') + '.tmp';
  await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
  await rename(tmp, file);
  return next;
}

// ───────────────────────────────────────────────────────────────────────
// Spawn-time wiring helpers.
// ───────────────────────────────────────────────────────────────────────

/**
 * True when `cwd` is a daemon-managed project directory under PROJECTS_DIR
 * (= safe to write `.mcp.json` into without risk of clobbering a user-owned
 * file). Git-linked projects whose cwd points at the user's own repo, and
 * the no-project fallback that resolves to PROJECT_ROOT, both return false
 * — the daemon must NOT write external-MCP config into either of those.
 */
export function isManagedProjectCwd(
  cwd: string | null | undefined,
  projectsDir: string,
): boolean {
  if (!cwd || typeof cwd !== 'string') return false;
  if (typeof projectsDir !== 'string' || projectsDir.length === 0) return false;
  if (cwd === projectsDir) return false; // PROJECTS_DIR root, not a project
  return cwd.startsWith(projectsDir + path.sep);
}

/**
 * Project-cwd `.mcp.json` shape that Claude Code auto-loads on spawn (the
 * same format Claude Desktop and Cursor use). Returns null when the user
 * has no enabled servers — in that case the caller should NOT write the
 * file (and should clean up any stale one).
 *
 * `tokens` is an optional map of `serverId -> bearer access token`, used
 * for HTTP/SSE servers that completed the daemon's web OAuth flow. When a
 * token is present we inject `Authorization: Bearer <token>` into the
 * server's headers — this is what bypasses the per-spawn `mcp-remote`
 * dance and lets Claude Code talk directly to the upstream MCP using
 * pre-authenticated credentials. User-supplied headers always win on
 * conflict so they can pin a specific token if they really want to.
 */
export function buildClaudeMcpJson(
  servers: McpServerConfig[],
  tokens: Record<string, string> = {},
): unknown | null {
  const enabled = servers.filter((s) => s.enabled);
  if (enabled.length === 0) return null;
  const out: Record<string, Record<string, unknown>> = {};
  for (const s of enabled) {
    if (s.transport === 'stdio') {
      const entry: Record<string, unknown> = { command: s.command };
      if (s.args && s.args.length > 0) entry.args = s.args;
      if (s.env && Object.keys(s.env).length > 0) entry.env = s.env;
      out[s.id] = entry;
    } else {
      const entry: Record<string, unknown> = {
        type: s.transport, // 'sse' | 'http'
        url: s.url,
      };
      const headers = mergeAuthHeader(
        s.headers,
        effectiveMcpAuthMode(s) === 'oauth' ? tokens[s.id] : undefined,
      );
      if (headers && Object.keys(headers).length > 0) entry.headers = headers;
      out[s.id] = entry;
    }
  }
  return { mcpServers: out };
}

/** Build a headers object that includes the daemon-issued bearer token when
 * the user hasn't already supplied a NON-EMPTY Authorization header. A
 * blank Authorization (empty string / whitespace only) is treated as
 * "not pinned" — historically the template UI persisted empty values from
 * unfilled fields, and we never want a blank Authorization to suppress a
 * valid OAuth Bearer (the upstream MCP would refuse the connection and
 * fall back to its in-tool re-auth dance). Real user-pinned values still
 * win so manually-set PATs aren't silently overwritten. */
function mergeAuthHeader(
  existing: Record<string, string> | undefined,
  bearer: string | undefined,
): Record<string, string> | undefined {
  const merged: Record<string, string> = {};
  let userAuth: string | null = null;
  for (const [k, v] of Object.entries(existing ?? {})) {
    if (k.toLowerCase() === 'authorization') {
      if (typeof v === 'string' && v.trim() !== '') {
        userAuth = v;
        merged[k] = v;
      }
      // empty / whitespace authorization is ignored, NOT carried through
      continue;
    }
    merged[k] = v;
  }
  if (bearer && !userAuth) {
    merged['Authorization'] = `Bearer ${bearer}`;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * Convert user-configured external MCP servers into the ACP `mcpServers`
 * shape that Hermes/Kimi accept (already in use by buildLiveArtifactsMcpServersForAgent).
 * SSE/HTTP servers are dropped — ACP currently models stdio only — but we
 * surface a warning so the UI can hint at it.
 */
export interface AcpMcpServer {
  type: 'stdio';
  name: string;
  command: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
}

export function buildAcpMcpServers(servers: McpServerConfig[]): AcpMcpServer[] {
  const enabled = servers.filter((s) => s.enabled && s.transport === 'stdio');
  const out: AcpMcpServer[] = [];
  for (const s of enabled) {
    const envEntries: Array<{ name: string; value: string }> = [];
    if (s.env) {
      for (const [name, value] of Object.entries(s.env)) {
        if (typeof value !== 'string') continue;
        envEntries.push({ name, value });
      }
    }
    out.push({
      type: 'stdio',
      name: s.id,
      command: s.command ?? '',
      args: Array.isArray(s.args) ? [...s.args] : [],
      env: envEntries,
    });
  }
  return out;
}

/**
 * OpenCode merges its config from multiple sources at boot — global
 * `~/.config/opencode/opencode.json`, the `OPENCODE_CONFIG` file path, the
 * project `opencode.json`, and the `OPENCODE_CONFIG_CONTENT` env var (an
 * inline JSON string). The env-var path is what lets a launcher like the
 * Pixflow Design daemon hand servers to a single `opencode run` invocation
 * without writing into the user's global config or leaving a temp file
 * around on crash.
 *
 * Schema (verified against the dev branch of `sst/opencode`'s
 * `packages/opencode/src/config/config.ts` and the public docs at
 * <https://opencode.ai/docs/mcp-servers>):
 *
 *   {
 *     "mcp": {
 *       "<id>": {
 *         "type": "local",
 *         "command": ["<cmd>", "<arg1>", ...],
 *         "environment"?: { ... },
 *         "enabled": true
 *       },
 *       "<id>": {
 *         "type": "remote",
 *         "url": "...",
 *         "headers"?: { ... },
 *         "enabled": true
 *       }
 *     }
 *   }
 *
 * Returns `null` when nothing would be emitted — the caller must NOT set
 * `OPENCODE_CONFIG_CONTENT` to `null`/empty in that case, because doing so
 * would override the user's saved global config with an empty object. A
 * null return means "leave the env untouched and let OpenCode read the
 * user's home-dir config as-is."
 *
 * The OAuth Bearer merge mirrors `buildClaudeMcpJson` so a remote MCP
 * server the daemon already authenticated against (Higgsfield etc.)
 * works the same way for OpenCode users without forcing them to
 * re-authenticate inside OpenCode.
 */
export function buildOpenCodeMcpConfigContent(
  servers: McpServerConfig[],
  tokens: Record<string, string> = {},
  options: { allowedDirectories?: string[] } = {},
): string | null {
  const enabled = servers.filter((s) => s.enabled);
  const mcp: Record<string, Record<string, unknown>> = {};
  for (const s of enabled) {
    if (s.transport === 'stdio') {
      const cmd = typeof s.command === 'string' ? s.command.trim() : '';
      if (!cmd) continue;
      const entry: Record<string, unknown> = {
        type: 'local',
        command: [cmd, ...(Array.isArray(s.args) ? s.args : [])],
      };
      if (s.env && Object.keys(s.env).length > 0) {
        entry.environment = { ...s.env };
      }
      entry.enabled = true;
      mcp[s.id] = entry;
    } else {
      const url = typeof s.url === 'string' ? s.url.trim() : '';
      if (!url) continue;
      const entry: Record<string, unknown> = {
        type: 'remote',
        url: s.url,
      };
      const headers = mergeAuthHeader(
        s.headers,
        effectiveMcpAuthMode(s) === 'oauth' ? tokens[s.id] : undefined,
      );
      if (headers && Object.keys(headers).length > 0) entry.headers = headers;
      entry.enabled = true;
      mcp[s.id] = entry;
    }
  }
  const externalDirectory = buildOpenCodeExternalDirectoryAllowlist(options.allowedDirectories);
  if (Object.keys(mcp).length === 0 && !externalDirectory) return null;
  const config: Record<string, unknown> = {};
  if (Object.keys(mcp).length > 0) config.mcp = mcp;
  if (externalDirectory) {
    config.permission = { external_directory: externalDirectory };
  }
  return JSON.stringify(config);
}

function buildOpenCodeExternalDirectoryAllowlist(
  directories: string[] | undefined,
): Record<string, 'allow'> | null {
  const normalized = Array.from(new Set(
    (directories ?? [])
      .filter((dir) => typeof dir === 'string' && dir.trim().length > 0)
      .filter((dir) => path.isAbsolute(dir))
      .flatMap((dir) => {
        const resolved = path.resolve(dir).replace(/[\\/]+$/, '');
        try {
          const real = realpathSync.native(dir).replace(/[\\/]+$/, '');
          return real && real !== resolved ? [resolved, real] : [resolved];
        } catch {
          return [resolved];
        }
      }),
  ));
  if (normalized.length === 0) return null;
  const allowlist: Record<string, 'allow'> = {};
  for (const dir of normalized) {
    allowlist[dir] = 'allow';
    allowlist[path.join(dir, '*')] = 'allow';
    allowlist[path.join(dir, '**')] = 'allow';
  }
  return allowlist;
}
