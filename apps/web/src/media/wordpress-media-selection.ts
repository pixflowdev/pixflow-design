import {
  AUDIO_MODELS_BY_KIND,
  findMediaModel,
  findProvider,
  IMAGE_MODELS,
  mediaModelProviderId,
  VIDEO_MODELS,
  type MediaModel,
  type MediaProviderId,
} from './models';
import type { MediaProviderCredentials } from '../types';

export type WordPressMediaSurface = 'image' | 'video' | 'audio';

export interface WordPressMediaModelChoice {
  providerId: string;
  model: string;
  label: string;
  description?: string;
  value: string;
}

export interface WordPressImageSelectionInput {
  /** Model explicitly selected for this project/turn, if any. */
  metadataModel?: string | null;
  /** Model selected in the project conversation, if any. */
  overrideModel?: string | null;
  /** Persisted BYOK image-model default, if any. */
  configuredModel?: string | null;
  /** Active chat protocol (Google is aliased to Nano Banana for media). */
  apiProtocol?: string | null;
  mediaProviders?: Record<string, MediaProviderCredentials>;
  fallbackModel?: string | null;
}

export interface WordPressImageSelection {
  model: string;
  providerId: string;
  providerConfig?: MediaProviderCredentials;
}

function modelsForSurface(surface: WordPressMediaSurface): MediaModel[] {
  if (surface === 'image') return IMAGE_MODELS;
  if (surface === 'video') return VIDEO_MODELS.filter((model) => model.id !== 'hyperframes-html');
  return [
    ...AUDIO_MODELS_BY_KIND.music,
    ...AUDIO_MODELS_BY_KIND.speech,
    ...AUDIO_MODELS_BY_KIND.sfx,
  ];
}

function providerLabel(providerId: string): string {
  return findProvider(providerId as MediaProviderId)?.label ?? providerId;
}

function choiceForModel(
  providerId: string,
  model: string,
  catalogModel?: MediaModel | null,
): WordPressMediaModelChoice {
  const cleanProviderId = providerId.trim();
  const cleanModel = model.trim();
  const label = catalogModel?.label?.trim() || cleanModel;
  const hint = catalogModel?.hint?.trim() || providerLabel(cleanProviderId);
  return {
    providerId: cleanProviderId,
    model: cleanModel,
    label: `${providerLabel(cleanProviderId)} — ${label}`,
    ...(hint ? { description: hint } : {}),
    value: `${cleanProviderId}::${cleanModel}`,
  };
}

/**
 * Return the media models that can actually be used by the browser-owned
 * WordPress adapter. A provider is eligible only when the current browser
 * config contains the key itself; apiKeyConfigured markers are deliberately
 * excluded because they can be daemon-side metadata without a request-scoped
 * credential. Provider-specific custom model fields are accepted as-is, while
 * providers without a custom model expose the registered models for that
 * surface. The result is safe to serialize into a question-form: it contains
 * no credential material.
 */
export function configuredWordPressMediaModelChoices(input: {
  surface: WordPressMediaSurface;
  mediaProviders?: Record<string, MediaProviderCredentials>;
  apiProtocol?: string | null;
  apiKey?: string | null;
  /** Optional live provider catalogue (for providers such as AIHubMix). */
  dynamicModels?: MediaModel[];
}): WordPressMediaModelChoice[] {
  const models = [
    ...modelsForSurface(input.surface),
    ...(input.dynamicModels ?? []),
  ];
  const choices: WordPressMediaModelChoice[] = [];
  const seen = new Set<string>();
  const isSurfaceCompatible = (catalogModel?: MediaModel | null): boolean => {
    if (!catalogModel) return true;
    const caps = catalogModel.caps ?? [];
    return caps.some((cap) => (
      input.surface === 'image'
        ? cap === 't2i' || cap === 'i2i'
        : input.surface === 'video'
          ? cap === 't2v' || cap === 'i2v'
          : cap === 'music' || cap === 'tts' || cap === 'sfx'
    ));
  };
  const addProvider = (providerId: string, entry: MediaProviderCredentials | undefined) => {
    const cleanProviderId = providerId.trim();
    if (!cleanProviderId || !entry?.apiKey?.trim()) return;
    const customModel = entry.model?.trim();
    const customCatalogModel = customModel ? findMediaModel(customModel) : null;
    const customModelSurfaceCompatible = isSurfaceCompatible(customCatalogModel);
    const providerModels = customModel && customModelSurfaceCompatible
      ? [{ model: customModel, catalogModel: customCatalogModel }]
      : models
        .filter((model) => model.provider === cleanProviderId)
        .map((model) => ({ model: model.id, catalogModel: model }));
    // Unknown/custom providers still need one selectable value when their
    // settings include a model. A provider with a key but no known model is
    // not silently offered as an unconfigured/default model.
    for (const candidate of providerModels) {
      if (!candidate.model.trim()) continue;
      // A saved custom model belongs to one media surface. Do not let an
      // image-only Google model leak into the video question (or vice versa)
      // merely because the provider stores one legacy `model` field.
      if (!isSurfaceCompatible(candidate.catalogModel)) continue;
      const choice = choiceForModel(cleanProviderId, candidate.model, candidate.catalogModel);
      if (seen.has(choice.value)) continue;
      seen.add(choice.value);
      choices.push(choice);
    }
  };

  for (const [providerId, entry] of Object.entries(input.mediaProviders ?? {})) {
    addProvider(providerId, entry);
  }

  // A BYOK chat key is also a valid request-scoped media credential when the
  // user has not created a separate Media-provider entry. Google chat maps to
  // the Nano Banana media adapter, matching the normal provider resolution.
  const apiKey = input.apiKey?.trim();
  const apiProtocol = input.apiProtocol?.trim();
  if (apiKey && apiProtocol) {
    const providerId = apiProtocol === 'google' ? 'nanobanana' : apiProtocol;
    addProvider(providerId, {
      apiKey,
      baseUrl: '',
      ...(input.apiProtocol === 'google'
        ? {
            // Google chat credentials are also valid Google AI Studio media
            // credentials. Use a surface-compatible default so a video run
            // never receives the Nano Banana image model.
            model: input.surface === 'video'
              ? 'veo-3.1-generate-preview'
              : 'gemini-3.1-flash-image-preview',
          }
        : {}),
    });
  }
  return choices;
}

export function findConfiguredWordPressMediaChoice(
  choices: WordPressMediaModelChoice[],
  value: string | undefined,
): WordPressMediaModelChoice | undefined {
  const cleanValue = value?.trim();
  if (!cleanValue) return undefined;
  return choices.find((choice) => choice.value === cleanValue);
}

/**
 * Decide whether a media project should use the WordPress media adapter.
 *
 * WordPress intentionally keeps browser-owned provider secrets out of the
 * daemon's persisted media-config.json. A Local CLI run can therefore only
 * use the WordPress adapter when the current browser session has a key to
 * send request-scoped. API mode always uses that adapter for media projects;
 * daemon mode falls back to the daemon dispatcher when no browser key is
 * available (for example, a standalone local project).
 */
export function shouldUseWordPressMediaRoute(input: {
  wordpressRuntime: boolean;
  mode: 'api' | 'daemon' | string;
  surface: 'image' | 'video' | 'audio' | null | undefined;
  mediaProviders?: Record<string, MediaProviderCredentials>;
}): boolean {
  if (!input.wordpressRuntime || !input.surface) return false;
  if (input.mode === 'api') return true;
  return Object.values(input.mediaProviders ?? {}).some((entry) => Boolean(entry?.apiKey?.trim()));
}

function hasProviderCredential(entry: MediaProviderCredentials | undefined): boolean {
  return Boolean(entry?.apiKey?.trim() || entry?.apiKeyConfigured);
}

function preferredProviderForProtocol(
  protocol: string,
  providers: Record<string, MediaProviderCredentials>,
): string | undefined {
  // Google Gemini chat credentials are also the official Nano Banana
  // credentials. Prefer the explicitly configured Nano Banana media entry
  // over Google's Imagen catalogue defaults.
  if (protocol === 'google' && hasProviderCredential(providers.nanobanana)) {
    return 'nanobanana';
  }
  if (protocol && hasProviderCredential(providers[protocol])) {
    return protocol;
  }
  return undefined;
}

function defaultModelForProvider(providerId: string): string | undefined {
  return IMAGE_MODELS.find((model) => model.provider === providerId)?.id;
}

/**
 * Resolve the model/provider pair used by the WordPress-only media adapter.
 *
 * The old path always took the first model for the active chat protocol. That
 * made a configured Nano Banana key send `imagen-4` to Google's `predict`
 * endpoint, even though the user had not selected Imagen. A configured media
 * provider now takes precedence when the user has not supplied an explicit
 * model; its saved model is used, or its first registered model is used as a
 * safe provider default.
 */
export function resolveWordPressImageSelection(
  input: WordPressImageSelectionInput,
): WordPressImageSelection {
  const providers = input.mediaProviders ?? {};
  // Project/turn choices are explicit. The persisted Settings model is only
  // a default: a configured media provider must be allowed to select its own
  // compatible model before that generic default is considered. Otherwise a
  // stale Google Imagen setting can override a newly configured Nano Banana
  // provider and send `imagen-4` to the wrong endpoint.
  const explicitModel = [input.metadataModel, input.overrideModel]
    .map((value) => value?.trim() ?? '')
    .find(Boolean) ?? '';
  const configuredModel = input.configuredModel?.trim() ?? '';

  const matchingConfiguredProvider = explicitModel
    ? Object.entries(providers).find(([, entry]) => (
      hasProviderCredential(entry) && entry.model?.trim() === explicitModel
    ))?.[0]
    : undefined;
  const protocol = input.apiProtocol?.trim() ?? '';
  const preferredProvider = matchingConfiguredProvider
    ?? (!explicitModel ? preferredProviderForProtocol(protocol, providers) : undefined);

  const providerId = preferredProvider
    ?? mediaModelProviderId(explicitModel || configuredModel)
    ?? protocol
    ?? 'openai';
  const providerConfig = providers[providerId];
  const providerConfiguredModel = providerConfig?.model?.trim() ?? '';
  const providerCatalogModel = providerConfiguredModel ? findMediaModel(providerConfiguredModel) : null;
  const providerImageModel = providerCatalogModel && !(providerCatalogModel.caps ?? []).some((cap) => cap === 't2i' || cap === 'i2i')
    ? ''
    : providerConfiguredModel;
  const model = explicitModel
    || providerImageModel
    || defaultModelForProvider(providerId)
    || configuredModel
    || input.fallbackModel?.trim()
    || '';

  return { model, providerId, providerConfig };
}
