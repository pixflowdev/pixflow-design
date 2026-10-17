import type {
  PixflowBricksAgentSessionPayload,
  PixflowBricksStageASourceMetadata,
} from './bricks-agent-session';
import { isBuildInBricksHtmlFirstPayload } from './bricks-agent-session';
import type {
  PixflowHtmlToBricksLifecycleMark,
  PixflowHtmlToBricksRunObservation,
  PixflowHtmlToBricksRunPhase,
  PixflowHtmlToBricksRunSummary,
  PixflowBuildInBricksSourceLifecycle,
} from '@open-design/contracts';
import { normalizePixflowBuildInBricksSourceLifecycle } from '@open-design/contracts';

export const PROTOTYPE_BRICKS_RUN_BUNDLE_VERSION = 2 as const;

export type PrototypeBricksRunFailureCause =
  | 'cancelled'
  | 'stage_a_blocked'
  | 'conversion_failed'
  | 'baseline_insert_failed'
  | 'stage_b_failed'
  | 'final_apply_failed'
  | 'saved_bricks_verification_failed'
  | 'visual_verification_failed'
  | 'connection_interrupted'
  | 'unknown_failure';

/**
 * Legacy bundles use the shared HTML-to-Bricks marks. New ordinary Build
 * bundles additionally retain their semantic source-generation marks instead
 * of projecting them back to stage_a_* names.
 */
export type PrototypeBricksRunMark = PixflowHtmlToBricksLifecycleMark | keyof PixflowBuildInBricksSourceLifecycle;

export type PrototypeBricksRunBundle = {
  version: typeof PROTOTYPE_BRICKS_RUN_BUNDLE_VERSION;
  /** Canonical pipeline identity for new runs; legacy readers may omit it. */
  pipeline?: 'build-in-bricks' | 'legacy-bricks';
  runId: string;
  projectId: string | null;
  sessionId: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  startedAt: number;
  finishedAt: number | null;
  marks: Partial<Record<PrototypeBricksRunMark, number>>;
  durationsMs: Partial<Record<
    'routeContextFetch' | 'handoffRouteContextFetch' | 'promptBuild' | 'sourceGeneration' | 'stageA' | 'screenshotCapture'
    | 'conversion' | 'baselineApply' | 'stageB' | 'finalApply' | 'total',
    number
  >>;
  summary: PixflowHtmlToBricksRunSummary;
  source: {
    activeFileName: string | null;
    buildSource?: PixflowBricksStageASourceMetadata | null;
    stageA?: PixflowBricksStageASourceMetadata | null;
    handoffFiles: string[];
  };
  target: {
    postId: number | null;
    postTitle: string | null;
    area: string;
  };
  touched: {
    postIds: number[];
    handoffIds: string[];
    artifactFiles: string[];
    elementIds: string[];
    globalClassIds: string[];
    templateIds: number[];
    mediaAttachmentIds: number[];
  };
  result: {
    code: string | null;
    message: string | null;
    persisted: boolean | null;
    savedContent: {
      postId: number | null;
      area: string | null;
      expectedCount: number | null;
      actualCount: number | null;
      expectedElementIds: string[];
      storedElementIds: string[];
      missingElementIds: string[];
      extraElementIds: string[];
      expectedHash: string | null;
      actualHash: string | null;
      matches: boolean | null;
    } | null;
    runtimeDiagnostics: Array<Record<string, unknown>>;
  };
  evidence: {
    buildSource?: {
      screenshots: string[];
      reports: string[];
      visualGate: Record<string, unknown> | null;
      qualityGate: unknown;
    };
    stageA?: {
      screenshots: string[];
      reports: string[];
      visualGate: Record<string, unknown> | null;
      qualityGate: unknown;
    };
    sideBySide: {
      screenshots: string[];
      reports: string[];
      qualityPassed: boolean | null;
    } | null;
  };
  archive: {
    status: 'pending' | 'saved' | 'failed';
    files: string[];
    message: string | null;
  };
  failure: {
    cause: PrototypeBricksRunFailureCause;
    message: string;
  } | null;
};

export type PrototypeBricksRunBundleTracker = {
  mark(mark: PrototypeBricksRunMark, timestamp?: number): void;
  recordObservation(observation: PixflowHtmlToBricksRunObservation): void;
  recordInsert(insert: unknown, timestamp?: number): void;
  succeed(result: unknown, timestamp?: number): void;
  fail(cause: PrototypeBricksRunFailureCause, message: string, result?: unknown, timestamp?: number): void;
  snapshot(): PrototypeBricksRunBundle;
};

function createRunBundleTrackerCore(
  payload: PixflowBricksAgentSessionPayload,
  handoffStartedAt = Date.now(),
): PrototypeBricksRunBundleTracker {
  const targetPostId = positiveInteger(payload.targetContext?.postId);
  const buildInBricksRun = isBuildInBricksHtmlFirstPayload(payload);
  const stageAMarks = normalizeStageAMarks(payload.stageALifecycle);
  const buildLifecycle = normalizePixflowBuildInBricksSourceLifecycle(payload.buildLifecycle);
  const startedAt = buildInBricksRun
    ? buildLifecycle.source_generation_started ?? handoffStartedAt
    : stageAMarks.stage_a_started ?? handoffStartedAt;
  const sourceDiagnostics = payload.sourceDiagnostics ?? null;
  const sourceDiscoveryStart = sourceDiagnostics
    ? Math.max(0, handoffStartedAt - sourceDiagnostics.discoveryDurationMs - sourceDiagnostics.persistenceDurationMs)
    : undefined;
  const sourcePersistenceStart = sourceDiagnostics
    ? Math.max(0, handoffStartedAt - sourceDiagnostics.persistenceDurationMs)
    : undefined;
  const bundle: PrototypeBricksRunBundle = {
    version: PROTOTYPE_BRICKS_RUN_BUNDLE_VERSION,
    pipeline: buildInBricksRun ? 'build-in-bricks' : 'legacy-bricks',
    runId: `${buildInBricksRun ? 'build-in-bricks' : 'prototype-bricks'}-${payload.session.id}-${startedAt}`,
    projectId: payload.projectId,
    sessionId: payload.session.id,
    status: 'running',
    startedAt,
    finishedAt: null,
    marks: {
      ...(buildInBricksRun ? buildLifecycleMarks(buildLifecycle) : stageAMarks),
      ...(sourceDiscoveryStart !== undefined ? {
        source_discovery_start: sourceDiscoveryStart,
        source_discovery_end: sourcePersistenceStart,
      } : {}),
      ...(sourcePersistenceStart !== undefined ? {
        source_persistence_start: sourcePersistenceStart,
        source_persistence_end: handoffStartedAt,
      } : {}),
      ...(sourceDiagnostics?.acceptance === 'accepted'
        ? { source_acceptance_passed: handoffStartedAt }
        : sourceDiagnostics?.acceptance === 'rejected'
          ? { source_acceptance_failed: handoffStartedAt }
          : {}),
      handoff_started: handoffStartedAt,
    },
    durationsMs: {},
    summary: createEmptyRunSummary(payload),
    source: {
      activeFileName: payload.activeFileName,
      ...(buildInBricksRun
        ? { buildSource: payload.buildSource ?? payload.stageASource ?? null }
        : { stageA: payload.stageASource ?? null }),
      handoffFiles: uniqueStrings([
        ...payload.handoffFiles.map((file) => file.path || file.name),
        payload.sourceFile?.path || payload.sourceFile?.name || '',
      ]),
    },
    target: {
      postId: targetPostId,
      postTitle: cleanString(payload.targetContext?.postTitle),
      area: cleanString(payload.targetContext?.area) || 'content',
    },
    touched: {
      postIds: targetPostId ? [targetPostId] : [],
      handoffIds: [],
      artifactFiles: [],
      elementIds: [],
      globalClassIds: [],
      templateIds: [],
      mediaAttachmentIds: [],
    },
    result: {
      code: null,
      message: null,
      persisted: null,
      savedContent: null,
      runtimeDiagnostics: [],
    },
    evidence: {
      ...(buildInBricksRun
        ? { buildSource: {
            screenshots: uniqueStrings(payload.buildEvidence?.screenshots || []),
            reports: uniqueStrings(Object.values(payload.buildEvidence?.reports || {}).filter(
              (value): value is string => typeof value === 'string' && value.trim() !== '',
            )),
            visualGate: payload.buildEvidence?.visualGate
              ? { ...payload.buildEvidence.visualGate }
              : null,
            qualityGate: payload.buildEvidence?.qualityGate ?? null,
          } }
        : { stageA: {
        screenshots: uniqueStrings(payload.stageAEvidence?.screenshots || []),
        reports: uniqueStrings(Object.values(payload.stageAEvidence?.reports || {}).filter(
          (value): value is string => typeof value === 'string' && value.trim() !== '',
        )),
        visualGate: payload.stageAEvidence?.visualGate
          ? { ...payload.stageAEvidence.visualGate }
          : null,
        qualityGate: payload.stageAEvidence?.qualityGate ?? null,
        } }),
      sideBySide: null,
    },
    archive: { status: 'pending', files: [], message: null },
    failure: null,
  };
  if (sourceDiagnostics) applyRunObservation(bundle.summary, sourceDiagnostics);
  refreshDurations(bundle);

  const mark = (lifecycleMark: PrototypeBricksRunMark, timestamp = Date.now()) => {
    if (bundle.marks[lifecycleMark] !== undefined) return;
    bundle.marks[lifecycleMark] = timestamp;
    refreshDurations(bundle);
  };

  const recordInsert = (insert: unknown, timestamp = Date.now()) => {
    const record = objectValue(insert);
    const stage = artifactStage(record);
    const ok = record.ok !== false;

    const buildInBricksRun = bundle.pipeline === 'build-in-bricks';
    if (stage === 'pre_stage_b_baseline_preview' && !buildInBricksRun) {
      mark('baseline_apply_started', timestamp);
      if (ok) {
        mark('baseline_apply_finished', timestamp);
        mark('first_artifact_write', timestamp);
        mark('stage_b_started', timestamp);
      }
    } else if (stage === 'stage_b_final' && !buildInBricksRun) {
      mark('stage_b_finished', timestamp);
      mark('final_apply_started', timestamp);
      if (ok) mark('final_apply_finished', timestamp);
    }

    collectTouched(bundle, record, stage === 'stage_b_final' && !buildInBricksRun);
    updateResult(bundle, record);
    updateSideBySideEvidence(bundle, record);
    updateSummaryFromInsert(bundle.summary, record, buildInBricksRun && stage.includes('stage_b') ? 'baseline' : stage);
  };

  const recordObservation = (observation: PixflowHtmlToBricksRunObservation) => {
    if (bundle.pipeline === 'build-in-bricks' && observation.kind === 'stage_b') {
      return;
    }
    applyRunObservation(bundle.summary, observation);
  };

  return {
    mark,
    recordObservation,
    recordInsert,
    succeed(result: unknown, timestamp = Date.now()) {
      recordInsert(result, timestamp);
      bundle.status = 'succeeded';
      bundle.finishedAt = timestamp;
      bundle.failure = null;
      mark('handoff_finished', timestamp);
      mark('terminal_disposition', timestamp);
      completeRunSummary(bundle.summary, result, bundle.pipeline === 'build-in-bricks');
      refreshDurations(bundle);
    },
    fail(cause, message, result?: unknown, timestamp = Date.now()) {
      const effectiveCause = bundle.pipeline === 'build-in-bricks' && cause === 'stage_b_failed'
        ? 'baseline_insert_failed'
        : cause;
      if (result !== undefined) recordInsert(result, timestamp);
      bundle.status = effectiveCause === 'cancelled' ? 'cancelled' : 'failed';
      bundle.finishedAt = timestamp;
      bundle.failure = { cause: effectiveCause, message };
      bundle.result.message = message || bundle.result.message;
      mark('handoff_finished', timestamp);
      mark('terminal_disposition', timestamp);
      failRunSummary(bundle.summary, effectiveCause, message);
      refreshDurations(bundle);
    },
    snapshot() {
      return structuredClone(bundle);
    },
  };
}

function inferRunBundleFailureCauseCore(
  result: unknown,
  fallback: PrototypeBricksRunFailureCause = 'unknown_failure',
): PrototypeBricksRunFailureCause {
  const record = objectValue(result);
  const code = cleanString(record.code)?.toLowerCase() || '';
  const message = cleanString(record.message)?.toLowerCase() || '';
  const detail = `${code} ${message}`;
  const stage = artifactStage(record);

  if (/failed to fetch|networkerror|network request|econnreset|socket hang up|connection (?:closed|reset)/i.test(detail)) return 'connection_interrupted';
  if (/html_artifact_invalid|source (?:artifact|file|document).*(?:invalid|missing|unavailable|could not)|no (?:generated )?html file/i.test(detail)) return 'stage_a_blocked';
  if (detail.includes('persist')) return 'saved_bricks_verification_failed';
  if (detail.includes('visual') || detail.includes('parity') || detail.includes('screenshot')) return fallback;
  if (detail.includes('stage b') || detail.includes('stage_b') || detail.includes('qa')) return 'stage_b_failed';
  if (detail.includes('baseline')) return 'baseline_insert_failed';
  if (detail.includes('convert') || detail.includes('handoff_runner')) return 'conversion_failed';
  if (stage === 'stage_b_final' || detail.includes('apply')) return 'final_apply_failed';
  return fallback;
}

function createEmptyRunSummary(
  payload: PixflowBricksAgentSessionPayload,
): PixflowHtmlToBricksRunSummary {
  const canonicalPath = cleanString(payload.sourceFile?.path || payload.sourceFile?.name);
  const buildInBricksRun = isBuildInBricksHtmlFirstPayload(payload);
  return {
    version: 1,
    lastCompletedPhase: canonicalPath ? 'source_persistence' : null,
    failingPhase: null,
    disposition: null,
    terminalClass: null,
    terminalCode: null,
    warningCodes: [],
    source: {
      inputKind: payload.conversionProfile === 'prototype_bricks'
        ? 'generated_document'
        : 'single_document',
      manifestVersion: null,
      canonicalPath,
      canonicalHash: null,
      cacheDecision: 'unavailable',
      acceptance: 'unknown',
      discoveryDurationMs: null,
      persistenceDurationMs: null,
    },
    sourcePreparation: { capabilities: [], totalDurationMs: 0 },
    preflight: {
      frameworkDurationMs: null,
      schemaDurationMs: null,
      runtimeKnowledgeDurationMs: null,
      totalDurationMs: null,
      fallbackUsed: [],
    },
    conversion: {
      durationMs: null,
      elementCount: null,
      globalClassCount: null,
      syntheticWrapperCount: null,
    },
    baselineApply: emptyApplySummary(),
    finalApply: emptyApplySummary(),
    ...(buildInBricksRun ? {} : {
      stageB: {
        invocationCount: 0,
        durationMs: 0,
        runner: null,
        disposition: 'not_run' as const,
      },
    }),
    visual: {
      captureCount: 0,
      settleDurationMs: 0,
      captureDurationMs: 0,
      comparisonDurationMs: 0,
      evidencePaths: [],
    },
    rollbacks: [],
    failure: null,
  };
}

function emptyApplySummary(): PixflowHtmlToBricksRunSummary['baselineApply'] {
  return {
    persistenceDurationMs: null,
    liveCanvasVerificationDurationMs: null,
    outcome: 'not_run',
  };
}

function applyRunObservation(
  summary: PixflowHtmlToBricksRunSummary,
  observation: PixflowHtmlToBricksRunObservation,
): void {
  if (observation.kind === 'source') {
    summary.source = {
      inputKind: observation.inputKind,
      manifestVersion: observation.manifestVersion,
      canonicalPath: observation.canonicalPath,
      canonicalHash: observation.canonicalHash,
      cacheDecision: observation.cacheDecision,
      acceptance: observation.acceptance,
      discoveryDurationMs: nonNegativeNumber(observation.discoveryDurationMs),
      persistenceDurationMs: nonNegativeNumber(observation.persistenceDurationMs),
    };
    summary.lastCompletedPhase = observation.acceptance === 'accepted'
      ? 'source_acceptance'
      : 'source_persistence';
    if (observation.acceptance === 'rejected') {
      summary.failingPhase = 'source_acceptance';
      summary.disposition = 'source_failed';
    }
    return;
  }
  if (observation.kind === 'source_preparation') {
    summary.sourcePreparation.capabilities = observation.capabilities.map((capability) => ({
      ...capability,
      durationMs: nonNegativeNumber(capability.durationMs),
    }));
    summary.sourcePreparation.totalDurationMs = summary.sourcePreparation.capabilities.reduce(
      (total, capability) => total + capability.durationMs,
      0,
    );
    summary.lastCompletedPhase = 'source_preparation';
    return;
  }
  if (observation.kind === 'preflight') {
    const frameworkDurationMs = nonNegativeNumber(observation.frameworkDurationMs);
    const schemaDurationMs = nonNegativeNumber(observation.schemaDurationMs);
    const runtimeKnowledgeDurationMs = nonNegativeNumber(observation.runtimeKnowledgeDurationMs);
    summary.preflight = {
      frameworkDurationMs,
      schemaDurationMs,
      runtimeKnowledgeDurationMs,
      totalDurationMs: frameworkDurationMs + schemaDurationMs + runtimeKnowledgeDurationMs,
      fallbackUsed: uniqueStrings(observation.fallbackUsed) as typeof observation.fallbackUsed,
    };
    summary.lastCompletedPhase = 'preflight';
    return;
  }
  if (observation.kind === 'conversion') {
    summary.conversion = {
      durationMs: nonNegativeNumber(observation.durationMs),
      elementCount: nonNegativeInteger(observation.elementCount),
      globalClassCount: nonNegativeInteger(observation.globalClassCount),
      syntheticWrapperCount: nonNegativeInteger(observation.syntheticWrapperCount),
    };
    summary.lastCompletedPhase = 'deterministic_conversion';
    return;
  }
  if (observation.kind === 'apply') {
    summary[observation.stage === 'baseline' ? 'baselineApply' : 'finalApply'] = {
      persistenceDurationMs: nonNegativeNumber(observation.persistenceDurationMs),
      liveCanvasVerificationDurationMs: nonNegativeNumber(observation.liveCanvasVerificationDurationMs),
      outcome: observation.outcome,
    };
    summary.lastCompletedPhase = observation.stage === 'baseline' ? 'baseline_apply' : 'final_apply';
    return;
  }
  if (observation.kind === 'stage_b') {
    // Build-in-Bricks summaries intentionally omit the legacy Stage B object.
    // This guard also protects compatibility readers from accidentally
    // materialising a Stage B section when a stale observation is replayed.
    if (!summary.stageB) return;
    summary.stageB.invocationCount += nonNegativeInteger(observation.modelInvocationCount) ?? 1;
    summary.stageB.durationMs += nonNegativeNumber(observation.durationMs);
    summary.stageB.runner = cleanString(observation.runner) ?? summary.stageB.runner;
    summary.stageB.disposition = observation.disposition;
    summary.lastCompletedPhase = 'stage_b';
    return;
  }
  if (observation.kind === 'visual') {
    summary.visual.captureCount += nonNegativeInteger(observation.captureCount) ?? 0;
    summary.visual.settleDurationMs += nonNegativeNumber(observation.settleDurationMs);
    summary.visual.captureDurationMs += nonNegativeNumber(observation.captureDurationMs);
    summary.visual.comparisonDurationMs += nonNegativeNumber(observation.comparisonDurationMs);
    summary.visual.evidencePaths = uniqueStrings([
      ...summary.visual.evidencePaths,
      ...observation.evidencePaths,
    ]);
    summary.lastCompletedPhase = 'visual_evidence';
    return;
  }
  if (observation.kind === 'rollback') {
    summary.rollbacks.push({
      reason: observation.reason,
      durationMs: nonNegativeNumber(observation.durationMs),
      outcome: observation.outcome,
    });
    summary.lastCompletedPhase = 'rollback';
    return;
  }
  summary.failure = {
    phase: observation.phase,
    code: observation.code,
    message: observation.message,
  };
  summary.failingPhase = observation.phase;
  summary.lastCompletedPhase = phaseBefore(observation.phase);
  summary.disposition = failureDispositionForPhase(observation.phase);
}

function updateSummaryFromInsert(
  summary: PixflowHtmlToBricksRunSummary,
  record: Record<string, unknown>,
  stage: string,
): void {
  const insertSummary = objectValue(record.summary);
  if (stage.includes('baseline')) {
    summary.conversion.elementCount = nonNegativeInteger(
      insertSummary.elementCount ?? insertSummary.total ?? insertSummary.inserted,
    ) ?? summary.conversion.elementCount;
    summary.conversion.globalClassCount = nonNegativeInteger(insertSummary.globalClassCount)
      ?? summary.conversion.globalClassCount;
  }
  const persisted = objectValue(record.persisted);
  if (Object.keys(persisted).length > 0) {
    const apply = stage === 'stage_b_final' ? summary.finalApply : summary.baselineApply;
    apply.outcome = persisted.ok === false || persisted.contentMatches === false ? 'failed' : 'verified';
    summary.lastCompletedPhase = stage === 'stage_b_final' ? 'final_apply' : 'baseline_apply';
  }
  const verification = objectValue(record.visualVerification);
  if (Object.keys(verification).length > 0) {
    summary.visual.captureCount = stringArray(verification.screenshots).length;
    const report = cleanString(verification.report);
    if (report) summary.visual.evidencePaths = uniqueStrings([...summary.visual.evidencePaths, report]);
  }
  const rollback = objectValue(record.rollback);
  if (Object.keys(rollback).length > 0) {
    summary.rollbacks.push({
      reason: cleanString(rollback.phase) || cleanString(record.code) || 'apply_failure',
      durationMs: 0,
      outcome: rollback.ok === true ? 'restored' : 'failed',
    });
  }
}

function completeRunSummary(
  summary: PixflowHtmlToBricksRunSummary,
  result: unknown,
  buildInBricksRun = false,
): void {
  const record = objectValue(result);
  const code = cleanString(record.code) || '';
  summary.lastCompletedPhase = 'terminal';
  summary.failingPhase = null;
  summary.failure = null;
  const qaAssessment = objectValue(record.qaAssessment);
  const qaStatus = cleanString(qaAssessment.status);
  if (qaStatus) {
    const status = ['passed', 'warning', 'failed', 'unavailable'].includes(qaStatus)
      ? qaStatus as NonNullable<PixflowHtmlToBricksRunSummary['qaAssessment']>['status']
      : 'warning';
    summary.qaAssessment = {
      status,
      warnings: stringArray(qaAssessment.warnings),
    };
  }
  // A Build execution is complete once conversion, persistence and insertion
  // succeed. QA remains an honest assessment and must not turn that execution
  // into a legacy Stage-B disposition or a failed terminal state.
  if (buildInBricksRun) {
    const qaWarning = summary.qaAssessment?.status === 'warning'
      || summary.qaAssessment?.status === 'failed'
      || code === 'bricks_handoff_applied_with_qa_warning';
    summary.disposition = 'baseline_applied';
    summary.terminalClass = qaWarning ? 'warning_success' : 'clean_success';
    summary.terminalCode = qaWarning
      ? 'html_to_bricks_applied_with_warning'
      : 'html_to_bricks_applied';
    if (qaWarning) {
      summary.warningCodes = uniqueStrings([
        ...summary.warningCodes,
        ...stringArray(summary.qaAssessment?.warnings),
        'post_conversion_qa_warning',
      ]);
    }
    return;
  }
  if (code === 'bricks_handoff_baseline_kept_with_stage_b_warning'
    || summary.stageB?.disposition === 'warning_baseline_kept') {
    if (!summary.stageB) return;
    summary.disposition = 'stage_b_warning_baseline_kept';
    summary.stageB.disposition = 'warning_baseline_kept';
    summary.terminalClass = 'warning_success';
    summary.terminalCode = 'html_to_bricks_applied_with_warning';
    summary.warningCodes = uniqueStrings([...summary.warningCodes, code || 'stage_b_warning_baseline_kept']);
  } else if (code === 'bricks_handoff_applied_with_visual_warning'
    || summary.stageB?.disposition === 'warning_final_kept') {
    if (!summary.stageB) return;
    summary.disposition = 'stage_b_warning_final_kept';
    summary.stageB.disposition = 'warning_final_kept';
    summary.terminalClass = 'warning_success';
    summary.terminalCode = 'html_to_bricks_applied_with_warning';
    summary.warningCodes = uniqueStrings([...summary.warningCodes, code || 'stage_b_warning_final_kept']);
  } else if (summary.stageB?.disposition === 'applied' || (summary.stageB?.invocationCount || 0) > 0) {
    if (!summary.stageB) return;
    summary.disposition = 'stage_b_applied';
    summary.stageB.disposition = 'applied';
    summary.terminalClass = 'clean_success';
    summary.terminalCode = 'html_to_bricks_applied';
  } else {
    summary.disposition = 'baseline_applied';
    summary.terminalClass = 'clean_success';
    summary.terminalCode = 'html_to_bricks_applied';
  }
}

function failRunSummary(
  summary: PixflowHtmlToBricksRunSummary,
  cause: PrototypeBricksRunFailureCause,
  message: string,
): void {
  if (cause === 'cancelled') {
    summary.disposition = 'cancelled';
    summary.terminalClass = 'cancelled';
    summary.terminalCode = 'html_to_bricks_cancelled';
    summary.failingPhase = summary.failingPhase || 'terminal';
  } else if (!summary.disposition) {
    const phase = failurePhaseForCause(cause);
    summary.failingPhase = phase;
    summary.lastCompletedPhase = phaseBefore(phase);
    summary.disposition = failureDispositionForPhase(phase);
    summary.terminalClass = 'failure';
    summary.terminalCode = phase === 'source_acceptance'
      ? 'html_to_bricks_source_failure'
      : 'html_to_bricks_structural_failure';
  }
  if (cause !== 'cancelled') {
    summary.terminalClass = 'failure';
    const failingPhase = summary.failingPhase || failurePhaseForCause(cause);
    summary.terminalCode = failingPhase === 'source_discovery'
      || failingPhase === 'source_persistence'
      || failingPhase === 'source_preparation'
      || failingPhase === 'source_acceptance'
      ? 'html_to_bricks_source_failure'
      : 'html_to_bricks_structural_failure';
  }
  if (!summary.failure && summary.failingPhase) {
    summary.failure = { phase: summary.failingPhase, code: cause, message };
  }
}

function failurePhaseForCause(cause: PrototypeBricksRunFailureCause): PixflowHtmlToBricksRunPhase {
  if (cause === 'stage_a_blocked') return 'source_acceptance';
  if (cause === 'conversion_failed') return 'deterministic_conversion';
  if (cause === 'baseline_insert_failed' || cause === 'saved_bricks_verification_failed') return 'baseline_apply';
  if (cause === 'stage_b_failed') return 'stage_b';
  if (cause === 'final_apply_failed') return 'final_apply';
  if (cause === 'visual_verification_failed') return 'visual_evidence';
  return 'terminal';
}

function failureDispositionForPhase(
  phase: PixflowHtmlToBricksRunPhase,
): PixflowHtmlToBricksRunSummary['disposition'] {
  if (phase === 'source_discovery' || phase === 'source_persistence' || phase === 'source_acceptance') {
    return 'source_failed';
  }
  if (phase === 'source_preparation' || phase === 'visual_evidence') return 'source_evidence_failed';
  if (phase === 'deterministic_conversion' || phase === 'baseline_apply' || phase === 'preflight') {
    return 'baseline_failed';
  }
  return 'structural_failure';
}

function phaseBefore(phase: PixflowHtmlToBricksRunPhase): PixflowHtmlToBricksRunPhase | null {
  const phases: PixflowHtmlToBricksRunPhase[] = [
    'source_discovery',
    'source_persistence',
    'source_preparation',
    'source_acceptance',
    'preflight',
    'deterministic_conversion',
    'baseline_apply',
    'stage_b',
    'final_apply',
    'visual_evidence',
    'rollback',
    'terminal',
  ];
  const index = phases.indexOf(phase);
  return index > 0 ? phases[index - 1]! : null;
}

function nonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function refreshDurations(bundle: PrototypeBricksRunBundle): void {
  setDuration(bundle, 'routeContextFetch', 'route_context_fetch_start', 'route_context_fetch_end');
  setDuration(
    bundle,
    'handoffRouteContextFetch',
    'handoff_route_context_fetch_start',
    'handoff_route_context_fetch_end',
  );
  setDuration(bundle, 'promptBuild', 'prompt_build_start', 'prompt_build_end');
  setDuration(bundle, 'sourceGeneration', 'stage_a_started', 'stage_a_finished');
  if (bundle.pipeline === 'build-in-bricks') {
    setDuration(bundle, 'sourceGeneration', 'source_generation_started', 'source_generation_finished');
  } else {
    setDuration(bundle, 'stageA', 'stage_a_started', 'stage_a_finished');
  }
  setDuration(bundle, 'screenshotCapture', 'screenshot_capture_start', 'screenshot_capture_end');
  setDuration(bundle, 'conversion', 'conversion_start', 'conversion_end');
  setDuration(bundle, 'baselineApply', 'baseline_apply_started', 'baseline_apply_finished');
  if (bundle.pipeline !== 'build-in-bricks') {
    setDuration(bundle, 'stageB', 'stage_b_started', 'stage_b_finished');
  }
  setDuration(bundle, 'finalApply', 'final_apply_started', 'final_apply_finished');
  const end = bundle.finishedAt ?? bundle.marks.handoff_finished;
  if (end !== undefined) bundle.durationsMs.total = Math.max(0, end - bundle.startedAt);
}

function setDuration(
  bundle: PrototypeBricksRunBundle,
  key: keyof PrototypeBricksRunBundle['durationsMs'],
  startMark: PrototypeBricksRunMark,
  endMark: PrototypeBricksRunMark,
): void {
  const start = bundle.marks[startMark];
  const end = bundle.marks[endMark];
  if (start === undefined || end === undefined) return;
  bundle.durationsMs[key] = Math.max(0, end - start);
}

function updateResult(bundle: PrototypeBricksRunBundle, record: Record<string, unknown>): void {
  bundle.result.code = cleanString(record.code) ?? bundle.result.code;
  bundle.result.message = cleanString(record.message) ?? bundle.result.message;
  if (Array.isArray(record.runtimeDiagnostics)) {
    bundle.result.runtimeDiagnostics = record.runtimeDiagnostics
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .slice(-200);
  }
  const qaAssessment = objectValue(record.qaAssessment);
  const qaStatus = cleanString(qaAssessment.status);
  if (qaStatus) {
    const status = ['passed', 'warning', 'failed', 'unavailable'].includes(qaStatus)
      ? qaStatus as NonNullable<PixflowHtmlToBricksRunSummary['qaAssessment']>['status']
      : 'warning';
    bundle.summary.qaAssessment = {
      status,
      warnings: stringArray(qaAssessment.warnings),
    };
  }
  const persisted = objectValue(record.persisted);
  if (Object.keys(persisted).length > 0) {
    bundle.result.persisted = persisted.ok !== false;
    bundle.result.savedContent = {
      postId: positiveInteger(persisted.postId) ?? positiveInteger(record.postId),
      area: cleanString(persisted.area),
      expectedCount: nonNegativeInteger(persisted.expectedCount),
      actualCount: nonNegativeInteger(persisted.actualCount),
      expectedElementIds: stringArray(persisted.expectedIds),
      storedElementIds: stringArray(persisted.storedIds),
      missingElementIds: stringArray(persisted.missingIds),
      extraElementIds: stringArray(persisted.extraIds),
      expectedHash: cleanString(persisted.expectedHash),
      actualHash: cleanString(persisted.actualHash),
      matches: typeof persisted.contentMatches === 'boolean'
        ? persisted.contentMatches
        : persisted.ok !== false,
    };
  }
}

function updateSideBySideEvidence(
  bundle: PrototypeBricksRunBundle,
  record: Record<string, unknown>,
): void {
  const verification = objectValue(record.visualVerification);
  if (Object.keys(verification).length === 0) return;
  const screenshots = Array.isArray(verification.screenshots)
    ? uniqueStrings(verification.screenshots)
    : [];
  const report = cleanString(verification.report);
  bundle.evidence.sideBySide = {
    screenshots,
    reports: report ? [report] : [],
    qualityPassed: typeof verification.qualityPassed === 'boolean'
      ? verification.qualityPassed
      : null,
  };
}

function collectTouched(
  bundle: PrototypeBricksRunBundle,
  record: Record<string, unknown>,
  replaceMutationIds = false,
): void {
  const postId = positiveInteger(record.postId);
  if (postId && !bundle.touched.postIds.includes(postId)) bundle.touched.postIds.push(postId);

  const handoff = objectValue(record.handoffArtifacts);
  const handoffId = cleanString(handoff.handoffId);
  if (handoffId && !bundle.touched.handoffIds.includes(handoffId)) {
    bundle.touched.handoffIds.push(handoffId);
  }
  const files = Array.isArray(handoff.files) ? handoff.files : [];
  bundle.touched.artifactFiles = uniqueStrings([
    ...bundle.touched.artifactFiles,
    ...files.map((file) => cleanString(file) || ''),
  ]);

  const changedIds = objectValue(record.changedIds);
  bundle.touched.elementIds = uniqueStrings([
    ...(replaceMutationIds ? [] : bundle.touched.elementIds),
    ...stringArray(changedIds.elementIds),
  ]);
  bundle.touched.globalClassIds = uniqueStrings([
    ...(replaceMutationIds ? [] : bundle.touched.globalClassIds),
    ...stringArray(changedIds.globalClassIds),
  ]);
  bundle.touched.templateIds = uniqueNumbers([
    ...(replaceMutationIds ? [] : bundle.touched.templateIds),
    ...numberArray(changedIds.templateIds),
  ]);
  bundle.touched.mediaAttachmentIds = uniqueNumbers([
    ...(replaceMutationIds ? [] : bundle.touched.mediaAttachmentIds),
    ...numberArray(changedIds.mediaAttachmentIds),
  ]);
}

function artifactStage(record: Record<string, unknown>): string {
  const request = objectValue(record.applyRequest);
  const direct = cleanString(request.artifactStage);
  if (direct) return direct;
  const handoff = objectValue(record.handoffArtifacts);
  return cleanString(handoff.artifactStage) || '';
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? uniqueStrings(value.map((item) => cleanString(item) || ''))
    : [];
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map(positiveInteger).filter((item): item is number => item !== null)
    : [];
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value > 0)));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeStageAMarks(
  lifecycle: PixflowBricksAgentSessionPayload['stageALifecycle'],
): Partial<Record<PrototypeBricksRunMark, number>> {
  if (!lifecycle) return {};
  return Object.fromEntries(
    Object.entries(lifecycle).filter((entry): entry is [PrototypeBricksRunMark, number] => (
      Number.isFinite(entry[1]) && Number(entry[1]) > 0
    )),
  );
}

/** Canonical ordinary Build failure classification boundary. */
export function inferBuildInBricksFailureCause(
  result: unknown,
  fallback: PrototypeBricksRunFailureCause = 'unknown_failure',
): PrototypeBricksRunFailureCause {
  return inferRunBundleFailureCauseCore(result, fallback);
}

/** Historical compatibility classifier for Prototype/Clone readers. */
export function inferPrototypeBricksFailureCause(
  result: unknown,
  fallback: PrototypeBricksRunFailureCause = 'unknown_failure',
): PrototypeBricksRunFailureCause {
  return inferRunBundleFailureCauseCore(result, fallback);
}

/**
 * Canonical ordinary Build entry. The implementation is shared with the
 * historical HTML-to-Bricks/Prototype bundle machinery, but modern Build
 * callers enter through this semantic boundary rather than a Stage-A-named
 * runtime function.
 */
export function createBuildInBricksRunBundleTracker(
  payload: PixflowBricksAgentSessionPayload,
  handoffStartedAt = Date.now(),
): PrototypeBricksRunBundleTracker {
  return createRunBundleTrackerCore(payload, handoffStartedAt);
}

/** Historical compatibility entry for Prototype/Clone and persisted readers. */
export function createPrototypeBricksRunBundleTracker(
  payload: PixflowBricksAgentSessionPayload,
  handoffStartedAt = Date.now(),
): PrototypeBricksRunBundleTracker {
  return createRunBundleTrackerCore(payload, handoffStartedAt);
}

function buildLifecycleMarks(
  lifecycle: PixflowBuildInBricksSourceLifecycle,
): Partial<Record<PrototypeBricksRunMark, number>> {
  // The run bundle still uses the shared transport mark union for historical
  // readers. Build lifecycle values are already semantic and must not be
  // projected back to stage_a_* keys in new ordinary Build bundles.
  return Object.fromEntries(
    Object.entries(lifecycle).filter((entry): entry is [PrototypeBricksRunMark, number] => (
      Number.isFinite(entry[1]) && Number(entry[1]) > 0
    )),
  );
}
