import { expect, it } from 'vitest';
import { pixflowPairingErrorMessage } from '../src/api/pixflow-pairing.js';

it('formats a stable diagnostic without forwarding response text', () => {
  const result = pixflowPairingErrorMessage({code:'pairing_redirect', stage:'wordpress_exchange', httpStatus:301, error:'private'}, 'bridge_start',403);
  expect(result).toContain('redirect'); expect(result).toContain('HTTP 301'); expect(result).toContain('Bridge to WordPress');
  expect(result).not.toContain('private'); expect(result).not.toContain('HTTP 403');
});
it('does not invent a license failure or trust unknown error codes and stages', () => {
  const result = pixflowPairingErrorMessage({code:'unknown-private',stage:'private-stage',message:'secret'},'wordpress_authorize',502);
  expect(result).toContain('WordPress authorization'); expect(result).toContain('HTTP 502');
  expect(result).not.toContain('secret'); expect(result).not.toContain('private'); expect(result).not.toContain('license');
});
