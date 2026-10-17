import type { AgentEvent, AppConfig, ChatAttachment, ChatCommentAttachment, ChatMessage, ProjectFile } from '../types';
import {
  PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST,
  isPixflowBuildInBricksThemeStyleContextAuthoritative,
  listPixflowBuildInBricksEligibleCssVariables,
  normalizePixflowBuildInBricksSourceLifecycle,
  pixflowBuildInBricksEligibleCssVariableValues,
  validatePixflowBuildInBricksSourceArtifacts,
  type PixflowBuildInBricksRenderedReview,
  type PixflowBricksMediaPolicy,
  type PixflowBricksRetainedEditDecision,
  type PixflowBuildInBricksReviewFinding,
  type PixflowBuildInBricksThemeStyleSourceFinding,
  type PixflowBuildInBricksSourceLifecycle,
  type PixflowBuildInBricksSkillAuthority,
  type WorkspaceContextItem,
} from '@open-design/contracts';
import { streamMessage } from '../providers/anthropic';
import { streamViaDaemon } from '../providers/daemon';
import {
  fetchBuildInBricksScratchProjectFileText,
  writeBuildInBricksScratchProjectTextFile,
} from './build-in-bricks-scratch-project-files';
import type { PixflowRouteContextSnapshot } from './framework';
import { hashSourceText } from './source-hash';
import { requestWordPressRest } from './license';
import {
  composeHtmlWithSidecars,
  extractBuildSourceEnvelope,
  normalizeHistoricalRetainedBuildSource,
  type HistoricalRetainedBuildSourceReconciliation,
} from './bricks-html-source-shared';
import {
  buildBuildInBricksContextFiles,
  buildBuildInBricksDesignContext,
  buildBuildInBricksPagePlan,
  buildBuildInBricksPromptProvenance,
  buildBuildInBricksRequestBundle,
  buildBuildInBricksSelectedSourceAnchor,
  buildBuildInBricksSourcePrompt,
  buildBuildInBricksThemeStyleContext,
} from './build-in-bricks-source-context';
import {
  buildBuildInBricksDesignPlan,
  critiqueBuildInBricksSource,
  evaluateBuildInBricksSourceQualityGate,
  projectBuildInBricksSourceCritique,
  validateBuildInBricksAuthoredHtmlDiscipline,
  validateBuildInBricksCompiledDocument,
  validateBuildInBricksHtmlDiscipline,
  validateBuildInBricksBoundedRetainedEdit,
  validateBuildInBricksRetainedAestheticRepairScope,
  normalizeBuildInBricksOptionalJavaScript,
  type BuildInBricksFinding,
  type BuildInBricksDesignPlan,
  type BuildInBricksQualityGate,
  type BuildInBricksSourceCritique,
  type BuildInBricksRetainedSource,
} from './build-in-bricks-source-contract';
import {
  archiveBuildInBricksReport,
  persistBuildInBricksContextCompletenessReport,
  persistBuildInBricksDeterministicSourceValidationReport,
  persistBuildInBricksDesignPlanReport,
  persistBuildInBricksPromptBundleReport,
  persistBuildInBricksQualityGateReport,
} from './build-in-bricks-source-reports';
import {
  buildBuildInBricksSourceRepairPrompt,
  buildBuildInBricksSourceRepairTransportIds,
  repairBuildInBricksSource,
  type BuildInBricksRepairFinding,
} from './build-in-bricks-source-repair';
import {
  BUILD_IN_BRICKS_SOURCE_VISUAL_VIEWPORTS,
  buildBuildInBricksSourceVisualReviewPrompt,
  buildInBricksSourceVisualEvidencePath,
  captureBuildInBricksRenderedEvidence,
  createBuildInBricksRenderedReview,
  runBuildInBricksAestheticReview,
} from './build-in-bricks-render-review';
import type { BuildInBricksVisualReviewRoute } from '@open-design/contracts';

export {
  buildBuildInBricksContextFiles,
  buildBuildInBricksDesignContext,
  buildBuildInBricksPagePlan,
  buildBuildInBricksPromptProvenance,
  buildBuildInBricksRequestBundle,
  buildBuildInBricksSourcePrompt,
  buildBuildInBricksThemeStyleContext,
  buildBuildInBricksDesignPlan,
  critiqueBuildInBricksSource,
  evaluateBuildInBricksSourceQualityGate,
  validateBuildInBricksAuthoredHtmlDiscipline,
  validateBuildInBricksCompiledDocument,
  validateBuildInBricksHtmlDiscipline,
  validateBuildInBricksBoundedRetainedEdit,
  validateBuildInBricksRetainedAestheticRepairScope,
  normalizeBuildInBricksOptionalJavaScript,
  buildBuildInBricksSourceRepairPrompt,
  buildBuildInBricksSourceRepairTransportIds,
  BUILD_IN_BRICKS_SOURCE_VISUAL_VIEWPORTS,
  buildBuildInBricksSourceVisualReviewPrompt,
  buildInBricksSourceVisualEvidencePath,
};
export type { BuildInBricksDesignPlan, BuildInBricksQualityGate, BuildInBricksSourceCritique };

export const BUILD_IN_BRICKS_SOURCE_PIPELINE_ID = 'build-in-bricks' as const;
export const BUILD_IN_BRICKS_SOURCE_ENTRY_CONTRACT = 'build-in-bricks-source-generation.v1' as const;
export const BUILD_IN_BRICKS_SOURCE_INTENT = 'pixflow_build_in_bricks_html_first' as const;

export class BuildInBricksHistoricalSourceReconciliationError extends Error {
  readonly code = 'historical_source_reconciliation_required' as const;

  constructor(readonly reconciliation: HistoricalRetainedBuildSourceReconciliation) {
    super(reconciliation.message);
    this.name = 'BuildInBricksHistoricalSourceReconciliationError';
  }
}

export type BuildInBricksSkillPathEntry = {
  id: string;
  label?: string;
  command?: string;
  role?: string;
  relatedTo?: string;
};

export type BuildInBricksPriorMessage = {
  id?: string;
  role?: string;
  content?: string;
  createdAt?: number;
  status?: string;
  runStatus?: string;
  events?: unknown[];
};

export type BuildInBricksSourceOptions = {
  projectId: string;
  prompt: string;
  attachments: ChatAttachment[];
  commentAttachments?: ChatCommentAttachment[];
  priorMessages?: BuildInBricksPriorMessage[];
  workspaceItems?: WorkspaceContextItem[];
  pageInventory?: Record<string, unknown> | null;
  targetTitle: string;
  agentId: string;
  apiConfig?: AppConfig | null;
  routeContext?: PixflowRouteContextSnapshot | null;
  designSystem?: Record<string, unknown> | null;
  existingSource?: BuildInBricksRetainedSource | null;
  mediaPolicy?: PixflowBricksMediaPolicy;
  retainedEditDecision?: PixflowBricksRetainedEditDecision | null;
  model?: string | null;
  reasoning?: string | null;
  visualReviewRoute?: BuildInBricksVisualReviewRoute;
  signal: AbortSignal;
  cancelSignal?: AbortSignal;
  skillIds?: string[];
  promptSkillPath?: BuildInBricksSkillPathEntry[];
  generationScope?: 'full_page' | 'section' | 'component';
  continuation?: Record<string, unknown> | null;
  conversationSummary?: string;
  flow?: 'build';
  /** Test/integration injection; production resolves this from WordPress. */
  buildSkillAuthority?: PixflowBuildInBricksSkillAuthority | null;
  onDelta?: (delta: string) => void;
  onToolInputDelta?: (id: string, name: string, delta: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
  onStatus?: (status: string) => void;
};

export type BuildInBricksSourceMetadata = {
  format: 'split_html_css_js';
  sourcePath: string;
  compiledPath: string;
  htmlPath: string;
  cssPath: string;
  jsPath: string | null;
};

export type BuildInBricksVisualReviewStatus =
  | 'pending'
  | 'completed'
  | 'skipped_disabled'
  | 'skipped_capability_unavailable'
  | 'skipped_capture_unavailable'
  | 'skipped_repair_revalidated_deterministically'
  | 'skipped_unsupported';

export type BuildInBricksSourceResult = {
  status: 'ready';
  pipelineId: typeof BUILD_IN_BRICKS_SOURCE_PIPELINE_ID;
  entryContractRevision: typeof BUILD_IN_BRICKS_SOURCE_ENTRY_CONTRACT;
  provider: 'local-cli' | 'byok-api';
  sourceValidation: { ok: boolean; issues: string[]; warnings: string[]; conversionReady: boolean };
  evidenceRunId: string;
  sourceFile: ProjectFile;
  source: BuildInBricksSourceMetadata;
  buildSource: BuildInBricksSourceMetadata;
  themeStyleContext: ReturnType<typeof buildBuildInBricksThemeStyleContext>;
  visualEvidenceFiles: ProjectFile[];
  visualGate: {
    attempted: boolean;
    completed: boolean;
    screenshotCount: number;
    repaired: boolean;
    reviewStatus: BuildInBricksVisualReviewStatus;
    reviewerMode?: 'selected';
    reviewerAgentId?: string;
    reviewerModel?: string | null;
    verdict?: 'approved' | 'repaired';
    critiqueSource?: 'model';
    evidenceManifestPath?: string;
  };
  designPlan: BuildInBricksDesignPlan;
  qualityGate: BuildInBricksQualityGate;
  deterministicSourceValidation: BuildInBricksDeterministicValidationResult;
  designPlanReportFile: ProjectFile | null;
  qualityGateReportFile: ProjectFile | null;
  deterministicSourceValidationReportFile: ProjectFile | null;
  promptBundleReportFile: ProjectFile | null;
  contextCompletenessReportFile: ProjectFile | null;
  renderedReview: PixflowBuildInBricksRenderedReview;
  renderedReviewReportFile: ProjectFile | null;
  assistantText: string;
  critique: BuildInBricksSourceCritique;
  buildLifecycle: PixflowBuildInBricksSourceLifecycle;
} | {
  status: 'needs_questions';
  pipelineId: typeof BUILD_IN_BRICKS_SOURCE_PIPELINE_ID;
  entryContractRevision: typeof BUILD_IN_BRICKS_SOURCE_ENTRY_CONTRACT;
  assistantText: string;
};

export type BuildInBricksSourceGenerationResult = BuildInBricksSourceResult;
export type BuildInBricksSourceLifecycle = PixflowBuildInBricksSourceLifecycle;
export type { BuildInBricksContextFile } from './build-in-bricks-source-context';

export type BuildInBricksDeterministicValidationResult = {
  schema: 'pixflow.build_in_bricks.deterministic_source_validation.v1';
  conversionReady: boolean;
  findings: BuildInBricksFinding[];
  warnings: BuildInBricksFinding[];
  checks: { sourceContract: boolean; semanticSafety: boolean; buildQualityContract: boolean };
};

export class BuildInBricksSourceQualityGateError extends Error {
  qualityGate: BuildInBricksQualityGate;
  qualityGateReport: string | null;
  deterministicSourceValidation: BuildInBricksDeterministicValidationResult | null;
  deterministicSourceValidationReport: string | null;
  blockingDeterministicFindings: BuildInBricksFinding[];
  renderedReview: PixflowBuildInBricksRenderedReview | null;
  renderedReviewReport: string | null;
  blockingRenderedFindings: PixflowBuildInBricksReviewFinding[];
  constructor(
    message: string,
    qualityGate: BuildInBricksQualityGate,
    qualityGateReport: string | null,
    rendered?: {
      review: PixflowBuildInBricksRenderedReview;
      report: string | null;
      blockingFindings: PixflowBuildInBricksReviewFinding[];
    },
    deterministic?: {
      validation: BuildInBricksDeterministicValidationResult;
      report: string | null;
      blockingFindings: BuildInBricksFinding[];
    },
  ) {
    super(message);
    this.name = 'BuildInBricksSourceQualityGateError';
    this.qualityGate = qualityGate;
    this.qualityGateReport = qualityGateReport;
    this.deterministicSourceValidation = deterministic?.validation || null;
    this.deterministicSourceValidationReport = deterministic?.report || null;
    this.blockingDeterministicFindings = deterministic?.blockingFindings || [];
    this.renderedReview = rendered?.review || null;
    this.renderedReviewReport = rendered?.report || null;
    this.blockingRenderedFindings = rendered?.blockingFindings || [];
  }
}

export function buildBuildInBricksSourceFailureMetadata(error: BuildInBricksSourceQualityGateError): Record<string, unknown> {
  return {
    qualityGate: error.qualityGate,
    qualityGateReport: error.qualityGateReport,
    ...(error.deterministicSourceValidation
      ? { deterministicSourceValidation: error.deterministicSourceValidation }
      : {}),
    ...(error.deterministicSourceValidationReport
      ? { deterministicSourceValidationReport: error.deterministicSourceValidationReport }
      : {}),
    ...(error.blockingDeterministicFindings.length > 0
      ? { blockingDeterministicFindings: error.blockingDeterministicFindings }
      : {}),
    ...(error.renderedReview ? { renderedReview: error.renderedReview } : {}),
    ...(error.renderedReviewReport ? { renderedReviewReport: error.renderedReviewReport } : {}),
    ...(error.blockingRenderedFindings.length > 0
      ? { blockingRenderedFindings: error.blockingRenderedFindings }
      : {}),
  };
}

export function resolveBuildInBricksSkillIds(_requested: string[], _prompt = ''): string[] {
  return PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST.skills.map((skill) => skill.id);
}

export function buildBuildInBricksSplitSourcePaths(): { html: string; css: string; js: string; notes: string } {
  return {
    html: 'build-source/source/index.html',
    css: 'build-source/source/styles.css',
    js: 'build-source/source/script.js',
    notes: 'build-source/source/NOTES.md',
  };
}

const BUILD_SOURCE_ASSET_ROOT = ['build-source', 'source', 'assets'] as const;

function rebaseBuildSourceAssetUrl(value: string): string {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('#') || raw.startsWith('/') || raw.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(raw)) {
    return value;
  }
  const suffixIndex = raw.search(/[?#]/);
  const pathPart = (suffixIndex >= 0 ? raw.slice(0, suffixIndex) : raw).replace(/\\/g, '/');
  const suffix = suffixIndex >= 0 ? raw.slice(suffixIndex) : '';
  const resolved = ['build-source', 'source'];
  for (const segment of pathPart.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (resolved.length === 0) return value;
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  if (!BUILD_SOURCE_ASSET_ROOT.every((segment, index) => resolved[index] === segment)) return value;
  // The compiled browser document is a sibling of the canonical source root.
  return `../source/${resolved.slice(BUILD_SOURCE_ASSET_ROOT.length - 1).join('/')}${suffix}`;
}

function rebaseBuildSourceAssetReferences(html: string, css: string): { html: string; css: string } {
  const rebaseSrcset = (value: string) => value.split(',').map((candidate) => {
    const match = /^(\s*)(\S+)([\s\S]*)$/.exec(candidate);
    return match ? `${match[1]}${rebaseBuildSourceAssetUrl(match[2] || '')}${match[3]}` : candidate;
  }).join(',');
  const rebasedHtml = html.replace(
    /\b(src|srcset|poster|href|xlink:href)\s*=\s*(["'])([^"']*)\2/gi,
    (attribute, name: string, quote: string, value: string) => `${name}=${quote}${name.toLowerCase() === 'srcset' ? rebaseSrcset(value) : rebaseBuildSourceAssetUrl(value)}${quote}`,
  );
  const rebasedCss = css.replace(
    /url\(\s*(["']?)([^"')]+)\1\s*\)/gi,
    (source, quote: string, value: string) => `url(${quote}${rebaseBuildSourceAssetUrl(value)}${quote})`,
  );
  return { html: rebasedHtml, css: rebasedCss };
}

export function composeBuildInBricksSourceHtml(
  html: string,
  sidecars: { css: string; cssPath: string | null; js: string; jsPath: string | null },
): string {
  const rebased = rebaseBuildSourceAssetReferences(html, sidecars.css);
  return composeHtmlWithSidecars(rebased.html, { ...sidecars, css: rebased.css }, 'data-pixflow-build-source');
}

export function isBuildInBricksSourceContractError(error: unknown): boolean {
  return /Build source .*?(?:contract|artifact|HTML|CSS)/i.test(error instanceof Error ? error.message : String(error || ''));
}

export function remainingBuildInBricksTargetedRepairBudget(repairCount: number): number {
  return Math.max(0, 1 - Math.max(0, Math.floor(repairCount)));
}

export function buildBuildInBricksSourceConversationId(projectId: string, evidenceRunId: string): string {
  return `build-source:${projectId}:${evidenceRunId}`;
}

export function buildBuildInBricksSourceRepairConversationId(projectId: string, evidenceRunId: string): string {
  return `${buildBuildInBricksSourceConversationId(projectId, evidenceRunId)}:repair`;
}

export function createBuildInBricksDeterministicValidation({
  sourceValidation,
  authoredFindings = [],
  retainedEditFindings = [],
  htmlDisciplineIssues = [],
  qualityGate,
}: {
  sourceValidation: {
    ok: boolean;
    issues: string[];
    warnings: string[];
    findings?: PixflowBuildInBricksThemeStyleSourceFinding[];
  };
  authoredFindings?: BuildInBricksFinding[];
  retainedEditFindings?: BuildInBricksFinding[];
  htmlDisciplineIssues?: string[];
  qualityGate: BuildInBricksQualityGate;
}): BuildInBricksDeterministicValidationResult {
  const structuredThemeStyleFindings: BuildInBricksFinding[] = (sourceValidation.findings || []).map((finding) => ({
    code: finding.code,
    severity: finding.severity,
    category: 'route_token_discipline',
    message: finding.message,
    selector: finding.selector,
    element: finding.element,
    property: finding.property,
    breakpoint: finding.breakpoint,
    authoredValue: finding.authoredValue,
    effectiveValue: finding.effectiveValue,
  }));
  const structuredMessages = new Set(structuredThemeStyleFindings.map((finding) => finding.message));
  const sourceFindings: BuildInBricksFinding[] = sourceValidation.issues
    .filter((message) => !structuredMessages.has(message))
    .map((message) => ({
    code: 'source_artifact_contract',
    severity: 'blocking',
    category: 'source_contract',
    message,
    }));
  const sourceWarnings: BuildInBricksFinding[] = sourceValidation.warnings.map((message) => ({
    code: 'source_artifact_contract',
    severity: 'warning',
    category: 'source_contract',
    message,
  }));
  const disciplineFindings: BuildInBricksFinding[] = htmlDisciplineIssues.map((message) => ({
    code: 'html_discipline',
    severity: 'blocking',
    category: 'source_contract',
    message,
  }));
  const unique = (items: BuildInBricksFinding[]) => [...new Map(
    items.map((finding) => [`${finding.code}:${finding.severity}:${finding.message}`, finding]),
  ).values()];
  const findings = unique([
    ...sourceFindings,
    ...structuredThemeStyleFindings,
    ...authoredFindings.filter((finding) => finding.severity === 'blocking'),
    ...retainedEditFindings.filter((finding) => finding.severity === 'blocking'),
    ...disciplineFindings,
    ...qualityGate.findings.filter((finding) => finding.severity === 'blocking'),
  ]);
  return {
    schema: 'pixflow.build_in_bricks.deterministic_source_validation.v1',
    conversionReady: findings.length === 0,
    findings,
    warnings: unique([
      ...sourceWarnings,
      ...authoredFindings.filter((finding) => finding.severity !== 'blocking'),
      ...retainedEditFindings.filter((finding) => finding.severity !== 'blocking'),
      ...qualityGate.findings.filter((finding) => finding.severity !== 'blocking'),
    ]),
    checks: {
      sourceContract: sourceValidation.ok
        && authoredFindings.every((finding) => finding.severity !== 'blocking')
        && retainedEditFindings.every((finding) => finding.severity !== 'blocking')
        && htmlDisciplineIssues.length === 0,
      semanticSafety: !qualityGate.findings.some((finding) => finding.severity === 'blocking' && finding.category === 'semantic_safety'),
      buildQualityContract: qualityGate.ok,
    },
  };
}

type MaterializedBuildSource = {
  html: string;
  css: string;
  js: string;
  compiled: string;
  sourceFile: ProjectFile;
  metadata: BuildInBricksSourceMetadata;
};

async function readAndMaterializeBuildSource(projectId: string): Promise<MaterializedBuildSource> {
  const paths = buildBuildInBricksSplitSourcePaths();
  const [html, css, js] = await Promise.all([
    fetchBuildInBricksScratchProjectFileText(projectId, paths.html),
    fetchBuildInBricksScratchProjectFileText(projectId, paths.css),
    fetchBuildInBricksScratchProjectFileText(projectId, paths.js),
  ]);
  if (!html?.trim() || !css?.trim()) throw new Error('Build source contract requires build-source/source/index.html and styles.css.');
  const compiled = composeBuildInBricksSourceHtml(html, { css, cssPath: paths.css, js: js || '', jsPath: js ? paths.js : null });
  const sourceFile = await writeBuildInBricksScratchProjectTextFile(projectId, 'build-source/compiled/index.html', compiled);
  if (!sourceFile) throw new Error('Build source compiled artifact could not be persisted.');
  return {
    html,
    css,
    js: js || '',
    compiled,
    sourceFile,
    metadata: {
      format: 'split_html_css_js',
      sourcePath: paths.html,
      compiledPath: sourceFile.path || sourceFile.name || 'build-source/compiled/index.html',
      htmlPath: paths.html,
      cssPath: paths.css,
      jsPath: js ? paths.js : null,
    },
  };
}

function validateBuildSource(
  source: MaterializedBuildSource,
  options: {
    prompt: string;
    targetTitle: string;
    generationScope: 'full_page' | 'section' | 'component';
    designPlan: BuildInBricksDesignPlan;
    routeContext?: PixflowRouteContextSnapshot | null;
    context: ReturnType<typeof buildBuildInBricksDesignContext>;
    existingSource?: BuildInBricksRetainedSource | null;
    retainedSourceAnchor?: { sourcePath: string } | null;
    retainedEditDecision?: PixflowBricksRetainedEditDecision | null;
  },
) {
  const allowedCssVariables = listPixflowBuildInBricksEligibleCssVariables(options.context);
  const sourceContract = validatePixflowBuildInBricksSourceArtifacts({
    html: source.html,
    css: source.css,
    js: source.js,
    scope: options.generationScope,
    allowedCssVariables,
    eligibleCssVariableValues: pixflowBuildInBricksEligibleCssVariableValues(options.context),
    enforceGlobalTokenProvenance: true,
    forbidGlobalSiteVariableDeclarations: true,
    themeStyleContext: options.context.themeStyle,
    enforceInheritedThemeStyleDiscipline: true,
  });
  const authoredDiscipline = validateBuildInBricksAuthoredHtmlDiscipline(
    source.html,
    options.generationScope,
  );
  const compiledDiscipline = validateBuildInBricksCompiledDocument(
    source.compiled,
    options.generationScope,
  );
  const retainedEditFindings = validateBuildInBricksBoundedRetainedEdit({
    decision: options.retainedEditDecision,
    retainedSource: options.existingSource,
    retainedSourceAnchor: options.retainedSourceAnchor,
    nextSource: source,
  });
  const qualityGate = evaluateBuildInBricksSourceQualityGate(source.compiled, {
    prompt: options.prompt,
    targetTitle: options.targetTitle,
    routeContext: options.routeContext,
    generationScope: options.generationScope,
    designPlan: options.designPlan,
  });
  const critique = projectBuildInBricksSourceCritique(qualityGate);
  const mergedSourceValidation = {
    ...sourceContract,
    ok: sourceContract.ok && authoredDiscipline.ok && compiledDiscipline.ok,
    issues: [
      ...sourceContract.issues,
      ...authoredDiscipline.findings.map((finding) => finding.message),
      ...(compiledDiscipline.ok ? [] : compiledDiscipline.issues),
      ...retainedEditFindings.map((finding) => finding.message),
    ],
    conversionReady: sourceContract.ok && authoredDiscipline.ok && compiledDiscipline.ok && retainedEditFindings.length === 0,
  };
  const deterministic = createBuildInBricksDeterministicValidation({
    sourceValidation: sourceContract,
    authoredFindings: authoredDiscipline.findings,
    retainedEditFindings,
    htmlDisciplineIssues: compiledDiscipline.ok ? [] : compiledDiscipline.issues,
    qualityGate,
  });
  return { sourceValidation: mergedSourceValidation, critique, qualityGate, deterministic };
}

function buildInBricksRepairRemediation(finding: BuildInBricksFinding): string | undefined {
  if (finding.code === 'theme_style_redundant_inheritance') {
    return 'remove_redundant_inherited_declaration';
  }
  if (finding.code === 'theme_style_responsive_shadow') {
    return 'restore_theme_style_responsive_ownership';
  }
  if (finding.code === 'missing_required_content') {
    return finding.requirementKind === 'structural'
      ? 'add_required_html_structure'
      : 'add_required_user_visible_content';
  }
  if (finding.code === 'retained_source_scope_violation') {
    return 'restore_retained_source_and_apply_literal_replacement';
  }
  return undefined;
}

function projectBuildInBricksRepairFinding(
  finding: BuildInBricksFinding,
): BuildInBricksRepairFinding {
  return {
    code: finding.code,
    severity: finding.severity === 'blocking' ? 'blocking' : 'warning',
    message: finding.message,
    category: finding.category,
    selector: finding.selector,
    element: finding.element,
    property: finding.property,
    breakpoint: finding.breakpoint,
    authoredValue: finding.authoredValue,
    effectiveValue: finding.effectiveValue,
    viewport: finding.viewport,
    remediation: buildInBricksRepairRemediation(finding),
    requirement: finding.requirement,
    requirementKind: finding.requirementKind,
    matchingPolicy: finding.matchingPolicy,
    inspectedSurface: finding.inspectedSurface,
    retainedEditKind: finding.retainedEditKind,
    retainedFrom: finding.retainedFrom,
    retainedTo: finding.retainedTo,
  };
}

function projectRenderedRepairFinding(
  finding: PixflowBuildInBricksReviewFinding,
): BuildInBricksRepairFinding {
  return {
    code: finding.kind,
    severity: finding.severity === 'blocking' ? 'blocking' : 'warning',
    category: 'visual_evidence',
    message: finding.message,
    selector: finding.selector,
    viewport: finding.viewport,
    remediation: 'correct_rendered_evidence',
  };
}

function buildBuildInBricksRepairFindings(
  validation: ReturnType<typeof validateBuildSource>,
  primary: readonly BuildInBricksRepairFinding[] = [],
): BuildInBricksRepairFinding[] {
  const findings = [
    ...primary,
    ...validation.deterministic.findings.map(projectBuildInBricksRepairFinding),
    ...validation.deterministic.warnings
      .filter((finding) => finding.code === 'theme_style_redundant_inheritance' || finding.code === 'theme_style_responsive_shadow')
      .map(projectBuildInBricksRepairFinding),
  ];
  return [...new Map(findings.map((finding) => [
    [
      finding.code,
      finding.severity,
      finding.selector || '',
      finding.property || '',
      finding.breakpoint || '',
      finding.message,
    ].join('\u0000'),
    finding,
  ])).values()].slice(0, 48);
}

async function persistBuildInBricksDeterministicValidationCheckpoint({
  projectId,
  evidenceRunId,
  validation,
  archiveName,
}: {
  projectId: string;
  evidenceRunId: string;
  validation: BuildInBricksDeterministicValidationResult;
  archiveName: string;
}): Promise<ProjectFile | null> {
  const file = await persistBuildInBricksDeterministicSourceValidationReport(projectId, validation);
  await archiveBuildInBricksReport({ projectId, evidenceRunId, file, archiveName });
  return file;
}

async function persistBuildInBricksRenderedReviewCheckpoint({
  projectId,
  evidenceRunId,
  review,
  archiveName,
}: {
  projectId: string;
  evidenceRunId: string;
  review: PixflowBuildInBricksRenderedReview;
  archiveName: string;
}): Promise<ProjectFile | null> {
  const file = await writeBuildInBricksScratchProjectTextFile(
    projectId,
    'build-source/reports/rendered-review.json',
    `${JSON.stringify(review, null, 2)}\n`,
  );
  await archiveBuildInBricksReport({ projectId, evidenceRunId, file, archiveName });
  return file;
}

function renderedReviewFailureMessage(findings: PixflowBuildInBricksReviewFinding[]): string {
  const primary = findings[0];
  if (!primary) return 'Build stopped before conversion because deterministic rendered evidence is blocking.';
  return `Build stopped before conversion: ${primary.message}${primary.selector ? ` (${primary.selector})` : ''}`;
}

async function persistApiBuildSource(projectId: string, responseText: string): Promise<void> {
  const files = extractBuildSourceEnvelope(responseText);
  if (!files.html || !files.css) throw new Error('Build API response did not return both canonical HTML and CSS source files.');
  const js = normalizeBuildInBricksOptionalJavaScript(files.js);
  const writes = await Promise.all([
    writeBuildInBricksScratchProjectTextFile(projectId, 'build-source/source/index.html', files.html),
    writeBuildInBricksScratchProjectTextFile(projectId, 'build-source/source/styles.css', files.css),
    files.js ? writeBuildInBricksScratchProjectTextFile(projectId, 'build-source/source/script.js', js) : Promise.resolve(null),
  ]);
  if (!writes[0] || !writes[1]) throw new Error('Build API source persistence failed.');
}

async function runBuildSourceProvider({
  options,
  sourcePrompt,
  evidenceRunId,
  skillIds,
  authority,
}: {
  options: BuildInBricksSourceOptions;
  sourcePrompt: string;
  evidenceRunId: string;
  skillIds: string[];
  authority: PixflowBuildInBricksSkillAuthority;
}): Promise<string> {
  let responseText = '';
  let streamError: Error | null = null;
  const history: ChatMessage[] = [{ id: `build-source-user:${evidenceRunId}`, role: 'user', content: sourcePrompt, createdAt: Date.now() }];
  const handlers = {
    onDelta(delta: string) { responseText += delta; options.onDelta?.(delta); },
    onDone(fullText: string) { responseText = fullText || responseText; },
    onError(error: Error) { streamError = error; },
  };
  if (options.apiConfig) {
    await streamMessage(options.apiConfig, authority.instruction, history, options.signal, handlers);
    if (!options.signal.aborted) await persistApiBuildSource(options.projectId, responseText);
  } else {
    await streamViaDaemon({
      agentId: options.agentId,
      projectId: options.projectId,
      conversationId: buildBuildInBricksSourceConversationId(options.projectId, evidenceRunId),
      assistantMessageId: `build-source-assistant:${evidenceRunId}`,
      clientRequestId: `build-source:${evidenceRunId}`,
      history,
      signal: options.signal,
      cancelSignal: options.cancelSignal || options.signal,
      skillId: null,
      skillIds,
      wordpressPluginAssetSync: null,
      projectMetadata: { kind: 'build-in-bricks', intent: BUILD_IN_BRICKS_SOURCE_INTENT, skipDiscoveryBrief: true },
      pixflowBuildSkillAuthority: authority,
      attachments: options.attachments.map((attachment) => String((attachment as ChatAttachment & { path?: string }).path || '')).filter(Boolean),
      commentAttachments: options.commentAttachments || [],
      sessionMode: 'design',
      model: options.model ?? null,
      reasoning: options.reasoning ?? null,
      handlers: {
        ...handlers,
        onAgentEvent: options.onAgentEvent || (() => {}),
        onToolInputDelta: options.onToolInputDelta || (() => {}),
      },
    });
  }
  if (streamError) throw streamError;
  return responseText;
}

async function loadPluginBuildInBricksAuthority(): Promise<PixflowBuildInBricksSkillAuthority> {
  const response = await requestWordPressRest<{
    ok?: boolean;
    authority?: PixflowBuildInBricksSkillAuthority;
    message?: string;
  }>('/pixflow-mcp/build-in-bricks-authority');
  if (!response.ok || !response.body?.ok || !response.body.authority) {
    throw new Error(
      response.body?.message
        || `The Pixflow Build in Bricks ability could not be loaded from WordPress (${response.status}).`,
    );
  }
  return response.body.authority;
}

export async function generateBuildInBricksSource(options: BuildInBricksSourceOptions): Promise<BuildInBricksSourceResult> {
  if (options.flow && options.flow !== 'build') throw new Error('Canonical Build source generation accepts only the ordinary Build flow.');
  const generationScope = options.generationScope || 'full_page';
  const retainedSource = options.existingSource
    ? normalizeHistoricalRetainedBuildSource(options.existingSource)
    : null;
  if (retainedSource?.reconciliation) {
    throw new BuildInBricksHistoricalSourceReconciliationError(retainedSource.reconciliation);
  }
  const authority = options.buildSkillAuthority ?? await loadPluginBuildInBricksAuthority();
  const existingSource = retainedSource?.source || null;
  const retainedSourceAnchorContext = existingSource
    ? buildBuildInBricksSelectedSourceAnchor(options.pageInventory)
    : null;
  const retainedSourceAnchor = retainedSourceAnchorContext
    && typeof retainedSourceAnchorContext.sourcePath === 'string'
    ? { sourcePath: retainedSourceAnchorContext.sourcePath }
    : null;
  const lifecycle: PixflowBuildInBricksSourceLifecycle = { source_generation_started: Date.now() };
  const evidenceRunId = `build-${Date.now().toString(36)}-${(await hashSourceText(`${options.projectId}:${options.prompt}`)).slice(0, 10)}`;
  const skillIds = resolveBuildInBricksSkillIds(options.skillIds || [], options.prompt);
  options.onStatus?.('Preparing canonical Build source context...');
  const context = buildBuildInBricksDesignContext(options.routeContext, options.designSystem, generationScope);
  if (!isPixflowBuildInBricksThemeStyleContextAuthoritative(context.themeStyle)) {
    throw new Error(`Build source requires an authoritative effective Bricks Theme Style context (resolution: ${context.themeStyle?.resolution.status || 'unavailable'}).`);
  }
  const designPlan = buildBuildInBricksDesignPlan({
    prompt: options.prompt,
    targetTitle: options.targetTitle,
    routeContext: options.routeContext,
    generationScope,
    mediaPolicy: options.mediaPolicy,
  });
  const pagePlan = buildBuildInBricksPagePlan(designPlan, generationScope);
  const requestBundle = buildBuildInBricksRequestBundle({
    prompt: options.prompt,
    targetTitle: options.targetTitle,
    generationScope,
    context,
    workspaceItems: options.workspaceItems || [],
    pageInventory: options.pageInventory,
    existingSource,
    pagePlan,
  });
  const promptProvenance = buildBuildInBricksPromptProvenance({
    provider: options.apiConfig ? 'byok-api' : 'local-cli',
    context,
    requestedSkillIds: options.skillIds || [],
    workspaceItems: options.workspaceItems || [],
    pageInventory: options.pageInventory,
    existingSource,
    pagePlan,
  });
  const contextFiles = buildBuildInBricksContextFiles({
    targetTitle: options.targetTitle,
    context,
    attachments: options.attachments,
    commentAttachments: options.commentAttachments || [],
    workspaceItems: options.workspaceItems || [],
    pageInventory: options.pageInventory,
    designSystem: options.designSystem,
    existingSource,
  });
  await Promise.all([
    ...contextFiles.map((file) => writeBuildInBricksScratchProjectTextFile(options.projectId, file.path, file.content)),
    writeBuildInBricksScratchProjectTextFile(options.projectId, 'build-source/context/request-bundle.json', `${JSON.stringify({ ...requestBundle, promptProvenance }, null, 2)}\n`),
    writeBuildInBricksScratchProjectTextFile(options.projectId, 'build-source/diagnostics/prompt-provenance.json', `${JSON.stringify(promptProvenance, null, 2)}\n`),
  ]);
  const sourcePrompt = buildBuildInBricksSourcePrompt({
    prompt: options.prompt,
    targetTitle: options.targetTitle,
    generationScope,
    context,
    existingSource,
    pageInventory: options.pageInventory,
    historicalDocumentShellNormalized: retainedSource?.normalizedHistoricalDocumentShell === true,
  });
  options.onStatus?.(options.apiConfig ? 'Generating canonical Build source through the configured API...' : 'Generating canonical Build source...');
  const assistantText = await runBuildSourceProvider({ options, sourcePrompt, evidenceRunId, skillIds, authority });
  if (assistantText.includes('<question-form')) {
    return { status: 'needs_questions', pipelineId: BUILD_IN_BRICKS_SOURCE_PIPELINE_ID, entryContractRevision: BUILD_IN_BRICKS_SOURCE_ENTRY_CONTRACT, assistantText };
  }

  let source = await readAndMaterializeBuildSource(options.projectId);
  let validation = validateBuildSource(source, { prompt: options.prompt, targetTitle: options.targetTitle, generationScope, designPlan, routeContext: options.routeContext, context, existingSource, retainedSourceAnchor, retainedEditDecision: options.retainedEditDecision });
  let deterministicValidationReportFile = await persistBuildInBricksDeterministicValidationCheckpoint({
    projectId: options.projectId,
    evidenceRunId,
    validation: validation.deterministic,
    archiveName: 'deterministic-source-validation-initial.json',
  });
  let repairCount = 0;
  let repairStatus: 'not_needed' | 'applied' | 'rolled_back' | 'failed' = 'not_needed';
  if (!validation.deterministic.conversionReady) {
    options.onStatus?.('Repairing canonical Build source findings once...');
    await repairBuildInBricksSource({
      projectId: options.projectId,
      prompt: options.prompt,
      targetTitle: options.targetTitle,
      findings: buildBuildInBricksRepairFindings(validation),
      retainedSource: existingSource,
      html: source.html,
      css: source.css,
      js: source.js,
      agentId: options.agentId,
      apiConfig: options.apiConfig,
      model: options.model,
      reasoning: options.reasoning,
      signal: options.signal,
      cancelSignal: options.cancelSignal,
      evidenceRunId,
      onDelta: options.onDelta,
      onAgentEvent: options.onAgentEvent,
      buildSkillAuthority: authority,
    });
    repairCount = 1;
    source = await readAndMaterializeBuildSource(options.projectId);
    validation = validateBuildSource(source, { prompt: options.prompt, targetTitle: options.targetTitle, generationScope, designPlan, routeContext: options.routeContext, context, existingSource, retainedSourceAnchor, retainedEditDecision: options.retainedEditDecision });
    deterministicValidationReportFile = await persistBuildInBricksDeterministicValidationCheckpoint({
      projectId: options.projectId,
      evidenceRunId,
      validation: validation.deterministic,
      archiveName: 'deterministic-source-validation-post-repair.json',
    });
    repairStatus = validation.deterministic.conversionReady ? 'applied' : 'failed';
  }
  if (!validation.deterministic.conversionReady) {
    const qualityReport = await persistBuildInBricksQualityGateReport(options.projectId, validation.qualityGate);
    const blockingFindings = validation.deterministic.findings.filter((finding) => finding.severity === 'blocking');
    const primaryFinding = blockingFindings[0];
    throw new BuildInBricksSourceQualityGateError(
      `Build stopped before rendered review because deterministic source validation still contained ${blockingFindings.length} blocking finding${blockingFindings.length === 1 ? '' : 's'} after the single repair.${primaryFinding ? ` ${primaryFinding.message}` : ''}`,
      validation.qualityGate,
      qualityReport?.path || qualityReport?.name || null,
      undefined,
      {
        validation: validation.deterministic,
        report: deterministicValidationReportFile?.path || deterministicValidationReportFile?.name || null,
        blockingFindings,
      },
    );
  }

  options.onStatus?.('Capturing deterministic rendered evidence...');
  let evidence = await captureBuildInBricksRenderedEvidence({ projectId: options.projectId, sourcePath: source.metadata.compiledPath, evidenceRunId, context });
  let preliminaryReview = createBuildInBricksRenderedReview({
    sourceValidation: validation.sourceValidation,
    layouts: evidence.layouts,
    layer3: { status: 'skipped_capability_unavailable', screenshotCount: evidence.files.length, reason: 'Aesthetic review has not run.' },
    repair: { attempted: repairCount > 0, count: repairCount, status: repairStatus },
    promptProvenanceId: promptProvenance.schema,
    selectedAgentId: options.agentId,
    selectedModel: options.model,
    themeStyleSnapshotHash: context.themeStyle?.snapshotHash,
    renderEnvironment: evidence.renderEnvironment,
  });
  let preliminaryReviewReportFile = await persistBuildInBricksRenderedReviewCheckpoint({
    projectId: options.projectId,
    evidenceRunId,
    review: preliminaryReview,
    archiveName: 'rendered-review-preliminary.json',
  });
  const renderBlocking = preliminaryReview.layer2.findings.filter((finding) => finding.severity === 'blocking');
  if (renderBlocking.length > 0 && repairCount === 0) {
    await repairBuildInBricksSource({
      projectId: options.projectId,
      prompt: options.prompt,
      targetTitle: options.targetTitle,
      findings: buildBuildInBricksRepairFindings(validation, renderBlocking.map(projectRenderedRepairFinding)),
      retainedSource: existingSource,
      html: source.html,
      css: source.css,
      js: source.js,
      agentId: options.agentId,
      apiConfig: options.apiConfig,
      model: options.model,
      reasoning: options.reasoning,
      signal: options.signal,
      cancelSignal: options.cancelSignal,
      evidenceRunId,
      onDelta: options.onDelta,
      onAgentEvent: options.onAgentEvent,
      buildSkillAuthority: authority,
    });
    repairCount = 1;
    repairStatus = 'applied';
    source = await readAndMaterializeBuildSource(options.projectId);
    validation = validateBuildSource(source, { prompt: options.prompt, targetTitle: options.targetTitle, generationScope, designPlan, routeContext: options.routeContext, context, existingSource, retainedSourceAnchor, retainedEditDecision: options.retainedEditDecision });
    deterministicValidationReportFile = await persistBuildInBricksDeterministicValidationCheckpoint({
      projectId: options.projectId,
      evidenceRunId,
      validation: validation.deterministic,
      archiveName: 'deterministic-source-validation-post-repair.json',
    });
    if (!validation.deterministic.conversionReady) {
      repairStatus = 'failed';
      const blockingFindings = validation.deterministic.findings.filter((finding) => finding.severity === 'blocking');
      throw new BuildInBricksSourceQualityGateError(
        'Rendered-evidence repair regressed deterministic Build validity.',
        validation.qualityGate,
        null,
        undefined,
        {
          validation: validation.deterministic,
          report: deterministicValidationReportFile?.path || deterministicValidationReportFile?.name || null,
          blockingFindings,
        },
      );
    }
    evidence = await captureBuildInBricksRenderedEvidence({ projectId: options.projectId, sourcePath: source.metadata.compiledPath, evidenceRunId, context });
    preliminaryReview = createBuildInBricksRenderedReview({
      sourceValidation: validation.sourceValidation,
      layouts: evidence.layouts,
      layer3: { status: 'skipped_capability_unavailable', screenshotCount: evidence.files.length, reason: 'Aesthetic review has not run.' },
      repair: { attempted: true, count: 1, status: repairStatus },
      promptProvenanceId: promptProvenance.schema,
      selectedAgentId: options.agentId,
      selectedModel: options.model,
      themeStyleSnapshotHash: context.themeStyle?.snapshotHash,
      renderEnvironment: evidence.renderEnvironment,
    });
    preliminaryReviewReportFile = await persistBuildInBricksRenderedReviewCheckpoint({
      projectId: options.projectId,
      evidenceRunId,
      review: preliminaryReview,
      archiveName: 'rendered-review-post-repair.json',
    });
  }
  const remainingRenderBlocking = preliminaryReview.layer2.findings.filter((finding) => finding.severity === 'blocking');
  if (remainingRenderBlocking.length > 0) {
    throw new BuildInBricksSourceQualityGateError(
      renderedReviewFailureMessage(remainingRenderBlocking),
      validation.qualityGate,
      null,
      {
        review: preliminaryReview,
        report: preliminaryReviewReportFile?.path || preliminaryReviewReportFile?.name || null,
        blockingFindings: remainingRenderBlocking,
      },
    );
  }

  const visualRoute = options.visualReviewRoute || { mode: 'skipped' as const, reason: 'skipped_unsupported' as const };
  const layer3 = await runBuildInBricksAestheticReview({ projectId: options.projectId, evidenceRunId, route: visualRoute, evidenceFiles: evidence.files, signal: options.signal, onAgentEvent: options.onAgentEvent });
  if (layer3.status === 'completed' && layer3.findings?.length && repairCount === 0) {
    const checkpoint = { html: source.html, css: source.css, js: source.js };
    await repairBuildInBricksSource({
      projectId: options.projectId,
      prompt: options.prompt,
      targetTitle: options.targetTitle,
      findings: layer3.findings.map((message) => ({
        code: 'aesthetic_review',
        severity: 'warning',
        category: 'visual_evidence',
        message,
        remediation: 'apply_targeted_aesthetic_correction',
      })),
      retainedSource: existingSource,
      html: source.html,
      css: source.css,
      js: source.js,
      agentId: options.agentId,
      apiConfig: options.apiConfig,
      model: options.model,
      reasoning: options.reasoning,
      signal: options.signal,
      cancelSignal: options.cancelSignal,
      evidenceRunId,
      onDelta: options.onDelta,
      onAgentEvent: options.onAgentEvent,
      buildSkillAuthority: authority,
    });
    repairCount = 1;
    source = await readAndMaterializeBuildSource(options.projectId);
    validation = validateBuildSource(source, { prompt: options.prompt, targetTitle: options.targetTitle, generationScope, designPlan, routeContext: options.routeContext, context, existingSource, retainedSourceAnchor, retainedEditDecision: options.retainedEditDecision });
    const retainedRepairScopeFindings = validateBuildInBricksRetainedAestheticRepairScope({
      retainedSource: existingSource,
      generatedSource: checkpoint,
      repairedSource: source,
    });
    const postRepairDeterministic = retainedRepairScopeFindings.length > 0
      ? {
          ...validation.deterministic,
          conversionReady: false,
          findings: [...validation.deterministic.findings, ...retainedRepairScopeFindings],
          checks: { ...validation.deterministic.checks, sourceContract: false },
        }
      : validation.deterministic;
    deterministicValidationReportFile = await persistBuildInBricksDeterministicValidationCheckpoint({
      projectId: options.projectId,
      evidenceRunId,
      validation: postRepairDeterministic,
      archiveName: 'deterministic-source-validation-post-repair.json',
    });
    if (!validation.deterministic.conversionReady || retainedRepairScopeFindings.length > 0) {
      if (retainedRepairScopeFindings.length > 0) {
        options.onStatus?.('Rolling back an aesthetic repair that exceeded the selected agent-owned retained-source change...');
      }
      await Promise.all([
        writeBuildInBricksScratchProjectTextFile(options.projectId, 'build-source/source/index.html', checkpoint.html),
        writeBuildInBricksScratchProjectTextFile(options.projectId, 'build-source/source/styles.css', checkpoint.css),
        writeBuildInBricksScratchProjectTextFile(options.projectId, 'build-source/source/script.js', checkpoint.js),
      ]);
      source = await readAndMaterializeBuildSource(options.projectId);
      validation = validateBuildSource(source, { prompt: options.prompt, targetTitle: options.targetTitle, generationScope, designPlan, routeContext: options.routeContext, context, existingSource, retainedSourceAnchor, retainedEditDecision: options.retainedEditDecision });
      deterministicValidationReportFile = await persistBuildInBricksDeterministicValidationCheckpoint({
        projectId: options.projectId,
        evidenceRunId,
        validation: validation.deterministic,
        archiveName: 'deterministic-source-validation-post-repair-rollback.json',
      });
      repairStatus = 'rolled_back';
    } else {
      repairStatus = 'applied';
      evidence = await captureBuildInBricksRenderedEvidence({ projectId: options.projectId, sourcePath: source.metadata.compiledPath, evidenceRunId, context });
    }
  }
  const renderedReview = createBuildInBricksRenderedReview({
    sourceValidation: validation.sourceValidation,
    layouts: evidence.layouts,
    layer3,
    repair: { attempted: repairCount > 0, count: repairCount, status: repairStatus },
    promptProvenanceId: promptProvenance.schema,
    selectedAgentId: options.agentId,
    selectedModel: options.model,
    themeStyleSnapshotHash: context.themeStyle?.snapshotHash,
    renderEnvironment: evidence.renderEnvironment,
  });
  const renderedReviewReportFile = await persistBuildInBricksRenderedReviewCheckpoint({
    projectId: options.projectId,
    evidenceRunId,
    review: renderedReview,
    archiveName: 'rendered-review.json',
  });
  const contextCompletenessReportFile = await persistBuildInBricksContextCompletenessReport({
    projectId: options.projectId,
    targetTitle: options.targetTitle,
    routeContext: options.routeContext,
    sourceUrls: [],
    attachments: options.attachments,
    commentAttachments: options.commentAttachments || [],
    priorMessageCount: options.priorMessages?.length || 0,
    workspaceItems: options.workspaceItems || [],
  });
  const [designPlanReportFile, qualityGateReportFile, promptBundleReportFile] = await Promise.all([
    persistBuildInBricksDesignPlanReport(options.projectId, designPlan),
    persistBuildInBricksQualityGateReport(options.projectId, validation.qualityGate),
    persistBuildInBricksPromptBundleReport({
      projectId: options.projectId,
      userPrompt: options.prompt,
      promptText: sourcePrompt,
      source: source.metadata,
      targetTitle: options.targetTitle,
      requestedSkillIds: options.skillIds || [],
      normalizedSkillIds: skillIds,
      promptSkillPath: options.promptSkillPath || [],
      promptProvenance,
      contextCompletenessReportPath: contextCompletenessReportFile?.path || contextCompletenessReportFile?.name || null,
    }),
  ]);
  await Promise.all([
    archiveBuildInBricksReport({ projectId: options.projectId, evidenceRunId, file: designPlanReportFile, archiveName: 'design-plan.json' }),
    archiveBuildInBricksReport({ projectId: options.projectId, evidenceRunId, file: qualityGateReportFile, archiveName: 'quality-gate-report.json' }),
  ]);
  lifecycle.source_generation_finished = Date.now();
  const reviewStatus: BuildInBricksVisualReviewStatus = layer3.status === 'completed'
    ? 'completed'
    : evidence.files.length === 0
      ? 'skipped_capture_unavailable'
      : visualRoute.mode === 'skipped' ? visualRoute.reason : 'skipped_capability_unavailable';
  return {
    status: 'ready',
    pipelineId: BUILD_IN_BRICKS_SOURCE_PIPELINE_ID,
    entryContractRevision: BUILD_IN_BRICKS_SOURCE_ENTRY_CONTRACT,
    provider: options.apiConfig ? 'byok-api' : 'local-cli',
    sourceValidation: {
      ok: true,
      issues: [],
      warnings: validation.deterministic.warnings.map((finding) => finding.message),
      conversionReady: true,
    },
    evidenceRunId,
    sourceFile: source.sourceFile,
    source: source.metadata,
    buildSource: source.metadata,
    themeStyleContext: context.themeStyle!,
    visualEvidenceFiles: evidence.files,
    visualGate: {
      attempted: evidence.files.length > 0,
      completed: layer3.status === 'completed',
      screenshotCount: evidence.files.length,
      repaired: repairStatus === 'applied',
      reviewStatus,
      ...(visualRoute.mode === 'selected' ? { reviewerMode: 'selected' as const, reviewerAgentId: visualRoute.agentId, reviewerModel: visualRoute.model } : {}),
      ...(layer3.status === 'completed' ? { verdict: repairStatus === 'applied' ? 'repaired' as const : 'approved' as const, critiqueSource: 'model' as const } : {}),
      evidenceManifestPath: evidence.manifestFile?.path || evidence.manifestFile?.name,
    },
    designPlan,
    qualityGate: validation.qualityGate,
    deterministicSourceValidation: validation.deterministic,
    designPlanReportFile,
    qualityGateReportFile,
    deterministicSourceValidationReportFile: deterministicValidationReportFile,
    promptBundleReportFile,
    contextCompletenessReportFile,
    renderedReview,
    renderedReviewReportFile,
    assistantText,
    critique: { ...validation.critique, repaired: repairCount > 0, designPlan, qualityGate: validation.qualityGate },
    buildLifecycle: normalizePixflowBuildInBricksSourceLifecycle(lifecycle),
  };
}
