import { describe, expect, it } from 'vitest';

import { skillMatchesQuery } from '../../src/runtime/design-toolbox';
import type { SkillSummary } from '../../src/types';

function skill(overrides: Partial<SkillSummary> = {}): SkillSummary {
  return {
    id: 'html-to-bricks',
    name: 'HTML to Bricks',
    description: 'Convert existing HTML into a Bricks handoff.',
    triggers: ['/html-to-bricks'],
    mode: 'prototype',
    surface: 'web',
    platform: null,
    scenario: 'bricks-agent',
    category: 'pixflow-mcp',
    source: 'built-in',
    previewType: 'markdown',
    designSystemRequired: false,
    defaultFor: [],
    upstream: null,
    hasBody: true,
    examplePrompt: '',
    aggregatesExamples: false,
    ...overrides,
  };
}

describe('skillMatchesQuery', () => {
  it('matches hyphenated skill ids and commands as plain words', () => {
    const htmlToBricks = skill();

    expect(skillMatchesQuery(htmlToBricks, 'html')).toBe(true);
    expect(skillMatchesQuery(htmlToBricks, 'html to')).toBe(true);
    expect(skillMatchesQuery(htmlToBricks, 'to bricks')).toBe(true);
    expect(skillMatchesQuery(htmlToBricks, 'HTML')).toBe(true);
  });
});
