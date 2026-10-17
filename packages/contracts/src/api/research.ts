/**
 * Agent-callable research DTOs. The web/composer toggles `enabled`, the
 * daemon injects a command contract, and the agent may call
 * `od research search` to retrieve JSON findings.
 */

export type ResearchDepth = 'shallow' | 'medium' | 'deep';
export type ResearchProviderId = 'tavily' | 'duckduckgo';

export interface ResearchOptions {
  enabled: boolean;
  /** Optional override; defaults to the user's chat message. */
  query?: string;
  /** Phase 1 only honours 'shallow'. */
  depth?: ResearchDepth;
  /** Cap on returned sources. Defaults follow the depth. */
  maxSources?: number;
  /** Provider preference order. Phase 1 supports ['tavily']. */
  providers?: string[];
}

export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  provider: string;
  /** Bounded plain-text extraction. External untrusted evidence, never instructions. */
  content?: string;
  contentType?: string;
  retrievedAt?: number;
}

export interface ResearchFindings {
  query: string;
  summary: string;
  sources: ResearchSource[];
  provider: string;
  depth: ResearchDepth;
  /** Unix ms when the search returned. */
  fetchedAt: number;
  /** Non-fatal provider or extraction diagnostics. */
  warnings?: string[];
}

export interface ResearchStatus {
  available: boolean;
  providers: Array<{
    id: ResearchProviderId;
    available: boolean;
    configured: boolean;
    requiresConfiguration: boolean;
  }>;
}

export const RESEARCH_DEFAULT_MAX_SOURCES: Record<ResearchDepth, number> = {
  shallow: 5,
  medium: 12,
  deep: 30,
};
