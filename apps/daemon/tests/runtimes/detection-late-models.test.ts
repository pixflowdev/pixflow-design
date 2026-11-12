import { afterEach, expect, test, vi } from 'vitest';

vi.mock('../../src/runtimes/executables.js', async original => ({ ...await original<object>(), discoveryPathLookup: vi.fn(async () => () => null) }));
vi.mock('../../src/runtimes/launch.js', async original => ({ ...await original<object>(), resolveAgentLaunch: vi.fn(() => ({ selectedPath: 'fixture-claude', launchPath: 'fixture-claude', launchKind: 'selected', childPathPrepend: [] })), applyAgentLaunchEnv: vi.fn(env => env) }));
vi.mock('../../src/runtimes/invocation.js', () => ({ execAgentFile: vi.fn(async () => ({ stdout: '1.0.0', stderr: '' })) }));
vi.mock('../../src/runtimes/auth.js', async original => ({ ...await original<object>(), probeAgentAuthStatus: vi.fn(async () => null) }));
vi.mock('@open-design/platform', async original => ({ ...await original<object>(), resolveSystemProxyEnvAsync: vi.fn(async () => ({})) }));

import { detectAgent } from '../../src/runtimes/detection.js';
import { claudeAgentDef } from '../../src/runtimes/defs/claude.js';
import { getRememberedLiveModels } from '../../src/runtimes/models.js';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

test('late Claude catalogue replaces the partial scan and authorizes the displayed model', async () => {
  vi.useFakeTimers();
  let complete!: (value: any) => void;
  const fetchModels = vi.spyOn(claudeAgentDef, 'fetchModels').mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const pending = detectAgent('claude', {}, { force: true });
  await vi.advanceTimersByTimeAsync(7001);
  expect((await pending)?.models.map(item => item.id)).toEqual(['default']);
  expect((await detectAgent('claude', {}, { force: true }))?.available).toBe(true);
  expect(fetchModels).toHaveBeenCalledTimes(1);
  complete({ source: 'live', models: [{ id: 'sonnet', label: 'Runtime Sonnet' }] });
  await vi.advanceTimersByTimeAsync(0);
  expect((await detectAgent('claude'))?.models.map(item => item.id)).toEqual(['sonnet']);
  expect(getRememberedLiveModels('claude').map(item => item.id)).toEqual(['sonnet']);
});
