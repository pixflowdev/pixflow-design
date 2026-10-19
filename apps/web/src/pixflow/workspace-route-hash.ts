const PREFIX = '#pixflow-route-';
const LEGACY_PREFIX = '#pixflow=';

/** WordPress Site Health passes fragments to jQuery as selectors. Use an ID-safe alphabet. */
export function encodeWorkspaceRouteHash(path: string): string {
  return PREFIX + btoa(encodeURIComponent(path)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeWorkspaceRouteHash(hash: string): string | null {
  try {
    let path: string;
    if (hash.startsWith(LEGACY_PREFIX)) path = decodeURIComponent(hash.slice(LEGACY_PREFIX.length));
    else if (hash.startsWith(PREFIX)) path = decodeURIComponent(atob(hash.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/')));
    else return null;
    return path.startsWith('/') ? path : `/${path}`;
  } catch {
    return hash.startsWith(LEGACY_PREFIX) || hash.startsWith(PREFIX) ? '/' : null;
  }
}

/** Run before host DOM-ready handlers; preserve bookmarks, query parameters and history state. */
export function migrateWorkspaceRouteHash(): void {
  if (!window.location.hash.startsWith(LEGACY_PREFIX)) return;
  const url = new URL(window.location.href);
  url.hash = encodeWorkspaceRouteHash(decodeWorkspaceRouteHash(url.hash) ?? '/');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}
