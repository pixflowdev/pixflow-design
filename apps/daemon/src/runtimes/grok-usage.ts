import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommandInvocation, stopChildProcessTree } from '@open-design/platform';
import type { CodexUsage } from '@open-design/contracts';
import { grokBuildAgentDef } from './defs/grok-build.js';
import { resolveAgentLaunch, applyAgentLaunchEnv, agentRuntimeSource } from './launch.js';
import { spawnEnvForAgent } from './env.js';

/** Read the account allowance only; session tokens and prepaid balances are not plan limits. */
export function grokUsageWindows(input: any): CodexUsage['windows'] {
  const config = input?.config;
  if (!config || typeof config !== 'object') return [];
  let used = config.creditUsagePercent;
  if (used === undefined && config.monthlyLimit && config.used) {
    const limit = config.monthlyLimit.val, value = config.used.val ?? 0;
    if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0 && typeof value === 'number' && Number.isFinite(value) && value >= 0) used = value / limit * 100;
  }
  if (typeof used !== 'number' || !Number.isFinite(used) || used < 0 || used > 100) return [];
  const period = config.currentPeriod;
  const date = (value: unknown) => typeof value === 'string' ? Date.parse(value) : NaN;
  const start = date(period?.start ?? config.billingPeriodStart);
  const end = date(period?.end ?? config.billingPeriodEnd);
  const durationMinutes = end > start ? (end - start) / 60_000 : period?.type === 'USAGE_PERIOD_TYPE_WEEKLY' ? 10080 : 0;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return [];
  return [{ bucket: 'grok-build', durationMinutes, remainingPercent: 100 - used, resetsAt: Number.isFinite(end) && end > 0 ? end / 1000 : null }];
}

/** Grok's read-only ACP billing extension works on Windows without starting a model/session. */
export async function readGrokUsage(executable: string, env: NodeJS.ProcessEnv, source: CodexUsage['source'], timeoutMs = 10000): Promise<CodexUsage> {
  const empty = (): CodexUsage => ({ status: 'unavailable', source, checkedAt: new Date().toISOString(), windows: [] });
  const cwd = await mkdtemp(join(tmpdir(), 'pixflow-grok-usage-'));
  try {
    return await new Promise<CodexUsage>(resolve => {
      const invocation = createCommandInvocation({ command: executable, args: ['agent', '--no-leader', 'stdio'], env });
      const child = spawn(invocation.command, invocation.args, { cwd, env, windowsHide: true,
        windowsVerbatimArguments: invocation.windowsVerbatimArguments, stdio: ['pipe', 'pipe', 'pipe'] });
      let settled = false, buffer = '', bytes = 0, expectedId = 1;
      const decoder = new StringDecoder('utf8');
      const finish = (result: CodexUsage) => {
        if (settled) return;
        settled = true; clearTimeout(timer); child.stdin.end();
        void stopChildProcessTree(child).catch(() => { child.kill(); }).finally(() => resolve(result));
      };
      const timer = setTimeout(() => finish(empty()), timeoutMs);
      const send = (id: number, method: string, params: unknown) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      child.on('error', () => finish(empty())); child.on('close', () => finish(empty()));
      child.stdin.on('error', () => finish(empty())); child.stderr.resume();
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 1_000_000) return finish(empty());
        buffer += decoder.write(chunk);
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0 && !settled) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          let msg: any; try { msg = JSON.parse(line); } catch { continue; }
          if (msg?.jsonrpc !== '2.0' || msg.id !== expectedId) continue;
          expectedId++;
          if (msg.error) return finish(empty());
          if (msg.id === 1) send(2, '_x.ai/billing', {});
          if (msg.id === 2) {
            const windows = grokUsageWindows(msg.result);
            finish({ ...empty(), status: windows.length ? 'available' : 'unavailable', windows });
          }
        }
      });
      send(1, 'initialize', { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: 'pixflow_usage', version: '1.0.0' } });
    });
  } catch { return empty(); }
  finally { await rm(cwd, { recursive: true, force: true }).catch(() => {}); }
}

export async function getGrokUsage(configured: Record<string, string>): Promise<CodexUsage> {
  const launch = resolveAgentLaunch(grokBuildAgentDef, configured);
  if (!launch.launchPath) return { status: 'unavailable', source: null, checkedAt: new Date().toISOString(), windows: [] };
  const env = applyAgentLaunchEnv(spawnEnvForAgent('grok-build', process.env, configured, {}, { resolvedBin: launch.selectedPath }), launch);
  return readGrokUsage(launch.launchPath, env, agentRuntimeSource(launch));
}
