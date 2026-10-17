import { describe, expect, it } from 'vitest';

import { buildBridgeCodexRunnerArgsForTest } from '../bricks-handoff-cli.mjs';
import { buildPresetInvocationForTest } from '../bricks-native-prototype/runner.mjs';

describe('Codex Fast mode bridge forwarding', () => {
  it('enables live research in both bridge runner paths independently of Fast mode', () => {
    const options = { workspaceDir: 'C:/pixflow-workspace', fastMode: false };
    expect(buildBridgeCodexRunnerArgsForTest(options)).toContain('web_search="live"');
    expect(buildPresetInvocationForTest('codex', options).args).toContain('web_search="live"');
  });
  it('forwards Luna, Medium, and Fast through the handoff runner', () => {
    const args = buildBridgeCodexRunnerArgsForTest({
      workspaceDir: 'C:/pixflow-workspace',
      model: 'gpt-5.6-luna',
      reasoning: 'medium',
      fastMode: true,
    });

    expect(args).toContain('gpt-5.6-luna');
    expect(args).toContain('model_reasoning_effort="medium"');
    expect(args).toContain('service_tier="fast"');
  });

  it('forwards Luna, Medium, and Fast through the native prototype runner', () => {
    const invocation = buildPresetInvocationForTest('codex', {
      workspaceDir: 'C:/pixflow-workspace',
      model: 'gpt-5.6-luna',
      reasoning: 'medium',
      fastMode: true,
    });

    expect(invocation.args).toContain('gpt-5.6-luna');
    expect(invocation.args).toContain('model_reasoning_effort="medium"');
    expect(invocation.args).toContain('service_tier="fast"');
  });

  it('does not request the Fast service tier when the toggle is off', () => {
    const args = buildBridgeCodexRunnerArgsForTest({
      workspaceDir: 'C:/pixflow-workspace',
      model: 'gpt-5.6-luna',
      reasoning: 'medium',
      fastMode: false,
    });

    expect(args).not.toContain('service_tier="fast"');
  });
});
