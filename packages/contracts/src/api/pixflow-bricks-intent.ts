export const PIXFLOW_BRICKS_INTENT_CONTRACT_SCHEMA = 'pixflow.bricks.intent.v1' as const;

export const PIXFLOW_BRICKS_INTENTS = [
  'website_clone',
  'html_to_bricks',
  'build_in_bricks',
  'library_insertion',
  'selected_element',
  'current_page',
  'dynamic_data',
  'query_loop',
  'filters',
  'forms',
  'interactions',
  'custom_code',
  'generated_media',
  'global_bricks',
  'answer_only',
] as const;

export type PixflowBricksIntent = (typeof PIXFLOW_BRICKS_INTENTS)[number];

export const PIXFLOW_BRICKS_INTENT_SCOPES = [
  'full_page',
  'section',
  'component',
  'selected_element',
  'current_page',
  'site',
  'unknown',
] as const;

export type PixflowBricksIntentScope = (typeof PIXFLOW_BRICKS_INTENT_SCOPES)[number];

export const PIXFLOW_BRICKS_MEDIA_POLICIES = [
  'generated',
  'placeholder',
  'existing',
  'none',
  'unspecified',
] as const;

export type PixflowBricksMediaPolicy = (typeof PIXFLOW_BRICKS_MEDIA_POLICIES)[number];

export const PIXFLOW_BRICKS_MEDIA_SURFACES = [
  'image',
  'video',
  'audio',
  'none',
] as const;

export type PixflowBricksMediaSurface = (typeof PIXFLOW_BRICKS_MEDIA_SURFACES)[number];

export const PIXFLOW_BRICKS_PREFLIGHT_STATES = ['ready', 'needs_clarification'] as const;

export type PixflowBricksPreflightState = (typeof PIXFLOW_BRICKS_PREFLIGHT_STATES)[number];

export const PIXFLOW_BRICKS_PLACEMENT_MODES = [
  'before',
  'after',
  'prepend_to',
  'append_to',
  'append',
] as const;

export type PixflowBricksPlacementMode = (typeof PIXFLOW_BRICKS_PLACEMENT_MODES)[number];

export type PixflowBricksPlacementDecision = {
  mode: PixflowBricksPlacementMode;
  targetId: string | null;
  targetLabel: string | null;
  preserveExisting: boolean;
  rationale: string;
};

export const PIXFLOW_BRICKS_SOURCE_LIFECYCLES = [
  'initial_source_generation',
  'retained_source_edit',
] as const;

export type PixflowBricksSourceLifecycleDecision = (typeof PIXFLOW_BRICKS_SOURCE_LIFECYCLES)[number];

export const PIXFLOW_BRICKS_GENERATION_REQUIREMENT_KINDS = [
  'query_loop',
  'conditions',
  'dynamic_data',
  'interactions',
  'form',
] as const;

export type PixflowBricksGenerationRequirementDecision = {
  kind: (typeof PIXFLOW_BRICKS_GENERATION_REQUIREMENT_KINDS)[number];
  minimumMatches: number;
};

/**
 * A bounded edit chosen semantically by the selected agent from factual
 * builder context. Deterministic code verifies this decision; it never derives
 * one by parsing the user's natural-language prompt.
 */
export type PixflowBricksRetainedEditDecision = {
  kind: 'replace_visible_text';
  targetElementId: string;
  currentText: string;
  replacementText: string;
  preserveUnrelated: true;
};

export type PixflowBricksIntentContract = {
  schema: typeof PIXFLOW_BRICKS_INTENT_CONTRACT_SCHEMA;
  intent: PixflowBricksIntent;
  scope: PixflowBricksIntentScope;
  mediaPolicy: PixflowBricksMediaPolicy;
  /** Media kind selected semantically by the agent; never inferred from prompt vocabulary. */
  mediaSurface: PixflowBricksMediaSurface;
  state: PixflowBricksPreflightState;
  confidence: number;
  clarification: string | null;
  skillIds: string[];
  capabilityIds: string[];
  rationale: string;
  /** Exact live elements selected semantically for the requested mutation. */
  targetElementIds?: string[];
  /** Semantic placement chosen by the selected agent from factual builder context. */
  placement: PixflowBricksPlacementDecision | null;
  /** Source lifecycle chosen by the selected agent from factual retained-source availability. */
  sourceLifecycle: PixflowBricksSourceLifecycleDecision;
  /** Bounded converter-verifiable capabilities selected semantically by the agent. */
  generationRequirements: PixflowBricksGenerationRequirementDecision[];
  /** Optional preserving edit decision authored by the selected agent. */
  retainedEdit?: PixflowBricksRetainedEditDecision | null;
};
