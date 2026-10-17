import type {
  ResearchDepth,
  ResearchFindings,
  ResearchSource,
  ResearchStatus,
} from '@open-design/contracts/api/research';
import { resolveProviderConfig } from '../media-config.js';
import { duckDuckGoSearch } from './duckduckgo.js';
import { assertPublicResearchUrl, extractResearchText } from './public-web.js';
import { tavilySearch, TavilyError } from './tavily.js';

const DEFAULT_MAX_SOURCES = 5;
const TAVILY_MAX_RESULTS_LIMIT = 20;
const MAX_RESULT_CONTENT_CHARS = 8_000;

export class ResearchError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = 'RESEARCH_FAILED',
  ) {
    super(message);
    this.name = 'ResearchError';
  }
}

export interface SearchResearchInput {
  query: string;
  projectRoot: string;
  maxSources?: number;
  providers?: string[];
  requestInit?: Pick<RequestInit, 'dispatcher'>;
  signal?: AbortSignal;
  domains?: string[];
  recencyDays?: number;
  includeContent?: boolean;
}

export async function searchResearch(
  input: SearchResearchInput,
): Promise<ResearchFindings> {
  const query = (input.query?.trim() || '').slice(0, 1000);
  if (!query) {
    throw new ResearchError('query required', 400, 'QUERY_REQUIRED');
  }
  const depth: ResearchDepth = 'shallow';
  const requested = Array.isArray(input.providers) ? input.providers : [];
  const providers = (requested.length ? requested : ['tavily', 'duckduckgo']).filter(
    (p: unknown): p is string => typeof p === 'string' && p.length > 0,
  );
  const maxSources = clampMaxSources(input.maxSources);
  const domains = normalizeDomains(input.domains);
  const recencyDays = normalizeRecencyDays(input.recencyDays);
  const failures: string[] = [];
  for (const provider of providers) {
    try {
      let answer = '';
      let sources: ResearchSource[] = [];
      let warnings: string[] = [];
      if (provider === 'tavily') {
        const cfg = await resolveProviderConfig(input.projectRoot, 'tavily');
        if (!cfg.apiKey) {
          failures.push('Tavily is not configured.');
          continue;
        }
        const out = await tavilySearch({
          apiKey: cfg.apiKey,
          query,
          searchDepth: 'basic',
          maxResults: maxSources,
          includeAnswer: true,
          includeContent: Boolean(input.includeContent),
          domains,
          ...(recencyDays ? { recencyDays } : {}),
          ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}),
          ...(input.requestInit ? { requestInit: input.requestInit } : {}),
          ...(input.signal ? { signal: input.signal } : {}),
        });
        answer = out.answer;
        sources = out.sources;
      } else if (provider === 'duckduckgo') {
        const out = await duckDuckGoSearch({
          query,
          maxResults: Math.min(maxSources, 8),
          domains,
          includeContent: Boolean(input.includeContent),
          ...(input.requestInit ? { requestInit: input.requestInit } : {}),
          ...(input.signal ? { signal: input.signal } : {}),
        });
        sources = out.sources;
        warnings = out.warnings;
      } else {
        failures.push(`Research provider "${provider}" is not supported.`);
        continue;
      }
      sources = normalizeResearchSources(sources, maxSources);
      if (!sources.length) {
        failures.push(`${provider} returned no sources.`);
        continue;
      }
      return {
        query,
        summary: answer || synthesizeFallbackSummary(sources),
        sources,
        provider,
        depth,
        fetchedAt: Date.now(),
        ...(warnings.length || failures.length ? { warnings: [...failures, ...warnings].slice(0, 12) } : {}),
      };
    } catch (err) {
      const message = err instanceof TavilyError ? err.message : (err as Error).message || String(err);
      failures.push(`${provider}: ${message}`.slice(0, 500));
    }
  }
  throw new ResearchError(
    failures.join(' ') || 'No research provider is available.',
    502,
    'RESEARCH_PROVIDER_FAILED',
  );
}

export async function researchStatus(projectRoot: string): Promise<ResearchStatus> {
  const tavily = await resolveProviderConfig(projectRoot, 'tavily');
  return {
    available: true,
    providers: [
      { id: 'tavily', available: Boolean(tavily.apiKey), configured: Boolean(tavily.apiKey), requiresConfiguration: true },
      { id: 'duckduckgo', available: true, configured: true, requiresConfiguration: false },
    ],
  };
}

export { assertPublicResearchUrl } from './public-web.js';

function synthesizeFallbackSummary(sources: ResearchSource[]): string {
  const lead = sources
    .slice(0, 5)
    .map((s, i) => `- [${i + 1}] ${s.title}: ${s.snippet.slice(0, 200)}`)
    .join('\n');
  return `(No provider summary; top snippets follow.)\n${lead}`;
}

function clampMaxSources(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX_SOURCES;
  }
  return Math.max(1, Math.min(Math.floor(value), TAVILY_MAX_RESULTS_LIMIT));
}

function normalizeDomains(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim().toLowerCase().replace(/^\.+|\.+$/g, ''))
    .filter((item) => /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(item)))]
    .slice(0, 8);
}

function normalizeRecencyDays(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? Math.min(value, 3_650)
    : undefined;
}

function normalizeResearchSources(sources: ResearchSource[], maxSources: number): ResearchSource[] {
  return sources.slice(0, maxSources).map((source) => {
    const content = source.content
      ? (/<[a-z][\s\S]*>/i.test(source.content) ? extractResearchText(source.content) : source.content.replace(/\s+/g, ' ').trim())
      : '';
    return {
      title: String(source.title || source.url).replace(/\s+/g, ' ').trim().slice(0, 300),
      url: String(source.url || '').slice(0, 2_000),
      snippet: String(source.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 800),
      provider: String(source.provider || '').slice(0, 40),
      ...(source.publishedAt ? { publishedAt: String(source.publishedAt).slice(0, 80) } : {}),
      ...(content ? { content: content.slice(0, MAX_RESULT_CONTENT_CHARS) } : {}),
      ...(source.contentType ? { contentType: String(source.contentType).slice(0, 100) } : {}),
      ...(source.retrievedAt ? { retrievedAt: source.retrievedAt } : {}),
    };
  }).filter((source) => Boolean(source.url));
}
