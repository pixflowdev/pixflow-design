import { describe, expect, it } from 'vitest';
import { getPixflowSettingsSurfaceProfile } from '../src/api/pixflow-settings-profile.js';

describe('WordPress settings parity', () => {
  it('shares design systems with Etch without enabling Bricks controls', () => {
    const sections = getPixflowSettingsSurfaceProfile('wp_admin', false, true).allowedSections;
    expect(sections).toContain('designSystems');
    expect(sections).not.toContain('bricksExtensions');
    expect(sections).not.toContain('tokenMapping');
  });
  it('offers the same complete settings in WP Admin as the builder', () => {
    expect(getPixflowSettingsSurfaceProfile('wp_admin').allowedSections)
      .toEqual(getPixflowSettingsSurfaceProfile('bricks_builder').allowedSections);
  });
  it('filters Bricks sections by active integration, not by where settings opened', () => {
    for (const surface of ['wp_admin', 'bricks_builder'] as const) {
      const sections = getPixflowSettingsSurfaceProfile(surface, false).allowedSections;
      expect(sections).not.toContain('bricksExtensions');
      expect(sections).not.toContain('tokenMapping');
      expect(sections).not.toContain('designSystems');
      expect(sections).toEqual(expect.arrayContaining(['media', 'skills', 'dictation', 'memory', 'license']));
    }
  });
});
