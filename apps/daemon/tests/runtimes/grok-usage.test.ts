import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, expect, test, vi } from 'vitest';
vi.mock('node:child_process', async original => ({ ...await original<object>(), spawn: vi.fn() }));
vi.mock('@open-design/platform', async original => ({ ...await original<object>(), stopChildProcessTree: vi.fn(async () => {}) }));
import { spawn } from 'node:child_process';
import { stopChildProcessTree } from '@open-design/platform';
import { grokUsageWindows, readGrokUsage } from '../../src/runtimes/grok-usage.js';

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
const billing = { config: { creditUsagePercent: 4, currentPeriod: {
  type: 'USAGE_PERIOD_TYPE_WEEKLY', start: '2026-11-06T00:38:01Z', end: '2026-11-13T00:38:01Z',
}, prepaidBalance: { val: 123 }, history: ['private'] }, subscription_tier: 'private' };

test('Grok uses the real account percentage and reporting period, not token or cost totals', () => {
  expect(grokUsageWindows(billing)).toEqual([{ bucket: 'grok-build', durationMinutes: 10080, remainingPercent: 96, resetsAt: Date.parse('2026-11-13T00:38:01Z') / 1000 }]);
  expect(grokUsageWindows({ usage: { total_tokens: 2000 }, total_cost_usd: 1 })).toEqual([]);
});
test('monthly and legacy periods use their actual dates', () => {
  const period = { start: '2026-02-01T00:00:00Z', end: '2026-03-01T00:00:00Z' };
  expect(grokUsageWindows({ config: { creditUsagePercent: 20, currentPeriod: period } })[0]?.durationMinutes).toBe(28 * 1440);
  expect(grokUsageWindows({ config: { monthlyLimit: { val: 2000 }, used: {}, billingPeriodStart: period.start, billingPeriodEnd: period.end } })[0]?.remainingPercent).toBe(100);
});
test('missing or malformed usage never means a full allowance', () => {
  for (const creditUsagePercent of [null, -1, 101, NaN, Infinity, '4']) {
    expect(grokUsageWindows({ config: { ...billing.config, creditUsagePercent } })).toEqual([]);
  }
  for (const value of [null, {}, { config: null }, { config: { monthlyLimit: {val:0}, used:{val:0} } }]) expect(grokUsageWindows(value)).toEqual([]);
  expect(grokUsageWindows({ config: {creditUsagePercent:0, currentPeriod:{type:'USAGE_PERIOD_TYPE_WEEKLY'}} })[0]?.resetsAt).toBeNull();
});
function fixture() {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
  vi.mocked(spawn).mockReturnValue(child as never);
  const requests: any[] = [];
  child.stdin.on('data', chunk => requests.push(JSON.parse(String(chunk))));
  const reply = (id: number, result: unknown) => child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  return { child, requests, reply };
}
test('native Grok protocol reads billing without opening a session or running a model', async () => {
  const {child, requests, reply} = fixture();
  const pending = readGrokUsage('grok', {}, 'cli');
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  reply(99, billing); reply(1, { protocolVersion: 1 }); reply(1, {}); reply(2, billing);
  const result = await pending;
  expect(requests.map(r => r.method)).toEqual(['initialize', '_x.ai/billing']);
  expect(result.status).toBe('available'); expect(result.windows[0]?.remainingPercent).toBe(96);
  expect(JSON.stringify(result)).not.toMatch(/private|prepaid|subscription/);
  expect(spawn).toHaveBeenCalledWith('grok', ['agent', '--no-leader', 'stdio'], expect.objectContaining({ windowsHide: true }));
  expect(stopChildProcessTree).toHaveBeenCalledWith(child);
});
test('unsupported protocol and auth errors return unavailable without leaking diagnostics', async () => {
  const {child, requests} = fixture(); const pending = readGrokUsage('grok', {}, 'cli');
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  child.stdout.write('{"jsonrpc":"2.0","id":1,"error":{"message":"private token"}}\n');
  const result = await pending;
  expect(result.status).toBe('unavailable'); expect(JSON.stringify(result)).not.toContain('private');
});
test('a stalled or noisy runtime is bounded and terminated', async () => {
  const {requests, child} = fixture(); const pending = readGrokUsage('grok', {}, 'cli', 150);
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  expect((await pending).status).toBe('unavailable'); expect(stopChildProcessTree).toHaveBeenCalledWith(child);
  const second = fixture(); const noisy = readGrokUsage('grok', {}, 'cli');
  await vi.waitFor(() => expect(second.requests).toHaveLength(1));
  second.child.stdout.write('x'.repeat(1_000_001)); expect((await noisy).status).toBe('unavailable');
});
