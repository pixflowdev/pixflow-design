import type {
  ChatSessionMode,
  PixflowHtmlToBricksRunObservation,
  PixflowHtmlToBricksTerminalClass,
  PixflowHtmlToBricksTerminalCode,
  WorkspaceContextItem,
  PixflowBuildInBricksThemeStyleContext,
  PixflowBuildInBricksThemeStylePolicy,
  PixflowBuildInBricksSourceLifecycle,
} from '@open-design/contracts';
import { normalizePixflowBuildInBricksSourceLifecycle } from '@open-design/contracts';
import type { ChatAttachment, ChatCommentAttachment, ProjectFile } from '../types';
import type { PrototypeBricksRunBundle } from './prototype-bricks-run-bundle';
import type { BuildInBricksGenerationRequirement, BricksBuildAttemptCorrelation } from '@open-design/contracts';
import type { BuildInBricksScopedPlacement } from './bricks-scoped-placement';
import type {
  PixflowBricksBuildEvidence,
  PixflowBricksSourceMetadata,
} from './bricks-source-handoff-types';
export type {
  PixflowBricksBuildEvidence,
  PixflowBricksSourceMetadata,
} from './bricks-source-handoff-types';

export type PixflowBricksAgentStatus = 'handoff-ready' | 'loading' | 'ready' | 'error';
export type PixflowBricksHandoffState = 'planning' | 'qa' | 'ready-to-apply' | 'applied' | 'failed';

export type PixflowBricksAgentWorkspaceItem = {
  id: string;
  kind: WorkspaceContextItem['kind'];
  label: string;
  tabId?: string;
  path?: string;
  url?: string;
  title?: string;
};

export type PixflowBricksAgentSourceFile = {
  name: string;
  path: string | null;
  kind: string;
  mime: string;
  artifactKind: string | null;
  size: number;
  mtime: number;
  title: string | null;
  identifier: string | null;
};

export type PixflowBricksHandoffFileRole =
  | 'primary_html'
  | 'context'
  | 'reference_screenshot'
  | 'asset';

export type PixflowBricksHandoffFile = PixflowBricksAgentSourceFile & {
  role: PixflowBricksHandoffFileRole;
  order: number;
};

export type PixflowBricksConversionProfile = 'uploaded_html' | 'prototype_bricks';

/**
 * The source contract is the ownership boundary for the new Build pipeline.
 * Legacy HTML-to-Bricks and source-fidelity clone payloads may still carry the
 * historical Prototype/Stage-B fields, but an ordinary generated Build must
 * never be routed through that optional legacy continuation.
 */
export const BUILD_IN_BRICKS_SOURCE_CONTRACT = 'build-in-bricks-html-first' as const;

export function isBuildInBricksHtmlFirstPayload(
  payload: {
    sourceContract?: unknown;
    buildSource?: { sourceFidelityClone?: unknown } | null;
    stageASource?: { sourceFidelityClone?: unknown } | null;
  } | null | undefined,
): boolean {
  return payload?.sourceContract === BUILD_IN_BRICKS_SOURCE_CONTRACT
    && (payload.buildSource || payload.stageASource)?.sourceFidelityClone !== true;
}

export function allowsLegacyBricksStageB(
  payload: {
    sourceContract?: unknown;
    buildSource?: { sourceFidelityClone?: unknown } | null;
    stageASource?: { sourceFidelityClone?: unknown } | null;
  } | null | undefined,
): boolean {
  return !isBuildInBricksHtmlFirstPayload(payload);
}

/** Canonical source accessor with a narrow historical Stage A fallback. */
export function getPixflowBricksAgentSource(
  payload: { buildSource?: PixflowBricksSourceMetadata | null; stageASource?: PixflowBricksSourceMetadata | null } | null | undefined,
): PixflowBricksSourceMetadata | null {
  return payload?.buildSource || payload?.stageASource || null;
}

/**
 * Read-side adapter for historical ordinary-Build payloads.
 *
 * Legacy Stage-A fields are consumed once and removed so modern handoff,
 * conversion and QA code operate only on canonical Build state. Prototype and
 * source-fidelity payloads are deliberately left untouched.
 */
export function normalizeBuildInBricksCompatibilityPayload(
  payload: PixflowBricksAgentSessionPayload,
): PixflowBricksAgentSessionPayload {
  if (payload.sourceContract !== BUILD_IN_BRICKS_SOURCE_CONTRACT) return payload;
  const {
    stageASource,
    stageAEntryContractRevision,
    stageAContextRevision,
    stageASkillVersion,
    stageAPageFingerprint,
    stageALifecycle,
    stageAEvidence,
    ...canonical
  } = payload;
  return {
    ...canonical,
    pipelineId: 'build-in-bricks',
    themeStylePolicy: 'inherit_effective',
    ...(canonical.buildSource || stageASource ? { buildSource: canonical.buildSource || stageASource } : {}),
    ...(canonical.sourceEntryContractRevision || stageAEntryContractRevision
      ? { sourceEntryContractRevision: canonical.sourceEntryContractRevision || stageAEntryContractRevision || undefined }
      : {}),
    ...(canonical.buildContextRevision || stageAContextRevision
      ? { buildContextRevision: canonical.buildContextRevision || stageAContextRevision || null }
      : {}),
    ...(canonical.buildSkillVersion || stageASkillVersion
      ? { buildSkillVersion: canonical.buildSkillVersion || stageASkillVersion || null }
      : {}),
    ...(canonical.buildPageFingerprint || stageAPageFingerprint
      ? { buildPageFingerprint: canonical.buildPageFingerprint || stageAPageFingerprint || null }
      : {}),
    ...(canonical.buildLifecycle || stageALifecycle
      ? { buildLifecycle: normalizePixflowBuildInBricksSourceLifecycle(canonical.buildLifecycle || stageALifecycle) }
      : {}),
    ...(canonical.buildEvidence || stageAEvidence
      ? { buildEvidence: canonical.buildEvidence || stageAEvidence || null }
      : {}),
  };
}

/** @deprecated Historical persisted Stage-A field shape; use PixflowBricksSourceMetadata. */
export type PixflowBricksStageASourceMetadata = PixflowBricksSourceMetadata;

export type PixflowBricksStageALifecycle = Partial<Record<
  | 'stage_a_started'
  | 'route_context_fetch_start'
  | 'route_context_fetch_end'
  | 'prompt_build_start'
  | 'prompt_build_end'
  | 'first_model_output'
  | 'first_artifact_write'
  | 'screenshot_capture_start'
  | 'screenshot_capture_end'
  | 'stage_a_finished',
  number
>>;

/** @deprecated Historical persisted Stage-A evidence; use PixflowBricksBuildEvidence. */
export type PixflowBricksStageAEvidence = PixflowBricksBuildEvidence;

export type PixflowBricksAgentMessage = {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  agentId?: string;
  agentName?: string;
  sessionMode?: ChatSessionMode;
  attachments?: ChatAttachment[];
  commentAttachments?: ChatCommentAttachment[];
  runStatus?: 'running' | 'succeeded' | 'failed' | 'canceled';
  events?: unknown[];
  status?: 'draft' | 'queued' | 'streaming' | 'complete' | 'error';
  awaitingInput?: boolean;
  clarificationKind?: string;
};

export type PixflowBricksAgentSession = {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: PixflowBricksAgentStatus;
  mode: ChatSessionMode;
  // Pixflow-owned: the Bricks handoff model pass is isolated from normal
  // generation, but it still needs the workspace-selected local runner/model.
  runnerId: string | null;
  selectedModel: string | null;
  reasoning: string | null;
  fastMode?: boolean;
  error: string | null;
  messages: PixflowBricksAgentMessage[];
};

export type PixflowBricksAgentTargetContext = {
  postId: number | null;
  postTitle?: string | null;
  postStatus?: string | null;
  builderUrl?: string | null;
  editLink?: string | null;
  source?: 'existing-page' | 'created-page' | 'current-builder' | null;
  area: string;
  elementCount: number | null;
  topSections: number | null;
  selectedId: string | null;
};

export type PixflowBricksAgentSessionPayload = {
  version: 2;
  createdAt: number;
  source: 'pixflow-design-workspace';
  reason: 'handoff-to-bricks';
  handoffMode?: 'convert' | 'page';
  handoffState: PixflowBricksHandoffState;
  projectId: string | null;
  buildAttempt?: BricksBuildAttemptCorrelation | null;
  activeFileName: string | null;
  session: PixflowBricksAgentSession;
  targetContext: PixflowBricksAgentTargetContext;
  workspaceItem: PixflowBricksAgentWorkspaceItem | null;
  workspaceItems: PixflowBricksAgentWorkspaceItem[];
  sourceFile: PixflowBricksAgentSourceFile | null;
  handoffFiles: PixflowBricksHandoffFile[];
  sourceAvailable: boolean;
  htmlCandidate: boolean;
  projectFileCount: number;
  htmlFileCount: number;
  draftPresent: boolean;
  draftPreview: string;
  sectionCount: number | null;
  conversionProfile?: PixflowBricksConversionProfile;
  // Identifies the source authority used only by ordinary Build in Bricks.
  // Other HTML-to-Bricks routes must not be treated as HTML-native editable
  // pages merely because they also carry an HTML artifact.
  sourceContract?: 'build-in-bricks-html-first';
  /** Canonical ordinary Build source metadata. */
  buildSource?: PixflowBricksSourceMetadata | null;
  buildContextRevision?: string | null;
  buildSkillVersion?: string | null;
  buildPageFingerprint?: string | null;
  buildLifecycle?: PixflowBuildInBricksSourceLifecycle | null;
  buildEvidence?: PixflowBricksBuildEvidence | null;
  /** Historical persisted/import compatibility field; new Build writes omit it. */
  stageAContextRevision?: string | null;
  stageASkillVersion?: string | null;
  stageAPageFingerprint?: string | null;
  sourceIndex?: {
    status: 'saved' | 'not_saved';
    path: string;
    sourceId?: string | null;
    message: string;
  } | null;
  /** Verified ownership of the previously converted source used by an HTML-native follow-up edit. */
  retainedSourceOwnership?: {
    sourceId: string;
    convertedElementIds: string[];
    convertedGlobalClassIds: string[];
    fragmentNamespace: string | null;
    placement: Record<string, unknown> | null;
  } | null;
  stageASource?: PixflowBricksSourceMetadata | null;
  pipelineId?: 'build-in-bricks' | 'prototype-html' | null;
  stageAEntryContractRevision?: string | null;
  sourceEntryContractRevision?: string | null;
  themeStylePolicy?: PixflowBuildInBricksThemeStylePolicy | null;
  themeStyleContext?: PixflowBuildInBricksThemeStyleContext | null;
  themeStyleSnapshotHash?: string | null;
  generationScope?: 'full_page' | 'section' | 'component';
  scopedPlacement?: BuildInBricksScopedPlacement | null;
  generationRequirements?: BuildInBricksGenerationRequirement[];
  generationPrompt?: string;
  stageALifecycle?: PixflowBricksStageALifecycle | null;
  stageAEvidence?: PixflowBricksStageAEvidence | null;
  sourceDiagnostics?: Extract<PixflowHtmlToBricksRunObservation, { kind: 'source' }> | null;
  prototypeHtmlCritique?: {
    ok: boolean;
    issues: string[];
    repaired: boolean;
    designPlan?: unknown;
    qualityGate?: unknown;
  } | null;
  runBundle?: PrototypeBricksRunBundle | null;
  initialInsert?: {
    ok?: boolean;
    code?: string;
    terminalCode?: PixflowHtmlToBricksTerminalCode;
    terminalClass?: PixflowHtmlToBricksTerminalClass;
    message?: string;
    postId?: number;
    area?: string;
    operation?: string;
    replaceExisting?: boolean;
    summary?: Record<string, unknown>;
    qaAssessment?: {
      source?: 'post_conversion';
      status?: 'passed' | 'warning' | 'failed' | 'unavailable';
      warnings?: string[];
    };
    livePayload?: {
      postId?: number;
      area?: string;
      replaceExisting?: boolean;
      content?: unknown[];
      globalClasses?: unknown[];
    };
    builderUrl?: string | null;
    editLink?: string | null;
    // Pixflow-owned: apply request is created during handoff preparation but
    // only submitted by the builder panel after user confirmation.
    applyRequest?: Record<string, unknown>;
    handoffChatEvents?: unknown[];
    refinementWorkspaceDir?: string;
    status?: number;
  } | null;
};

// Pixflow-owned: Bricks Agent handoff sessions are metadata-only. The local
// builder panel owns live Bricks context, and later stages fetch/parse artifacts
// explicitly instead of embedding generated HTML in the postMessage payload.
export function buildPixflowBricksAgentSessionPayload({
  projectId,
  activeProjectFileName,
  projectFiles,
  workspaceItem,
  workspaceItems,
  activeDraft,
  mode,
  runnerId,
  selectedModel,
  reasoning,
  fastMode = false,
  targetPage,
  initialMessages,
  stageASource,
  buildSource,
  pipelineId,
  stageAEntryContractRevision,
  sourceEntryContractRevision,
  themeStylePolicy,
  themeStyleContext,
  sourceContract,
  buildContextRevision,
  buildSkillVersion,
  buildPageFingerprint,
  buildLifecycle,
  buildEvidence,
  stageAContextRevision,
  stageASkillVersion,
  stageAPageFingerprint,
  stageALifecycle,
  stageAEvidence,
  generationScope = 'full_page',
  scopedPlacement = null,
  generationRequirements = [],
}: {
  projectId: string | null;
  activeProjectFileName: string | null;
  projectFiles: ProjectFile[];
  workspaceItem: WorkspaceContextItem | null;
  workspaceItems: WorkspaceContextItem[];
  activeDraft: string;
  mode: ChatSessionMode;
  selectedModel?: string | null;
  runnerId?: string | null;
  reasoning?: string | null;
  fastMode?: boolean;
  initialMessages?: PixflowBricksAgentMessage[];
  stageASource?: PixflowBricksSourceMetadata | null;
  buildSource?: PixflowBricksSourceMetadata | null;
  pipelineId?: 'build-in-bricks' | 'prototype-html' | null;
  stageAEntryContractRevision?: string | null;
  sourceEntryContractRevision?: string | null;
  themeStylePolicy?: PixflowBuildInBricksThemeStylePolicy | null;
  themeStyleContext?: PixflowBuildInBricksThemeStyleContext | null;
  sourceContract?: 'build-in-bricks-html-first';
  buildContextRevision?: string | null;
  buildSkillVersion?: string | null;
  buildPageFingerprint?: string | null;
  buildLifecycle?: PixflowBuildInBricksSourceLifecycle | null;
  buildEvidence?: PixflowBricksBuildEvidence | null;
  /** Historical Prototype/Stage-A input names retained for non-Build callers. */
  stageAContextRevision?: string | null;
  stageASkillVersion?: string | null;
  stageAPageFingerprint?: string | null;
  stageALifecycle?: PixflowBricksStageALifecycle | null;
  stageAEvidence?: PixflowBricksStageAEvidence | null;
  generationScope?: 'full_page' | 'section' | 'component';
  scopedPlacement?: BuildInBricksScopedPlacement | null;
  generationRequirements?: BuildInBricksGenerationRequirement[];
  targetPage?: {
    id: number;
    title: string;
    status?: string;
    builderUrl?: string | null;
    editLink?: string | null;
    source?: 'existing-page' | 'created-page' | 'current-builder';
    elementCount?: number | null;
    topSections?: number | null;
  } | null;
}): PixflowBricksAgentSessionPayload {
  const createdAt = Date.now();
  const sourceFile = findPixflowBricksHandoffSourceFile({
    projectFiles,
    workspaceItem,
    activeProjectFileName,
  });
  const handoffFiles = buildPixflowBricksHandoffFiles(projectFiles, sourceFile);
  const htmlFiles = projectFiles.filter(isPixflowBricksHtmlProjectFile);
  const draftPreview = compactPixflowHandoffText(activeDraft, 240);
  // Theme Style policy is flow-owned just like the source field. A
  // compatibility/Clone envelope cannot be allowed to carry an inherited
  // Build policy through a caller-supplied field; its source-fidelity route
  // is always explicitly isolated. Legacy envelopes without a pipeline id
  // retain their historical value for the compatibility reader.
  const flowThemeStylePolicy = pipelineId === 'prototype-html'
    ? 'isolated' as const
    : themeStylePolicy;
  const sessionMessages = Array.isArray(initialMessages) && initialMessages.length > 0
    ? initialMessages
    : [
      {
        id: createPixflowBricksAgentMessageId('system'),
        role: 'system' as const,
        content: 'Bricks Agent handoff received. Waiting for builder context.',
        createdAt,
        status: 'complete' as const,
      },
    ];

  return {
    version: 2,
    createdAt,
    source: 'pixflow-design-workspace',
    // Pixflow-owned: keep the historical action id in the UI catalogue, but
    // the session reason is the new gated handoff boundary.
    reason: 'handoff-to-bricks',
    handoffState: 'planning',
    projectId: projectId || null,
    activeFileName: activeProjectFileName || null,
    session: {
      id: createPixflowBricksAgentSessionId(),
      createdAt,
      updatedAt: createdAt,
      status: 'handoff-ready',
      mode,
      runnerId: runnerId || null,
      selectedModel: selectedModel || null,
      reasoning: reasoning || null,
      fastMode: fastMode === true,
      error: null,
      messages: sessionMessages,
    },
    targetContext: {
      postId: targetPage?.id ?? null,
      postTitle: targetPage?.title ?? null,
      postStatus: targetPage?.status ?? null,
      builderUrl: targetPage?.builderUrl ?? null,
      editLink: targetPage?.editLink ?? null,
      source: targetPage?.source ?? null,
      area: 'content',
      elementCount: typeof targetPage?.elementCount === 'number' && Number.isFinite(targetPage.elementCount)
        ? targetPage.elementCount
        : null,
      topSections: typeof targetPage?.topSections === 'number' && Number.isFinite(targetPage.topSections)
        ? targetPage.topSections
        : null,
      selectedId: null,
    },
    workspaceItem: sanitizePixflowBricksWorkspaceItem(workspaceItem),
    workspaceItems: workspaceItems
      .map(sanitizePixflowBricksWorkspaceItem)
      .filter((item): item is PixflowBricksAgentWorkspaceItem => Boolean(item))
      .slice(0, 8),
    sourceFile: sourceFile ? sanitizePixflowBricksSourceFile(sourceFile) : null,
    handoffFiles,
    sourceAvailable: Boolean(sourceFile),
    htmlCandidate: Boolean(sourceFile && isPixflowBricksHtmlProjectFile(sourceFile)),
    projectFileCount: projectFiles.length,
    htmlFileCount: htmlFiles.length,
    draftPresent: Boolean(draftPreview),
    draftPreview,
    sectionCount: null,
    // An explicit flow owns its source shape. Do not silently promote a
    // historical Stage-A field into a new Build write: persisted legacy
    // payloads are normalized by compatibility readers before they reach
    // this writer, while a fresh Build must supply the canonical field.
    ...(pipelineId === 'build-in-bricks'
      ? (buildSource ? { buildSource } : {})
      : (stageASource ? { stageASource } : {})),
    ...(pipelineId ? { pipelineId } : {}),
    ...(pipelineId === 'build-in-bricks'
      ? (sourceEntryContractRevision ? { sourceEntryContractRevision } : {})
      : (stageAEntryContractRevision ? { stageAEntryContractRevision } : {})),
    ...(flowThemeStylePolicy ? { themeStylePolicy: flowThemeStylePolicy } : {}),
    ...(themeStyleContext ? {
      themeStyleContext,
      themeStyleSnapshotHash: themeStyleContext.snapshotHash,
    } : {}),
    // A compatibility/Clone payload may still contain an HTML source, but it
    // must never advertise the ordinary Build source contract.  Keep this
    // discriminator flow-owned just like buildSource/buildLifecycle above.
    ...(pipelineId === 'build-in-bricks' && sourceContract ? { sourceContract } : {}),
    ...(pipelineId === 'build-in-bricks'
      ? {
          ...(buildContextRevision ? { buildContextRevision } : {}),
          ...(buildSkillVersion ? { buildSkillVersion } : {}),
          ...(buildPageFingerprint ? { buildPageFingerprint } : {}),
          ...(buildLifecycle ? { buildLifecycle: normalizePixflowBuildInBricksSourceLifecycle(buildLifecycle) } : {}),
          ...(buildEvidence ? { buildEvidence } : {}),
        }
      : {
          ...(stageAContextRevision ? { stageAContextRevision } : {}),
          ...(stageASkillVersion ? { stageASkillVersion } : {}),
          ...(stageAPageFingerprint ? { stageAPageFingerprint } : {}),
        }),
    generationScope,
    scopedPlacement,
    generationRequirements: generationRequirements.slice(0, 12),
    generationPrompt: activeDraft.slice(0, 4_000),
  };
}

export function buildPixflowBricksHandoffFiles(
  projectFiles: ProjectFile[],
  sourceFile: ProjectFile | null,
): PixflowBricksHandoffFile[] {
  const sourcePath = normalizePixflowProjectFileKey(sourceFile?.path || sourceFile?.name);
  const sourceDirectory = sourcePath.includes('/')
    ? sourcePath.slice(0, sourcePath.lastIndexOf('/') + 1)
    : '';
  return [...projectFiles]
    .sort((left, right) => {
      const leftPath = normalizePixflowProjectFileKey(left.path || left.name);
      const rightPath = normalizePixflowProjectFileKey(right.path || right.name);
      const rank = (filePath: string) => {
        if (sourcePath && filePath === sourcePath) return 0;
        if (filePath === 'stage-a/composition-dna.md' || filePath.endsWith('/composition-dna.md')) return 1;
        if (/(?:stage-a\/(?:source|drafts)|build-source\/source)\/assets\//.test(filePath)) return 2;
        // A workspace-built HTML artifact is often accompanied by sibling CSS,
        // JS, fonts, and media. Keep that document bundle ahead of reports and
        // unrelated workspace files so the floating-panel converter receives
        // the same source graph as the dedicated HTML-to-Bricks flow.
        if (isPixflowHandoffSourceBundleFile(filePath, sourceDirectory)) return 2;
         if (filePath.startsWith('build-source/context/')) return 3;
         if (filePath.startsWith('stage-a/context/')) return 4;
         if (/stage-a\/(?:runs\/[^/]+\/)?(?:captures|screenshots|reports)\//.test(filePath)) return 5;
         return 6;
      };
      return rank(leftPath) - rank(rightPath);
    })
    .filter((file) => {
      if (file.type === 'dir') return false;
      const filePath = normalizePixflowProjectFileKey(file.path || file.name);
      return !filePath.startsWith('pixflow/handoffs/bricks/');
    })
    .map((file, index) => {
      const sanitized = sanitizePixflowBricksSourceFile(file);
      const fileKey = normalizePixflowProjectFileKey(file.path || file.name);
      const role: PixflowBricksHandoffFileRole = sourcePath && fileKey === sourcePath
        ? 'primary_html'
        : inferPixflowBricksHandoffFileRole(file);
      return {
        ...sanitized,
        role,
        order: index,
      };
    })
    .filter((file) => file.role === 'primary_html' || file.role === 'context' || file.role === 'reference_screenshot' || file.role === 'asset')
    .slice(0, 64);
}

/**
 * Canonical Build may reference project-local media produced through its
 * bounded source workspace. Keep only files in the owned asset directory;
 * reports, screenshots and unrelated project output remain outside the
 * conversion source bundle.
 */
export function selectBuildInBricksSourceAssetFiles(projectFiles: ProjectFile[]): ProjectFile[] {
  return projectFiles.filter((file) => {
    if (file.type === 'dir') return false;
    const filePath = normalizePixflowProjectFileKey(file.path || file.name);
    return /^build-source\/source\/assets\/.+\.(?:avif|gif|jpe?g|png|svg|webp|m4a|mov|mp3|mp4|ogg|wav|webm|woff2?|ttf|otf)$/i.test(filePath);
  }).slice(0, 48);
}

function isPixflowHandoffSourceBundleFile(filePath: string, sourceDirectory: string): boolean {
  if (sourceDirectory && !filePath.startsWith(sourceDirectory)) return false;
  if (!sourceDirectory && filePath.includes('/')) return false;
  return /\.(?:css|js|mjs|cjs|svg|png|jpe?g|webp|gif|avif|mp4|webm|mov|woff2?|ttf|otf)$/i.test(filePath);
}

function inferPixflowBricksHandoffFileRole(file: ProjectFile): PixflowBricksHandoffFileRole {
  const name = `${file.path || ''} ${file.name || ''}`.toLowerCase();
  const mime = String(file.mime || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(?:png|jpe?g|webp|gif|avif)$/i.test(name)) {
    return /screenshot|screen|reference|ref|mockup|capture/i.test(name)
      ? 'reference_screenshot'
      : 'asset';
  }
  if (/\.(?:md|markdown|txt|docx?|pdf|csv|json)$/i.test(name)) {
    return 'context';
  }
  if (/\.(?:svg|mp4|webm|mov|woff2?|ttf|otf)$/i.test(name)) {
    return 'asset';
  }
  return 'context';
}

function createPixflowBricksAgentSessionId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `bricks-agent:${cryptoApi.randomUUID()}`;
  }
  return `bricks-agent:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function createPixflowBricksAgentMessageId(prefix: string): string {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizePixflowBricksWorkspaceItem(
  item: WorkspaceContextItem | null | undefined,
): PixflowBricksAgentWorkspaceItem | null {
  if (!item) return null;
  return {
    id: item.id,
    kind: item.kind,
    label: item.label || item.path || item.title || item.id,
    ...(item.tabId ? { tabId: item.tabId } : {}),
    ...(item.path ? { path: item.path } : {}),
    ...(item.url ? { url: item.url } : {}),
    ...(item.title ? { title: item.title } : {}),
  };
}

function sanitizePixflowBricksSourceFile(file: ProjectFile): PixflowBricksAgentSourceFile {
  const manifest = file.artifactManifest as { title?: string; identifier?: string } | undefined;
  return {
    name: file.name,
    path: file.path || null,
    kind: String(file.kind || ''),
    mime: file.mime || '',
    artifactKind: file.artifactKind ? String(file.artifactKind) : null,
    size: Number.isFinite(file.size) ? file.size : 0,
    mtime: Number.isFinite(file.mtime) ? file.mtime : 0,
    title: manifest?.title || null,
    identifier: manifest?.identifier || null,
  };
}

function findPixflowBricksHandoffSourceFile({
  projectFiles,
  workspaceItem,
  activeProjectFileName,
}: {
  projectFiles: ProjectFile[];
  workspaceItem: WorkspaceContextItem | null;
  activeProjectFileName: string | null;
}): ProjectFile | null {
  const contextMatch = findPixflowProjectFileMatch(projectFiles, [
    workspaceItem?.path,
    workspaceItem?.label,
    workspaceItem?.title,
    workspaceItem?.id,
  ]);
  if (contextMatch) return contextMatch;

  const activeMatch = findPixflowProjectFileMatch(projectFiles, [activeProjectFileName]);
  if (activeMatch) return activeMatch;

  const htmlFiles = projectFiles
    .filter((file) => file.type !== 'dir' && isPixflowBricksHtmlProjectFile(file))
    .sort((a, b) => (b.mtime || 0) - (a.mtime || 0));

  return htmlFiles[0] || null;
}

function findPixflowProjectFileMatch(
  projectFiles: ProjectFile[],
  identifiers: Array<string | null | undefined>,
): ProjectFile | null {
  const normalized = identifiers
    .map((value) => normalizePixflowProjectFileKey(value))
    .filter(Boolean);
  if (!normalized.length) return null;

  return projectFiles.find((file) => {
    if (file.type === 'dir') return false;
    const fileKeys = [
      normalizePixflowProjectFileKey(file.path),
      normalizePixflowProjectFileKey(file.name),
      normalizePixflowProjectFileKey(basenamePixflowProjectFileKey(file.path || file.name)),
    ].filter(Boolean);
    return normalized.some((identifier) => fileKeys.includes(identifier));
  }) || null;
}

function isPixflowBricksHtmlProjectFile(file: ProjectFile): boolean {
  const name = `${file.path || ''} ${file.name || ''}`.toLowerCase();
  return (
    String(file.kind || '').toLowerCase() === 'html' ||
    String(file.artifactKind || '').toLowerCase() === 'html' ||
    String(file.mime || '').toLowerCase().includes('html') ||
    /\.html?$/.test(name)
  );
}

function normalizePixflowProjectFileKey(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .replace(/^file:/i, '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .toLowerCase();
}

function basenamePixflowProjectFileKey(value: string | null | undefined): string {
  const normalized = normalizePixflowProjectFileKey(value);
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

function compactPixflowHandoffText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}
