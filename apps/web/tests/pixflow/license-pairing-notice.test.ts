import { expect, it } from 'vitest';
import { normalizePixflowBricksAgentFailureNotice } from '../../src/pixflow/BricksAgentFailureBanner';

it('reports a license pairing problem rather than calling a running bridge offline', () => {
  const notice = normalizePixflowBricksAgentFailureNotice(null,
    'Pixflow Design license or bridge pairing needs attention. Open License settings to pair this site again.');
  expect(notice?.kind).toBe('license');
});
