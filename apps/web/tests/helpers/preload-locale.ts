import {loadLocaleDictionary} from '../../src/i18n/locale-runtime';
import {loadLocalizedContent} from '../../src/i18n/content';
import type {Locale} from '../../src/i18n/types';

/** Localized component tests explicitly provide installed language resources.
 * Loading/retry/fallback contracts are covered separately without this fixture. */
export async function preloadTestLocale(locale: Locale): Promise<void> {
  await Promise.all([loadLocaleDictionary(locale),loadLocalizedContent(locale)]);
}
