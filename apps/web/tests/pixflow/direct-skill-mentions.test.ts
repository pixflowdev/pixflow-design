import { describe, expect, it } from 'vitest';
import { directSkillMentions, isDiscoverableSkillMention } from '../../src/pixflow/direct-skill-mentions';
describe('Direct skill mention context', () => {
  it('preserves both composer metadata shapes without duplicate hints', () => {
    expect(directSkillMentions({skillIds:['query-loops'],context:{skillIds:['query-loops','online-research']}})).toEqual(['query-loops','online-research']);
    expect(directSkillMentions({context:{skillIds:['wordpress-code-projects']}})).toEqual(['wordpress-code-projects']);
  });
  it('treats absent or malformed metadata as no explicit hints', () => {
    expect(directSkillMentions()).toEqual([]);
    expect(directSkillMentions({skillIds:['',null,3,'  forms  '],context:{skillIds:'not-an-array'}})).toEqual(['forms']);
  });
});


describe('Mention discovery versus skill access', () => {
  it('retires duplicate and internal shortcuts without changing submitted IDs', () => {
    for (const id of ['element-controls', 'bricks-forms', 'bricks-interactions', 'build-in-bricks-html-first', 'bricks-schema', 'wordpress-gutenberg-apply-transaction']) {
      expect(isDiscoverableSkillMention(id)).toBe(false);
      expect(directSkillMentions({skillIds:[id]})).toEqual([id]);
    }
    for (const id of ['forms', 'interactions', 'prototype-bricks', 'wordpress-gutenberg-authoring', 'online-research', 'wp-admin-code-projects', 'third-party-skill']) expect(isDiscoverableSkillMention(id)).toBe(true);
  });
});
