import type { PixflowSettingsSurfaceProfile, PixflowProInstallation } from '@open-design/contracts';

/** Free navigation never mounts premium settings, including stale deep links. */
export function freeSettingsProfile(profile: PixflowSettingsSurfaceProfile, free: boolean, installation?: PixflowProInstallation['installation']): PixflowSettingsSurfaceProfile {
  if (!free) return profile;
  return { ...profile, allowedSections: profile.allowedSections.filter(section =>
    !['media', 'googleFonts', 'iconPacks', 'resources'].includes(section)
    && (section !== 'license' || installation === 'active')) };
}
