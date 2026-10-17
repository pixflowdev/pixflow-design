import { writeProjectTextFiles } from '../providers/registry';
import type { PrototypeBricksRunBundle } from './prototype-bricks-run-bundle';
import { writeBuildInBricksScratchProjectTextFiles } from './build-in-bricks-scratch-project-files';

export type PrototypeBricksRunBundlePersistenceResult = {
  ok: boolean;
  bundle: PrototypeBricksRunBundle;
};

async function persistRunBundleCore(
  projectId: string | null,
  runBundle: PrototypeBricksRunBundle,
): Promise<PrototypeBricksRunBundlePersistenceResult> {
  const bundle = structuredClone(runBundle);
  if (!projectId) {
    bundle.archive = {
      status: 'failed',
      files: [],
      message: 'No Pixflow project was available for run-bundle archival.',
    };
    return { ok: false, bundle };
  }

  const handoffId = bundle.touched.handoffIds.at(-1) || null;
  const isBuildInBricksRun = bundle.pipeline === 'build-in-bricks';
  const runFile = `pixflow/handoffs/bricks/runs/${safePathSegment(bundle.runId)}.json`;
  const latestFile = isBuildInBricksRun
    ? 'pixflow/handoffs/bricks/latest-build-in-bricks-run.json'
    : 'pixflow/handoffs/bricks/latest-run.json';
  const handoffFile = handoffId
    ? `pixflow/handoffs/bricks/${safePathSegment(handoffId)}/${isBuildInBricksRun ? 'build-in-bricks-run-bundle.json' : 'prototype-bricks-run-bundle.json'}`
    : null;
  const runEvidenceFile = `pixflow/handoffs/bricks/runs/${safePathSegment(bundle.runId)}-evidence.json`;
  const runSummaryFile = `pixflow/handoffs/bricks/runs/${safePathSegment(bundle.runId)}-summary.json`;
  const handoffEvidenceFile = handoffId
    ? `pixflow/handoffs/bricks/${safePathSegment(handoffId)}/${isBuildInBricksRun ? 'build-in-bricks-evidence-manifest.json' : 'prototype-bricks-evidence-manifest.json'}`
    : null;
  const handoffSummaryFile = handoffId
    ? `pixflow/handoffs/bricks/${safePathSegment(handoffId)}/${isBuildInBricksRun ? 'build-in-bricks-run-summary.json' : 'prototype-bricks-run-summary.json'}`
    : null;
  const bundleFiles = uniqueStrings([
    runFile,
    runEvidenceFile,
    runSummaryFile,
    latestFile,
    ...(handoffFile ? [handoffFile] : []),
    ...(handoffEvidenceFile ? [handoffEvidenceFile] : []),
    ...(handoffSummaryFile ? [handoffSummaryFile] : []),
  ]);
  const archiveFiles = uniqueStrings([
    ...bundleFiles,
    ...bundle.touched.artifactFiles,
  ]);

  bundle.archive = {
    status: 'saved',
    files: archiveFiles,
    message: null,
  };
  bundle.touched.artifactFiles = uniqueStrings([
    ...bundle.touched.artifactFiles,
    ...archiveFiles,
  ]);

  const serializedBundle = `${JSON.stringify(bundle, null, 2)}\n`;
  const serializedEvidence = `${JSON.stringify({
    schema: isBuildInBricksRun
      ? 'pixflow.build_in_bricks.run_evidence.v1'
      : 'pixflow.prototype_bricks.run_evidence.v1',
    runId: bundle.runId,
    projectId,
    handoffId,
    status: bundle.status,
    target: bundle.target,
    touched: bundle.touched,
    evidence: bundle.evidence,
    lifecycle: {
      marks: bundle.marks,
      durationsMs: bundle.durationsMs,
    },
    result: bundle.result,
    summary: bundle.summary,
  }, null, 2)}\n`;
  const serializedSummary = `${JSON.stringify({
    schema: isBuildInBricksRun
      ? 'pixflow.build_in_bricks.run_summary.v1'
      : 'pixflow.html_to_bricks.run_summary.v1',
    runId: bundle.runId,
    projectId,
    handoffId,
    status: bundle.status,
    startedAt: bundle.startedAt,
    finishedAt: bundle.finishedAt,
    summary: bundle.summary,
  }, null, 2)}\n`;
  const latest = `${JSON.stringify({
    version: bundle.version,
    runId: bundle.runId,
    projectId,
    handoffId,
    status: bundle.status,
    runFile,
    runEvidenceFile,
    runSummaryFile,
    handoffFile,
    handoffEvidenceFile,
    handoffSummaryFile,
    finishedAt: bundle.finishedAt,
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`;
  const files = [
    { name: runFile, content: serializedBundle },
    { name: runEvidenceFile, content: serializedEvidence },
    { name: runSummaryFile, content: serializedSummary },
    ...(handoffFile ? [{ name: handoffFile, content: serializedBundle }] : []),
    ...(handoffEvidenceFile ? [{ name: handoffEvidenceFile, content: serializedEvidence }] : []),
    ...(handoffSummaryFile ? [{ name: handoffSummaryFile, content: serializedSummary }] : []),
    { name: latestFile, content: latest },
  ];
  // Ordinary Build workspaces are daemon-owned scratch projects, including
  // when the web app is embedded in WordPress. The global WordPress fetch
  // remapper owns durable WP projects and must not redirect Build evidence
  // away from the source workspace. Prototype/Clone compatibility keeps its
  // historical project-file route.
  const result = isBuildInBricksRun
    ? await writeBuildInBricksScratchProjectTextFiles(projectId, files)
    : await writeProjectTextFiles(projectId, files);

  if (!result.ok) {
    bundle.archive = {
      status: 'failed',
      files: [],
      message: result.message || 'Prototype Bricks run bundle could not be archived.',
    };
    bundle.touched.artifactFiles = bundle.touched.artifactFiles.filter(
      (file) => !bundleFiles.includes(file),
    );
    return { ok: false, bundle };
  }

  return { ok: true, bundle };
}

/** Canonical ordinary Build run-bundle persistence boundary. */
export async function persistBuildInBricksRunBundle(
  projectId: string | null,
  runBundle: PrototypeBricksRunBundle,
): Promise<PrototypeBricksRunBundlePersistenceResult> {
  return persistRunBundleCore(projectId, runBundle);
}

/** Historical compatibility persistence for Prototype/Clone runs/readers. */
export async function persistPrototypeBricksRunBundle(
  projectId: string | null,
  runBundle: PrototypeBricksRunBundle,
): Promise<PrototypeBricksRunBundlePersistenceResult> {
  return persistRunBundleCore(projectId, runBundle);
}

function safePathSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'run';
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
