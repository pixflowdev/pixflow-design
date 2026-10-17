/** Convert export failures into stable analytics codes instead of generic Error. */
export function exportErrorCode(error: unknown): string {
  const structured = (error as { code?: unknown } | null | undefined)?.code;
  if (typeof structured === 'string' && structured.length > 0) return structured;
  if (!(error instanceof Error)) return 'UNKNOWN';
  if (/unknown \w+ sidecar message/i.test(error.message)) {
    return 'DESKTOP_SIDECAR_UNKNOWN_MESSAGE';
  }
  if (/renderer (?:is )?unavailable/i.test(error.message)) {
    return 'DESKTOP_RENDERER_UNAVAILABLE';
  }
  return error.name || 'UNKNOWN';
}
