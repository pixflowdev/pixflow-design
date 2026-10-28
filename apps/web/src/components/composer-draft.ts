import { getPixflowWordPressConfig } from '../pixflow/wordpress-context';

// A quota failure must not restore stale text when the composer remounts.
// This tab-owned recovery copy never crosses a WordPress account boundary.
const fallback = new Map<string, string>();
function ownerKey(key: string): string {
  const site = getPixflowWordPressConfig();
  return JSON.stringify([site?.restBaseUrl || site?.siteUrl || '', site?.userId || '', key]);
}

const snapshots = new Map<string, string>();
const snapshotEvent = 'pixflow:composer-snapshot-changed';
/** Keep mounted surfaces current without broadcasting across site/account boundaries. */
export function subscribeComposerSnapshot<T>(key: string | undefined, receive: (snapshot: T) => void): () => void {
  if (!key || typeof window === 'undefined') return () => {};
  const address = 'pixflow:composer-snapshot:' + ownerKey(key);
  const update = (event: Event) => {
    const changed = event instanceof StorageEvent ? event.key : (event as CustomEvent<string>).detail;
    if (changed !== address || address !== 'pixflow:composer-snapshot:' + ownerKey(key)) return;
    const value = loadComposerSnapshot<T>(key);
    if (value) receive(value);
  };
  window.addEventListener(snapshotEvent, update);
  window.addEventListener('storage', update);
  return () => { window.removeEventListener(snapshotEvent, update); window.removeEventListener('storage', update); };
}
/** References to uploaded attachments only; no API keys or raw browser Files. */
export function loadComposerSnapshot<T>(key?: string): T | null {
  if (!key || typeof window === 'undefined') return null;
  const address = 'pixflow:composer-snapshot:' + ownerKey(key);
  try { return JSON.parse(snapshots.get(address) ?? localStorage.getItem(address) ?? 'null') as T | null; }
  catch { return null; }
}

export function saveComposerSnapshot(key: string | undefined, snapshot: unknown): void {
  if (!key || typeof window === 'undefined') return;
  const address = 'pixflow:composer-snapshot:' + ownerKey(key);
  const value = JSON.stringify(snapshot);
  let previous: string | null | undefined;
  try { previous = snapshots.get(address) ?? localStorage.getItem(address); } catch { previous = snapshots.get(address); }
  if (previous === value) return;
  try { localStorage.setItem(address, value); snapshots.delete(address); }
  catch { snapshots.set(address, value); /* Retain the tab-owned recovery copy. */ }
  window.dispatchEvent(new CustomEvent(snapshotEvent, { detail: address }));
}
export function loadComposerDraft(key?: string): string | null {
  if (!key || typeof window === 'undefined') return null;
  const cached = fallback.get(ownerKey(key));
  if (cached !== undefined) return cached;
  try { return window.localStorage.getItem(key); } catch { return null; }
}
export function saveComposerDraft(key: string | undefined, draft: string): void {
  if (!key || typeof window === 'undefined') return;
  try {
    if (draft) window.localStorage.setItem(key, draft);
    else window.localStorage.removeItem(key);
    fallback.delete(ownerKey(key));
  } catch { fallback.set(ownerKey(key), draft); }
}
