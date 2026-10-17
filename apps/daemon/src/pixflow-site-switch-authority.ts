type SiteBinding = { url?: string; origin?: string } | null;

function siteAddress(value: string | undefined): URL | null {
  try {
    const url = new URL(value || '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url;
  } catch { return null; }
}

/** A daemon's data and credentials never move to a different site through reconnect. */
export function mayClaimPixflowDaemonSite(active: SiteBinding, requested: SiteBinding, requestOrigin?: string): boolean {
  const next = siteAddress(requested?.url);
  if (!next || requested?.origin !== next.origin) return false;
  if (requestOrigin !== undefined && requestOrigin !== next.origin) return false;
  const current = siteAddress(active?.url);
  if (active && !current) return false;
  // First-time, originless local provisioning is trusted; browser pairing uses
  // the gateway's site-specific worker, or a daemon provisioned with a site URL.
  if (!current) return requestOrigin === undefined;
  return current.href === next.href && (!active?.origin || active.origin === next.origin);
}
