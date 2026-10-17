import type {
  PixflowBuildInBricksPagePlan as BuildInBricksPagePlan,
  PixflowBuildInBricksDesignContext as BuildInBricksDesignContext,
  PixflowBuildInBricksGenerationScope,
} from './pixflow-build-in-bricks-context.js';
import {
  normalizePixflowBuildInBricksDesignContext as normalizeBuildContext,
} from './pixflow-build-in-bricks-context.js';
import type { PixflowBuildInBricksThemeStyleContext, PixflowBuildInBricksThemeStylePolicy } from './pixflow-build-in-bricks-theme-style.js';
import type { PixflowBuildInBricksSkillManifest } from './pixflow-build-in-bricks-skills.js';
import type { PixflowPromptProvenance } from './pixflow-prompt-provenance.js';

/**
 * Canonical name for the ordinary Build operation. The historical Stage A
 * schema/path remains readable for persisted runs, but new code should use
 * this semantic source-generation contract instead of a numbered stage.
 */
export const PIXFLOW_BUILD_IN_BRICKS_SOURCE_SCHEMA = 'pixflow.build_in_bricks.source_generation.v1' as const;
export const PIXFLOW_BUILD_IN_BRICKS_SOURCE_ENTRY_CONTRACT = 'build-in-bricks-source-generation.v1' as const;

/**
 * Canonical logical paths exposed to new Build runs. The old stage-a paths
 * remain available below as an explicit compatibility representation only.
 */
export const PIXFLOW_BUILD_IN_BRICKS_SOURCE_ARTIFACT_PATHS = {
  html: 'build-source/source/index.html',
  css: 'build-source/source/styles.css',
  js: 'build-source/source/script.js',
} as const;

/**
 * Historical physical paths readable by compatibility adapters. New Build
 * contracts must never use these as their primary artifact paths.
 */
export const PIXFLOW_BUILD_IN_BRICKS_COMPATIBILITY_ARTIFACT_PATHS = {
  html: 'stage-a/source/index.html',
  css: 'stage-a/source/styles.css',
  js: 'stage-a/source/script.js',
} as const;

/** @deprecated Use PIXFLOW_BUILD_IN_BRICKS_SOURCE_ARTIFACT_PATHS. */
export const PIXFLOW_BUILD_IN_BRICKS_SOURCE_LOGICAL_ARTIFACT_PATHS = PIXFLOW_BUILD_IN_BRICKS_SOURCE_ARTIFACT_PATHS;

export type PixflowBuildInBricksSourceRequestBundle = {
  version: 1;
  schema: typeof PIXFLOW_BUILD_IN_BRICKS_SOURCE_SCHEMA;
  requestId: string;
  scope: PixflowBuildInBricksGenerationScope;
  userRequest: string;
  targetTitle: string;
  skill: { id: 'build-in-bricks-html-first'; version: string };
  context: BuildInBricksDesignContext & {
    themeStyle?: PixflowBuildInBricksThemeStyleContext;
  };
  themeStylePolicy?: PixflowBuildInBricksThemeStylePolicy;
  themeStyleSnapshotHash?: string;
  skillManifest: PixflowBuildInBricksSkillManifest;
  businessContext: Record<string, unknown>;
  pageContext: Record<string, unknown>;
  pagePlan: BuildInBricksPagePlan | null;
  existingSource: { html?: string; css?: string; js?: string; hash?: string } | null;
  promptProvenance?: PixflowPromptProvenance;
  /** Logical paths exposed to the agent; the physical compatibility paths are internal. */
  artifacts: {
    htmlPath: typeof PIXFLOW_BUILD_IN_BRICKS_SOURCE_ARTIFACT_PATHS.html;
    cssPath: typeof PIXFLOW_BUILD_IN_BRICKS_SOURCE_ARTIFACT_PATHS.css;
    jsPath: typeof PIXFLOW_BUILD_IN_BRICKS_SOURCE_ARTIFACT_PATHS.js;
    jsOptional: true;
  };
};

export type PixflowBuildInBricksSource = {
  schema: 'pixflow.build_in_bricks.source.v1';
  html: string;
  css: string;
  js?: string | null;
  pagePlan?: BuildInBricksPagePlan | null;
  provider: 'local-cli' | 'byok-api';
  runId?: string | null;
  warnings: string[];
  sourceContract?: typeof PIXFLOW_BUILD_IN_BRICKS_SOURCE_SCHEMA;
  themeStylePolicy?: PixflowBuildInBricksThemeStylePolicy;
  themeStyleSnapshotHash?: string;
};

/**
 * Canonical lifecycle evidence for ordinary Build source generation.
 *
 * The implementation still accepts historical Stage A lifecycle keys at the
 * compatibility boundary, but new Build payloads use these semantic keys so
 * a numbered stage cannot become the persisted lifecycle authority again.
 */
export type PixflowBuildInBricksSourceLifecycle = Partial<Record<
  | 'source_generation_started'
  | 'route_context_fetch_start'
  | 'route_context_fetch_end'
  | 'prompt_build_start'
  | 'prompt_build_end'
  | 'first_model_output'
  | 'first_artifact_write'
  | 'screenshot_capture_start'
  | 'screenshot_capture_end'
  | 'source_generation_finished',
  number
>>;

/** Normalize canonical or historical lifecycle evidence into the Build model. */
export function normalizePixflowBuildInBricksSourceLifecycle(value: unknown): PixflowBuildInBricksSourceLifecycle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const aliases: Record<string, keyof PixflowBuildInBricksSourceLifecycle> = {
    stage_a_started: 'source_generation_started',
    stage_a_finished: 'source_generation_finished',
  };
  const keys: Array<keyof PixflowBuildInBricksSourceLifecycle> = [
    'source_generation_started',
    'route_context_fetch_start',
    'route_context_fetch_end',
    'prompt_build_start',
    'prompt_build_end',
    'first_model_output',
    'first_artifact_write',
    'screenshot_capture_start',
    'screenshot_capture_end',
    'source_generation_finished',
  ];
  const output: PixflowBuildInBricksSourceLifecycle = {};
  for (const key of keys) {
    const candidate = source[key] ?? source[Object.entries(aliases).find(([, target]) => target === key)?.[0] || ''];
    const timestamp = typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0
      ? candidate
      : null;
    if (timestamp !== null) output[key] = timestamp;
  }
  return output;
}

export type PixflowBuildInBricksSourceContext = BuildInBricksDesignContext & {
  themeStyle?: PixflowBuildInBricksThemeStyleContext;
};

export type PixflowBuildInBricksSourcePagePlan = BuildInBricksPagePlan;

export function createPixflowBuildInBricksSourceRequestBundle(
  input: Omit<PixflowBuildInBricksSourceRequestBundle, 'schema' | 'version'>,
): PixflowBuildInBricksSourceRequestBundle {
  // Treat historical physical paths as read-side compatibility only. Strip a
  // forged or stale property even when an untyped transport bypasses TS.
  const {
    compatibilityArtifacts: _compatibilityArtifacts,
    ...canonicalInput
  } = input as typeof input & { compatibilityArtifacts?: unknown };
  return {
    ...canonicalInput,
    schema: PIXFLOW_BUILD_IN_BRICKS_SOURCE_SCHEMA,
    version: 1,
    context: normalizeBuildContext(input.context),
    artifacts: input.artifacts,
    ...(input.themeStylePolicy ? { themeStylePolicy: input.themeStylePolicy } : {}),
    ...(input.themeStyleSnapshotHash ? { themeStyleSnapshotHash: input.themeStyleSnapshotHash } : {}),
  } as PixflowBuildInBricksSourceRequestBundle;
}
