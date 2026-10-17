import { homedir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { open, stat } from 'node:fs/promises';

import type { RequestHandler } from 'express';

import {
  buildAgentCliLogSources,
  buildDiagnosticsZip,
  buildRunEventLogSources,
  DIAGNOSTICS_CONTENT_TYPE,
  DIAGNOSTICS_FILENAME_PREFIX,
  diagnosticsFileName,
  type LogSource,
  type DiagnosticAttachment,
} from '@open-design/diagnostics';
import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MODES,
  type SidecarStamp,
} from '@open-design/sidecar-proto';
import {
  resolveLogFilePath,
  resolveRuntimeNamespaceRoot,
  type SidecarRuntimeContext,
} from '@open-design/sidecar';

import { readCurrentAppVersionInfo } from './app-version.js';
import { agentCliEnvForAgent, readAppConfig } from './app-config.js';
import { spawnEnvForAgent } from './agents.js';
import { readDirectDiagnostics } from './pixflow/direct-diagnostics.js';

interface ResolvedAgentHomes {
  amrOpenCodeHome: string | null;
  claudeConfigDir: string | null;
  codexHome: string | null;
  openCodeXdgDataHome: string | null;
}

// Resolve each agent CLI's effective home (OPENCODE_TEST_HOME / CLAUDE_CONFIG_DIR
// / CODEX_HOME) exactly as a real run would, by running the live
// `spawnEnvForAgent` resolver over the user's app-config overrides. This makes
// the diagnostics sweep honor `agentCliEnv.<agent>.*` relocations instead of
// only looking under the hardcoded defaults, and cannot drift from the spawn
// path. Returns nulls on any failure; the collector then falls back to defaults.
async function resolveAgentHomes(dataDir: string | null | undefined): Promise<ResolvedAgentHomes> {
  const empty: ResolvedAgentHomes = {
    amrOpenCodeHome: null,
    claudeConfigDir: null,
    codexHome: null,
    openCodeXdgDataHome: null,
  };
  if (!dataDir) return empty;
  try {
    const appConfig = await readAppConfig(dataDir);
    const envFor = (agentId: string) =>
      spawnEnvForAgent(
        agentId,
        { ...process.env, OD_DATA_DIR: dataDir },
        agentCliEnvForAgent(appConfig.agentCliEnv, agentId),
      );
    const clean = (value: string | undefined): string | null => {
      const trimmed = value?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : null;
    };
    return {
      amrOpenCodeHome: clean(envFor('amr').OPENCODE_TEST_HOME),
      claudeConfigDir: clean(envFor('claude').CLAUDE_CONFIG_DIR),
      codexHome: clean(envFor('codex').CODEX_HOME),
      // OpenCode resolves its data/log dir from XDG_DATA_HOME; sandbox mode
      // rewrites that (sandbox-mode.ts), so read the EFFECTIVE value from the
      // opencode spawn env rather than the host's, or the sweep misses the
      // logs in a sandboxed runtime.
      openCodeXdgDataHome: clean(envFor('opencode').XDG_DATA_HOME),
    };
  } catch {
    return empty;
  }
}

export interface DiagnosticsHandlerOptions {
  /** Sidecar runtime context, present when daemon is launched via tools-dev or packaged sidecar. */
  runtime: SidecarRuntimeContext<SidecarStamp> | null;
  /** Project root used to derive crash-report match strings. */
  projectRoot: string;
  /** Directory containing per-run event logs at <runsDir>/<runId>/events.jsonl. */
  runsDir?: string | null;
  /** Pixflow Design data dir (OD_DATA_DIR), used to locate the AMR OpenCode home. */
  dataDir?: string | null;
  /** Pixflow's WordPress-facing export has its own branding and stricter policy. */
  profile?: 'open-design' | 'pixflow';
}

const TAIL_BYTES_PER_LOG = 4 * 1024 * 1024;
const PIXFLOW_SUMMARY_TAIL_BYTES = 512 * 1024;
const PIXFLOW_SUMMARY_MAX_LINES = 200;

function safeUsername(): string | undefined {
  try {
    const info = userInfo();
    return info?.username && info.username.length > 0 ? info.username : undefined;
  } catch {
    return undefined;
  }
}

export const STANDALONE_LAUNCH_WARNING =
  "Daemon started without a sidecar runtime (plain `od` / standalone launch); " +
  "file-based logs are not captured. Re-run via `pnpm tools-dev` or the packaged " +
  "desktop app to include daemon/web/desktop log files in the bundle.";

function buildSidecarLogSources(runtime: SidecarRuntimeContext<SidecarStamp> | null): LogSource[] {
  if (runtime == null) return [];
  // In packaged builds `runtime.base` is `<namespaceRoot>/runtime`, so the log
  // tree lives a level UP at `<namespaceRoot>/logs`; `resolveRuntimeNamespaceRoot`
  // accounts for that (a plain `resolveNamespaceRoot` here resolved every
  // daemon/web log to an ENOENT phantom path and captured none of them).
  const namespaceRoot = resolveRuntimeNamespaceRoot({
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    runtime,
    runtimeMode: SIDECAR_MODES.RUNTIME,
  });
  const apps = [APP_KEYS.DAEMON, APP_KEYS.WEB, APP_KEYS.DESKTOP];
  const sources: LogSource[] = [];
  for (const app of apps) {
    const absolutePath = resolveLogFilePath({
      app,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      runtimeRoot: namespaceRoot,
    });
    sources.push({
      name: `logs/${app}/latest.log`,
      absolutePath,
      kind: 'text',
      tailBytes: TAIL_BYTES_PER_LOG,
    });
    // Only desktop runs an Electron renderer that writes `renderer.log`
    // (see apps/desktop/src/main/runtime.ts). daemon and web are pure Node
    // services with no renderer process, so listing the file there only
    // produces missing-file placeholders and manifest warnings.
    if (app === APP_KEYS.DESKTOP) {
      sources.push({
        name: `logs/${app}/renderer.log`,
        absolutePath: `${dirname(absolutePath)}/renderer.log`,
        kind: 'text',
        tailBytes: TAIL_BYTES_PER_LOG,
      });
      sources.push({
        name: `logs/${app}/gpu-info.json`,
        absolutePath: `${dirname(absolutePath)}/gpu-info.json`,
        kind: 'json',
      });
    }
  }
  return sources;
}

function resolveDesktopCrashDumpsDir(
  runtime: SidecarRuntimeContext<SidecarStamp> | null,
): string | null {
  if (runtime == null) return null;
  const namespaceRoot = resolveRuntimeNamespaceRoot({
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    runtime,
    runtimeMode: SIDECAR_MODES.RUNTIME,
  });
  const desktopLog = resolveLogFilePath({
    app: APP_KEYS.DESKTOP,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    runtimeRoot: namespaceRoot,
  });
  return join(dirname(desktopLog), 'crashes');
}

async function readTextTail(path: string, maxBytes = PIXFLOW_SUMMARY_TAIL_BYTES): Promise<string> {
  const info = await stat(path);
  const start = Math.max(0, info.size - maxBytes);
  const length = Math.min(info.size, maxBytes);
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

// Provider failures can echo whole prompts, shell commands or page content.
// Export only known diagnostic categories, never the matched source text.
function diagnosticCategories(value: unknown): string[] {
  const text = typeof value === 'string' ? value : '';
  const categories = ['warn', 'error', 'fatal', 'quota', 'capacity', 'auth', 'timeout', 'disconnect', 'refused', 'failed'];
  return categories.filter(category => new RegExp(`\\b${category}\\b`, 'iu').test(text))
    .concat(/\brate.?limit\b/iu.test(text) ? ['rate-limit'] : []);
}

function diagnosticNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function diagnosticTimestamp(value: unknown): string | number | undefined {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/u.test(value)) return value;
  return diagnosticNumber(value);
}

async function buildPixflowRunSummary(runSources: LogSource[]): Promise<DiagnosticAttachment> {
  const runs: Array<Record<string, unknown>> = [];
  for (const source of runSources) {
    try {
      const events: Array<Record<string, unknown>> = [];
      for (const line of (await readTextTail(source.absolutePath, 2 * 1024 * 1024)).split(/\r?\n/u)) {
        if (!line.trim()) continue;
        let record: Record<string, unknown>;
        try {
          record = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }
        const data = record.data && typeof record.data === 'object' && !Array.isArray(record.data)
          ? record.data as Record<string, unknown>
          : {};
        const event = String(record.event || 'unknown');
        const type = String(data.type || '');
        if (event === 'agent' && !['status', 'usage', 'error'].includes(type)) continue;
        if (event === 'stderr') {
          const categories = diagnosticCategories(data.chunk);
          if (categories.length === 0) continue;
          events.push({ event, timestamp: diagnosticTimestamp(record.timestamp), categories });
          continue;
        }
        if (!['agent', 'diagnostic', 'end'].includes(event)) continue;
        events.push({
          event,
          type: ['status', 'usage', 'error'].includes(type) ? type : undefined,
          timestamp: diagnosticTimestamp(record.timestamp),
          code: diagnosticNumber(data.code ?? data.exit_code),
          categories: type === 'error' ? diagnosticCategories(data.message) : undefined,
          usage: type === 'usage' && data.usage && typeof data.usage === 'object'
            ? Object.fromEntries(['input_tokens', 'output_tokens', 'total_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']
              .map(key => [key, diagnosticNumber((data.usage as Record<string, unknown>)[key])]))
            : undefined,
        });
      }
      runs.push({ run: source.name.split('/')[1] || source.name, events: events.slice(-100) });
    } catch (error) {
      runs.push({ run: source.name, readError: 'log-unavailable' });
    }
  }
  return {
    name: 'agent/run-summaries.json',
    kind: 'json',
    content: { schema: 'pixflow.agent-run-diagnostics.v1', runs },
    priority: 85,
    required: true,
  };
}

async function buildPixflowTextLogSummary(sources: LogSource[]): Promise<DiagnosticAttachment> {
  const logs: Array<Record<string, unknown>> = [];
  for (const source of sources) {
    try {
      const lines = (await readTextTail(source.absolutePath)).split(/\r?\n/u)
        .map(diagnosticCategories)
        .filter((categories) => categories.length > 0)
        .slice(-PIXFLOW_SUMMARY_MAX_LINES);
      if (lines.length > 0) logs.push({ source: source.name, lines });
    } catch (error) {
      logs.push({ source: source.name, readError: 'log-unavailable' });
    }
  }
  return {
    name: 'agent/provider-and-bridge-errors.json',
    kind: 'json',
    content: { schema: 'pixflow.provider-bridge-diagnostics.v1', logs },
    priority: 80,
    required: true,
  };
}

export function createDiagnosticsExportHandler(options: DiagnosticsHandlerOptions): RequestHandler {
  return async (req, res) => {
    try {
      const pixflowProfile = options.profile === 'pixflow';
      const versionInfo = await readCurrentAppVersionInfo().catch(() => null);
      const home = homedir();
      const agentHomes = await resolveAgentHomes(options.dataDir);
      const sidecarSources = buildSidecarLogSources(options.runtime);
      const runSources = await buildRunEventLogSources(options.runsDir);
      const cliSources = await buildAgentCliLogSources({
          homeDir: home,
          dataDir: options.dataDir ?? null,
          amrOpenCodeHome: agentHomes.amrOpenCodeHome,
          claudeConfigDir: agentHomes.claudeConfigDir,
          codexHome: agentHomes.codexHome,
          xdgDataHome: agentHomes.openCodeXdgDataHome ?? process.env.XDG_DATA_HOME ?? null,
        });
      const sources = pixflowProfile ? [] : [...sidecarSources, ...runSources, ...cliSources];
      const username = safeUsername();
      const crashDumpsDir = resolveDesktopCrashDumpsDir(options.runtime);
      const attachments: DiagnosticAttachment[] = [];
      if (pixflowProfile) {
        if (options.dataDir) attachments.push({
          name: 'agent/direct-run-summaries.json', kind: 'json', priority: 86, required: true,
          content: { schema: 'pixflow.direct-diagnostics.v1', ...readDirectDiagnostics(options.dataDir) },
        });
        attachments.push(await buildPixflowRunSummary(runSources));
        attachments.push(await buildPixflowTextLogSummary([...sidecarSources, ...cliSources]));
      }
      if (pixflowProfile && req.method === 'POST') {
        const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
          ? req.body as Record<string, unknown>
          : {};
        const addAttachment = (name: string, value: unknown, priority: number) => {
          if (value == null || typeof value !== 'object' || Array.isArray(value)) return;
          const bytes = Buffer.byteLength(JSON.stringify(value));
          if (bytes > 1024 * 1024) throw new Error(`${name} exceeds the 1 MiB diagnostics packet limit.`);
          attachments.push({ name, kind: 'json', content: value, priority, required: true });
        };
        addAttachment('wordpress/environment.json', body.wordpress, 100);
        addAttachment('browser/client-errors.json', body.client, 95);
        addAttachment('browser/surface-context.json', body.context, 90);
      }

      const result = await buildDiagnosticsZip({
        context: {
          app: {
            name: pixflowProfile ? 'pixflow-design' : 'open-design',
            version: pixflowProfile
              ? String((req.body as { pluginVersion?: unknown } | undefined)?.pluginVersion || versionInfo?.version || '') || undefined
              : versionInfo?.version,
            channel: versionInfo?.channel,
            packaged: versionInfo?.packaged,
          },
          source: pixflowProfile ? 'pixflow-wordpress' : 'daemon-http',
          namespace: options.runtime?.namespace,
          extra: {
            runtimeAvailable: options.runtime != null,
            sourceTag: options.runtime?.source ?? null,
            mode: options.runtime?.mode ?? null,
            base: options.runtime?.base ?? null,
            projectRoot: options.projectRoot,
          },
          warnings: options.runtime == null ? [STANDALONE_LAUNCH_WARNING] : undefined,
        },
        sources,
        attachments,
        redaction: { username },
        ...(pixflowProfile ? {} : { crashReports: {
          // Restrict to Pixflow Design's own process names. A generic "Electron"
          // substring would sweep up crash reports from any other Electron
          // app on the host (VS Code, Slack, …) and leak unrelated user data
          // into the support bundle.
          matchSubstrings: ['Pixflow Design', 'open-design'],
          withinDays: 7,
          maxReports: 10,
          homeDir: home,
        } }),
        ...(!pixflowProfile && crashDumpsDir
          ? { crashDumps: { dir: crashDumpsDir, withinDays: 14, maxDumps: 10 } }
          : {}),
        ...(pixflowProfile ? {
          limits: {
            maxCollectedBytes: 64 * 1024 * 1024,
            maxZipBytes: 25 * 1024 * 1024,
          },
          privacy: { includeHostIdentity: false },
        } : {}),
      });

      const filename = diagnosticsFileName(pixflowProfile ? 'pixflow-design-diagnostics' : DIAGNOSTICS_FILENAME_PREFIX);
      res.setHeader('Content-Type', DIAGNOSTICS_CONTENT_TYPE);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Length', String(result.zip.byteLength));
      res.status(200).end(result.zip);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: 'DIAGNOSTICS_EXPORT_FAILED', message });
    }
  };
}
