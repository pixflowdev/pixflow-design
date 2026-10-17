import { LOCALE_LOADERS } from './locale-loaders';
import { en } from './locales/en';
import type { Dict, Locale } from './types';
import { i18nResources } from './resource-store';

const DICTS = i18nResources.dictionaries;
const pendingDictionaries = i18nResources.pendingDictionaries;

export function getLocaleDictionary(locale: Locale): Dict {
  return DICTS[locale] ?? en;
}

export function isLocaleDictionaryLoaded(locale: Locale): boolean {
  return Boolean(DICTS[locale]);
}

/** Concurrent roots share one request; a failed chunk never poisons later retries. */
export function loadLocaleDictionary(locale: Locale): Promise<void> {
  if (locale === 'en' || DICTS[locale]) return Promise.resolve();
  const pending = pendingDictionaries.get(locale);
  if (pending) return pending;
  const request = LOCALE_LOADERS[locale]().then((dict) => { DICTS[locale] = dict; })
    .finally(() => { pendingDictionaries.delete(locale); });
  pendingDictionaries.set(locale, request);
  return request;
}

/** Translate presentation text without changing the source metadata sent to an agent. */
export function translateLocale(locale: Locale, key: keyof Dict, vars?: Record<string, string | number>): string {
  const raw = getLocaleDictionary(locale)[key] ?? en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = vars[name];
    return value == null ? `{${name}}` : String(value);
  });
}

