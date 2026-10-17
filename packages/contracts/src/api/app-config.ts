export interface AgentModelPrefs {
  model?: string;
  reasoning?: string;
  fastMode?: boolean;
}

export type AgentCliEnvPrefs = Record<string, Record<string, string>>;

export type ExecModePrefs = 'daemon' | 'api';

export type ApiProtocolPrefs =
  | 'anthropic'
  | 'openai'
  | 'azure'
  | 'google'
  | 'ollama'
  | 'senseaudio'
  | 'aihubmix';

export interface ApiProtocolConfigPrefs {
  baseUrl?: string;
  model?: string;
  apiVersion?: string;
  apiProviderBaseUrl?: string | null;
  byokImageModel?: string;
  byokVideoModel?: string;
  byokSpeechModel?: string;
  byokSpeechVoice?: string;
}

export interface TelemetryPrefs {
  metrics?: boolean;
  content?: boolean;
  artifactManifest?: boolean;
}

export interface OrbitConfigPrefs {
  enabled: boolean;
  /** Local 24-hour clock time in HH:mm format. Defaults to 08:00. */
  time: string;
  /** Optional skill id from the examples gallery where scenario === "orbit". */
  templateSkillId?: string | null;
}

export interface ProjectLocationPrefs {
  id: string;
  name: string;
  path: string;
}

export interface TwoFactorEmailPrefs {
  logoId?: number;
  logoUrl?: string;
  companyName?: string;
  senderName?: string;
  fromEmail?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postcode?: string;
  country?: string;
  supportUrl?: string;
  privacyUrl?: string;
  termsUrl?: string;
}

export interface TwoFactorEmailDefaultsPrefs {
  siteName?: string;
  businessName?: string;
  senderName?: string;
  fromEmail?: string;
}

export interface BricksExtensionsDefaultsPrefs {
  twoFactorEmail?: TwoFactorEmailDefaultsPrefs;
  twoFactorRoles?: Array<{ key: string; label: string }>;
  pluginDependencies?: Partial<Record<'recentlyViewed' | 'siteKitGoogleLogin', {
    label: string;
    installed: boolean;
    active: boolean;
  }>>;
}

export type TwoFactorMethod = 'totp' | 'email' | 'passkey';

export interface TwoFactorPolicyPrefs {
  requireSetup?: boolean;
  googlePolicy?: 'trust' | 'step_up';
  methods?: Partial<Record<TwoFactorMethod, boolean>>;
  roleScope?: {
    allUsers?: boolean;
    roles?: Record<string, boolean>;
  };
}

export interface BricksExtensionPrefs {
  enabled?: boolean;
}

export type BricksExtensionLoadScope = 'page' | 'global';

export interface GsapExtensionPrefs extends BricksExtensionPrefs {
  scope?: BricksExtensionLoadScope;
  extras?: {
    scrollTrigger?: boolean;
    splitText?: boolean;
    timeline?: boolean;
  };
}

export interface CustomSplideCodePrefs extends BricksExtensionPrefs {
  scope?: BricksExtensionLoadScope;
}

export type CookieConsentPlatform =
  | 'microsoft'
  | 'meta'
  | 'pinterest'
  | 'tiktok'
  | 'snapchat'
  | 'linkedin';

export type CookieConsentService =
  | 'googleAnalytics'
  | 'googleAds'
  | 'microsoft'
  | 'meta'
  | 'pinterest'
  | 'tiktok'
  | 'snapchat'
  | 'linkedin'
  | 'youtube'
  | 'vimeo'
  | 'googleMaps'
  | 'recaptcha'
  | 'hotjar'
  | 'hubspot';

export interface CookieConsentPrefs extends BricksExtensionPrefs {
  automaticDetection?: boolean;
  automaticBlocking?: boolean;
  platforms?: Partial<Record<CookieConsentPlatform, boolean>>;
  services?: Partial<Record<CookieConsentService, boolean>>;
}

export interface CookieConsentDetectedService {
  id: CookieConsentService;
  label: string;
  category: 'analytics' | 'marketing' | 'personalization' | 'essential';
  evidence: string[];
}

export interface CookieConsentScanResult {
  scannedAt?: string;
  pagesScanned?: number;
  urls?: string[];
  services?: CookieConsentDetectedService[];
  unknownHosts?: string[];
  errors?: string[];
}

export interface BricksExtensionsPrefs {
  recentlyViewed?: BricksExtensionPrefs;
  siteKitGoogleLogin?: BricksExtensionPrefs;
  cookieConsent?: CookieConsentPrefs;
  gradientBanding?: BricksExtensionPrefs;
  gsap?: GsapExtensionPrefs;
  customSplideCode?: CustomSplideCodePrefs;
  twoFactorAuthentication?: BricksExtensionPrefs & TwoFactorPolicyPrefs & {
    email?: TwoFactorEmailPrefs;
  };
}

export interface AppConfigPrefs {
  onboardingCompleted?: boolean;
  /** Setup preference only; users can change their AI connection in Settings. */
  onboardingRoute?: 'local' | 'byok' | 'none';
  allowVisualReviewerFallback?: boolean;
  bricksUseSiteStyles?: boolean;
  /** Optional Bricks design guidance; absent means on, explicit false preserves opt-out. */
  enhancedDesignGuidance?: boolean;
  codexImagegenOverride?: boolean;
  disableBricksEmptyDivMinimumSize?: boolean;
  bricksAbilitiesEnabled?: boolean;
  bricksAbilitiesSupported?: boolean;
  bricksAbilitiesAvailable?: boolean;
  bricksAbilitiesCanManage?: boolean;
  bricksExtensions?: BricksExtensionsPrefs;
  bricksExtensionsCanManage?: boolean;
  /** Server-owned active Bricks parent/child theme capability. */
  bricksIntegrationActive?: boolean;
  bricksExtensionsDefaults?: BricksExtensionsDefaultsPrefs;
  bricksAbilitiesStatus?: {
    supported?: boolean;
    available?: boolean;
    enabled?: boolean;
    canManage?: boolean;
    bricksVersion?: string | null;
    minimumVersion?: string;
    abilitiesApiReady?: boolean;
    disabledByConstant?: boolean;
    source?: string;
    error?: { code?: string; message?: string };
  };
  theme?: 'system' | 'light' | 'dark';
  accentColor?: string;
  mode?: ExecModePrefs;
  apiTransport?: 'direct' | 'composio';
  composioProvider?: string;
  composioModel?: string;
  apiProtocol?: ApiProtocolPrefs;
  apiVersion?: string;
  baseUrl?: string;
  model?: string;
  apiProviderBaseUrl?: string | null;
  byokImageModel?: string;
  byokVideoModel?: string;
  byokSpeechModel?: string;
  byokSpeechVoice?: string;
  maxTokens?: number;
  apiProtocolConfigs?: Partial<Record<ApiProtocolPrefs, ApiProtocolConfigPrefs>>;
  agentId?: string | null;
  agentModels?: Record<string, AgentModelPrefs>;
  agentCliEnv?: AgentCliEnvPrefs;
  skillId?: string | null;
  designSystemId?: string | null;
  disabledSkills?: string[];
  disabledDesignSystems?: string[];
  installationId?: string | null;
  telemetry?: TelemetryPrefs;
  /**
   * Unix-millis timestamp of when the user resolved the first-run privacy
   * consent surface (Share or Decline). Set on first decision and on
   * subsequent toggles in Settings â†’ Privacy. Independent of
   * installationId so that "Delete my data" can rotate the id without
   * re-popping the consent banner.
   */
  privacyDecisionAt?: number | null;
  orbit?: OrbitConfigPrefs;
  customInstructions?: string | null;
  /** External project library roots. The daemon adds its built-in .od/projects location at read time. */
  projectLocations?: ProjectLocationPrefs[];
  /** Project location id used for new projects when the create request does not choose one explicitly. */
  defaultProjectLocationId?: string | null;
  /**
   * Most-recently-used local working directories the user granted the agent
   * read access to (via the Home composer's working-directory picker). These
   * become a new project's `metadata.linkedDirs` â€” the agent perceives them
   * through `--add-dir`; they are NOT imported into Design Files. Stored
   * most-recent-first and capped by the daemon.
   */
  recentLinkedDirs?: string[];
}

export interface AppConfigResponse {
  config: AppConfigPrefs;
}

export type UpdateAppConfigRequest = Partial<AppConfigPrefs>;

/** Response body for `GET /api/recent-dirs` â€” recent working directories
 *  pruned to those that still exist on disk, most-recent-first. */
export interface RecentLinkedDirsResponse {
  dirs: string[];
}

