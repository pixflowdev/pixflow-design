import type { ChatAttachment, ChatCommentAttachment, ProjectFile } from '../types';
import {
  PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST,
  type PixflowPromptProvenance,
  type WorkspaceContextItem,
} from '@open-design/contracts';
import type { PixflowRouteContextSnapshot } from './framework';
import { hashSourceText } from './source-hash';
import {
  fetchBuildInBricksScratchProjectFileText,
  writeBuildInBricksScratchProjectTextFile,
} from './build-in-bricks-scratch-project-files';
import type {
  BuildInBricksDesignPlan,
  BuildInBricksQualityGate,
} from './build-in-bricks-source-contract';

export type BuildInBricksReportSource = {
  format: 'single_html' | 'split_html_css_js' | 'inline_recovered';
  sourcePath: string | null;
  compiledPath: string | null;
  htmlPath: string | null;
  cssPath: string | null;
  jsPath: string | null;
};

export async function persistBuildInBricksDesignPlanReport(
  projectId: string,
  designPlan: BuildInBricksDesignPlan,
): Promise<ProjectFile | null> {
  return persistBuildReport(projectId, 'build-source/reports/design-plan.json', designPlan);
}

export async function persistBuildInBricksQualityGateReport(
  projectId: string,
  qualityGate: BuildInBricksQualityGate,
): Promise<ProjectFile | null> {
  return persistBuildReport(projectId, 'build-source/reports/quality-gate-report.json', qualityGate);
}

export async function persistBuildInBricksDeterministicSourceValidationReport(
  projectId: string,
  validation: {
    schema: 'pixflow.build_in_bricks.deterministic_source_validation.v1';
    conversionReady: boolean;
    findings: unknown[];
    warnings: unknown[];
    checks: { sourceContract: boolean; semanticSafety: boolean; buildQualityContract: boolean };
  },
): Promise<ProjectFile | null> {
  return persistBuildReport(
    projectId,
    'build-source/reports/deterministic-source-validation.json',
    validation,
  );
}

export async function persistBuildInBricksContextCompletenessReport({
  projectId,
  targetTitle,
  routeContext,
  sourceUrls,
  attachments,
  commentAttachments,
  priorMessageCount,
  workspaceItems,
}: {
  projectId: string;
  targetTitle: string;
  routeContext?: PixflowRouteContextSnapshot | null;
  sourceUrls: string[];
  attachments: ChatAttachment[];
  commentAttachments: ChatCommentAttachment[];
  priorMessageCount: number;
  workspaceItems: WorkspaceContextItem[];
}): Promise<ProjectFile | null> {
  const routeAvailable = Boolean(routeContext?.activeRouteId);
  const report = {
    schema: 'pixflow.build_in_bricks.context_completeness.v1' as const,
    createdAt: new Date().toISOString(),
    projectId,
    targetTitle,
    readyForGeneration: routeAvailable,
    context: {
      route: {
        available: routeAvailable,
        id: routeContext?.activeRouteId || null,
        family: routeContext?.sources?.framework?.routeFamily || null,
      },
      sourceUrlCount: sourceUrls.length,
      attachmentCount: attachments.length,
      commentAttachmentCount: commentAttachments.length,
      priorMessageCount,
      workspaceItemCount: workspaceItems.length,
      eligibleTokenCount: Array.isArray(routeContext?.designContext?.tokens?.all)
        ? routeContext.designContext.tokens.all.length
        : 0,
      globalClassCount: routeContext?.allowlists?.globalClassNames?.length || 0,
    },
    omissions: routeAvailable ? [] : ['Authoritative WordPress route context was unavailable.'],
  };
  return persistBuildReport(projectId, 'build-source/reports/context-completeness-report.json', report);
}

export async function persistBuildInBricksPromptBundleReport({
  projectId,
  userPrompt,
  promptText,
  source,
  targetTitle,
  requestedSkillIds,
  normalizedSkillIds,
  promptSkillPath,
  promptProvenance,
  contextCompletenessReportPath,
}: {
  projectId: string;
  userPrompt: string;
  promptText: string;
  source: BuildInBricksReportSource;
  targetTitle: string;
  requestedSkillIds: string[];
  normalizedSkillIds: string[];
  promptSkillPath: Array<{ id: string; label?: string; command?: string; role?: string; relatedTo?: string }>;
  promptProvenance?: PixflowPromptProvenance;
  contextCompletenessReportPath?: string | null;
}): Promise<ProjectFile | null> {
  const manifest = PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST;
  const promptHash = await hashSourceText(promptText);
  const report = {
    schema: 'pixflow.build_in_bricks.prompt_bundle.v1' as const,
    createdAt: new Date().toISOString(),
    projectId,
    targetTitle,
    promptHash,
    userRequestHash: await hashSourceText(userPrompt),
    source,
    skillAuthority: {
      manifest: manifest.schema,
      revision: manifest.revision,
      approvedSkillIds: manifest.skills.map((skill) => skill.id),
      requestedSkillIds,
      normalizedSkillIds,
      selectedPath: promptSkillPath,
      closed: true,
    },
    promptProvenance: promptProvenance || null,
    contextCompletenessReportPath: contextCompletenessReportPath || null,
  };
  return persistBuildReport(projectId, 'build-source/reports/prompt-bundle-report.json', report);
}

export async function archiveBuildInBricksReport({
  projectId,
  evidenceRunId,
  file,
  archiveName,
}: {
  projectId: string;
  evidenceRunId: string;
  file: ProjectFile | null;
  archiveName: string;
}): Promise<ProjectFile | null> {
  if (!file) return null;
  const path = file.path || file.name;
  if (!path) return null;
  const content = await fetchBuildInBricksScratchProjectFileText(projectId, path);
  if (content === null) return null;
  return writeBuildInBricksScratchProjectTextFile(
    projectId,
    `build-source/runs/${evidenceRunId}/reports/${archiveName}`,
    content,
  );
}

async function persistBuildReport(
  projectId: string,
  path: string,
  report: unknown,
): Promise<ProjectFile | null> {
  try {
    return await writeBuildInBricksScratchProjectTextFile(
      projectId,
      path,
      `${JSON.stringify(report, null, 2)}\n`,
    );
  } catch {
    return null;
  }
}
