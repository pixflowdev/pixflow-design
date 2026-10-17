import { describe, expect, it } from 'vitest';
import type { PixflowBricksAgentSessionPayload } from '../../src/pixflow/bricks-agent-session';
import {
  createBuildInBricksRunBundleTracker,
  createPrototypeBricksRunBundleTracker,
  inferBuildInBricksFailureCause,
  inferPrototypeBricksFailureCause,
} from '../../src/pixflow/prototype-bricks-run-bundle';

function payload(): PixflowBricksAgentSessionPayload {
  return {
    version: 2,
    createdAt: 1,
    source: 'pixflow-design-workspace',
    reason: 'handoff-to-bricks',
    handoffState: 'planning',
    projectId: 'project-1',
    activeFileName: 'index.html',
    session: {
      id: 'session-1',
      createdAt: 1,
      updatedAt: 1,
      status: 'handoff-ready',
      mode: 'design',
      runnerId: 'codex',
      selectedModel: 'default',
      reasoning: 'default',
      error: null,
      messages: [],
    },
    targetContext: {
      postId: 123,
      postTitle: 'Target',
      area: 'content',
      elementCount: null,
      topSections: null,
      selectedId: null,
    },
    workspaceItem: null,
    workspaceItems: [],
    sourceFile: {
      name: 'index.html',
      path: 'drafts/index.html',
      kind: 'file',
      mime: 'text/html',
      artifactKind: null,
      size: 100,
      mtime: 1,
      title: null,
      identifier: null,
    },
    handoffFiles: [],
    sourceAvailable: true,
    htmlCandidate: true,
    projectFileCount: 3,
    htmlFileCount: 1,
    draftPresent: true,
    draftPreview: '',
    sectionCount: null,
    stageASource: {
      format: 'split_html_css_js',
      sourcePath: 'drafts/index.html',
      compiledPath: 'drafts/compiled.html',
      htmlPath: 'drafts/index.html',
      cssPath: 'drafts/styles.css',
      jsPath: 'drafts/script.js',
    },
  };
}

describe('Prototype Bricks run bundle', () => {
  it('exposes a semantic Build tracker and failure classifier without Stage-A runtime entry names', () => {
    const buildPayload = payload();
    buildPayload.sourceContract = 'build-in-bricks-html-first';
    buildPayload.pipelineId = 'build-in-bricks';
    buildPayload.themeStylePolicy = 'inherit_effective';
    const tracker = createBuildInBricksRunBundleTracker(buildPayload, 100);
    expect(tracker.snapshot().pipeline).toBe('build-in-bricks');
    expect(inferBuildInBricksFailureCause({ message: 'Build source artifact missing' })).toBe('stage_a_blocked');
    expect(inferPrototypeBricksFailureCause({ message: 'Build source artifact missing' })).toBe('stage_a_blocked');
  });

  it('records a certified Stage B pass without inventing a model invocation', () => {
    const tracker = createPrototypeBricksRunBundleTracker(payload(), 100);
    tracker.recordObservation({
      kind: 'stage_b',
      invocationId: 'stage-b-certified',
      modelInvocationCount: 0,
      runner: 'certified_fast_path',
      durationMs: 15,
      disposition: 'applied',
    });
    tracker.succeed({ ok: true, code: 'bricks_handoff_applied' }, 120);

    expect(tracker.snapshot().summary).toMatchObject({
      disposition: 'stage_b_applied',
      stageB: { invocationCount: 0, runner: 'certified_fast_path' },
    });
  });

  it('classifies a dropped browser-to-bridge request as resumable connection interruption', () => {
    expect(inferPrototypeBricksFailureCause({ message: 'TypeError: Failed to fetch' })).toBe('connection_interrupted');
  });

  it('records baseline, Stage B, final apply, touched files, and deterministic durations', () => {
    const tracker = createPrototypeBricksRunBundleTracker(payload(), 100);
    tracker.mark('first_model_output', 110);
    tracker.recordInsert({
      ok: true,
      postId: 123,
      applyRequest: { artifactStage: 'pre_stage_b_baseline_preview' },
      handoffArtifacts: {
        handoffId: 'baseline-1',
        files: ['baseline.json'],
      },
      changedIds: {
        elementIds: ['baseline-el'],
        globalClassIds: ['baseline-class'],
        templateIds: [111],
        mediaAttachmentIds: [222],
      },
    }, 120);
    tracker.succeed({
      ok: true,
      code: 'bricks_handoff_applied',
      message: 'Applied',
      postId: 123,
      changedIds: {
        elementIds: ['el-a', 'el-b'],
        globalClassIds: ['class-a'],
        templateIds: [456],
        mediaAttachmentIds: [789],
      },
      persisted: {
        ok: true,
        contentMatches: true,
        postId: 123,
        area: 'content',
        expectedCount: 2,
        actualCount: 2,
        expectedIds: ['el-a', 'el-b'],
        storedIds: ['el-a', 'el-b'],
        missingIds: [],
        extraIds: [],
        expectedHash: 'expected-hash',
        actualHash: 'expected-hash',
      },
      applyRequest: { artifactStage: 'stage_b_final' },
      handoffArtifacts: {
        handoffId: 'final-1',
        files: ['bricks-result.json', 'stage-b-qa.json'],
      },
      visualVerification: {
        ok: true,
        screenshots: [
          'stage-b/screenshots/frontend-desktop.png',
          'stage-b/screenshots/frontend-mobile.png',
        ],
        report: 'stage-b/reports/frontend-visual-evidence.json',
        qualityPassed: null,
      },
    }, 180);

    expect(tracker.snapshot()).toMatchObject({
      version: 2,
      status: 'succeeded',
      startedAt: 100,
      finishedAt: 180,
      durationsMs: {
        baselineApply: 0,
        stageB: 60,
        finalApply: 0,
        total: 80,
      },
      result: {
        code: 'bricks_handoff_applied',
        message: 'Applied',
        persisted: true,
        savedContent: {
          postId: 123,
          area: 'content',
          expectedCount: 2,
          actualCount: 2,
          expectedElementIds: ['el-a', 'el-b'],
          storedElementIds: ['el-a', 'el-b'],
          missingElementIds: [],
          extraElementIds: [],
          expectedHash: 'expected-hash',
          actualHash: 'expected-hash',
          matches: true,
        },
      },
      touched: {
        postIds: [123],
        handoffIds: ['baseline-1', 'final-1'],
        artifactFiles: ['baseline.json', 'bricks-result.json', 'stage-b-qa.json'],
        elementIds: ['el-a', 'el-b'],
        globalClassIds: ['class-a'],
        templateIds: [456],
        mediaAttachmentIds: [789],
      },
      failure: null,
      evidence: {
        sideBySide: {
          screenshots: [
            'stage-b/screenshots/frontend-desktop.png',
            'stage-b/screenshots/frontend-mobile.png',
          ],
          reports: ['stage-b/reports/frontend-visual-evidence.json'],
          qualityPassed: null,
        },
      },
    });
  });

  it('classifies saved-content verification and Stage B failures', () => {
    expect(inferPrototypeBricksFailureCause({
      code: 'HTML_ARTIFACT_INVALID',
      message: 'The source artifact is invalid.',
    })).toBe('stage_a_blocked');
    expect(inferPrototypeBricksFailureCause({
      code: 'bricks_handoff_not_persisted',
    })).toBe('saved_bricks_verification_failed');
    expect(inferPrototypeBricksFailureCause({
      code: 'bricks_handoff_qa_failed',
    })).toBe('stage_b_failed');
    expect(inferPrototypeBricksFailureCause({
      code: 'bricks_handoff_stage_b_incomplete',
      message: 'The baseline preview was inserted, but Stage B did not return a final result.',
    })).toBe('stage_b_failed');
    expect(inferPrototypeBricksFailureCause({
      code: 'bricks_handoff_visual_parity_failed',
    })).toBe('unknown_failure');
  });

  it('carries authoritative Stage A marks into the full run without overwriting first output', () => {
    const input = payload();
    input.stageALifecycle = {
      stage_a_started: 10,
      route_context_fetch_start: 11,
      route_context_fetch_end: 21,
      prompt_build_start: 22,
      prompt_build_end: 27,
      first_model_output: 40,
      first_artifact_write: 60,
      screenshot_capture_start: 70,
      screenshot_capture_end: 90,
      stage_a_finished: 100,
    };
    input.stageAEvidence = {
      screenshots: [
        'stage-a/screenshots/desktop.png',
        'stage-a/screenshots/mobile.png',
      ],
      reports: {
        promptBundle: 'stage-a/reports/prompt-bundle.json',
        contextCompleteness: 'stage-a/reports/context-completeness.json',
        designPlan: 'stage-a/reports/design-plan.json',
        qualityGate: 'stage-a/reports/quality-gate-report.json',
      },
      visualGate: {
        attempted: true,
        completed: true,
        screenshotCount: 2,
        repaired: false,
      },
      qualityGate: { ok: true, status: 'pass' },
    };
    const tracker = createPrototypeBricksRunBundleTracker(input, 110);
    tracker.mark('first_model_output', 120);

    expect(tracker.snapshot()).toMatchObject({
      startedAt: 10,
      marks: {
        stage_a_started: 10,
        handoff_started: 110,
        first_model_output: 40,
      },
      durationsMs: {
        routeContextFetch: 10,
        promptBuild: 5,
        screenshotCapture: 20,
        stageA: 90,
      },
      evidence: {
        stageA: {
          screenshots: [
            'stage-a/screenshots/desktop.png',
            'stage-a/screenshots/mobile.png',
          ],
          reports: [
            'stage-a/reports/prompt-bundle.json',
            'stage-a/reports/context-completeness.json',
            'stage-a/reports/design-plan.json',
            'stage-a/reports/quality-gate-report.json',
          ],
          visualGate: {
            completed: true,
            screenshotCount: 2,
          },
          qualityGate: { ok: true, status: 'pass' },
        },
        sideBySide: null,
      },
    });
  });

  it('uses canonical Build lifecycle and evidence fields for ordinary Build bundles', () => {
    const input = payload();
    input.pipelineId = 'build-in-bricks';
    input.sourceContract = 'build-in-bricks-html-first';
    input.buildSource = {
      format: 'split_html_css_js',
      sourcePath: 'build-source/source/index.html',
      compiledPath: 'build-source/source/index.html',
      htmlPath: 'build-source/source/index.html',
      cssPath: 'build-source/source/styles.css',
      jsPath: 'build-source/source/script.js',
    };
    input.buildLifecycle = {
      source_generation_started: 10,
      prompt_build_start: 11,
      prompt_build_end: 15,
      first_model_output: 20,
      source_generation_finished: 40,
    };
    input.buildEvidence = {
      screenshots: ['build-source/captures/desktop.png'],
      reports: {
        promptBundle: 'build-source/reports/prompt-bundle.json',
        contextCompleteness: 'build-source/reports/context.json',
        designPlan: 'build-source/reports/design-plan.json',
        qualityGate: 'build-source/reports/quality-gate.json',
      },
      visualGate: { attempted: true, completed: true, screenshotCount: 1, repaired: false },
      qualityGate: { ok: true },
    };
    const tracker = createPrototypeBricksRunBundleTracker(input, 100);
    const snapshot = tracker.snapshot();

    expect(snapshot.pipeline).toBe('build-in-bricks');
    expect(snapshot.startedAt).toBe(10);
    expect(snapshot.marks).toMatchObject({
      source_generation_started: 10,
      prompt_build_start: 11,
      source_generation_finished: 40,
    });
    expect(snapshot.marks).not.toHaveProperty('stage_a_started');
    expect(snapshot.source.buildSource).toEqual(input.buildSource);
    expect(snapshot.evidence.buildSource).toMatchObject({
      screenshots: ['build-source/captures/desktop.png'],
      reports: [
        'build-source/reports/prompt-bundle.json',
        'build-source/reports/context.json',
        'build-source/reports/design-plan.json',
        'build-source/reports/quality-gate.json',
      ],
    });
    expect(snapshot.evidence).not.toHaveProperty('stageA');
    expect(snapshot.durationsMs.sourceGeneration).toBe(30);
  });

  it('completes an ordinary Build bundle without requiring a legacy Stage B summary', () => {
    const input = payload();
    input.pipelineId = 'build-in-bricks';
    input.sourceContract = 'build-in-bricks-html-first';
    input.buildSource = {
      format: 'split_html_css_js',
      sourcePath: 'build-source/source/index.html',
      compiledPath: 'build-source/source/index.html',
      htmlPath: 'build-source/source/index.html',
      cssPath: 'build-source/source/styles.css',
      jsPath: 'build-source/source/script.js',
    };
    input.buildLifecycle = {
      source_generation_started: 10,
      source_generation_finished: 40,
    };
    input.buildEvidence = {
      screenshots: [],
      reports: {
        promptBundle: null,
        contextCompleteness: null,
        designPlan: null,
        qualityGate: null,
      },
      visualGate: null,
      qualityGate: { ok: true },
    };

    const tracker = createPrototypeBricksRunBundleTracker(input, 100);
    tracker.succeed({
      ok: true,
      code: 'bricks_handoff_applied',
      persisted: { ok: true, contentMatches: true },
    }, 120);

    const snapshot = tracker.snapshot();
    expect(snapshot.status).toBe('succeeded');
    expect(snapshot.summary.disposition).toBe('baseline_applied');
    expect(snapshot.summary.terminalCode).toBe('html_to_bricks_applied');
    expect(snapshot.summary).not.toHaveProperty('stageB');
  });

  it('summarizes source, preparation, preflight, converter, model, visual, and rollback costs', () => {
    const tracker = createPrototypeBricksRunBundleTracker(payload(), 100);
    tracker.recordObservation({
      kind: 'source',
      inputKind: 'single_document',
      manifestVersion: 1,
      canonicalPath: 'drafts/index.html',
      canonicalHash: 'sha256:source',
      cacheDecision: 'miss',
      acceptance: 'accepted',
      discoveryDurationMs: 4,
      persistenceDurationMs: 6,
    });
    tracker.recordObservation({
      kind: 'source_preparation',
      capabilities: [
        { name: 'validation', status: 'completed', durationMs: 2 },
        { name: 'sanitization', status: 'completed', durationMs: 3 },
        { name: 'resource_materialization', status: 'skipped', durationMs: 0 },
        { name: 'sandbox_settle', status: 'completed', durationMs: 8 },
        { name: 'dom_style_capture', status: 'completed', durationMs: 12, evidencePath: 'evidence/dom.json', evidenceHash: 'sha256:dom' },
        { name: 'responsive_capture', status: 'completed', durationMs: 14 },
      ],
    });
    tracker.recordObservation({
      kind: 'preflight',
      frameworkDurationMs: 7,
      schemaDurationMs: 9,
      runtimeKnowledgeDurationMs: 11,
      fallbackUsed: ['runtime_knowledge'],
    });
    tracker.recordObservation({
      kind: 'conversion',
      durationMs: 40,
      elementCount: 18,
      globalClassCount: 5,
      syntheticWrapperCount: 1,
    });
    tracker.recordObservation({
      kind: 'apply',
      stage: 'baseline',
      persistenceDurationMs: 20,
      liveCanvasVerificationDurationMs: 10,
      outcome: 'verified',
    });
    tracker.recordObservation({
      kind: 'stage_b',
      invocationId: 'stage-b-1',
      runner: 'codex',
      durationMs: 90,
      disposition: 'warning_baseline_kept',
    });
    tracker.recordObservation({
      kind: 'visual',
      captureCount: 2,
      settleDurationMs: 1_200,
      captureDurationMs: 50,
      comparisonDurationMs: 30,
      evidencePaths: ['evidence/visual.json'],
    });
    tracker.recordObservation({
      kind: 'rollback',
      reason: 'unsafe_stage_b',
      durationMs: 15,
      outcome: 'restored',
    });
    tracker.succeed({
      ok: true,
      code: 'bricks_handoff_baseline_kept_with_stage_b_warning',
      message: 'Baseline kept.',
    }, 250);

    expect(tracker.snapshot().summary).toMatchObject({
      lastCompletedPhase: 'terminal',
      failingPhase: null,
      disposition: 'stage_b_warning_baseline_kept',
      terminalClass: 'warning_success',
      terminalCode: 'html_to_bricks_applied_with_warning',
      warningCodes: ['bricks_handoff_baseline_kept_with_stage_b_warning'],
      source: {
        inputKind: 'single_document',
        canonicalHash: 'sha256:source',
        acceptance: 'accepted',
      },
      sourcePreparation: {
        totalDurationMs: 39,
      },
      preflight: {
        totalDurationMs: 27,
        fallbackUsed: ['runtime_knowledge'],
      },
      conversion: {
        durationMs: 40,
        elementCount: 18,
      },
      baselineApply: {
        persistenceDurationMs: 20,
        liveCanvasVerificationDurationMs: 10,
      },
      stageB: {
        invocationCount: 1,
        durationMs: 90,
        runner: 'codex',
        disposition: 'warning_baseline_kept',
      },
      visual: {
        captureCount: 2,
        settleDurationMs: 1_200,
      },
      rollbacks: [{ reason: 'unsafe_stage_b', outcome: 'restored' }],
    });
  });

  it('retains the exact failing phase and does not invent downstream work', () => {
    const tracker = createPrototypeBricksRunBundleTracker(payload(), 100);
    tracker.recordObservation({
      kind: 'failure',
      phase: 'source_acceptance',
      code: 'HTML_ARTIFACT_INVALID',
      message: 'Source was prose.',
    });
    tracker.fail('stage_a_blocked', 'Source was prose.', undefined, 110);

    expect(tracker.snapshot().summary).toMatchObject({
      lastCompletedPhase: 'source_preparation',
      failingPhase: 'source_acceptance',
      disposition: 'source_failed',
      terminalClass: 'failure',
      terminalCode: 'html_to_bricks_source_failure',
      stageB: { invocationCount: 0 },
      failure: {
        code: 'HTML_ARTIFACT_INVALID',
        phase: 'source_acceptance',
      },
    });
    expect(tracker.snapshot().marks.conversion_start).toBeUndefined();
    expect(tracker.snapshot().marks.stage_b_started).toBeUndefined();
  });
});
