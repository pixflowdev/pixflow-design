import type { SiteTranslationUpdates } from '@open-design/contracts';
import { PIXFLOW_FEATURE_RUNTIME_CHANGED, pixflowFeatureConfiguration } from './feature-runtime';
import { requestWordPressRest } from './license';

const listeners = new Set<(status: SiteTranslationUpdates | null) => void>();
let current: SiteTranslationUpdates | null = null;
let generation = 0;
let pending = false;
let invalidated = false;
let timer: number;

function publish(status: SiteTranslationUpdates | null) {
  current = status;
  for (const listener of listeners) listener(status);
}

async function refresh() {
  if (!listeners.size || document.visibilityState === 'hidden' || pending) return;
  if (pixflowFeatureConfiguration('site-translations')?.canManage !== true) return;
  const started = generation;
  pending = true;
  try {
    const result = await requestWordPressRest<SiteTranslationUpdates>('site-translations?updates=1');
    if (generation !== started) return;
    if (result.status === 401 || result.status === 403) publish(null);
    else if (result.ok && result.body && Array.isArray(result.body.activeLanguages)) {
      const { activeLanguages, needsUpdate } = result.body;
      publish({ activeLanguages, needsUpdate: activeLanguages.length > 0 && needsUpdate === true });
    }
  } catch { /* A transient outage retains the last confirmed result. */ }
  finally {
    if (generation === started) {
      pending = false;
      if (invalidated) { invalidated = false; void refresh(); }
    }
  }
}

function invalidate() {
  if (pending) invalidated = true;
  else void refresh();
}

function reset() {
  generation++;
  pending = invalidated = false;
  publish(null);
}

function onAccessChange() {
  reset();
  void refresh();
}

/** One metadata request and timer for the open toolbar, rail and page in this document. */
export function watchTranslationUpdates(listener: (status: SiteTranslationUpdates | null) => void): () => void {
  listeners.add(listener);
  listener(current);
  if (listeners.size === 1) {
    window.addEventListener('focus', refresh);
    window.addEventListener('pixflow:translation-updates-changed', invalidate);
    window.addEventListener(PIXFLOW_FEATURE_RUNTIME_CHANGED, onAccessChange);
    document.addEventListener('visibilitychange', refresh);
    timer = window.setInterval(refresh, 60_000);
    void refresh();
  }
  return () => {
    if (!listeners.delete(listener) || listeners.size) return;
    window.clearInterval(timer);
    window.removeEventListener('focus', refresh);
    window.removeEventListener('pixflow:translation-updates-changed', invalidate);
    window.removeEventListener(PIXFLOW_FEATURE_RUNTIME_CHANGED, onAccessChange);
    document.removeEventListener('visibilitychange', refresh);
    reset();
  };
}
