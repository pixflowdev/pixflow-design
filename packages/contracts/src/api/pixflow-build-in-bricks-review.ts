import type { PixflowVisualLayoutEvidence } from './pixflow-visual-capture.js';
import type { PixflowVisualRenderEnvironmentIdentity } from './pixflow-bricks-render-environment.js';

/** Canonical schema for the bounded, vision-optional Build in Bricks review. */
export const PIXFLOW_BUILD_IN_BRICKS_RENDERED_REVIEW_SCHEMA =
  'pixflow.build_in_bricks.rendered_review.v1' as const;

export type PixflowBuildInBricksReviewStatus =
  | 'completed'
  | 'skipped_disabled'
  | 'skipped_renderer_unavailable'
  | 'skipped_capability_unavailable'
  | 'failed';

export type PixflowBuildInBricksReviewDisposition =
  | 'passed'
  | 'repair_applied'
  | 'repair_rolled_back'
  | 'needs_attention'
  | 'skipped';

export type PixflowBuildInBricksCapabilitySource =
  | 'runtime'
  | 'provider_catalogue'
  | 'adapter'
  | 'verified_probe'
  | 'unknown';

/**
 * Input capabilities are deliberately separate from provider/model identity.
 * A transport can accept files while the selected model cannot interpret an
 * image, and neither property should be inferred from a model name.
 */
export type PixflowBuildInBricksAgentCapabilities = {
  text: boolean;
  imageInput: boolean;
  fileInput: boolean;
  source: PixflowBuildInBricksCapabilitySource;
  revision?: string;
};

export type PixflowBuildInBricksReviewFindingKind =
  | 'horizontal_overflow'
  | 'viewport_escape'
  | 'zero_size_visible'
  | 'clipping'
  | 'missing_resource'
  | 'console_error'
  | 'failed_request'
  | 'invalid_interactive'
  | 'oversized_layout';

export type PixflowBuildInBricksReviewFindingSeverity = 'blocking' | 'warning' | 'info';

export type PixflowBuildInBricksReviewFinding = {
  kind: PixflowBuildInBricksReviewFindingKind;
  severity: PixflowBuildInBricksReviewFindingSeverity;
  viewport: string;
  selector?: string;
  message: string;
  evidence?: string[];
};

export type PixflowBuildInBricksLayer1Result = {
  status: 'completed' | 'failed';
  ok: boolean;
  issues: string[];
  warnings: string[];
};

export type PixflowBuildInBricksLayer2Result = {
  status: 'completed' | 'skipped_renderer_unavailable' | 'failed';
  viewports: PixflowVisualLayoutEvidence[];
  findings: PixflowBuildInBricksReviewFinding[];
  textReport: string;
  truncated: boolean;
  reason?: string;
};

export type PixflowBuildInBricksLayer3Result = {
  status: 'completed' | 'skipped_disabled' | 'skipped_capability_unavailable' | 'failed';
  selectedAgentId?: string;
  selectedModel?: string | null;
  capability?: PixflowBuildInBricksAgentCapabilities;
  screenshotCount: number;
  findings?: string[];
  reason?: string;
};

export type PixflowBuildInBricksRepairResult = {
  attempted: boolean;
  count: number;
  status: 'not_needed' | 'applied' | 'rolled_back' | 'failed';
  reason?: string;
};

export type PixflowBuildInBricksRenderedReview = {
  schema: typeof PIXFLOW_BUILD_IN_BRICKS_RENDERED_REVIEW_SCHEMA;
  layer1: PixflowBuildInBricksLayer1Result;
  layer2: PixflowBuildInBricksLayer2Result;
  layer3: PixflowBuildInBricksLayer3Result;
  repair: PixflowBuildInBricksRepairResult;
  disposition: PixflowBuildInBricksReviewDisposition;
  promptProvenanceId?: string;
  selectedAgentId?: string;
  selectedModel?: string | null;
  /** Hash of the effective Theme Style snapshot used for this review. */
  themeStyleSnapshotHash?: string;
  /** Renderer-only destination baseline identity used by deterministic evidence. */
  renderEnvironment?: PixflowVisualRenderEnvironmentIdentity;
};

const MAX_VIEWPORTS = 8;
const MAX_FINDINGS = 48;
const MAX_EVIDENCE_ITEMS = 4;
const MAX_TEXT_REPORT_CHARS = 12_000;

function bounded(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function boundedList(values: readonly unknown[] | undefined, max = MAX_EVIDENCE_ITEMS): string[] {
  return (Array.isArray(values) ? values : [])
    .map((value) => bounded(value, 220))
    .filter(Boolean)
    .slice(0, max);
}

function pushFinding(
  findings: PixflowBuildInBricksReviewFinding[],
  finding: PixflowBuildInBricksReviewFinding,
): void {
  if (findings.length >= MAX_FINDINGS) return;
  findings.push({
    ...finding,
    viewport: bounded(finding.viewport, 64),
    ...(finding.selector ? { selector: bounded(finding.selector, 180) } : {}),
    message: bounded(finding.message, 420),
    ...(finding.evidence ? { evidence: boundedList(finding.evidence) } : {}),
  });
}

/**
 * Convert renderer measurements into bounded, actionable evidence. This is
 * intentionally text-oriented and makes no aesthetic judgement.
 */
export function buildPixflowBuildInBricksLayer2Findings(
  viewports: readonly PixflowVisualLayoutEvidence[],
): PixflowBuildInBricksReviewFinding[] {
  const findings: PixflowBuildInBricksReviewFinding[] = [];
  for (const evidence of viewports.slice(0, MAX_VIEWPORTS)) {
    const viewport = bounded(evidence.viewport, 64) || 'unknown';
    const overflow = Math.max(0, Math.round(Number(evidence.horizontalOverflowPx) || 0));
    if (overflow > 2) {
      pushFinding(findings, {
        kind: 'horizontal_overflow',
        severity: 'blocking',
        viewport,
        ...(evidence.overflowSources?.[0] ? { selector: evidence.overflowSources[0] } : {}),
        message: `Horizontal overflow ${overflow}px at ${viewport}.`,
        evidence: boundedList(evidence.overflowSources),
      });
    }
    for (const item of (evidence.viewportEscapes || []).slice(0, MAX_EVIDENCE_ITEMS)) {
      pushFinding(findings, {
        kind: 'viewport_escape',
        severity: 'blocking',
        viewport,
        selector: item.selector,
        message: `${bounded(item.selector || 'An element', 180)} escapes the ${viewport} viewport.`,
        evidence: [
          `right=${Math.round(Number(item.right) || 0)}px`,
          `left=${Math.round(Number(item.left) || 0)}px`,
        ],
      });
    }
    for (const selector of (evidence.zeroSizeVisible || []).slice(0, MAX_EVIDENCE_ITEMS)) {
      pushFinding(findings, {
        kind: 'zero_size_visible',
        severity: 'blocking',
        viewport,
        selector,
        message: `${bounded(selector || 'Visible content', 180)} has no visible size at ${viewport}.`,
      });
    }
    for (const item of (evidence.clippedElements || []).slice(0, MAX_EVIDENCE_ITEMS)) {
      pushFinding(findings, {
        kind: 'clipping',
        severity: 'blocking',
        viewport,
        selector: item.selector,
        message: `${bounded(item.selector || 'Visible content', 180)} is clipped at ${viewport}.`,
        evidence: item.evidence,
      });
    }
    for (const resource of (evidence.missingResources || []).slice(0, MAX_EVIDENCE_ITEMS)) {
      pushFinding(findings, {
        kind: 'missing_resource',
        severity: 'blocking',
        viewport,
        message: `A required resource failed to render at ${viewport}.`,
        evidence: [resource.url, resource.kind].filter(Boolean),
        ...(resource.selector ? { selector: resource.selector } : {}),
      });
    }
    for (const error of (evidence.consoleErrors || []).slice(0, MAX_EVIDENCE_ITEMS)) {
      pushFinding(findings, {
        kind: 'console_error',
        severity: 'warning',
        viewport,
        message: `The page reported a console error at ${viewport}.`,
        evidence: [error],
      });
    }
    for (const error of (evidence.failedRequests || []).slice(0, MAX_EVIDENCE_ITEMS)) {
      pushFinding(findings, {
        kind: 'failed_request',
        severity: 'blocking',
        viewport,
        message: `A browser request failed at ${viewport}.`,
        evidence: [error],
      });
    }
    for (const target of (evidence.invalidInteractiveTargets || []).slice(0, MAX_EVIDENCE_ITEMS)) {
      pushFinding(findings, {
        kind: 'invalid_interactive',
        severity: 'warning',
        viewport,
        selector: target.selector,
        message: `${bounded(target.selector || 'Interactive control', 180)} needs an accessible name or target.`,
        ...(target.reason ? { evidence: [target.reason] } : {}),
      });
    }
    for (const item of (evidence.oversizedElements || []).slice(0, MAX_EVIDENCE_ITEMS)) {
      pushFinding(findings, {
        kind: 'oversized_layout',
        severity: 'warning',
        viewport,
        selector: item.selector,
        message: `${bounded(item.selector || 'An element', 180)} is unexpectedly oversized at ${viewport}.`,
        evidence: item.evidence,
      });
    }
  }
  return findings;
}

export function renderPixflowBuildInBricksLayer2TextReport(
  findings: readonly PixflowBuildInBricksReviewFinding[],
  viewports: readonly PixflowVisualLayoutEvidence[] = [],
): string {
  const lines = ['RENDER VALIDATION'];
  for (const viewport of viewports.slice(0, MAX_VIEWPORTS)) {
    const width = Math.round(Number(viewport.viewportWidth) || 0);
    const height = Math.round(Number(viewport.viewportHeight) || 0);
    const overflow = Math.max(0, Math.round(Number(viewport.horizontalOverflowPx) || 0));
    lines.push(`${bounded(viewport.viewport, 64) || 'unknown'} ${width}x${height}: horizontal overflow ${overflow}px`);
  }
  if (findings.length === 0) {
    lines.push('- deterministic layout checks: passed');
  } else {
    for (const finding of findings.slice(0, MAX_FINDINGS)) {
      lines.push(`- [${finding.severity}] ${finding.message}${finding.selector ? ` source ${finding.selector}` : ''}${finding.evidence?.length ? ` (${finding.evidence.join('; ')})` : ''}`);
    }
  }
  const output = lines.join('\n');
  return output.length > MAX_TEXT_REPORT_CHARS
    ? `${output.slice(0, MAX_TEXT_REPORT_CHARS - 24)}\n- evidence truncated`
    : output;
}

export function createPixflowBuildInBricksRenderedReview({
  layer1,
  viewports = [],
  layer3,
  repair = { attempted: false, count: 0, status: 'not_needed' },
  promptProvenanceId,
  selectedAgentId,
  selectedModel,
  themeStyleSnapshotHash,
  renderEnvironment,
  rendererAvailable = true,
}: {
  layer1: PixflowBuildInBricksLayer1Result;
  viewports?: readonly PixflowVisualLayoutEvidence[];
  layer3?: PixflowBuildInBricksLayer3Result;
  repair?: PixflowBuildInBricksRepairResult;
  promptProvenanceId?: string;
  selectedAgentId?: string;
  selectedModel?: string | null;
  themeStyleSnapshotHash?: string;
  renderEnvironment?: PixflowVisualRenderEnvironmentIdentity;
  rendererAvailable?: boolean;
}): PixflowBuildInBricksRenderedReview {
  const findings = rendererAvailable ? buildPixflowBuildInBricksLayer2Findings(viewports) : [];
  const layer2: PixflowBuildInBricksLayer2Result = rendererAvailable
    ? {
        status: 'completed',
        viewports: [...viewports].slice(0, MAX_VIEWPORTS),
        findings,
        textReport: renderPixflowBuildInBricksLayer2TextReport(findings, viewports),
        truncated: viewports.length > MAX_VIEWPORTS || findings.length >= MAX_FINDINGS,
      }
    : {
        status: 'skipped_renderer_unavailable',
        viewports: [],
        findings: [],
        textReport: 'RENDER VALIDATION\n- rendered review: skipped — renderer unavailable',
        truncated: false,
        reason: 'No supported browser renderer was available.',
      };
  const resolvedLayer3 = layer3 || {
    status: 'skipped_capability_unavailable' as const,
    screenshotCount: 0,
    reason: 'The selected agent did not explicitly advertise image input.',
  };
  const normalizedRepair: PixflowBuildInBricksRepairResult = {
    ...repair,
    attempted: repair.attempted === true,
    count: Math.min(1, Math.max(0, Math.floor(Number(repair.count) || 0))),
  };
  const disposition: PixflowBuildInBricksReviewDisposition = !layer1.ok
    ? 'needs_attention'
    : normalizedRepair.status === 'applied'
      ? 'repair_applied'
      : normalizedRepair.status === 'rolled_back'
        ? 'repair_rolled_back'
        : findings.some((finding) => finding.severity === 'blocking')
          ? 'needs_attention'
          : 'passed';
  return {
    schema: PIXFLOW_BUILD_IN_BRICKS_RENDERED_REVIEW_SCHEMA,
    layer1,
    layer2,
    layer3: resolvedLayer3,
    repair: normalizedRepair,
    disposition,
    ...(promptProvenanceId ? { promptProvenanceId: bounded(promptProvenanceId, 120) } : {}),
    ...(selectedAgentId ? { selectedAgentId: bounded(selectedAgentId, 120) } : {}),
    ...(selectedModel !== undefined ? { selectedModel: selectedModel ? bounded(selectedModel, 180) : null } : {}),
    ...(themeStyleSnapshotHash ? { themeStyleSnapshotHash: bounded(themeStyleSnapshotHash, 120) } : {}),
    ...(renderEnvironment ? { renderEnvironment } : {}),
  };
}
