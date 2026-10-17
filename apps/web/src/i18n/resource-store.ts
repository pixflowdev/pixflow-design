import { en } from './locales/en';
import type { Dict, Locale } from './types';
import type { LocalizedContentBundle } from './content-types';

interface I18nResourceStore {
  dictionaries: Partial<Record<Locale, Dict>>;
  content: Partial<Record<Locale, LocalizedContentBundle>>;
  pendingDictionaries: Map<Locale, Promise<void>>;
  pendingContent: Map<Locale, Promise<void>>;
  pendingResources: Map<Locale, Promise<void>>;
  listeners: Set<() => void>;
  revision: number;
  selectionRevision: number;
}

function createStore(): I18nResourceStore {
  return {
    dictionaries: { en }, content: {}, pendingDictionaries: new Map(),
    pendingContent: new Map(), pendingResources: new Map(), listeners: new Set(), revision: 0, selectionRevision: 0,
  };
}

/** Core and independently built Pro factories share public translation data in
 * this browser realm. No user locale, chat text or settings belong in this store.
 * Server rendering never attaches state to a process-wide global. */
function resourceStore(): I18nResourceStore {
  if (typeof window === 'undefined') return createStore();
  const key = Symbol.for('pixflow.i18n.resource-store.v1');
  const scope = window as unknown as Record<symbol, I18nResourceStore | undefined>;
  if (!scope[key]) Object.defineProperty(scope, key, { value: createStore(), configurable: true });
  return scope[key]!;
}

export const i18nResources = resourceStore();
