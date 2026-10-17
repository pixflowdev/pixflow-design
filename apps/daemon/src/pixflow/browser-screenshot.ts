import { createHash, randomUUID } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { homedir, platform as hostPlatform, tmpdir } from 'node:os';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { PNG } from 'pngjs';
import type {
  PixflowVisualCaptureRequest,
  PixflowVisualCaptureResponse,
  PixflowVisualCaptureViewport,
  PixflowVisualFidelityComparison,
  PixflowVisualFidelityDifference,
  PixflowVisualInteractionAudit,
  PixflowVisualLayoutEvidence,
  PixflowVisualRenderEnvironmentEvidence,
  PixflowVisualRenderEnvironmentProfile,
} from '@open-design/contracts';
import { resolvePixflowVisualRenderEnvironment } from '@open-design/contracts';
import { applyPixflowCaptureActions } from './capture-actions.js';
import { measureTextContrast } from './text-contrast.js';

const MIN_VIEWPORT_EDGE = 240;
const MAX_VIEWPORT_EDGE = 4096;
const MAX_VIEWPORTS = 6;
const CAPTURE_VIEWPORT_CONCURRENCY = 2;
const DEFAULT_WAIT_MS = 1_200;
const MAX_WAIT_MS = 10_000;
const CAPTURE_TIMEOUT_MS = 60_000;
const CAPTURE_NAVIGATION_ATTEMPTS = 2;
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;
const VISUAL_DIFFERENCE_LIMIT = 0.12;
const VISUAL_MAXIMUM_TILE_LIMIT = 0.28;
const VISUAL_TOP_BAND_TILE_LIMIT = 0.14;
const VISUAL_TILE_COLUMNS = 6;
const VISUAL_TILE_ROWS = 8;
const FIDELITY_MINIMUM_MATCH_COVERAGE = 0.85;
const FIDELITY_MINIMUM_GEOMETRY_SCORE = 0.9;
const FIDELITY_MINIMUM_STYLE_SCORE = 0.92;
const FIDELITY_MINIMUM_OVERALL_SCORE = 0.91;
const VISUAL_CLONE_MINIMUM_MATCH_COVERAGE = 0.25;
const VISUAL_CLONE_MINIMUM_GEOMETRY_SCORE = 0.5;
const VISUAL_CLONE_MINIMUM_STYLE_SCORE = 0.75;
const VISUAL_CLONE_MINIMUM_DOCUMENT_HEIGHT_SCORE = 0.88;
const VISUAL_CLONE_MINIMUM_OVERALL_SCORE = 0.62;
const FIDELITY_MINIMUM_DOCUMENT_HEIGHT_SCORE = 0.9;
const FIDELITY_MAX_MISMATCHES = 40;
const FIDELITY_REFERENCE_CAPTURE_ATTEMPTS = 3;
// A live page can repaint a few anti-aliased glyph or canvas pixels between
// otherwise identical captures. Requiring byte-identical PNGs makes that
// harmless raster noise look like authored motion. These limits are kept far
// below the actual visual-quality gate so a changed animation frame, layout,
// image, or section state cannot form a false consensus.
const FIDELITY_REFERENCE_CONSENSUS_DIFFERENCE_LIMIT = 0.002;
const FIDELITY_REFERENCE_CONSENSUS_TILE_LIMIT = 0.02;
const FIDELITY_REFERENCE_CONSENSUS_MEAN_CHANNEL_LIMIT = 0.75;
const FIDELITY_REFERENCE_CONSENSUS_TILE_MEAN_CHANNEL_LIMIT = 2.5;
// Public marketing sites commonly hold an opaque intro/preloader for several
// seconds after `body` attaches. Capturing that transient state makes a faithful
// clone look wrong even though both pages settle to the same layout. Keep the
// authored target responsive, but give every live reference a stable-page floor.
const FIDELITY_REFERENCE_MINIMUM_WAIT_MS = 5_000;
const FIDELITY_REFERENCE_TRANSIENT_UI_TIMEOUT_MS = 10_000;
const FIDELITY_REFERENCE_TRANSIENT_UI_POLL_MS = 250;
const SCROLLED_VIEWPORT_SETTLE_MINIMUM_MS = 300;
const SCROLLED_VIEWPORT_SETTLE_MAXIMUM_MS = 900;

type PixflowDomFidelityElement = {
  key: string;
  label: string;
  tag: string;
  kind: 'container' | 'media' | 'text' | 'control';
  importance: number;
  matchKeys: readonly string[];
  rect: { x: number; y: number; width: number; height: number };
  styles: Readonly<Record<string, string>>;
};

type PixflowBrowserElement = {
  tagName: string;
  classList: Iterable<string>;
  childNodes?: Iterable<{ nodeType: number; textContent?: string | null }>;
  id: string;
  innerText?: string;
  textContent?: string | null;
  matches?: (selector: string) => boolean;
  parentElement?: PixflowBrowserElement | null;
  checkVisibility?: (options?: { checkOpacity?: boolean; checkVisibilityCSS?: boolean }) => boolean;
  getAttribute: (name: string) => string | null;
  getBoundingClientRect: () => {
    x: number;
    y: number;
    width: number;
    height: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  naturalWidth?: number;
  naturalHeight?: number;
  complete?: boolean;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
};

declare const document: {
  baseURI: string;
  documentElement: { scrollWidth: number; scrollHeight: number; clientWidth: number; clientHeight: number };
  body: { scrollWidth: number; scrollHeight: number } | null;
  querySelectorAll: (selector: string) => Iterable<PixflowBrowserElement>;
  querySelector: (selector: string) => PixflowBrowserElement | null;
};
declare function getComputedStyle(element: PixflowBrowserElement, pseudoElement?: string): {
  display: string;
  visibility: string;
  opacity: string;
  overflowX: string;
  overflowY: string;
  getPropertyValue: (property: string) => string;
};

export type PixflowDomFidelitySnapshot = {
  url: string;
  width: number;
  height: number;
  documentWidth?: number;
  documentHeight?: number;
  elements: readonly PixflowDomFidelityElement[];
  interactionAudit?: PixflowVisualInteractionAudit;
  layout?: PixflowVisualLayoutEvidence;
  renderEnvironment?: PixflowVisualRenderEnvironmentEvidence;
};

type BrowserDiscoveryOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  canExecute?: (candidate: string) => Promise<boolean>;
};

type CaptureExecutionOptions = {
  navigationTimeoutMs?: number;
};

async function navigatePixflowCapturePage(
  page: Page,
  url: string,
  navigationTimeoutMs: number,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= CAPTURE_NAVIGATION_ATTEMPTS; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: 'commit', timeout: navigationTimeoutMs });
      if (response && response.status() >= 400) {
        throw new Error(`Visual capture target returned HTTP ${response.status()}.`);
      }
      await page.locator('body').waitFor({ state: 'attached', timeout: navigationTimeoutMs });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < CAPTURE_NAVIGATION_ATTEMPTS) {
        await page.waitForTimeout(750);
      }
    }
  }
  throw lastError;
}

async function executableExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function browserCandidates(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  homeDir: string,
): string[] {
  const configured = [env.OD_BROWSER_EXECUTABLE, env.PIXFLOW_BROWSER_EXECUTABLE]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (platform === 'win32') {
    return [
      ...configured,
      path.join(String(env.PROGRAMFILES || 'C:\\Program Files'), 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(String(env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'), 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(String(env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local')), 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(String(env.PROGRAMFILES || 'C:\\Program Files'), 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(String(env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'), 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];
  }
  if (platform === 'darwin') {
    return [
      ...configured,
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      path.join(homeDir, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
    ];
  }
  const pathEntries = String(env.PATH || '').split(path.delimiter).filter(Boolean);
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable'];
  return [
    ...configured,
    ...pathEntries.flatMap((entry) => names.map((name) => path.join(entry, name))),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
}

export async function resolvePixflowCaptureBrowser(
  options: BrowserDiscoveryOptions = {},
): Promise<string | null> {
  const platform = options.platform ?? hostPlatform();
  const env = options.env ?? process.env;
  const canExecute = options.canExecute ?? executableExists;
  const seen = new Set<string>();
  for (const candidate of browserCandidates(platform, env, options.homeDir ?? homedir())) {
    const normalized = path.normalize(candidate);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (await canExecute(normalized)) return normalized;
  }
  return null;
}

function normalizeViewport(viewport: PixflowVisualCaptureViewport): PixflowVisualCaptureViewport {
  const id = String(viewport.id || '').trim().replace(/[^a-z0-9_-]+/gi, '-').slice(0, 48);
  const width = Math.round(Number(viewport.width));
  const height = Math.round(Number(viewport.height));
  const scrollPosition = viewport.scrollPosition || 'top';
  if (!id) throw new Error('Every visual capture viewport needs an id.');
  if (!Number.isFinite(width) || width < MIN_VIEWPORT_EDGE || width > MAX_VIEWPORT_EDGE) {
    throw new Error(`Viewport ${id} width must be between ${MIN_VIEWPORT_EDGE} and ${MAX_VIEWPORT_EDGE}px.`);
  }
  if (!Number.isFinite(height) || height < MIN_VIEWPORT_EDGE || height > MAX_VIEWPORT_EDGE) {
    throw new Error(`Viewport ${id} height must be between ${MIN_VIEWPORT_EDGE} and ${MAX_VIEWPORT_EDGE}px.`);
  }
  if (!['top', 'middle', 'bottom'].includes(scrollPosition)) {
    throw new Error(`Viewport ${id} scrollPosition must be top, middle, or bottom.`);
  }
  return { id, width, height, scrollPosition, ...(viewport.actions ? { actions: viewport.actions } : {}) };
}

export function buildPixflowBrowserScreenshotArgs({
  url,
  viewport,
  screenshotPath,
  userDataDir,
  waitMs,
  platform = hostPlatform(),
}: {
  url: string;
  viewport: PixflowVisualCaptureViewport;
  screenshotPath: string;
  userDataDir: string;
  waitMs: number;
  platform?: NodeJS.Platform;
}): string[] {
  return [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-sync',
    '--hide-scrollbars',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--run-all-compositor-stages-before-draw',
    '--force-device-scale-factor=1',
    `--user-data-dir=${userDataDir}`,
    `--window-size=${viewport.width},${viewport.height}`,
    `--virtual-time-budget=${waitMs}`,
    `--screenshot=${screenshotPath}`,
    ...(platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() === 0 ? ['--no-sandbox'] : []),
    url,
  ];
}

async function runExactViewportCapture(
  browser: Browser,
  url: string,
  viewport: PixflowVisualCaptureViewport,
  screenshotPath: string,
  waitMs: number,
  navigationTimeoutMs: number,
  reducedMotion: 'reduce' | 'no-preference' = 'reduce',
  themeStylePreviewCss = '',
  renderEnvironmentProfile?: PixflowVisualRenderEnvironmentProfile,
): Promise<PixflowDomFidelitySnapshot> {
  const resolvedRenderEnvironment = resolvePixflowVisualRenderEnvironment(renderEnvironmentProfile);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion,
  });
  try {
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && consoleErrors.length < 24) {
        consoleErrors.push(String(message.text() || '').replace(/\s+/g, ' ').trim().slice(0, 240));
      }
    });
    page.on('pageerror', (error) => {
      if (pageErrors.length < 24) pageErrors.push(String(error?.message || error).replace(/\s+/g, ' ').trim().slice(0, 240));
    });
    page.on('requestfailed', (request) => {
      if (failedRequests.length < 24) {
        failedRequests.push(`${request.url()}${request.failure()?.errorText ? ` (${request.failure()?.errorText})` : ''}`.slice(0, 320));
      }
    });
      // WordPress/plugin pages can keep deferred scripts, images, analytics,
      // or other resources open indefinitely. Bricks frontend content is
      // server-rendered, so the reliable boundary is the response plus an
      // attached body and the explicit settle delay belowâ€”not every page
      // resource reaching DOMContentLoaded/load.
    await navigatePixflowCapturePage(page, url, navigationTimeoutMs);
    const renderEnvironmentCss = resolvedRenderEnvironment
      ? `@layer pixflow-render-environment {\n${resolvedRenderEnvironment.css}\n${themeStylePreviewCss.slice(0, 80_000)}\n}`
      : themeStylePreviewCss.slice(0, 80_000);
    if (renderEnvironmentCss.trim()) {
      await page.addStyleTag({
        content: `${renderEnvironmentCss}\n/* render-only; not persisted */`,
      });
    }
    if (waitMs > 0) await page.waitForTimeout(waitMs);
    if (reducedMotion === 'no-preference') {
      await waitForPixflowReferenceTransientUi(page);
    }
    await stabilizePixflowCaptureVideos(page);
    await positionPixflowCapturePage(page, viewport.scrollPosition || 'top', waitMs);
    if (reducedMotion === 'no-preference') {
      // Scroll before settling the authored runtimes: Webflow IX2, GSAP
      // ScrollTrigger, and Lottie commonly start only after their section
      // enters the viewport. Freezing before the scroll left every capture at
      // a network-timing-dependent frame and made clone critique chase a
      // moving reference.
      await stabilizePixflowCaptureAnimations(page);
    }
    await suppressPixflowCaptureNonCloneableOverlays(page);
    await applyPixflowCaptureActions(page, viewport.actions);
    await page.waitForTimeout(100);
    const snapshot = await capturePixflowDomFidelitySnapshot(page, url, viewport);
    const layout = await capturePixflowLayoutEvidence(page, viewport, {
      consoleErrors: [...consoleErrors, ...pageErrors],
      failedRequests,
    });
    const renderEnvironment = resolvedRenderEnvironment
      ? {
          ...resolvedRenderEnvironment.identity,
          applied: true as const,
          computed: await page.evaluate(() => {
            const rootElement = document.querySelector('html');
            const bodyElement = document.querySelector('body');
            const root = rootElement ? getComputedStyle(rootElement) : null;
            const body = bodyElement ? getComputedStyle(bodyElement) : null;
            const numeric = (value: string | undefined) => Number.parseFloat(String(value || '0')) || 0;
            return {
              rootFontSizePx: numeric(root?.getPropertyValue('font-size')),
              rootBoxSizing: root?.getPropertyValue('box-sizing') || '',
              bodyMarginTopPx: numeric(body?.getPropertyValue('margin-top')),
              bodyMarginRightPx: numeric(body?.getPropertyValue('margin-right')),
              bodyMarginBottomPx: numeric(body?.getPropertyValue('margin-bottom')),
              bodyMarginLeftPx: numeric(body?.getPropertyValue('margin-left')),
            };
          }),
        }
      : undefined;
    await capturePixflowViewportScreenshot(page, screenshotPath, navigationTimeoutMs);
    return { ...snapshot, layout, ...(renderEnvironment ? { renderEnvironment } : {}) };
  } finally {
    await context.close();
  }
}

async function capturePixflowLayoutEvidence(
  page: Page,
  viewport: PixflowVisualCaptureViewport,
  diagnostics: { consoleErrors: string[]; failedRequests: string[] },
): Promise<PixflowVisualLayoutEvidence> {
  const measured = await page.evaluate((viewportId) => {
    const ignoredTags = new Set(['html', 'head', 'body', 'script', 'style', 'link', 'meta', 'noscript', 'template', 'option', 'optgroup']);
    const all = Array.from(document.querySelectorAll('*'));
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    const documentHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
    const overflowSources: string[] = [];
    const viewportEscapes: Array<{ selector: string; left: number; right: number; top: number; bottom: number }> = [];
    const zeroSizeVisible: string[] = [];
    const clippedElements: Array<{ selector: string; evidence: string[] }> = [];
    const missingResources: Array<{ kind: 'image' | 'stylesheet' | 'script' | 'font' | 'request'; url: string; selector?: string }> = [];
    const invalidInteractiveTargets: Array<{ selector: string; reason: string }> = [];
    const oversizedElements: Array<{ selector: string; evidence: string[] }> = [];
    const rootElement = document.querySelector('html');
    const headings: NonNullable<PixflowVisualLayoutEvidence['headings']> = [];
    let headingCount = 0;
    const images: NonNullable<PixflowVisualLayoutEvidence['images']> = { count: 0, truncated: false, samples: [] };
    const typography: Required<NonNullable<PixflowVisualLayoutEvidence['typography']>> = {
      rootFontSize: rootElement ? getComputedStyle(rootElement).getPropertyValue('font-size') : '',
      samples: [],
      documentSamples: [],
      documentTextCount: 0,
      documentTruncated: false,
    };
    for (let index = 0; index < all.length; index += 1) {
      const element = all[index]!;
      const tag = element.tagName.toLowerCase();
      if (ignoredTags.has(tag)) continue;
      const style = getComputedStyle(element);
      let ancestry: PixflowBrowserElement | null | undefined = element;
      let belongsToAriaHiddenDecoration = false;
      while (ancestry) {
        if (ancestry.getAttribute('aria-hidden') === 'true') {
          belongsToAriaHiddenDecoration = true;
          break;
        }
        ancestry = ancestry.parentElement;
      }
      const hiddenByRenderedAncestry = element.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false;
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || belongsToAriaHiddenDecoration || hiddenByRenderedAncestry) continue;
      const rect = element.getBoundingClientRect();
      const id = String(element.id || '').trim().replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80);
      const classes = Array.from(element.classList).filter((name) => name.length >= 2 && !/^brxe?|bricks-|wp-|wordpress/i.test(name)).slice(0, 3);
      const selector = `${tag}${id ? `#${id}` : ''}${classes.map((name) => `.${name}`).join('')}`.slice(0, 180);
      if (tag === 'img' && rect.width > 0 && rect.height > 0) {
        images.count += 1;
        images.truncated = images.count > 100;
        if (images.samples.length < 100) images.samples.push({
          selector, alt: (element.getAttribute('alt') || '').slice(0, 200),
          naturalWidth: Number(element.naturalWidth || 0), naturalHeight: Number(element.naturalHeight || 0),
          objectFit: style.getPropertyValue('object-fit'), objectPosition: style.getPropertyValue('object-position'),
          bounds: { left: Number(rect.left.toFixed(2)), top: Number(rect.top.toFixed(2)), width: Number(rect.width.toFixed(2)), height: Number(rect.height.toFixed(2)) },
        });
      }
      if (/^h[1-6]$/.test(tag) && rect.width > 0 && rect.height > 0) {
        headingCount += 1;
        if (headings.length < 100) headings.push({ level: Number(tag[1]), selector, text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200) });
      }
      const meaningful = /^(?:img|picture|video|audio|iframe|canvas|svg|h[1-6]|p|a|button|input|select|textarea|form|label|section|article|main|nav|header|footer)$/.test(tag)
        || Boolean(element.textContent?.trim());
      if (!meaningful) continue;
      const containsDirectText = Array.from(element.childNodes || []).some((node) => (
        node.nodeType === 3 && Boolean(node.textContent?.trim())
      ));
      const textInViewport = rect.bottom > 0 && rect.top < viewportHeight && rect.right > 0 && rect.left < viewportWidth;
      // Placeholder ink is independently styled; field labels and entered values
      // cannot describe it. :placeholder-shown excludes hints hidden by a value.
      const placeholder = /^(?:input|textarea)$/.test(tag) && element.matches?.(':placeholder-shown')
        ? element.getAttribute('placeholder')?.trim() : undefined;
      const text = placeholder || ((/^(?:h[1-6]|p|a|button|label)$/.test(tag) || containsDirectText)
        ? element.textContent?.trim() : undefined);
      const textStyle = placeholder ? getComputedStyle(element, '::placeholder') : style;
      if (rect.width > 0 && rect.height > 0
        && text && textStyle.visibility !== 'hidden' && Number(textStyle.opacity) !== 0) {
        typography.documentTextCount += 1;
        typography.documentTruncated = typography.documentTextCount > 200;
        if (typography.documentSamples.length < 200 || (textInViewport && typography.samples.length < 40)) {
          const backgroundLayers: Array<{ color: string; image: string; opacity: string }> = [];
          const compositingEffects = new Set<string>();
          if (placeholder && textStyle.opacity && Number(textStyle.opacity) !== 1) compositingEffects.add('placeholder-opacity');
          for (let surface: PixflowBrowserElement | null | undefined = element; surface; surface = surface.parentElement) {
            const surfaceStyle = getComputedStyle(surface);
            const color = surfaceStyle.getPropertyValue('background-color');
            const image = surfaceStyle.getPropertyValue('background-image');
            const opacity = surfaceStyle.getPropertyValue('opacity');
            if (opacity && Number(opacity) !== 1) compositingEffects.add('opacity');
            for (const property of ['filter', 'backdrop-filter', 'mix-blend-mode']) {
              const value = surfaceStyle.getPropertyValue(property);
              if (value && value !== 'none' && value !== 'normal') compositingEffects.add(property);
            }
            if (backgroundLayers.length < 6 && ((color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') || (image && image !== 'none') || (opacity && opacity !== '1'))) {
              backgroundLayers.push({ color, image, opacity });
            }
          }
          const parentRect = element.parentElement?.getBoundingClientRect();
          const sample = {
            selector: placeholder ? `${selector}::placeholder` : selector, text: text.replace(/\s+/g, ' ').trim().slice(0, 100),
            fontSize: textStyle.getPropertyValue('font-size'),
            lineHeight: textStyle.getPropertyValue('line-height'),
            fontFamily: textStyle.getPropertyValue('font-family'),
            color: textStyle.getPropertyValue('color'), fontWeight: textStyle.getPropertyValue('font-weight'), backgroundLayers,
            compositingEffects: Array.from(compositingEffects),
            width: Number(rect.width.toFixed(2)), height: Number(rect.height.toFixed(2)),
            bounds: { left: Number(rect.left.toFixed(2)), top: Number(rect.top.toFixed(2)), width: Number(rect.width.toFixed(2)), height: Number(rect.height.toFixed(2)) },
            ...(parentRect ? { parentBounds: { left: Number(parentRect.left.toFixed(2)), top: Number(parentRect.top.toFixed(2)), width: Number(parentRect.width.toFixed(2)), height: Number(parentRect.height.toFixed(2)) } } : {}),
          };
          if (textInViewport && typography.samples.length < 40) typography.samples.push(sample);
          if (typography.documentSamples.length < 200) typography.documentSamples.push({
            ...sample, top: Number(rect.top.toFixed(2)), left: Number(rect.left.toFixed(2)), inViewport: textInViewport,
          });
        }
      }
      if (rect.width < 1 || rect.height < 1) {
        zeroSizeVisible.push(selector);
      }
      const right = rect.right;
      const left = rect.left;
      const bottom = rect.bottom;
      const top = rect.top;
      const intersectsViewportVertically = bottom > -4 && top < viewportHeight + 4;
      const role = String(element.getAttribute('role') || '').toLowerCase();
      const intentionalOverflow = element.getAttribute('data-pixflow-allow-overflow') === 'true'
        || role === 'carousel'
        || role === 'listbox'
        || style.overflowX === 'auto'
        || style.overflowX === 'scroll';
      // A document is expected to extend vertically beyond a screenshot checkpoint.
      // Only horizontal escapes that intersect the current viewport are evidence of
      // broken viewport geometry; later/earlier flow content is reached by scrolling.
      if (intersectsViewportVertically && (right > viewportWidth + 4 || left < -4) && rect.width > 1 && rect.height > 1) {
        if (!intentionalOverflow) {
          viewportEscapes.push({ selector, left: Number(left.toFixed(2)), right: Number(right.toFixed(2)), top: Number(top.toFixed(2)), bottom: Number(bottom.toFixed(2)) });
        }
      }
      if (!intentionalOverflow && (rect.right > viewportWidth + 2 || rect.left < -2 || element.scrollWidth > element.clientWidth + 2) && rect.width > 1 && rect.height > 1) {
        overflowSources.push(selector);
      }
      const clippingCanHideUserContent = /^(?:h[1-6]|p|a|button|input|select|textarea|label|li)$/.test(tag)
        || containsDirectText;
      if (!intentionalOverflow
        && clippingCanHideUserContent
        && (style.overflowX === 'hidden' || style.overflowX === 'clip' || style.overflowY === 'hidden' || style.overflowY === 'clip')
        && (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2)) {
        clippedElements.push({ selector, evidence: [`scroll=${element.scrollWidth}x${element.scrollHeight}`, `client=${element.clientWidth}x${element.clientHeight}`] });
      }
      if (tag === 'img' && element.getAttribute('src') && element.complete === true && Number(element.naturalWidth || 0) === 0) {
        missingResources.push({ kind: 'image', url: String(element.getAttribute('src') || '').slice(0, 320), selector });
      }
      if (/^(?:a|button)$/.test(tag)) {
        const label = String(element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim();
        const target = String(element.getAttribute('href') || '').trim();
        if (!label) invalidInteractiveTargets.push({ selector, reason: 'missing accessible name' });
        else if (tag === 'a' && !target) invalidInteractiveTargets.push({ selector, reason: 'missing href target' });
      }
      if (/^(?:input|select|textarea)$/.test(tag)) {
        const label = String(element.getAttribute('aria-label') || element.getAttribute('placeholder') || '').trim();
        const idValue = String(element.id || '').trim();
        const hasLabel = idValue && Array.from(document.querySelectorAll('label')).some((label) => label.getAttribute('for') === idValue);
        if (!label && !hasLabel) invalidInteractiveTargets.push({ selector, reason: 'form control has no associated label' });
      }
      const oversizedMedia = /^(?:img|video|iframe|canvas|svg)$/.test(tag)
        && rect.height > Math.max(viewportHeight * 3, 2400);
      if (rect.width > viewportWidth * 1.5 || oversizedMedia) {
        oversizedElements.push({ selector, evidence: [`rect=${Math.round(rect.width)}x${Math.round(rect.height)}`, `viewport=${viewportWidth}x${viewportHeight}`] });
      }
    }
    return {
      viewport: viewportId,
      viewportWidth,
      viewportHeight,
      documentWidth,
      documentHeight,
      clientWidth: viewportWidth,
      clientHeight: viewportHeight,
      horizontalOverflowPx: Math.max(0, documentWidth - viewportWidth),
      overflowSources: Array.from(new Set(overflowSources)).slice(0, 24),
      viewportEscapes: viewportEscapes.slice(0, 24),
      zeroSizeVisible: Array.from(new Set(zeroSizeVisible)).slice(0, 24),
      clippedElements: clippedElements.slice(0, 24),
      missingResources: missingResources.slice(0, 24),
      invalidInteractiveTargets: invalidInteractiveTargets.slice(0, 24),
      oversizedElements: oversizedElements.slice(0, 24),
      typography,
      headings,
      headingsTruncated: headingCount > 100,
      images,
    };
  }, viewport.id);
  for (const sample of [...measured.typography.samples, ...measured.typography.documentSamples]) {
    sample.contrast = measureTextContrast(sample);
  }
  return {
    ...measured,
    consoleErrors: diagnostics.consoleErrors.slice(0, 24),
    failedRequests: diagnostics.failedRequests.slice(0, 24),
    truncated: diagnostics.consoleErrors.length > 24 || diagnostics.failedRequests.length > 24,
  };
}

async function stabilizePixflowCaptureVideos(page: Page): Promise<void> {
  await page.evaluate(`(async () => {
    await Promise.all(Array.from(document.querySelectorAll('video')).map(async (video) => {
      video.pause();
      try {
        if (video.readyState < 2) {
          await Promise.race([
            new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true })),
            new Promise((resolve) => setTimeout(resolve, 500)),
          ]);
        }
        video.currentTime = 0;
        if (video.readyState >= 2) {
          await Promise.race([
            new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true })),
            new Promise((resolve) => setTimeout(resolve, 500)),
          ]);
        }
      } catch {}
      video.pause();
    }));
  })()`);
  await page.waitForTimeout(100);
}

async function stabilizePixflowCaptureAnimations(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    const globalObject = window;

    // Resolve finite entrance/reveal animations to their authored end state.
    // Infinite decorative loops use frame zero so repeated evidence does not
    // depend on when remote assets happened to finish loading.
    for (const animation of document.getAnimations()) {
      try {
        const timing = animation.effect && typeof animation.effect.getComputedTiming === 'function'
          ? animation.effect.getComputedTiming()
          : null;
        if (timing && timing.iterations === Infinity) {
          animation.currentTime = 0;
          animation.pause();
        } else {
          animation.finish();
        }
      } catch {
        try { animation.pause(); } catch {}
      }
    }

    // Webflow's Lottie adapter normally exposes bodymovin through one of these
    // runtime handles. Pinning registered compositions is capture-only; the
    // interaction inventory is collected separately and remains intact.
    const lottieRuntimes = new Set();
    try {
      const webflowLottie = globalObject.Webflow?.require?.('lottie');
      if (webflowLottie?.lottie) lottieRuntimes.add(webflowLottie.lottie);
      if (webflowLottie?.getRegisteredAnimations) lottieRuntimes.add(webflowLottie);
    } catch {}
    if (globalObject.lottie) lottieRuntimes.add(globalObject.lottie);
    if (globalObject.bodymovin) lottieRuntimes.add(globalObject.bodymovin);
    for (const runtime of lottieRuntimes) {
      let instances = [];
      try { instances = runtime.getRegisteredAnimations?.() || []; } catch {}
      for (const instance of instances) {
        try {
          const terminalFrame = Math.max(0, Number(instance.totalFrames || 1) - 1);
          instance.goToAndStop?.(terminalFrame, true);
          instance.pause?.();
        } catch {}
      }
    }

    // GSAP does not use the Web Animations API. Complete finite entrances and
    // pin repeating decorative timelines to their initial frame.
    try {
      const children = globalObject.gsap?.globalTimeline?.getChildren?.(true, true, true) || [];
      for (const tween of children) {
        try {
          const repeats = Number(tween.repeat?.() ?? 0);
          tween.progress?.(repeats < 0 ? 0 : 1, true);
          tween.pause?.();
        } catch {}
      }
      globalObject.ScrollTrigger?.update?.(true);
    } catch {}
    try { globalObject.lenis?.stop?.(); } catch {}

    let captureStyle = document.getElementById('od-visual-capture-stability');
    if (!captureStyle) {
      captureStyle = document.createElement('style');
      captureStyle.id = 'od-visual-capture-stability';
      captureStyle.textContent = '*,:before,:after{animation-play-state:paused!important;transition-property:none!important;scroll-behavior:auto!important;caret-color:transparent!important}';
      document.head.appendChild(captureStyle);
    }
  })()`);
}

/**
 * Consent prompts and advertising overlays are environmental chrome, not page
 * content a responsible clone should reproduce. Suppress only viewport-fixed
 * controls with explicit consent/advertising language, on both sides of the
 * comparison, so their asynchronous arrival cannot alter parity evidence.
 */
async function suppressPixflowCaptureNonCloneableOverlays(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    const intent = /(?:cookie|consent|privacy preferences?|accept all|reject all|deny all|advertis(?:e|ing|ement))/i;
    for (const element of document.querySelectorAll('body *')) {
      const style = getComputedStyle(element);
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      const descriptor = [
        element.id,
        element.className,
        element.getAttribute('aria-label'),
        element.getAttribute('data-consent'),
        element.getAttribute('data-cookie'),
        element.textContent,
      ].filter(Boolean).join(' ').slice(0, 4000);
      if (!intent.test(descriptor)) continue;
      if (!element.matches('button,dialog,[role="dialog"],[role="region"],aside,section,div,form')) continue;
      element.setAttribute('data-od-capture-suppressed', 'environmental-overlay');
      element.style.setProperty('display', 'none', 'important');
    }
  })()`);
}

/**
 * Wait for a positively identified full-viewport intro/preloader to leave the
 * live reference. Generated targets intentionally use reduced motion for stable
 * evidence, but live sites must run normal motion because their loader teardown
 * is often coupled to a Webflow/GSAP animation or a no-preference media query.
 */
async function waitForPixflowReferenceTransientUi(page: Page): Promise<void> {
  const deadline = Date.now() + FIDELITY_REFERENCE_TRANSIENT_UI_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const hasTransientUi = await page.evaluate<boolean>(`(() => {
      const hint = /(?:^|[\\s_-])(pre-?loader|loader|loading|splash|intro|curtain|page[\\s_-]?transition|progress)(?:$|[\\s_-])/i;
      const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
      for (const element of document.querySelectorAll('body *')) {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0.01) continue;
        const rect = element.getBoundingClientRect();
        const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
        const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        if ((visibleWidth * visibleHeight) / viewportArea < 0.6) continue;
        const descriptor = [
          element.id,
          element.className,
          element.getAttribute('data-loader'),
          element.getAttribute('data-loading'),
          element.getAttribute('aria-label'),
          element.getAttribute('role'),
        ].filter(Boolean).join(' ');
        const explicitlyBusy = element.getAttribute('aria-busy') === 'true' || element.getAttribute('role') === 'progressbar';
        const overlaysViewport = style.position === 'fixed' || style.position === 'absolute';
        if ((explicitlyBusy || hint.test(descriptor)) && overlaysViewport) return true;
      }
      return false;
    })()`);
    if (!hasTransientUi) return;
    await page.waitForTimeout(FIDELITY_REFERENCE_TRANSIENT_UI_POLL_MS);
  }
}

async function positionPixflowCapturePage(
  page: Page,
  scrollPosition: NonNullable<PixflowVisualCaptureViewport['scrollPosition']>,
  waitMs: number,
): Promise<void> {
  const fraction = scrollPosition === 'bottom' ? 1 : scrollPosition === 'middle' ? 0.5 : 0;
  await page.evaluate(
    `window.scrollTo(0, Math.round(Math.max(0, (document.scrollingElement || document.documentElement).scrollHeight - window.innerHeight) * ${fraction}))`,
  );
  const settleMs = fraction > 0
    ? Math.max(SCROLLED_VIEWPORT_SETTLE_MINIMUM_MS, Math.min(waitMs, SCROLLED_VIEWPORT_SETTLE_MAXIMUM_MS))
    : 100;
  // Scrolling is itself the load boundary for Bricks lazy images and entrance
  // interactions. Waiting only before the scroll captures placeholders and
  // hidden initial states even though a user would see the settled section.
  await page.waitForTimeout(settleMs);
}

async function capturePixflowViewportScreenshot(
  page: Page,
  screenshotPath: string,
  timeoutMs: number,
): Promise<void> {
  try {
    await page.screenshot({
      path: screenshotPath,
      type: 'png',
      fullPage: false,
      animations: 'allow',
      // Playwright waits for document.fonts.ready before capturing. Some
      // WordPress/plugin previews leave that promise pending even after the DOM
      // and visible fallback fonts have rendered. Bound that wait so one page
      // cannot consume the entire multi-viewport capture budget.
      timeout: Math.max(1_000, Math.min(10_000, timeoutMs)),
    });
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/screenshot.*timeout|waiting for fonts to load/i.test(message)) {
      throw error;
    }
  }

  // CDP captures the same rendered Chromium surface without Playwright's
  // unbounded font-readiness precondition. This remains a real browser
  // screenshot, not the DOM-outline approximation rejected by the visual gate.
  const session = await page.context().newCDPSession(page);
  try {
    const capture = await session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await writeFile(screenshotPath, Buffer.from(capture.data, 'base64'));
  } finally {
    await session.detach();
  }
}


async function compareAgainstSettledPixflowReference(
  browser: Browser,
  referenceUrl: string,
  viewport: PixflowVisualCaptureViewport,
  waitMs: number,
  navigationTimeoutMs: number,
  targetSnapshot: PixflowDomFidelitySnapshot,
  actualBytes: Buffer,
  referenceScreenshotPath: string,
  fidelityProfile: 'structural' | 'visual-clone' = 'structural',
): Promise<{
  comparison: NonNullable<PixflowVisualCaptureResponse['captures'][number]['comparison']>;
  fidelity: PixflowVisualFidelityComparison;
  referenceCapture: NonNullable<PixflowVisualCaptureResponse['captures'][number]['referenceCapture']>;
}> {
  type ReferenceCandidate = {
    bytes: Buffer;
    comparison: NonNullable<PixflowVisualCaptureResponse['captures'][number]['comparison']>;
    fidelity: PixflowVisualFidelityComparison;
    referenceCapture: NonNullable<PixflowVisualCaptureResponse['captures'][number]['referenceCapture']>;
  };
  const candidates: ReferenceCandidate[] = [];
  for (let attempt = 1; attempt <= FIDELITY_REFERENCE_CAPTURE_ATTEMPTS; attempt += 1) {
    const attemptPath = `${referenceScreenshotPath}.${attempt}.png`;
    const referenceSnapshot = await runExactViewportCapture(
      browser,
      referenceUrl,
      viewport,
      attemptPath,
      Math.max(waitMs, FIDELITY_REFERENCE_MINIMUM_WAIT_MS),
      navigationTimeoutMs,
      'no-preference',
    );
    const referenceBytes = await readFile(attemptPath);
    if (referenceBytes.length < 100) throw new Error('Browser returned an empty reference screenshot.');
    const candidate: ReferenceCandidate = {
      bytes: referenceBytes,
      comparison: comparePixflowScreenshotBuffers(actualBytes, referenceBytes, referenceUrl),
      fidelity: comparePixflowDomSnapshots(referenceSnapshot, targetSnapshot, fidelityProfile),
      referenceCapture: {
        mimeType: 'image/png' as const,
        base64: referenceBytes.toString('base64'),
        sha256: createHash('sha256').update(referenceBytes).digest('hex'),
        ...(referenceSnapshot.interactionAudit ? { interactionAudit: referenceSnapshot.interactionAudit } : {}),
      },
    };
    candidates.push(candidate);
    if (candidates.length < 2) continue;

    for (let priorIndex = 0; priorIndex < candidates.length - 1; priorIndex += 1) {
      const prior = candidates[priorIndex]!;
      const exactMatch = prior.referenceCapture.sha256 === candidate.referenceCapture.sha256;
      const consensusComparison = exactMatch
        ? null
        : comparePixflowScreenshotBuffers(prior.bytes, candidate.bytes, referenceUrl);
      const visuallyEquivalent = exactMatch || Boolean(
        consensusComparison
        && consensusComparison.differenceRatio <= FIDELITY_REFERENCE_CONSENSUS_DIFFERENCE_LIMIT
        && consensusComparison.maximumTileDifferenceRatio <= FIDELITY_REFERENCE_CONSENSUS_TILE_LIMIT
        && consensusComparison.meanAbsoluteChannelDifference <= FIDELITY_REFERENCE_CONSENSUS_MEAN_CHANNEL_LIMIT
        && consensusComparison.maximumTileMeanAbsoluteChannelDifference
          <= FIDELITY_REFERENCE_CONSENSUS_TILE_MEAN_CHANNEL_LIMIT
      );
      if (visuallyEquivalent) {
        const selected = [prior, candidate]
          .sort((left, right) => right.fidelity.overallScore - left.fidelity.overallScore)[0]!;
        return {
          ...selected,
          referenceCapture: {
            ...selected.referenceCapture,
            stability: {
              mode: exactMatch ? 'exact' : 'consensus',
              attempts: candidates.length,
              ...(consensusComparison ? {
                differenceRatio: consensusComparison.differenceRatio,
                maximumTileDifferenceRatio: consensusComparison.maximumTileDifferenceRatio,
                meanAbsoluteChannelDifference: consensusComparison.meanAbsoluteChannelDifference,
                maximumTileMeanAbsoluteChannelDifference: consensusComparison.maximumTileMeanAbsoluteChannelDifference,
              } : {}),
            },
          },
        };
      }
    }
  }

  // Some public pages intentionally keep a scroll-owned canvas or product
  // sequence moving even after CSS, WAAPI, video, GSAP, and Lottie have been
  // frozen. Dropping the viewport entirely makes clone parity impossible to
  // evaluate. Select the pixel medoid instead: the real captured frame with
  // the smallest aggregate distance to every other attempt. The normal pixel
  // and DOM parity thresholds still apply to that frame, so this recovers
  // evidence without approving a weak clone or choosing the frame closest to
  // the generated target.
  const ranked = candidates.map((candidate, candidateIndex) => {
    const comparisons = candidates
      .map((other, otherIndex) => otherIndex === candidateIndex
        ? null
        : comparePixflowScreenshotBuffers(candidate.bytes, other.bytes, referenceUrl))
      .filter((comparison): comparison is ReferenceCandidate['comparison'] => Boolean(comparison));
    const aggregateDistance = comparisons.reduce((sum, comparison) => (
      sum
      + comparison.differenceRatio
      + comparison.maximumTileDifferenceRatio
      + (comparison.meanAbsoluteChannelDifference / 255)
      + (comparison.maximumTileMeanAbsoluteChannelDifference / 255)
    ), 0);
    const worst = comparisons.sort((left, right) => (
      right.differenceRatio - left.differenceRatio
      || right.maximumTileDifferenceRatio - left.maximumTileDifferenceRatio
    ))[0];
    return { candidate, aggregateDistance, worst };
  }).sort((left, right) => left.aggregateDistance - right.aggregateDistance);
  const representative = ranked[0]!;
  return {
    ...representative.candidate,
    referenceCapture: {
      ...representative.candidate.referenceCapture,
      stability: {
        mode: 'representative',
        attempts: candidates.length,
        ...(representative.worst ? {
          differenceRatio: representative.worst.differenceRatio,
          maximumTileDifferenceRatio: representative.worst.maximumTileDifferenceRatio,
          meanAbsoluteChannelDifference: representative.worst.meanAbsoluteChannelDifference,
          maximumTileMeanAbsoluteChannelDifference: representative.worst.maximumTileMeanAbsoluteChannelDifference,
        } : {}),
      },
    },
  };
}

const PIXFLOW_FIDELITY_STYLE_PROPERTIES = [
  'display', 'position', 'box-sizing',
  'flex-direction', 'flex-wrap', 'align-items', 'align-content', 'justify-content',
  'gap', 'row-gap', 'column-gap',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'overflow-x', 'overflow-y',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
  'text-align', 'text-transform', 'text-decoration-line', 'color',
  'background-color', 'background-image', 'background-size', 'background-position',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'box-shadow', 'opacity', 'transform', 'filter', 'object-fit', 'object-position', 'aspect-ratio',
] as const;

async function capturePixflowDomFidelitySnapshot(
  page: Page,
  url: string,
  viewport: PixflowVisualCaptureViewport,
): Promise<PixflowDomFidelitySnapshot> {
  // DOM fidelity measures the settled authored layout, not the transient
  // pre-scroll state of Bricks entrance interactions. Reveal those elements
  // only while reading geometry/styles; the reset is removed before the
  // actual pixel screenshot so the user-visible capture remains untouched.
  const fidelityReset = await page.addStyleTag({
    content: '.bricks-lazy-hidden{opacity:1!important;visibility:visible!important;transform:none!important;filter:none!important;animation:none!important;transition:none!important}',
  });
  try {
    const snapshot = await page.evaluate((styleProperties) => {
    // Keep this callback free of locally declared functions. The packaged
    // daemon preserves function names with an esbuild helper that is not
    // available after Playwright serializes this callback into the page.
    const ignoredTags = new Set(['html', 'body', 'script', 'style', 'link', 'meta', 'noscript', 'template']);
    const containerTags = new Set(['header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'form', 'fieldset', 'table', 'ul', 'ol', 'dl']);
    const mediaTags = new Set(['img', 'picture', 'svg', 'video', 'audio', 'canvas', 'iframe']);
    const controlTags = new Set(['button', 'input', 'select', 'textarea', 'summary']);
    const textTags = new Set([
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'label', 'li', 'dt', 'dd',
      'blockquote', 'figcaption', 'caption', 'th', 'td', 'pre', 'code', 'span',
      'strong', 'small', 'em',
    ]);
    const all = Array.from(document.querySelectorAll('*'));
    const records: Array<{
      key: string;
      label: string;
      tag: string;
      kind: 'container' | 'media' | 'text' | 'control';
      importance: number;
      matchKeys: string[];
      rect: { x: number; y: number; width: number; height: number };
      styles: Record<string, string>;
    }> = [];
    for (let ordinal = 0; ordinal < all.length && records.length < 900; ordinal += 1) {
      const element = all[ordinal] as PixflowBrowserElement;
      const tag = element.tagName.toLowerCase();
      if (ignoredTags.has(tag)) continue;
      const rect = element.getBoundingClientRect();
      const computed = getComputedStyle(element);
      if (computed.display === 'none' || computed.visibility === 'hidden' || Number(computed.opacity) === 0) continue;
      if (typeof element.checkVisibility === 'function' && !element.checkVisibility({
        checkOpacity: true,
        checkVisibilityCSS: true,
      })) continue;
      if (rect.width < 1 || rect.height < 1) continue;
      // Each fidelity result belongs to one screenshot checkpoint. Excluding
      // offscreen nodes prevents dormant entrance-animation positions and
      // hidden interaction surfaces elsewhere in the document from being
      // scored against what is actually visible in this frame. The full page
      // remains covered by the top/middle/bottom capture contract.
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      if (rect.x >= viewportWidth || rect.y >= viewportHeight || rect.x + rect.width <= 0 || rect.y + rect.height <= 0) continue;
      let visibleLeft = Math.max(0, rect.x);
      let visibleTop = Math.max(0, rect.y);
      let visibleRight = Math.min(viewportWidth, rect.x + rect.width);
      let visibleBottom = Math.min(viewportHeight, rect.y + rect.height);
      let ancestor = element.parentElement || null;
      while (ancestor && visibleRight > visibleLeft && visibleBottom > visibleTop) {
        const ancestorStyle = getComputedStyle(ancestor);
        if (ancestorStyle.display === 'none' || ancestorStyle.visibility === 'hidden' || Number(ancestorStyle.opacity) === 0) {
          visibleRight = visibleLeft;
          visibleBottom = visibleTop;
          break;
        }
        const overflowX = ancestorStyle.getPropertyValue('overflow-x').trim();
        const overflowY = ancestorStyle.getPropertyValue('overflow-y').trim();
        if (/^(?:hidden|clip|auto|scroll)$/.test(overflowX) || /^(?:hidden|clip|auto|scroll)$/.test(overflowY)) {
          const ancestorRect = ancestor.getBoundingClientRect();
          if (/^(?:hidden|clip|auto|scroll)$/.test(overflowX)) {
            visibleLeft = Math.max(visibleLeft, ancestorRect.x);
            visibleRight = Math.min(visibleRight, ancestorRect.x + ancestorRect.width);
          }
          if (/^(?:hidden|clip|auto|scroll)$/.test(overflowY)) {
            visibleTop = Math.max(visibleTop, ancestorRect.y);
            visibleBottom = Math.min(visibleBottom, ancestorRect.y + ancestorRect.height);
          }
        }
        ancestor = ancestor.parentElement || null;
      }
      if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) continue;
      const classes = Array.from(element.classList).filter((name) => (
        name.length >= 3
        && !/^(?:brxe?|bricks-|wp-|wordpress|logged-|admin-|page-id-|postid-|theme-)/i.test(name)
      ));
      const explicit = [
        element.getAttribute('data-pixflow-fidelity-key'),
        element.getAttribute('data-od-id'),
        element.id,
      ].map((value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180).toLowerCase()).find(Boolean);
      const explicitKeys = explicit ? [explicit] : [];
      const ownText = String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180);
      const directText = Array.from(element.childNodes || [])
        .filter((node) => node.nodeType === 3)
        .map((node) => String(node.textContent || ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
      const ariaLabel = String(element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 180);
      const alt = String(element.getAttribute('alt') || '').replace(/\s+/g, ' ').trim().slice(0, 180);
      const role = String(element.getAttribute('role') || '').replace(/\s+/g, ' ').trim().slice(0, 180).toLowerCase();
      let sourceRef = '';
      try {
        const parsedSource = new URL(
          element.getAttribute('src') || element.getAttribute('poster') || '',
          document.baseURI,
        );
        sourceRef = parsedSource.pathname.split('/').filter(Boolean).pop()?.toLowerCase() || '';
      } catch {
        sourceRef = '';
      }
      const kind = mediaTags.has(tag)
        ? 'media'
        : controlTags.has(tag)
          ? 'control'
          : containerTags.has(tag)
            ? 'container'
            : 'text';
      const isTextCandidate = textTags.has(tag)
        || controlTags.has(tag)
        || (!containerTags.has(tag) && !mediaTags.has(tag) && directText.length >= 2);
      // Frameworks such as Webflow add several classed div wrappers around
      // every semantic item. A Bricks-friendly clone necessarily uses a
      // different wrapper tree, so counting those anonymous implementation
      // nodes makes equivalent visible content appear almost entirely
      // unmatched. Pixel evidence owns wrapper/layout parity; DOM fidelity
      // measures semantic content plus explicitly keyed containers.
      const isMeaningfulContainer = explicitKeys.length > 0;
      if (!isTextCandidate && !mediaTags.has(tag) && !isMeaningfulContainer) continue;
      const label = explicit || ariaLabel || alt || ownText.slice(0, 90) || `${tag}-${ordinal + 1}`;
      const semanticTextValue = directText || ownText;
      const semanticText = isTextCandidate && semanticTextValue.length >= 2
        ? semanticTextValue.toLowerCase()
        : '';
      const textGroup = /^h[1-6]$/.test(tag)
        ? 'heading'
        : controlTags.has(tag)
          ? 'control'
          : tag === 'a'
            ? 'link'
            : isMeaningfulContainer && !isTextCandidate
              ? 'container'
              : 'text';
      const matchKeys = [
        ...explicitKeys.map((value) => `explicit:${value}`),
        alt ? `alt:${alt.toLowerCase()}` : '',
        sourceRef ? `media:${tag}:${sourceRef}:${alt.toLowerCase()}` : '',
        semanticText ? `tagtext:${tag}:${semanticText}` : '',
        semanticText ? `text:${textGroup}:${semanticText}` : '',
        role && semanticText ? `role:${role}:${semanticText}` : '',
        ...classes.map((name) => `class:${name.toLowerCase()}`),
      ].filter(Boolean);
      // Class names alone are framework implementation detail, not visible
      // clone content. In particular, animated source headings often wrap
      // every letter in a classed span. Counting those one-character nodes
      // makes a semantically cleaner target look incomplete even when the
      // settled pixels and complete phrase are preserved.
      const hasSemanticIdentity = explicitKeys.length > 0
        || Boolean(alt)
        || Boolean(sourceRef)
        || Boolean(semanticText)
        || controlTags.has(tag);
      if (!hasSemanticIdentity) continue;
      if (matchKeys.length === 0) continue;
      const importance = containerTags.has(tag) || /^h[1-2]$/.test(tag)
        ? 3
        : mediaTags.has(tag) || controlTags.has(tag) || /^h[3-6]$/.test(tag) || tag === 'a'
          ? 2
          : 1;
      const styles: Record<string, string> = {};
      for (const property of styleProperties) styles[property] = computed.getPropertyValue(property).trim();
      records.push({
        key: explicit || `${tag}-${ordinal + 1}`,
        label,
        tag,
        kind,
        importance,
        matchKeys,
        rect: {
          x: Number(rect.x.toFixed(2)),
          y: Number(rect.y.toFixed(2)),
          width: Number(rect.width.toFixed(2)),
          height: Number(rect.height.toFixed(2)),
        },
        styles,
      });
    }
    const scriptElements = Array.from(document.querySelectorAll('script'));
    const scriptEvidence = scriptElements.map((element) => `${element.getAttribute('src') || ''} ${element.textContent || ''}`).join('\n');
    const lowerScriptEvidence = scriptEvidence.toLowerCase();
    const dataWidCount = Array.from(document.querySelectorAll('[data-w-id]')).length;
    const lottieCount = Array.from(document.querySelectorAll('[data-animation-type="lottie"], [data-lottie], lottie-player, dotlottie-player')).length;
    const pixflowMotionCount = Array.from(document.querySelectorAll('[data-pixflow-motion], [data-pixflow-animation]')).length;
    const autoplayVideoCount = Array.from(document.querySelectorAll('video[autoplay]')).length;
    let cssAnimationCount = 0;
    let cssTransitionCount = 0;
    for (const element of all) {
      const computed = getComputedStyle(element as PixflowBrowserElement);
      const animationName = computed.getPropertyValue('animation-name').trim();
      const transitionDuration = computed.getPropertyValue('transition-duration').trim();
      if (animationName && animationName !== 'none') cssAnimationCount += 1;
      if (transitionDuration && !/^(?:0s|0ms)(?:,\s*(?:0s|0ms))*$/.test(transitionDuration)) cssTransitionCount += 1;
    }
    const signals: PixflowVisualInteractionAudit['signals'] = [];
    if (dataWidCount > 0 || /webflow(?:\.min)?\.js|webflow\.require\(['"]ix2/.test(lowerScriptEvidence)) {
      signals.push({ kind: 'webflow-ix2', count: Math.max(1, dataWidCount), evidence: [`data-w-id:${dataWidCount}`] });
    }
    if (lottieCount > 0 || /lottie|bodymovin|dotlottie/.test(lowerScriptEvidence)) {
      signals.push({ kind: 'lottie', count: Math.max(1, lottieCount), evidence: [`lottie-elements:${lottieCount}`] });
    }
    if (/\bgsap\b|greensock/.test(lowerScriptEvidence)) signals.push({ kind: 'gsap', count: 1, evidence: ['script:gsap'] });
    if (/scrolltrigger/.test(lowerScriptEvidence)) signals.push({ kind: 'scroll-trigger', count: 1, evidence: ['script:scrolltrigger'] });
    if (/\blenis\b/.test(lowerScriptEvidence)) signals.push({ kind: 'lenis', count: 1, evidence: ['script:lenis'] });
    if (pixflowMotionCount > 0) signals.push({ kind: 'pixflow-motion', count: pixflowMotionCount, evidence: [`pixflow-motion-hooks:${pixflowMotionCount}`] });
    if (cssAnimationCount > 0) signals.push({ kind: 'css-animation', count: cssAnimationCount, evidence: [`animated-elements:${cssAnimationCount}`] });
    if (cssTransitionCount > 0) signals.push({ kind: 'css-transition', count: cssTransitionCount, evidence: [`transition-elements:${cssTransitionCount}`] });
    if (autoplayVideoCount > 0) signals.push({ kind: 'autoplay-video', count: autoplayVideoCount, evidence: [`autoplay-videos:${autoplayVideoCount}`] });
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    const documentHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
    return {
      elements: records,
      documentWidth,
      documentHeight,
      interactionAudit: { url: document.baseURI, detected: signals.length > 0, signals },
    };
    }, PIXFLOW_FIDELITY_STYLE_PROPERTIES);
    return { url, width: viewport.width, height: viewport.height, ...snapshot };
  } finally {
    await fidelityReset.evaluate((element) => element.remove()).catch(() => undefined);
  }
}

export async function capturePixflowBrowserScreenshots(
  request: PixflowVisualCaptureRequest,
  options: CaptureExecutionOptions = {},
): Promise<PixflowVisualCaptureResponse> {
  const captureRequestStartedAt = Date.now();
  let url: URL;
  try {
    url = new URL(String(request.url || '').trim());
  } catch {
    return { ok: false, browser: null, captures: [], errors: ['Visual capture URL is invalid.'] };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, browser: null, captures: [], errors: ['Visual capture only supports http and https URLs.'] };
  }
  if (!Array.isArray(request.viewports) || request.viewports.length === 0 || request.viewports.length > MAX_VIEWPORTS) {
    return { ok: false, browser: null, captures: [], errors: [`Visual capture needs between 1 and ${MAX_VIEWPORTS} viewports.`] };
  }

  let viewports: PixflowVisualCaptureViewport[];
  try {
    viewports = request.viewports.map(normalizeViewport);
  } catch (error) {
    return { ok: false, browser: null, captures: [], errors: [error instanceof Error ? error.message : String(error)] };
  }
  const browserExecutable = await resolvePixflowCaptureBrowser();
  if (!browserExecutable) {
    return {
      ok: false,
      browser: null,
      captures: [],
      errors: ['No supported Chrome, Chromium, or Edge executable was found. Set OD_BROWSER_EXECUTABLE to enable visual capture.'],
    };
  }

  const liveReferenceMode = request.captureMode === 'live-reference';
  const resolvedRenderEnvironment = resolvePixflowVisualRenderEnvironment(request.renderEnvironmentProfile);
  const requestedWaitMs = Math.max(0, Math.min(MAX_WAIT_MS, Math.round(Number(request.waitMs ?? DEFAULT_WAIT_MS))));
  const waitMs = liveReferenceMode
    ? Math.max(requestedWaitMs, FIDELITY_REFERENCE_MINIMUM_WAIT_MS)
    : requestedWaitMs;
  const references = new Map((request.references || []).map((reference) => [
    String(reference.viewport || '').trim(),
    String(reference.url || '').trim(),
  ]));
  const fidelityReferenceUrl = String(request.fidelityReferenceUrl || '').trim();
  if (fidelityReferenceUrl) {
    try {
      const parsed = new URL(fidelityReferenceUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
    } catch {
      return { ok: false, browser: null, captures: [], errors: ['Visual fidelity reference URL is invalid or unsupported.'] };
    }
  }
  const captureDir = await mkdtemp(path.join(tmpdir(), 'open-design-visual-capture-'));
  const captures: PixflowVisualCaptureResponse['captures'] = [];
  const errors: string[] = [];
  const comparisonDurationsMs: number[] = [];
  let browser: Browser | null = null;
  try {
    try {
      browser = await chromium.launch({
        executablePath: browserExecutable,
        headless: true,
        timeout: CAPTURE_TIMEOUT_MS,
        args: [
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-extensions',
          '--disable-gpu',
          '--disable-sync',
          '--force-device-scale-factor=1',
          '--hide-scrollbars',
          '--metrics-recording-only',
          '--mute-audio',
          '--no-default-browser-check',
          '--no-first-run',
        ],
      });
    } catch (error) {
      return {
        ok: false,
        browser: browserExecutable,
        captures: [],
        errors: [`Browser launch failed: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
    const activeBrowser = browser;
    const indexedCaptures: Array<PixflowVisualCaptureResponse['captures'][number] | undefined> = new Array(viewports.length);
    for (let batchStart = 0; batchStart < viewports.length; batchStart += CAPTURE_VIEWPORT_CONCURRENCY) {
      const batch = viewports.slice(batchStart, batchStart + CAPTURE_VIEWPORT_CONCURRENCY);
      await Promise.all(batch.map(async (viewport, batchIndex) => {
        const captureIndex = batchStart + batchIndex;
      const screenshotPath = path.join(captureDir, `${viewport.id}-${randomUUID()}.png`);
      try {
        const targetMotionMode = liveReferenceMode || request.fidelityProfile === 'visual-clone'
          ? 'no-preference'
          : 'reduce';
        const targetSnapshot = await runExactViewportCapture(
          activeBrowser,
          url.toString(),
          viewport,
          screenshotPath,
          waitMs,
          options.navigationTimeoutMs ?? CAPTURE_TIMEOUT_MS,
          targetMotionMode,
          typeof request.themeStylePreviewCss === 'string' ? request.themeStylePreviewCss : '',
          request.renderEnvironmentProfile,
        );
        const bytes = await readFile(screenshotPath);
        if (bytes.length < 100) throw new Error('Browser returned an empty screenshot.');
        const referenceUrl = references.get(viewport.id);
        let comparison: NonNullable<PixflowVisualCaptureResponse['captures'][number]['comparison']> | null = null;
        let fidelity: PixflowVisualFidelityComparison | null = null;
        let referenceCapture: NonNullable<PixflowVisualCaptureResponse['captures'][number]['referenceCapture']> | null = null;
        // A generated HTML reference can finish a remote image or late layout
        // transition after its first nominal settle window. Retry only the
        // live browser reference when either pixel or DOM fidelity fails; the
        // target screenshot and its hash remain the exact evidence being accepted.
        const comparisonStartedAt = Date.now();
        if (fidelityReferenceUrl) {
          const referenceEvidence = await compareAgainstSettledPixflowReference(
            activeBrowser,
            fidelityReferenceUrl,
            viewport,
            waitMs,
            options.navigationTimeoutMs ?? CAPTURE_TIMEOUT_MS,
            targetSnapshot,
            bytes,
            path.join(captureDir, `${viewport.id}-${randomUUID()}-reference`),
            request.fidelityProfile || 'structural',
          );
          comparison = referenceEvidence.comparison;
          fidelity = referenceEvidence.fidelity;
          referenceCapture = referenceEvidence.referenceCapture;
        } else if (referenceUrl) {
          comparison = await comparePixflowScreenshots(bytes, referenceUrl);
        }
        if (fidelityReferenceUrl || referenceUrl) {
          comparisonDurationsMs.push(Date.now() - comparisonStartedAt);
        }
        indexedCaptures[captureIndex] = {
          viewport: viewport.id,
          width: viewport.width,
          height: viewport.height,
          scrollPosition: viewport.scrollPosition || 'top',
          mimeType: 'image/png',
          base64: bytes.toString('base64'),
          sha256: createHash('sha256').update(bytes).digest('hex'),
          ...(comparison ? { comparison } : {}),
          ...(fidelity ? { fidelity } : {}),
          ...(referenceCapture ? { referenceCapture } : {}),
          ...(targetSnapshot.interactionAudit ? { interactionAudit: targetSnapshot.interactionAudit } : {}),
          ...(targetSnapshot.layout ? { layout: targetSnapshot.layout } : {}),
          ...(targetSnapshot.renderEnvironment ? { renderEnvironment: targetSnapshot.renderEnvironment } : {}),
        };
      } catch (error) {
        errors.push(`${viewport.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
      }));
    }
    captures.push(...indexedCaptures.filter((capture): capture is PixflowVisualCaptureResponse['captures'][number] => Boolean(capture)));
  } finally {
    await browser?.close();
    await rm(captureDir, { recursive: true, force: true });
  }
  const totalDurationMs = Date.now() - captureRequestStartedAt;
  const comparisonDurationMs = comparisonDurationsMs.length > 0
    ? Math.max(...comparisonDurationsMs)
    : 0;
  return {
    ok: captures.length === viewports.length,
    browser: browserExecutable,
    captures,
    errors,
    ...(resolvedRenderEnvironment
      ? { renderEnvironment: resolvedRenderEnvironment.identity }
      : {}),
    ...(String(request.themeStyleSnapshotHash || '').trim()
      ? { themeStyleSnapshotHash: String(request.themeStyleSnapshotHash).trim().slice(0, 160) }
      : {}),
    timings: {
      settleDurationMs: waitMs,
      captureDurationMs: Math.max(0, totalDurationMs - comparisonDurationMs),
      comparisonDurationMs,
      totalDurationMs,
    },
  };
}

function roundedScore(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}

function cssValueScore(property: string, expected: string, actual: string): number {
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  const left = normalize(expected);
  const right = normalize(actual);
  if (left === right) return 1;
  if (property === 'font-family') {
    const families = (value: string) => new Set(value.split(',')
      .map((family) => family.replace(/["']/g, '').trim())
      .filter(Boolean));
    const leftFamilies = families(left);
    const rightFamilies = families(right);
    if ([...leftFamilies].some((family) => rightFamilies.has(family))) return 1;
  }
  if (property === 'background-image') {
    if (left === 'none' || right === 'none') return 0;
    const fileName = (value: string) => value.split(/[/?#]/).filter(Boolean).pop()?.replace(/["')]/g, '') || value;
    if (fileName(left) === fileName(right)) return 1;
  }
  const numeric = /^(-?\d+(?:\.\d+)?)(px|rem|em|%)$/.exec(left);
  const otherNumeric = /^(-?\d+(?:\.\d+)?)(px|rem|em|%)$/.exec(right);
  if (numeric && otherNumeric && numeric[2] === otherNumeric[2]) {
    const expectedNumber = Number(numeric[1]);
    const actualNumber = Number(otherNumeric[1]);
    const tolerance = numeric[2] === 'px'
      ? Math.max(1.5, Math.abs(expectedNumber) * 0.025)
      : Math.max(0.03, Math.abs(expectedNumber) * 0.025);
    const difference = Math.abs(expectedNumber - actualNumber);
    return difference <= tolerance ? 1 : Math.max(0, 1 - ((difference - tolerance) / Math.max(tolerance * 5, 1)));
  }
  return 0;
}

function geometryAxisScore(
  property: 'x' | 'y' | 'width' | 'height',
  expected: number,
  actual: number,
  sourceSnapshot: PixflowDomFidelitySnapshot,
  targetSnapshot: PixflowDomFidelitySnapshot,
): number {
  const sourceDocumentHeight = sourceSnapshot.documentHeight || sourceSnapshot.height;
  const targetDocumentHeight = targetSnapshot.documentHeight || targetSnapshot.height;
  const difference = property === 'y' && sourceDocumentHeight > 0 && targetDocumentHeight > 0
    ? Math.abs((expected / sourceDocumentHeight) - (actual / targetDocumentHeight)) * sourceDocumentHeight
    : Math.abs(expected - actual);
  if (difference <= 4) return 1;
  const scale = property === 'x' || property === 'width' ? sourceSnapshot.width : sourceSnapshot.height;
  const allowance = property === 'width' || property === 'height'
    ? Math.max(Math.abs(expected) * 0.16, scale * 0.035, 12)
    : Math.max(scale * 0.08, 24);
  return Math.max(0, 1 - ((difference - 4) / allowance));
}

function isPixflowFidelityStylePropertyVisible(
  property: string,
  sourceStyles: Readonly<Record<string, string>>,
  targetStyles: Readonly<Record<string, string>>,
): boolean {
  const borderMatch = /^border-(top|right|bottom|left)-(?:color|style)$/.exec(property);
  if (!borderMatch) return true;
  const widthProperty = `border-${borderMatch[1]}-width`;
  const sourceWidth = Number.parseFloat(sourceStyles[widthProperty] || '0');
  const targetWidth = Number.parseFloat(targetStyles[widthProperty] || '0');
  return sourceWidth > 0 || targetWidth > 0;
}

function uniqueMatchKeyCounts(elements: readonly PixflowDomFidelityElement[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const element of elements) {
    for (const key of new Set(element.matchKeys)) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function orderedPixflowFidelityMatchKeys(matchKeys: readonly string[]): string[] {
  // Bricks adds synthetic section/container wrappers whose inherited innerText
  // can be identical to the authored child. Prefer stable authored identity
  // (explicit IDs, media, and source classes) before text so those wrappers do
  // not steal an otherwise exact child match.
  const priority = new Map([
    ['explicit', 0],
    ['alt', 1],
    ['media', 2],
    ['class', 3],
    ['role', 4],
    ['tagtext', 5],
    ['text', 6],
  ]);
  return [...matchKeys].sort((left, right) => {
    const leftPrefix = left.split(':', 1)[0] || '';
    const rightPrefix = right.split(':', 1)[0] || '';
    return (priority.get(leftPrefix) ?? 99) - (priority.get(rightPrefix) ?? 99);
  });
}

function pixflowFidelitySemanticText(element: PixflowDomFidelityElement): string {
  const candidates = element.matchKeys
    .filter((key) => /^(?:tagtext|text|role):/.test(key))
    .map((key) => key.split(':').slice(2).join(':'))
    .map((text) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim())
    .map((text) => {
      const tokens = text.split(' ').filter(Boolean);
      return tokens.length > 1 && tokens.every((token) => token.length === 1)
        ? tokens.join('')
        : text;
    })
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  return candidates[0] || '';
}

function pixflowFidelitySemanticSimilarity(
  source: PixflowDomFidelityElement,
  target: PixflowDomFidelityElement,
): number {
  if (source.kind !== target.kind && !(
    (source.kind === 'text' || source.kind === 'control')
    && (target.kind === 'text' || target.kind === 'control')
  )) return 0;
  const left = pixflowFidelitySemanticText(source);
  const right = pixflowFidelitySemanticText(target);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = Array.from(new Set(left.split(' ').filter(Boolean)));
  const rightTokens = Array.from(new Set(right.split(' ').filter(Boolean)));
  if (Math.min(leftTokens.length, rightTokens.length) < 2) return 0;
  const rightSet = new Set(rightTokens);
  const shared = leftTokens.filter((token) => rightSet.has(token)).length;
  return (2 * shared) / (leftTokens.length + rightTokens.length);
}

function pixflowFidelitySemanticContainment(
  source: PixflowDomFidelityElement,
  target: PixflowDomFidelityElement,
): boolean {
  if (source.kind !== target.kind && !(
    (source.kind === 'text' || source.kind === 'control')
    && (target.kind === 'text' || target.kind === 'control')
  )) return false;
  const fragment = pixflowFidelitySemanticText(source);
  const completePhrase = pixflowFidelitySemanticText(target);
  if (fragment.length < 3 || completePhrase.length < fragment.length) return false;
  if (completePhrase === fragment) return true;
  return ` ${completePhrase} `.includes(` ${fragment} `);
}

export function comparePixflowDomSnapshots(
  source: PixflowDomFidelitySnapshot,
  target: PixflowDomFidelitySnapshot,
  profile: 'structural' | 'visual-clone' = 'structural',
): PixflowVisualFidelityComparison {
  const sourceCounts = uniqueMatchKeyCounts(source.elements);
  const targetCounts = uniqueMatchKeyCounts(target.elements);
  const targetByUniqueKey = new Map<string, number>();
  target.elements.forEach((element, index) => {
    for (const key of element.matchKeys) {
      if (targetCounts.get(key) === 1) targetByUniqueKey.set(key, index);
    }
  });
  const usedTargets = new Set<number>();
  const matches: Array<{ source: PixflowDomFidelityElement; target: PixflowDomFidelityElement; matchBy: string }> = [];
  const pendingSources: PixflowDomFidelityElement[] = [];
  for (const sourceElement of source.elements) {
    let selected: { target: PixflowDomFidelityElement; index: number; matchBy: string } | null = null;
    for (const key of orderedPixflowFidelityMatchKeys(sourceElement.matchKeys)) {
      if (sourceCounts.get(key) !== 1) continue;
      const targetIndex = targetByUniqueKey.get(key);
      if (targetIndex === undefined || usedTargets.has(targetIndex)) continue;
      const targetElement = target.elements[targetIndex];
      if (!targetElement) continue;
      selected = { target: targetElement, index: targetIndex, matchBy: key.split(':', 1)[0] || 'key' };
      break;
    }
    if (!selected) {
      pendingSources.push(sourceElement);
      continue;
    }
    usedTargets.add(selected.index);
    matches.push({ source: sourceElement, target: selected.target, matchBy: selected.matchBy });
  }

  // Navigation labels, repeated step numbers, project media, and other
  // intentional repetitions are common in a source-to-Bricks conversion.
  // Unique-key-only matching incorrectly treated every member of those sets as
  // missing. When both documents contain the same repeated semantic key,
  // pair its remaining members in document order.
  const repeatableKeyPrefixes = new Set(['explicit', 'alt', 'media', 'tagtext', 'text', 'role', 'class']);
  const repeatedTargetQueues = new Map<string, number[]>();
  for (const [key, sourceCount] of sourceCounts) {
    const prefix = key.split(':', 1)[0] || '';
    if (!repeatableKeyPrefixes.has(prefix) || sourceCount < 2 || sourceCount > 32) continue;
    if (targetCounts.get(key) !== sourceCount) continue;
    repeatedTargetQueues.set(key, target.elements
      .map((element, index) => element.matchKeys.includes(key) ? index : -1)
      .filter((index) => index >= 0));
  }
  const unmatched: PixflowDomFidelityElement[] = [];
  for (const sourceElement of pendingSources) {
    let selected: { target: PixflowDomFidelityElement; index: number; matchBy: string } | null = null;
    for (const key of orderedPixflowFidelityMatchKeys(sourceElement.matchKeys)) {
      const queue = repeatedTargetQueues.get(key);
      if (!queue) continue;
      while (queue.length > 0 && usedTargets.has(queue[0]!)) queue.shift();
      const targetIndex = queue.shift();
      if (targetIndex === undefined) continue;
      const targetElement = target.elements[targetIndex];
      if (!targetElement) continue;
      selected = { target: targetElement, index: targetIndex, matchBy: `${key.split(':', 1)[0] || 'key'}-ordered` };
      break;
    }
    if (!selected) {
      unmatched.push(sourceElement);
      continue;
    }
    usedTargets.add(selected.index);
    matches.push({ source: sourceElement, target: selected.target, matchBy: selected.matchBy });
  }

  // Source builders and Bricks frequently split the same visible phrase at
  // different wrapper boundaries, and repeated nav/footer labels can have
  // different occurrence counts. Pair the remaining semantic copy by token
  // overlap, using geometry only as a tie-breaker. This retains strict pixel
  // ownership of layout while preventing DOM fidelity from failing solely on
  // implementation-specific text wrappers.
  const stillUnmatched: PixflowDomFidelityElement[] = [];
  for (const sourceElement of unmatched) {
    let selected: { target: PixflowDomFidelityElement; index: number; similarity: number; distance: number } | null = null;
    for (let index = 0; index < target.elements.length; index += 1) {
      if (usedTargets.has(index)) continue;
      const targetElement = target.elements[index];
      if (!targetElement) continue;
      const similarity = pixflowFidelitySemanticSimilarity(sourceElement, targetElement);
      if (similarity < 0.72) continue;
      const distance = Math.abs(sourceElement.rect.y - targetElement.rect.y)
        + Math.abs(sourceElement.rect.x - targetElement.rect.x) * 0.25;
      if (!selected || similarity > selected.similarity || (similarity === selected.similarity && distance < selected.distance)) {
        selected = { target: targetElement, index, similarity, distance };
      }
    }
    if (!selected) {
      stillUnmatched.push(sourceElement);
      continue;
    }
    usedTargets.add(selected.index);
    matches.push({ source: sourceElement, target: selected.target, matchBy: 'semantic-fuzzy' });
  }
  unmatched.length = 0;
  unmatched.push(...stillUnmatched);

  // Motion-heavy source builders commonly split one visible heading into
  // several sibling words while a Bricks-friendly clone keeps the accessible
  // phrase in one semantic heading. A target phrase may therefore cover more
  // than one source fragment. Credit those fragments for content coverage,
  // without reusing the aggregate target for geometry or style scoring (the
  // pixel gate owns the visual comparison and the rects are not comparable).
  const coverageOnlyMatches: Array<{
    source: PixflowDomFidelityElement;
    target: PixflowDomFidelityElement;
  }> = [];
  const uncovered: PixflowDomFidelityElement[] = [];
  for (const sourceElement of unmatched) {
    const targetElement = target.elements.find((candidate) => (
      pixflowFidelitySemanticContainment(sourceElement, candidate)
    ));
    if (!targetElement) {
      uncovered.push(sourceElement);
      continue;
    }
    coverageOnlyMatches.push({ source: sourceElement, target: targetElement });
  }
  unmatched.length = 0;
  unmatched.push(...uncovered);

  const totalWeight = source.elements.reduce((sum, element) => sum + element.importance, 0);
  const matchedWeight = matches.reduce((sum, match) => sum + match.source.importance, 0)
    + coverageOnlyMatches.reduce((sum, match) => sum + match.source.importance, 0);
  const geometryWeighted: Array<{ score: number; weight: number }> = [];
  const styleWeighted: Array<{ score: number; weight: number }> = [];
  const mismatches: PixflowVisualFidelityComparison['mismatches'] = [];
  for (const match of matches) {
    const geometry: PixflowVisualFidelityDifference[] = [];
    const geometryScores = (['x', 'y', 'width', 'height'] as const).map((property) => {
      const expected = match.source.rect[property];
      const actual = match.target.rect[property];
      const score = geometryAxisScore(property, expected, actual, source, target);
      if (score < 0.97) geometry.push({ property, expected, actual, difference: Number(Math.abs(expected - actual).toFixed(2)) });
      return score;
    });
    const geometryScore = geometryScores.reduce((sum, score) => sum + score, 0) / geometryScores.length;
    const styleDifferences: PixflowVisualFidelityDifference[] = [];
    const styleProperties = Object.keys(match.source.styles).filter((property) => (
      property in match.target.styles
      && isPixflowFidelityStylePropertyVisible(property, match.source.styles, match.target.styles)
    ));
    const styleScores = styleProperties.map((property) => {
      const expected = match.source.styles[property] || '';
      const actual = match.target.styles[property] || '';
      const score = cssValueScore(property, expected, actual);
      if (score < 1) styleDifferences.push({ property, expected, actual });
      return score;
    });
    const styleScore = styleScores.length > 0
      ? styleScores.reduce((sum, score) => sum + score, 0) / styleScores.length
      : 1;
    geometryWeighted.push({ score: geometryScore, weight: match.source.importance });
    styleWeighted.push({ score: styleScore, weight: match.source.importance });
    if (geometryScore < 0.97 || styleScore < 0.98) {
      mismatches.push({
        sourceKey: match.source.key,
        targetKey: match.target.key,
        label: match.source.label,
        matchBy: match.matchBy,
        geometryScore: roundedScore(geometryScore),
        styleScore: roundedScore(styleScore),
        geometry,
        styles: styleDifferences.slice(0, 12),
      });
    }
  }
  for (const element of unmatched) {
    mismatches.push({
      sourceKey: element.key,
      targetKey: '',
      label: element.label,
      matchBy: 'unmatched',
      geometryScore: 0,
      styleScore: 0,
      geometry: [],
      styles: [],
    });
  }
  const weightedAverage = (scores: Array<{ score: number; weight: number }>) => {
    const weight = scores.reduce((sum, item) => sum + item.weight, 0);
    return weight > 0 ? scores.reduce((sum, item) => sum + item.score * item.weight, 0) / weight : 0;
  };
  const matchCoverage = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  const geometryScore = weightedAverage(geometryWeighted);
  const styleScore = weightedAverage(styleWeighted);
  const sourceDocumentHeight = Math.max(1, source.documentHeight || source.height);
  const targetDocumentHeight = Math.max(1, target.documentHeight || target.height);
  const documentHeightScore = Math.min(sourceDocumentHeight, targetDocumentHeight)
    / Math.max(sourceDocumentHeight, targetDocumentHeight);
  const overallScore = matchCoverage * 0.18
    + geometryScore * 0.34
    + styleScore * 0.34
    + documentHeightScore * 0.14;
  const thresholds = profile === 'visual-clone'
    ? {
        matchCoverage: VISUAL_CLONE_MINIMUM_MATCH_COVERAGE,
        geometryScore: VISUAL_CLONE_MINIMUM_GEOMETRY_SCORE,
        styleScore: VISUAL_CLONE_MINIMUM_STYLE_SCORE,
        documentHeightScore: VISUAL_CLONE_MINIMUM_DOCUMENT_HEIGHT_SCORE,
        overallScore: VISUAL_CLONE_MINIMUM_OVERALL_SCORE,
      }
    : {
        matchCoverage: FIDELITY_MINIMUM_MATCH_COVERAGE,
        geometryScore: FIDELITY_MINIMUM_GEOMETRY_SCORE,
        styleScore: FIDELITY_MINIMUM_STYLE_SCORE,
        documentHeightScore: FIDELITY_MINIMUM_DOCUMENT_HEIGHT_SCORE,
        overallScore: FIDELITY_MINIMUM_OVERALL_SCORE,
      };
  mismatches.sort((left, right) => (
    (right.matchBy === 'unmatched' ? 2 : 2 - right.geometryScore - right.styleScore)
    - (left.matchBy === 'unmatched' ? 2 : 2 - left.geometryScore - left.styleScore)
  ));
  return {
    referenceUrl: source.url,
    profile,
    sourceElements: source.elements.length,
    targetElements: target.elements.length,
    matchedElements: matches.length + coverageOnlyMatches.length,
    unmatchedSourceElements: unmatched.length,
    matchCoverage: roundedScore(matchCoverage),
    geometryScore: roundedScore(geometryScore),
    styleScore: roundedScore(styleScore),
    sourceDocumentHeight,
    targetDocumentHeight,
    documentHeightScore: roundedScore(documentHeightScore),
    overallScore: roundedScore(overallScore),
    minimumMatchCoverage: thresholds.matchCoverage,
    minimumGeometryScore: thresholds.geometryScore,
    minimumStyleScore: thresholds.styleScore,
    minimumDocumentHeightScore: thresholds.documentHeightScore,
    minimumOverallScore: thresholds.overallScore,
    passed: matchCoverage >= thresholds.matchCoverage
      && geometryScore >= thresholds.geometryScore
      && styleScore >= thresholds.styleScore
      && documentHeightScore >= thresholds.documentHeightScore
      && overallScore >= thresholds.overallScore,
    mismatches: mismatches.slice(0, FIDELITY_MAX_MISMATCHES),
  };
}

async function comparePixflowScreenshots(
  actualBytes: Buffer,
  referenceUrl: string,
): Promise<NonNullable<PixflowVisualCaptureResponse['captures'][number]['comparison']>> {
  const parsed = new URL(referenceUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Visual reference only supports http and https URLs.');
  }
  const response = await fetch(parsed, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Visual reference returned HTTP ${response.status}.`);
  const referenceBytes = Buffer.from(await response.arrayBuffer());
  if (referenceBytes.length > MAX_REFERENCE_BYTES) throw new Error('Visual reference exceeds the 20MB limit.');
  return comparePixflowScreenshotBuffers(actualBytes, referenceBytes, referenceUrl);
}

export function comparePixflowScreenshotBuffers(
  actualBytes: Buffer,
  referenceBytes: Buffer,
  referenceUrl = 'in-memory-reference',
): NonNullable<PixflowVisualCaptureResponse['captures'][number]['comparison']> {
  const reference = PNG.sync.read(referenceBytes);
  const actual = PNG.sync.read(actualBytes);
  if (reference.width !== actual.width || reference.height !== actual.height) {
    throw new Error(
      `Visual reference dimensions ${reference.width}x${reference.height} do not match ${actual.width}x${actual.height}.`,
    );
  }
  const totalPixels = actual.width * actual.height;
  const differentPixels = pixelmatch(reference.data, actual.data, undefined, actual.width, actual.height, {
    threshold: 0.12,
    includeAA: false,
  });
  const differenceRatio = totalPixels > 0 ? differentPixels / totalPixels : 1;
  let absoluteChannelDifference = 0;
  for (let offset = 0; offset < actual.data.length; offset += 4) {
    absoluteChannelDifference += Math.abs(reference.data[offset]! - actual.data[offset]!);
    absoluteChannelDifference += Math.abs(reference.data[offset + 1]! - actual.data[offset + 1]!);
    absoluteChannelDifference += Math.abs(reference.data[offset + 2]! - actual.data[offset + 2]!);
  }
  const meanAbsoluteChannelDifference = totalPixels > 0
    ? absoluteChannelDifference / (totalPixels * 3)
    : 255;
  const tileRatios: Array<{ row: number; ratio: number; meanAbsoluteChannelDifference: number }> = [];
  for (let row = 0; row < VISUAL_TILE_ROWS; row += 1) {
    for (let column = 0; column < VISUAL_TILE_COLUMNS; column += 1) {
      const x = Math.floor((column * actual.width) / VISUAL_TILE_COLUMNS);
      const x2 = Math.floor(((column + 1) * actual.width) / VISUAL_TILE_COLUMNS);
      const y = Math.floor((row * actual.height) / VISUAL_TILE_ROWS);
      const y2 = Math.floor(((row + 1) * actual.height) / VISUAL_TILE_ROWS);
      const width = x2 - x;
      const height = y2 - y;
      const referenceTile = Buffer.alloc(width * height * 4);
      const actualTile = Buffer.alloc(width * height * 4);
      for (let tileRow = 0; tileRow < height; tileRow += 1) {
        const sourceOffset = ((y + tileRow) * actual.width + x) * 4;
        const targetOffset = tileRow * width * 4;
        const length = width * 4;
        reference.data.copy(referenceTile, targetOffset, sourceOffset, sourceOffset + length);
        actual.data.copy(actualTile, targetOffset, sourceOffset, sourceOffset + length);
      }
      const tileDifferentPixels = pixelmatch(
        referenceTile,
        actualTile,
        undefined,
        width,
        height,
        { threshold: 0.12, includeAA: false },
      );
      let tileAbsoluteChannelDifference = 0;
      for (let offset = 0; offset < actualTile.length; offset += 4) {
        tileAbsoluteChannelDifference += Math.abs(referenceTile[offset]! - actualTile[offset]!);
        tileAbsoluteChannelDifference += Math.abs(referenceTile[offset + 1]! - actualTile[offset + 1]!);
        tileAbsoluteChannelDifference += Math.abs(referenceTile[offset + 2]! - actualTile[offset + 2]!);
      }
      tileRatios.push({
        row,
        ratio: width * height > 0 ? tileDifferentPixels / (width * height) : 1,
        meanAbsoluteChannelDifference: width * height > 0
          ? tileAbsoluteChannelDifference / (width * height * 3)
          : 255,
      });
    }
  }
  const maximumTileDifferenceRatio = Math.max(0, ...tileRatios.map((tile) => tile.ratio));
  const maximumTileMeanAbsoluteChannelDifference = Math.max(
    0,
    ...tileRatios.map((tile) => tile.meanAbsoluteChannelDifference),
  );
  const maximumTopBandTileDifferenceRatio = Math.max(
    0,
    ...tileRatios.filter((tile) => tile.row === 0).map((tile) => tile.ratio),
  );
  return {
    referenceUrl,
    differentPixels,
    totalPixels,
    differenceRatio,
    meanAbsoluteChannelDifference: Number(meanAbsoluteChannelDifference.toFixed(4)),
    maximumTileDifferenceRatio,
    maximumTileMeanAbsoluteChannelDifference: Number(maximumTileMeanAbsoluteChannelDifference.toFixed(4)),
    maximumTopBandTileDifferenceRatio,
    fullFrameLimit: VISUAL_DIFFERENCE_LIMIT,
    maximumTileLimit: VISUAL_MAXIMUM_TILE_LIMIT,
    maximumTopBandTileLimit: VISUAL_TOP_BAND_TILE_LIMIT,
    passed: differenceRatio <= VISUAL_DIFFERENCE_LIMIT
      && maximumTileDifferenceRatio <= VISUAL_MAXIMUM_TILE_LIMIT
      && maximumTopBandTileDifferenceRatio <= VISUAL_TOP_BAND_TILE_LIMIT,
  };
}
