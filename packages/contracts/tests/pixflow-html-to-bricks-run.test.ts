import { describe, expect, it } from 'vitest';

import {
  PIXFLOW_HTML_TO_BRICKS_LIFECYCLE_MARKS,
  PIXFLOW_HTML_TO_BRICKS_RESULT_CATEGORIES,
  PIXFLOW_HTML_TO_BRICKS_TERMINAL_CLASSES,
  PIXFLOW_HTML_TO_BRICKS_TERMINAL_CODES,
  PIXFLOW_HTML_SOURCE_MANIFEST_SCHEMA,
  PIXFLOW_HTML_SCRIPT_DISPOSITIONS,
  PIXFLOW_HTML_VISUAL_IMPLEMENTATION_STRATEGIES,
} from '../src/index.js';

describe('HTML to Bricks run diagnostics contract', () => {
  it('publishes one versioned source-manifest schema for every runtime surface', () => {
    expect(PIXFLOW_HTML_SOURCE_MANIFEST_SCHEMA).toBe('pixflow.html_to_bricks.source_manifest.v1');
    expect(PIXFLOW_HTML_SCRIPT_DISPOSITIONS).toEqual([
      'capture_only',
      'visual_behavior',
      'application',
      'blocked',
    ]);
    expect(PIXFLOW_HTML_VISUAL_IMPLEMENTATION_STRATEGIES).toEqual([
      'none',
      'bricks_native',
      'css',
      'pixflow_js',
      'library',
      'manual_review',
    ]);
  });

  it('publishes the canonical source-through-terminal lifecycle', () => {
    expect(PIXFLOW_HTML_TO_BRICKS_LIFECYCLE_MARKS).toEqual(expect.arrayContaining([
      'source_discovery_start',
      'source_persistence_end',
      'source_validation_start',
      'source_sanitization_end',
      'source_resource_materialization_end',
      'source_sandbox_settle_end',
      'source_dom_style_capture_end',
      'source_responsive_capture_end',
      'source_acceptance_passed',
      'framework_preflight_end',
      'deterministic_conversion_end',
      'baseline_canvas_verification_end',
      'stage_b_invocation_start',
      'visual_comparison_end',
      'rollback_end',
      'terminal_disposition',
    ]));
  });

  it('publishes stable terminal codes and analytics classes', () => {
    expect(PIXFLOW_HTML_TO_BRICKS_TERMINAL_CLASSES).toEqual([
      'clean_success',
      'warning_success',
      'failure',
      'cancelled',
    ]);
    expect(PIXFLOW_HTML_TO_BRICKS_TERMINAL_CODES).toEqual([
      'html_to_bricks_applied',
      'html_to_bricks_applied_with_warning',
      'html_to_bricks_source_failure',
      'html_to_bricks_structural_failure',
      'html_to_bricks_cancelled',
    ]);
  });

  it('publishes advisory outcomes separately from hard failures', () => {
    expect(PIXFLOW_HTML_TO_BRICKS_RESULT_CATEGORIES).toEqual([
      'source_failed',
      'source_evidence_failed',
      'baseline_failed',
      'baseline_applied',
      'stage_b_applied',
      'stage_b_warning_baseline_kept',
      'stage_b_warning_final_kept',
      'structural_failure',
      'cancelled',
    ]);
  });
});
