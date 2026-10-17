/** Only the configured WordPress parent may change a hosted frame's state. */
export function isTrustedPixflowParentMessage(
  event: Pick<MessageEvent, 'source' | 'origin'>,
  currentWindow: Pick<Window, 'parent'>,
  siteUrl: string | undefined,
): boolean {
  if (currentWindow.parent === currentWindow || event.source !== currentWindow.parent || !siteUrl) return false;
  try {
    const site = new URL(siteUrl);
    return ['http:', 'https:'].includes(site.protocol) && site.origin === event.origin;
  } catch { return false; }
}
