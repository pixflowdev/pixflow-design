import * as cheerio from 'cheerio';
import type { ResearchSource } from '@open-design/contracts/api/research';

import { fetchPublicResearchDocument } from './public-web.js';

const SEARCH_URL = 'https://html.duckduckgo.com/html/';
const SEARCH_TIMEOUT_MS = 20_000;

export async function duckDuckGoSearch(input: {
  query: string;
  maxResults: number;
  domains?: string[];
  includeContent?: boolean;
  signal?: AbortSignal;
  requestInit?: Pick<RequestInit, 'dispatcher'>;
}): Promise<{ sources: ResearchSource[]; warnings: string[] }> {
  const domains = (input.domains || []).slice(0, 8);
  const searchQuery = domains.length
    ? `${input.query} ${domains.map((domain) => `site:${domain}`).join(' OR ')}`
    : input.query;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  const abort = () => controller.abort();
  input.signal?.addEventListener('abort', abort, { once: true });
  let response: Response;
  try {
    response = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(searchQuery)}`, {
      ...input.requestInit,
      headers: {
        accept: 'text/html',
        'user-agent': 'Mozilla/5.0 (compatible; PixflowDesignResearch/1.1.5; +https://pixflow.dev)',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', abort);
  }
  if (!response.ok) throw new Error(`DuckDuckGo returned HTTP ${response.status}.`);
  const html = await response.text();
  const $ = cheerio.load(html.slice(0, 1_000_000));
  const sources: ResearchSource[] = [];
  $('.result').each((_index, element) => {
    if (sources.length >= input.maxResults) return false;
    const link = $(element).find('.result__a').first();
    const rawHref = link.attr('href') || '';
    const url = canonicalDuckDuckGoResultUrl(rawHref);
    if (!url) return;
    const hostname = new URL(url).hostname.toLowerCase();
    if (domains.length && !domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) return;
    sources.push({
      title: link.text().replace(/\s+/g, ' ').trim() || url,
      url,
      snippet: $(element).find('.result__snippet').first().text().replace(/\s+/g, ' ').trim().slice(0, 800),
      provider: 'duckduckgo',
    });
  });
  const warnings: string[] = [];
  if (input.includeContent) {
    await Promise.all(sources.map(async (source) => {
      try {
        const extracted = await fetchPublicResearchDocument({
          url: source.url,
          ...(input.signal ? { signal: input.signal } : {}),
          ...(input.requestInit ? { requestInit: input.requestInit } : {}),
        });
        source.url = extracted.url;
        source.content = extracted.content;
        source.contentType = extracted.contentType;
        source.retrievedAt = extracted.retrievedAt;
      } catch (error) {
        warnings.push(`${source.url}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500));
      }
    }));
  }
  return { sources, warnings };
}

function canonicalDuckDuckGoResultUrl(value: string): string | null {
  try {
    const parsed = new URL(value, SEARCH_URL);
    const redirected = parsed.hostname.endsWith('duckduckgo.com') && parsed.pathname.startsWith('/l/')
      ? parsed.searchParams.get('uddg')
      : null;
    const target = redirected ? new URL(redirected) : parsed;
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) return null;
    const host = target.hostname.toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.localhost')) return null;
    return target.toString();
  } catch {
    return null;
  }
}
