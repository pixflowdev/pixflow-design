import { spawn, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';
import { createCommandInvocation, stopChildProcessTree } from '@open-design/platform';
import type { ClaudeSignInStatus } from '@open-design/contracts';
import { claudeAgentDef } from './defs/claude.js';
import { resolveAgentLaunch, applyAgentLaunchEnv, agentRuntimeSource } from './launch.js';
import { openBrowser } from '../browser-open.js';
import { spawnEnvForAgent } from './env.js';
import { execAgentFile } from './invocation.js';

type Target = { executable: string; command: string; args: string[]; env: NodeJS.ProcessEnv; windowsVerbatimArguments?: boolean; source: 'desktop' | 'cli' };
type Dependencies = {
  resolve: () => Target | null;
  launch: (target: Target) => ChildProcess;
  verify: (target: Target) => Promise<boolean>;
  stop: (child: ChildProcess) => Promise<void>;
  timeoutMs: number;
  open?: (url: string) => boolean;
};

/** One owned login per Bridge. OAuth URLs and codes never enter status, logs or settings. */
export class ClaudeSignIn {
  private value: ClaudeSignInStatus = { state: 'idle', source: null };
  private attempt = 0;
  private child: ChildProcess | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flowId = '';
  private output = '';
  private loginUrl = '';
  private acceptsCode = false;
  constructor(private deps: Dependencies) {}
  status(): ClaudeSignInStatus { return { ...this.value, ...(this.value.state === 'waiting'
    ? { attemptId: this.flowId, canOpenBrowser: !!this.loginUrl, acceptsCode: this.acceptsCode } : {}) }; }
  private consumeOutput(attempt: number, chunk: unknown) {
    if (attempt !== this.attempt || this.value.state !== 'waiting') return;
    this.output = stripVTControlCharacters((this.output + String(chunk)).slice(-16384));
    for (const match of this.output.matchAll(/https:\/\/[^\s\x00-\x1f\x7f<>"'`]+(?=[\s\x00-\x1f\x7f<>"'`])/g)) {
      try {
        const url = new URL(match[0].replace(/[)\].,;]+$/g, ''));
        if (url.href.length <= 8192 && !url.username && !url.password && !url.hash && (!url.port || url.port === '443')
          && ['claude.ai', 'claude.com', 'console.anthropic.com', 'platform.claude.com'].includes(url.hostname)
          && url.pathname === '/oauth/authorize') this.loginUrl = url.href;
      } catch { /* Incomplete chunks are retried after the next output event. */ }
    }
    if (/\b(?:paste|enter)\b[^\r\n]{0,45}\bcode\b/i.test(this.output)) this.acceptsCode = true;
  }
  private ownedAttempt(attemptId: unknown) {
    if (this.value.state !== 'waiting' || typeof attemptId !== 'string' || attemptId !== this.flowId || !this.child) throw new Error('This sign-in attempt is no longer active.');
    return this.child;
  }
  openLoginPage(attemptId: unknown): ClaudeSignInStatus {
    this.ownedAttempt(attemptId);
    if (!this.loginUrl || !this.deps.open?.(this.loginUrl)) throw new Error('The sign-in page could not be opened.');
    return this.status();
  }
  submitCode(attemptId: unknown, value: unknown): ClaudeSignInStatus {
    const child = this.ownedAttempt(attemptId);
    const code = typeof value === 'string' ? value.trim() : '';
    if (!this.acceptsCode || !code || code.length > 4096 || /[\u0000-\u0020\u007f]/.test(code)
      || !child.stdin?.writable || child.stdin.destroyed) throw new Error('A valid code for the active sign-in is required.');
    this.acceptsCode = false;
    this.output = '';
    child.stdin.write(code + '\n');
    return this.status();
  }
  private clearOutput() { this.output = ''; this.loginUrl = ''; this.acceptsCode = false; }
  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  start(): ClaudeSignInStatus {
    if (this.value.state === 'waiting') return this.status();
    const target = this.deps.resolve();
    if (!target) { this.value = { state: 'failed', source: null }; return this.status(); }
    const attempt = ++this.attempt;
    this.flowId = randomUUID(); this.clearOutput();
    this.value = { state: 'waiting', source: target.source };
    try {
      const child = this.deps.launch(target); this.child = child;
      // Parse only the bounded, process-owned recovery controls. Never expose raw output.
      child.stdout?.on('data', chunk => this.consumeOutput(attempt, chunk));
      child.stderr?.on('data', chunk => this.consumeOutput(attempt, chunk));
      child.stdin?.on('error', () => {
        if (attempt !== this.attempt || this.value.state !== 'waiting') return;
        this.finish(attempt, 'failed');
        void this.deps.stop(child).catch(() => { child.kill(); });
      });
      child.on('error', () => this.finish(attempt, 'failed'));
      child.on('close', (code) => {
        if (attempt !== this.attempt || this.value.state !== 'waiting') return;
        this.clearOutput(); this.child = null;
        if (code !== 0) { this.finish(attempt, 'failed'); return; }
        void this.deps.verify(target).then(ok => this.finish(attempt, ok ? 'connected' : 'failed'),
          () => this.finish(attempt, 'failed'));
      });
      this.timer = setTimeout(() => { if (attempt === this.attempt) this.cancel('timed-out'); }, this.deps.timeoutMs);
      this.timer.unref?.();
    } catch { this.finish(attempt, 'failed'); }
    return this.status();
  }
  private finish(attempt: number, state: ClaudeSignInStatus['state']) {
    if (attempt !== this.attempt || this.value.state !== 'waiting') return;
    this.clearTimer(); this.clearOutput(); this.child = null; this.value = { ...this.value, state };
  }
  cancel(state: 'cancelled' | 'timed-out' = 'cancelled'): ClaudeSignInStatus {
    if (this.value.state !== 'waiting') return this.status();
    ++this.attempt; this.clearTimer(); this.clearOutput(); const child = this.child; this.child = null;
    this.value = { ...this.value, state };
    if (child) void this.deps.stop(child).catch(() => { child.kill(); });
    return this.status();
  }
}

export function createClaudeSignIn(configuredEnv: () => Record<string, string>): ClaudeSignIn {
  return new ClaudeSignIn({
    timeoutMs: 5 * 60_000,
    resolve: () => {
      const configured = configuredEnv();
      const launch = resolveAgentLaunch(claudeAgentDef, configured);
      if (!launch.launchPath) return null;
      const env = applyAgentLaunchEnv(spawnEnvForAgent('claude', process.env, configured, {}, { resolvedBin: launch.selectedPath }), launch);
      // Subscription login must not silently alter a user's configured third-party gateway.
      if (env.ANTHROPIC_BASE_URL && !/^https:\/\/api\.anthropic\.com\/?$/.test(env.ANTHROPIC_BASE_URL)) return null;
      const invocation = createCommandInvocation({ command: launch.launchPath, args: ['auth', 'login', '--claudeai'], env });
      return { ...invocation, executable: launch.launchPath, env, source: agentRuntimeSource(launch) };
    },
    launch: target => spawn(target.command, target.args, { env: target.env, cwd: tmpdir(), windowsHide: true,
      windowsVerbatimArguments: target.windowsVerbatimArguments, stdio: ['pipe', 'pipe', 'pipe'] }),
    verify: async target => {
      const { stdout } = await execAgentFile(target.executable, ['auth', 'status'], { env: target.env, timeout: 5000 });
      return JSON.parse(String(stdout)).loggedIn === true;
    },
    stop: stopChildProcessTree,
    open: url => openBrowser(url, { warn: () => {} }) !== null,
  });
}
