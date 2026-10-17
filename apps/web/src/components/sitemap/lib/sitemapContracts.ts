export type PageCountPreference = '1' | '2-5' | '5-10' | '10-15' | '15-20';

export interface ComposerSelectedSection {
  id?: string;
  title?: string;
  slug?: string;
  templateRole?: string;
  variantGroup?: string;
  variantLabel?: string;
  sectionPurpose?: string;
  copyBrief?: string;
  selectionReason?: string;
  description?: string;
}

export interface ComposerSuggestedPage {
  title: string;
  slug: string;
  summary: string;
  parentSlug?: string | null;
  parentTitle?: string | null;
  generationModeOverride?: WorkspaceSitemapGenerationModeOverride;
  strictnessOverride?: WorkspaceSitemapStrictnessOverride;
  pagePrompt?: string;
  dynamicContentKind?: WorkspaceSitemapDynamicContentKind;
  generationReferences?: WorkspaceSitemapGenerationReference[];
  selectedSections?: ComposerSelectedSection[];
}

export interface ComposerGenerationResultData {
  requestId: string;
  request: {
    project_name?: string;
    business_name?: string;
  };
  structuredResult?: {
    projectName?: string;
    businessName?: string;
    sitemapStructureOnly?: boolean;
    suggestedPages?: ComposerSuggestedPage[];
  };
}

export interface PageSummary {
  id: string;
  title: string;
  slug: string;
  kind?: string;
  wpPostId?: number | null;
  editUrl?: string;
  sectionCount?: number;
  pixflowDesignTargetPageTitle?: string;
  pixflowDesignRunId?: string;
  pixflowDesignCompletedAt?: string;
}

export interface DirectGenerationRunSummary {
  runId: string;
  targetWpPostId: number;
  insertedCount: number;
  insertedAt?: string;
}

export type WorkspaceSitemapNodeStatus = 'planned' | 'draft' | 'private' | 'published';

export type WorkspaceSitemapActivityStatus =
  | 'planned'
  | 'queued'
  | 'generating'
  | 'generated'
  | 'needs_review'
  | 'error'
  | 'cancelled';

export type WorkspaceSitemapGenerationJobStatus =
  | 'pending'
  | 'starting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type WorkspaceSitemapGenerationPipeline =
  | 'pixflow_generation_stage_a'
  | 'pixflow_library_page';

export type WorkspaceSitemapGenerationMode =
  | 'pixflow_generation'
  | 'pixflow_library';

export type WorkspaceSitemapGenerationModeOverride =
  | 'inherit'
  | WorkspaceSitemapGenerationMode;

export type WorkspaceSitemapStrictness =
  | 'loose'
  | 'guided'
  | 'strict';

export type WorkspaceSitemapStrictnessOverride =
  | 'inherit'
  | WorkspaceSitemapStrictness;

export type WorkspaceSitemapSectionGuidancePolicy =
  | 'advisory'
  | 'required';

export type WorkspaceSitemapDynamicContentKind =
  | 'static'
  | 'archive'
  | 'single_template'
  | 'query_loop'
  | 'search_filter';

export interface WorkspaceSitemapGenerationReference {
  id: string;
  type:
    | 'design_system'
    | 'plugin'
    | 'pixflow_template'
    | 'existing_page'
    | 'file'
    | 'note';
  label: string;
  source?: string;
  note?: string;
}

export interface WorkspaceSitemapNodeLocks {
  hierarchy?: boolean;
  titleSlug?: boolean;
  pagePrompt?: boolean;
  sections?: boolean;
  generationMode?: boolean;
}

export interface WorkspaceSitemapSection {
  id: string;
  title: string;
  description: string;
  order: number;
  generationStatus?: 'placeholder' | 'generating' | 'complete';
}

export interface WorkspaceSitemapRecipeAttachment {
  id: string;
  title: string;
  summary?: string;
  category?: string;
}

export interface WorkspaceSitemapGenerationJob {
  id: string;
  nodeId: string;
  wpPostId: number;
  wpPageId?: string | null;
  bridgeRunId?: string;
  bridgeJobId?: string;
  pairingId?: string;
  directRunId?: string;
  editUrl?: string;
  status: WorkspaceSitemapGenerationJobStatus;
  generationPipeline?: WorkspaceSitemapGenerationPipeline;
  prompt: string;
  message?: string;
  errorMessage?: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  bridgeRunPayload?: Record<string, unknown>;
}

export interface WorkspaceSitemapBriefSource {
  id: string;
  type: 'message' | 'url' | 'file' | 'form' | 'agent' | 'manual' | 'sitemap';
  label: string;
  value?: string;
  note?: string;
  addedAt?: string;
}

export interface WorkspaceSitemapBriefMemory {
  version: 1;
  updatedAt: string;
  briefMarkdown: string;
  businessName?: string;
  websiteType?: string;
  businessModel?: string;
  primaryPurpose?: string;
  audience?: string;
  geography?: string;
  conversionGoals?: string[];
  servicesOrOffers?: string[];
  contentModel?: string;
  seoStrategy?: string;
  localSeoNeeds?: string;
  requiredPages?: string[];
  excludedPages?: string[];
  competitorsOrReferences?: string[];
  providedUrls?: string[];
  attachedFiles?: string[];
  assumptions?: string[];
  openQuestions?: string[];
  generationPreference?: string;
  confidence?: 'low' | 'medium' | 'high';
  staleOrConflictingNotes?: string[];
  sourceEvidence?: WorkspaceSitemapBriefSource[];
}

export interface WorkspaceSitemapNode {
  id: string;
  title: string;
  slug: string;
  summary: string;
  parentId: string | null;
  order: number;
  sections: WorkspaceSitemapSection[];
  savedSections?: WorkspaceSitemapSection[];
  isPageGroup?: boolean;
  status: WorkspaceSitemapNodeStatus;
  activityStatus?: WorkspaceSitemapActivityStatus;
  wpPostId?: number | null;
  wpPageId?: string | null;
  wpStatus?: string;
  editUrl?: string;
  permalink?: string;
  wpParentPostId?: number;
  isHomepage?: boolean;
  isPolicyPage?: boolean;
  isBricksBuilt?: boolean;
  bricksEditorMode?: string;
  isImportedFromWordPress?: boolean;
  isGeneratedByPixflow?: boolean;
  lastSyncedAt?: string;
  syncState?: 'synced' | 'missing_in_wp' | 'new_in_sitemap' | 'wp_only' | 'conflict';
  generatedRunId?: string;
  generatedAt?: string;
  generationMessage?: string;
  generationStatus?: 'placeholder' | 'generating' | 'complete';
  pageType?: string;
  pageIntentContract?: Record<string, unknown>;
  pixflowDesignRecipe?: WorkspaceSitemapRecipeAttachment | null;
  generationModeOverride?: WorkspaceSitemapGenerationModeOverride;
  strictnessOverride?: WorkspaceSitemapStrictnessOverride;
  pagePrompt?: string;
  dynamicContentKind?: WorkspaceSitemapDynamicContentKind;
  generationReferences?: WorkspaceSitemapGenerationReference[];
  locks?: WorkspaceSitemapNodeLocks;
}

export interface WorkspaceSitemap {
  type: 'pixflow_workspace_sitemap';
  version: 1;
  id: string;
  projectName: string;
  businessName: string;
  prompt: string;
  pageCountPreference: PageCountPreference;
  generationMode?: WorkspaceSitemapGenerationMode;
  strictness?: WorkspaceSitemapStrictness;
  generationReferences?: WorkspaceSitemapGenerationReference[];
  sectionGuidancePolicy?: WorkspaceSitemapSectionGuidancePolicy;
  pixflowDesignRecipe?: WorkspaceSitemapRecipeAttachment | null;
  sitemapBrief?: WorkspaceSitemapBriefMemory | null;
  wpHomepageId?: number;
  wpPostsPageId?: number;
  hasStaticHomepage?: boolean;
  wpPagesSyncedAt?: string;
  syncWarnings?: string[];
  sourceRequestId: string;
  createdAt: string;
  updatedAt: string;
  generationQueue?: WorkspaceSitemapGenerationJob[];
  generationConcurrency?: number;
  nodes: WorkspaceSitemapNode[];
}
