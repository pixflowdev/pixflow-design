import { describe, expect, it } from 'vitest';
import { exportErrorCode } from '../../src/analytics/export-error-code';

describe('exportErrorCode', () => {
  it('prefers structured errors and separates desktop version skew', () => {
    expect(exportErrorCode({ code: 'RENDER_TIMEOUT' })).toBe('RENDER_TIMEOUT');
    expect(exportErrorCode(new Error(
      'desktop renderer unavailable: unknown desktop sidecar message: render-slides',
    ))).toBe('DESKTOP_SIDECAR_UNKNOWN_MESSAGE');
    expect(exportErrorCode(new Error('desktop renderer is unavailable')))
      .toBe('DESKTOP_RENDERER_UNAVAILABLE');
  });
});
