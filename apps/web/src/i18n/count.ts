// Use the public import so Pro bundles resolve the host's shared context.
import { useI18n } from '../i18n';
import type { Dict, Locale } from './types';

type CountMessage = 'annotationCount';

export function countMessageKey(id: CountMessage, locale: Locale, count: number): keyof Dict {
  return `${id}.${new Intl.PluralRules(locale).select(count)}` as keyof Dict;
}

/** Arabic and Slavic languages need more than an English singular/plural switch. */
export function useCountT() {
  const { locale, t } = useI18n();
  return (id: CountMessage, count: number) => t(countMessageKey(id, locale, count), {
    count: new Intl.NumberFormat(locale).format(count),
  });
}
