import type {
  WorkspaceSitemapDynamicContentKind,
  WorkspaceSitemapStrictness,
} from "./sitemapContracts";

export const WORKSPACE_SITEMAP_QUEUE_CONCURRENCY = 2;
export const WORKSPACE_SITEMAP_QUEUE_BATCH_LIMIT = 6;
export const WORKSPACE_SITEMAP_SECTION_WORKER_CONCURRENCY = 3;
export const DIRECT_SITEMAP_PROMPT_HANDOFF_STORAGE_KEY =
  "pixflow-direct-sitemap-prompt-handoff";
export const DEFAULT_WORKSPACE_SITEMAP_STRICTNESS: WorkspaceSitemapStrictness =
  "guided";
export const DEFAULT_WORKSPACE_SITEMAP_DYNAMIC_CONTENT_KIND: WorkspaceSitemapDynamicContentKind =
  "static";
