import { useEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import { applyLocalePreference, detectAutomaticLocale, LOCALES, LOCALE_LABEL, useI18n, type Locale } from '../i18n';
import { i18nResources } from '../i18n/resource-store';
import { getPixflowWordPressConfig } from '../pixflow/wordpress-context';
import { getLanguagePackStatus, installLanguage, LANGUAGE_PACK_INSTALLED_EVENT, type LanguagePackStatus } from '../pixflow/language-packs';
import { CustomSelect } from './CustomSelect';
import styles from './LanguagePreferenceControl.module.css';

/** Selection is a preview until a missing pack is explicitly downloaded. */
export function LanguagePreferenceControl() {
  const { t, localePreference } = useI18n();
  const wordpress = Boolean(getPixflowWordPressConfig());
  const [selected, setSelected] = useState<Locale | 'auto'>(localePreference);
  const [status, setStatus] = useState<LanguagePackStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(wordpress);
  const [error, setError] = useState<'download' | 'load' | null>(null);
  const generation = useRef(0);
  const statusRequest = useRef<Promise<LanguagePackStatus> | null>(null);
  const target = selected === 'auto' ? detectAutomaticLocale() : selected;
  const installed = !wordpress || target === 'en' || status?.languages.some((item) => item.locale === target && item.installed) === true;
  const updateAvailable = wordpress && target !== 'en' && installed && status?.languages.some((item) => item.locale === target && item.updateAvailable) === true;

  useEffect(() => { setSelected(localePreference); }, [localePreference]);
  useEffect(() => {
    const installed = (event: Event) => {
      const code: unknown = (event as CustomEvent).detail;
      if (typeof code !== 'string' || !(LOCALES as readonly string[]).includes(code)) return;
      setStatus((previous) => previous ? { ...previous, languages: previous.languages.map((item) => item.locale === code ? { ...item, installed: true, updateAvailable: false } : item) } : previous);
    };
    window.addEventListener(LANGUAGE_PACK_INSTALLED_EVENT, installed);
    return () => window.removeEventListener(LANGUAGE_PACK_INSTALLED_EVENT, installed);
  }, []);
  useEffect(() => {
    if (!wordpress) return;
    let alive = true;
    const request = getLanguagePackStatus();
    statusRequest.current = request;
    request.then((next) => { if (alive) setStatus(next); })
      .catch(() => { if (alive) setError('load'); })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; generation.current += 1; };
  }, [wordpress]);

  const choose = async (preference: Locale | 'auto') => {
    const request = ++generation.current;
    // An absent-language preview must cancel an earlier slow language selection.
    const selection = ++i18nResources.selectionRevision;
    setSelected(preference); setError(null); setBusy(false);
    const code = preference === 'auto' ? detectAutomaticLocale() : preference;
    try {
      if (wordpress && code !== 'en') {
        // Users may choose immediately after opening settings. Unknown inventory
        // is not evidence that a language is missing; wait for that same read.
        const inventory = status ?? await (statusRequest.current ??= getLanguagePackStatus());
        if (request !== generation.current || selection !== i18nResources.selectionRevision) return;
        if (!inventory.languages.some((item) => item.locale === code && item.installed)) return;
      }
      await applyLocalePreference(preference);
    }
    catch { if (request === generation.current && selection === i18nResources.selectionRevision) setError('load'); }
  };

  const download = async () => {
    if (target === 'en') return;
    const request = ++generation.current;
    const selection = ++i18nResources.selectionRevision;
    const preference = selected;
    setBusy(true); setError(null);
    try {
      const pack = await installLanguage(target);
      // A cold preferred-language GET may still be returning a pre-install 404.
      // Let it settle, then publish the verified installation atomically.
      await i18nResources.pendingResources.get(target)?.catch(() => {});
      i18nResources.dictionaries[target] = pack.dictionary;
      i18nResources.content[target] = pack.content;
      i18nResources.revision += 1;
      i18nResources.listeners.forEach((listener) => listener());
      if (request !== generation.current || selection !== i18nResources.selectionRevision) return;
      await applyLocalePreference(preference);
    } catch { if (request === generation.current) setError('download'); }
    finally { if (request === generation.current) setBusy(false); }
  };

  return <div className={styles.control}>
    <div className={styles.row}>
      <div className={styles.copy}><h3>{t('settings.language')}</h3><p>{t('settings.languageHint')}</p></div>
      <CustomSelect value={selected}
        options={[{ value: 'auto', label: t(wordpress ? 'settings.languageWordPress' : 'settings.languageSystem') }, ...LOCALES.map((code) => ({ value: code, label: LOCALE_LABEL[code] }))]}
        ariaLabel={t('settings.language')} className={styles.select} triggerClassName={styles.trigger} menuClassName={styles.menu}
        onChange={(value) => { void choose(value as Locale | 'auto'); }} />
    </div>
    {checking ? <p className={styles.hint} role="status">{t('settings.languageChecking')}</p> : null}
    {!checking && status && (!installed || updateAvailable) ? <div className={styles.download}>
      <p>{t(!status.canInstall ? 'settings.languageAdminRequired' : updateAvailable ? 'updater.available' : 'settings.languageDownloadHint', { language: LOCALE_LABEL[target] })}</p>
      {status.canInstall ? <Button className={styles.downloadButton} disabled={busy} onClick={() => { void download(); }}>{t(updateAvailable ? (busy ? 'updater.downloading' : 'updater.download') : (busy ? 'settings.languageDownloading' : 'settings.languageDownload'))}</Button> : null}
    </div> : null}
    {error ? <p className={styles.hint} role="alert">{t(error === 'download' ? 'settings.languageDownloadError' : 'settings.languageLoadError')}</p> : null}
    {!checking && !status && wordpress ? <Button className={styles.downloadButton} onClick={() => {
      setChecking(true); setError(null);
      const selection = i18nResources.selectionRevision;
      const choice = generation.current;
      const request = getLanguagePackStatus(); statusRequest.current = request;
      void request.then((next) => {
        setStatus(next);
        if (choice === generation.current && selection === i18nResources.selectionRevision) void choose(selected);
      }).catch(() => setError('load')).finally(() => setChecking(false));
    }}>{t('workspaceSidebar.retry')}</Button> : null}
  </div>;
}
