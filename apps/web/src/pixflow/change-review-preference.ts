import { getPixflowWordPressConfig } from './wordpress-context';

const eventName = 'pixflow-design:change-review-preference';
function host(): Window {
  try { if (window.top?.document) return window.top; } catch { /* Use this frame when embedded across origins. */ }
  return window;
}
function key() {
  const config = getPixflowWordPressConfig();
  return `pixflow:disable-change-review:${config?.siteHash || config?.siteUrl || location.origin}:${config?.userId || 'local'}`;
}
type PreferenceHost = Window & { __pixflowReviewPreferences?: Record<string, boolean> };
/** A browser viewing preference: never pauses the follower or deletes recorded changes. */
export function changeReviewDisabled(): boolean {
  if (typeof window === 'undefined') return false;
  const target = host() as PreferenceHost, name = key();
  if (target.__pixflowReviewPreferences?.[name] !== undefined) return target.__pixflowReviewPreferences[name];
  try { return target.localStorage.getItem(name) === 'true'; } catch { return false; }
}
export function setChangeReviewDisabled(disabled: boolean) {
  const target = host() as PreferenceHost, name = key();
  (target.__pixflowReviewPreferences ??= {})[name] = disabled;
  try { target.localStorage.setItem(name, String(disabled)); } catch { /* Still works for this page when storage is unavailable. */ }
  target.dispatchEvent(new CustomEvent(eventName));
}
export function subscribeChangeReviewPreference(listener: () => void) {
  const target = host() as PreferenceHost;
  const storage = (event: StorageEvent) => {
    if (event.key !== key() && event.key !== null) return;
    delete target.__pixflowReviewPreferences?.[key()]; listener();
  };
  target.addEventListener(eventName, listener);
  target.addEventListener('storage', storage);
  return () => { target.removeEventListener(eventName, listener); target.removeEventListener('storage', storage); };
}
