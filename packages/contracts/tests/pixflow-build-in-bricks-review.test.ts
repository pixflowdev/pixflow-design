import { describe, expect, it } from 'vitest';

import {
  buildPixflowBuildInBricksLayer2Findings,
  createPixflowBuildInBricksRenderedReview,
  renderPixflowBuildInBricksLayer2TextReport,
} from '../src/api/pixflow-build-in-bricks-review';
import type { PixflowVisualLayoutEvidence } from '../src/api/pixflow-visual-capture';

const evidence = (overrides: Partial<PixflowVisualLayoutEvidence> = {}): PixflowVisualLayoutEvidence => ({
  viewport: 'mobile',
  viewportWidth: 390,
  viewportHeight: 844,
  documentWidth: 418,
  documentHeight: 1600,
  clientWidth: 390,
  clientHeight: 844,
  horizontalOverflowPx: 28,
  overflowSources: ['.hero__media'],
  viewportEscapes: [],
  zeroSizeVisible: [],
  clippedElements: [],
  missingResources: [],
  consoleErrors: [],
  failedRequests: [],
  invalidInteractiveTargets: [],
  oversizedElements: [],
  ...overrides,
});

describe('Build in Bricks rendered review contract', () => {
  it('turns renderer measurements into actionable bounded text evidence', () => {
    const findings = buildPixflowBuildInBricksLayer2Findings([evidence()]);
    expect(findings).toEqual([expect.objectContaining({
      kind: 'horizontal_overflow',
      severity: 'blocking',
      viewport: 'mobile',
      message: 'Horizontal overflow 28px at mobile.',
      evidence: ['.hero__media'],
    })]);
    expect(renderPixflowBuildInBricksLayer2TextReport(findings, [evidence()])).toContain(
      'source .hero__media',
    );
  });

  it('does not treat local custom properties as layout findings', () => {
    expect(buildPixflowBuildInBricksLayer2Findings([evidence({ horizontalOverflowPx: 0 })])).toEqual([]);
  });

  it('records renderer-unavailable and capability skip reasons without blocking source validation', () => {
    const review = createPixflowBuildInBricksRenderedReview({
      layer1: { status: 'completed', ok: true, issues: [], warnings: [] },
      rendererAvailable: false,
      layer3: {
        status: 'skipped_capability_unavailable',
        screenshotCount: 0,
        reason: 'image input unavailable',
      },
    });
    expect(review.schema).toBe('pixflow.build_in_bricks.rendered_review.v1');
    expect(review.layer2.status).toBe('skipped_renderer_unavailable');
    expect(review.layer3.status).toBe('skipped_capability_unavailable');
    expect(review.layer1.ok).toBe(true);
  });

  it('caps the report and never emits a second repair count', () => {
    const review = createPixflowBuildInBricksRenderedReview({
      layer1: { status: 'completed', ok: true, issues: [], warnings: [] },
      viewports: [evidence({ viewport: 'desktop', horizontalOverflowPx: 0 })],
      repair: { attempted: true, count: 4, status: 'applied' },
    });
    expect(review.repair.count).toBe(1);
    expect(review.disposition).toBe('repair_applied');
    // The orchestration policy owns the one-repair limit; the contract keeps
    // the recorded count truthful instead of silently rewriting evidence.
    expect(review.layer2.findings).toEqual([]);
  });
});
