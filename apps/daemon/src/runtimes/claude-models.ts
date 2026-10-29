import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { StringDecoder } from 'node:string_decoder';
import { join } from 'node:path';
import { createCommandInvocation, stopChildProcessTree } from '@open-design/platform';
import { DEFAULT_MODEL_OPTION, sanitizeCustomModel } from './models.js';
import type { RuntimeEnv, RuntimeModelOption, RuntimeAgentDef } from './types.js';

let selectedClaudeModels: RuntimeModelOption[] = [];
/** Retain only the latest catalogue for argument validation; never persist user settings. */
export function rememberClaudeModels(models: RuntimeModelOption[] | null): void {
  selectedClaudeModels = models ?? [];
}
export function claudeSupportsEffort(model: string | null | undefined, effort: string): boolean {
  return effort !== 'default' && !!selectedClaudeModels.find(m => m.id === (model || 'default'))
    ?.reasoningOptions?.some(option => option.id === effort);
}

/** Validate request effort at the same boundary for test calls and actual chat runs. */
export function resolveRuntimeReasoning(def: RuntimeAgentDef | null, model: string | null | undefined, effort: unknown): string | undefined {
  if (!def || typeof effort !== 'string') return undefined;
  return def.id === 'claude'
    ? (claudeSupportsEffort(model, effort) ? effort : undefined)
    : def.reasoningOptions?.find(option => option.id === effort)?.id;
}

/** Only advertise models returned by the selected runtime, never guessed version IDs. */
export function parseClaudeModels(value: unknown): RuntimeModelOption[] | null {
  if (!Array.isArray(value)) return null;
  const models: RuntimeModelOption[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(0, 500)) {
    if (!item || typeof item !== 'object' || item.disabled === true || item.enabled === false) continue;
    const id = typeof item.value === 'string' ? sanitizeCustomModel(item.value) : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = typeof item.displayName === 'string' ? item.displayName.trim().slice(0, 200) : id;
    const levels = item.supportsEffort !== false && Array.isArray(item.supportedEffortLevels)
      ? [...new Set<string>(item.supportedEffortLevels.filter((level: unknown): level is string =>
        typeof level === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(level)))].slice(0, 20) : [];
    const reasoningOptions = levels.length ? [
      { id: 'default', label: 'Default (Claude)' },
      ...levels.filter(level => level !== 'default').map(level => ({ id: level,
        label: level === 'xhigh' ? 'Extra' : level.charAt(0).toUpperCase() + level.slice(1) })),
    ] : [];
    models.push({ id, label: label || id, reasoningOptions });
  }
  if (!models.length) return null;
  return seen.has('default') ? models : [DEFAULT_MODEL_OPTION, ...models];
}

/** Initialize the CLI control protocol without a user prompt, tools, hooks or saved session. */
export async function discoverClaudeModels(executable: string, env: RuntimeEnv, timeoutMs = 7000): Promise<RuntimeModelOption[] | null> {
  const cwd = await mkdtemp(join(tmpdir(), 'pixflow-claude-models-'));
  try {
    const invocation = createCommandInvocation({ command: executable, env, args: [
      '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
      '--no-session-persistence', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
      '--settings', '{"disableAllHooks":true}', '--setting-sources', 'user',
    ] });
    return await new Promise(resolve => {
      const child = spawn(invocation.command, invocation.args, { cwd, env, windowsHide: true,
        windowsVerbatimArguments: invocation.windowsVerbatimArguments, stdio: ['pipe', 'pipe', 'pipe'] });
      let finished = false, buffer = '', bytes = 0;
      const decoder = new StringDecoder('utf8');
      const finish = (models: RuntimeModelOption[] | null) => {
        if (finished) return;
        finished = true; clearTimeout(timer);
        child.stdin.end();
        void stopChildProcessTree(child).catch(() => { child.kill(); }).finally(() => resolve(models));
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      child.stderr.resume(); // Never log account information, auth URLs or credentials.
      child.on('error', () => finish(null));
      child.on('close', () => finish(null));
      child.stdin.on('error', () => finish(null));
      child.stdout.on('data', (chunk: Buffer) => {
        if (finished) return;
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) { finish(null); return; }
        buffer += decoder.write(chunk);
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0 && !finished) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          try {
            const message = JSON.parse(line);
            if (message.type === 'control_response' && message.response?.request_id === 'pixflow-models') {
              finish(message.response.subtype === 'success' ? parseClaudeModels(message.response.response?.models) : null);
            }
          } catch { /* Ignore non-protocol startup output. */ }
        }
      });
      child.stdin.write(JSON.stringify({ type: 'control_request', request_id: 'pixflow-models', request: { subtype: 'initialize' } }) + '\n');
    });
  } finally { await rm(cwd, { recursive: true, force: true }); }
}

export async function discoverClaudeCatalogue(primary: string, fallback: string | null, env: RuntimeEnv,
  discover = discoverClaudeModels): Promise<{ models: RuntimeModelOption[]; source: 'live' | 'cli-fallback' } | null> {
  const models = await discover(primary, env).catch(() => null);
  if (models?.length) return { models, source: 'live' };
  if (!fallback || fallback === primary) return null;
  const cliModels = await discover(fallback, env).catch(() => null);
  return cliModels?.length ? { models: cliModels, source: 'cli-fallback' } : null;
}
