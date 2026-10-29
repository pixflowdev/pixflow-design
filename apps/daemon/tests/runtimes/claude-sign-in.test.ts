import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { afterEach, expect, test, vi } from 'vitest';
import { ClaudeSignIn } from '../../src/runtimes/claude-sign-in.js';

afterEach(() => vi.useRealTimers());
function setup() {
  const children: ChildProcess[] = [];
  const target = { executable: 'claude', command: 'claude', args: ['auth', 'login', '--claudeai'], env: {}, source: 'desktop' as const };
  const deps = {
    resolve: vi.fn(() => target),
    launch: vi.fn(() => { const child = Object.assign(new EventEmitter(), { kill: vi.fn() }) as unknown as ChildProcess; children.push(child); return child; }),
    verify: vi.fn(async () => true), stop: vi.fn(async () => {}), timeoutMs: 100,
  };
  return { login: new ClaudeSignIn(deps), deps, children, target };
}
test('duplicate start reuses one login and only verifies the selected target after exit', async () => {
  const { login, deps, children, target } = setup();
  expect(login.start()).toEqual({ state: 'waiting', source: 'desktop' });
  login.start(); expect(deps.launch).toHaveBeenCalledTimes(1);
  children[0]!.emit('close', 0); await Promise.resolve();
  expect(deps.verify).toHaveBeenCalledWith(target);
  expect(login.status().state).toBe('connected');
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
