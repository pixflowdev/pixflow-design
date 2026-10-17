import type { PixflowBuilderId, PixflowBuilderDestinationList, PixflowBuilderDestinationRequest, PixflowBuilderDestinationResult } from '@open-design/contracts';
import { pixflowWordPressRestFetch } from './runtime-fetch';

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { message?: string; error?: string };
  if (!response.ok) throw new Error(data.message || data.error || response.statusText);
  return data;
}
export function listBuilderDestinations(builder?: PixflowBuilderId, search = '', signal?: AbortSignal): Promise<PixflowBuilderDestinationList> {
  const query = new URLSearchParams();
  if (builder) query.set('builder', builder);
  if (search.trim()) query.set('search', search.trim());
  return pixflowWordPressRestFetch(`/builder-destinations?${query}`, { signal }).then(readResponse<PixflowBuilderDestinationList>);
}
export function prepareBuilderDestination(request: PixflowBuilderDestinationRequest): Promise<PixflowBuilderDestinationResult> {
  return pixflowWordPressRestFetch('/builder-destinations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) }).then(readResponse<PixflowBuilderDestinationResult>);
}
/** Editor links are navigation only, never an execution or cross-origin transport. */
export function safeBuilderEditorUrl(value: string): string | null {
  try {
    const url = new URL(value, window.location.href);
    return url.origin === window.location.origin && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
/** Stable, site-scoped editor context. The value is an opaque server-issued tab identity. */
export function builderEditorWindowName(value: string): string | undefined {
  const safe = safeBuilderEditorUrl(value);
  if (!safe) return undefined;
  const tabId = new URL(safe).searchParams.get('pixflow_handoff_tab');
  return tabId && /^[A-Za-z0-9_-]{1,128}$/.test(tabId) ? `pixflow-build-${tabId}` : undefined;
}
