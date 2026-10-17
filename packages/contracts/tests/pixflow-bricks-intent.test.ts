import { describe, expect, it } from 'vitest';

import {
  PIXFLOW_BRICKS_INTENT_CONTRACT_SCHEMA,
  PIXFLOW_BRICKS_INTENTS,
  PIXFLOW_BRICKS_MEDIA_POLICIES,
  PIXFLOW_BRICKS_PREFLIGHT_STATES,
} from '../src/index.js';

describe('Pixflow Bricks semantic intent contract', () => {
  it('publishes stable semantic-routing vocabularies', () => {
    expect(PIXFLOW_BRICKS_INTENT_CONTRACT_SCHEMA).toBe('pixflow.bricks.intent.v1');
    expect(PIXFLOW_BRICKS_INTENTS).toContain('html_to_bricks');
    expect(PIXFLOW_BRICKS_INTENTS).toContain('build_in_bricks');
    expect(PIXFLOW_BRICKS_INTENTS).toContain('answer_only');
    expect(PIXFLOW_BRICKS_MEDIA_POLICIES).toEqual([
      'generated',
      'placeholder',
      'existing',
      'none',
      'unspecified',
    ]);
    expect(PIXFLOW_BRICKS_PREFLIGHT_STATES).toEqual(['ready', 'needs_clarification']);
  });
});
