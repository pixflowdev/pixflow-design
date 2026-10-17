const PUBLIC_SOURCE_URL_PATTERN = /https?:\/\/[^\s"'<>]+/i;

/** Extract the first safe public HTTP(S) source URL from user-authored text. */
export function extractPublicSourceUrl(value: string): string | null {
  const match = String(value || '').match(PUBLIC_SOURCE_URL_PATTERN);
  if (!match) return null;
  return normalizePublicSourceUrl(match[0]);
}

/** Normalize a public URL while rejecting local/private network targets. */
export function normalizePublicSourceUrl(value: string): string | null {
  try {
    const url = new URL(stripPublicSourceUrlProsePunctuation(String(value || '').trim()));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
      return null;
    }
    if (hostname === '::1' || hostname === '0:0:0:0:0:0:0:1' || hostname.startsWith('fe80:') || hostname.startsWith('fc') || hostname.startsWith('fd')) {
      return null;
    }
    const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const octets = ipv4.slice(1).map(Number);
      if (octets.some((octet) => octet < 0 || octet > 255)) return null;
      const [a = 0, b = 0] = octets;
      if (
        a === 0 || a === 10 || a === 127
        || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168)
        || a >= 224
      ) return null;
    }
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function stripPublicSourceUrlProsePunctuation(value: string): string {
  let candidate = value.replace(/[.,;:!?]+$/g, '');
  const pairs: Array<[string, string]> = [['(', ')'], ['[', ']'], ['{', '}']];
  let changed = true;
  while (changed && candidate) {
    changed = false;
    for (const [open, close] of pairs) {
      if (!candidate.endsWith(close)) continue;
      const openCount = candidate.split(open).length - 1;
      const closeCount = candidate.split(close).length - 1;
      if (closeCount > openCount) {
        candidate = candidate.slice(0, -1).replace(/[.,;:!?]+$/g, '');
        changed = true;
      }
    }
  }
  return candidate;
}
