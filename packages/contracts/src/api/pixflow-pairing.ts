export interface PixflowPairingStart { requestId: string; challenge: string; siteUrl: string; expiresAt: number }
export interface PixflowPairingComplete { requestId: string; code: string }
export interface PixflowPairingResult { ok: boolean; valid?: boolean }

/** Safe diagnostics shared by browser and CLI; upstream response bodies are never displayed. */
export const PIXFLOW_PAIRING_ERRORS = {
  pairing_request_denied: 'The Bridge rejected the request host or origin. Open pairing from the selected site in Pixflow License settings.',
  pairing_https_required: 'This site uses HTTP. Local .local and .test sites require trusted HTTPS. Enable and trust SSL in Local, then connect using the HTTPS site address.',
  pairing_invalid_site: 'The Bridge site address is invalid. Select the WordPress address without query parameters or credentials.',
  pairing_site_mismatch: 'The site address does not match the selected Bridge site. Select the correct site and reconnect.',
  pairing_issuer_invalid: 'The configured license-server address is not supported. Check the Bridge configuration.',
  pairing_expired: 'This pairing request has expired or is no longer available. Start Connect again.',
  pairing_invalid_code: 'The pairing authorization code is invalid. Start Connect again.',
  pairing_rate_limit: 'Too many pairing attempts. Wait five minutes before connecting again.',
  pairing_in_progress: 'This pairing request is already being processed. Wait for it to finish.',
  invalid_pairing_request: 'WordPress rejected the pairing challenge or site address. Check the selected site against WordPress Address in Settings > General, then reconnect.',
  invalid_pairing_code: 'WordPress rejected the one-time pairing code. It may have expired or already been used. Start Connect again.',
  pairing_site_changed: 'The selected site or license server changed during pairing. Start Connect again for the intended site.',
  license_required: 'WordPress has no current license authorization for this site. Revalidate the license in Pixflow settings.',
  pairing_login_required: 'Your WordPress login has expired. Sign in again and retry Connect.',
  pairing_admin_required: 'Your WordPress account does not have administrator permissions. Sign in with an administrator account.',
  pairing_nonce_invalid: 'Your WordPress security token is missing or invalid. Reload the page and retry Connect.',
  rest_cookie_invalid_nonce: 'Your WordPress security token is invalid or expired. Reload the page and retry Connect.',
  rest_forbidden: 'WordPress denied permission to authorize pairing. Sign in as an administrator, reload the page and retry.',
  rest_no_route: 'WordPress could not find the Pixflow pairing endpoint. Check that Pixflow Design is active and up to date on the selected site.',
  pairing_grant_failed: 'WordPress could not obtain fresh Bridge authorization from Pixflow. Check the license status and the site connection to pixflow.dev.',
  pairing_failed: 'WordPress could not finish the license exchange. Check the license status and retry Connect.',
  pairing_identity_invalid: 'The authorization returned by WordPress does not match this site or installation. Revalidate the site license, then reconnect.',
  pairing_key_invalid: 'WordPress returned an invalid installation verification key. Revalidate this installation in License settings.',
  pairing_signature_invalid: 'The Bridge could not verify the signed license authorization. Check the computer date and time, then revalidate the license.',
  pairing_grant_rejected: 'The Bridge rejected this authorization under its current access policy. Revalidate the license and reconnect.',
  pairing_certificate_expired: 'The HTTPS certificate has expired. Renew or regenerate the affected site certificate before reconnecting.',
  pairing_certificate_untrusted: 'The Bridge cannot verify the HTTPS certificate. For Local sites, trust SSL in the operating system, then restart the Bridge. If already trusted, contact support.',
  pairing_certificate_hostname: 'The HTTPS certificate does not match the hostname. Use the address covered by the certificate or regenerate it.',
  pairing_dns_failed: 'The Bridge could not resolve the server hostname. Check the address and DNS. For Local sites, check that the site is running and its domain resolves on this computer.',
  pairing_connection_refused: 'The server refused the Bridge connection. Check that the site is running on the configured address and port.',
  pairing_timeout: 'The server did not respond before the pairing timeout. Check its availability and try again.',
  pairing_redirect: 'The pairing endpoint returned a redirect. Check HTTP/HTTPS, www and WordPress address settings. Pairing does not follow redirects.',
  pairing_network_error: 'The Bridge could not reach the server. Check connectivity and Bridge diagnostics. The transport did not identify a more specific cause.',
  pairing_browser_connection: 'The browser could not reach the Bridge. Check that it is running and this browser allows local network access. The browser did not expose the precise cause.',
  pairing_http_error: 'The server rejected the pairing request.',
  pairing_invalid_response: 'The server returned an unexpected pairing response. Check that the request reaches Pixflow rather than a login page, proxy or security filter.',
  pairing_save_failed: 'The Bridge could not save or activate this connection. Check local file permissions and available disk space, then retry.',
} as const;
export type PixflowPairingErrorCode = keyof typeof PIXFLOW_PAIRING_ERRORS;
export type PixflowPairingStage = 'bridge_start' | 'wordpress_authorize' | 'wordpress_exchange' | 'license_keys' | 'verification' | 'save';
export interface PixflowPairingFailure { ok: false; code: PixflowPairingErrorCode; error: string; stage?: PixflowPairingStage; httpStatus?: number }
export function pixflowPairingErrorCode(value: unknown): PixflowPairingErrorCode | undefined {
  return typeof value === 'string' && Object.hasOwn(PIXFLOW_PAIRING_ERRORS, value) ? value as PixflowPairingErrorCode : undefined;
}
export function pixflowPairingErrorMessage(body: unknown, stage: PixflowPairingStage, status?: number): string {
  const value = body && typeof body === 'object' ? body as Partial<PixflowPairingFailure> : {};
  const code = pixflowPairingErrorCode(value.code);
  const stages: Record<PixflowPairingStage, string> = { bridge_start: 'Starting Bridge pairing', wordpress_authorize: 'WordPress authorization', wordpress_exchange: 'Bridge to WordPress', license_keys: 'Bridge to Pixflow license server', verification: 'Verifying authorization', save: 'Saving Bridge connection' };
  const resolvedStage = value.stage && Object.hasOwn(stages, value.stage) ? value.stage : stage;
  const http = typeof value.httpStatus === 'number' ? value.httpStatus : status;
  const message = code ? PIXFLOW_PAIRING_ERRORS[code] : 'Bridge pairing failed: no recognised error code was returned. Contact support with the stage and HTTP status below.';
  return `${message} (${stages[resolvedStage]}${http ? `; HTTP ${http}` : ''}${code ? `; ${code}` : ''})`;
}
