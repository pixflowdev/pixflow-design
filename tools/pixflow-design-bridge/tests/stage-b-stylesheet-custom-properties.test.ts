import { describe, expect, it } from 'vitest';

import { omitStageBStylesheetCustomPropertyDeclarations } from '../stage-b-stylesheet-custom-properties.mjs';

describe('Stage B stylesheet custom properties', () => {
  it('removes token declarations while retaining ordinary stylesheet declarations', () => {
    expect(omitStageBStylesheetCustomPropertyDeclarations({
      '--accent-soft': 'color-mix(in oklch, var(--brand) 18%, transparent)',
      '--font-display': 'system-ui, sans-serif',
      color: 'var(--brand)',
      background: 'linear-gradient(135deg, var(--surface), #080c14)',
    })).toEqual({
      color: 'var(--brand)',
      background: 'linear-gradient(135deg, var(--surface), #080c14)',
    });
  });
});
