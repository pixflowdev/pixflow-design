import { describe, expect, it } from 'vitest';

import { buildStageBSourceClassNamePlan } from '../stage-b-source-class-collisions.mjs';

describe('Stage A source-class collision handling', () => {
  it('prefixes an entire BEM tree with one three-letter run prefix when any member already exists', () => {
    const plan = buildStageBSourceClassNamePlan(
      ['hero', 'hero__title', 'hero__cta--primary'],
      {
        sourceId: 'Aurora homepage',
        existingGlobalClasses: [{ id: 'existing-hero-title', name: 'hero__title' }],
      },
    );

    expect(plan.prefix).toBe('aur');
    expect([...plan.names.values()]).toEqual([
      'aur-hero',
      'aur-hero__title',
      'aur-hero__cta--primary',
    ]);
  });

  it('chooses another three-letter prefix when the preferred prefixed tree also exists', () => {
    const plan = buildStageBSourceClassNamePlan(
      ['hero', 'hero__title'],
      {
        sourceId: 'Aurora homepage',
        existingGlobalClasses: [
          { id: 'existing-title', name: 'hero__title' },
          { id: 'existing-prefixed-title', name: 'aur-hero__title' },
        ],
      },
    );

    expect(plan.prefix).toMatch(/^[a-z]{3}$/);
    expect(plan.prefix).not.toBe('aur');
    expect([...plan.names.values()]).toEqual([
      `${plan.prefix}-hero`,
      `${plan.prefix}-hero__title`,
    ]);
  });

  it('preserves source names when the site has no collision', () => {
    const plan = buildStageBSourceClassNamePlan(
      ['feature', 'feature__title'],
      {
        sourceId: 'Aurora homepage',
        existingGlobalClasses: [{ id: 'existing-card', name: 'card' }],
      },
    );

    expect([...plan.names.values()]).toEqual(['feature', 'feature__title']);
  });
});
