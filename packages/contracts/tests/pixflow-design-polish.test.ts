import { expect, it } from 'vitest';
import { pixflowDesignPolishInstruction, pixflowDesignPolishReference } from '../src/prompts/pixflow-design-polish.js';

it.each([
  ['bricks', 'bricks/workflows/enhanced-design.md'],
  ['etch', 'etch/design-polish.md'],
  ['elementor', 'elementor/design-polish.md'],
])('routes %s independently of other installed builders', (editor, path) => {
  expect(pixflowDesignPolishReference({ editor, bricksIntegrationActive: true }, 'legacy-canvas')).toBe(path);
  expect(pixflowDesignPolishInstruction(true, { editor }, 'legacy-canvas')).toContain(path);
});
it('keeps administrative context neutral and off truly off', () => {
  expect(pixflowDesignPolishReference({ bricksIntegrationActive: true })).toBe('pixflow/frontend-design/SKILL.md');
  expect(pixflowDesignPolishReference({ editor: 'wp-admin', bricksIntegrationActive: true }, 'stale-canvas')).toBe('pixflow/frontend-design/SKILL.md');
  expect(pixflowDesignPolishInstruction(false, { editor: 'elementor' })).toBe('');
});
