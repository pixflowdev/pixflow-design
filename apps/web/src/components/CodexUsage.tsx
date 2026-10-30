import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import type { CodexUsage as Usage } from '@open-design/contracts';
import { codexUsageRequest } from '../providers/daemon';
import { useI18n } from '../i18n';
import styles from './CodexUsage.module.css';

const USAGE_REFRESH_MS = 60_000;

/** Keep mounted usage surfaces current without overlapping reads or polling hidden tabs. */
export function useCodexUsage(provider: 'codex' | 'claude' = 'codex', model = '') {
  const [data, setData] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController>();
  const pending = useRef(false);
  const lastAttempt = useRef(0);
  const refresh = useCallback(() => {
    if (pending.current) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    pending.current = true;
    lastAttempt.current = Date.now();
    setBusy(true);
    void codexUsageRequest(controller.signal, provider, model).then(value => {
      if (!controller.signal.aborted) setData(value);
    }).catch(() => {
      if (!controller.signal.aborted) setData({ status: 'unavailable', source: null, checkedAt: '', windows: [] });
    }).finally(() => {
      if (!controller.signal.aborted && request.current === controller) { pending.current = false; setBusy(false); }
    });
  }, [provider, model]);
  useEffect(() => {
    setData(null);
    refresh();
    const refreshIfDue = () => {
      if (document.visibilityState !== 'hidden' && Date.now() - lastAttempt.current >= USAGE_REFRESH_MS) refresh();
    };
    const timer = window.setInterval(refreshIfDue, USAGE_REFRESH_MS);
    document.addEventListener('visibilitychange', refreshIfDue);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfDue);
      request.current?.abort();
      pending.current = false;
    };
  }, [refresh]);
  return { data, busy, refresh, provider };
}

export function CodexUsage({ provider = 'codex', model = '' }: { provider?: 'codex' | 'claude'; model?: string }) {
  return <CodexUsageDetails state={useCodexUsage(provider, model)} />;
}

export function CodexUsageDetails({ state }: { state: ReturnType<typeof useCodexUsage> }) {
  const { data, busy, refresh } = state;
  const { t, locale } = useI18n();
  const duration = (minutes: number) => {
    const unit = minutes % 1440 === 0 ? 'day' : minutes % 60 === 0 ? 'hour' : 'minute';
    const value = unit === 'day' ? minutes / 1440 : unit === 'hour' ? minutes / 60 : minutes;
    return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' }).format(value);
  };
  const date = (value: number) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(value);
  return <section className={styles.root} aria-label={t('settings.codexUsage').replace('Codex', state.provider === 'claude' ? 'Claude' : 'Codex')}>
    <div className={styles.heading}><strong>{t('settings.codexUsage').replace('Codex', state.provider === 'claude' ? 'Claude' : 'Codex')}</strong>
      <Button variant="ghost" disabled={busy} onClick={refresh}>{t('settings.usageRefresh')}</Button></div>
    <div role="status" aria-live="polite">
      {busy && !data ? t('common.loading') : data?.status !== 'available' ? t('builderDestination.unavailable') : data.windows.map((window, index) =>
        <div className={styles.window} key={`${window.bucket}-${index}`}>
          <div className={styles.heading}><span>{(window.bucket === 'codex' || window.bucket === 'claude') ? '' : `${window.bucket} · `}{duration(window.durationMinutes)}</span>
            <span>{t('settings.usageRemaining', { value: new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(window.remainingPercent / 100) })}</span></div>
          <progress max={100} value={window.remainingPercent} aria-label={duration(window.durationMinutes)} />
          {window.resetsAt ? <small>{t('settings.usageResets', { value: date(window.resetsAt * 1000) })}</small> : null}
        </div>)}
    </div>
    {data?.status === 'available' ? <small>{t('settings.usageChecked', { value: date(Date.parse(data.checkedAt)) }).replace('Codex', state.provider === 'claude' ? 'Claude' : 'Codex')}</small> : null}
  </section>;
}

