const DEFAULT_BRICKS_HANDOFF_ERROR = 'The Bricks handoff could not be applied.';
const WORDPRESS_CRITICAL_ERROR = 'WordPress encountered an internal error while applying the Bricks handoff. Check the site debug log and retry.';
const MAX_VISIBLE_ERROR_LENGTH = 1_200;

function decodeHtmlEntities(value: string): string {
  const named = value
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');

  return named.replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (match, hex: string | undefined, decimal: string | undefined) => {
    const codePoint = Number.parseInt(hex || decimal || '', hex ? 16 : 10);
    if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return match;
    }
  });
}

export function safeBricksHandoffErrorMessage(error: unknown): string {
  const raw = error instanceof Error
    ? error.message
    : (typeof error === 'string' ? error : '');
  if (!raw.trim()) return DEFAULT_BRICKS_HANDOFF_ERROR;

  const text = decodeHtmlEntities(raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

  if (/there has been a critical error on this website|troubleshooting wordpress/i.test(text)) {
    return WORDPRESS_CRITICAL_ERROR;
  }
  if (!text) return DEFAULT_BRICKS_HANDOFF_ERROR;
  return text.length > MAX_VISIBLE_ERROR_LENGTH
    ? `${text.slice(0, MAX_VISIBLE_ERROR_LENGTH - 1).trimEnd()}…`
    : text;
}
