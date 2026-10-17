/** Shared, transport-safe diagnostics for one HTML-to-Bricks run. */
export const PIXFLOW_HTML_TO_BRICKS_LIFECYCLE_MARKS = [
  'stage_a_started',
  'route_context_fetch_start',
  'route_context_fetch_end',
  'prompt_build_start',
  'prompt_build_end',
  'handoff_started',
  'handoff_route_context_fetch_start',
  'handoff_route_context_fetch_end',
  'first_model_output',
  'first_artifact_write',
  'screenshot_capture_start',
  'screenshot_capture_end',
  'stage_a_finished',
  'source_discovery_start',
  'source_discovery_end',
  'source_persistence_start',
  'source_persistence_end',
  'source_validation_start',
  'source_validation_end',
  'source_sanitization_start',
  'source_sanitization_end',
  'source_resource_materialization_start',
  'source_resource_materialization_end',
  'source_sandbox_settle_start',
  'source_sandbox_settle_end',
  'source_dom_style_capture_start',
  'source_dom_style_capture_end',
  'source_responsive_capture_start',
  'source_responsive_capture_end',
  'source_acceptance_passed',
  'source_acceptance_failed',
  'framework_preflight_start',
  'framework_preflight_end',
  'bricks_schema_fetch_start',
  'bricks_schema_fetch_end',
  'runtime_knowledge_fetch_start',
  'runtime_knowledge_fetch_end',
  'conversion_start',
  'conversion_end',
  'deterministic_conversion_start',
  'deterministic_conversion_end',
  'baseline_apply_started',
  'baseline_apply_finished',
  'baseline_persistence_start',
  'baseline_persistence_end',
  'baseline_canvas_verification_start',
  'baseline_canvas_verification_end',
  'stage_b_started',
  'stage_b_finished',
  'stage_b_invocation_start',
  'stage_b_invocation_end',
  'final_apply_started',
  'final_apply_finished',
  'visual_settle_start',
  'visual_settle_end',
  'visual_capture_start',
  'visual_capture_end',
  'visual_comparison_start',
  'visual_comparison_end',
  'rollback_start',
  'rollback_end',
  'handoff_finished',
  'terminal_disposition',
] as const;

export type PixflowHtmlToBricksLifecycleMark =
  typeof PIXFLOW_HTML_TO_BRICKS_LIFECYCLE_MARKS[number];

export const PIXFLOW_HTML_TO_BRICKS_RESULT_CATEGORIES = [
  'source_failed',
  'source_evidence_failed',
  'baseline_failed',
  'baseline_applied',
  'stage_b_applied',
  'stage_b_warning_baseline_kept',
  'stage_b_warning_final_kept',
  'structural_failure',
  'cancelled',
] as const;

export type PixflowHtmlToBricksResultCategory =
  typeof PIXFLOW_HTML_TO_BRICKS_RESULT_CATEGORIES[number];

export const PIXFLOW_HTML_TO_BRICKS_TERMINAL_CLASSES = [
  'clean_success',
  'warning_success',
  'failure',
  'cancelled',
] as const;

export type PixflowHtmlToBricksTerminalClass =
  typeof PIXFLOW_HTML_TO_BRICKS_TERMINAL_CLASSES[number];

export const PIXFLOW_HTML_TO_BRICKS_TERMINAL_CODES = [
  'html_to_bricks_applied',
  'html_to_bricks_applied_with_warning',
  'html_to_bricks_source_failure',
  'html_to_bricks_structural_failure',
  'html_to_bricks_cancelled',
] as const;

export type PixflowHtmlToBricksTerminalCode =
  typeof PIXFLOW_HTML_TO_BRICKS_TERMINAL_CODES[number];

export type PixflowHtmlToBricksRunPhase =
  | 'source_discovery'
  | 'source_persistence'
  | 'source_preparation'
  | 'source_acceptance'
  | 'preflight'
  | 'deterministic_conversion'
  | 'baseline_apply'
  | 'stage_b'
  | 'final_apply'
  | 'visual_evidence'
  | 'rollback'
  | 'terminal';

export type PixflowHtmlToBricksSourceCapability =
  | 'validation'
  | 'sanitization'
  | 'resource_materialization'
  | 'runtime_audit'
  | 'sandbox_settle'
  | 'hydrated_dom_capture'
  | 'static_replay'
  | 'dom_style_capture'
  | 'responsive_capture';

export type PixflowHtmlToBricksSourceCapabilityRecord = {
  name: PixflowHtmlToBricksSourceCapability;
  status: 'completed' | 'skipped' | 'failed' | 'unavailable';
  durationMs: number;
  evidencePath?: string;
  evidenceHash?: string;
};

export type PixflowHtmlToBricksRunObservation =
  | {
      kind: 'source';
      inputKind: 'single_document' | 'document_bundle' | 'generated_document';
      manifestVersion: number | null;
      canonicalPath: string;
      canonicalHash: string | null;
      cacheDecision: 'hit' | 'miss' | 'bypass' | 'unavailable';
      acceptance: 'accepted' | 'rejected';
      discoveryDurationMs: number;
      persistenceDurationMs: number;
    }
  | {
      kind: 'source_preparation';
      capabilities: PixflowHtmlToBricksSourceCapabilityRecord[];
    }
  | {
      kind: 'preflight';
      frameworkDurationMs: number;
      schemaDurationMs: number;
      runtimeKnowledgeDurationMs: number;
      fallbackUsed: Array<'framework' | 'schema' | 'runtime_knowledge'>;
    }
  | {
      kind: 'conversion';
      durationMs: number;
      elementCount: number;
      globalClassCount: number;
      syntheticWrapperCount: number;
    }
  | {
      kind: 'apply';
      stage: 'baseline' | 'final';
      persistenceDurationMs: number;
      liveCanvasVerificationDurationMs: number;
      outcome: 'verified' | 'failed' | 'skipped';
    }
  | {
      kind: 'stage_b';
      invocationId: string;
      modelInvocationCount?: number;
      runner: string | null;
      durationMs: number;
      disposition: 'applied' | 'warning_baseline_kept' | 'warning_final_kept' | 'failed' | 'cancelled';
    }
  | {
      kind: 'visual';
      captureCount: number;
      settleDurationMs: number;
      captureDurationMs: number;
      comparisonDurationMs: number;
      evidencePaths: string[];
    }
  | {
      kind: 'rollback';
      reason: string;
      durationMs: number;
      outcome: 'restored' | 'failed' | 'not_required';
    }
  | {
      kind: 'failure';
      phase: PixflowHtmlToBricksRunPhase;
      code: string;
      message: string;
    };

export type PixflowHtmlToBricksRunSummary = {
  version: 1;
  lastCompletedPhase: PixflowHtmlToBricksRunPhase | null;
  failingPhase: PixflowHtmlToBricksRunPhase | null;
  disposition: PixflowHtmlToBricksResultCategory | null;
  terminalClass: PixflowHtmlToBricksTerminalClass | null;
  terminalCode: PixflowHtmlToBricksTerminalCode | null;
  warningCodes: string[];
  /**
   * Post-conversion QA is an assessment, not execution status. A failed
   * assessment may coexist with a successful terminal class when conversion,
   * persistence and insertion completed safely.
   */
  qaAssessment?: {
    status: 'not_run' | 'passed' | 'warning' | 'failed' | 'unavailable';
    warnings: string[];
  };
  source: {
    inputKind: 'single_document' | 'document_bundle' | 'generated_document' | null;
    manifestVersion: number | null;
    canonicalPath: string | null;
    canonicalHash: string | null;
    cacheDecision: 'hit' | 'miss' | 'bypass' | 'unavailable';
    acceptance: 'accepted' | 'rejected' | 'unknown';
    discoveryDurationMs: number | null;
    persistenceDurationMs: number | null;
  };
  sourcePreparation: {
    capabilities: PixflowHtmlToBricksSourceCapabilityRecord[];
    totalDurationMs: number;
  };
  preflight: {
    frameworkDurationMs: number | null;
    schemaDurationMs: number | null;
    runtimeKnowledgeDurationMs: number | null;
    totalDurationMs: number | null;
    fallbackUsed: Array<'framework' | 'schema' | 'runtime_knowledge'>;
  };
  conversion: {
    durationMs: number | null;
    elementCount: number | null;
    globalClassCount: number | null;
    syntheticWrapperCount: number | null;
  };
  baselineApply: PixflowHtmlToBricksApplySummary;
  finalApply: PixflowHtmlToBricksApplySummary;
  /**
   * Legacy HTML-to-Bricks/Website Clone refinement telemetry. Ordinary
   * HTML-first Build runs omit this field entirely; the new Build pipeline has
   * no Stage B state or transition to persist.
   */
  stageB?: {
    invocationCount: number;
    durationMs: number;
    runner: string | null;
    disposition: 'not_run' | 'applied' | 'warning_baseline_kept' | 'warning_final_kept' | 'failed' | 'cancelled';
  };
  visual: {
    captureCount: number;
    settleDurationMs: number;
    captureDurationMs: number;
    comparisonDurationMs: number;
    evidencePaths: string[];
  };
  rollbacks: Array<{
    reason: string;
    durationMs: number;
    outcome: 'restored' | 'failed' | 'not_required';
  }>;
  failure: {
    phase: PixflowHtmlToBricksRunPhase;
    code: string;
    message: string;
  } | null;
};

export type PixflowHtmlToBricksApplySummary = {
  persistenceDurationMs: number | null;
  liveCanvasVerificationDurationMs: number | null;
  outcome: 'verified' | 'failed' | 'skipped' | 'not_run';
};
