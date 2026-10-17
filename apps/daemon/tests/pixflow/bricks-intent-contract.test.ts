import { describe, expect, it } from 'vitest';

import { sanitizePixflowBricksIntentContract } from '../../src/pixflow/bricks-intent-contract.js';

describe('Pixflow Bricks semantic intent forwarding', () => {
  it('preserves the exact semantic mutation subject and placement for the Bridge', () => {
    expect(sanitizePixflowBricksIntentContract({
      schema: 'pixflow.bricks.intent.v1',
      intent: 'selected_element',
      scope: 'selected_element',
      mediaPolicy: 'none',
      mediaSurface: 'none',
      state: 'ready',
      confidence: 0.95,
      clarification: null,
      skillIds: ['selected-element'],
      capabilityIds: [],
      rationale: 'Move the shortened paragraph below the image.',
      targetElementIds: ['qo8ha4'],
      placement: {
        mode: 'after',
        targetId: 'mtpbzv',
        targetLabel: 'image',
        preserveExisting: true,
        rationale: 'Place the existing paragraph after the image.',
      },
      sourceLifecycle: 'initial_source_generation',
      generationRequirements: [],
      retainedEdit: null,
    })).toMatchObject({
      schema: 'pixflow.bricks.intent.v1',
      intent: 'selected_element',
      targetElementIds: ['qo8ha4'],
      placement: {
        mode: 'after',
        targetId: 'mtpbzv',
        preserveExisting: true,
      },
    });
  });

  it('rejects malformed or unsupported client contracts instead of forwarding authority-shaped data', () => {
    expect(sanitizePixflowBricksIntentContract(null)).toBeNull();
    expect(sanitizePixflowBricksIntentContract({
      schema: 'wrong.schema',
      intent: 'selected_element',
    })).toBeNull();
  });
});
