import { describe, expect, it } from 'vitest';
import { getPixflowSettingsSurfaceProfile, resolvePixflowSettingsSection } from '@open-design/contracts';
import { freeSettingsProfile } from '../../src/pixflow/free-settings-profile';

describe('Free settings navigation', () => {
  it('hides premium sections and rejects their deep links while preserving core settings', () => {
    const original = getPixflowSettingsSurfaceProfile('wp_admin');
    const free = freeSettingsProfile(original, true);
    for (const section of ['media', 'googleFonts', 'iconPacks', 'license', 'resources'] as const) {
      expect(free.allowedSections).not.toContain(section);
      expect(resolvePixflowSettingsSection(free, section)).toBe(free.defaultSection);
    }
    for (const section of ['execution', 'memory', 'about', 'appearance']) expect(free.allowedSections).toContain(section);
    expect(original.allowedSections).toContain('license');
  });
  it('retains Pro settings unchanged', () => {
    const original = getPixflowSettingsSurfaceProfile('wp_admin');
    expect(freeSettingsProfile(original, false)).toBe(original);
  });
  it('allows licence activation only after the Pro add-on is installed, without unlocking asset managers', () => {
    const original = getPixflowSettingsSurfaceProfile('wp_admin');
    for (const state of ['missing', 'inactive', 'incomplete', 'incompatible'] as const) expect(freeSettingsProfile(original, true, state).allowedSections).not.toContain('license');
    for (const installation of ['active'] as const) {
      const profile = freeSettingsProfile(original, true, installation);
      expect(profile.allowedSections).toContain('license');
      for (const section of ['media', 'googleFonts', 'iconPacks']) expect(profile.allowedSections).not.toContain(section);
    }
  });
});
