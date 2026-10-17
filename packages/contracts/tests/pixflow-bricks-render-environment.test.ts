import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  PIXFLOW_BRICKS_DESTINATION_BASELINE_CSS,
  PIXFLOW_BRICKS_DESTINATION_BASELINE_FINGERPRINT,
  resolvePixflowVisualRenderEnvironment,
} from '../src/api/pixflow-bricks-render-environment';

describe('Bricks renderer destination baseline', () => {
  it('owns a bounded versioned Bricks-generic environment without native element policy', () => {
    const resolved = resolvePixflowVisualRenderEnvironment('canonical-build-bricks');
    expect(resolved?.identity).toEqual({
      profile: 'canonical-build-bricks',
      owner: 'pixflow-renderer',
      destination: 'bricks',
      baseline: {
        id: 'pixflow.bricks.destination_baseline',
        revision: 'bricks-2.4-generic.1',
        fingerprint: PIXFLOW_BRICKS_DESTINATION_BASELINE_FINGERPRINT,
      },
    });
    expect(PIXFLOW_BRICKS_DESTINATION_BASELINE_CSS).toContain('font-size: 62.5%');
    expect(PIXFLOW_BRICKS_DESTINATION_BASELINE_CSS).toContain('box-sizing: border-box');
    expect(PIXFLOW_BRICKS_DESTINATION_BASELINE_CSS).toContain('body { margin: 0; }');
    expect(PIXFLOW_BRICKS_DESTINATION_BASELINE_CSS).not.toContain('.brxe-');
    expect(`sha256:${createHash('sha256').update(PIXFLOW_BRICKS_DESTINATION_BASELINE_CSS).digest('hex')}`)
      .toBe(PIXFLOW_BRICKS_DESTINATION_BASELINE_FINGERPRINT);
  });

  it('does not opt unrelated capture routes into the Bricks destination baseline', () => {
    expect(resolvePixflowVisualRenderEnvironment(undefined)).toBeNull();
    expect(resolvePixflowVisualRenderEnvironment('visual-clone')).toBeNull();
    expect(resolvePixflowVisualRenderEnvironment('html-to-bricks')).toBeNull();
  });
});
