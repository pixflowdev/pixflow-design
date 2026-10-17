import { describe, expect, it } from 'vitest';
import { assertBuildInBricksRequestedSkillsAllowed, loadBuildInBricksSkillAuthorities } from '../../src/pixflow/build-in-bricks-skill-authority.js';

describe('Free host skill authority boundary', () => {
  it('rejects arbitrary workflows before provider launch', () => {
    expect(() => assertBuildInBricksRequestedSkillsAllowed([
      'build-in-bricks-html-first', 'prototype-poison-modern-hero',
      'website-clone', 'html-to-bricks', 'bricks-operation-html-to-bricks-stage-b',
    ])).toThrow(/prototype-poison-modern-hero.*website-clone.*html-to-bricks.*stage-b/i);
  });
  it('rejects a missing plugin authority without reading private resources', async () => {
    await expect(loadBuildInBricksSkillAuthorities({ authority: null })).rejects.toThrow(/AUTHORITY_MISSING/);
  });
});
