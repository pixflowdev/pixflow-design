import { composioInferenceJson } from '../providers/composio-inference';
import { composioAvailable } from '../pixflow/composio-contribution';
import type { AppConfigPrefs } from '@open-design/contracts';
import {
  createPixflowSharedAppConfigNotification,
  publishPixflowSharedAppConfigNotification,
} from '../pixflow/shared-app-config-notification';
import { MEDIA_PROVIDERS } from '../media/models';
import { isOpenAICompatible } from '../providers/openai-compatible';
import type {
  ApiProtocol,
  AppConfig,
  MediaProviderCredentials,
  NotificationsConfig,
  OrbitConfig,
  PetConfig,
} from '../types';
import { resolveFixedOriginBaseUrl } from './apiProtocols';
import {
  DEFAULT_ACCENT_COLOR,
  normalizeAccentColor,
  normalizePixflowAccentColor,
} from './appearance';
import {
  DEFAULT_FAILURE_SOUND_ID,
  DEFAULT_SUCCESS_SOUND_ID,
} from '../utils/notifications';
import { hasPixflowWordPressContext } from '../pixflow/wordpress-context';
import {
  persistPixflowOptionalBridgeConfig,
} from '../pixflow/optional-bridge';
import { pixflowRuntimeFetch, pixflowWordPressRestFetch } from '../pixflow/runtime-fetch';

const STORAGE_KEY = 'open-design:config';
const CONFIG_MIGRATION_VERSION = 1;

// Hatched out of the box, but tucked away — the user has to go through
// either the entry-view "adopt a pet" callout or Settings → Pets to
// summon them. Keeps the workspace quiet for first-run users.
// Both switches default off so first-run users are not greeted by a
// surprise sound or a permission prompt; they can opt in from Settings →
// Notifications when they want it.
export const DEFAULT_NOTIFICATIONS: NotificationsConfig = {
  soundEnabled: false,
  successSoundId: DEFAULT_SUCCESS_SOUND_ID,
  failureSoundId: DEFAULT_FAILURE_SOUND_ID,
  desktopEnabled: false,
};

export const DEFAULT_PET: PetConfig = {
  adopted: false,
  enabled: false,
  petId: 'mochi',
  custom: {
    name: 'Buddy',
    glyph: '🦄',
    accent: '#146ef5',
    greeting: 'Hi! I am here whenever you need me.',
  },
};

export const DEFAULT_ORBIT: OrbitConfig = {
  enabled: false,
  time: '08:00',
  // Ship with the general-purpose Orbit briefing skill pre-selected so a
  // fresh install runs against a real adaptive template instead of the
  // bare built-in prompt. Users can clear it from Settings → Orbit to fall
  // back to the built-in prompt or pick another scenario === 'orbit' skill.
  templateSkillId: 'orbit-general',
};

export const DEFAULT_BRICKS_EXTENSIONS: NonNullable<AppConfig['bricksExtensions']> = {
  recentlyViewed: { enabled: false },
  siteKitGoogleLogin: { enabled: false },
  cookieConsent: { enabled: false },
  gradientBanding: { enabled: false },
  gsap: {
    enabled: false,
    scope: 'page',
    extras: { scrollTrigger: false, splitText: false, timeline: false },
  },
  customSplideCode: { enabled: false, scope: 'page' },
  twoFactorAuthentication: {
    enabled: false,
    email: {
      logoId: 0,
      logoUrl: '',
      companyName: '',
      senderName: '',
      fromEmail: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      postcode: '',
      country: '',
      supportUrl: '',
      privacyUrl: '',
      termsUrl: '',
    },
  },
};

export const DEFAULT_CONFIG: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  // New configs should be explicit. loadConfig() still detects parsed legacy
  // saved configs that did not have this field and migrates those from their
  // saved baseUrl/model before applying the current migration version.
  apiProtocol: 'anthropic',
  apiVersion: '',
  apiProtocolConfigs: {},
  configMigrationVersion: CONFIG_MIGRATION_VERSION,
  apiProviderBaseUrl: 'https://api.anthropic.com',
  agentId: null,
  skillId: null,
  designSystemId: null,
  onboardingCompleted: false,
  allowVisualReviewerFallback: false,
  disableBricksEmptyDivMinimumSize: true,
  bricksAbilitiesEnabled: false,
  bricksAbilitiesSupported: false,
  bricksAbilitiesAvailable: false,
  bricksAbilitiesCanManage: false,
  bricksExtensions: DEFAULT_BRICKS_EXTENSIONS,
  bricksExtensionsCanManage: false,
  bricksExtensionsDefaults: {},
  theme: 'dark',
  accentColor: DEFAULT_ACCENT_COLOR,
  mediaProviders: {},
  composio: {},
  agentModels: {},
  agentCliEnv: {},
  pet: DEFAULT_PET,
  notifications: DEFAULT_NOTIFICATIONS,
  orbit: DEFAULT_ORBIT,
  projectLocations: [],
  defaultProjectLocationId: 'default',
  telemetry: { metrics: false, content: false, artifactManifest: false },
};

/** Well-known providers with pre-filled base URLs. */
export interface KnownProvider {
  label: string;
  protocol: ApiProtocol;
  baseUrl: string;
  /** Default model to apply when the provider is selected. */
  model: string;
  /** Optional provider-specific model choices shown in Settings. */
  models?: string[];
  /** Some local/self-hosted endpoints do not require bearer credentials. */
  requiresApiKey?: boolean;
}

// Some providers appear more than once because they expose both
// Anthropic-compatible (/v1/messages) and OpenAI-compatible
// (/v1/chat/completions) gateways. Keep those entries separate so the Settings
// UI can scope quick-fill presets and model suggestions to the selected
// protocol.
//
// Model lists are hand-curated from provider docs/current public presets rather
// than fetched dynamically. To add a provider, include a user-facing label, the
// protocol that determines request routing, the base URL, a default model, and
// optional provider-specific model choices.
export const KNOWN_PROVIDERS: KnownProvider[] = [
  {
    label: 'Anthropic (Claude)',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    models: ['claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5'],
  },
  {
    label: 'DeepSeek — Anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://api.deepseek.com/anthropic',
    model: 'deepseek-chat',
    models: [
      'deepseek-chat',
      'deepseek-reasoner',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ],
  },
  {
    label: 'MiniMax — Anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    model: 'MiniMax-M2.7-highspeed',
    models: [
      'MiniMax-M2.7-highspeed',
      'MiniMax-M2.7',
      'MiniMax-M2.5-highspeed',
      'MiniMax-M2.5',
      'MiniMax-M2.1-highspeed',
      'MiniMax-M2.1',
      'MiniMax-M2',
    ],
  },
  {
    label: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3', 'o4-mini'],
  },
  {
    label: 'OpenRouter',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3.7-sonnet',
    models: [
      'anthropic/claude-3.7-sonnet',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.5-flash',
      'google/gemini-2.5-pro',
      'openai/gpt-4o',
      'openai/o3-mini',
      'deepseek/deepseek-chat',
      'deepseek/deepseek-r1',
    ],
  },
  {
    label: 'Azure OpenAI',
    protocol: 'azure',
    baseUrl: '',
    model: '',
    models: [],
  },
  {
    label: 'Google Gemini',
    protocol: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  {
    label: 'DeepSeek — OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    models: [
      'deepseek-chat',
      'deepseek-reasoner',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ],
  },
  {
    label: 'MiniMax — OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.minimaxi.com/v1',
    model: 'MiniMax-M2.7-highspeed',
    models: [
      'MiniMax-M2.7-highspeed',
      'MiniMax-M2.7',
      'MiniMax-M2.5-highspeed',
      'MiniMax-M2.5',
      'MiniMax-M2.1-highspeed',
      'MiniMax-M2.1',
      'MiniMax-M2',
    ],
  },
  {
    label: 'MiMo (Xiaomi) — OpenAI',
    protocol: 'openai',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    model: 'mimo-v2.5-pro',
    models: ['mimo-v2.5-pro'],
  },
  {
    label: 'Ollama Cloud (managed)',
    protocol: 'ollama',
    baseUrl: 'https://ollama.com',
    model: 'gpt-oss:120b',
    models: [
      'cogito-2.1:671b',
      'deepseek-v3.1:671b',
      'deepseek-v3.2',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'devstral-2:123b',
      'devstral-small-2:24b',
      'gemini-3-flash-preview',
      'gemma3:4b',
      'gemma3:12b',
      'gemma3:27b',
      'gemma4:31b',
      'glm-4.6',
      'glm-4.7',
      'glm-5',
      'glm-5.1',
      'gpt-oss:20b',
      'gpt-oss:120b',
      'kimi-k2:1t',
      'kimi-k2-thinking',
      'kimi-k2.5',
      'kimi-k2.6',
      'minimax-m2',
      'minimax-m2.1',
      'minimax-m2.5',
      'minimax-m2.7',
      'ministral-3:3b',
      'ministral-3:8b',
      'ministral-3:14b',
      'mistral-large-3:675b',
      'nemotron-3-nano:30b',
      'nemotron-3-super',
      'qwen3-coder:480b',
      'qwen3-coder-next',
      'qwen3-next:80b',
      'qwen3-vl:235b',
      'qwen3-vl:235b-instruct',
      'qwen3.5:397b',
      'rnj-1:8b',
    ],
  },
  {
    label: 'Ollama Self-hosted (local)',
    protocol: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'gemma3:4b',
    models: ['gemma3:4b', 'gemma3:12b', 'gemma3:27b', 'gpt-oss:20b'],
    requiresApiKey: false,
  },
  {
    label: 'MiMo (Xiaomi) — Anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
    model: 'mimo-v2.5-pro',
    models: ['mimo-v2.5-pro'],
  },
  {
    label: 'SenseAudio',
    protocol: 'senseaudio',
    baseUrl: 'https://api.senseaudio.cn',
    model: 'senseaudio-s2',
    models: [
      'senseaudio-s2',
      'senseaudio-s2-flash',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'glm-5.1',
      'kimi-k2.6',
      'MiniMax-M2.7-highspeed',
      'MiniMax-M2.7',
    ],
  },
  {
    label: 'AIHubMix',
    protocol: 'aihubmix',
    baseUrl: 'https://aihubmix.com/v1',
    model: 'gpt-5.5',
    models: [
      'gpt-5.5',
      'gpt-4o',
      'gpt-4o-mini',
      'claude-opus-4-8',
      'claude-sonnet-4-5',
      'claude-haiku-4-5',
      'gemini-2.0-flash',
      'deepseek-chat',
      'deepseek-reasoner',
    ],
  },
];

function isLocalOllamaEndpoint(baseUrl: string): boolean {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

/**
 * A BYOK mode is selectable only when it can actually start a request.
 * This deliberately treats the local Ollama preset as credential-free while
 * requiring a key for hosted providers. Keeping this invariant shared prevents
 * a stale, blank-key API selection from looking like a live paid connection.
 */
export function isByokExecutionConfigured(
  config: Pick<AppConfig, 'apiKey' | 'apiProtocol' | 'apiProviderBaseUrl' | 'baseUrl' | 'model' | 'apiTransport' | 'composioProvider' | 'composioModel'>,
): boolean {
  if (config.apiTransport === 'composio') return Boolean(config.composioProvider && config.composioModel?.trim());
  const baseUrl = config.baseUrl?.trim() ?? '';
  const model = config.model?.trim() ?? '';
  if (!baseUrl || !model) return false;

  const protocol = config.apiProtocol ?? 'anthropic';
  const configuredProviderBaseUrl = config.apiProviderBaseUrl?.trim() ?? '';
  const provider = KNOWN_PROVIDERS.find((candidate) => (
    candidate.protocol === protocol
    && (configuredProviderBaseUrl
      ? candidate.baseUrl === configuredProviderBaseUrl
      : candidate.baseUrl === baseUrl)
  ));
  const requiresApiKey = provider?.requiresApiKey !== false
    && !(protocol === 'ollama' && isLocalOllamaEndpoint(baseUrl));

  return !requiresApiKey || Boolean(config.apiKey?.trim());
}

function normalizePet(input: Partial<PetConfig> | undefined): PetConfig {
  if (!input) return { ...DEFAULT_PET, custom: { ...DEFAULT_PET.custom } };
  // Merge stored values onto defaults so newly-added fields land safely
  // when an older config is rehydrated.
  return {
    ...DEFAULT_PET,
    ...input,
    custom: { ...DEFAULT_PET.custom, ...(input.custom ?? {}) },
  };
}

function normalizeNotifications(
  input: Partial<NotificationsConfig> | undefined,
): NotificationsConfig {
  return { ...DEFAULT_NOTIFICATIONS, ...(input ?? {}) };
}

function normalizeOrbit(input: Partial<OrbitConfig> | undefined): OrbitConfig {
  const time = typeof input?.time === 'string' && isValidOrbitTime(input.time)
    ? input.time
    : DEFAULT_ORBIT.time;
  return { ...DEFAULT_ORBIT, ...(input ?? {}), time };
}

function isValidOrbitTime(time: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function inferApiProtocol(model: string, baseUrl: string): ApiProtocol {
  try {
    const normalized = (baseUrl || '').toLowerCase();
    // Any config pointing at ollama.com should resolve to the new ollama
    // protocol so both chat and the connection test hit the native Ollama
    // proxy instead of the Anthropic or OpenAI paths.
    if (normalized.includes('ollama.com')) return 'ollama';
    // SenseAudio host gets routed to its own proxy so the daemon log line
    // and the BYOK tab UI stay consistent with the protocol the user
    // picked — even though the on-wire shape is OpenAI-compatible.
    if (normalized.includes('senseaudio.cn')) return 'senseaudio';
    // AIHubMix host routes to its own proxy so the daemon injects the
    // APP-Code attribution header even though the wire shape is
    // OpenAI-compatible.
    if (normalized.includes('aihubmix.com')) return 'aihubmix';
    return isOpenAICompatible(model, baseUrl) ? 'openai' : 'anthropic';
  } catch {
    // Preserve the rest of the user's settings even if an old saved base URL is
    // malformed enough for URL parsing to throw. Anthropic is the safest default
    // because it matches the original built-in provider.
    return 'anthropic';
  }
}

// Browser storage is optional: a full site quota must not abort Bridge hydration.
let unsavedConfig: string | null = null;

export function loadConfig(): AppConfig {
  try {
    const raw = unsavedConfig ?? localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_CONFIG,
        pet: normalizePet(DEFAULT_PET),
        notifications: normalizeNotifications(DEFAULT_NOTIFICATIONS),
        orbit: normalizeOrbit(DEFAULT_ORBIT),
      };
    }
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    // Strip daemon-owned privacy fields if a stale localStorage payload
    // still carries them. Older builds wrote these to localStorage; we
    // now treat the daemon as authoritative so the user can rotate /
    // revoke without leaving residue in browser storage.
    for (const key of DAEMON_OWNED_KEYS) {
      delete (parsed as Record<string, unknown>)[key];
    }
    const parsedHasApiProtocol = Object.prototype.hasOwnProperty.call(
      parsed,
      'apiProtocol',
    );
    const merged: AppConfig = {
      ...DEFAULT_CONFIG,
      ...parsed,
      apiProtocolConfigs: { ...(parsed.apiProtocolConfigs ?? {}) },
      mediaProviders: { ...(parsed.mediaProviders ?? {}) },
      composio: { ...(parsed.composio ?? {}) },
      agentModels: { ...(parsed.agentModels ?? {}) },
      agentCliEnv: { ...(parsed.agentCliEnv ?? {}) },
      accentColor: normalizePixflowAccentColor(parsed.accentColor) ?? DEFAULT_CONFIG.accentColor,
      pet: normalizePet(parsed.pet),
      notifications: normalizeNotifications(parsed.notifications),
      orbit: normalizeOrbit(parsed.orbit),
    };

    if (parsed.configMigrationVersion !== CONFIG_MIGRATION_VERSION) {
      // Migration v1: configs saved before apiProtocol existed need an explicit
      // protocol so old OpenAI-compatible endpoints keep routing correctly.
      // This is version-gated instead of only field-gated so a later imported
      // legacy config can be migrated when it is loaded.
      if (!parsedHasApiProtocol) {
        merged.apiProtocol = inferApiProtocol(merged.model, merged.baseUrl);
        // Ollama Cloud legacy configs may carry a base URL that includes
        // /api or /api/ — normalize to the host root so the daemon's own
        // /api/chat appending doesn't double up.
        if (merged.apiProtocol === 'ollama') {
          merged.baseUrl = merged.baseUrl
            .replace(/\/api\/?$/, '')
            .replace(/\/+$/, '');
        }
        // Also set apiProviderBaseUrl so setApiProtocol() can correctly identify
        // whether the user is on a known provider and switch defaults appropriately.
        // null means "custom/unknown provider" so the protocol switch won't override
        // their custom base URL.
        const knownProvider = KNOWN_PROVIDERS.find(
          (p) => p.baseUrl === merged.baseUrl,
        );
        merged.apiProviderBaseUrl = knownProvider?.baseUrl ?? null;
      }
      merged.configMigrationVersion = CONFIG_MIGRATION_VERSION;
    }

    // Fixed-origin gateways (e.g. AIHubMix) hide the Base URL field, so a config
    // persisted before the origin was auto-resolved can carry an empty baseUrl.
    // Backfill it here so every consumer (Settings form, top-bar switcher, chat)
    // sees the canonical origin — an empty value otherwise blocks the live
    // model-list fetch and leaves only the static suggestion list.
    if (merged.apiProtocol) {
      merged.baseUrl = resolveFixedOriginBaseUrl(merged.apiProtocol, merged.baseUrl);
    }

    // Beta 7 could persist the BYOK tab itself before any credentials were
    // entered. Recover that legacy selection to Local CLI on startup so the UI
    // cannot imply that a provider connection (or provider billing) is active.
    if (merged.mode === 'api' && !isByokExecutionConfigured(merged)) {
      merged.mode = 'daemon';
    }

    return merged;
  } catch {
    return {
      ...DEFAULT_CONFIG,
      pet: normalizePet(DEFAULT_PET),
      notifications: normalizeNotifications(DEFAULT_NOTIFICATIONS),
      orbit: normalizeOrbit(DEFAULT_ORBIT),
    };
  }
}

interface PublicComposioConfigResponse {
  configured?: boolean;
  apiKeyTail?: string;
}

interface PublicMediaProviderConfigEntry {
  configured?: boolean;
  apiKeyConfigured?: boolean;
  source?: string;
  apiKeyTail?: string;
  baseUrl?: string;
  model?: string;
  enabled?: boolean;
}

interface PublicMediaProviderConfigResponse {
  providers?: Record<string, PublicMediaProviderConfigEntry>;
}

export type DaemonMediaProvidersFetchResult =
  | {
    status: 'ok';
    providers: AppConfig['mediaProviders'];
  }
  | {
    status: 'error';
  };

interface MediaProviderDaemonWriteEntry {
  apiKey?: string;
  preserveApiKey?: boolean;
  baseUrl?: string;
  model?: string;
  enabled?: boolean;
}

interface MediaProviderDaemonWriteRequest {
  providers: Record<string, MediaProviderDaemonWriteEntry>;
  force: boolean;
}

function hasAnyDaemonManagedMediaProvider(
  providers: Record<string, MediaProviderCredentials> | null | undefined,
): boolean {
  if (!providers) return false;
  return Object.values(providers).some((entry) => isStoredMediaProviderEntryPresent(entry));
}

function hasRecoverableLocalMediaProviderFields(
  entry: MediaProviderCredentials | null | undefined,
): boolean {
  return Boolean(
    entry?.apiKey?.trim()
    || entry?.baseUrl?.trim()
    || entry?.model?.trim()
    || entry?.enabled === true,
  );
}

function isMarkerOnlyMediaProviderEntry(
  entry: MediaProviderCredentials | null | undefined,
): boolean {
  return isStoredMediaProviderEntryPresent(entry)
    && !hasRecoverableLocalMediaProviderFields(entry);
}

export function isStoredMediaProviderEntryPresent(
  entry: MediaProviderCredentials | null | undefined,
): boolean {
  return Boolean(
    entry?.apiKey?.trim()
    || entry?.baseUrl?.trim()
    || entry?.model?.trim()
    || entry?.apiKeyConfigured
    || entry?.apiKeyTail?.trim()
    || entry?.enabled === true,
  );
}

export function isStoredMediaProviderEntryEmpty(
  entry: MediaProviderCredentials | null | undefined,
): boolean {
  return !isStoredMediaProviderEntryPresent(entry);
}

function defaultBaseUrlForProvider(providerId: string): string {
  return MEDIA_PROVIDERS.find((provider) => provider.id === providerId)?.defaultBaseUrl ?? '';
}

export function buildMediaProvidersForDaemonSave(
  currentProviders: Record<string, MediaProviderCredentials> | undefined,
  daemonProviders: Record<string, MediaProviderCredentials> | null | undefined,
  options?: { force?: boolean },
): MediaProviderDaemonWriteRequest {
  const providers: Record<string, MediaProviderDaemonWriteEntry> = {};
  for (const [providerId, currentEntry] of Object.entries(currentProviders ?? {})) {
    const daemonEntry = daemonProviders?.[providerId];
    const apiKey = currentEntry?.apiKey?.trim() ?? '';
    const hasStoredKeyMarker = Boolean(
      currentEntry?.apiKeyTail?.trim()
      || daemonEntry?.apiKeyTail?.trim(),
    );
    const preserveApiKey = !apiKey && Boolean(
      currentEntry?.apiKeyConfigured
      && hasStoredKeyMarker,
    );
    const explicitBaseUrl =
      currentEntry?.baseUrl?.trim()
      || daemonEntry?.baseUrl?.trim()
      || '';
    const model = currentEntry?.model?.trim() || daemonEntry?.model?.trim() || '';
    const enabled = typeof currentEntry?.enabled === 'boolean'
      ? currentEntry.enabled
      : daemonEntry?.enabled;
    if (!apiKey && !preserveApiKey && !explicitBaseUrl && !model && enabled !== true) continue;
    const baseUrl = explicitBaseUrl || defaultBaseUrlForProvider(providerId);
    providers[providerId] = {
      ...(apiKey ? { apiKey } : {}),
      ...(preserveApiKey ? { preserveApiKey: true } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      ...(model ? { model } : {}),
      ...(typeof enabled === 'boolean' ? { enabled } : {}),
    };
  }
  return {
    providers,
    force: Boolean(options?.force),
  };
}

export async function fetchComposioConfigFromDaemon(): Promise<AppConfig['composio'] | null> {
  try {
    if (hasPixflowWordPressContext()) {
      if (!composioAvailable()) return null;
      const status = await composioInferenceJson<{configured: boolean}>('config');
      return {apiKey: '', apiKeyConfigured: status.configured, apiKeyTail: ''};
    }
    const response = await pixflowRuntimeFetch('/api/connectors/composio/config');
    if (!response.ok) return null;
    const payload = await response.json() as PublicComposioConfigResponse;
    return {
      apiKey: '',
      apiKeyConfigured: Boolean(payload.configured),
      apiKeyTail: payload.apiKeyTail ?? '',
    };
  } catch {
    return null;
  }
}

export async function fetchMediaProvidersFromDaemon(): Promise<DaemonMediaProvidersFetchResult> {
  try {
    const response = await pixflowRuntimeFetch('/api/media/config');
    if (!response.ok) return { status: 'error' };
    const payload = await response.json() as PublicMediaProviderConfigResponse;
    const rawProviders = payload.providers ?? {};
    const providers: AppConfig['mediaProviders'] = {};
    for (const [providerId, entry] of Object.entries(rawProviders)) {
      providers[providerId] = {
        apiKey: '',
        apiKeyConfigured: Boolean(entry?.configured ?? entry?.apiKeyConfigured),
        apiKeyTail: entry?.apiKeyTail ?? '',
        baseUrl: entry?.baseUrl ?? '',
        ...(typeof entry?.source === 'string' && entry.source.trim()
          ? { source: entry.source.trim() }
          : {}),
        ...(typeof entry?.model === 'string' && entry.model.trim()
          ? { model: entry.model.trim() }
          : {}),
        ...(typeof entry?.enabled === 'boolean'
          ? { enabled: entry.enabled }
          : {}),
      };
    }
    return {
      status: 'ok',
      providers,
    };
  } catch {
    return { status: 'error' };
  }
}

export async function syncComposioConfigToDaemon(
  config: AppConfig['composio'] | undefined,
): Promise<boolean> {
  const apiKey = config?.apiKey ?? '';
  const payload = {
    ...(apiKey.trim() || !config?.apiKeyConfigured ? { apiKey } : {}),
  };
  try {
    if (hasPixflowWordPressContext()) {
      // WordPress owns Composio in every execution mode; never copy site keys
      // into the legacy Bridge store or implicitly import its saved accounts.
      if (!composioAvailable()) return false;
      if (!('apiKey' in payload)) return (await composioInferenceJson<{configured: boolean}>('config')).configured;
      const saved = await composioInferenceJson<{configured: boolean}>('config', payload, undefined, 'PUT');
      return saved.configured === Boolean(apiKey.trim());
    }
    const response = await pixflowRuntimeFetch('/api/connectors/composio/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return false;
    const saved = await response.json() as PublicComposioConfigResponse;
    if (typeof saved.configured !== 'boolean') return false;
    return saved.configured === Boolean(apiKey.trim() || config?.apiKeyConfigured);
  } catch {
    return false;
  }
}

const DAEMON_OWNED_KEYS = new Set<keyof AppConfig>([
  'installationId',
]);

const AGENT_CLI_SECRET_ENV_KEYS = new Set(['ANTHROPIC_API_KEY', 'CODEX_API_KEY', 'OPENAI_API_KEY']);
const API_PROTOCOL_SECRET_CONFIG_KEYS = new Set(['apiKey']);

function sanitizeAgentCliEnv(agentCliEnv: AppConfig['agentCliEnv']): AppConfig['agentCliEnv'] {
  if (!agentCliEnv) return agentCliEnv;
  const sanitized: NonNullable<AppConfig['agentCliEnv']> = {};
  for (const [agentId, env] of Object.entries(agentCliEnv)) {
    const safeEnv = Object.fromEntries(
      Object.entries(env ?? {}).filter(([key]) => !AGENT_CLI_SECRET_ENV_KEYS.has(key)),
    );
    sanitized[agentId] = safeEnv;
  }
  return sanitized;
}

export function sanitizeApiProtocolConfigsForPrefs(
  configs: AppConfig['apiProtocolConfigs'],
): AppConfigPrefs['apiProtocolConfigs'] {
  if (!configs) return configs;
  const sanitized: NonNullable<AppConfigPrefs['apiProtocolConfigs']> = {};
  for (const [protocol, config] of Object.entries(configs)) {
    if (!config) continue;
    const safeConfig = Object.fromEntries(
      Object.entries(config).filter(([key]) => !API_PROTOCOL_SECRET_CONFIG_KEYS.has(key)),
    ) as NonNullable<AppConfigPrefs['apiProtocolConfigs']>[keyof NonNullable<AppConfigPrefs['apiProtocolConfigs']>];
    if (Object.keys(safeConfig ?? {}).length > 0) {
      sanitized[protocol as keyof NonNullable<AppConfigPrefs['apiProtocolConfigs']>] = safeConfig;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function mergeApiProtocolConfigPrefs(
  current: AppConfig['apiProtocolConfigs'],
  prefs: AppConfigPrefs['apiProtocolConfigs'],
): AppConfig['apiProtocolConfigs'] {
  if (!prefs) return current;
  const next: NonNullable<AppConfig['apiProtocolConfigs']> = { ...(current ?? {}) };
  for (const [protocol, prefConfig] of Object.entries(prefs)) {
    if (!prefConfig) continue;
    const key = protocol as keyof NonNullable<AppConfig['apiProtocolConfigs']>;
    const existing = next[key];
    next[key] = {
      apiKey: existing?.apiKey ?? '',
      baseUrl: existing?.baseUrl ?? '',
      model: existing?.model ?? '',
      ...(existing ?? {}),
      ...prefConfig,
    };
  }
  return next;
}

export function saveConfig(config: AppConfig): void {
  const sanitized: AppConfig = { ...config, agentCliEnv: sanitizeAgentCliEnv(config.agentCliEnv) };
  for (const key of DAEMON_OWNED_KEYS) {
    delete (sanitized as unknown as Record<string, unknown>)[key];
  }
  const serialized = JSON.stringify(sanitized);
  try {
    localStorage.setItem(STORAGE_KEY, serialized);
    unsavedConfig = null;
  } catch {
    // Keep this tab usable and allow the server save to proceed. Never evict
    // another plugin's data to make room for our optional preferences cache.
    unsavedConfig = serialized;
  }
}

export function mergeDaemonConfig(
  localConfig: AppConfig,
  daemonConfig: AppConfigPrefs | null,
): AppConfig {
  const next = { ...localConfig };
  if (!daemonConfig) return next;

  if (hasPixflowWordPressContext()) {
    if (daemonConfig.agentId !== undefined) {
      next.agentId = daemonConfig.agentId;
    }
    if (daemonConfig.agentModels) {
      next.agentModels = {
        ...(next.agentModels ?? {}),
        ...daemonConfig.agentModels,
      };
    }
    if (daemonConfig.agentCliEnv !== undefined) {
      next.agentCliEnv = daemonConfig.agentCliEnv ?? {};
    }
    if (daemonConfig.bricksUseSiteStyles !== undefined) next.bricksUseSiteStyles = daemonConfig.bricksUseSiteStyles;
    if (daemonConfig.enhancedDesignGuidance !== undefined) next.enhancedDesignGuidance = daemonConfig.enhancedDesignGuidance;
    if (daemonConfig.codexImagegenOverride !== undefined) {
      next.codexImagegenOverride = daemonConfig.codexImagegenOverride;
    }
    if (daemonConfig.allowVisualReviewerFallback !== undefined) {
      next.allowVisualReviewerFallback = daemonConfig.allowVisualReviewerFallback;
    }
    if (daemonConfig.disableBricksEmptyDivMinimumSize !== undefined) {
      next.disableBricksEmptyDivMinimumSize = daemonConfig.disableBricksEmptyDivMinimumSize;
    }
    if (daemonConfig.bricksAbilitiesEnabled !== undefined) {
      next.bricksAbilitiesEnabled = daemonConfig.bricksAbilitiesEnabled;
    }
    if (daemonConfig.bricksIntegrationActive !== undefined) next.bricksIntegrationActive = daemonConfig.bricksIntegrationActive;
    if (daemonConfig.bricksAbilitiesSupported !== undefined) {
      next.bricksAbilitiesSupported = daemonConfig.bricksAbilitiesSupported;
    }
    if (daemonConfig.bricksAbilitiesAvailable !== undefined) {
      next.bricksAbilitiesAvailable = daemonConfig.bricksAbilitiesAvailable;
    }
    if (daemonConfig.bricksAbilitiesCanManage !== undefined) {
      next.bricksAbilitiesCanManage = daemonConfig.bricksAbilitiesCanManage;
    }
    if (daemonConfig.bricksExtensions !== undefined) {
      next.bricksExtensions = daemonConfig.bricksExtensions;
    }
    if (daemonConfig.bricksExtensionsCanManage !== undefined) {
      next.bricksExtensionsCanManage = daemonConfig.bricksExtensionsCanManage;
    }
    if (daemonConfig.bricksExtensionsDefaults !== undefined) {
      next.bricksExtensionsDefaults = daemonConfig.bricksExtensionsDefaults;
    }
    if (daemonConfig.bricksAbilitiesStatus !== undefined) {
      next.bricksAbilitiesStatus = daemonConfig.bricksAbilitiesStatus;
    }
    return next;
  }

  if (daemonConfig.onboardingCompleted != null) {
    next.onboardingCompleted = daemonConfig.onboardingCompleted;
  }
  if (daemonConfig.onboardingRoute != null) next.onboardingRoute = daemonConfig.onboardingRoute;
  if (daemonConfig.allowVisualReviewerFallback !== undefined) {
    next.allowVisualReviewerFallback = daemonConfig.allowVisualReviewerFallback;
  }
  if (daemonConfig.bricksUseSiteStyles !== undefined) next.bricksUseSiteStyles = daemonConfig.bricksUseSiteStyles;
    if (daemonConfig.enhancedDesignGuidance !== undefined) next.enhancedDesignGuidance = daemonConfig.enhancedDesignGuidance;
    if (daemonConfig.codexImagegenOverride !== undefined) {
    next.codexImagegenOverride = daemonConfig.codexImagegenOverride;
  }
  if (daemonConfig.disableBricksEmptyDivMinimumSize !== undefined) {
    next.disableBricksEmptyDivMinimumSize = daemonConfig.disableBricksEmptyDivMinimumSize;
  }
  if (daemonConfig.bricksAbilitiesEnabled !== undefined) {
    next.bricksAbilitiesEnabled = daemonConfig.bricksAbilitiesEnabled;
  }
  if (daemonConfig.bricksIntegrationActive !== undefined) next.bricksIntegrationActive = daemonConfig.bricksIntegrationActive;
  if (daemonConfig.bricksAbilitiesSupported !== undefined) {
    next.bricksAbilitiesSupported = daemonConfig.bricksAbilitiesSupported;
  }
  if (daemonConfig.bricksAbilitiesAvailable !== undefined) {
    next.bricksAbilitiesAvailable = daemonConfig.bricksAbilitiesAvailable;
  }
  if (daemonConfig.bricksAbilitiesCanManage !== undefined) {
    next.bricksAbilitiesCanManage = daemonConfig.bricksAbilitiesCanManage;
  }
  if (daemonConfig.bricksAbilitiesStatus !== undefined) {
    next.bricksAbilitiesStatus = daemonConfig.bricksAbilitiesStatus;
  }
  if (daemonConfig.agentId !== undefined) {
    next.agentId = daemonConfig.agentId;
  }
  if (daemonConfig.skillId !== undefined) {
    next.skillId = daemonConfig.skillId;
  }
  if (daemonConfig.designSystemId !== undefined) {
    next.designSystemId = daemonConfig.designSystemId;
  }
  if (daemonConfig.mode !== undefined) {
    next.mode = daemonConfig.mode;
  }
  if (daemonConfig.apiProtocol !== undefined) {
    next.apiProtocol = daemonConfig.apiProtocol;
  }
  if (daemonConfig.apiTransport !== undefined) next.apiTransport = daemonConfig.apiTransport;
  if (daemonConfig.composioProvider !== undefined) next.composioProvider = daemonConfig.composioProvider;
  if (daemonConfig.composioModel !== undefined) next.composioModel = daemonConfig.composioModel;
  if (daemonConfig.apiVersion !== undefined) {
    next.apiVersion = daemonConfig.apiVersion;
  }
  if (daemonConfig.baseUrl !== undefined) {
    next.baseUrl = daemonConfig.baseUrl;
  }
  if (daemonConfig.model !== undefined) {
    next.model = daemonConfig.model;
  }
  if (daemonConfig.apiProviderBaseUrl !== undefined) {
    next.apiProviderBaseUrl = daemonConfig.apiProviderBaseUrl;
  }
  if (daemonConfig.byokImageModel !== undefined) {
    next.byokImageModel = daemonConfig.byokImageModel;
  }
  if (daemonConfig.byokVideoModel !== undefined) {
    next.byokVideoModel = daemonConfig.byokVideoModel;
  }
  if (daemonConfig.byokSpeechModel !== undefined) {
    next.byokSpeechModel = daemonConfig.byokSpeechModel;
  }
  if (daemonConfig.byokSpeechVoice !== undefined) {
    next.byokSpeechVoice = daemonConfig.byokSpeechVoice;
  }
  if (daemonConfig.maxTokens !== undefined) {
    next.maxTokens = daemonConfig.maxTokens;
  }
  if (daemonConfig.apiProtocolConfigs !== undefined) {
    next.apiProtocolConfigs = mergeApiProtocolConfigPrefs(next.apiProtocolConfigs, daemonConfig.apiProtocolConfigs);
  }
  if (daemonConfig.agentModels) {
    next.agentModels = {
      ...(next.agentModels ?? {}),
      ...daemonConfig.agentModels,
    };
  }
  next.agentCliEnv = daemonConfig.agentCliEnv ?? {};
  if (daemonConfig.disabledSkills !== undefined) {
    next.disabledSkills = daemonConfig.disabledSkills;
  }
  if (daemonConfig.disabledDesignSystems !== undefined) {
    next.disabledDesignSystems = daemonConfig.disabledDesignSystems;
  }
  if (daemonConfig.orbit !== undefined) {
    next.orbit = normalizeOrbit(daemonConfig.orbit);
  }
  next.installationId = null;
  next.telemetry = { metrics: false, content: false, artifactManifest: false };
  if (daemonConfig.customInstructions !== undefined) {
    next.customInstructions = daemonConfig.customInstructions ?? undefined;
  }
  if (daemonConfig.projectLocations !== undefined) {
    next.projectLocations = daemonConfig.projectLocations;
  }
  if (daemonConfig.defaultProjectLocationId !== undefined) {
    next.defaultProjectLocationId = daemonConfig.defaultProjectLocationId ?? 'default';
  }
  return next;
}

export function mergeDaemonMediaProviders(
  localConfig: AppConfig,
  daemonProviders: AppConfig['mediaProviders'] | null,
  options?: {
    preserveLocalProviderIds?: ReadonlySet<string>;
  },
): AppConfig {
  if (daemonProviders == null) {
    return { ...localConfig };
  }

  if (!hasAnyDaemonManagedMediaProvider(daemonProviders)) {
    return {
      ...localConfig,
      mediaProviders: Object.fromEntries(
        Object.entries(localConfig.mediaProviders ?? {}).filter(([, entry]) => !isMarkerOnlyMediaProviderEntry(entry)),
      ),
    };
  }

  const mediaProviders = { ...(localConfig.mediaProviders ?? {}) };
  for (const [providerId, daemonEntry] of Object.entries(daemonProviders ?? {})) {
    if (!isStoredMediaProviderEntryPresent(daemonEntry)) continue;
    const localEntry = mediaProviders[providerId];
    // WordPress deliberately stores only a redacted provider marker. The
    // browser-owned BYOK key (and the user's current base URL/model edit) must
    // survive a marker refresh even when this is not a pending Settings edit.
    // Otherwise the first app-config/media refresh after reload replaces the
    // live key with `apiKey: ''`, recreating a false "no credential" failure.
    if (hasPixflowWordPressContext() && localEntry) {
      mediaProviders[providerId] = { ...daemonEntry, ...localEntry };
      continue;
    }
    const preserveLocalPendingEdit = Boolean(
      options?.preserveLocalProviderIds?.has(providerId)
      && hasRecoverableLocalMediaProviderFields(localEntry),
    );
    mediaProviders[providerId] = preserveLocalPendingEdit
      ? { ...daemonEntry, ...localEntry }
      : { ...daemonEntry };
  }

  return {
    ...localConfig,
    mediaProviders,
  };
}

export function hasAnyConfiguredProvider(
  providers: Record<string, MediaProviderCredentials> | undefined,
): boolean {
  if (!providers) return false;
  return Object.values(providers).some((entry) => isStoredMediaProviderEntryPresent(entry));
}

export function shouldSyncLocalMediaProvidersToDaemon(
  localProviders: Record<string, MediaProviderCredentials> | undefined,
  daemonProviders: Record<string, MediaProviderCredentials> | null | undefined,
): boolean {
  return daemonProviders != null
    && Object.values(localProviders ?? {}).some((entry) => hasRecoverableLocalMediaProviderFields(entry))
    && !hasAnyDaemonManagedMediaProvider(daemonProviders);
}

export async function syncMediaProvidersToDaemon(
  providers: Record<string, MediaProviderCredentials> | undefined,
  options?: {
    force?: boolean;
    daemonProviders?: Record<string, MediaProviderCredentials> | null;
    throwOnError?: boolean;
  },
): Promise<void> {
  if (!providers) return;
  try {
    const payload = buildMediaProvidersForDaemonSave(
      providers,
      options?.daemonProviders,
      { force: options?.force },
    );
    const response = await pixflowRuntimeFetch('/api/media/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Failed to sync media config (${response.status})`);
  } catch {
    if (options?.throwOnError) throw new Error('Media config save failed');
    // Daemon offline; localStorage keeps the user's copy for the next save.
  }
}

let daemonConfigFetchPromise: Promise<AppConfigPrefs | null> | null = null;
let daemonConfigFetchCache: { value: AppConfigPrefs | null; checkedAt: number } | null = null;
const DAEMON_CONFIG_FETCH_CACHE_TTL_MS = 30000;

type PixflowSharedAppConfigCache = {
  value: AppConfigPrefs | null;
  checkedAt: number;
  promise?: Promise<AppConfigPrefs | null> | null;
};

function readSharedPixflowAppConfigCache(now = Date.now()): AppConfigPrefs | null | undefined {
  if (typeof window === 'undefined') return undefined;
  const shared = (window as unknown as {
    __PIXFLOW_DESIGN_APP_CONFIG_CACHE__?: PixflowSharedAppConfigCache;
  }).__PIXFLOW_DESIGN_APP_CONFIG_CACHE__;
  if (!shared || now - shared.checkedAt >= DAEMON_CONFIG_FETCH_CACHE_TTL_MS) {
    return undefined;
  }
  daemonConfigFetchCache = { value: shared.value, checkedAt: shared.checkedAt };
  return shared.value;
}

function readSharedPixflowAppConfigPromise(): Promise<AppConfigPrefs | null> | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as {
    __PIXFLOW_DESIGN_APP_CONFIG_CACHE__?: PixflowSharedAppConfigCache;
  }).__PIXFLOW_DESIGN_APP_CONFIG_CACHE__?.promise ?? null;
}

function writeSharedPixflowAppConfigPromise(promise: Promise<AppConfigPrefs | null> | null): void {
  if (typeof window === 'undefined') return;
  const current = (window as unknown as {
    __PIXFLOW_DESIGN_APP_CONFIG_CACHE__?: PixflowSharedAppConfigCache;
  }).__PIXFLOW_DESIGN_APP_CONFIG_CACHE__;
  (window as unknown as {
    __PIXFLOW_DESIGN_APP_CONFIG_CACHE__?: PixflowSharedAppConfigCache;
  }).__PIXFLOW_DESIGN_APP_CONFIG_CACHE__ = {
    value: current?.value ?? null,
    checkedAt: current?.checkedAt ?? 0,
    promise,
  };
}

function writeSharedPixflowAppConfigCache(value: AppConfigPrefs | null): void {
  if (typeof window === 'undefined') return;
  (window as unknown as {
    __PIXFLOW_DESIGN_APP_CONFIG_CACHE__?: PixflowSharedAppConfigCache;
  }).__PIXFLOW_DESIGN_APP_CONFIG_CACHE__ = {
    value,
    checkedAt: Date.now(),
    promise: null,
  };
}

export function clearDaemonConfigFetchCache(): void {
  daemonConfigFetchPromise = null;
  daemonConfigFetchCache = null;
}

export async function fetchDaemonConfig(): Promise<AppConfigPrefs | null> {
  const now = Date.now();
  if (hasPixflowWordPressContext()) {
    if (daemonConfigFetchPromise) {
      return daemonConfigFetchPromise;
    }
    // WordPress is the authoritative config store for the embedded app. The
    // local Bridge is an optional execution capability, not a prerequisite
    // for loading onboarding or BYOK settings, so bootstrap must never probe
    // loopback merely to hydrate app config.
    daemonConfigFetchPromise = (async () => {
      try {
        const response = await pixflowWordPressRestFetch('/od/app-config', {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return null;
        const body = await response.json() as { config?: AppConfigPrefs | null };
        return body.config ?? null;
      } catch {
        return null;
      }
    })();
    writeSharedPixflowAppConfigPromise(daemonConfigFetchPromise);
    try {
      const value = await daemonConfigFetchPromise;
      daemonConfigFetchCache = { value, checkedAt: Date.now() };
      writeSharedPixflowAppConfigCache(value);
      return value;
    } finally {
      daemonConfigFetchPromise = null;
      writeSharedPixflowAppConfigPromise(null);
    }
  }

  if (daemonConfigFetchCache && now - daemonConfigFetchCache.checkedAt < DAEMON_CONFIG_FETCH_CACHE_TTL_MS) {
    return daemonConfigFetchCache.value;
  }
  const sharedValue = readSharedPixflowAppConfigCache(now);
  if (sharedValue !== undefined) {
    return sharedValue;
  }
  const sharedPromise = readSharedPixflowAppConfigPromise();
  if (sharedPromise) {
    return sharedPromise;
  }
  if (daemonConfigFetchPromise) {
    return daemonConfigFetchPromise;
  }

  daemonConfigFetchPromise = (async () => {
    try {
      const res = await fetch('/api/app-config');
      if (!res.ok) return null;
      const data = await res.json();
      return data?.config ?? null;
    } catch {
      return null;
    }
  })();
  writeSharedPixflowAppConfigPromise(daemonConfigFetchPromise);

  try {
    const value = await daemonConfigFetchPromise;
    daemonConfigFetchCache = { value, checkedAt: Date.now() };
    writeSharedPixflowAppConfigCache(value);
    return value;
  } finally {
    daemonConfigFetchPromise = null;
    writeSharedPixflowAppConfigPromise(null);
  }
}

function notifyPixflowWorkspaceReadyAfterConfigSave(): void {
  if (typeof window === 'undefined' || window.parent === window) return;

  // Pixflow-owned: the WordPress overlay keeps the splash up until the app has
  // completed the daemon-backed app-config save that follows workspace/plugin
  // hydration. Wait two frames after the 200 response so the plugin grid can
  // apply its post-config render before the shell fades the splash.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.parent.postMessage({
        source: 'pixflow-design',
        type: 'pixflow-design:workspace-ready',
        trigger: 'app-config-put',
      }, '*');
    });
  });
}

function notifyPixflowAppConfigChangedAfterConfigSave(config: AppConfigPrefs): void {
  if (typeof window === 'undefined') return;

  const notification = createPixflowSharedAppConfigNotification(
    config,
    hasPixflowWordPressContext() ? 'wp_admin' : 'bricks_builder',
    'config-save',
  );
  if (!notification) return;
  const patch = notification.patch;

  publishPixflowSharedAppConfigNotification(notification);

  window.dispatchEvent(new CustomEvent('open-design:app-config-changed', {
    detail: patch,
  }));

  if (window.parent === window) return;
  window.parent.postMessage({
    source: 'pixflow-design',
    type: 'pixflow-design:app-config-changed',
    config: patch,
    notification,
  }, '*');
}

export async function syncConfigToDaemon(
  config: AppConfig,
  options?: { throwOnError?: boolean },
): Promise<void> {
  const prefs: AppConfigPrefs = hasPixflowWordPressContext() ? {
    agentId: config.agentId,
    agentModels: config.agentModels,
    agentCliEnv: config.agentCliEnv,
    allowVisualReviewerFallback: config.allowVisualReviewerFallback,
    bricksUseSiteStyles: config.bricksUseSiteStyles,
    enhancedDesignGuidance: config.enhancedDesignGuidance,
    codexImagegenOverride: config.codexImagegenOverride,
    disableBricksEmptyDivMinimumSize: config.disableBricksEmptyDivMinimumSize,
    bricksAbilitiesEnabled: config.bricksAbilitiesEnabled,
    bricksExtensions: config.bricksExtensions,
  } : {
    onboardingCompleted: config.onboardingCompleted,
    allowVisualReviewerFallback: config.allowVisualReviewerFallback,
    bricksUseSiteStyles: config.bricksUseSiteStyles,
    enhancedDesignGuidance: config.enhancedDesignGuidance,
    codexImagegenOverride: config.codexImagegenOverride,
    disableBricksEmptyDivMinimumSize: config.disableBricksEmptyDivMinimumSize,
    mode: config.mode,
    apiProtocol: config.apiProtocol,
    apiTransport: config.apiTransport,
    composioProvider: config.composioProvider,
    composioModel: config.composioModel,
    apiVersion: config.apiVersion,
    baseUrl: config.baseUrl,
    model: config.model,
    apiProviderBaseUrl: config.apiProviderBaseUrl,
    apiProtocolConfigs: sanitizeApiProtocolConfigsForPrefs(config.apiProtocolConfigs),
    byokImageModel: config.byokImageModel,
    byokVideoModel: config.byokVideoModel,
    byokSpeechModel: config.byokSpeechModel,
    byokSpeechVoice: config.byokSpeechVoice,
    maxTokens: config.maxTokens,
    agentId: config.agentId,
    agentModels: config.agentModels,
    agentCliEnv: config.agentCliEnv,
    skillId: config.skillId,
    designSystemId: config.designSystemId,
    disabledSkills: config.disabledSkills,
    disabledDesignSystems: config.disabledDesignSystems,
    orbit: normalizeOrbit(config.orbit),
    customInstructions: config.customInstructions ?? null,
    projectLocations: config.projectLocations ?? [],
    defaultProjectLocationId: config.defaultProjectLocationId ?? 'default',
  };
  try {
    if (hasPixflowWordPressContext()) {
      await persistPixflowOptionalBridgeConfig(prefs as Record<string, unknown>);
      daemonConfigFetchCache = { value: prefs, checkedAt: Date.now() };
      daemonConfigFetchPromise = null;
      notifyPixflowAppConfigChangedAfterConfigSave(prefs);
      notifyPixflowWorkspaceReadyAfterConfigSave();
      return;
    }

    const response = await fetch('/api/app-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(prefs),
    });
    if (!response.ok) throw new Error(`Failed to sync app config (${response.status})`);
    daemonConfigFetchCache = { value: prefs, checkedAt: Date.now() };
    daemonConfigFetchPromise = null;
    notifyPixflowAppConfigChangedAfterConfigSave(prefs);
    notifyPixflowWorkspaceReadyAfterConfigSave();
  } catch (error) {
    if (options?.throwOnError) throw error;
    // Daemon offline; localStorage keeps the user's copy for the next save.
  }
}
