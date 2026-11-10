import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, expect, test, vi } from 'vitest';
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal<object>(), spawn: vi.fn() }));
vi.mock('@open-design/platform', async importOriginal => ({ ...await importOriginal<object>(), stopChildProcessTree: vi.fn(async () => {}) }));
vi.mock('../../src/runtimes/launch.js', async importOriginal => ({ ...await importOriginal<object>(), resolveAgentLaunch: vi.fn() }));
import { spawn } from 'node:child_process';
import { resolveAgentLaunch } from '../../src/runtimes/launch.js';
import { getCodexUsage, readCodexUsage, usageWindows } from '../../src/runtimes/codex-usage.js';
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
const weekly = { usedPercent: 81, windowDurationMins: 10080, resetsAt: 1793784989 };
test('weekly-only accounts do not acquire a fabricated five-hour window', () => {
  expect(usageWindows({ rateLimits: { primary: weekly, secondary: null } })).toEqual([
    { bucket: 'codex', durationMinutes: 10080, remainingPercent: 19, resetsAt: weekly.resetsAt },
  ]);
});
test('prefers all named buckets and preserves actual durations rather than slot meanings', () => {
  const windows = usageWindows({ rateLimits: { primary: weekly }, rateLimitsByLimitId: {
    codex: { primary: { ...weekly, windowDurationMins: 300 }, secondary: weekly },
    other: { secondary: { ...weekly, windowDurationMins: 60 } },
  } });
  expect(windows.map(w => w.durationMinutes)).toEqual([300, 10080, 60]);
});
test('unavailable and malformed windows are not reported as zero usage', () => {
  expect(usageWindows(null)).toEqual([]);
  expect(usageWindows({ rateLimits: { primary: { ...weekly, usedPercent: null }, secondary: { ...weekly, windowDurationMins: NaN } } })).toEqual([]);
  expect(usageWindows({ rateLimitsByLimitId: {}, rateLimits: { primary: weekly } })).toEqual([]);
});
test('clamps percentages and rejects invalid reset timestamps', () => {
  const windows = usageWindows({ rateLimits: { primary: { ...weekly, usedPercent: -2, resetsAt: Infinity }, secondary: { ...weekly, usedPercent: 110 } } });
  expect(windows.map(w => w.remainingPercent)).toEqual([100, 0]);
  expect(windows[0]?.resetsAt).toBeNull();
});
function child() {
  const process = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
  vi.mocked(spawn).mockReturnValue(process as never);
  const requests: any[] = [];
  process.stdin.on('data', chunk => requests.push(JSON.parse(String(chunk))));
  const reply = (id: number, result: unknown) => process.stdout.write(JSON.stringify({ id, result }) + '\n');
  return { process, requests, reply };
}
test.each(['desktop', 'cli'] as const)('%s performs only bounded read-only protocol requests', async source => {
  const { reply, requests } = child(); const pending = readCodexUsage('codex', {}, source);
  reply(1, {}); reply(2, { account: { id: 'private-id' } }); reply(3, { rateLimits: { primary: weekly } }); reply(4, { account: { id: 'private-id' } });
  const result = await pending;
  expect(result.status).toBe('available'); expect(result.source).toBe(source);
  expect(JSON.stringify(result)).not.toContain('private-id');
  expect(requests.map(r => r.method)).toEqual(['initialize', 'initialized', 'account/read', 'account/rateLimits/read', 'account/read']);
  expect(requests.filter(r => r.method === 'account/read').every(r => r.params.refreshToken === false)).toBe(true);
});
test('changing account during lookup discards the previous account usage', async () => {
  const { reply } = child(); const pending = readCodexUsage('codex', {}, 'cli');
  reply(1, {}); reply(2, { account: { id: 'first' } }); reply(3, { rateLimits: { primary: weekly } }); reply(4, { account: { id: 'second' } });
  expect((await pending).status).toBe('unavailable');
});
test('a stalled runtime times out without a fabricated result', async () => {
  vi.useFakeTimers(); child(); const pending = readCodexUsage('codex', {}, 'cli', 100);
  await vi.advanceTimersByTimeAsync(101); expect((await pending).windows).toEqual([]);
});
test('provider errors are not exposed to WordPress', async () => {
  const { process } = child(); const pending = readCodexUsage('codex', {}, 'cli');
  process.stdout.write(JSON.stringify({ id: 1, error: { message: 'secret token' } }) + '\n');
  expect(JSON.stringify(await pending)).not.toContain('secret');
});
test.each(['desktop', 'cli'] as const)('uses the chat launch resolver for %s selection', async source => {
  const path = source === 'desktop' ? '/desktop/codex' : '/standalone/codex';
  vi.mocked(resolveAgentLaunch).mockReturnValue({ selectedPath: path, launchPath: path, appBundlePath: source === 'desktop' ? path : null, childPathPrepend: [] } as unknown as ReturnType<typeof resolveAgentLaunch>);
  const { reply } = child(); const configured = { CODEX_HOME: '/isolated/auth' };
  const pending = getCodexUsage(configured);
  reply(1, {}); reply(2, { account: { id: 'private-id' } }); reply(3, { rateLimits: { primary: weekly } }); reply(4, { account: { id: 'private-id' } });
  expect((await pending).source).toBe(source);
  expect(resolveAgentLaunch).toHaveBeenCalledWith(expect.objectContaining({ id: 'codex' }), configured);
  expect(spawn).toHaveBeenCalledWith(path, ['app-server', '--stdio'], expect.objectContaining({ env: expect.objectContaining({ CODEX_HOME: '/isolated/auth' }) }));
});
