import type { Dict, Locale } from '../i18n/types';
import type { LocalizedContentBundle } from '../i18n/content-types';
import { getPixflowWordPressConfig } from './wordpress-context';

export type DownloadableLocale = Exclude<Locale, 'en'>;
export const LANGUAGE_PACK_INSTALLED_EVENT = 'pixflow:language-pack-installed';
export interface LanguagePack { schema: 1; locale: DownloadableLocale; dictionary: Dict; content: LocalizedContentBundle }
export interface LanguagePackStatus { languages: Array<{ locale: Locale; installed: boolean; updateAvailable?: boolean }>; canInstall: boolean }
type PackStore = { loaded: Map<string, LanguagePack>; pending: Map<string, Promise<LanguagePack>> };
const storeKey = Symbol.for('pixflow.language-packs.v1');
const scope = (typeof window === 'undefined' ? {} : window) as unknown as Record<symbol, PackStore | undefined>;
const store = scope[storeKey] ??= { loaded: new Map(), pending: new Map() };

/** This transport cannot import licence/request helpers: those translate errors
 * themselves and would introduce an initialization cycle in the i18n loaders. */
function endpoint(path: string): { url: string; nonce: string } {
  const config = getPixflowWordPressConfig();
  if (!config?.restBaseUrl) throw new Error('WordPress language storage is unavailable.');
  const base = new URL(config.restRouteBaseUrl || config.restBaseUrl, window.location.href);
  if (config.restRouteBaseUrl || base.searchParams.has('rest_route')) {
    base.searchParams.set('rest_route', `/pixflow-design/v1/language-packs${path}`);
  } else base.pathname = `${base.pathname.replace(/\/$/, '')}/language-packs${path}`;
  return { url: base.toString(), nonce: config.restNonce || '' };
}

async function request(path: string, method = 'GET'): Promise<unknown> {
  const { url, nonce } = endpoint(path);
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 60_000);
  try {
    const response = await fetch(url, { method, credentials: 'same-origin', headers: { 'X-WP-Nonce': nonce }, cache: 'no-store', signal: abort.signal });
    if (!response.ok) throw new Error(`Language request failed (${response.status}).`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}

function validatePack(value: unknown, locale: DownloadableLocale): LanguagePack {
  const pack = value as LanguagePack | undefined;
  if (!pack || pack.schema !== 1 || pack.locale !== locale || !pack.dictionary || Array.isArray(pack.dictionary)
    || typeof pack.dictionary !== 'object' || !Object.values(pack.dictionary).every((text) => typeof text === 'string')
    || typeof pack.dictionary['chat.send'] !== 'string'
    || !pack.content || typeof pack.content !== 'object'
    || !['skillCopy', 'designSystemSummaries', 'designSystemCategories', 'promptTemplateCategories', 'promptTemplateTags', 'promptTemplateCopy'].every((key) => {
      const table = (pack.content as unknown as Record<string, unknown>)[key];
      return table !== null && typeof table === 'object' && !Array.isArray(table);
    })) throw new Error('Invalid language pack.');
  return pack;
}

const statusRequests = new Map<string, Promise<LanguagePackStatus>>();
export function getLanguagePackStatus(): Promise<LanguagePackStatus> {
  const { url, nonce } = endpoint('');
  const key = `${url}:${nonce}`;
  const pending = statusRequests.get(key);
  if (pending) return pending;
  const result = request('').then((value) => {
    const status = value as LanguagePackStatus;
    if (!Array.isArray(status?.languages) || typeof status.canInstall !== 'boolean') throw new Error('Invalid language status.');
    return status;
  }).finally(() => statusRequests.delete(key));
  statusRequests.set(key, result);
  return result;
}

/** Reads only a locally installed, server-verified pack. Never installs on load. */
export function loadInstalledLanguage(locale: DownloadableLocale): Promise<LanguagePack> {
  const key = endpoint(`/${locale}`).url;
  const loaded = store.loaded.get(key);
  if (loaded) return Promise.resolve(loaded);
  const pending = store.pending.get(key);
  if (pending) return pending;
  const result = request(`/${locale}`).then((value) => {
    const pack = validatePack(value, locale); store.loaded.set(key, pack); return pack;
  }).finally(() => store.pending.delete(key));
  store.pending.set(key, result);
  return result;
}

/** Explicit user action, available in Free without a licence or local Bridge. */
export async function installLanguage(locale: DownloadableLocale): Promise<LanguagePack> {
  const pack = validatePack(await request(`/${locale}`, 'POST'), locale);
  store.loaded.set(endpoint(`/${locale}`).url, pack);
  window.dispatchEvent(new CustomEvent(LANGUAGE_PACK_INSTALLED_EVENT, { detail: locale }));
  return pack;
}
