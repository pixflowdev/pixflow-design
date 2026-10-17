import type { Request } from 'express';
import type { PixflowDirectSiteSession } from '@open-design/contracts';
import { authenticateDirectOwner } from './direct-site-session.js';

export function audioSession(request: Request): PixflowDirectSiteSession {
  try {
    const raw = request.get('X-Pixflow-Audio-Session');
    if (!raw || raw.length > 8192) throw new Error();
    return JSON.parse(raw) as PixflowDirectSiteSession;
  } catch { throw new Error('Reconnect to WordPress before using Pro audio.'); }
}
/** The current WordPress response owns availability, never the client or local settings. */
export async function authorizeAudio(session: PixflowDirectSiteSession, cleanup = false, signal?: AbortSignal): Promise<void> {
  await authenticateDirectOwner(session, true, signal, undefined, cleanup ? undefined : 'audio');
}

/** Revoke active audio on a changed site or lost authorization; never overlap checks. */
export function watchAudioAccess(session: PixflowDirectSiteSession, unavailable: (error: Error) => void): () => void {
  const lifetime = new AbortController();
  let checking = false;
  const timer = setInterval(() => {
    if (checking || lifetime.signal.aborted) return;
    checking = true;
    void authorizeAudio(session, false, lifetime.signal).catch(error => {
      if (!lifetime.signal.aborted) unavailable(error instanceof Error ? error : new Error('Pro audio is unavailable.'));
    }).finally(() => { checking = false; });
  }, 5000);
  timer.unref();
  return () => { clearInterval(timer); lifetime.abort(); };
}
