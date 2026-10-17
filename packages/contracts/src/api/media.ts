export const MEDIA_EXECUTION_MODES = [
  'enabled',
  'disabled',
] as const;

export type MediaExecutionMode = (typeof MEDIA_EXECUTION_MODES)[number];

export type MediaSurface = 'image' | 'video' | 'audio';

/**
 * Run-scoped policy controlling Pixflow Design-owned media generation only.
 *
 * `allowedSurfaces` and `allowedModels` apply solely to `/api/tools/media/generate`
 * and in-run `od media generate`. External MCP media tools are intentionally
 * unaffected: provider policy for those belongs to the MCP server / orchestrator.
 */
export interface MediaExecutionPolicy {
  mode: MediaExecutionMode;
  allowedSurfaces?: MediaSurface[];
  allowedModels?: string[];
}

export const DEFAULT_MEDIA_EXECUTION_POLICY: MediaExecutionPolicy = {
  mode: 'enabled',
};

export type StockImageOrientation = 'landscape' | 'portrait' | 'squarish';

export interface StockImageResolveRequest {
  query: string;
  orientation?: StockImageOrientation;
  color?: string;
  count?: number;
}

export type StockImageFallbackReason =
  | 'disabled'
  | 'not_configured'
  | 'no_results'
  | 'upstream_error'
  | 'tracking_failed';

export interface ResolvedStockImage {
  id: string;
  provider: 'unsplash' | 'placeholder';
  url: string;
  width: number;
  height: number;
  alt: string;
  html: string;
  photographer?: string;
  photographerUrl?: string;
  sourceUrl?: string;
  attributionText?: string;
}

export interface StockImageResolveResponse {
  ok: true;
  provider: 'unsplash' | 'placeholder';
  fallback: boolean;
  reason?: StockImageFallbackReason;
  query: string;
  images: ResolvedStockImage[];
}

export interface UnsplashConnectionTestRequest {
  /** Optional unsaved draft. When omitted, the daemon tests the stored key. */
  apiKey?: string;
}

export type UnsplashConnectionTestKind =
  | 'success'
  | 'missing_key'
  | 'auth_failed'
  | 'rate_limited'
  | 'upstream_error';

export interface UnsplashConnectionTestResponse {
  ok: boolean;
  kind: UnsplashConnectionTestKind;
  status: number;
  limit: number | null;
  remaining: number | null;
}
