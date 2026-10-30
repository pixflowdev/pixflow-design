import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { tmpdir } from 'node:os';
import { createCommandInvocation, stopChildProcessTree } from '@open-design/platform';
import type { CodexUsage } from '@open-design/contracts';
import { codexAgentDef } from './defs/codex.js';
import { resolveAgentLaunch, applyAgentLaunchEnv, agentRuntimeSource } from './launch.js';
import { spawnEnvForAgent } from './env.js';

export function usageWindows(input: any): CodexUsage['windows'] {
  const buckets = input?.rateLimitsByLimitId && typeof input.rateLimitsByLimitId === 'object' && !Array.isArray(input.rateLimitsByLimitId)
    ? Object.entries(input.rateLimitsByLimitId) : [['codex', input?.rateLimits]];
  return buckets.flatMap(([key, bucket]: any) => [bucket?.primary, bucket?.secondary].flatMap(w => {
    if (!w || typeof w.usedPercent !== 'number' || !Number.isFinite(w.usedPercent)
      || typeof w.windowDurationMins !== 'number' || !Number.isFinite(w.windowDurationMins) || w.windowDurationMins <= 0) return [];
    return [{ bucket: String(key).slice(0, 100), durationMinutes: w.windowDurationMins,
      remainingPercent: Math.max(0, Math.min(100, 100 - w.usedPercent)),
      resetsAt: typeof w.resetsAt === 'number' && Number.isFinite(w.resetsAt) && w.resetsAt > 0 && w.resetsAt < 8640000000000 ? w.resetsAt : null }];
  }));
}

/** One bounded, read-only native request; no credentials, raw errors or account identity leave the process. */
export async function readCodexUsage(executable: string, env: NodeJS.ProcessEnv, source: CodexUsage['source'], timeoutMs = 10000): Promise<CodexUsage> {
  const empty = (): CodexUsage => ({ status: 'unavailable', source, checkedAt: new Date().toISOString(), windows: [] });
  return new Promise(resolve => {
    const invocation = createCommandInvocation({ command: executable, args: ['app-server', '--stdio'], env });
    const child = spawn(invocation.command, invocation.args, { cwd: tmpdir(), env, windowsHide: true,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments, stdio: ['pipe', 'pipe', 'pipe'] });
    let settled = false, buffer = '', identity = '', snapshot: unknown, expectedId = 1;
    const decoder = new StringDecoder('utf8');
    const finish = (result: CodexUsage) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      child.stdin.end(); void stopChildProcessTree(child).catch(() => { child.kill(); });
      resolve(result);
    };
    const timer = setTimeout(() => finish(empty()), timeoutMs);
    const send = (id: number, method: string, params?: unknown) => child.stdin.write(JSON.stringify({ id, method, ...(params === undefined ? {} : { params }) }) + '\n');
    child.on('error', () => finish(empty())); child.on('close', () => finish(empty()));
    child.stdin.on('error', () => finish(empty())); child.stderr.resume();
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += decoder.write(chunk);
      if (buffer.length > 1_000_000) return finish(empty());
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0 && !settled) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        let msg: any; try { msg = JSON.parse(line); } catch { continue; }
        if (msg?.id !== expectedId) continue;
        expectedId++;
        if (msg.error) return finish(empty());
        if (msg.id === 1) { child.stdin.write('{"method":"initialized"}\n'); send(2, 'account/read', { refreshToken: false }); }
        if (msg.id === 2) {
          if (!msg.result?.account) return finish(empty());
          identity = JSON.stringify(msg.result.account); send(3, 'account/rateLimits/read');
        }
        if (msg.id === 3) { snapshot = msg.result; send(4, 'account/read', { refreshToken: false }); }
        if (msg.id === 4) {
          if (JSON.stringify(msg.result?.account) !== identity) return finish(empty());
          const windows = usageWindows(snapshot);
          finish({ ...empty(), status: windows.length ? 'available' : 'unavailable', windows });
        }
      }
    });
    send(1, 'initialize', { clientInfo: { name: 'pixflow_usage', version: '1.0.0' } });
  });
}

export async function getCodexUsage(configured: Record<string, string>): Promise<CodexUsage> {
  const launch = resolveAgentLaunch(codexAgentDef, configured);
  if (!launch.launchPath) return { status: 'unavailable', source: null, checkedAt: new Date().toISOString(), windows: [] };
  const env = applyAgentLaunchEnv(spawnEnvForAgent('codex', process.env, configured, {}, { resolvedBin: launch.selectedPath }), launch);
  return readCodexUsage(launch.launchPath, env, agentRuntimeSource(launch));
}
