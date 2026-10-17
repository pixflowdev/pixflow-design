import { execAgentFile } from './invocation.js';
import { refreshCodexAppDiscovery } from './executables.js';
import { resolveSystemProxyEnvAsync } from '@open-design/platform';
import { AGENT_DEFS } from './registry.js';
import {
  DEFAULT_MODEL_OPTION,
  getRememberedLiveModels,
  rememberLiveModels,
} from './models.js';
import { applyAgentLaunchEnv, resolveAgentLaunch } from './launch.js';
import { spawnEnvForAgent } from './env.js';
import { probeAgentAuthStatus } from './auth.js';
import { agentCapabilities } from './capabilities.js';
import { installMetaForAgent } from './metadata.js';
import { resolveAmrProfile } from '../integrations/vela.js';
import {
  buildAuthDiagnostic,
  buildExecutableDiagnostic,
  buildNotInvocableDiagnostic,
  type NotInvocableCause,
} from './diagnostics.js';
import type {
  AgentDiagnostic,
  DetectedAgent,
  RuntimeAgentDef,
  RuntimeCapabilityMap,
  RuntimeModelSource,
  RuntimeModelOption,
} from './types.js';
import type { ModelInputCapabilities } from '@open-design/contracts';

type FetchedRuntimeModels = {
  models: RuntimeModelOption[];
  source: RuntimeModelSource;
};

type AgentDetectionOptions = {
  force?: boolean;
};

const AGENT_DETECTION_CACHE_MS = 60_000;
let cachedAgentDetection: {
  checkedAt: number;
  key: string;
  value: DetectedAgent[];
} | null = null;
let agentDetectionRequest: {
  key: string;
  promise: Promise<DetectedAgent[]>;
} | null = null;
const targetedAgentDetectionCache = new Map<string, {
  checkedAt: number;
  value: DetectedAgent;
}>();
const targetedAgentDetectionRequests = new Map<string, Promise<DetectedAgent>>();

function stableAgentEnvKey(
  configuredEnvByAgent: Record<string, Record<string, string>> = {},
): string {
  const normalized = Object.keys(configuredEnvByAgent)
    .sort()
    .map((agentId) => [
      agentId,
      Object.keys(configuredEnvByAgent[agentId] ?? {})
        .sort()
        .map((key) => [key, configuredEnvByAgent[agentId]?.[key] ?? '']),
    ]);
  return JSON.stringify(normalized);
}

function amrModelScopeFromEnv(env: NodeJS.ProcessEnv): string {
  return resolveAmrProfile(env);
}

function withRememberedAmrModels(
  def: RuntimeAgentDef,
  env: NodeJS.ProcessEnv,
  modelResult: FetchedRuntimeModels,
): FetchedRuntimeModels {
  if (def.id !== 'amr' || modelResult.models.length > 0) return modelResult;
  const rememberedModels = getRememberedLiveModels(def.id, amrModelScopeFromEnv(env));
  if (rememberedModels.length === 0) return modelResult;
  return { models: rememberedModels, source: 'live' };
}

async function fetchModels(
  def: RuntimeAgentDef,
  resolvedBin: string,
  env: NodeJS.ProcessEnv,
): Promise<FetchedRuntimeModels> {
  if (typeof def.fetchModels === 'function') {
    try {
      const parsed = await def.fetchModels(resolvedBin, env);
      if (!parsed || parsed.length === 0) {
        return { models: def.fallbackModels, source: 'fallback' };
      }
      return { models: parsed, source: 'live' };
    } catch {
      return { models: def.fallbackModels, source: 'fallback' };
    }
  }
  if (!def.listModels) {
    return { models: def.fallbackModels, source: 'fallback' };
  }
  try {
    const { stdout } = await execAgentFile(resolvedBin, def.listModels.args, {
      env,
      timeout: def.listModels.timeoutMs ?? 5000,
      // Models lists from popular CLIs (e.g. opencode) easily exceed the
      // default 1MB buffer once you include every openrouter model. Bump
      // it so we don't truncate the listing.
      maxBuffer: 8 * 1024 * 1024,
    });
    const parsed = def.listModels.parse(String(stdout));
    // Empty / null parse result means the CLI didn't actually return a
    // usable list (e.g. cursor-agent's "No models available"); fall back
    // to the static hint so the picker isn't stuck on Default-only.
    if (!parsed || parsed.length === 0) {
      return { models: def.fallbackModels, source: 'fallback' };
    }
    return { models: parsed, source: 'live' };
  } catch {
    return { models: def.fallbackModels, source: 'fallback' };
  }
}

type VersionProbeOutcome =
  | { kind: 'not-invocable'; cause: NotInvocableCause }
  | { kind: 'spawned'; version: string | null };

/**
 * Run the agent's `--version` probe and classify the result. The probe
 * has two distinct failure modes the catch arm has to discriminate:
 *
 *   - **Not invocable.** The OS rejected the spawn outright, OR the
 *     wrapper script spawned but its underlying interpreter / target
 *     failed. We split permission failures (EACCES / exit 126) from
 *     missing-target failures (ENOENT / ENOTDIR / exit 127) so Settings can
 *     offer permission-specific copy instead of treating every failure as a
 *     broken shim. We still mark the agent unavailable so Settings does not
 *     advertise a ghost entry (issue #658, lefarcen review P2 on PR #1301).
 *
 *   - **Spawned but `--version` was unhappy.** The binary itself ran
 *     (any other rejection: timeout, generic non-zero exit, stderr
 *     noise) so the CLI is invocable; we just can't read a version
 *     string. Adapters whose `--version` flag is unsupported land
 *     here and must keep working with `version: null`.
 *
 * `child_process.execFile` reports OS-level rejections with a string
 * `err.code` (`'ENOENT'`, `'EACCES'`, `'ENOTDIR'`) and non-zero exit
 * codes with a *numeric* `err.code` equal to the exit status, so the
 * two arms below are unambiguous.
 */
async function probeVersionAtPath(
  def: RuntimeAgentDef,
  resolved: string,
  env: NodeJS.ProcessEnv,
): Promise<VersionProbeOutcome> {
  try {
    const { stdout } = await execAgentFile(resolved, def.versionArgs, {
      env,
      timeout: def.versionProbeTimeoutMs ?? 3000,
    });
    const version = String(stdout).trim().split('\n')[0] ?? null;
    return { kind: 'spawned', version };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (typeof code === 'string') {
      if (code === 'EACCES') {
        return { kind: 'not-invocable', cause: 'not-executable' };
      }
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return { kind: 'not-invocable', cause: 'missing-target' };
      }
    } else if (typeof code === 'number' && (code === 126 || code === 127)) {
      return {
        kind: 'not-invocable',
        cause: code === 126 ? 'not-executable' : 'missing-target',
      };
    }
    return { kind: 'spawned', version: null };
  }
}

function unavailableAgent(
  def: RuntimeAgentDef,
  diagnostics: AgentDiagnostic[] = [],
): DetectedAgent {
  return {
    ...stripFns(def),
    models: def.fallbackModels ?? [DEFAULT_MODEL_OPTION],
    modelsSource: 'fallback',
    available: false,
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    ...installMetaForAgent(def.id),
  };
}

// Probe the agent's `--help` once and record which advertised flags the
// installed CLI supports, so buildArgs can consult the cache. Extracted from
// the main probe so it can run concurrently with model + auth probing instead
// of blocking them. Returns the capability map (or null when the agent
// declares no help/capability metadata or the probe failed).
async function probeCapabilities(
  def: RuntimeAgentDef,
  launchPath: string,
  env: NodeJS.ProcessEnv,
): Promise<RuntimeCapabilityMap | null> {
  if (!def.helpArgs || !def.capabilityFlags) return null;
  try {
    const { stdout, stderr } = await execAgentFile(launchPath, def.helpArgs, {
      env,
      timeout: 5000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return runtimeCapabilitiesFromHelpOutput(def.capabilityFlags, stdout, stderr);
  } catch {
    // If --help fails, leave caps empty so buildArgs falls back to the safe
    // baseline (no optional flags).
    return {};
  }
}

/**
 * CLI help is not consistently written to stdout. OpenCode 1.17, for
 * example, writes its yargs help (including the permission-bypass flag) to
 * stderr while still exiting successfully. Treat both process streams as the
 * one declarative help surface so a supported safety/permission flag cannot
 * disappear solely because of the stream chosen by the installed CLI.
 */
export function runtimeCapabilitiesFromHelpOutput(
  capabilityFlags: Record<string, string>,
  stdout: string | Buffer,
  stderr: string | Buffer,
): RuntimeCapabilityMap {
  const helpOutput = `${String(stdout)}\n${String(stderr)}`;
  const caps: RuntimeCapabilityMap = {};
  for (const [flag, key] of Object.entries(capabilityFlags)) {
    caps[key] = helpOutput.includes(flag);
  }
  return caps;
}

export function resolveProbedInputCapabilities(
  def: Pick<RuntimeAgentDef, 'inputCapabilityProbeKeys'>,
  capabilities: RuntimeCapabilityMap | null,
  version: string | null,
): ModelInputCapabilities | null {
  const keys = def.inputCapabilityProbeKeys;
  if (!keys) return null;
  const imageInput = keys.imageInput
    ? capabilities?.[keys.imageInput] === true
    : undefined;
  const fileInput = keys.fileInput
    ? capabilities?.[keys.fileInput] === true
    : imageInput;
  return {
    text: true,
    ...(imageInput !== undefined ? { imageInput } : {}),
    ...(fileInput !== undefined ? { fileInput } : {}),
    source: 'verified_probe',
    ...(version ? { revision: version } : {}),
  };
}

function applyProbedInputTransportToModels(
  models: RuntimeModelOption[],
  transport: ModelInputCapabilities | null,
): RuntimeModelOption[] {
  if (!transport || (transport.imageInput !== false && transport.fileInput !== false)) {
    return models;
  }
  return models.map((model) => {
    const input = model.metadata?.inputCapabilities;
    if (!input || (input.imageInput !== true && input.fileInput !== true)) return model;
    return {
      ...model,
      metadata: {
        ...model.metadata,
        inputCapabilities: {
          ...input,
          ...(transport.imageInput === false ? { imageInput: false } : {}),
          ...(transport.fileInput === false ? { fileInput: false } : {}),
          source: 'verified_probe',
          ...(transport.revision ? { revision: transport.revision } : {}),
        },
      },
    };
  });
}

async function probe(
  def: RuntimeAgentDef,
  configuredEnv: Record<string, string> = {},
  onInstalled: (agent: DetectedAgent) => void = () => {},
  systemProxyEnv: NodeJS.ProcessEnv = {},
): Promise<DetectedAgent> {
  if (def.id === 'codex') await refreshCodexAppDiscovery();
  // Detection must probe the exact path the runtime will spawn, not just the
  // PATH-visible shim. This is load-bearing for Codex under nvm/fnm/mise:
  // the discovered `codex` entry is often a `#!/usr/bin/env node` wrapper
  // that is not invocable from a GUI-launched app's stripped PATH, while the
  // launch resolver can still upgrade it to the packaged native Codex binary.
  // If detection probes the shim but chat/run spawns the native binary, the
  // UI incorrectly reports "not installed" until the user pins CODEX_BIN by
  // hand even though the real launch path is healthy.
  const launch = resolveAgentLaunch(def, configuredEnv);
  if (!launch.selectedPath || !launch.launchPath) {
    return unavailableAgent(def, [buildExecutableDiagnostic(def, configuredEnv)]);
  }
  const probeEnv = applyAgentLaunchEnv(
    spawnEnvForAgent(
      def.id,
      {
        ...process.env,
        ...(def.env || {}),
      },
      configuredEnv,
      systemProxyEnv,
      { resolvedBin: launch.selectedPath },
    ),
    launch,
  );
  const outcome = await probeVersionAtPath(def, launch.launchPath, probeEnv);
  if (outcome.kind === 'not-invocable') {
    return unavailableAgent(def, [
      buildNotInvocableDiagnostic(def, launch, outcome.cause),
    ]);
  }
  // Installation is established by launch/version probing. Optional model and
  // authentication metadata must never erase that evidence on a slow scan.
  onInstalled({
    ...stripFns(def), models: def.fallbackModels ?? [DEFAULT_MODEL_OPTION],
    modelsSource: 'fallback', available: true, path: launch.selectedPath,
    version: outcome.version, ...installMetaForAgent(def.id),
  });
  // The version probe must finish first (it gates availability), but the
  // three post-version probes are independent reads — run them concurrently
  // so a single agent's detection wall is max(help, models, auth) ≈ 5s rather
  // than the sum ≈ 15s. `--help` capabilities are cached on `agentCapabilities`
  // for buildArgs to consult.
  const [caps, modelResult, auth] = await Promise.all([
    probeCapabilities(def, launch.launchPath, probeEnv),
    fetchModels(def, launch.launchPath, probeEnv),
    probeAgentAuthStatus(def, launch.launchPath, probeEnv),
  ]);
  const surfacedModelResult = withRememberedAmrModels(def, probeEnv, modelResult);
  if (caps) {
    agentCapabilities.set(def.id, caps);
  }
  const authDiagnostic = auth ? buildAuthDiagnostic(def, auth) : null;
  const inputCapabilities = resolveProbedInputCapabilities(def, caps, outcome.version);
  const surfacedModels = applyProbedInputTransportToModels(
    surfacedModelResult.models,
    inputCapabilities,
  );
  return {
    ...stripFns(def),
    models: surfacedModels,
    modelsSource: surfacedModelResult.source,
    available: true,
    path: launch.selectedPath,
    version: outcome.version,
    ...(auth
      ? {
          authStatus: auth.status,
          ...(auth.message ? { authMessage: auth.message } : {}),
        }
      : {}),
    ...(authDiagnostic ? { diagnostics: [authDiagnostic] } : {}),
    ...(inputCapabilities ? { inputCapabilities } : {}),
    ...installMetaForAgent(def.id),
  };
}

function stripFns(
  def: RuntimeAgentDef,
): Omit<DetectedAgent, 'models' | 'modelsSource' | 'available' | 'path' | 'version'> {
  // Drop the buildArgs / listModels closures but keep declarative metadata
  // (reasoningOptions, streamFormat, name, bin, etc.). `models` is
  // populated separately by `fetchModels`, so we strip the static
  // `fallbackModels` slot here too. `helpArgs` / `capabilityFlags` /
  // `fallbackBins` / `maxPromptArgBytes` / `env` are probe-or-spawn-only
  // metadata and shouldn't bleed into the API response either.
  const {
    buildArgs,
    listModels,
    fetchModels,
    fallbackModels,
    helpArgs,
    capabilityFlags,
    inputCapabilityProbeKeys,
    fallbackBins,
    versionProbeTimeoutMs,
    maxPromptArgBytes,
    env,
    authProbe,
    ...rest
  } = def;
  return rest;
}

async function safeProbe(
  def: RuntimeAgentDef,
  configuredEnv: Record<string, string> = {},
  systemProxyEnv: NodeJS.ProcessEnv = {},
): Promise<DetectedAgent> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let installed: DetectedAgent | null = null;
  try {
    return await Promise.race([
      probe(def, configuredEnv, agent => { installed = agent; }, systemProxyEnv),
      new Promise<DetectedAgent>((resolve) => {
        timeout = setTimeout(() => resolve(installed ?? unavailableAgent(def)), 7000);
      }),
    ]);
  } catch {
    // Fault isolation (issue #2297): one adapter's probe blowing up
    // — e.g. a synchronous filesystem throw during PATH walking on a
    // packaged Windows daemon, or an async rejection from one of the
    // post-launch probes — must not collapse the whole agent picker.
    // Without this guard the bare `Promise.all` rejected and the
    // `/api/agents` catch arm returned `[]`, so the UI silently lost
    // every CLI option and fell back to BYOK / Cloud only.
    return unavailableAgent(def);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function rememberDetectedLiveModels(
  def: RuntimeAgentDef,
  configuredEnv: Record<string, string>,
  agent: DetectedAgent,
): void {
  if (def.id === 'amr' && agent.models.length === 0) return;
  const scope = def.id === 'amr'
    ? amrModelScopeFromEnv({
        ...process.env,
        ...(def.env || {}),
        ...configuredEnv,
      })
    : null;
  rememberLiveModels(agent.id, agent.models, scope);
}

export async function detectAgents(
  configuredEnvByAgent: Record<string, Record<string, string>> = {},
  options: AgentDetectionOptions = {},
) {
  const key = stableAgentEnvKey(configuredEnvByAgent);
  const now = Date.now();
  if (
    !options.force &&
    cachedAgentDetection &&
    cachedAgentDetection.key === key &&
    now - cachedAgentDetection.checkedAt < AGENT_DETECTION_CACHE_MS
  ) {
    return cachedAgentDetection.value;
  }
  if (agentDetectionRequest?.key === key) {
    return agentDetectionRequest.promise;
  }

  const run = async () => {
  const systemProxyEnv = await resolveSystemProxyEnvAsync();
  const results = await Promise.all(
    AGENT_DEFS.map((def) => safeProbe(def, configuredEnvByAgent?.[def.id] ?? {}, systemProxyEnv)),
  );
  // Refresh the validation cache from whatever we just surfaced to the UI
  // so /api/chat can accept any model the user could have just picked,
  // including ones that only showed up after a CLI re-auth.
  for (const [index, agent] of results.entries()) {
    const def = AGENT_DEFS[index];
    if (!def) continue;
    rememberDetectedLiveModels(def, configuredEnvByAgent?.[def.id] ?? {}, agent);
  }
    cachedAgentDetection = { checkedAt: Date.now(), key, value: results };
    return results;
  };

  agentDetectionRequest = { key, promise: run() };
  try {
    return await agentDetectionRequest.promise;
  } finally {
    if (agentDetectionRequest?.key === key) {
      agentDetectionRequest = null;
    }
  }
}

/**
 * Probe one selected runtime without scanning every installed provider. This is
 * the non-generating readiness primitive used when a composer becomes active.
 */
export async function detectAgent(
  agentId: string,
  configuredEnvByAgent: Record<string, Record<string, string>> = {},
  options: AgentDetectionOptions = {},
): Promise<DetectedAgent | null> {
  const def = AGENT_DEFS.find((candidate) => candidate.id === agentId);
  if (!def) return null;

  const envKey = stableAgentEnvKey({ [agentId]: configuredEnvByAgent[agentId] ?? {} });
  const key = `${agentId}:${envKey}`;
  const now = Date.now();
  const cached = targetedAgentDetectionCache.get(key);
  if (!options.force && cached && now - cached.checkedAt < AGENT_DETECTION_CACHE_MS) {
    return cached.value;
  }

  const fullCache = cachedAgentDetection;
  if (!options.force && fullCache && now - fullCache.checkedAt < AGENT_DETECTION_CACHE_MS) {
    const detected = fullCache.value.find((candidate) => candidate.id === agentId);
    if (detected) {
      targetedAgentDetectionCache.set(key, { checkedAt: now, value: detected });
      return detected;
    }
  }

  const pending = targetedAgentDetectionRequests.get(key);
  if (pending) return pending;

  const request = resolveSystemProxyEnvAsync().then(proxy => safeProbe(def, configuredEnvByAgent[agentId] ?? {}, proxy)).then((agent) => {
    rememberDetectedLiveModels(def, configuredEnvByAgent[agentId] ?? {}, agent);
    targetedAgentDetectionCache.set(key, { checkedAt: Date.now(), value: agent });
    return agent;
  });
  targetedAgentDetectionRequests.set(key, request);
  try {
    return await request;
  } finally {
    if (targetedAgentDetectionRequests.get(key) === request) {
      targetedAgentDetectionRequests.delete(key);
    }
  }
}

// Streaming variant: yields each agent the moment its probe settles, in
// completion order rather than registry order, so the UI can paint a card
// as soon as it resolves instead of waiting for the slowest CLI. The model
// validation cache is refreshed per-agent (same effect as the batch path,
// just incrementally). `detectAgents` keeps the array contract for callers
// that don't care about incremental delivery (cache warm, analytics, chat).
export async function* detectAgentsStream(
  configuredEnvByAgent: Record<string, Record<string, string>> = {},
  options: AgentDetectionOptions = {},
): AsyncGenerator<DetectedAgent> {
  const key = stableAgentEnvKey(configuredEnvByAgent);
  if (
    !options.force &&
    cachedAgentDetection &&
    cachedAgentDetection.key === key &&
    Date.now() - cachedAgentDetection.checkedAt < AGENT_DETECTION_CACHE_MS
  ) {
    for (const agent of cachedAgentDetection.value) {
      yield agent;
    }
    return;
  }

  const collected: DetectedAgent[] = [];
  const systemProxyEnv = await resolveSystemProxyEnvAsync();
  const tagged = AGENT_DEFS.map((def, index) =>
    safeProbe(def, configuredEnvByAgent?.[def.id] ?? {}, systemProxyEnv).then((agent) => {
      rememberDetectedLiveModels(def, configuredEnvByAgent?.[def.id] ?? {}, agent);
      return { index, agent };
    }),
  );
  const pending = new Set(tagged.keys());
  while (pending.size > 0) {
    const { index, agent } = await Promise.race(
      tagged.filter((_, i) => pending.has(i)),
    );
    pending.delete(index);
    collected.push(agent);
    yield agent;
  }
  cachedAgentDetection = { checkedAt: Date.now(), key, value: collected };
}
