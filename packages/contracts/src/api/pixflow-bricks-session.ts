import type { PixflowBuildInBricksAgentCapabilities } from './pixflow-build-in-bricks-review.js';

/** Persisted handoff metadata remains readable without the optional builder UI. */
export type BricksBuildAttemptCorrelation = {
  submissionId: string;
  buildAttemptId: string;
  projectId: string;
  sourceRunId?: string | null;
  /** Historical source-run identity retained for existing chats. */
  stageARunId?: string | null;
  /** Historical handoff identity retained for existing chats. */
  stageBHandoffId?: string | null;
  repairAttempt: number;
};

export type BuildInBricksGenerationRequirementKind =
  | 'query_loop'
  | 'conditions'
  | 'dynamic_data'
  | 'interactions'
  | 'form';

export type BuildInBricksGenerationRequirement = {
  kind: BuildInBricksGenerationRequirementKind;
  minimumMatches: number;
  source: 'prompt' | 'skill';
};

export type BuildInBricksVisualReviewSkipReason =
  | 'skipped_disabled'
  | 'skipped_capability_unavailable'
  | 'skipped_capture_unavailable'
  | 'skipped_repair_revalidated_deterministically'
  | 'skipped_unsupported';

export type BuildInBricksVisualReviewRoute =
  | {
      mode: 'selected';
      agentId: string;
      model: string | null;
      capabilities: PixflowBuildInBricksAgentCapabilities;
    }
  | { mode: 'skipped'; reason: BuildInBricksVisualReviewSkipReason };
