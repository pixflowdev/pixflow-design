import { describe, expect, it } from 'vitest';

import {
  normalizeDesignValueProvenance,
  provenanceKey,
} from '../src/index.js';

describe('design-value provenance', () => {
  it('keeps framework membership independent from design-context eligibility', () => {
    const userToken = normalizeDesignValueProvenance({
      resourceType: 'variable',
      resourceId: 'user-space',
      origin: 'user',
      frameworkMembership: 'not_member',
      designContextEligible: true,
      scope: 'site',
    }, '2026-08-16T00:00:00.000Z');

    expect(userToken.frameworkMembership).toBe('not_member');
    expect(userToken.designContextEligible).toBe(true);
  });

  it('forces generated and imported values out of active design context', () => {
    expect(normalizeDesignValueProvenance({
      resourceType: 'variable',
      resourceId: 'pf-source-color',
      origin: 'pixflow_generated',
      generator: 'html_to_bricks',
      frameworkMembership: 'member',
      designContextEligible: true,
      scope: 'site',
    }).designContextEligible).toBe(false);
  });

  it('uses stable type/id keys', () => {
    expect(provenanceKey('palette_color', 'accent-1')).toBe('palette_color:accent-1');
  });
});
