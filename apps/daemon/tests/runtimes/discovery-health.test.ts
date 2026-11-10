import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';

const { syncLookups, versionProbes } = vi.hoisted(() => ({
  syncLookups: vi.fn(), versionProbes: vi.fn(),
}));

vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return { ...fs, existsSync: (file: string) => {
    if (file.includes('pixflow-scan-miss')) syncLookups();
    return fs.existsSync(file);
  } };
});
vi.mock('../../src/runtimes/registry.js', async () => {
  const { claudeAgentDef } = await import('../../src/runtimes/defs/claude.js');
  const def = { ...claudeAgentDef, id: 'claude', fetchModels: undefined };
  return { AGENT_DEFS: [def], getAgentDef: (id: string) => id === def.id ? def : null };
});
vi.mock('../../src/runtimes/invocation.js', () => ({
  execAgentFile: async (_file: string, args: string[]) => {
    if (args.includes('--version')) versionProbes();
    await new Promise(resolve => setTimeout(resolve, 250));
    return { stdout: args.includes('--version') ? '1.0.0' : '', stderr: '' };
  },
}));
import { detectAgent, detectAgents, detectAgentsStream } from '../../src/runtimes/detection.js';

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it('keeps a cold provider scan off the HTTP thread and shares simultaneous discovery across callers', async () => {
  const root = join(tmpdir(), 'pixflow-scan-miss');
  vi.stubEnv('PATH', [join(root, 'first'), join(root, 'second')].join(delimiter));
  vi.stubEnv('OD_AGENT_HOME', root);
  const config = { claude: { CLAUDE_BIN: process.execPath } };
  const options = { force: true };
  async function stream() {
    const agents = [];
    for await (const agent of detectAgentsStream(config, options)) agents.push(agent);
    return agents;
  }
  const [list, streamed, other, selected] = await Promise.all([
    detectAgents(config, options), stream(), stream(), detectAgent('claude', config, options),
  ]);
  expect(list[0]?.available).toBe(true);
  expect(streamed).toEqual(list);
  expect(other).toEqual(list);
  expect(selected).toEqual(list[0]);
  expect(syncLookups.mock.calls.length).toBe(0);
  expect(versionProbes).toHaveBeenCalledTimes(1);
});
