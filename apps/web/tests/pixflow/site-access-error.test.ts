import { expect, it } from 'vitest';
import { siteAccessError } from '../../src/pixflow/site-access-error';

it('distinguishes expired browser sessions from license and hosting failures', async () => {
  const session = await siteAccessError(Response.json({ code: 'rest_cookie_invalid_nonce', message: 'Cookie check failed' }, { status: 403 }));
  expect(session.message).toContain('session needs refreshing');
  const hosting = await siteAccessError(new Response('<html>Forbidden</html>', { status: 403 }));
  expect(hosting.message).not.toContain('administrator');
  expect(hosting.message).not.toContain('updated');
  expect(hosting.details).toBe('HTTP 403');
  const missing = await siteAccessError(new Response('', { status: 404 }));
  expect(missing.message).toContain('endpoint is unavailable');
  const server = await siteAccessError(new Response('', { status: 500 }));
  expect(server.message).toContain('could not complete');
});
