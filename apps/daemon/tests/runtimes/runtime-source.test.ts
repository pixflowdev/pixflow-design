import { expect, test } from 'vitest';
import { agentRuntimeSource } from '../../src/runtimes/launch.js';

test('reports Desktop only for the executable selected from the app', () => {
  expect(agentRuntimeSource({ selectedPath: '/app/claude', appBundlePath: '/app/claude' })).toBe('desktop');
  expect(agentRuntimeSource({ selectedPath: '/app/codex', appBundlePath: '/app/codex' })).toBe('desktop');
  expect(agentRuntimeSource({ selectedPath: '/bin/claude', appBundlePath: '/app/claude' })).toBe('cli');
  expect(agentRuntimeSource({ selectedPath: '/bin/codex', appBundlePath: null })).toBe('cli');
  expect(agentRuntimeSource({ selectedPath: null, appBundlePath: null })).toBe('cli');
});
