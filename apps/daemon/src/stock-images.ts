import type {
  ResolvedStockImage,
  StockImageFallbackReason,
  StockImageOrientation,
  StockImageResolveRequest,
  StockImageResolveResponse,
  UnsplashConnectionTestRequest,
  UnsplashConnectionTestResponse,
} from '@open-design/contracts';
import { resolveProviderConfig } from './media-config.js';

const UNSPLASH_API_ORIGIN = 'https://api.unsplash.com';
const UNSPLASH_PROVIDER_ID = 'unsplash';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESULTS = 4;
const UTM_QUERY = 'utm_source=pixflow_design&utm_medium=referral';
const ORIENTATIONS = new Set<StockImageOrientation>([
  'landscape',
  'portrait',
  'squarish',
]);
const COLORS = new Set([
  'black_and_white',
  'black',
  'white',
  'yellow',
  'orange',
  'red',
  'purple',
  'magenta',
  'green',
  'teal',
  'blue',
]);

type FetchLike = typeof fetch;

interface UnsplashPhoto {
  id?: unknown;
  width?: unknown;
  height?: unknown;
  alt_description?: unknown;
  description?: unknown;
  urls?: { regular?: unknown };
  links?: { html?: unknown; download_location?: unknown };
  user?: {
    name?: unknown;
    links?: { html?: unknown };
  };
}

interface UnsplashSearchResponse {
  results?: unknown;
}

export class StockImageRequestError extends Error {
  readonly status = 400;
  readonly code = 'STOCK_IMAGE_BAD_REQUEST';
}

export interface ResolveStockImagesOptions {
  projectRoot: string;
  request: StockImageResolveRequest;
  requestInit?: RequestInit;
  fetchImpl?: FetchLike;
}

export interface TestUnsplashConnectionOptions {
  projectRoot: string;
  request: UnsplashConnectionTestRequest;
  requestInit?: RequestInit;
  fetchImpl?: FetchLike;
}

function normalizedRequest(request: StockImageResolveRequest): Required<Pick<StockImageResolveRequest, 'query' | 'count'>> & Pick<StockImageResolveRequest, 'orientation' | 'color'> {
  const query = typeof request?.query === 'string' ? request.query.trim() : '';
  if (!query) throw new StockImageRequestError('query is required');
  if (query.length > 180) throw new StockImageRequestError('query must be 180 characters or fewer');

  const orientation = request.orientation;
  if (orientation != null && !ORIENTATIONS.has(orientation)) {
    throw new StockImageRequestError('orientation must be landscape, portrait, or squarish');
  }
  const color = typeof request.color === 'string' ? request.color.trim() : '';
  if (color && !COLORS.has(color)) {
    throw new StockImageRequestError('color is not supported by Unsplash');
  }
  const requestedCount = Number(request.count ?? 1);
  const count = Number.isFinite(requestedCount)
    ? Math.min(MAX_RESULTS, Math.max(1, Math.trunc(requestedCount)))
    : 1;
  return {
    query,
    count,
    ...(orientation ? { orientation } : {}),
    ...(color ? { color } : {}),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function withUtm(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.searchParams.set('utm_source', 'pixflow_design');
  url.searchParams.set('utm_medium', 'referral');
  return url.toString();
}

function placeholderDimensions(orientation?: StockImageOrientation): { width: number; height: number } {
  if (orientation === 'portrait') return { width: 1200, height: 1600 };
  if (orientation === 'squarish') return { width: 1400, height: 1400 };
  return { width: 1600, height: 900 };
}

function placeholderResponse(
  request: ReturnType<typeof normalizedRequest>,
  reason: StockImageFallbackReason,
): StockImageResolveResponse {
  const { width, height } = placeholderDimensions(request.orientation);
  const label = encodeURIComponent('Image placeholder');
  const url = `https://placehold.co/${width}x${height}/e9ecef/6c757d.png?text=${label}`;
  const alt = `Placeholder for ${request.query}`;
  return {
    ok: true,
    provider: 'placeholder',
    fallback: true,
    reason,
    query: request.query,
    images: [{
      id: `placeholder-${request.orientation ?? 'landscape'}`,
      provider: 'placeholder',
      url,
      width,
      height,
      alt,
      html: `<img src="${url}" alt="${escapeHtml(alt)}" width="${width}" height="${height}">`,
    }],
  };
}

function requestHeaders(accessKey: string, requestInit?: RequestInit): Headers {
  const headers = new Headers(requestInit?.headers);
  headers.set('Accept-Version', 'v1');
  headers.set('Authorization', `Client-ID ${accessKey}`);
  return headers;
}

async function officialUnsplashGet(
  url: URL,
  accessKey: string,
  fetchImpl: FetchLike,
  requestInit?: RequestInit,
): Promise<Response> {
  if (url.origin !== UNSPLASH_API_ORIGIN) {
    throw new Error('Unsplash returned a non-official API URL');
  }
  return fetchImpl(url, {
    ...requestInit,
    method: 'GET',
    headers: requestHeaders(accessKey, requestInit),
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveInt(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function nonNegativeHeaderInt(value: string | null): number | null {
  if (value == null || !/^\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

/**
 * Verify an Unsplash Access Key without persisting a draft key. Unsplash
 * reports the hourly application allowance on every API response via the
 * X-Ratelimit-Limit and X-Ratelimit-Remaining headers, so the Settings UI can
 * show useful quota feedback without making a second request.
 */
export async function testUnsplashConnection(
  options: TestUnsplashConnectionOptions,
): Promise<UnsplashConnectionTestResponse> {
  const draftKey = typeof options.request?.apiKey === 'string'
    ? options.request.apiKey.trim()
    : '';
  const config = draftKey
    ? null
    : await resolveProviderConfig(options.projectRoot, UNSPLASH_PROVIDER_ID);
  const accessKey = draftKey || config?.apiKey?.trim() || '';
  if (!accessKey) {
    return {
      ok: false,
      kind: 'missing_key',
      status: 400,
      limit: null,
      remaining: null,
    };
  }

  const url = new URL('/photos', UNSPLASH_API_ORIGIN);
  url.searchParams.set('page', '1');
  url.searchParams.set('per_page', '1');
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await officialUnsplashGet(
      url,
      accessKey,
      fetchImpl,
      options.requestInit,
    );
    const limit = nonNegativeHeaderInt(response.headers.get('x-ratelimit-limit'));
    const remaining = nonNegativeHeaderInt(response.headers.get('x-ratelimit-remaining'));
    if (response.ok) {
      return { ok: true, kind: 'success', status: response.status, limit, remaining };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, kind: 'auth_failed', status: response.status, limit, remaining };
    }
    if (response.status === 429) {
      return { ok: false, kind: 'rate_limited', status: response.status, limit, remaining };
    }
    return { ok: false, kind: 'upstream_error', status: response.status, limit, remaining };
  } catch {
    return {
      ok: false,
      kind: 'upstream_error',
      status: 0,
      limit: null,
      remaining: null,
    };
  }
}

function imageFromPhoto(photo: UnsplashPhoto): ResolvedStockImage | null {
  const id = stringValue(photo.id);
  const url = stringValue(photo.urls?.regular);
  const photographer = stringValue(photo.user?.name);
  const rawPhotographerUrl = stringValue(photo.user?.links?.html);
  const rawSourceUrl = stringValue(photo.links?.html);
  if (!id || !url || !photographer || !rawPhotographerUrl || !rawSourceUrl) return null;

  const photographerUrl = withUtm(rawPhotographerUrl);
  const sourceUrl = withUtm(rawSourceUrl);
  const alt = stringValue(photo.alt_description)
    || stringValue(photo.description)
    || `Photo by ${photographer}`;
  const width = positiveInt(photo.width);
  const height = positiveInt(photo.height);
  const attributionText = `Photo by ${photographer} on Unsplash`;
  const html = [
    '<figure class="pixflow-stock-image">',
    `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}"${width ? ` width="${width}"` : ''}${height ? ` height="${height}"` : ''}>`,
    '<figcaption class="pixflow-stock-image__credit">',
    `Photo by <a href="${escapeHtml(photographerUrl)}">${escapeHtml(photographer)}</a> on <a href="https://unsplash.com/?${UTM_QUERY}">Unsplash</a>`,
    '</figcaption>',
    '</figure>',
  ].join('');
  return {
    id,
    provider: 'unsplash',
    url,
    width,
    height,
    alt,
    html,
    photographer,
    photographerUrl,
    sourceUrl,
    attributionText,
  };
}

/**
 * Resolve stock imagery for agent-authored HTML. The provider boundary is
 * deliberately generic so a future Pixflow-curated catalogue can satisfy the
 * same contract. Unsplash is fail-soft: disabled, missing, exhausted, or
 * untrackable results return a deterministic placeholder instead of failing a
 * design run.
 */
export async function resolveStockImages(
  options: ResolveStockImagesOptions,
): Promise<StockImageResolveResponse> {
  const request = normalizedRequest(options.request);
  const config = await resolveProviderConfig(options.projectRoot, UNSPLASH_PROVIDER_ID);
  if (config.enabled !== true) return placeholderResponse(request, 'disabled');

  const accessKey = config.apiKey?.trim() ?? '';
  if (!accessKey) return placeholderResponse(request, 'not_configured');

  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const searchUrl = new URL('/search/photos', UNSPLASH_API_ORIGIN);
    searchUrl.searchParams.set('query', request.query);
    searchUrl.searchParams.set('per_page', String(request.count));
    searchUrl.searchParams.set('content_filter', 'high');
    if (request.orientation) searchUrl.searchParams.set('orientation', request.orientation);
    if (request.color) searchUrl.searchParams.set('color', request.color);

    const searchResponse = await officialUnsplashGet(
      searchUrl,
      accessKey,
      fetchImpl,
      options.requestInit,
    );
    if (!searchResponse.ok) return placeholderResponse(request, 'upstream_error');
    const body = await searchResponse.json() as UnsplashSearchResponse;
    const photos = Array.isArray(body.results)
      ? body.results.slice(0, request.count) as UnsplashPhoto[]
      : [];
    if (photos.length === 0) return placeholderResponse(request, 'no_results');

    const images: ResolvedStockImage[] = [];
    let trackingFailed = false;
    for (const photo of photos) {
      const image = imageFromPhoto(photo);
      const downloadLocation = stringValue(photo.links?.download_location);
      if (!image || !downloadLocation) {
        trackingFailed = true;
        continue;
      }
      let trackingUrl: URL;
      try {
        trackingUrl = new URL(downloadLocation);
      } catch {
        trackingFailed = true;
        continue;
      }
      const trackingResponse = await officialUnsplashGet(
        trackingUrl,
        accessKey,
        fetchImpl,
        options.requestInit,
      );
      if (!trackingResponse.ok) {
        trackingFailed = true;
        continue;
      }
      images.push(image);
    }
    if (images.length === 0) {
      return placeholderResponse(request, trackingFailed ? 'tracking_failed' : 'no_results');
    }
    return {
      ok: true,
      provider: 'unsplash',
      fallback: false,
      query: request.query,
      images,
    };
  } catch {
    return placeholderResponse(request, 'upstream_error');
  }
}
