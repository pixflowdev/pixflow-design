import { describe, expect, it } from 'vitest';

import {
  bridgeRunnerEventFailureMessage,
} from '../bricks-handoff-cli.mjs';

describe('floating-panel runner failure propagation', () => {
  it('prefers the nested OpenCode provider message over the generic APIError name', () => {
    expect(bridgeRunnerEventFailureMessage({
      type: 'error',
      error: {
        name: 'APIError',
        data: {
          message: 'The selected model requires explicit provider opt in.',
          statusCode: 403,
          isRetryable: false,
        },
      },
    }, 'OpenCode')).toBe('The selected model requires explicit provider opt in.');
  });

  it('preserves nested usage-limit text so the UI can classify it', () => {
    expect(bridgeRunnerEventFailureMessage({
      type: 'error',
      error: {
        name: 'APIError',
        data: {
          message: 'Monthly usage exhausted for this workspace.',
          statusCode: 402,
          isRetryable: false,
        },
      },
    }, 'OpenCode')).toBe('Monthly usage exhausted for this workspace.');
  });
});
