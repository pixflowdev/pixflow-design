import { getPixflowWordPressConfig } from '../pixflow/wordpress-context';

// A quota failure must not restore stale text when the composer remounts.
// This tab-owned recovery copy never crosses a WordPress account boundary.
const fallback = new Map<string, string>();
function ownerKey(key: string): string {
  const site = getPixflowWordPressConfig();
  return JSON.stringify([site?.restBaseUrl || site?.siteUrl || '', site?.userId || '', key]);
}

const snapshots = new Map<string, string>();
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
  try { localStorage.setItem(address, value); snapshots.delete(address); }
  catch { snapshots.set(address, value); /* Retain the tab-owned recovery copy. */ }
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
