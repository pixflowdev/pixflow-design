/**
 * Canonical ordinary Build in Bricks source-generation boundary.
 *
 * New Build callers import this semantic facade.  The implementation module
 * owns source generation; the numbered-stage module is compatibility-only.
 */
export {
  generateBuildInBricksSource,
  buildBuildInBricksThemeStyleContext,
  buildBuildInBricksContextFiles,
  buildBuildInBricksDesignContext,
  buildBuildInBricksRequestBundle,
  buildBuildInBricksDesignPlan,
  buildBuildInBricksPagePlan,
  resolveBuildInBricksSkillIds,
  buildBuildInBricksPromptProvenance,
  buildBuildInBricksSourcePrompt,
  buildBuildInBricksSourceVisualReviewPrompt,
  buildBuildInBricksSourceRepairPrompt,
  buildBuildInBricksSplitSourcePaths,
  evaluateBuildInBricksSourceQualityGate,
  critiqueBuildInBricksSource,
  buildInBricksSourceVisualEvidencePath,
  isBuildInBricksSourceContractError,
  BuildInBricksSourceQualityGateError,
  buildBuildInBricksSourceFailureMetadata,
  composeBuildInBricksSourceHtml,
  buildBuildInBricksSourceConversationId,
  buildBuildInBricksSourceRepairConversationId,
  BUILD_IN_BRICKS_SOURCE_PIPELINE_ID,
  BUILD_IN_BRICKS_SOURCE_ENTRY_CONTRACT,
  BUILD_IN_BRICKS_SOURCE_INTENT,
  remainingBuildInBricksTargetedRepairBudget,
  createBuildInBricksDeterministicValidation,
  BUILD_IN_BRICKS_SOURCE_VISUAL_VIEWPORTS,
  validateBuildInBricksAuthoredHtmlDiscipline,
  validateBuildInBricksCompiledDocument,
  validateBuildInBricksHtmlDiscipline,
  validateBuildInBricksBoundedRetainedEdit,
  validateBuildInBricksRetainedAestheticRepairScope,
  normalizeBuildInBricksOptionalJavaScript,
} from './build-in-bricks-source-generation';

export { normalizeHistoricalRetainedBuildSource } from './bricks-html-source-shared';

export type {
  BuildInBricksSourceOptions,
  BuildInBricksSourceResult,
  BuildInBricksContextFile,
  BuildInBricksSourceMetadata,
  BuildInBricksSourceLifecycle,
  BuildInBricksDesignPlan,
  BuildInBricksQualityGate,
  BuildInBricksSourceCritique,
  BuildInBricksSkillPathEntry,
  BuildInBricksDeterministicValidationResult,
} from './build-in-bricks-source-generation';

export { BuildInBricksHistoricalSourceReconciliationError } from './build-in-bricks-source-generation';

/** Canonical semantic aliases for new ordinary Build callers. */
export type {
  BuildInBricksSourceOptions as BuildInBricksSourceGenerationOptions,
  BuildInBricksSourceResult as BuildInBricksSourceGenerationResult,
} from './build-in-bricks-source-generation';
