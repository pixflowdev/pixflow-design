import type { PixflowSurface } from './pixflow-surface.js';

/** Stable IDs used by the existing shared SettingsDialog. */
export const PIXFLOW_SETTINGS_SECTION_IDS = [
  'dictation',
  'execution',
  'instructions',
  'media',
  'composio',
  'orbit',
  'routines',
  'integrations',
  'mcpClient',
  'language',
  'appearance',
  'critiqueTheater',
  'notifications',
  'pet',
  'skills',
  'resourcePacks',
  'resources',
  'googleFonts',
  'iconPacks',
  'designSystems',
  'memory',
  'license',
  'tokenMapping',
  'pixflowMcp',
  'bricksExtensions',
  'library',
  'about',
] as const;

export type PixflowSettingsSectionId = (typeof PIXFLOW_SETTINGS_SECTION_IDS)[number];

export type PixflowSettingsSurfaceProfile = {
  surface: PixflowSurface;
  allowedSections: readonly PixflowSettingsSectionId[];
  defaultSection: PixflowSettingsSectionId;
  /** Controls are owned by the shared modal; this only narrows visibility. */
  optionalControls: {
    themeSwitcher: boolean;
    executionMode: boolean;
    memory: boolean;
    skills: boolean;
    mcp: boolean;
  };
  /** Hidden sections must not mount, fetch data, or accept deep-link commands. */
  mountHiddenSections: false;
  fetchHiddenSectionData: false;
};

/**
 * Settings destinations intentionally exposed by the shared Pixflow modal.
 *
 * Legacy IDs stay in PIXFLOW_SETTINGS_SECTION_IDS so saved links and older
 * callers remain type-safe, but they are not allowed to mount. Language and
 * Instructions now resolve to their consolidated parent sections below.
 */
const SHARED_SECTIONS: readonly PixflowSettingsSectionId[] = [
  'dictation',
  'execution',
  'memory',
  'media',
  'skills',
  'pixflowMcp',
  'resourcePacks',
  'resources',
  'designSystems',
  'tokenMapping',
  'bricksExtensions',
  'googleFonts',
  'iconPacks',
  'mcpClient',
  'composio',
  'orbit',
  'routines',
  'appearance',
  'license',
  'library',
  'about',
];

const CONSOLIDATED_SETTINGS_SECTIONS: Readonly<Partial<Record<PixflowSettingsSectionId, PixflowSettingsSectionId>>> = {
  instructions: 'memory',
  language: 'appearance',
};

export const PIXFLOW_SETTINGS_PROFILES = {
  bricks_builder: {
    surface: 'bricks_builder',
    allowedSections: SHARED_SECTIONS,
    defaultSection: 'execution',
    optionalControls: {
      themeSwitcher: true,
      executionMode: true,
      memory: true,
      skills: false,
      mcp: true,
    },
    mountHiddenSections: false,
    fetchHiddenSectionData: false,
  },
  wp_admin: {
    surface: 'wp_admin',
    allowedSections: SHARED_SECTIONS,
    defaultSection: 'execution',
    optionalControls: {
      themeSwitcher: true,
      executionMode: true,
      memory: true,
      skills: true,
      mcp: true,
    },
    mountHiddenSections: false,
    fetchHiddenSectionData: false,
  },
} as const satisfies Record<PixflowSurface, PixflowSettingsSurfaceProfile>;

export function getPixflowSettingsSurfaceProfile(
  surface: PixflowSurface,
  bricksActive = true,
  etchActive = false,
): PixflowSettingsSurfaceProfile {
  const profile = PIXFLOW_SETTINGS_PROFILES[surface];
  return bricksActive ? profile : {
    ...profile,
    allowedSections: profile.allowedSections.filter((section) => ![
      'bricksExtensions', 'tokenMapping', ...(etchActive ? [] : ['designSystems']),
    ].includes(section)),
  };
}
export function isPixflowSettingsSectionAllowed(
  profile: PixflowSettingsSurfaceProfile,
  section: PixflowSettingsSectionId | string | undefined,
): section is PixflowSettingsSectionId {
  return typeof section === 'string'
    && profile.allowedSections.includes(section as PixflowSettingsSectionId);
}

/**
 * Resolve initial/deep-linked navigation before the shared modal mounts. A
 * disallowed section therefore cannot trigger its component or data fetch.
 */
export function resolvePixflowSettingsSection(
  profile: PixflowSettingsSurfaceProfile,
  requested: PixflowSettingsSectionId | string | undefined,
): PixflowSettingsSectionId {
  if (isPixflowSettingsSectionAllowed(profile, requested)) {
    return requested;
  }

  const consolidated = typeof requested === 'string'
    ? CONSOLIDATED_SETTINGS_SECTIONS[requested as PixflowSettingsSectionId]
    : undefined;

  return consolidated && isPixflowSettingsSectionAllowed(profile, consolidated)
    ? consolidated
    : profile.defaultSection;
}
