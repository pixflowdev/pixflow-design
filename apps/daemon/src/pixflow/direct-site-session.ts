import type { PixflowDirectSiteSession, PixflowDirectSiteAuthorization, PixflowSiteIntegrations } from '@open-design/contracts';
import { directDigest } from './direct-site-store.js';

/** Distinguish a denied credential from a service that could not verify it. */
export class DirectSessionAuthorizationError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

export function directSessionUrl(endpoint: string): URL {
  const url = new URL(endpoint);
  if (url.searchParams.has('rest_route')) url.searchParams.set('rest_route', '/pixflow-design/v1/wp-admin/direct/session');
  else url.pathname = url.pathname.replace(/\/tools\/?$/, '/session');
  return url;
}

/** Verification is a read-only GET. Retry one transient failure, never a denial;
 * the caller's cancellation/deadline still bounds both attempts. No result is
 * cached and no operation is authorized until WordPress returns valid access. */
async function verifyDirectSession(session: PixflowDirectSiteSession, signal?: AbortSignal): Promise<Response> {
  const lifetime = signal ? AbortSignal.any([signal, AbortSignal.timeout(16_000)]) : AbortSignal.timeout(16_000);
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(directSessionUrl(session.endpoint), {method:'GET',redirect:'error',
        headers:{Authorization:`Bearer ${session.token}`},signal:AbortSignal.any([lifetime,AbortSignal.timeout(8000)])});
      if (attempt === 0 && !lifetime.aborted && (response.status >= 500 || [408, 429].includes(response.status))) {
        await response.body?.cancel().catch(() => undefined);
        continue;
      }
      return response;
    } catch {
      if (attempt === 0 && !lifetime.aborted) continue;
      throw new DirectSessionAuthorizationError(503, 'DIRECT_AUTH_UNAVAILABLE', 'WordPress could not be reached to verify access. Keep your message queued and try again when the site responds.');
    }
  }
}

/** Verify ownership with WordPress, never trust identity fields in client JSON. */
export async function authenticateDirectOwner(session: PixflowDirectSiteSession, requireIdentity: boolean, signal?: AbortSignal, onIntegrations?: (value: PixflowSiteIntegrations) => void, requiredFeature?: 'audio' | 'external-mcp', onFeatures?: (value: NonNullable<PixflowDirectSiteAuthorization['features']>) => void): Promise<string> {
  const endpoint = new URL(session?.endpoint);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || !/^pfdirect_[a-f0-9]{64}$/.test(session?.token ?? ''))
    throw new Error('A valid WordPress direct session is required.');
  const response = await verifyDirectSession(session, signal);
  if (response.status === 404 && !requireIdentity && !requiredFeature) return 'legacy:'+directDigest(endpoint.toString());
  if (!response.ok) throw new DirectSessionAuthorizationError(response.status >= 500 || [408, 429].includes(response.status) ? 503 : 403,
    response.status >= 500 || [408, 429].includes(response.status) ? 'DIRECT_AUTH_UNAVAILABLE' : 'DIRECT_SESSION_REJECTED',
    response.status >= 500 || [408, 429].includes(response.status) ? 'WordPress could not verify access right now. Keep your message queued and try again when the site responds.' : 'WordPress did not authorize this Direct session.');
  let value: PixflowDirectSiteAuthorization;
  try { value = await response.json() as PixflowDirectSiteAuthorization; }
  catch { throw new DirectSessionAuthorizationError(503, 'DIRECT_AUTH_UNAVAILABLE', 'WordPress returned an unreadable access check. Keep your message queued and try again.'); }
  if (requiredFeature && value?.features?.[requiredFeature] !== true) throw new DirectSessionAuthorizationError(403, 'DIRECT_FEATURE_REQUIRED', requiredFeature === 'audio' ? 'Dictation and Codex Voice require Pixflow Design Pro on this WordPress site.' : 'External MCP requires Pixflow Design Pro on this WordPress site.');
  if (!value.identity?.siteId || !Number.isInteger(value.identity.userId) || value.identity.userId! <= 0 || !Number.isInteger(value.identity.blogId) || value.identity.blogId! <= 0)
    throw new Error('Update the Pixflow plugin to enable authenticated conversation recovery.');
  if (value.writable !== session.writable) throw new Error('This Direct session permission changed. Reconnect to WordPress.');
  // WordPress owns the binding; client-supplied context cannot reassign a run.
  if (value.editorTarget) session.editorTarget = value.editorTarget;
  else delete session.editorTarget;
  if (value.workspaceSource) session.workspaceSource = value.workspaceSource;
  else delete session.workspaceSource;
  onIntegrations?.(typeof value.integrations?.bricks === 'boolean' ? { bricks: value.integrations.bricks } : {});
  onFeatures?.(value.features ?? {});
  return 'wp:'+directDigest([endpoint.origin,endpoint.pathname,value.identity.siteId,value.identity.blogId,value.identity.userId]);
}

export async function revokeDirectSession(session: PixflowDirectSiteSession): Promise<void> {
  await fetch(directSessionUrl(session.endpoint),{method:'DELETE',redirect:'error',signal:AbortSignal.timeout(5000),headers:{Authorization:`Bearer ${session.token}`}}).catch(()=>undefined);
}

/** Renewed credentials must never leak into durable event records. */
export function redactDirectEvent(event: Record<string, unknown>, secrets: string[]): Record<string, unknown> {
  const sensitive = (key: string) => /(?:authorization|cookie|password|token|secret|apikey|accesskey|licensekey|privatekey|pairingcode|recoverycode)$/.test(key.toLowerCase().replace(/[^a-z0-9]/g, ''));
  let json = JSON.stringify(event, (key,value:unknown) => {
    if (sensitive(key)) return '[redacted]';
    // CLI tool results frequently arrive as JSON embedded in a text field.
    if (typeof value === 'string') return value.replace(/("([^"\\]+)"\s*:\s*)"(?:\\.|[^"\\])*"/g,
      (match, prefix: string, field: string) => sensitive(field) ? `${prefix}"[redacted]"` : match);
    return value;
  });
  for (const secret of secrets) if (secret) json = json.replaceAll(secret,'[redacted]');
  return JSON.parse(json) as Record<string,unknown>;
}
