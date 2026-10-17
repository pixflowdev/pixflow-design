import { load } from 'cheerio';
import { Agent } from 'undici';

import type { DesignSystemWebsiteEvidence } from '@open-design/contracts';

import {
  assertSafePublicUrl,
  createValidatingLookup,
} from './plugin-asset-cache.js';

const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_CSS_BYTES = 512 * 1024;
const MAX_STYLESHEETS = 8;
const REQUEST_TIMEOUT_MS = 15_000;
const HEX_COLOR = /#[0-9a-f]{3,8}\b/gi;
const CSS_VARIABLE = /(--[a-z0-9_-]+)\s*:\s*([^;}{]{1,240})/gi;
const FONT_FAMILY = /font-family\s*:\s*([^;}{]{1,200})/gi;

const dispatcher = new Agent({
  connect: { lookup: createValidatingLookup() as never },
});

async function readCapped(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > limit) throw new Error('website response exceeds the size limit');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) throw new Error('website response exceeds the size limit');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function fetchPublicText(
  rawUrl: string,
  limit: number,
  acceptedTypes: readonly string[],
): Promise<{ text: string; finalUrl: string }> {
  let current = assertSafePublicUrl(rawUrl).toString();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const target = assertSafePublicUrl(current);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const init: RequestInit = {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Pixflow Design/1.0 (design-system source inspector)',
          Accept: acceptedTypes.join(', '),
        },
      };
      (init as { dispatcher?: unknown }).dispatcher = dispatcher;
      const response = await fetch(target, init);
      const location = response.status >= 300 && response.status < 400
        ? response.headers.get('location')
        : null;
      if (location) {
        await response.body?.cancel().catch(() => undefined);
        if (hop === MAX_REDIRECTS) throw new Error('website redirected too many times');
        current = new URL(location, target).toString();
        continue;
      }
      if (!response.ok) throw new Error(`website responded with HTTP ${response.status}`);
      const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
      if (!acceptedTypes.some((type) => contentType.includes(type))) {
        throw new Error(`website returned unsupported content type ${contentType || 'unknown'}`);
      }
      return { text: await readCapped(response, limit), finalUrl: target.toString() };
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('website redirected too many times');
}

function absoluteUrl(value: string | undefined, base: string): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function unique<T>(values: T[], limit: number): T[] {
  return Array.from(new Set(values)).slice(0, limit);
}

function normalizeColor(value: string): string {
  const hex = value.toLowerCase();
  if (hex.length === 4) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  if (hex.length === 5) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}${hex[4]}${hex[4]}`;
  return hex;
}

function extractFonts(css: string): string[] {
  const fonts: string[] = [];
  for (const match of css.matchAll(FONT_FAMILY)) {
    for (const family of (match[1] ?? '').split(',')) {
      const clean = family.trim().replace(/^['"]|['"]$/g, '');
      if (clean && !/^(inherit|initial|sans-serif|serif|monospace|system-ui)$/i.test(clean)) {
        fonts.push(clean);
      }
    }
  }
  return unique(fonts, 16);
}

function extractVariables(css: string): Array<{ name: string; value: string }> {
  const variables: Array<{ name: string; value: string }> = [];
  for (const match of css.matchAll(CSS_VARIABLE)) {
    const name = match[1]?.trim();
    const value = match[2]?.trim();
    if (name && value) variables.push({ name, value });
    if (variables.length >= 120) break;
  }
  return variables;
}

function renderEvidence(evidence: Omit<DesignSystemWebsiteEvidence, 'evidenceMarkdown'>): string {
  return `# Website Design Evidence

- Requested URL: ${evidence.url}
- Final URL: ${evidence.finalUrl}
- Page title: ${evidence.title || 'Not declared'}
- Description: ${evidence.description || 'Not declared'}

## Detected colors

${evidence.colors.length ? evidence.colors.map((value) => `- \`${value}\``).join('\n') : '- None detected.'}

## Detected fonts

${evidence.fonts.length ? evidence.fonts.map((value) => `- ${value}`).join('\n') : '- None detected.'}

## CSS custom properties

${evidence.cssVariables.length
    ? evidence.cssVariables.map(({ name, value }) => `- \`${name}: ${value}\``).join('\n')
    : '- None detected.'}

## Stylesheets

${evidence.stylesheetUrls.length ? evidence.stylesheetUrls.map((value) => `- ${value}`).join('\n') : '- None linked.'}

## Representative image sources

${evidence.imageUrls.length ? evidence.imageUrls.map((value) => `- ${value}`).join('\n') : '- None detected.'}
`;
}

export async function inspectDesignSystemWebsite(rawUrl: string): Promise<DesignSystemWebsiteEvidence> {
  const requested = assertSafePublicUrl(rawUrl).toString();
  const page = await fetchPublicText(requested, MAX_HTML_BYTES, ['text/html', 'application/xhtml+xml']);
  const preliminary = extractDesignSystemWebsiteEvidence(requested, page.finalUrl, page.text);
  const externalCss = await Promise.all(preliminary.stylesheetUrls.map(async (url) => {
    try {
      return (await fetchPublicText(url, MAX_CSS_BYTES, ['text/css'])).text;
    } catch {
      return '';
    }
  }));
  return extractDesignSystemWebsiteEvidence(requested, page.finalUrl, page.text, externalCss);
}

export function extractDesignSystemWebsiteEvidence(
  requestedUrl: string,
  finalUrl: string,
  html: string,
  fetchedStylesheets: string[] = [],
): DesignSystemWebsiteEvidence {
  const $ = load(html);
  const title = ($('meta[property="og:site_name"]').attr('content') || $('title').first().text()).trim().slice(0, 200);
  const description = (
    $('meta[name="description"]').attr('content')
    || $('meta[property="og:description"]').attr('content')
    || ''
  ).trim().slice(0, 600);
  const stylesheets = unique(
    $('link[rel~="stylesheet"]').map((_, element) => absoluteUrl($(element).attr('href'), finalUrl)).get()
      .filter((value): value is string => Boolean(value)),
    MAX_STYLESHEETS,
  );
  const inlineCss = $('style').map((_, element) => $(element).html() ?? '').get().join('\n');
  const css = `${inlineCss}\n${fetchedStylesheets.join('\n')}`;
  const markupStyleText = $('[style]').map((_, element) => $(element).attr('style') ?? '').get().join('\n');
  const colors = unique(
    [...`${css}\n${markupStyleText}`.matchAll(HEX_COLOR)].map((match) => normalizeColor(match[0])),
    32,
  );
  const imageUrls = unique([
    absoluteUrl($('meta[property="og:image"]').attr('content'), finalUrl),
    ...$('img[src],source[srcset]').map((_, element) => {
      const raw = $(element).attr('src') || $(element).attr('srcset')?.split(',')[0]?.trim().split(/\s+/)[0];
      return absoluteUrl(raw, finalUrl);
    }).get(),
  ].filter((value): value is string => Boolean(value)), 24);
  const base = {
    url: requestedUrl,
    finalUrl,
    title,
    description,
    colors,
    fonts: extractFonts(css),
    cssVariables: extractVariables(css),
    imageUrls,
    stylesheetUrls: stylesheets,
  };
  return { ...base, evidenceMarkdown: renderEvidence(base) };
}
