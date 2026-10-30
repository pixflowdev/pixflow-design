import { useMemo, useSyncExternalStore } from 'react';
import { Button } from '@open-design/components';
import type { CodexUsage as Usage } from '@open-design/contracts';
import { codexUsageRequest } from '../providers/daemon';
import { useI18n } from '../i18n';
import styles from './CodexUsage.module.css';

const USAGE_REFRESH_MS = 60_000;

type UsageProvider = 'codex' | 'claude';
type UsageSnapshot = { data: Usage | null; busy: boolean };

/** One poller per provider/model, even when floating chat and Workspace stay mounted together. */
function createUsageStore(provider: UsageProvider, model: string) {
  const initialSnapshot: UsageSnapshot = { data: null, busy: false };
  let snapshot = initialSnapshot;
  let request: AbortController | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastAttempt = 0;
  const listeners = new Set<() => void>();
  const publish = (next: UsageSnapshot) => {
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  const refresh = () => {
    if (snapshot.busy) return;
    const controller = new AbortController(); request = controller;
    lastAttempt = Date.now();
    publish({ ...snapshot, busy: true });
    void codexUsageRequest(controller.signal, provider, model).then(value => {
      if (!controller.signal.aborted) publish({ data: value, busy: true });
    }).catch(() => {
      if (!controller.signal.aborted) publish({ data: { status: 'unavailable', source: null, checkedAt: '', windows: [] }, busy: true });
    }).finally(() => {
      if (!controller.signal.aborted && request === controller) publish({ ...snapshot, busy: false });
    });
  };
  const refreshIfDue = () => {
    if (document.visibilityState !== 'hidden' && Date.now() - lastAttempt >= USAGE_REFRESH_MS) refresh();
  };
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    refresh,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        refresh();
        timer = setInterval(refreshIfDue, USAGE_REFRESH_MS);
        document.addEventListener('visibilitychange', refreshIfDue);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        clearInterval(timer);
        document.removeEventListener('visibilitychange', refreshIfDue);
        request?.abort();
        request = undefined;
        // Retain the store identity for concurrent mounts, but never retain an account reading after unmount.
        snapshot = { data: null, busy: false };
        lastAttempt = 0;
      };
    },
  };
}

const usageStores = new Map<string, ReturnType<typeof createUsageStore>>();
function usageStore(provider: UsageProvider, model: string) {
  if (typeof window === 'undefined') return createUsageStore(provider, model);
  const key = JSON.stringify([provider, model]);
  let store = usageStores.get(key);
  if (!store) { store = createUsageStore(provider, model); usageStores.set(key, store); }
  return store;
}

export function useCodexUsage(provider: UsageProvider = 'codex', model = '') {
  const store = useMemo(() => usageStore(provider, model), [provider, model]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return { ...snapshot, refresh: store.refresh, provider };
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

