import type { PixflowBricksIntentContract } from '@open-design/contracts';

export type MediaGenerationSurface = 'image' | 'video' | 'audio';

export interface MediaProviderCatalogEntry {
  providerId?: unknown;
  provider?: unknown;
  model?: unknown;
  surface?: unknown;
  configured?: unknown;
}

export interface MediaProviderPreflightNotice {
  code: 'MEDIA_PROVIDER_REQUIRED';
  surface: MediaGenerationSurface;
  title: string;
  message: string;
}

const MODEL_SURFACE_PATTERNS: Record<MediaGenerationSurface, RegExp> = {
  image: /(?:image|imagen|gemini|flux|dall[-\s]?e|gpt[-_]?image|recraft|ideogram|phoenix|seedream|seededit|custom[-_]?image)/i,
  video: /(?:video|veo|seedance|kling|wan|sora|grok[-_]?imagine|motion)/i,
  audio: /(?:audio|music|voice|tts|speech|sfx|lyria|eleven)/i,
};

const SURFACE_LABELS: Record<MediaGenerationSurface, string> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
};

function catalogEntrySupportsSurface(
  entry: MediaProviderCatalogEntry,
  surface: MediaGenerationSurface,
): boolean {
  if (entry.configured !== true) return false;
  const explicitSurface = String(entry.surface || '').trim().toLowerCase();
  if (explicitSurface) return explicitSurface === surface;

  const provider = String(entry.providerId || entry.provider || '').trim();
  const model = String(entry.model || '').trim();
  return MODEL_SURFACE_PATTERNS[surface].test(`${provider} ${model}`);
}

export function hasConfiguredMediaProviderForSurface(
  catalog: unknown,
  surface: MediaGenerationSurface,
): boolean {
  if (!Array.isArray(catalog)) return false;
  return catalog.some((entry) => (
    entry !== null
    && typeof entry === 'object'
    && catalogEntrySupportsSurface(entry as MediaProviderCatalogEntry, surface)
  ));
}

export function mediaProviderPreflightNotice(
  intentContract: Pick<PixflowBricksIntentContract, 'mediaPolicy' | 'mediaSurface'> | null,
  catalog: unknown,
): MediaProviderPreflightNotice | null {
  const surface = intentContract?.mediaPolicy === 'generated'
    && intentContract.mediaSurface !== 'none'
    ? intentContract.mediaSurface
    : null;
  if (!surface || hasConfiguredMediaProviderForSurface(catalog, surface)) return null;

  const label = SURFACE_LABELS[surface];
  return {
    code: 'MEDIA_PROVIDER_REQUIRED',
    surface,
    title: `${label.charAt(0).toUpperCase()}${label.slice(1)} provider required`,
    message: `Set up a ${label} media provider in Pixflow Design Settings → Media Providers before this action can be performed.`,
  };
}
