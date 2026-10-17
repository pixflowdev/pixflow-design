import type {
  AgentActivitySource,
  PixflowWpAdminGroundingResult,
  PixflowWpAdminProposedResearch,
  PixflowWpAdminSemanticPreflightDecision,
  ResearchFindings,
} from '@open-design/contracts';

export function wpAdminResearchActivitySources(
  groundingResults: PixflowWpAdminGroundingResult[],
): AgentActivitySource[] {
  const sources = groundingResults.flatMap((item) => {
    if (item.capabilityId !== 'pixflow/research/search-web' || !item.result || typeof item.result !== 'object') return [];
    const result = item.result as { sources?: Array<{ title?: string; url?: string; provider?: string }> };
    return Array.isArray(result.sources) ? result.sources : [];
  });
  const byUrl = new Map<string, AgentActivitySource>();
  for (const source of sources) {
    const url = String(source.url || '').trim();
    if (!/^https?:\/\//i.test(url) || byUrl.has(url)) continue;
    byUrl.set(url, {
      title: String(source.title || url).replace(/[\[\]]/g, '').trim().slice(0, 160),
      url,
      ...(source.provider ? { provider: String(source.provider).trim().slice(0, 80) } : {}),
    });
  }
  return [...byUrl.values()].slice(0, 8);
}

export function wpAdminResearchProposals(
  decision: Pick<PixflowWpAdminSemanticPreflightDecision, 'proposedResearch'>,
): PixflowWpAdminProposedResearch[] {
  return (decision.proposedResearch || []).slice(0, 6).map((item) => ({
    query: item.query.trim().slice(0, 1_000),
    ...(item.maxSources ? { maxSources: Math.max(1, Math.min(8, Math.floor(item.maxSources))) } : {}),
    ...(item.includeContent ? { includeContent: true } : {}),
    ...(item.domains?.length ? { domains: [...new Set(item.domains.map((domain) => domain.toLowerCase()))].slice(0, 8) } : {}),
    ...(item.recencyDays ? { recencyDays: Math.max(1, Math.min(3_650, Math.floor(item.recencyDays))) } : {}),
  })).filter((item) => Boolean(item.query));
}

export function wpAdminResearchGroundingResult(
  request: PixflowWpAdminProposedResearch,
  result: ResearchFindings,
): PixflowWpAdminGroundingResult {
  return { capabilityId: 'pixflow/research/search-web', arguments: request as Record<string, unknown>, result };
}

export async function runWpAdminResearchBatch(
  requests: PixflowWpAdminProposedResearch[],
  providers: string[],
  signal: AbortSignal,
  search: (
    request: PixflowWpAdminProposedResearch & { providers: string[] },
    signal?: AbortSignal,
  ) => Promise<ResearchFindings>,
  onResult?: (result: PixflowWpAdminGroundingResult) => void,
): Promise<PixflowWpAdminGroundingResult[]> {
  const results: PixflowWpAdminGroundingResult[] = [];
  for (const request of requests) {
    if (signal.aborted) throw new DOMException('Stopped.', 'AbortError');
    let grounding: PixflowWpAdminGroundingResult;
    try {
      const findings = await search({ ...request, providers }, signal);
      grounding = wpAdminResearchGroundingResult(request, findings);
    } catch (error) {
      if (signal.aborted || (error as Error)?.name === 'AbortError') throw error;
      grounding = {
        capabilityId: 'pixflow/research/search-web',
        arguments: request as Record<string, unknown>,
        result: {
          query: request.query,
          provider: 'unavailable',
          sources: [],
          error: String((error as Error)?.message || error || 'Online research failed.').trim().slice(0, 500),
        },
      };
    }
    results.push(grounding);
    onResult?.(grounding);
  }
  return results;
}

export function appendWpAdminResearchSources(
  message: string,
  groundingResults: PixflowWpAdminGroundingResult[],
): string {
  const unique = wpAdminResearchActivitySources(groundingResults);
  if (!unique.length) return message;
  const block = `Sources:\n${unique.map((source) => `- [${source.title}](${source.url})`).join('\n')}`;
  return message.includes('\nSources:\n') ? message : `${message.trim()}\n\n${block}`;
}
