import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeProjectTextFiles } from '../../src/providers/registry';
import { writeBuildInBricksScratchProjectTextFiles } from '../../src/pixflow/build-in-bricks-scratch-project-files';
import type { PrototypeBricksRunBundle } from '../../src/pixflow/prototype-bricks-run-bundle';
import {
  persistBuildInBricksRunBundle,
  persistPrototypeBricksRunBundle,
} from '../../src/pixflow/prototype-bricks-run-bundle-persistence';

vi.mock('../../src/providers/registry', () => ({
  writeProjectTextFiles: vi.fn(),
}));
vi.mock('../../src/pixflow/build-in-bricks-scratch-project-files', () => ({
  writeBuildInBricksScratchProjectTextFiles: vi.fn(),
}));

const writeFilesMock = vi.mocked(writeProjectTextFiles);
const writeScratchFilesMock = vi.mocked(writeBuildInBricksScratchProjectTextFiles);

function bundle(): PrototypeBricksRunBundle {
  return {
    version: 2,
    runId: 'prototype-bricks-session-1-100',
    projectId: 'project-1',
    sessionId: 'session-1',
    status: 'succeeded',
    startedAt: 100,
    finishedAt: 200,
    marks: {
      handoff_started: 100,
      handoff_finished: 200,
    },
    durationsMs: { total: 100 },
    summary: {
      version: 1,
      lastCompletedPhase: 'terminal',
      failingPhase: null,
      disposition: 'stage_b_applied',
      terminalClass: 'clean_success',
      terminalCode: 'html_to_bricks_applied',
      warningCodes: [],
      source: {
        inputKind: 'single_document',
        manifestVersion: null,
        canonicalPath: 'index.html',
        canonicalHash: 'sha256:source',
        cacheDecision: 'bypass',
        acceptance: 'accepted',
        discoveryDurationMs: 2,
        persistenceDurationMs: 3,
      },
      sourcePreparation: { capabilities: [], totalDurationMs: 0 },
      preflight: {
        frameworkDurationMs: 1,
        schemaDurationMs: 1,
        runtimeKnowledgeDurationMs: 1,
        totalDurationMs: 3,
        fallbackUsed: [],
      },
      conversion: { durationMs: 10, elementCount: 1, globalClassCount: 1, syntheticWrapperCount: 0 },
      baselineApply: { persistenceDurationMs: 5, liveCanvasVerificationDurationMs: 2, outcome: 'verified' },
      finalApply: { persistenceDurationMs: 5, liveCanvasVerificationDurationMs: 2, outcome: 'verified' },
      stageB: { invocationCount: 1, durationMs: 20, runner: 'codex', disposition: 'applied' },
      visual: { captureCount: 0, settleDurationMs: 0, captureDurationMs: 0, comparisonDurationMs: 0, evidencePaths: [] },
      rollbacks: [],
      failure: null,
    },
    source: {
      activeFileName: 'index.html',
      stageA: null,
      handoffFiles: ['index.html'],
    },
    target: {
      postId: 123,
      postTitle: 'Target',
      area: 'content',
    },
    touched: {
      postIds: [123],
      handoffIds: ['handoff-final'],
      artifactFiles: ['pixflow/handoffs/bricks/handoff-final/bricks-result.json'],
      elementIds: ['element-1'],
      globalClassIds: ['class-1'],
      templateIds: [456],
      mediaAttachmentIds: [789],
    },
    result: {
      code: 'bricks_handoff_applied',
      message: 'Applied',
      persisted: true,
      savedContent: {
        postId: 123,
        area: 'content',
        expectedCount: 1,
        actualCount: 1,
        expectedElementIds: ['element-1'],
        storedElementIds: ['element-1'],
        missingElementIds: [],
        extraElementIds: [],
        expectedHash: 'hash-1',
        actualHash: 'hash-1',
        matches: true,
      },
      runtimeDiagnostics: [],
    },
    evidence: {
      stageA: {
        screenshots: ['stage-a/screenshots/desktop.png'],
        reports: ['stage-a/reports/quality-gate-report.json'],
        visualGate: { completed: true, screenshotCount: 2 },
        qualityGate: { ok: true },
      },
      sideBySide: null,
    },
    archive: {
      status: 'pending',
      files: [],
      message: null,
    },
    failure: null,
  };
}

describe('persistPrototypeBricksRunBundle', () => {
  beforeEach(() => {
    writeFilesMock.mockReset();
  });

  it('writes the terminal bundle to the handoff folder, run index, and latest pointer', async () => {
    writeFilesMock.mockResolvedValue({ ok: true, files: [] });

    const result = await persistPrototypeBricksRunBundle('project-1', bundle());

    expect(result.ok).toBe(true);
    expect(result.bundle.archive).toMatchObject({
      status: 'saved',
      files: [
        'pixflow/handoffs/bricks/runs/prototype-bricks-session-1-100.json',
        'pixflow/handoffs/bricks/runs/prototype-bricks-session-1-100-evidence.json',
        'pixflow/handoffs/bricks/runs/prototype-bricks-session-1-100-summary.json',
        'pixflow/handoffs/bricks/latest-run.json',
        'pixflow/handoffs/bricks/handoff-final/prototype-bricks-run-bundle.json',
        'pixflow/handoffs/bricks/handoff-final/prototype-bricks-evidence-manifest.json',
        'pixflow/handoffs/bricks/handoff-final/prototype-bricks-run-summary.json',
        'pixflow/handoffs/bricks/handoff-final/bricks-result.json',
      ],
    });
    expect(writeFilesMock).toHaveBeenCalledTimes(1);
    expect(writeFilesMock.mock.calls[0]?.[1].map((file) => file.name)).toEqual([
      'pixflow/handoffs/bricks/runs/prototype-bricks-session-1-100.json',
      'pixflow/handoffs/bricks/runs/prototype-bricks-session-1-100-evidence.json',
      'pixflow/handoffs/bricks/runs/prototype-bricks-session-1-100-summary.json',
      'pixflow/handoffs/bricks/handoff-final/prototype-bricks-run-bundle.json',
      'pixflow/handoffs/bricks/handoff-final/prototype-bricks-evidence-manifest.json',
      'pixflow/handoffs/bricks/handoff-final/prototype-bricks-run-summary.json',
      'pixflow/handoffs/bricks/latest-run.json',
    ]);
    const evidenceFile = writeFilesMock.mock.calls[0]?.[1].find(
      (file) => file.name.endsWith('prototype-bricks-evidence-manifest.json'),
    );
    expect(JSON.parse(evidenceFile?.content || '{}')).toMatchObject({
      schema: 'pixflow.prototype_bricks.run_evidence.v1',
      runId: 'prototype-bricks-session-1-100',
      handoffId: 'handoff-final',
      evidence: {
        stageA: {
          screenshots: ['stage-a/screenshots/desktop.png'],
          qualityGate: { ok: true },
        },
        sideBySide: null,
      },
      touched: {
        elementIds: ['element-1'],
        globalClassIds: ['class-1'],
        templateIds: [456],
        mediaAttachmentIds: [789],
      },
      result: {
        savedContent: {
          postId: 123,
          expectedHash: 'hash-1',
          actualHash: 'hash-1',
          matches: true,
        },
      },
    });
    const summaryFile = writeFilesMock.mock.calls[0]?.[1].find(
      (file) => file.name.endsWith('prototype-bricks-run-summary.json'),
    );
    expect(JSON.parse(summaryFile?.content || '{}')).toMatchObject({
      schema: 'pixflow.html_to_bricks.run_summary.v1',
      runId: 'prototype-bricks-session-1-100',
      summary: {
        lastCompletedPhase: 'terminal',
        disposition: 'stage_b_applied',
        stageB: { invocationCount: 1 },
      },
    });
  });

  it('returns archive diagnostics without changing the successful Bricks result', async () => {
    writeFilesMock.mockResolvedValue({
      ok: false,
      message: 'Project file archive unavailable',
    });

    const result = await persistPrototypeBricksRunBundle('project-1', bundle());

    expect(result.ok).toBe(false);
    expect(result.bundle.status).toBe('succeeded');
    expect(result.bundle.result.persisted).toBe(true);
    expect(result.bundle.archive).toEqual({
      status: 'failed',
      files: [],
      message: 'Project file archive unavailable',
    });
  });

  it('archives an early failure without a handoff-specific folder', async () => {
    writeFilesMock.mockResolvedValue({ ok: true, files: [] });
    const failed = bundle();
    failed.status = 'failed';
    failed.touched.handoffIds = [];

    const result = await persistPrototypeBricksRunBundle('project-1', failed);

    expect(result.ok).toBe(true);
    expect(writeFilesMock.mock.calls[0]?.[1].map((file) => file.name)).toEqual([
      'pixflow/handoffs/bricks/runs/prototype-bricks-session-1-100.json',
      'pixflow/handoffs/bricks/runs/prototype-bricks-session-1-100-evidence.json',
      'pixflow/handoffs/bricks/runs/prototype-bricks-session-1-100-summary.json',
      'pixflow/handoffs/bricks/latest-run.json',
    ]);
  });
});

describe('persistBuildInBricksRunBundle', () => {
  beforeEach(() => {
    writeFilesMock.mockReset();
    writeScratchFilesMock.mockReset();
  });

  it('uses semantic Build archive names and schemas for new ordinary Build runs', async () => {
    writeScratchFilesMock.mockResolvedValue({ ok: true });
    const buildBundle = bundle();
    buildBundle.pipeline = 'build-in-bricks';
    buildBundle.runId = 'build-in-bricks-session-1-100';
    buildBundle.source = {
      ...buildBundle.source,
      stageA: undefined,
      buildSource: {
        format: 'split_html_css_js',
        sourcePath: 'build-source/source/index.html',
        compiledPath: null,
        htmlPath: 'build-source/source/index.html',
        cssPath: 'build-source/source/styles.css',
        jsPath: 'build-source/source/script.js',
        sourceFidelityClone: false,
      },
    };
    buildBundle.evidence = {
      ...buildBundle.evidence,
      stageA: undefined,
      buildSource: { screenshots: [], reports: [], visualGate: null, qualityGate: { ok: true } },
    };

    const result = await persistBuildInBricksRunBundle('project-1', buildBundle);
    expect(result.ok).toBe(true);
    expect(writeFilesMock).not.toHaveBeenCalled();
    const files = writeScratchFilesMock.mock.calls[0]?.[1].map((file) => file.name) || [];
    expect(files).toContain('pixflow/handoffs/bricks/latest-build-in-bricks-run.json');
    expect(files).toContain('pixflow/handoffs/bricks/handoff-final/build-in-bricks-run-bundle.json');
    expect(files).toContain('pixflow/handoffs/bricks/handoff-final/build-in-bricks-evidence-manifest.json');
    expect(files).toContain('pixflow/handoffs/bricks/handoff-final/build-in-bricks-run-summary.json');
    expect(files.some((file) => file.includes('prototype-bricks'))).toBe(false);
    expect(files.some((file) => file.includes('stage-a'))).toBe(false);
    const evidenceFile = writeScratchFilesMock.mock.calls[0]?.[1].find(
      (file) => file.name.endsWith('build-in-bricks-evidence-manifest.json'),
    );
    expect(JSON.parse(evidenceFile?.content || '{}').schema).toBe('pixflow.build_in_bricks.run_evidence.v1');
    const summaryFile = writeScratchFilesMock.mock.calls[0]?.[1].find(
      (file) => file.name.endsWith('build-in-bricks-run-summary.json'),
    );
    expect(JSON.parse(summaryFile?.content || '{}').schema).toBe('pixflow.build_in_bricks.run_summary.v1');
  });

  it('keeps a Build archive failure diagnostic on the daemon scratch boundary', async () => {
    writeScratchFilesMock.mockResolvedValue({ ok: false, message: 'daemon scratch write failed' });
    const buildBundle = bundle();
    buildBundle.pipeline = 'build-in-bricks';

    const result = await persistBuildInBricksRunBundle('project-1', buildBundle);

    expect(result.ok).toBe(false);
    expect(result.bundle.archive).toEqual({
      status: 'failed',
      files: [],
      message: 'daemon scratch write failed',
    });
    expect(writeFilesMock).not.toHaveBeenCalled();
  });
});
