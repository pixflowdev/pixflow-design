import { spawn, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';
import { createCommandInvocation, stopChildProcessTree } from '@open-design/platform';
import type { ClaudeSignInStatus, ClaudeSupportStage } from '@open-design/contracts';
import { claudeAgentDef } from './defs/claude.js';
import { resolveAgentLaunch, applyAgentLaunchEnv, agentRuntimeSource } from './launch.js';
import { openBrowser } from '../browser-open.js';
import { spawnEnvForAgent } from './env.js';
import { execAgentFile } from './invocation.js';
import { ClaudeSupportHistory } from './claude-support-history.js';

const CLAUDE_AUTHORIZATION_ORIGINS = new Set([
  'https://claude.ai',
  'https://claude.com',
  'https://console.anthropic.com',
  'https://platform.claude.com',
]);

/** The owned runtime supplies the path; trusted origins and OAuth shape bound recovery. */
function officialClaudeAuthorizationUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.href.length > 8192 || url.username || url.password || url.hash || !CLAUDE_AUTHORIZATION_ORIGINS.has(url.origin)) return null;
    const parameter = (name: string) => {
      const values = url.searchParams.getAll(name);
      return values.length === 1 && values[0] && !/[\u0000-\u0020\u007f]/.test(values[0]) ? values[0] : null;
    };
    if (parameter('response_type') !== 'code' || !parameter('client_id') || !parameter('state')
      || parameter('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(parameter('code_challenge') || '')) return null;
    const redirectValue = parameter('redirect_uri');
    if (!redirectValue) return null;
    const redirect = new URL(redirectValue);
    if (redirect.username || redirect.password || redirect.hash) return null;
    const loopback = redirect.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(redirect.hostname);
    if (!loopback && !CLAUDE_AUTHORIZATION_ORIGINS.has(redirect.origin)) return null;
    return url.href;
  } catch { return null; }
}

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
  private evidenceSite = '';
  private milestones: { at: string; stage: ClaudeSupportStage; exitCode?: number }[] = [];
  private mark(stage: ClaudeSupportStage, exitCode?: number) {
    const event = { at: new Date().toISOString(), stage, ...(exitCode == null ? {} : { exitCode }) };
    this.milestones.push(event);
    this.history?.append(this.evidenceSite, this.value.source, event);
    if (this.milestones.length > 32) this.milestones.shift();
  }
  diagnostics(site: string) {
    const file = this.history?.snapshot(site);
    const current = site === this.evidenceSite && this.milestones.length > 0;
    return { state: current ? this.value.state : file?.milestones.length ? 'previous-session' : 'not-observed',
      source: current ? this.value.source : file?.source ?? null, storage: file?.storage ?? 'file-unavailable',
      milestones: file?.storage === 'private-file' && file.milestones.length ? file.milestones : current ? this.milestones.map(e => ({...e})) : file?.milestones ?? [] };
  }
  constructor(private deps: Dependencies, private history?: ClaudeSupportHistory) {}
  status(): ClaudeSignInStatus { return { ...this.value, ...(this.value.state === 'waiting'
    ? { attemptId: this.flowId, canOpenBrowser: !!this.loginUrl, acceptsCode: this.acceptsCode } : {}) }; }
  private consumeOutput(attempt: number, chunk: unknown) {
    if (attempt !== this.attempt || this.value.state !== 'waiting') return;
    this.output = stripVTControlCharacters((this.output + String(chunk)).slice(-16384));
    for (const match of this.output.matchAll(/https:\/\/[^\s\x00-\x1f\x7f<>"'`]+(?=[\s\x00-\x1f\x7f<>"'`])/g)) {
      const url = officialClaudeAuthorizationUrl(match[0].replace(/[)\].,;]+$/g, ''));
      if (url && !this.loginUrl) this.mark('authorization-address-detected');
      if (url) this.loginUrl = url;
    }
    if (!this.acceptsCode && /\b(?:paste|enter)\b[^\r\n]{0,45}\bcode\b/i.test(this.output)) {
      this.acceptsCode = true;
      this.mark('manual-code-requested');
    }
  }
  private ownedAttempt(attemptId: unknown) {
    if (this.value.state !== 'waiting' || typeof attemptId !== 'string' || attemptId !== this.flowId || !this.child) throw new Error('This sign-in attempt is no longer active.');
    return this.child;
  }
  openLoginPage(attemptId: unknown): ClaudeSignInStatus {
    this.ownedAttempt(attemptId);
    if (!this.loginUrl || !this.deps.open?.(this.loginUrl)) {
      this.mark('browser-reopen-failed');
      throw new Error('The sign-in page could not be opened.');
    }
    this.mark('browser-reopen-dispatched');
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
    this.mark('manual-code-submitted');
    return this.status();
  }
  private clearOutput() { this.output = ''; this.loginUrl = ''; this.acceptsCode = false; }
  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  start(site = ''): ClaudeSignInStatus {
    if (this.value.state === 'waiting') return this.status();
    if (this.evidenceSite !== site) this.milestones = [];
    this.evidenceSite = site;
    const target = this.deps.resolve();
    this.value = { state: target ? 'waiting' : 'failed', source: target?.source ?? null };
    this.mark('start-requested');
    if (!target) { this.mark('no-supported-login-runtime'); return this.status(); }
    const attempt = ++this.attempt;
    this.flowId = randomUUID(); this.clearOutput();
    try {
      const child = this.deps.launch(target); this.child = child;
      child.on('spawn', () => { if (attempt === this.attempt && this.value.state === 'waiting') this.mark('process-started'); });
      // Parse only the bounded, process-owned recovery controls. Never expose raw output.
      child.stdout?.on('data', chunk => this.consumeOutput(attempt, chunk));
      child.stderr?.on('data', chunk => this.consumeOutput(attempt, chunk));
      child.stdin?.on('error', () => {
        if (attempt !== this.attempt || this.value.state !== 'waiting') return;
        this.mark('stdin-failed'); this.finish(attempt, 'failed');
        void this.deps.stop(child).catch(() => { child.kill(); });
      });
      child.on('error', () => { if (attempt === this.attempt && this.value.state === 'waiting') this.mark('launch-failed'); this.finish(attempt, 'failed'); });
      child.on('close', (code) => {
        if (attempt !== this.attempt || this.value.state !== 'waiting') return;
        this.mark('process-exited', code ?? undefined);
        this.clearOutput(); this.child = null;
        if (code !== 0) { this.finish(attempt, 'failed'); return; }
        void this.deps.verify(target).then(ok => this.finish(attempt, ok ? 'connected' : 'failed', ok ? 'auth-verified' : 'auth-not-signed-in'),
          () => this.finish(attempt, 'failed', 'auth-check-failed'));
      });
      this.timer = setTimeout(() => { if (attempt === this.attempt) this.cancel('timed-out'); }, this.deps.timeoutMs);
      this.timer.unref?.();
    } catch { this.finish(attempt, 'failed', 'launch-failed'); }
    return this.status();
  }
  private finish(attempt: number, state: ClaudeSignInStatus['state'], stage?: ClaudeSupportStage) {
    if (attempt !== this.attempt || this.value.state !== 'waiting') return;
    if (stage) this.mark(stage);
    this.clearTimer(); this.clearOutput(); this.child = null; this.value = { ...this.value, state };
  }
  cancel(state: 'cancelled' | 'timed-out' = 'cancelled'): ClaudeSignInStatus {
    if (this.value.state !== 'waiting') return this.status();
    this.mark(state);
    ++this.attempt; this.clearTimer(); this.clearOutput(); const child = this.child; this.child = null;
    this.value = { ...this.value, state };
    if (child) void this.deps.stop(child).catch(() => { child.kill(); });
    return this.status();
  }
}

export function createClaudeSignIn(configuredEnv: () => Record<string, string>, dataDir?: string): ClaudeSignIn {
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
      const { args, timeoutMs } = claudeAgentDef.authProbe;
      const { stdout } = await execAgentFile(target.executable, args, { env: target.env, timeout: timeoutMs });
      return JSON.parse(String(stdout)).loggedIn === true;
    },
    stop: stopChildProcessTree,
    open: url => openBrowser(url, { warn: () => {} }) !== null,
  }, dataDir ? new ClaudeSupportHistory(dataDir) : undefined);
}
