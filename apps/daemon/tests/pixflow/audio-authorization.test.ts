import { afterEach, expect, it, vi } from 'vitest';
import { authorizeAudio, watchAudioAccess } from '../../src/pixflow/audio-authorization.js';
import { authenticateDirectOwner } from '../../src/pixflow/direct-site-session.js';

const session = { endpoint: 'https://example.test/wp-json/pixflow-design/v1/wp-admin/direct/tools', token: 'pfdirect_' + 'a'.repeat(64), writable: false, expiresAt: Date.now() / 1000 + 60 };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it.each([false, undefined])('rejects absent/disabled server audio even when client claims Pro (%s)', async audio => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ identity: { siteId: 'one', userId: 1, blogId: 1 }, writable: false, features: { audio } })));
  await expect(authorizeAudio({ ...session, features: { audio: true } } as typeof session)).rejects.toThrow('require Pixflow Design Pro');
  await expect(authorizeAudio(session, true)).resolves.toBeUndefined();
});
it('does not permit the legacy session fallback for voice', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
  await expect(authenticateDirectOwner(session, false, undefined, undefined, 'audio')).rejects.toThrow();
  await expect(authenticateDirectOwner(session, false)).resolves.toMatch(/^legacy:/);
});
it('revokes active audio when the site changes and stops polling on disposal', async () => {
  vi.useFakeTimers();
  let audio = true;
  const fetcher = vi.fn(async () => Response.json({ identity: { siteId: 'one', userId: 1, blogId: 1 }, writable: false, features: { audio } }));
  vi.stubGlobal('fetch', fetcher);
  const revoke = vi.fn(); const dispose = watchAudioAccess(session, revoke);
  await vi.advanceTimersByTimeAsync(5000); expect(revoke).not.toHaveBeenCalled();
  audio = false;
  await vi.advanceTimersByTimeAsync(5000); expect(revoke).toHaveBeenCalledOnce();
  dispose(); await vi.advanceTimersByTimeAsync(15000); expect(fetcher).toHaveBeenCalledTimes(2);
});
