import { describe, expect, it } from 'vitest';
import { localizeSkillDescription, localizeSkillName } from '../../src/i18n/content';
import { LOCALES } from '../../src/i18n/types';

describe('skill presentation and source ownership', () => {
  it('uses concise built-in descriptions without changing agent metadata', () => {
    const skill = Object.freeze({ id: 'wordpress-content', name: 'wordpress-content', description: 'Original execution instructions', source: 'built-in' as const });
    expect(localizeSkillName('en', skill)).toBe('WordPress Content');
    expect(localizeSkillDescription('en', skill)).toBe('Create and manage pages, posts and other site content.');
    expect(skill).toEqual({ id: 'wordpress-content', name: 'wordpress-content', description: 'Original execution instructions', source: 'built-in' });
  });

  it('never substitutes product metadata for a custom skill with a matching ID', () => {
    const skill = Object.freeze({ id: 'wordpress-content', name: 'My publishing rules', description: 'Keep all my custom instructions.', source: 'user' as const });
    for (const locale of LOCALES) {
      expect(localizeSkillName(locale, skill)).toBe(skill.name);
      expect(localizeSkillDescription(locale, skill)).toBe(skill.description);
    }
  });

  it('localizes locked discovery metadata through the same presentation path', () => {
    const locked = Object.freeze({ id: 'brandkit', name: 'Brand kits', description: 'Original summary', requiresPro: true as const });
    expect(localizeSkillDescription('en', locked)).toBe('Create coordinated brand boards, logo concepts and visual identities.');
    expect(locked.description).toBe('Original summary');
    expect(locked.requiresPro).toBe(true);
  });
});
