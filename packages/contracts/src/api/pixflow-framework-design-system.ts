import type { DesignSystemSummary } from './registry.js';

export const PIXFLOW_FRAMEWORK_PROFILE_SCHEMA = 'pixflow-framework-profile/v1' as const;

export type PixflowFrameworkColorGroup = {
  background: string;
  foreground: string;
  heading: string;
  text: string;
  accent: string;
};

export type PixflowFrameworkDesignSystemProfile = {
  colors: {
    main: PixflowFrameworkColorGroup;
    secondary: PixflowFrameworkColorGroup;
    tertiary: PixflowFrameworkColorGroup;
    quaternary?: PixflowFrameworkColorGroup;
    quinary?: PixflowFrameworkColorGroup;
    senary?: PixflowFrameworkColorGroup;
  };
  sourcePalette?: string[];
  neutralTintHex?: string | null;
  colorSchemeCount?: number;
  headingFont: string;
  bodyFont: string;
  typographySize?: 'small' | 'regular' | 'large';
  headingWeightPreset?: 'normal' | 'medium' | 'bold';
  headingStylePreset?: 'default' | 'spacious' | 'uppercase';
  designStyle: 'unset' | 'default' | 'flat' | 'outlined' | 'edgy';
  buttonStylePreset?: 'default' | 'bubble' | 'brick' | 'gradient' | 'sleek' | 'elevate';
  buttonGradientEnd?: string;
  buttonRadius: 'unset' | 'none' | 'small' | 'medium' | 'large';
  surfaceRadius: 'unset' | 'none' | 'small' | 'medium' | 'large';
};

export type PixflowFrameworkProfileDocument = {
  schemaVersion: typeof PIXFLOW_FRAMEWORK_PROFILE_SCHEMA;
  syncHash: string;
  publishedAt: string;
  source: {
    routeId: string;
    siteUrl?: string;
    siteName?: string;
  };
  profile: PixflowFrameworkDesignSystemProfile;
};

export type PublishPixflowFrameworkDesignSystemRequest = {
  title: string;
  summary?: string;
  routeId: string;
  siteUrl?: string;
  siteName?: string;
  profile: PixflowFrameworkDesignSystemProfile;
  routeContext?: Record<string, unknown>;
  bricksTokenMap?: Record<string, unknown>;
  existingDesignSystemId?: string;
};

export type PublishPixflowFrameworkDesignSystemResponse = {
  designSystem: DesignSystemSummary;
  designSystemId: string;
  syncHash: string;
  created: boolean;
  profileFile: 'pixflow/profile.json';
};

export type PixflowFrameworkProfileResponse = {
  document: PixflowFrameworkProfileDocument;
};
