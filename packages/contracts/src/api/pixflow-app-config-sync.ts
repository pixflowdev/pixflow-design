import type {
  AgentModelPrefs,
  ApiProtocolConfigPrefs,
  ApiProtocolPrefs,
  AppConfigPrefs,
} from './app-config.js';
import type { PixflowSurface } from './pixflow-surface.js';

export const PIXFLOW_SHARED_APP_CONFIG_SCHEMA = 'pixflow.app-config.shared.v1' as const;
export const PIXFLOW_APP_CONFIG_CHANGED_SCHEMA = 'pixflow.app-config.changed.v1' as const;
export const PIXFLOW_SHARED_APP_CONFIG_VERSION = 1 as const;

/**
 * The cross-surface subset is intentionally explicit. Provider secrets and
 * agent environment variables are not part of this type and must stay in
 * their existing protected authority.
 */
export type PixflowSharedAppConfig = Pick<
  AppConfigPrefs,
  | 'theme'
  | 'accentColor'
  | 'mode'
  | 'apiProtocol'
  | 'apiTransport'
  | 'composioProvider'
  | 'composioModel'
  | 'apiVersion'
  | 'baseUrl'
  | 'model'
  | 'apiProviderBaseUrl'
  | 'byokImageModel'
  | 'byokVideoModel'
  | 'byokSpeechModel'
  | 'byokSpeechVoice'
  | 'maxTokens'
  | 'apiProtocolConfigs'
  | 'agentId'
  | 'agentModels'
  | 'bricksUseSiteStyles'
  | 'enhancedDesignGuidance'
  | 'codexImagegenOverride'
  | 'bricksExtensions'
>;

export const PIXFLOW_SHARED_APP_CONFIG_KEYS = [
  'theme',
  'accentColor',
  'mode',
  'apiProtocol',
  'apiVersion',
  'baseUrl',
  'model',
  'apiProviderBaseUrl',
  'byokImageModel',
  'byokVideoModel',
  'byokSpeechModel',
  'byokSpeechVoice',
  'maxTokens',
  'apiProtocolConfigs',
  'agentId',
  'agentModels',
  'bricksUseSiteStyles',
  'enhancedDesignGuidance',
  'codexImagegenOverride',
  'bricksExtensions',
] as const satisfies readonly (keyof PixflowSharedAppConfig)[];

export type PixflowSharedAppConfigKey = (typeof PIXFLOW_SHARED_APP_CONFIG_KEYS)[number];
export type PixflowSharedAppConfigPatch = Partial<PixflowSharedAppConfig>;

export type PixflowSharedAppConfigState = {
  revision: number;
  values: PixflowSharedAppConfigPatch;
  keyRevisions: Partial<Record<PixflowSharedAppConfigKey, number>>;
};

export type PixflowSharedAppConfigPatchRequest = {
  schema?: typeof PIXFLOW_SHARED_APP_CONFIG_SCHEMA;
  version?: typeof PIXFLOW_SHARED_APP_CONFIG_VERSION;
  baseRevision: number;
  source: PixflowSurface;
  originId: string;
  patch: PixflowSharedAppConfigPatch;
};

export type PixflowSharedAppConfigPatchResult = {
  state: PixflowSharedAppConfigState;
  appliedKeys: PixflowSharedAppConfigKey[];
  conflictedKeys: PixflowSharedAppConfigKey[];
};

export type PixflowSharedAppConfigNotification = {
  schema: typeof PIXFLOW_APP_CONFIG_CHANGED_SCHEMA;
  version: typeof PIXFLOW_SHARED_APP_CONFIG_VERSION;
  revision: number;
  source: PixflowSurface;
  originId: string;
  patch: PixflowSharedAppConfigPatch;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function boundedString(value: unknown, maxLength = 512): string | undefined {
  return typeof value === 'string' && value.length <= maxLength ? value : undefined;
}

function sanitizeAgentModels(value: unknown): Record<string, AgentModelPrefs> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, AgentModelPrefs> = {};
  for (const [agentId, rawPrefs] of Object.entries(value)) {
    if (!isRecord(rawPrefs) || agentId.length > 128) continue;
    const model = boundedString(rawPrefs.model, 256);
    const reasoning = boundedString(rawPrefs.reasoning, 128);
    const fastMode = typeof rawPrefs.fastMode === 'boolean' ? rawPrefs.fastMode : undefined;
    if (model === undefined && reasoning === undefined && fastMode === undefined) continue;
    result[agentId] = {
      ...(model === undefined ? {} : { model }),
      ...(reasoning === undefined ? {} : { reasoning }),
      ...(fastMode === undefined ? {} : { fastMode }),
    };
  }
  return result;
}

function sanitizeApiProtocolConfigs(
  value: unknown,
): Partial<Record<ApiProtocolPrefs, ApiProtocolConfigPrefs>> | undefined {
  if (!isRecord(value)) return undefined;
  const protocols: readonly ApiProtocolPrefs[] = [
    'anthropic',
    'openai',
    'azure',
    'google',
    'ollama',
    'senseaudio',
    'aihubmix',
  ];
  const result: Partial<Record<ApiProtocolPrefs, ApiProtocolConfigPrefs>> = {};
  for (const protocol of protocols) {
    const rawConfig = value[protocol];
    if (!isRecord(rawConfig)) continue;
    const config: ApiProtocolConfigPrefs = {};
    const stringKeys = [
      'baseUrl',
      'model',
      'apiVersion',
      'apiProviderBaseUrl',
      'byokImageModel',
      'byokVideoModel',
      'byokSpeechModel',
      'byokSpeechVoice',
    ] as const;
    for (const key of stringKeys) {
      const valueForKey = rawConfig[key];
      if (valueForKey === null && key === 'apiProviderBaseUrl') {
        config[key] = null;
      } else {
        const safeValue = boundedString(valueForKey, 2_048);
        if (safeValue !== undefined) config[key] = safeValue;
      }
    }
    if (Object.keys(config).length > 0) result[protocol] = config;
  }
  return result;
}

function sanitizeBooleanMap(
  value: unknown,
  allowedKeys: readonly string[],
): Record<string, boolean> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, boolean> = {};
  for (const key of allowedKeys) {
    if (typeof value[key] === 'boolean') result[key] = value[key];
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitizeBricksExtensions(value: unknown): AppConfigPrefs['bricksExtensions'] | undefined {
  if (!isRecord(value)) return undefined;
  const result: NonNullable<AppConfigPrefs['bricksExtensions']> = {};
  for (const key of ['recentlyViewed', 'siteKitGoogleLogin', 'gradientBanding'] as const) {
    const source = value[key];
    if (!isRecord(source)) continue;
    result[key] = typeof source.enabled === 'boolean' ? { enabled: source.enabled } : {};
  }

  const gsap = value.gsap;
  if (isRecord(gsap)) {
    const safeGsap: NonNullable<NonNullable<AppConfigPrefs['bricksExtensions']>['gsap']> = {};
    if (typeof gsap.enabled === 'boolean') safeGsap.enabled = gsap.enabled;
    if (gsap.scope === 'page' || gsap.scope === 'global') safeGsap.scope = gsap.scope;
    const extras = sanitizeBooleanMap(gsap.extras, ['scrollTrigger', 'splitText', 'timeline']);
    if (extras) safeGsap.extras = extras;
    result.gsap = safeGsap;
  }

  const customSplideCode = value.customSplideCode;
  if (isRecord(customSplideCode)) {
    const safeSplide: NonNullable<NonNullable<AppConfigPrefs['bricksExtensions']>['customSplideCode']> = {};
    if (typeof customSplideCode.enabled === 'boolean') safeSplide.enabled = customSplideCode.enabled;
    if (customSplideCode.scope === 'page' || customSplideCode.scope === 'global') safeSplide.scope = customSplideCode.scope;
    result.customSplideCode = safeSplide;
  }

  const cookie = value.cookieConsent;
  if (isRecord(cookie)) {
    const safeCookie: NonNullable<NonNullable<AppConfigPrefs['bricksExtensions']>['cookieConsent']> = {};
    if (typeof cookie.enabled === 'boolean') safeCookie.enabled = cookie.enabled;
    if (typeof cookie.automaticDetection === 'boolean') safeCookie.automaticDetection = cookie.automaticDetection;
    if (typeof cookie.automaticBlocking === 'boolean') safeCookie.automaticBlocking = cookie.automaticBlocking;
    const platforms = sanitizeBooleanMap(cookie.platforms, [
      'microsoft', 'meta', 'pinterest', 'tiktok', 'snapchat', 'linkedin',
    ]);
    const services = sanitizeBooleanMap(cookie.services, [
      'googleAnalytics', 'googleAds', 'microsoft', 'meta', 'pinterest', 'tiktok',
      'snapchat', 'linkedin', 'youtube', 'vimeo', 'googleMaps', 'recaptcha', 'hotjar', 'hubspot',
    ]);
    if (platforms) safeCookie.platforms = platforms;
    if (services) safeCookie.services = services;
    result.cookieConsent = safeCookie;
  }

  const twoFactor = value.twoFactorAuthentication;
  if (isRecord(twoFactor)) {
    const safeTwoFactor: NonNullable<NonNullable<AppConfigPrefs['bricksExtensions']>['twoFactorAuthentication']> = {};
    if (typeof twoFactor.enabled === 'boolean') safeTwoFactor.enabled = twoFactor.enabled;
    if (typeof twoFactor.requireSetup === 'boolean') safeTwoFactor.requireSetup = twoFactor.requireSetup;
    if (twoFactor.googlePolicy === 'trust' || twoFactor.googlePolicy === 'step_up') {
      safeTwoFactor.googlePolicy = twoFactor.googlePolicy;
    }
    const methods = sanitizeBooleanMap(twoFactor.methods, ['totp', 'email', 'passkey']);
    if (methods) safeTwoFactor.methods = methods;
    if (isRecord(twoFactor.roleScope)) {
      const allUsers = typeof twoFactor.roleScope.allUsers === 'boolean'
        ? twoFactor.roleScope.allUsers
        : undefined;
      const roles: Record<string, boolean> = {};
      if (isRecord(twoFactor.roleScope.roles)) {
        for (const [role, enabled] of Object.entries(twoFactor.roleScope.roles).slice(0, 128)) {
          if (/^[a-z0-9_-]{1,100}$/i.test(role) && typeof enabled === 'boolean') roles[role] = enabled;
        }
      }
      safeTwoFactor.roleScope = {
        ...(allUsers === undefined ? {} : { allUsers }),
        ...(Object.keys(roles).length === 0 ? {} : { roles }),
      };
    }
    if (isRecord(twoFactor.email)) {
      const email: NonNullable<typeof safeTwoFactor.email> = {};
      if (typeof twoFactor.email.logoId === 'number'
        && Number.isSafeInteger(twoFactor.email.logoId)
        && twoFactor.email.logoId >= 0) {
        email.logoId = twoFactor.email.logoId;
      }
      for (const key of [
        'logoUrl', 'companyName', 'senderName', 'fromEmail', 'addressLine1', 'addressLine2',
        'city', 'postcode', 'country', 'supportUrl', 'privacyUrl', 'termsUrl',
      ] as const) {
        const safeValue = boundedString(twoFactor.email[key], 2_048);
        if (safeValue !== undefined) email[key] = safeValue;
      }
      safeTwoFactor.email = email;
    }
    result.twoFactorAuthentication = safeTwoFactor;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Sanitise a cross-surface notification at the boundary. The allowlist is
 * deliberately independent of `AppConfigPrefs` so a provider key added to
 * the runtime config can never start broadcasting by inheritance.
 */
export function sanitizePixflowSharedAppConfigNotification(
  value: unknown,
): PixflowSharedAppConfigNotification | null {
  if (!isRecord(value)) return null;
  const source = value.source;
  if (source !== 'bricks_builder' && source !== 'wp_admin') return null;
  const revision = typeof value.revision === 'number'
    && Number.isFinite(value.revision)
    && value.revision >= 0
    ? Math.floor(value.revision)
    : null;
  const originId = boundedString(value.originId, 256);
  if (revision === null || originId === undefined || !isRecord(value.patch)) return null;

  const rawPatch = value.patch;
  const patch: PixflowSharedAppConfigPatch = {};
  const theme = rawPatch.theme;
  if (theme === 'system' || theme === 'light' || theme === 'dark') patch.theme = theme;
  const accentColor = boundedString(rawPatch.accentColor, 64);
  if (accentColor !== undefined) patch.accentColor = accentColor;
  if (rawPatch.mode === 'daemon' || rawPatch.mode === 'api') patch.mode = rawPatch.mode;
  if (rawPatch.apiTransport === 'direct' || rawPatch.apiTransport === 'composio') patch.apiTransport = rawPatch.apiTransport;

  const apiProtocol = rawPatch.apiProtocol;
  if (apiProtocol === 'anthropic' || apiProtocol === 'openai' || apiProtocol === 'azure'
    || apiProtocol === 'google' || apiProtocol === 'ollama' || apiProtocol === 'senseaudio'
    || apiProtocol === 'aihubmix') {
    patch.apiProtocol = apiProtocol;
  }
  for (const key of [
    'apiVersion',
    'composioProvider', 'composioModel',
    'baseUrl',
    'model',
    'apiProviderBaseUrl',
    'byokImageModel',
    'byokVideoModel',
    'byokSpeechModel',
    'byokSpeechVoice',
  ] as const) {
    const safeValue = boundedString(rawPatch[key], 2_048);
    if (safeValue !== undefined) patch[key] = safeValue;
  }
  if (rawPatch.apiProviderBaseUrl === null) patch.apiProviderBaseUrl = null;
  if (typeof rawPatch.maxTokens === 'number' && Number.isFinite(rawPatch.maxTokens)
    && rawPatch.maxTokens > 0 && rawPatch.maxTokens <= 1_000_000) {
    patch.maxTokens = Math.floor(rawPatch.maxTokens);
  }
  if (rawPatch.agentId === null) patch.agentId = null;
  else {
    const agentId = boundedString(rawPatch.agentId, 256);
    if (agentId !== undefined) patch.agentId = agentId;
  }
  const agentModels = sanitizeAgentModels(rawPatch.agentModels);
  if (typeof rawPatch.enhancedDesignGuidance === 'boolean') patch.enhancedDesignGuidance = rawPatch.enhancedDesignGuidance;
  if (typeof rawPatch.bricksUseSiteStyles === 'boolean') patch.bricksUseSiteStyles = rawPatch.bricksUseSiteStyles;
  if (typeof rawPatch.codexImagegenOverride === 'boolean') patch.codexImagegenOverride = rawPatch.codexImagegenOverride;
  if (agentModels !== undefined) patch.agentModels = agentModels;
  const apiProtocolConfigs = sanitizeApiProtocolConfigs(rawPatch.apiProtocolConfigs);
  if (apiProtocolConfigs !== undefined) patch.apiProtocolConfigs = apiProtocolConfigs;
  const bricksExtensions = sanitizeBricksExtensions(rawPatch.bricksExtensions);
  if (bricksExtensions !== undefined) patch.bricksExtensions = bricksExtensions;

  return {
    schema: PIXFLOW_APP_CONFIG_CHANGED_SCHEMA,
    version: PIXFLOW_SHARED_APP_CONFIG_VERSION,
    revision,
    source,
    originId,
    patch,
  };
}

export function applyPixflowSharedAppConfigPatch(
  state: PixflowSharedAppConfigState,
  update: PixflowSharedAppConfigPatchRequest,
): PixflowSharedAppConfigPatchResult {
  const appliedKeys: PixflowSharedAppConfigKey[] = [];
  const conflictedKeys: PixflowSharedAppConfigKey[] = [];
  const nextValues: PixflowSharedAppConfigPatch = { ...state.values };
  const nextKeyRevisions: Partial<Record<PixflowSharedAppConfigKey, number>> = {
    ...state.keyRevisions,
  };
  const candidateKeys = Object.keys(update.patch) as PixflowSharedAppConfigKey[];
  const nextRevision = candidateKeys.length > 0
    ? Math.max(state.revision + 1, update.baseRevision + 1)
    : state.revision;

  for (const key of candidateKeys) {
    const currentKeyRevision = state.keyRevisions[key] ?? 0;
    if (currentKeyRevision > update.baseRevision) {
      conflictedKeys.push(key);
      continue;
    }
    const value = update.patch[key];
    if (value === undefined) delete nextValues[key];
    else Object.assign(nextValues, { [key]: value });
    nextKeyRevisions[key] = nextRevision;
    appliedKeys.push(key);
  }

  return {
    state: {
      revision: appliedKeys.length > 0 ? nextRevision : state.revision,
      values: nextValues,
      keyRevisions: nextKeyRevisions,
    },
    appliedKeys,
    conflictedKeys,
  };
}

