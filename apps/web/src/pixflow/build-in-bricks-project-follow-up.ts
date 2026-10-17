import { PIXFLOW_BUILD_IN_BRICKS_SOURCE_INDEX_PATH } from './build-in-bricks-source-provenance';

export type BuildInBricksProjectLike = {
  id: string;
  metadata?: object | null;
};

export type BuildInBricksRetainedScope = 'full_page' | 'section' | 'component';

export const BUILD_IN_BRICKS_RETAINED_SOURCE_INDEX_PATH = PIXFLOW_BUILD_IN_BRICKS_SOURCE_INDEX_PATH;

type RetainedSourceIndexEntry = {
  projectId?: unknown;
  targetPostId?: unknown;
  scope?: unknown;
  status?: unknown;
  updatedAt?: unknown;
};

export type BuildInBricksRetainedFollowUpResult =
  | { handled: false }
  | { handled: true; dispatched: false; error: string }
  | { handled: true; dispatched: true; scope: BuildInBricksRetainedScope };

/**
 * Canonical Build projects are identified only by the explicit Build source
 * contract/metadata written by the Build route. Historical Prototype flags do
 * not grant ordinary-Build ownership.
 */
export function isCanonicalBuildInBricksSourceProject(project: BuildInBricksProjectLike): boolean {
  const metadata = project.metadata && typeof project.metadata === 'object'
    ? project.metadata as Record<string, unknown>
    : {};
  return String(metadata.sourceContract || '') === 'build-in-bricks-html-first'
    && String(metadata.pixflowPipeline || '') === 'build-in-bricks'
    && (
      metadata.pixflowBuildInBricksSource === true
      || String(metadata.kind || '') === 'build-in-bricks'
      || String(metadata.intent || '') === 'pixflow_build_in_bricks_source'
    );
}

function normalizeRetainedScope(value: unknown): BuildInBricksRetainedScope | null {
  return value === 'full_page' || value === 'section' || value === 'component' ? value : null;
}

function resolveRetainedScope(
  rawSourceIndex: string,
  projectId: string,
  targetPostId: number,
): BuildInBricksRetainedScope | null {
  try {
    const parsed = JSON.parse(rawSourceIndex) as { schema?: unknown; entries?: unknown };
    if (parsed.schema !== 'pixflow.build_in_bricks.source_index.v1' || !Array.isArray(parsed.entries)) {
      return null;
    }
    const candidates = (parsed.entries as RetainedSourceIndexEntry[])
      .filter((entry) => String(entry.projectId || '') === projectId)
      .filter((entry) => Number(entry.targetPostId || 0) === targetPostId)
      .filter((entry) => String(entry.status || '') === 'active')
      .map((entry) => ({
        scope: normalizeRetainedScope(entry.scope),
        updatedAt: Date.parse(String(entry.updatedAt || '')) || 0,
      }))
      .filter((entry): entry is { scope: BuildInBricksRetainedScope; updatedAt: number } => Boolean(entry.scope))
      .sort((left, right) => right.updatedAt - left.updatedAt);
    return candidates[0]?.scope || null;
  } catch {
    return null;
  }
}

function defaultRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `build-retained:${crypto.randomUUID()}`;
  }
  return `build-retained:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Re-enter an existing ordinary Build through the builder-owned HTML-first
 * route. A canonical Build project must never fall through to generic project
 * chat because that path does not own conversion, insertion, or native drift.
 */
export async function dispatchBuildInBricksRetainedFollowUp({
  project,
  prompt,
  targetPostId,
  readSourceIndex,
  postMessage,
  createRequestId = defaultRequestId,
}: {
  project: BuildInBricksProjectLike;
  prompt: string;
  targetPostId: number;
  readSourceIndex: (projectId: string, path: string) => Promise<string | null>;
  postMessage: (message: Record<string, unknown>) => void;
  createRequestId?: () => string;
}): Promise<BuildInBricksRetainedFollowUpResult> {
  if (!isCanonicalBuildInBricksSourceProject(project)) return { handled: false };
  if (!Number.isInteger(targetPostId) || targetPostId <= 0) {
    return {
      handled: true,
      dispatched: false,
      error: 'Open the Build project from its target Bricks page before editing retained source.',
    };
  }

  let rawSourceIndex = '';
  try {
    rawSourceIndex = await readSourceIndex(project.id, BUILD_IN_BRICKS_RETAINED_SOURCE_INDEX_PATH) || '';
  } catch {
    // Report one deterministic reconciliation error below. Generic project
    // chat is not a safe fallback for a retained Build mutation.
  }
  const scope = resolveRetainedScope(rawSourceIndex, project.id, targetPostId);
  if (!scope) {
    return {
      handled: true,
      dispatched: false,
      error: 'This retained Build source does not have an active ownership record for the current Bricks page. Reconciliation is required before editing.',
    };
  }

  const requestId = createRequestId();
  postMessage({
    source: 'pixflow-design',
    type: 'pixflow-design:send-bricks-agent-prompt',
    reason: 'build-in-bricks-retained-source-edit',
    prompt,
    patch: {
      mode: 'design',
      projectId: project.id,
      generationScope: scope,
      displayPrompt: prompt,
      promptSkillIds: ['build-in-bricks-html-first'],
      semanticPreflightResolved: true,
      externalRequestId: requestId,
      intentContract: {
        intent: 'build_in_bricks',
        scope,
        mediaPolicy: 'existing',
        state: 'ready',
        confidence: 1,
        clarification: null,
        skillIds: ['build-in-bricks-html-first'],
        capabilityIds: ['html_source_write', 'bricks_canvas_write'],
        rationale: 'The open project is canonical retained Build source for the current Bricks page.',
      },
      continuation: {
        originalPrompt: prompt,
        retryLifecycle: 'retained_source_edit',
      },
    },
  });
  return { handled: true, dispatched: true, scope };
}
