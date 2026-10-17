import type { AgentEvent, ProjectFile } from '../types';
import {
  createPixflowBuildInBricksRenderedReview,
  formatPixflowBuildInBricksThemeStylePreviewCss,
  PIXFLOW_CANONICAL_BUILD_BRICKS_RENDER_ENVIRONMENT_PROFILE,
  PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST,
  type PixflowBuildInBricksDesignContext,
  type PixflowBuildInBricksLayer3Result,
  type PixflowBuildInBricksRenderedReview,
  type PixflowBuildInBricksRepairResult,
  type PixflowVisualCaptureRequest,
  type PixflowVisualCaptureResponse,
  type PixflowVisualLayoutEvidence,
  type PixflowVisualRenderEnvironmentIdentity,
} from '@open-design/contracts';
import { streamViaDaemon } from '../providers/daemon';
import { toPixflowRuntimeUrl } from './bridge-url';
import {
  resolveBuildInBricksScratchProjectUrl,
  writeBuildInBricksScratchProjectBase64File,
  writeBuildInBricksScratchProjectTextFile,
} from './build-in-bricks-scratch-project-files';
import type { BuildInBricksVisualReviewRoute } from '@open-design/contracts';

export const BUILD_IN_BRICKS_SOURCE_VISUAL_VIEWPORTS = [
  { id: 'desktop', width: 1440, height: 1000, scrollPosition: 'top' as const },
  { id: 'bricks-base', width: 992, height: 844, scrollPosition: 'top' as const },
  { id: 'mobile', width: 390, height: 844, scrollPosition: 'top' as const },
] as const;

export function buildInBricksSourceVisualEvidencePath(
  evidenceRunId: string,
  captureId: string,
  viewportId: string,
): string {
  return `build-source/runs/${evidenceRunId}/captures/${captureId}/${viewportId}.png`;
}

export function buildBuildInBricksThemeStylePreviewCss(context: PixflowBuildInBricksDesignContext): string {
  const declarations = context.tokens.all
    .filter((token) => token.value && token.cssVar.startsWith('--'))
    .map((token) => `${token.cssVar}: ${token.value};`);
  const themeStyleCss = context.themeStyle
    ? formatPixflowBuildInBricksThemeStylePreviewCss(context.themeStyle)
    : '';
  return [
    declarations.length > 0 ? `:root {\n${declarations.map((line) => `  ${line}`).join('\n')}\n}` : '',
    themeStyleCss,
  ].filter(Boolean).join('\n\n').slice(0, 80_000);
}

export function buildBuildInBricksVisualCaptureRequest({
  url,
  context,
}: {
  url: string;
  context: PixflowBuildInBricksDesignContext;
}): PixflowVisualCaptureRequest {
  return {
    url,
    viewports: [...BUILD_IN_BRICKS_SOURCE_VISUAL_VIEWPORTS],
    captureMode: 'generated',
    fidelityProfile: 'structural',
    renderEnvironmentProfile: PIXFLOW_CANONICAL_BUILD_BRICKS_RENDER_ENVIRONMENT_PROFILE,
    themeStylePreviewCss: buildBuildInBricksThemeStylePreviewCss(context),
    themeStyleSnapshotHash: context.themeStyle?.snapshotHash,
  };
}

export async function captureBuildInBricksRenderedEvidence({
  projectId,
  sourcePath,
  evidenceRunId,
  context,
}: {
  projectId: string;
  sourcePath: string;
  evidenceRunId: string;
  context: PixflowBuildInBricksDesignContext;
}): Promise<{
  files: ProjectFile[];
  manifestFile: ProjectFile | null;
  layouts: PixflowVisualLayoutEvidence[];
  captureId: string;
  renderEnvironment?: PixflowVisualRenderEnvironmentIdentity;
}> {
  const captureId = `capture-${Date.now().toString(36)}`;
  const safePath = sourcePath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  const sourceUrl = resolveBuildInBricksScratchProjectUrl(`/api/projects/${encodeURIComponent(projectId)}/raw/${safePath}`);
  const request = buildBuildInBricksVisualCaptureRequest({
    url: typeof window !== 'undefined' ? new URL(sourceUrl, window.location.origin).toString() : sourceUrl,
    context,
  });
  let payload: PixflowVisualCaptureResponse | null = null;
  try {
    const response = await fetch(toPixflowRuntimeUrl('/api/pixflow/visual-capture'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    payload = await response.json().catch(() => null) as PixflowVisualCaptureResponse | null;
  } catch {
    payload = null;
  }
  const files: ProjectFile[] = [];
  for (const capture of payload?.captures || []) {
    const file = await writeBuildInBricksScratchProjectBase64File(
      projectId,
      buildInBricksSourceVisualEvidencePath(evidenceRunId, captureId, capture.viewport),
      capture.base64,
    );
    if (file) files.push(file);
  }
  const layouts = (payload?.captures || [])
    .map((capture) => capture.layout)
    .filter((layout): layout is PixflowVisualLayoutEvidence => Boolean(layout));
  const manifestFile = await writeBuildInBricksScratchProjectTextFile(
    projectId,
    `build-source/runs/${evidenceRunId}/captures/${captureId}/visual-evidence-manifest.json`,
    `${JSON.stringify({
      schema: 'pixflow.build_in_bricks.visual_evidence.v1',
      evidenceRunId,
      captureId,
      createdAt: new Date().toISOString(),
      themeStyleSnapshotHash: context.themeStyle?.snapshotHash || null,
      renderEnvironment: payload?.renderEnvironment || null,
      files: files.map((file) => file.path || file.name),
      errors: payload?.errors || ['renderer unavailable'],
    }, null, 2)}\n`,
  );
  return {
    files,
    manifestFile,
    layouts,
    captureId,
    ...(payload?.renderEnvironment ? { renderEnvironment: payload.renderEnvironment } : {}),
  };
}

export function buildBuildInBricksSourceVisualReviewPrompt(): string {
  return [
    'Review the supplied screenshots for visual quality only.',
    'Deterministic source correctness has already been decided by code; do not re-judge factual, source-contract, token, or Theme Style rules.',
    'Return exactly one JSON object: {"verdict":"approved"|"repair","findings":["bounded visual issue"]}.',
    'Request repair only for a material visual defect that can be fixed without redesigning unrelated source.',
  ].join('\n');
}

export async function runBuildInBricksAestheticReview({
  projectId,
  evidenceRunId,
  route,
  evidenceFiles,
  signal,
  onAgentEvent,
}: {
  projectId: string;
  evidenceRunId: string;
  route: BuildInBricksVisualReviewRoute;
  evidenceFiles: ProjectFile[];
  signal: AbortSignal;
  onAgentEvent?: (event: AgentEvent) => void;
}): Promise<PixflowBuildInBricksLayer3Result> {
  if (route.mode === 'skipped') {
    return { status: route.reason === 'skipped_disabled' ? 'skipped_disabled' : 'skipped_capability_unavailable', screenshotCount: evidenceFiles.length, reason: route.reason };
  }
  if (!route.capabilities.imageInput || !route.capabilities.fileInput || evidenceFiles.length === 0) {
    return {
      status: 'skipped_capability_unavailable',
      selectedAgentId: route.agentId,
      selectedModel: route.model,
      capability: route.capabilities,
      screenshotCount: evidenceFiles.length,
      reason: evidenceFiles.length === 0 ? 'Rendered screenshot evidence was unavailable.' : 'The selected run did not explicitly support image/file input.',
    };
  }
  let responseText = '';
  let streamError: Error | null = null;
  await streamViaDaemon({
    agentId: route.agentId,
    projectId,
    conversationId: `build-source:${projectId}:visual-review:${evidenceRunId}`,
    assistantMessageId: `build-source-visual-review-assistant:${evidenceRunId}`,
    clientRequestId: `build-source-visual-review:${evidenceRunId}`,
    history: [{ id: `build-source-visual-review-user:${evidenceRunId}`, role: 'user', content: buildBuildInBricksSourceVisualReviewPrompt(), createdAt: Date.now() }],
    signal,
    cancelSignal: signal,
    skillId: null,
    skillIds: PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST.skills.map((skill) => skill.id),
    wordpressPluginAssetSync: null,
    projectMetadata: { kind: 'build-in-bricks', intent: 'pixflow_build_in_bricks_visual_review', skipDiscoveryBrief: true },
    attachments: evidenceFiles.map((file) => file.path || file.name).filter(Boolean),
    commentAttachments: [],
    sessionMode: 'design',
    model: route.model,
    reasoning: null,
    handlers: {
      onDelta(delta) { responseText += delta; },
      onDone(fullText) { responseText = fullText || responseText; },
      onError(error) { streamError = error; },
      onAgentEvent: onAgentEvent || (() => {}),
    },
  });
  if (streamError) {
    return { status: 'failed', selectedAgentId: route.agentId, selectedModel: route.model, capability: route.capabilities, screenshotCount: evidenceFiles.length, reason: (streamError as Error).message };
  }
  const jsonText = responseText.match(/\{[\s\S]*\}/)?.[0] || '';
  let findings: string[] = [];
  try {
    const parsed = JSON.parse(jsonText) as { verdict?: unknown; findings?: unknown };
    findings = parsed.verdict === 'repair' && Array.isArray(parsed.findings)
      ? parsed.findings.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8)
      : [];
  } catch {
    return { status: 'failed', selectedAgentId: route.agentId, selectedModel: route.model, capability: route.capabilities, screenshotCount: evidenceFiles.length, reason: 'The selected aesthetic reviewer returned no valid bounded verdict.' };
  }
  return { status: 'completed', selectedAgentId: route.agentId, selectedModel: route.model, capability: route.capabilities, screenshotCount: evidenceFiles.length, findings };
}

export function createBuildInBricksRenderedReview({
  sourceValidation,
  layouts,
  layer3,
  repair,
  promptProvenanceId,
  selectedAgentId,
  selectedModel,
  themeStyleSnapshotHash,
  renderEnvironment,
}: {
  sourceValidation: { ok: boolean; issues: string[]; warnings: string[] };
  layouts: PixflowVisualLayoutEvidence[];
  layer3: PixflowBuildInBricksLayer3Result;
  repair: PixflowBuildInBricksRepairResult;
  promptProvenanceId?: string;
  selectedAgentId?: string;
  selectedModel?: string | null;
  themeStyleSnapshotHash?: string;
  renderEnvironment?: PixflowVisualRenderEnvironmentIdentity;
}): PixflowBuildInBricksRenderedReview {
  return createPixflowBuildInBricksRenderedReview({
    layer1: { status: sourceValidation.ok ? 'completed' : 'failed', ok: sourceValidation.ok, issues: sourceValidation.issues, warnings: sourceValidation.warnings },
    viewports: layouts,
    rendererAvailable: layouts.length > 0,
    layer3,
    repair,
    promptProvenanceId,
    selectedAgentId,
    selectedModel,
    themeStyleSnapshotHash,
    renderEnvironment,
  });
}
