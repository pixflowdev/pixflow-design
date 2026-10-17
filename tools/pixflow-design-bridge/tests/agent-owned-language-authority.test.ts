import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const cli = readFileSync(new URL('../bricks-handoff-cli.mjs', import.meta.url), 'utf8');
const planner = readFileSync(new URL('../bricks-agent/mutation-planner.mjs', import.meta.url), 'utf8');
const normalizer = readFileSync(new URL('../bricks-agent/result-normalizer.mjs', import.meta.url), 'utf8');

describe('Bricks bridge agent-owned language authority', () => {
  it('does not promote or synthesize operations from the natural-language prompt', () => {
    expect(cli).not.toContain('promoteNaturalPrototypeBricksRoute');
    expect(cli).not.toContain('strictSelectedReferenceDesignAnswer');
    expect(cli).not.toContain('changedSelectionDesignTargetAnswer');
    expect(cli).not.toContain('deterministicWorkingMemoryFact');
    expect(cli).not.toContain('explicitlyReferencesSelectedBricksElement');
    expect(cli).not.toContain('priorIntentSelectionConflict');
    expect(cli).not.toMatch(/generationPrompt[\s\S]{0,300}\.match\(/);
    expect(cli).not.toMatch(/skip questions\|just build\|no questions/);
  });

  it('contains no prompt-derived mutation or memory constructors', () => {
    for (const forbidden of [
      'codeSourceFromPrompt',
      'codeSourceFromNaturalAttributePrompt',
      'proposedDynamicDataExpression',
      'proposedTextReplacementValue',
      'buildDirectLoggedInConditionModelResult',
      'buildProposedVisibilityConditionFact',
      'directConditionFromPrompt',
      'isDirectQueryLoopPrompt',
      'buildDirectQueryLoopModelResult',
      'buildProposedQueryLoopFact',
      'buildDirectLinkPatchModelResult',
      'request?.prompt',
      'request.prompt',
    ]) {
      expect(planner).not.toContain(forbidden);
    }
    expect(normalizer).not.toContain('inferNaturalPrototypeBricksGenerationScope');
    expect(normalizer).not.toContain('promoteNaturalPrototypeBricksRoute');
  });
});
