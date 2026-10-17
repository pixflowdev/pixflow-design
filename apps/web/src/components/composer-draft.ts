import { getPixflowWordPressConfig } from '../pixflow/wordpress-context';

// A quota failure must not restore stale text when the composer remounts.
// This tab-owned recovery copy never crosses a WordPress account boundary.
const fallback = new Map<string, string>();
function ownerKey(key: string): string {
  const site = getPixflowWordPressConfig();
  return JSON.stringify([site?.restBaseUrl || site?.siteUrl || '', site?.userId || '', key]);
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
