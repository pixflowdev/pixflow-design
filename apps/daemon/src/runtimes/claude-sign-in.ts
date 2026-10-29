import { spawn, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createCommandInvocation, stopChildProcessTree } from '@open-design/platform';
import type { ClaudeSignInStatus } from '@open-design/contracts';
import { claudeAgentDef } from './defs/claude.js';
import { resolveAgentLaunch, applyAgentLaunchEnv } from './launch.js';
import { spawnEnvForAgent } from './env.js';
import { execAgentFile } from './invocation.js';

type Target = { executable: string; command: string; args: string[]; env: NodeJS.ProcessEnv; windowsVerbatimArguments?: boolean; source: 'desktop' | 'cli' };
type Dependencies = {
  resolve: () => Target | null;
  launch: (target: Target) => ChildProcess;
  verify: (target: Target) => Promise<boolean>;
  stop: (child: ChildProcess) => Promise<void>;
  timeoutMs: number;
};

/** One user-initiated login per Bridge. OAuth output and credentials never leave the child process. */
export class ClaudeSignIn {
  private value: ClaudeSignInStatus = { state: 'idle', source: null };
  private attempt = 0;
  private child: ChildProcess | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private deps: Dependencies) {}
  status(): ClaudeSignInStatus { return { ...this.value }; }
  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  start(): ClaudeSignInStatus {
    if (this.value.state === 'waiting') return this.status();
    const target = this.deps.resolve();
    if (!target) { this.value = { state: 'failed', source: null }; return this.status(); }
    const attempt = ++this.attempt;
    this.value = { state: 'waiting', source: target.source };
    try {
      const child = this.deps.launch(target); this.child = child;
      // Drain without retaining URLs, authorization codes or provider error output.
      child.stdout?.resume(); child.stderr?.resume();
      child.on('error', () => this.finish(attempt, 'failed'));
      child.on('close', (code) => {
        if (attempt !== this.attempt || this.value.state !== 'waiting') return;
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
    this.clearTimer(); this.child = null; this.value = { ...this.value, state };
  }
  cancel(state: 'cancelled' | 'timed-out' = 'cancelled'): ClaudeSignInStatus {
    if (this.value.state !== 'waiting') return this.status();
    ++this.attempt; this.clearTimer(); const child = this.child; this.child = null;
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
      return { ...invocation, executable: launch.launchPath, env, source: launch.appBundlePath ? 'desktop' : 'cli' };
    },
    launch: target => spawn(target.command, target.args, { env: target.env, cwd: tmpdir(), windowsHide: true,
      windowsVerbatimArguments: target.windowsVerbatimArguments, stdio: ['pipe', 'pipe', 'pipe'] }),
    verify: async target => {
      const { stdout } = await execAgentFile(target.executable, ['auth', 'status'], { env: target.env, timeout: 5000 });
      return JSON.parse(String(stdout)).loggedIn === true;
    },
    stop: stopChildProcessTree,
  });
}
