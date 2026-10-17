import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertPublicResearchUrl,
  searchResearch,
  ResearchError,
} from '../src/research/index.js';

const TAVILY_ENV_KEYS = ['OD_TAVILY_API_KEY', 'TAVILY_API_KEY'];
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

describe('research search', () => {
  const originalEnv = Object.fromEntries(
    TAVILY_ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  let projectRoot: string | null = null;

  afterEach(async () => {
    vi.unstubAllGlobals();
    for (const key of TAVILY_ENV_KEYS) {
      if (originalEnv[key] == null) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    const dir = projectRoot;
    projectRoot = null;
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  async function tempProjectRoot() {
    projectRoot = await mkdtemp(path.join(tmpdir(), 'od-research-project-'));
    return projectRoot;
  }

  it('falls back to bounded public search when Tavily is not configured', async () => {
    for (const key of TAVILY_ENV_KEYS) delete process.env[key];
    const fetchMock = vi.fn(async () => new Response(`
      <html><body>
        <div class="result">
          <a class="result__a" href="https://developer.wordpress.org/rest-api/extending-the-rest-api/adding-custom-endpoints/">Adding Custom Endpoints</a>
          <a class="result__snippet">Official REST API documentation.</a>
        </div>
      </body></html>
    `, { status: 200, headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchResearch({
      projectRoot: await tempProjectRoot(),
      query: 'WordPress REST endpoint documentation',
      maxSources: 3,
    })).resolves.toMatchObject({
      query: 'WordPress REST endpoint documentation',
      provider: 'duckduckgo',
      sources: [{
        title: 'Adding Custom Endpoints',
        url: 'https://developer.wordpress.org/rest-api/extending-the-rest-api/adding-custom-endpoints/',
        provider: 'duckduckgo',
      }],
    });
  });

  it('uses shallow Tavily search and normalizes JSON findings', async () => {
    process.env.OD_TAVILY_API_KEY = 'tvly-test';
    const fetchMock = vi.fn(async (_input: FetchInput, _init?: FetchInit) =>
      new Response(
        JSON.stringify({
          answer: 'EV sales are growing.',
          results: [
            {
              title: 'EV report',
              url: 'https://example.com/ev',
              content: 'EV adoption increased in 2025.',
              raw_content: '<main><h1>EV report</h1><p>Long-form evidence.</p><script>ignore()</script></main>',
              published_date: '2025-05-01',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const findings = await searchResearch({
      projectRoot: await tempProjectRoot(),
      query: 'EV market 2025 trends',
      maxSources: 50,
      includeContent: true,
      domains: ['example.com'],
      recencyDays: 30,
    });

    expect(findings).toMatchObject({
      query: 'EV market 2025 trends',
      summary: 'EV sales are growing.',
      provider: 'tavily',
      depth: 'shallow',
      sources: [
        {
          title: 'EV report',
          url: 'https://example.com/ev',
          snippet: 'EV adoption increased in 2025.',
          provider: 'tavily',
          publishedAt: '2025-05-01',
          content: 'EV report Long-form evidence.',
        },
      ],
    });
    const [, init] = fetchMock.mock.calls[0] as [FetchInput, FetchInit];
    const body = JSON.parse(String(init!.body));
    expect(body).toMatchObject({
      query: 'EV market 2025 trends',
      search_depth: 'basic',
      max_results: 20,
      include_answer: true,
      include_raw_content: true,
      include_domains: ['example.com'],
      days: 30,
    });
  });

  it('rejects private, loopback, credentialed, and non-http research destinations', async () => {
    await expect(assertPublicResearchUrl('http://127.0.0.1/private')).rejects.toMatchObject({ code: 'UNSAFE_RESEARCH_URL' });
    await expect(assertPublicResearchUrl('http://localhost/private')).rejects.toMatchObject({ code: 'UNSAFE_RESEARCH_URL' });
    await expect(assertPublicResearchUrl('https://user:pass@example.com/private')).rejects.toMatchObject({ code: 'UNSAFE_RESEARCH_URL' });
    await expect(assertPublicResearchUrl('file:///etc/passwd')).rejects.toMatchObject({ code: 'UNSAFE_RESEARCH_URL' });
  });
});
