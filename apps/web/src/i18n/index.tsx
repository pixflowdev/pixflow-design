'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getOpenDesignHost } from '@open-design/host';
import { LOCALES, type Dict, type Locale } from './types';
import { en } from './locales/en';
import { getLocaleDictionary, isLocaleDictionaryLoaded, loadLocaleDictionary, translateLocale } from './locale-runtime';
import { isLocalizedContentLoaded, loadLocalizedContent } from './content';
import { synchronizeDocumentLocale } from './document-locale';
import { getPixflowWordPressConfig } from '../pixflow/wordpress-context';
import { i18nResources } from './resource-store';

export { LOCALES, LOCALE_LABEL } from './types';
export { translateLocale } from './locale-runtime';
export type { Locale } from './types';

type DictKey = keyof Dict;

const LS_KEY = 'open-design:locale';
// Marker that says "the value in LS_KEY came from a deliberate user
// action through setLocale, not from some auto-detection path". Only
// values tagged this way win over the desktop host's injected OS
// locale, so a stale auto-detected pick can't pin the app forever once
// the user changes their system language.
const LS_SOURCE_KEY = 'open-design:locale-source';
const MANUAL_LOCALE_SOURCE = 'manual';
const LOCALE_CHANGED_EVENT = 'pixflow:locale-changed';
const STORAGE_EVENT_HANDLED = Symbol.for('pixflow.i18n.storage-event-handled');

export function resolveSystemLocale(languages: readonly string[]): Locale | null {
  const supported = LOCALES as readonly string[];
  for (const raw of languages) {
    const normalized = raw.trim().replaceAll('_', '-');
    if (!normalized) continue;

    const exact = LOCALES.find((locale) => locale.toLowerCase() === normalized.toLowerCase());
    if (exact) return exact;

    const [language, regionOrScript] = normalized.toLowerCase().split('-');
    if (language === 'zh') {
      if (regionOrScript === 'hant' || regionOrScript === 'tw' || regionOrScript === 'hk' || regionOrScript === 'mo') {
        return 'zh-TW';
      }
      return 'zh-CN';
    }

    const baseMatch = LOCALES.find((locale) => locale.toLowerCase().split('-')[0] === language);
    if (baseMatch && supported.includes(baseMatch)) return baseMatch;
  }
  return null;
}

// Read the OS locale the desktop host attached to its client descriptor.
// Packaged desktop builds need this because Chromium otherwise reports
// en-US through navigator.language regardless of the OS setting. We go
// through `getOpenDesignHost` rather than reading the bridge global by
// name so the web/preload boundary stays single-source (see the
// `host bridge boundary` guard test).
function readDesktopHostOsLocale(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const host = getOpenDesignHost();
  const value = host?.client?.osLocale;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// A deliberate manual choice wins until the user returns to automatic.
// Untagged legacy values must not pin a previously detected language.
export function detectLocalePreference(): Locale | 'auto' {
  if (typeof window === 'undefined') return 'auto';
  let storedLocale: string | null = null;
  let storedSource: string | null = null;
  try {
    storedLocale = window.localStorage.getItem(LS_KEY);
    storedSource = window.localStorage.getItem(LS_SOURCE_KEY);
  } catch {
    /* ignore */
  }
  if (
    storedSource === MANUAL_LOCALE_SOURCE &&
    storedLocale &&
    (LOCALES as string[]).includes(storedLocale)
  ) {
    return storedLocale as Locale;
  }
  return 'auto';
}

/** WordPress provides get_user_locale(), including its site-default fallback.
 * Unsupported WordPress locales use English; standalone follows OS/browser. */
export function detectAutomaticLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const wordpress = getPixflowWordPressConfig();
  if (wordpress) return resolveSystemLocale([wordpress.userLocale || 'en']) ?? 'en';
  const hostOsLocale = readDesktopHostOsLocale();
  if (hostOsLocale) {
    const fromHost = resolveSystemLocale([hostOsLocale]);
    if (fromHost) return fromHost;
  }
  const detected = resolveSystemLocale(
    navigator.languages?.length ? navigator.languages : [navigator.language],
  );
  return detected ?? 'en';
}

export function detectInitialLocale(): Locale {
  const preference = detectLocalePreference();
  return preference === 'auto' ? detectAutomaticLocale() : preference;
}

interface I18nContextValue {
  locale: Locale;
  localePreference: Locale | 'auto';
  setLocale: (next: Locale) => void;
  resetLocale: () => void;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}

const resourceListeners = i18nResources.listeners;
const pendingResources = i18nResources.pendingResources;

/** Load a language and its catalogue without loading unrelated languages. */
export function loadLocaleResources(locale: Locale): Promise<void> {
  if (isLocaleDictionaryLoaded(locale) && isLocalizedContentLoaded(locale)) return Promise.resolve();
  const pending = pendingResources.get(locale);
  if (pending) return pending;
  const request = Promise.allSettled([loadLocaleDictionary(locale), loadLocalizedContent(locale)])
    .then((results) => {
      i18nResources.revision += 1;
      resourceListeners.forEach((listener) => listener());
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    })
    .finally(() => { pendingResources.delete(locale); });
  pendingResources.set(locale, request);
  return request;
}

/** Commit a preference only after all presentation resources are ready. A newer
 * selection always wins, even across separately mounted panel/Workspace roots. */
export async function applyLocalePreference(preference: Locale | 'auto'): Promise<void> {
  const revision = ++i18nResources.selectionRevision;
  const next = preference === 'auto' ? detectAutomaticLocale() : preference;
  await loadLocaleResources(next);
  if (revision !== i18nResources.selectionRevision) return;
  try {
    if (preference === 'auto') {
      window.localStorage.removeItem(LS_KEY);
      window.localStorage.removeItem(LS_SOURCE_KEY);
    } else {
      window.localStorage.setItem(LS_KEY, preference);
      window.localStorage.setItem(LS_SOURCE_KEY, MANUAL_LOCALE_SOURCE);
    }
  } catch { /* A blocked storage area must not prevent a session-only switch. */ }
  window.dispatchEvent(new CustomEvent(LOCALE_CHANGED_EVENT, { detail: preference }));
}

const I18nContext = createContext<I18nContextValue | null>(null);

interface ProviderProps {
  initial?: Locale;
  children: ReactNode;
}

export function I18nProvider({ initial, children }: ProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => initial ?? (getPixflowWordPressConfig() ? 'en' : detectInitialLocale()));
  const [localePreference, setLocalePreference] = useState<Locale | 'auto'>(detectLocalePreference);

  const [revision, setRevision] = useState(i18nResources.revision);
  useEffect(() => {
    const refresh = () => setRevision(i18nResources.revision);
    resourceListeners.add(refresh);
    // Translation failure must not discard a chat draft or unmount an editor.
    void loadLocaleResources(locale).catch(() => {});
    return () => { resourceListeners.delete(refresh); };
  }, [locale]);

  useEffect(() => {
    return synchronizeDocumentLocale(document, locale, (root) => {
      const selector = '[data-pixflow-i18n-text], [data-pixflow-i18n-title], [data-pixflow-i18n-label], [data-pixflow-i18n-count]';
      const elements = [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)];
      for (const element of elements) {
        const dict = getLocaleDictionary(locale);
        let variables: Record<string, string | number> = {};
        try {
          const parsed: unknown = JSON.parse(element.getAttribute('data-pixflow-i18n-vars') || '{}');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            variables = Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'string' || typeof value === 'number'));
          }
        } catch { /* Invalid presentation metadata must not affect the host editor. */ }
        for (const [attribute, target] of [['text', 'textContent'], ['title', 'title'], ['label', 'aria-label']] as const) {
          const key = element.getAttribute(`data-pixflow-i18n-${attribute}`) as DictKey | null;
          if (!key || !Object.hasOwn(en, key)) continue;
          const value = translateLocale(locale, key, variables);
          if (target === 'textContent') { if (element.textContent !== value) element.textContent = value; }
          else element.setAttribute(target, value);
        }
        const rawCount = element.getAttribute('data-pixflow-i18n-count');
        if (rawCount !== null && /^\d+$/.test(rawCount)) {
          const count = Number(rawCount);
          const key = `annotationCount.${new Intl.PluralRules(locale).select(count)}` as DictKey;
          const value = (dict[key] ?? en[key]).replace('{count}', new Intl.NumberFormat(locale).format(count));
          if (element.textContent !== value) element.textContent = value;
        }
      }
    }, Boolean(getPixflowWordPressConfig()));
  }, [locale, revision]);

  useEffect(() => {
    let alive = true;
    let pending = 0;
    const receive = (preference: Locale | 'auto') => {
      const request = ++pending;
      const revision = i18nResources.selectionRevision;
      const target = preference === 'auto' ? detectAutomaticLocale() : preference;
      setLocalePreference(preference);
      void loadLocaleResources(target).then(() => {
        if (alive && request === pending && revision === i18nResources.selectionRevision) setLocaleState(target);
      }).catch(() => { /* Keep the displayed language and the original saved preference. */ });
    };
    const update = (event: Event) => {
      const next: unknown = (event as CustomEvent).detail;
      if (next === 'auto' || (typeof next === 'string' && (LOCALES as readonly string[]).includes(next))) receive(next as Locale | 'auto');
    };
    const storage = (event: StorageEvent) => {
      if (event.key === LS_KEY || event.key === LS_SOURCE_KEY || event.key === null) {
        const sharedEvent = event as StorageEvent & { [STORAGE_EVENT_HANDLED]?: boolean };
        if (!sharedEvent[STORAGE_EVENT_HANDLED]) {
          sharedEvent[STORAGE_EVENT_HANDLED] = true;
          i18nResources.selectionRevision += 1;
        }
        receive(detectLocalePreference());
      }
    };
    window.addEventListener(LOCALE_CHANGED_EVENT, update);
    window.addEventListener('storage', storage);
    if (!initial) receive(detectLocalePreference());
    return () => {
      alive = false;
      window.removeEventListener(LOCALE_CHANGED_EVENT, update);
      window.removeEventListener('storage', storage);
    };
  }, [initial]);

  const setLocale = useCallback((next: Locale) => { void applyLocalePreference(next).catch(() => {}); }, []);
  const resetLocale = useCallback(() => { void applyLocalePreference('auto').catch(() => {}); }, []);

  const t = useCallback(
    (key: DictKey, vars?: Record<string, string | number>): string => translateLocale(locale, key, vars),
    [locale, revision],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, localePreference, setLocale, resetLocale, t }),
    [locale, localePreference, setLocale, resetLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

const FALLBACK_I18N: I18nContextValue = {
  locale: 'en',
  localePreference: 'auto',
  setLocale: () => {},
  resetLocale: () => {},
  t: (key, vars) => translateLocale('en', key, vars),
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fall back to a stand-alone English translator when no provider is
    // mounted (e.g. an isolated test). This keeps the API safe to call
    // without requiring every callsite to wrap in a provider.
    return FALLBACK_I18N;
  }
  return ctx;
}

// Convenience for components that only need the translator function.
export function useT(): I18nContextValue['t'] {
  return useI18n().t;
}
