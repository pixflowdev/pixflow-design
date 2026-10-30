import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { afterEach, expect, test, vi } from 'vitest';
import { ClaudeSignIn } from '../../src/runtimes/claude-sign-in.js';

afterEach(() => vi.useRealTimers());
function setup() {
  const children: ChildProcess[] = [];
  const target = { executable: 'claude', command: 'claude', args: ['auth', 'login', '--claudeai'], env: {}, source: 'desktop' as const };
  const deps = {
    resolve: vi.fn(() => target),
    launch: vi.fn(() => { const child = Object.assign(new EventEmitter(), { kill: vi.fn(), stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough() }) as unknown as ChildProcess; children.push(child); return child; }),
    open: vi.fn(() => true),
    verify: vi.fn(async () => true), stop: vi.fn(async () => {}), timeoutMs: 100,
  };
  return { login: new ClaudeSignIn(deps), deps, children, target };
}
test('duplicate start reuses one login and only verifies the selected target after exit', async () => {
  const { login, deps, children, target } = setup();
  expect(login.start()).toMatchObject({ state: 'waiting', source: 'desktop' });
  login.start(); expect(deps.launch).toHaveBeenCalledTimes(1);
  children[0]!.emit('close', 0); await Promise.resolve();
  expect(deps.verify).toHaveBeenCalledWith(target);
  expect(login.status().state).toBe('connected');
});

test('retains only an official sign-in URL privately and sends a manual code only to its owned attempt', () => {
  const {login,children,deps}=setup(); const first=login.start();
  children[0]!.stdout!.emit('data','Open https://claude.ai/oauth/auth');
  children[0]!.stdout!.emit('data','orize?state=private-state&client_id=official\nPaste code here if prompted:');
  expect(login.status()).toMatchObject({state:'waiting',canOpenBrowser:true,acceptsCode:true,attemptId:expect.any(String)});
  expect(JSON.stringify(login.status())).not.toContain('private-state');
  login.openLoginPage(first.attemptId!);
  expect(deps.open).toHaveBeenCalledWith('https://claude.ai/oauth/authorize?state=private-state&client_id=official');
  const input=vi.spyOn(children[0]!.stdin!,'write');
  expect(()=>login.submitCode('stale-attempt','synthetic-code#state')).toThrow();
  expect(input).not.toHaveBeenCalled();
  login.submitCode(first.attemptId!,'synthetic-code#state');
  expect(input).toHaveBeenCalledWith('synthetic-code#state\n');
  expect(login.status().acceptsCode).toBe(false);
  expect(JSON.stringify(login.status())).not.toContain('synthetic-code');
  expect(()=>login.submitCode(first.attemptId!,'duplicate')).toThrow();
  login.cancel();
});

test('rejects non-provider URLs and control characters without sending anything to the process', () => {
  const {login,children,deps}=setup(); const status=login.start();
  children[0]!.stderr!.emit('data','https://claude.ai.evil.test/oauth/authorize?state=private\nPaste code here if prompted:');
  expect(login.status().canOpenBrowser).toBe(false);
  expect(()=>login.openLoginPage(status.attemptId!)).toThrow();
  expect(deps.open).not.toHaveBeenCalled();
  const input=vi.spyOn(children[0]!.stdin!,'write');
  expect(()=>login.submitCode(status.attemptId!,'code\nsecond-line')).toThrow();
  expect(input).not.toHaveBeenCalled(); login.cancel();
});

test('cancelled attempt output and codes cannot affect a new login', () => {
  const {login,children}=setup(); const old=login.start(); login.cancel(); const current=login.start();
  children[0]!.stdout!.emit('data','https://claude.ai/oauth/authorize?state=old\nPaste code:');
  expect(login.status()).toMatchObject({attemptId:current.attemptId,canOpenBrowser:false,acceptsCode:false});
  expect(()=>login.submitCode(old.attemptId,'synthetic')).toThrow(); login.cancel();
});

test('broken owned input stops only the login child and does not expose the error', async () => {
  const {login,children,deps}=setup(); login.start();
  children[0]!.stdin!.emit('error',new Error('private-code'));
  expect(login.status()).toEqual({state:'failed',source:'desktop'});
  expect(deps.stop).toHaveBeenCalledWith(children[0]);
});
test('successful process exit is not proof of authentication', async () => {
  const { login, deps, children } = setup(); deps.verify.mockResolvedValue(false);
  login.start(); children[0]!.emit('close', 0); await Promise.resolve();
  expect(login.status().state).toBe('failed');
});
test('cancellation stops only its owned process and fences stale completion', async () => {
  const { login, deps, children } = setup();
  login.start(); login.cancel(); login.start(); children[0]!.emit('close', 0);
  expect(deps.stop).toHaveBeenCalledWith(children[0]);
  expect(deps.verify).not.toHaveBeenCalled();
  expect(login.status().state).toBe('waiting');
  children[1]!.emit('close', 0); await Promise.resolve();
  expect(login.status().state).toBe('connected');
});
test('timeout is bounded and permits a fresh attempt', async () => {
  vi.useFakeTimers(); const { login, deps } = setup(); login.start();
  await vi.advanceTimersByTimeAsync(101);
  expect(login.status().state).toBe('timed-out'); expect(deps.stop).toHaveBeenCalledTimes(1);
  expect(login.start().state).toBe('waiting'); login.cancel();
});
test('spawn failures and provider output are not disclosed in status', () => {
  const { login, children } = setup(); login.start();
  children[0]!.emit('error', new Error('private OAuth URL'));
  expect(login.status()).toEqual({ state: 'failed', source: 'desktop' });
});
test('late verification cannot replace cancelled state', async () => {
  const { login, children, deps } = setup();
  let finish!: (value: boolean) => void;
  deps.verify.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  login.start(); children[0]!.emit('close', 0); login.cancel(); finish(true); await Promise.resolve();
  expect(login.status().state).toBe('cancelled');
});
