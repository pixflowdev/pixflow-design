import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { getPixflowWordPressConfig } from '../pixflow/wordpress-context';
import { getLanguagePackStatus, LANGUAGE_PACK_INSTALLED_EVENT } from '../pixflow/language-packs';
import styles from './LanguageUpdateDot.module.css';

/** Read-only discovery for the active language; never downloads or changes preferences. */
export function LanguageUpdateDot() {
  const { locale, t } = useI18n();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let revision = 0;
    let alive = true;
    setAvailable(false);
    if (locale === 'en' || !getPixflowWordPressConfig()) return;
    const check = () => {
      const current = ++revision;
      void getLanguagePackStatus().then((status) => {
        if (alive && current === revision) setAvailable(status.languages.some((item) => item.locale === locale && item.installed && item.updateAvailable));
      }).catch(() => { /* A failed check must not erase a known update or alter settings. */ });
    };
    const installed = (event: Event) => {
      if ((event as CustomEvent).detail === locale) { revision += 1; setAvailable(false); }
    };
    check();
    window.addEventListener('focus', check);
    window.addEventListener(LANGUAGE_PACK_INSTALLED_EVENT, installed);
    return () => {
      alive = false;
      window.removeEventListener('focus', check);
      window.removeEventListener(LANGUAGE_PACK_INSTALLED_EVENT, installed);
    };
  }, [locale]);
  const label = `${t('settings.language')}: ${t('updater.available')}`;
  return available ? <span className={styles.dot} role="img" aria-label={label} title={label} /> : null;
}

/** Keeps the badge out of the fixed-size settings button's layout. */
export function LanguageUpdateIcon({ children }: { children: ReactNode }) {
  return <span className={styles.icon}>{children}<LanguageUpdateDot /></span>;
}
