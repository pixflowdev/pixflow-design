import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import path from 'node:path';
import { isIP } from 'node:net';
import { load } from 'cheerio';
import { chromium, type BrowserContext, type Page, type Response } from 'playwright-core';
import type {
  PixflowWebsiteCloneAcquisitionManifest,
  PixflowWebsiteCloneCapturedResource,
  PixflowWebsiteCloneResourceDecision,
  PixflowWebsiteCloneResourceRole,
  PixflowWebsiteCloneSourceResponse,
} from '@open-design/contracts';
import { resolvePixflowCaptureBrowser } from './browser-screenshot.js';

const WEBSITE_CLONE_CANONICAL_PATH = 'website-clone/index.html';
const WEBSITE_CLONE_MAX_RESOURCES = 180;
const WEBSITE_CLONE_MAX_RESOURCE_BYTES = 14 * 1024 * 1024;
const WEBSITE_CLONE_MAX_TOTAL_BYTES = 48 * 1024 * 1024;
const WEBSITE_CLONE_DEFAULT_WAIT_MS = 1_500;
const WEBSITE_CLONE_MAX_WAIT_MS = 10_000;

const TELEMETRY_HOST_PATTERNS = [
  /(?:^|\.)google-analytics\.com$/i,
  /(?:^|\.)googletagmanager\.com$/i,
  /(?:^|\.)doubleclick\.net$/i,
  /(?:^|\.)hotjar\.(?:com|io)$/i,
  /(?:^|\.)clarity\.ms$/i,
  /(?:^|\.)segment\.(?:com|io)$/i,
  /(?:^|\.)mixpanel\.com$/i,
  /(?:^|\.)amplitude\.com$/i,
  /(?:^|\.)fullstory\.com$/i,
  /(?:^|\.)newrelic\.com$/i,
  /(?:^|\.)sentry\.io$/i,
];

const WIDGET_HOST_PATTERNS = [
  /(?:^|\.)intercom\.io$/i,
  /(?:^|\.)intercomcdn\.com$/i,
  /(?:^|\.)crisp\.chat$/i,
  /(?:^|\.)drift\.com$/i,
  /(?:^|\.)zendesk\.com$/i,
  /(?:^|\.)tawk\.to$/i,
  /(?:^|\.)hubspot\.com$/i,
  /(?:^|\.)hs-scripts\.com$/i,
];

const CONSENT_HOST_PATTERNS = [
  /(?:^|\.)onetrust\.com$/i,
  /(?:^|\.)cookielaw\.org$/i,
  /(?:^|\.)cookiebot\.com$/i,
  /(?:^|\.)cookieyes\.com$/i,
  /(?:^|\.)consentmanager\.net$/i,
];

const REQUIRED_PUBLIC_SCRIPT_PATTERN = /(?:gsap|scrolltrigger|lottie|swiper|splide|lenis|three(?:\.min)?|rive|anime(?:\.min)?|motion)/i;
const TRACKING_PATH_PATTERN = /\/(?:collect|pixel|pagead|analytics|tracking|conversion|telemetry|session-replay)(?:[/.?]|$)/i;
const SAME_ORIGIN_TELEMETRY_SCRIPT_PATTERN = /(?:^|\/)~flock\.js$/i;
const INLINE_TELEMETRY_PATTERN = /(?:\bgtag\s*\(|\bdataLayer\b|google-analytics|googletagmanager|\bclarity\s*\(|\bhotjar\b)/i;

type WebsiteCloneResourceCandidate = {
  url: string;
  pageUrl: string;
  resourceType: string;
  contentType: string;
};

export function classifyPixflowWebsiteCloneResource(
  candidate: WebsiteCloneResourceCandidate,
): { retain: boolean; role: PixflowWebsiteCloneResourceRole | null; reason: string } {
  let resourceUrl: URL;
  let pageUrl: URL;
  try {
    resourceUrl = new URL(candidate.url, candidate.pageUrl);
    pageUrl = new URL(candidate.pageUrl);
  } catch {
    return { retain: false, role: null, reason: 'invalid resource URL' };
  }
  const host = resourceUrl.hostname.toLowerCase();
  if (SAME_ORIGIN_TELEMETRY_SCRIPT_PATTERN.test(resourceUrl.pathname)) {
    return { retain: false, role: null, reason: 'same-origin telemetry runtime' };
  }
  if (TELEMETRY_HOST_PATTERNS.some((pattern) => pattern.test(host)) || TRACKING_PATH_PATTERN.test(resourceUrl.pathname)) {
    return { retain: false, role: null, reason: 'telemetry or tracking resource' };
  }
  if (WIDGET_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    return { retain: false, role: null, reason: 'unrelated third-party widget resource' };
  }
  if (CONSENT_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    return { retain: false, role: null, reason: 'consent telemetry resource' };
  }

  const type = candidate.resourceType.toLowerCase();
  const contentType = candidate.contentType.toLowerCase();
  const pathname = resourceUrl.pathname.toLowerCase();
  if (type === 'stylesheet' || contentType.includes('text/css') || /\.css$/.test(pathname)) {
    return { retain: true, role: 'stylesheet', reason: 'authored stylesheet' };
  }
  if (type === 'font' || contentType.startsWith('font/') || /\.(?:woff2?|ttf|otf|eot)$/.test(pathname)) {
    return { retain: true, role: 'font', reason: 'rendered font' };
  }
  if (type === 'image' || contentType.startsWith('image/') || /\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/.test(pathname)) {
    return { retain: true, role: 'image', reason: 'rendered image' };
  }
  if (type === 'media' || /^(?:video|audio)\//.test(contentType) || /\.(?:mp4|webm|m4v|mov|mp3|ogg|wav)$/.test(pathname)) {
    return { retain: true, role: 'media', reason: 'rendered media' };
  }
  if (type === 'script' || /(?:java|ecma)script/.test(contentType) || /\.(?:m?js)$/.test(pathname)) {
    if (resourceUrl.origin === pageUrl.origin) {
      return { retain: true, role: 'script', reason: 'same-origin public behavior candidate' };
    }
    if (REQUIRED_PUBLIC_SCRIPT_PATTERN.test(resourceUrl.href)) {
      return { retain: true, role: 'script', reason: 'recognized public interaction runtime' };
    }
    return { retain: false, role: null, reason: 'unrelated third-party script' };
  }
  return { retain: false, role: null, reason: 'resource does not affect captured presentation' };
}

function scriptExclusionReason(source: string, inlineText: string, pageUrl: string): string {
  if (/serviceWorker\s*\.\s*register/i.test(inlineText)) return 'service worker registration removed';
  if (!source) return INLINE_TELEMETRY_PATTERN.test(inlineText) ? 'inline telemetry bootstrap removed' : '';
  const decision = classifyPixflowWebsiteCloneResource({
    url: source,
    pageUrl,
    resourceType: 'script',
    contentType: 'application/javascript',
  });
  return decision.retain ? '' : decision.reason;
}

export function sanitizePixflowWebsiteCloneCapturedHtml(
  html: string,
  pageUrl: string,
): { html: string; exclusions: PixflowWebsiteCloneResourceDecision[] } {
  const $ = load(html);
  const exclusions: PixflowWebsiteCloneResourceDecision[] = [];
  $('script').each((_index, element) => {
    const source = String($(element).attr('src') || '').trim();
    const inlineText = String($(element).html() || '');
    const reason = scriptExclusionReason(source, inlineText, pageUrl);
    if (!reason) return;
    exclusions.push({ url: source || 'inline-script', retain: false, role: null, reason });
    $(element).remove();
  });
  $('link[rel="preconnect"], link[rel="dns-prefetch"]').each((_index, element) => {
    const href = String($(element).attr('href') || '');
    const decision = classifyPixflowWebsiteCloneResource({
      url: href,
      pageUrl,
      resourceType: 'other',
      contentType: '',
    });
    if (decision.reason.includes('telemetry') || decision.reason.includes('widget')) $(element).remove();
  });
  $('form').each((_index, element) => {
    const action = String($(element).attr('action') || '').trim();
    if (!action) return;
    exclusions.push({
      url: new URL(action, pageUrl).href,
      retain: false,
      role: null,
      reason: 'form submission endpoint removed',
    });
    $(element).removeAttr('action').removeAttr('method');
  });
  $('meta[http-equiv="refresh"]').remove();
  const serialized = $.html();
  return { html: /^\s*<!doctype\s+html>/i.test(serialized) ? serialized : `<!doctype html>\n${serialized}`, exclusions };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function rewritePixflowWebsiteCloneSourceReferences(
  content: string,
  replacements: ReadonlyMap<string, string>,
  baseUrl?: string,
): string {
  let rewritten = content;
  for (const [originalUrl, localPath] of replacements) {
    rewritten = rewritten.replace(new RegExp(escapeRegExp(originalUrl), 'g'), localPath);
    rewritten = rewritten.replace(new RegExp(escapeRegExp(originalUrl.replaceAll('&', '&amp;')), 'g'), localPath);
  }
  if (baseUrl) {
    rewritten = rewritten.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (match, quote: string, raw: string) => {
      if (/^(?:data:|blob:|#)/i.test(raw.trim())) return match;
      try {
        const absolute = new URL(raw.trim(), baseUrl).href;
        const local = replacements.get(absolute);
        return `url(${quote}${local || absolute}${quote})`;
      } catch {
        return match;
      }
    });
    rewritten = rewritten.replace(
      /(\b(?:src|href|poster|data-src|data-href)\s*=\s*)(["'])([^"']+)\2/gi,
      (match, prefix: string, quote: string, raw: string) => {
        if (/^(?:data:|blob:|#|mailto:|tel:|javascript:)/i.test(raw.trim())) return match;
        try {
          const absolute = new URL(raw.trim(), baseUrl).href;
          return `${prefix}${quote}${replacements.get(absolute) || absolute}${quote}`;
        } catch {
          return match;
        }
      },
    );
    rewritten = rewritten.replace(
      /(\b(?:srcset|data-srcset)\s*=\s*)(["'])([^"']+)\2/gi,
      (_match, prefix: string, quote: string, raw: string) => {
        const candidates = raw.split(',').map((candidate) => {
          const [candidateUrl, ...descriptor] = candidate.trim().split(/\s+/);
          if (!candidateUrl || /^(?:data:|blob:)/i.test(candidateUrl)) return candidate.trim();
          try {
            const absolute = new URL(candidateUrl, baseUrl).href;
            return [replacements.get(absolute) || absolute, ...descriptor].join(' ');
          } catch {
            return candidate.trim();
          }
        });
        return `${prefix}${quote}${candidates.join(', ')}${quote}`;
      },
    );
  }
  return rewritten;
}

function isPrivateIpAddress(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0] || '';
  if (normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  const parts = normalized.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [first = -1, second = -1] = parts;
  return first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || first === 0
    || first >= 224;
}

async function assertPublicWebsiteCloneUrl(rawUrl: string): Promise<URL> {
  const target = new URL(rawUrl);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
    throw new Error('Website Clone requires a public HTTP(S) URL without embedded credentials.');
  }
  const hostname = target.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.local')) throw new Error('Website Clone cannot access local targets.');
  if (isIP(hostname) && isPrivateIpAddress(hostname)) throw new Error('Website Clone cannot access private-network targets.');
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => isPrivateIpAddress(entry.address))) {
    throw new Error('Website Clone target resolved to a private or unavailable address.');
  }
  target.hash = '';
  return target;
}

function extensionForResource(url: string, contentType: string, role: PixflowWebsiteCloneResourceRole): string {
  const pathnameExtension = path.extname(new URL(url).pathname).toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/.test(pathnameExtension)) return pathnameExtension;
  const normalizedType = (contentType.split(';')[0] || '').trim().toLowerCase();
  const byType: Record<string, string> = {
    'text/css': '.css',
    'application/javascript': '.js',
    'text/javascript': '.js',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/svg+xml': '.svg',
    'font/woff2': '.woff2',
    'font/woff': '.woff',
    'video/mp4': '.mp4',
  };
  return byType[normalizedType] || (role === 'stylesheet' ? '.css' : role === 'script' ? '.js' : '.bin');
}

export function buildPixflowWebsiteCloneLocalResourcePath(
  url: string,
  contentType: string,
  role: PixflowWebsiteCloneResourceRole,
): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 12);
  const parsed = new URL(url);
  const stem = path.basename(parsed.pathname, path.extname(parsed.pathname))
    .replace(/[^a-z0-9_-]+/gi, '-')
    // WordPress deliberately removes leading hyphens and underscores when it
    // stores an uploaded project file. Generate the canonical local identity
    // in that same safe subset so the daemon mirror, WordPress project store,
    // captured HTML references, and converter manifest cannot disagree.
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 54) || role;
  return `website-clone/assets/${stem}-${hash}${extensionForResource(url, contentType, role)}`;
}

async function scrollAndSettleWebsiteClonePage(page: Page, waitMs: number): Promise<void> {
  await page.evaluate(`(async () => {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let previousHeight = 0;
    for (let pass = 0; pass < 3; pass += 1) {
      const height = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
      for (let y = 0; y <= height; y += 700) {
        window.scrollTo(0, y);
        await delay(90);
      }
      if (height === previousHeight) break;
      previousHeight = height;
    }
    window.scrollTo(0, 0);
    await document.fonts?.ready;
  })()`);
  await page.waitForTimeout(waitMs);
}

async function blockPrivateWebsiteCloneRequests(context: BrowserContext): Promise<void> {
  const checkedHosts = new Map<string, boolean>();
  await context.route('**/*', async (route) => {
    const requestUrl = route.request().url();
    if (!/^https?:/i.test(requestUrl)) return route.continue();
    try {
      const parsed = new URL(requestUrl);
      let blocked = checkedHosts.get(parsed.hostname);
      if (blocked === undefined) {
        try {
          const addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
          blocked = addresses.length === 0 || addresses.some((entry) => isPrivateIpAddress(entry.address));
        } catch {
          blocked = true;
        }
        checkedHosts.set(parsed.hostname, blocked);
      }
      if (blocked) return route.abort('blockedbyclient');
    } catch {
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
}

export async function capturePixflowWebsiteCloneSource(
  rawUrl: string,
  requestedWaitMs = WEBSITE_CLONE_DEFAULT_WAIT_MS,
): Promise<PixflowWebsiteCloneSourceResponse> {
  const requestedUrl = await assertPublicWebsiteCloneUrl(rawUrl);
  const executablePath = await resolvePixflowCaptureBrowser();
  if (!executablePath) return { ok: false, message: 'No supported local browser is available for Website Clone capture.' };
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await blockPrivateWebsiteCloneRequests(context);
  const page = await context.newPage();
  const resourcePromises: Promise<{ response: Response; decision: ReturnType<typeof classifyPixflowWebsiteCloneResource> } | null>[] = [];
  const decisions: PixflowWebsiteCloneResourceDecision[] = [];
  page.on('response', (response) => {
    const candidate = {
      url: response.url(),
      pageUrl: requestedUrl.href,
      resourceType: response.request().resourceType(),
      contentType: response.headers()['content-type'] || '',
    };
    const decision = classifyPixflowWebsiteCloneResource(candidate);
    decisions.push({ url: candidate.url, ...decision });
    if (!decision.retain || !decision.role || response.status() >= 400) return;
    resourcePromises.push(Promise.resolve({ response, decision }));
  });

  try {
    const navigation = await page.goto(requestedUrl.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (navigation && navigation.status() >= 400) throw new Error(`Website Clone target returned HTTP ${navigation.status()}.`);
    const finalUrl = await assertPublicWebsiteCloneUrl(page.url());
    const waitMs = Math.max(0, Math.min(WEBSITE_CLONE_MAX_WAIT_MS, Math.round(requestedWaitMs)));
    await scrollAndSettleWebsiteClonePage(page, waitMs);
    const captured = sanitizePixflowWebsiteCloneCapturedHtml(await page.content(), finalUrl.href);
    const responseEntries = await Promise.all(resourcePromises);
    const uniqueResponses = new Map<string, NonNullable<(typeof responseEntries)[number]>>();
    for (const entry of responseEntries) {
      if (entry && !uniqueResponses.has(entry.response.url())) uniqueResponses.set(entry.response.url(), entry);
    }

    const resources: PixflowWebsiteCloneCapturedResource[] = [];
    const replacements = new Map<string, string>();
    const warnings: string[] = [];
    let totalBytes = 0;
    for (const entry of [...uniqueResponses.values()].slice(0, WEBSITE_CLONE_MAX_RESOURCES)) {
      const role = entry.decision.role;
      if (!role) continue;
      try {
        let body = await entry.response.body();
        if (body.byteLength > WEBSITE_CLONE_MAX_RESOURCE_BYTES || totalBytes + body.byteLength > WEBSITE_CLONE_MAX_TOTAL_BYTES) {
          warnings.push(`Skipped oversized ${role}: ${entry.response.url()}`);
          continue;
        }
        const contentType = entry.response.headers()['content-type'] || 'application/octet-stream';
        const projectPath = buildPixflowWebsiteCloneLocalResourcePath(entry.response.url(), contentType, role);
        const relativePath = projectPath.replace(/^website-clone\//, '');
        replacements.set(entry.response.url(), relativePath);
        if (role === 'stylesheet' || role === 'script') {
          const rewritten = rewritePixflowWebsiteCloneSourceReferences(body.toString('utf8'), replacements, entry.response.url());
          body = Buffer.from(rewritten, 'utf8');
        }
        totalBytes += body.byteLength;
        resources.push({
          originalUrl: entry.response.url(),
          path: projectPath,
          role,
          contentType,
          byteLength: body.byteLength,
          sha256: createHash('sha256').update(body).digest('hex'),
          base64: body.toString('base64'),
        });
      } catch (error) {
        warnings.push(`Could not retain ${entry.response.url()}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Re-run textual resource rewriting after the complete map exists so CSS
    // references to assets observed later in the network stream are localized.
    for (const resource of resources) {
      if (resource.role !== 'stylesheet' && resource.role !== 'script') continue;
      const body = Buffer.from(resource.base64, 'base64');
      const siblingReplacements = new Map(
        [...replacements].map(([originalUrl, localPath]) => [originalUrl, path.posix.basename(localPath)]),
      );
      const rewritten = rewritePixflowWebsiteCloneSourceReferences(
        body.toString('utf8'),
        siblingReplacements,
        resource.originalUrl,
      );
      const nextBody = Buffer.from(rewritten, 'utf8');
      resource.base64 = nextBody.toString('base64');
      resource.byteLength = nextBody.byteLength;
      resource.sha256 = createHash('sha256').update(nextBody).digest('hex');
    }

    const html = rewritePixflowWebsiteCloneSourceReferences(captured.html, replacements, finalUrl.href);
    const dedupedDecisions = [...new Map(decisions.map((decision) => [decision.url, decision])).values()];
    const manifest: PixflowWebsiteCloneAcquisitionManifest = {
      schema: 'pixflow.website_clone.source.v1',
      version: 1,
      requestedUrl: requestedUrl.href,
      finalUrl: finalUrl.href,
      capturedAt: new Date().toISOString(),
      canonicalPath: WEBSITE_CLONE_CANONICAL_PATH,
      inputKind: 'document_bundle',
      sourceFidelityClone: true,
      retained: dedupedDecisions.filter((decision) => decision.retain),
      excluded: [...dedupedDecisions.filter((decision) => !decision.retain), ...captured.exclusions],
      warnings,
    };
    return { ok: true, html, canonicalPath: WEBSITE_CLONE_CANONICAL_PATH, resources, manifest };
  } finally {
    await browser.close();
  }
}
