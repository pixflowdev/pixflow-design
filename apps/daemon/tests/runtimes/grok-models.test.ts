import { test } from 'vitest';
import assert from 'node:assert/strict';
import { grokBuildAgentDef, parseGrokBuildModels } from '../../src/runtimes/defs/grok-build.js';
import { resolveRuntimeReasoning } from '../../src/runtimes/claude-models.js';

const liveModels = `You are logged in with grok.com.

Default model: grok-4.7

Available models:
  * grok-4.7 (default)
  - grok-4.7-build-fast
  - grok-4.6
  - grok-4.5
  - grok-4.7
`;

test('Grok discovers live models once and exposes model-specific reasoning controls', () => {
  const models = parseGrokBuildModels(liveModels);
  assert.deepEqual(models.map(({ id }) => id), ['default', 'grok-4.7', 'grok-4.7-build-fast', 'grok-4.6', 'grok-4.5']);
  for (const model of models.slice(1, 4)) {
    assert.deepEqual(model.reasoningOptions?.map(({ id }) => id), ['default', 'low', 'medium', 'high', 'xhigh']);
  }
  assert.deepEqual(models[4]?.reasoningOptions?.map(({ id }) => id), ['default', 'low', 'medium', 'high']);
  // The CLI config can select an unknown custom model: do not guess its capabilities.
  assert.deepEqual(models[0]?.reasoningOptions, []);
});

test('Grok sends every supported effort to current models', () => {
  for (const model of parseGrokBuildModels(liveModels).slice(1)) {
    const efforts = model.id === 'grok-4.5' ? ['low', 'medium', 'high'] : ['low', 'medium', 'high', 'xhigh'];
    for (const reasoning of efforts) {
      const validated = resolveRuntimeReasoning(grokBuildAgentDef, model.id, reasoning);
      assert.equal(validated, reasoning, 'chat and connection-test validation preserves supported effort');
      const args = grokBuildAgentDef.buildArgs('', [], [], { model: model.id, reasoning: validated! }, { promptFilePath: '/tmp/prompt.txt' });
      assert.deepEqual(args.slice(-2), ['--effort', reasoning], `${model.id} ${reasoning}`);
    }
  }
});

test('Grok never sends unsupported effort levels or guesses unknown model capabilities', () => {
  for (const [model, reasoning] of [
    ['grok-4.7', 'max'], ['grok-4.5', 'xhigh'], ['grok-4.20-non-reasoning', 'high'],
    ['grok-custom', 'high'], ['default', 'high'], ['grok-build', 'high'],
    ['grok-4.7', 'default'],
  ] as const) {
    assert.equal(grokBuildAgentDef.buildArgs('', [], [], { model, reasoning }, { promptFilePath: '/tmp/prompt.txt' }).includes('--effort'), false, `${model} ${reasoning}`);
  }
  assert.deepEqual(parseGrokBuildModels('- grok-custom')[1]?.reasoningOptions, []);
  assert.deepEqual(grokBuildAgentDef.fallbackModels.map(({ id }) => id), ['default']);
});
