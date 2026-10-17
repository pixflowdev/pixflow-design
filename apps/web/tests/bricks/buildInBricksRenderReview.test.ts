import { describe, expect, it } from 'vitest';

import {
  normalizePixflowBuildInBricksThemeStyleContext,
  resolvePixflowVisualRenderEnvironment,
  type PixflowBuildInBricksDesignContext,
} from '@open-design/contracts';
import {
  buildBuildInBricksThemeStylePreviewCss,
  buildBuildInBricksVisualCaptureRequest,
  createBuildInBricksRenderedReview,
} from '../../src/pixflow/build-in-bricks-render-review';

const contextFixture = (): PixflowBuildInBricksDesignContext => ({
  tokens: {
    all: [{ cssVar: '--site-space', value: '3rem' }],
  },
  themeStyle: normalizePixflowBuildInBricksThemeStyleContext({
    policy: 'inherit_effective',
    activeStyleIds: ['site-style'],
    themeStyles: [{
      id: 'site-style',
      settings: {
        button: { border: { radius: { top: '28px', right: '28px', bottom: '28px', left: '28px' } } },
        container: { width: '100%', padding: { left: '3rem', right: '3rem' } },
      },
    }],
  }),
} as unknown as PixflowBuildInBricksDesignContext);

describe('Canonical Build rendered-review environment ownership', () => {
  it('opts only Canonical Build capture into the versioned Bricks baseline', () => {
    const context = contextFixture();
    const request = buildBuildInBricksVisualCaptureRequest({ url: 'http://renderer.test/build', context });

    expect(request).toMatchObject({
      url: 'http://renderer.test/build',
      captureMode: 'generated',
      fidelityProfile: 'structural',
      renderEnvironmentProfile: 'canonical-build-bricks',
      themeStyleSnapshotHash: context.themeStyle?.snapshotHash,
    });
    expect(request.themeStylePreviewCss).toContain('--site-space: 3rem;');
    expect(request.themeStylePreviewCss).toContain('button, .brxe-button');
    expect(request.themeStylePreviewCss).not.toContain('font-size: 62.5%');
    expect(request.themeStylePreviewCss).not.toContain('box-sizing: border-box');
  });

  it('keeps destination baseline identity separate from Theme Style and authored source', () => {
    const context = contextFixture();
    const css = buildBuildInBricksThemeStylePreviewCss(context);
    const renderEnvironment = resolvePixflowVisualRenderEnvironment('canonical-build-bricks')!.identity;
    const review = createBuildInBricksRenderedReview({
      sourceValidation: { ok: true, issues: [], warnings: [] },
      layouts: [],
      layer3: { status: 'skipped_capability_unavailable', screenshotCount: 0 },
      repair: { attempted: false, count: 0, status: 'not_needed' },
      themeStyleSnapshotHash: context.themeStyle?.snapshotHash,
      renderEnvironment,
    });

    expect(css).toContain(':root');
    expect(review.themeStyleSnapshotHash).toBe(context.themeStyle?.snapshotHash);
    expect(review.renderEnvironment).toEqual(renderEnvironment);
    expect(review.renderEnvironment?.baseline.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
