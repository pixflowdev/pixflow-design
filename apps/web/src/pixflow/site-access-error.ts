export class SiteAccessError extends Error {
  constructor(message: string, readonly details: string) { super(message); }
}

/** Describe what WordPress actually reported, without guessing plugin age or user role. */
export async function siteAccessError(response: Response): Promise<SiteAccessError> {
  let code = ''; let message = '';
  try {
    const body = await response.json() as { code?: unknown; message?: unknown };
    if (typeof body.code === 'string') code = body.code;
    if (typeof body.message === 'string') message = body.message;
  } catch { /* Hosting errors may be HTML. Do not render that document in the panel. */ }
  const description = code === 'pixflow_entitlement_required'
    ? 'Your Pixflow license needs attention. Revalidate it in Pixflow settings, then retry.'
    : code === 'rest_cookie_invalid_nonce' || response.status === 401
      ? 'Your WordPress session needs refreshing. Reload the builder or sign in again.'
      : response.status === 403
        ? 'WordPress refused this request. Check the details below, then retry.'
        : response.status === 404
          ? 'The Pixflow connection endpoint is unavailable on this site. Check that the plugin is active, then retry.'
          : 'The site could not complete this request. Please retry.';
  return new SiteAccessError(description, [`HTTP ${response.status}`, code, message.slice(0, 700)].filter(Boolean).join(' · '));
}
