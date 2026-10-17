import { describe, expect, it } from 'vitest';

import {
  makeStageBQualityFindingsNonBlocking,
  stageBQaReportExists,
} from '../stage-b-delivery-policy.mjs';

describe('Stage B delivery policy', () => {
  it('delivers a structurally valid conversion with quality findings as warnings', () => {
    expect(makeStageBQualityFindingsNonBlocking({
      status: 'failed',
      blocking: true,
      score: 40,
      issues: [{ id: 'stage_b_custom_css_token_bucket', severity: 'p0', message: 'Token bucket.' }],
    }, {
      passed: false,
      failures: ['P0 issues remaining: 1'],
    })).toMatchObject({
      status: 'warning',
      blocking: false,
      delivery: {
        ready: true,
        status: 'ready_with_warnings',
      },
      qualityGate: {
        passed: false,
      },
    });
  });

  it('still requires the QA diagnostic artifact to exist', () => {
    expect(stageBQaReportExists({ score: 100 })).toBe(true);
    expect(stageBQaReportExists({})).toBe(false);
  });
});
