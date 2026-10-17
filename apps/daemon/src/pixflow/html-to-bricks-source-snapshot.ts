import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import pixelmatch from 'pixelmatch';
import { chromium, type Page } from 'playwright-core';
import { PNG } from 'pngjs';
import type {
  PixflowHtmlSourceInputKind,
  PixflowHtmlSourceManifest,
  PixflowHtmlSourceManifestFile,
  PixflowHtmlRuntimeAudit,
  PixflowHtmlRuntimeBehavior,
  PixflowHtmlRuntimeScriptAudit,
} from '@open-design/contracts';
import { PIXFLOW_HTML_SOURCE_MANIFEST_SCHEMA } from '@open-design/contracts';
import { resolvePixflowCaptureBrowser } from './browser-screenshot.js';

const VIEWPORTS = [
  { id: 'desktop' as const, width: 1440 as const, height: 1000 },
  { id: 'bricks_base' as const, width: 992 as const, height: 844 },
  { id: 'mobile' as const, width: 390 as const, height: 844 },
];

const STYLE_PROPERTIES = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'box-sizing', 'aspect-ratio',
  'margin', 'margin-block', 'margin-inline',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-block', 'padding-inline',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'grid-template-columns', 'grid-template-rows', 'gap', 'row-gap', 'column-gap',
  'justify-items', 'align-content', 'place-items', 'place-content',
  'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
  'align-items', 'align-self', 'justify-content', 'justify-self', 'order',
  'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variation-settings',
  'line-height', 'letter-spacing', 'white-space', 'text-wrap', 'text-align', 'text-transform', 'text-decoration',
  'color', 'background', 'background-color', 'background-image', 'background-position',
  'background-size', 'background-repeat', 'background-attachment', 'background-blend-mode',
  'border', 'border-width', 'border-style', 'border-color',
  'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-radius', 'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-right-radius', 'border-bottom-left-radius',
  'box-shadow', 'text-shadow', 'filter', 'clip-path',
  'opacity', 'visibility', 'isolation', 'mix-blend-mode', 'pointer-events', 'cursor',
  'perspective', 'perspective-origin', 'transform', 'translate', 'transform-origin', 'transition',
  'overflow', 'overflow-x', 'overflow-y', 'object-fit', 'object-position',
  'scroll-snap-type', 'scroll-snap-align', 'scroll-snap-stop', 'scroll-margin',
  'animation-name',
] as const;

const STATIC_REPLAY_MAX_DIFFERENCE_RATIO = 0.01;
const MAX_RETAINED_VISUAL_SCRIPT_BYTES = 128 * 1024;
const LAYOUT_SETTLE_MINIMUM_MS = 900;
const LAYOUT_SETTLE_TIMEOUT_MS = 5_000;
const LAYOUT_SETTLE_SAMPLE_MS = 125;
const LAYOUT_SETTLE_CONSECUTIVE_SAMPLES = 3;

export type HtmlToBricksSourceResource = {
  path: string;
  role: PixflowHtmlSourceManifestFile['role'];
  mimeType: string;
  bytes: Uint8Array;
};

type SnapshotCapture = {
  viewport: typeof VIEWPORTS[number];
  nodes: unknown[];
  document: { width: number; height: number };
  variables: Record<string, string>;
  documentStyles?: {
    html: Record<string, string>;
    body: Record<string, string>;
  };
  interactions: unknown[];
  frozenBodyHtml?: string;
  render?: {
    status: 'complete' | 'incomplete';
    visibleElementCount: number;
    visibleTextLength: number;
  };
  staticReplay?: {
    compared: boolean;
    matched: boolean;
    differenceRatio?: number;
    screenshot?: Uint8Array;
  };
  screenshot?: Uint8Array;
};

export type HtmlToBricksCaptureAdapter = (input: {
  html: string;
  viewports: typeof VIEWPORTS;
  runtimeAudit: PixflowHtmlRuntimeScriptAudit[];
  allowedExternalAssetUrls: string[];
}) => Promise<SnapshotCapture[]>;

export async function prepareHtmlToBricksSourceSnapshot(input: {
  html: string;
  workspaceDir: string;
  sourceId: string;
  runId?: string;
  canonicalPath: string;
  inputKind: PixflowHtmlSourceInputKind;
  selectionReason: string;
  resourceBase: string;
  resources?: HtmlToBricksSourceResource[];
  capture?: HtmlToBricksCaptureAdapter;
}): Promise<{ html: string; manifest: PixflowHtmlSourceManifest }> {
  const evidenceDir = path.join(input.workspaceDir, 'source-evidence');
  const resourceDir = path.join(input.workspaceDir, 'source-resources');
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.mkdir(resourceDir, { recursive: true });
  const capabilities: PixflowHtmlSourceManifest['capabilities'] = [];
  const validationStartedAt = Date.now();
  assertCompleteHtml(input.html);
  capabilities.push({ name: 'validation', status: 'completed', durationMs: Date.now() - validationStartedAt });

  const materializationStartedAt = Date.now();
  const resources = buildResourceIndex(input.resources || [], input.resourceBase);
  const selectedCanonicalPath = assertSafeRelativePath(input.canonicalPath, 'canonical HTML');
  if (input.inputKind === 'document_bundle') {
    assertCompleteSourceBundle(input.html, selectedCanonicalPath, resources, input.resourceBase);
  }
  const canonicalEvidence = await writeEvidence(
    evidenceDir,
    'canonical-input.html',
    input.html,
    'text/html',
    'canonical_html',
    'canonical',
  );
  const canonical: PixflowHtmlSourceManifestFile = {
    ...canonicalEvidence,
    path: selectedCanonicalPath,
    sourcePath: selectedCanonicalPath,
  };
  const materializedFiles: PixflowHtmlSourceManifestFile[] = [];
  for (const resource of input.resources || []) {
    const safePath = assertSafeRelativePath(resource.path, 'bundle resource');
    const resolvedPath = `source-resources/${safePath}`;
    const destination = path.join(input.workspaceDir, ...resolvedPath.split('/'));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, resource.bytes);
    materializedFiles.push(manifestFile(
      safePath,
      resource.role,
      resource.mimeType,
      resource.bytes,
      resolvedPath,
      'materialized',
    ));
  }
  const assetMappings: Array<Record<string, unknown>> = [];
  const sanitizeStartedAt = Date.now();
  const scriptAudit = classifyHtmlToBricksScripts({
    html: input.html,
    canonicalPath: input.canonicalPath,
    resourceBase: input.resourceBase,
    resources: input.resources || [],
  });
  const runtimeHtml = materializeRuntimeCaptureHtml(
    input.html,
    scriptAudit,
    resources,
    input.resourceBase,
    input.canonicalPath,
  );
  const $ = load(runtimeHtml, { xmlMode: false });
  const removedScripts = scriptAudit.filter((script) => !script.executedDuringCapture).length;
  let removedEventHandlers = 0;
  const blockedResources: string[] = [];
  $('*').each((_index, element) => {
    const attributes = 'attribs' in element ? element.attribs : {};
    for (const name of Object.keys(attributes || {})) {
      if (/^on/i.test(name)) {
        removedEventHandlers += 1;
        $(element).removeAttr(name);
      }
    }
  });
  let sourceNodeIndex = 0;
  $('body *').each((_index, element) => {
    $(element).attr('data-pf-source-id', `pf-source-${String(++sourceNodeIndex).padStart(5, '0')}`);
  });

  // The compiler keeps authored syntax and local asset references so WordPress
  // can import them. The sandbox copy below is separately serialized and
  // inlines bytes only for deterministic, network-denied capture.
  const staticCompilerHtml = materializeCompilerHtml(input.html, resources, input.resourceBase, input.canonicalPath);
  $('form')
    .removeAttr('action')
    .removeAttr('method')
    .attr('inert', '')
    .attr('aria-disabled', 'true')
    .attr('data-pixflow-submit-blocked', 'true');
  $('form [formaction], form [formmethod], form [formenctype], form [formtarget]')
    .removeAttr('formaction')
    .removeAttr('formmethod')
    .removeAttr('formenctype')
    .removeAttr('formtarget');
  $('iframe, object, embed').each((_index, element) => {
    const source = $(element).attr('src') || $(element).attr('data') || element.tagName;
    blockedResources.push(source);
    $(element).replaceWith(`<div data-pixflow-blocked-resource="${escapeAttribute(source)}"></div>`);
  });
  const resolvedCss: string[] = [];
  $('style').each((_index, element) => {
    const css = resolveStylesheetResources($(element).html() || '', input.canonicalPath, resources, input.resourceBase);
    resolvedCss.push(css);
    $(element).html(css);
  });
  $('link[rel~="stylesheet"]').each((_index, element) => {
    const href = String($(element).attr('href') || '').trim();
    const resource = findResource(resources, href, input.resourceBase);
    if (!resource || !isCssResource(resource)) {
      blockedResources.push(href || '(empty stylesheet href)');
      $(element).remove();
      return;
    }
    const css = resolveStylesheetResources(
      Buffer.from(resource.bytes).toString('utf8'),
      resource.path,
      resources,
      input.resourceBase,
    );
    resolvedCss.push(css);
    assetMappings.push({ source: href, local: resource.path, disposition: 'materialized_stylesheet' });
    $(element).replaceWith(`<style data-pixflow-source-href="${escapeAttribute(href)}">${css}</style>`);
  });
  for (const attribute of ['src', 'poster']) {
    $(`[${attribute}]`).each((_index, element) => {
      const reference = String($(element).attr(attribute) || '').trim();
      if (!reference || /^(?:data:|blob:|#)/i.test(reference)) return;
      const resource = findResource(resources, reference, input.resourceBase);
      if (!resource || !/^image\//i.test(resource.mimeType)) {
        if (/^(?:https?:)?\/\//i.test(reference)) blockedResources.push(reference);
        return;
      }
      const dataUrl = `data:${resource.mimeType};base64,${Buffer.from(resource.bytes).toString('base64')}`;
      $(element).attr(attribute, dataUrl);
      assetMappings.push({ source: reference, local: resource.path, sandbox: dataUrl, disposition: 'inlined_for_sandbox' });
    });
  }
  const sandboxHtml = $.html();
  const allowedExternalAssetUrls = collectSourceDeclaredRemoteFontUrls(resolvedCss.join('\n'));
  for (const source of allowedExternalAssetUrls) {
    assetMappings.push({ source, disposition: 'allowed_remote_font_for_sandbox' });
  }
  capabilities.push({ name: 'sanitization', status: 'completed', durationMs: Date.now() - sanitizeStartedAt });
  capabilities.push({ name: 'resource_materialization', status: 'completed', durationMs: Date.now() - materializationStartedAt });

  const captureStartedAt = Date.now();
  let captures: SnapshotCapture[] = [];
  const warnings: string[] = [];
  try {
    captures = await (input.capture || captureWithSandboxBrowser)({
      html: sandboxHtml,
      viewports: VIEWPORTS,
      runtimeAudit: scriptAudit,
      allowedExternalAssetUrls,
    });
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
  }
  const captureComplete = captures.length === VIEWPORTS.length;
  const staticReplayComplete = captureComplete && captures.every((capture) => capture.staticReplay?.compared === true);
  const sourceRenderComplete = captureComplete && captures.every((capture) => (
    capture.render?.status !== 'incomplete'
    && (capture.render === undefined || capture.render.visibleElementCount > 0)
    && Boolean(capture.frozenBodyHtml?.trim())
  ));
  if (!sourceRenderComplete || !staticReplayComplete) {
    const detail = warnings[0]
      || (!staticReplayComplete
        ? 'the JavaScript-disabled static replay was not recorded for every required viewport'
        : 'the hydrated source was blank, incomplete, or missing a required viewport');
    throw new Error(`HTML_SOURCE_RENDER_INCOMPLETE: ${detail}`);
  }
  const baseCapture = captures.find((capture) => capture.viewport.id === 'bricks_base') || captures[0];
  const visualScripts = retainedVisualScriptMarkup(scriptAudit);
  const hydratedCompilerHtml = scriptAudit.some(scriptRequiresHydratedDom)
    ? mergeHydratedBody(
        staticCompilerHtml,
        restoreHydratedAssetReferences(baseCapture?.frozenBodyHtml || '', assetMappings),
        visualScripts,
      )
    : assignCompilerSourceIds(staticCompilerHtml, visualScripts);
  const sanitizedDom = await writeEvidence(evidenceDir, 'sanitized-source.html', hydratedCompilerHtml, 'text/html', 'evidence');
  const hydratedDom = await writeEvidence(evidenceDir, 'hydrated-source.html', hydratedCompilerHtml, 'text/html', 'evidence');
  const stylesheet = await writeEvidence(evidenceDir, 'resolved-styles.css', resolvedCss.join('\n'), 'text/css', 'evidence');
  const assetMap = await writeEvidence(evidenceDir, 'asset-map.json', `${JSON.stringify(assetMappings, null, 2)}\n`, 'application/json', 'evidence');
  const computedStyles: PixflowHtmlSourceManifestFile[] = [];
  const screenshots: PixflowHtmlSourceManifestFile[] = [];
  const staticReplayScreenshots: PixflowHtmlSourceManifestFile[] = [];
  for (const capture of captures) {
    computedStyles.push(await writeEvidence(
      evidenceDir,
      `computed-${capture.viewport.id}.json`,
      `${JSON.stringify({ viewport: capture.viewport, document: capture.document, variables: capture.variables, documentStyles: capture.documentStyles, nodes: capture.nodes }, null, 2)}\n`,
      'application/json',
      'evidence',
    ));
    if (capture.screenshot) {
      screenshots.push(await writeEvidence(evidenceDir, `source-${capture.viewport.id}.png`, capture.screenshot, 'image/png', 'evidence'));
    }
    if (capture.staticReplay?.screenshot) {
      staticReplayScreenshots.push(await writeEvidence(
        evidenceDir,
        `source-static-${capture.viewport.id}.png`,
        capture.staticReplay.screenshot,
        'image/png',
        'evidence',
      ));
    }
  }
  const behaviors = buildRuntimeBehaviors(scriptAudit, captures);
  const comparedReplays = captures.filter((capture) => capture.staticReplay?.compared === true);
  const matchedReplays = comparedReplays.filter((capture) => capture.staticReplay?.matched === true);
  const replayDifferences = comparedReplays
    .map((capture) => capture.staticReplay?.differenceRatio)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const runtimeAudit: PixflowHtmlRuntimeAudit = {
    mode: 'safe_hydration_then_static_replay',
    productMode: 'visual_clone',
    sourceRenderStatus: 'complete',
    scripts: scriptAudit,
    behaviors,
    excludedScriptIds: scriptAudit
      .filter((script) => script.disposition === 'application' || script.disposition === 'blocked')
      .map((script) => script.id),
    staticReplay: {
      comparedViewports: comparedReplays.length,
      matchedViewports: matchedReplays.length,
      maximumDifferenceRatio: replayDifferences.length > 0 ? Math.max(...replayDifferences) : null,
    },
    agentReview: scriptAudit.some((script) => script.confidence === 'low')
      || comparedReplays.length < VIEWPORTS.length
      || comparedReplays.some((capture) => capture.staticReplay?.matched !== true)
      ? 'recommended'
      : 'not_required',
    warnings: uniqueStrings([
      ...warnings,
      ...(comparedReplays.length < VIEWPORTS.length ? ['Static replay evidence is incomplete.'] : []),
      ...(comparedReplays.some((capture) => capture.staticReplay?.matched !== true)
        ? ['The frozen DOM does not fully reproduce the hydrated source without JavaScript; review required visual behaviour.']
        : []),
    ]),
  };
  const interactionEvidence = await writeEvidence(
    evidenceDir,
    'interaction-evidence.json',
    `${JSON.stringify({ captures: captures.map((capture) => ({ viewport: capture.viewport.id, interactions: capture.interactions })), behaviors }, null, 2)}\n`,
    'application/json',
    'evidence',
  );
  const runtimeAuditEvidence = await writeEvidence(
    evidenceDir,
    'runtime-audit.json',
    `${JSON.stringify(runtimeAudit, null, 2)}\n`,
    'application/json',
    'evidence',
  );
  const captureStatus = captureComplete ? 'completed' : 'failed';
  capabilities.push({
    name: 'runtime_audit',
    status: 'completed',
    durationMs: Date.now() - sanitizeStartedAt,
    evidencePath: runtimeAuditEvidence.path,
    evidenceHash: runtimeAuditEvidence.sha256,
  });
  capabilities.push({
    name: 'sandbox_settle',
    status: captureStatus,
    durationMs: Date.now() - captureStartedAt,
    ...(computedStyles[0] ? { evidencePath: computedStyles[0].path, evidenceHash: computedStyles[0].sha256 } : {}),
  });
  capabilities.push({ name: 'hydrated_dom_capture', status: 'completed', durationMs: Date.now() - captureStartedAt, evidencePath: hydratedDom.path, evidenceHash: hydratedDom.sha256 });
  capabilities.push({
    name: 'static_replay',
    status: comparedReplays.length === VIEWPORTS.length ? 'completed' : 'failed',
    durationMs: Date.now() - captureStartedAt,
    evidencePath: runtimeAuditEvidence.path,
    evidenceHash: runtimeAuditEvidence.sha256,
  });
  capabilities.push({ name: 'dom_style_capture', status: captureStatus, durationMs: Date.now() - captureStartedAt });
  capabilities.push({ name: 'responsive_capture', status: captureStatus, durationMs: Date.now() - captureStartedAt });

  const files = [canonical, ...materializedFiles];
  const manifest: PixflowHtmlSourceManifest = {
    schema: PIXFLOW_HTML_SOURCE_MANIFEST_SCHEMA,
    version: 1,
    sourceId: input.sourceId,
    runId: input.runId || randomUUID(),
    inputKind: input.inputKind,
    selectionReason: input.selectionReason,
    resourceBase: normalizeRelativePath(input.resourceBase),
    canonicalHtml: canonical,
    files,
    viewports: VIEWPORTS.map((viewport) => ({ ...viewport })),
    evidence: {
      sanitizedDom,
      resolvedStylesheet: stylesheet,
      computedStyles,
      screenshots,
      assetMap,
      interactionEvidence,
      runtimeAudit: runtimeAuditEvidence,
      hydratedDom,
      staticReplayScreenshots,
    },
    runtimeAudit,
    sanitization: { scriptsDeniedByDefault: true, removedScripts, removedEventHandlers, blockedResources: uniqueStrings(blockedResources), warnings },
    capabilities,
  };
  await fs.writeFile(path.join(input.workspaceDir, 'source-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await validateHtmlToBricksSourceManifest(input.workspaceDir, manifest);
  return { html: hydratedCompilerHtml, manifest };
}

export async function validateHtmlToBricksSourceManifest(rootDir: string, manifest: PixflowHtmlSourceManifest): Promise<void> {
  if (manifest.schema !== PIXFLOW_HTML_SOURCE_MANIFEST_SCHEMA || manifest.version !== 1) throw new Error('HTML source manifest schema is unsupported.');
  const root = path.resolve(rootDir);
  const files = [manifest.canonicalHtml, ...manifest.files, manifest.evidence.sanitizedDom, manifest.evidence.resolvedStylesheet, ...manifest.evidence.computedStyles, ...manifest.evidence.screenshots, ...manifest.evidence.staticReplayScreenshots, manifest.evidence.assetMap, manifest.evidence.runtimeAudit, manifest.evidence.hydratedDom, ...(manifest.evidence.interactionEvidence ? [manifest.evidence.interactionEvidence] : [])];
  const checked = new Set<string>();
  for (const file of files) {
    if (checked.has(file.resolvedPath)) continue;
    checked.add(file.resolvedPath);
    const resolved = path.resolve(root, file.resolvedPath);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`HTML source manifest path escapes its run: ${file.resolvedPath}`);
    const bytes = await fs.readFile(resolved).catch(() => null);
    if (!bytes) throw new Error(`HTML source manifest file is missing: ${file.resolvedPath}`);
    if (sha256(bytes) !== file.sha256 || bytes.byteLength !== file.size) throw new Error(`HTML source manifest file changed after capture: ${file.resolvedPath}`);
  }
}

async function captureWithSandboxBrowser(input: {
  html: string;
  viewports: typeof VIEWPORTS;
  runtimeAudit: PixflowHtmlRuntimeScriptAudit[];
  allowedExternalAssetUrls: string[];
}): Promise<SnapshotCapture[]> {
  const executablePath = await resolvePixflowCaptureBrowser();
  if (!executablePath) throw new Error('Rendered source snapshot unavailable: no supported local browser was found.');
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking', '--disable-service-worker', '--mute-audio'] });
  try {
    const results: SnapshotCapture[] = [];
    for (const viewport of input.viewports) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'no-preference' });
      const allowedExternalAssetUrls = new Set(input.allowedExternalAssetUrls);
      await page.route('**/*', (route) => (
        route.request().resourceType() === 'font' && allowedExternalAssetUrls.has(route.request().url())
          ? route.continue()
          : route.abort()
      ));
      await page.setContent(injectRuntimeCapturePolicy(input.html), { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.evaluate('(async () => { await document.fonts?.ready; })()');
      await waitForRenderedLayoutStability(page);
      const snapshot = await page.evaluate<{
        nodes: unknown[];
        variables: Record<string, string>;
        documentStyles: { html: Record<string, string>; body: Record<string, string> };
        document: { width: number; height: number };
        interactions: unknown[];
        frozenBodyHtml: string;
        frozenHtml: string;
        render: { status: 'complete' | 'incomplete'; visibleElementCount: number; visibleTextLength: number };
      }>(`(() => {
        const properties = ${JSON.stringify([...STYLE_PROPERTIES])};
        const allBodyElements = Array.from(document.body?.querySelectorAll('*') || []);
        allBodyElements.forEach((element, index) => {
          element.setAttribute('data-pf-source-id', 'pf-source-' + String(index + 1).padStart(5, '0'));
        });
        const styleRecord = (element) => {
          const style = getComputedStyle(element);
          return Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]));
        };
        const splitSelectors = (selectorText) => {
          const result = [];
          let current = '';
          let depth = 0;
          let quote = '';
          for (const char of String(selectorText || '')) {
            if (quote) {
              current += char;
              if (char === quote) quote = '';
              continue;
            }
            if (char === '"' || char === "'") {
              quote = char;
              current += char;
              continue;
            }
            if (char === '(' || char === '[') depth += 1;
            if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
            if (char === ',' && depth === 0) {
              if (current.trim()) result.push(current.trim());
              current = '';
              continue;
            }
            current += char;
          }
          if (current.trim()) result.push(current.trim());
          return result;
        };
        const selectorSpecificity = (selector) => {
          let value = String(selector || '')
            .replace(/:where\([^)]*\)/g, '')
            .replace(/::[a-z0-9_-]+/gi, ' ')
            .replace(/"(?:\\.|[^"])*"|'(?:\\.|[^'])*'/g, ' ');
          const ids = (value.match(/#[a-z0-9_-]+/gi) || []).length;
          const classes = (value.match(/\.[a-z0-9_-]+|\[[^\]]+\]|:(?!:)[a-z0-9_-]+(?:\([^)]*\))?/gi) || []).length;
          value = value
            .replace(/#[a-z0-9_-]+|\.[a-z0-9_-]+|\[[^\]]+\]|:(?!:)[a-z0-9_-]+(?:\([^)]*\))?/gi, ' ')
            .replace(/[>+~*]/g, ' ');
          const types = (value.match(/(?:^|\s|\|)([a-z][a-z0-9_-]*)/gi) || []).length;
          return [0, ids, classes, types];
        };
        const compareSpecificity = (left, right) => {
          for (let index = 0; index < 4; index += 1) {
            if ((left[index] || 0) !== (right[index] || 0)) return (left[index] || 0) - (right[index] || 0);
          }
          return 0;
        };
        const activeRules = [];
        let cascadeOrder = 0;
        const collectRules = (ruleList, conditions = []) => {
          for (const rule of Array.from(ruleList || [])) {
            if (rule.type === CSSRule.STYLE_RULE && rule.selectorText && rule.style) {
              const declarations = Object.fromEntries(Array.from(rule.style).map((property) => [property, {
                value: rule.style.getPropertyValue(property),
                important: rule.style.getPropertyPriority(property) === 'important',
              }]));
              activeRules.push({
                selector: rule.selectorText,
                selectors: splitSelectors(rule.selectorText),
                declarations,
                conditions,
                order: ++cascadeOrder,
              });
              continue;
            }
            if (!rule.cssRules) continue;
            const condition = String(rule.conditionText || '').trim();
            if (rule.type === CSSRule.MEDIA_RULE && condition && !matchMedia(condition).matches) continue;
            if (typeof CSSSupportsRule !== 'undefined' && rule instanceof CSSSupportsRule && condition && !CSS.supports(condition)) continue;
            collectRules(rule.cssRules, condition ? [...conditions, condition] : conditions);
          }
        };
        for (const sheet of Array.from(document.styleSheets)) {
          try { collectRules(sheet.cssRules || []); } catch {}
        }
        const runtimeMarker = /(?:^|[-_:])(scroll|animate|animation|motion|parallax|gsap|timeline|trigger|reveal|entrance|interact|ix\d*)(?:$|[-_:])/i;
        const runtimeLayoutProperty = /^(?:display|position|top|right|bottom|left|z-index|width|height|min-width|min-height|max-width|max-height|box-sizing|aspect-ratio|margin(?:-.+)?|padding(?:-.+)?|grid(?:-.+)?|gap|row-gap|column-gap|flex(?:-.+)?|align-(?:items|self|content)|justify-(?:content|self|items)|order|font(?:-.+)?|line-height|letter-spacing|white-space|text-align|text-transform|border(?:-(?:top|right|bottom|left))?-(?:width|style)|border-radius|border-(?:top-left|top-right|bottom-right|bottom-left)-radius|overflow(?:-.+)?|object-(?:fit|position)|clip-path)$/i;
        const stylesheetOwnsProperty = (properties, property) => {
          if (properties.has(property)) return true;
          if (/^margin-/i.test(property) && properties.has('margin')) return true;
          if (/^padding-/i.test(property) && properties.has('padding')) return true;
          if (/^(?:row|column)-gap$/i.test(property) && properties.has('gap')) return true;
          if (/^border-(?:top|right|bottom|left)-(?:width|style)$/i.test(property) && properties.has('border')) return true;
          if (/^border-(?:top-left|top-right|bottom-right|bottom-left)-radius$/i.test(property) && properties.has('border-radius')) return true;
          return false;
        };
        for (const element of Array.from(document.body?.querySelectorAll('*') || [])) {
          if (!(element instanceof HTMLElement) || !element.style || element.style.length === 0) continue;
          const runtimeControlled = [...element.getAttributeNames()].some((name) => (
            name.startsWith('data-') && (runtimeMarker.test(name) || runtimeMarker.test(element.getAttribute(name) || ''))
          )) || [...element.classList].some((name) => runtimeMarker.test(name));
          if (!runtimeControlled) continue;
          const stylesheetProperties = new Set();
          for (const rule of activeRules) {
            for (const selector of rule.selectors) {
              if (/::[a-z0-9_-]+/i.test(selector)) continue;
              const matchSelector = selector.trim();
              if (!matchSelector) continue;
              try {
                if (element.matches(matchSelector)) {
                  Object.keys(rule.declarations).forEach((property) => stylesheetProperties.add(property));
                }
              } catch {}
            }
          }
          for (const property of Array.from(element.style)) {
            if (runtimeLayoutProperty.test(property) && stylesheetOwnsProperty(stylesheetProperties, property)) {
              element.style.removeProperty(property);
            }
          }
          if (!element.getAttribute('style')?.trim()) element.removeAttribute('style');
        }
        const collectMatchedCssEvidence = (element, computedStyle) => {
          const matchedRules = [];
          const winners = new Map();
          const consider = (property, candidate) => {
            const current = winners.get(property);
            if (!current
              || Number(candidate.important) > Number(current.important)
              || candidate.important === current.important && compareSpecificity(candidate.specificity, current.specificity) > 0
              || candidate.important === current.important && compareSpecificity(candidate.specificity, current.specificity) === 0 && candidate.order >= current.order) {
              winners.set(property, candidate);
            }
          };
          for (const rule of activeRules) {
            const matchingSelectors = [];
            for (const selector of rule.selectors) {
              const pseudoElement = /::[a-z0-9_-]+/i.test(selector);
              const matchSelector = selector.replace(/::[a-z0-9_-]+(?:\([^)]*\))?/gi, '').trim();
              if (!matchSelector) continue;
              try {
                if (element.matches(matchSelector)) matchingSelectors.push({ selector, pseudoElement });
              } catch {}
            }
            if (matchingSelectors.length === 0) continue;
            matchedRules.push({
              selector: rule.selector,
              matchingSelectors: matchingSelectors.map((entry) => entry.selector),
              order: rule.order,
              conditions: rule.conditions,
              properties: Object.keys(rule.declarations),
            });
            for (const match of matchingSelectors) {
              if (match.pseudoElement) continue;
              const specificity = selectorSpecificity(match.selector);
              for (const [property, declaration] of Object.entries(rule.declarations)) {
                consider(property, { ...declaration, specificity, order: rule.order, selector: match.selector });
              }
            }
          }
          if (element instanceof HTMLElement && element.style) {
            for (const property of Array.from(element.style)) {
              consider(property, {
                value: element.style.getPropertyValue(property),
                important: element.style.getPropertyPriority(property) === 'important',
                specificity: [1, 0, 0, 0],
                order: Number.MAX_SAFE_INTEGER,
                selector: '<inline style>',
              });
            }
          }
          const authoredProperties = [...winners.keys()].slice(0, 160);
          const winningDeclarations = Object.fromEntries(authoredProperties.map((property) => {
            const winner = winners.get(property);
            const authoredValue = String(winner?.value || '').trim();
            const computedValue = computedStyle.getPropertyValue(property).trim();
            return [property, {
              value: authoredValue,
              computedValue,
              important: Boolean(winner?.important),
              selector: String(winner?.selector || ''),
              specificity: winner?.specificity || [0, 0, 0, 0],
              order: Number(winner?.order || 0),
            }];
          }));
          return { authoredProperties, winningDeclarations, matchedRules: matchedRules.slice(-100) };
        };
        const nodes = Array.from(document.querySelectorAll('[data-pf-source-id]')).map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const styles = Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]));
          const cssEvidence = collectMatchedCssEvidence(element, style);
          const pseudo = (name) => {
            const value = getComputedStyle(element, name);
            return value.content && value.content !== 'none' ? { content: value.content, display: value.display, position: value.position } : null;
          };
          return { sourceNodeId: element.dataset.pfSourceId, tag: element.tagName.toLowerCase(), classes: [...element.classList], selector: element.id ? '#' + element.id : '', rect: { x: rect.x, y: rect.y + scrollY, width: rect.width, height: rect.height }, styles, ...cssEvidence, pseudo: { before: pseudo('::before'), after: pseudo('::after') } };
        });
        const rootStyle = getComputedStyle(document.documentElement);
        const bodyStyle = getComputedStyle(document.body);
        const variableNames = new Set([...Array.from(rootStyle), ...Array.from(bodyStyle)].filter((name) => name.startsWith('--')));
        const variables = Object.fromEntries([...variableNames].map((name) => [name, bodyStyle.getPropertyValue(name) || rootStyle.getPropertyValue(name)]));
        const cssInteractions = nodes.filter((node) => node.styles['animation-name'] && node.styles['animation-name'] !== 'none').map((node) => ({ sourceNodeId: node.sourceNodeId, kind: 'css-animation', name: node.styles['animation-name'] }));
        const webAnimations = document.getAnimations().slice(0, 80).map((animation) => {
          const target = animation.effect && 'target' in animation.effect ? animation.effect.target : null;
          return {
            sourceNodeId: target instanceof Element ? target.getAttribute('data-pf-source-id') || '' : '',
            kind: 'web-animation',
            playState: animation.playState,
            timing: animation.effect?.getTiming?.() || {},
          };
        });
        document.getAnimations().forEach((animation) => { try { animation.pause(); animation.currentTime = 0; } catch {} });
        const visibleElements = allBodyElements.filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
        });
        const visibleTextLength = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().length;
        const frozen = document.documentElement.cloneNode(true);
        frozen.querySelectorAll('script, [data-pixflow-runtime-policy]').forEach((element) => element.remove());
        frozen.querySelectorAll('*').forEach((element) => {
          for (const name of element.getAttributeNames()) if (/^on/i.test(name)) element.removeAttribute(name);
        });
        const frozenBody = frozen.querySelector('body');
        return {
          nodes,
          variables,
          documentStyles: { html: styleRecord(document.documentElement), body: styleRecord(document.body) },
          document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
          interactions: [...cssInteractions, ...webAnimations],
          frozenBodyHtml: frozenBody ? frozenBody.innerHTML : '',
          frozenHtml: '<!doctype html>' + frozen.outerHTML,
          render: {
            status: visibleElements.length > 0 && (visibleTextLength > 0 || visibleElements.some((element) => ['IMG', 'SVG', 'CANVAS', 'VIDEO'].includes(element.tagName))) ? 'complete' : 'incomplete',
            visibleElementCount: visibleElements.length,
            visibleTextLength,
          },
        };
      })()`);
      const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
      const replayPage = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'no-preference', javaScriptEnabled: false });
      await replayPage.route('**/*', (route) => (
        route.request().resourceType() === 'font' && allowedExternalAssetUrls.has(route.request().url())
          ? route.continue()
          : route.abort()
      ));
      await replayPage.setContent(snapshot.frozenHtml, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await replayPage.waitForTimeout(100);
      const replayScreenshot = await replayPage.screenshot({ fullPage: true, type: 'png' });
      const differenceRatio = comparePngDifferenceRatio(screenshot, replayScreenshot);
      await replayPage.close();
      results.push({
        viewport,
        nodes: snapshot.nodes,
        variables: snapshot.variables,
        documentStyles: snapshot.documentStyles,
        document: snapshot.document,
        interactions: snapshot.interactions,
        frozenBodyHtml: snapshot.frozenBodyHtml,
        render: snapshot.render,
        staticReplay: {
          compared: true,
          matched: differenceRatio <= STATIC_REPLAY_MAX_DIFFERENCE_RATIO,
          differenceRatio,
          screenshot: replayScreenshot,
        },
        screenshot,
      });
      await page.close();
    }
    return results;
  } finally {
    await browser.close();
  }
}

/**
 * Wait for the conversion geometry to reach its resting state. Source pages often
 * apply finite entrance animation with inline styles after hydration; capturing on
 * a fixed timer can persist an arbitrary in-between frame into Bricks. The
 * signature deliberately excludes transforms, opacity, and paint-only properties
 * so decorative or infinite animation cannot hold the converter hostage.
 */
async function waitForRenderedLayoutStability(page: Page): Promise<void> {
  const startedAt = Date.now();
  let previousSignature = '';
  let consecutiveMatches = 0;

  while (Date.now() - startedAt < LAYOUT_SETTLE_TIMEOUT_MS) {
    await page.waitForTimeout(LAYOUT_SETTLE_SAMPLE_MS);
    const signature = await page.evaluate<string>(`(() => {
      const properties = ${JSON.stringify([
        'display', 'position', 'top', 'right', 'bottom', 'left',
        'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
        'box-sizing', 'aspect-ratio',
        'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'grid-template-columns', 'grid-template-rows', 'row-gap', 'column-gap',
        'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
        'align-items', 'align-self', 'justify-content', 'order',
        'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
        'white-space', 'text-align', 'text-transform',
        'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
        'overflow', 'overflow-x', 'overflow-y', 'object-fit',
      ])};
      let hash = 2166136261;
      const add = (value) => {
        const text = String(value ?? '');
        for (let index = 0; index < text.length; index += 1) {
          hash ^= text.charCodeAt(index);
          hash = Math.imul(hash, 16777619);
        }
      };
      add(document.documentElement.scrollWidth);
      add(document.documentElement.scrollHeight);
      const elements = [document.documentElement, document.body, ...Array.from(document.body?.querySelectorAll('*') || [])];
      for (const element of elements) {
        if (!(element instanceof HTMLElement || element instanceof SVGElement)) continue;
        const style = getComputedStyle(element);
        add(element.tagName);
        add(element instanceof HTMLElement ? element.offsetLeft : 0);
        add(element instanceof HTMLElement ? element.offsetTop : 0);
        add(element instanceof HTMLElement ? element.offsetWidth : element.getBoundingClientRect().width.toFixed(2));
        add(element instanceof HTMLElement ? element.offsetHeight : element.getBoundingClientRect().height.toFixed(2));
        for (const property of properties) add(style.getPropertyValue(property));
      }
      return (hash >>> 0).toString(16);
    })()`);

    if (signature === previousSignature) consecutiveMatches += 1;
    else consecutiveMatches = 0;
    previousSignature = signature;

    if (
      Date.now() - startedAt >= LAYOUT_SETTLE_MINIMUM_MS
      && consecutiveMatches >= LAYOUT_SETTLE_CONSECUTIVE_SAMPLES
    ) return;
  }
}

type ClassifiedRuntimeScript = PixflowHtmlRuntimeScriptAudit & {
  _code: string;
  _attributes: Record<string, string>;
  _preserveDuringCapture: boolean;
};

export function classifyHtmlToBricksScripts(input: {
  html: string;
  canonicalPath: string;
  resourceBase: string;
  resources: HtmlToBricksSourceResource[];
}): ClassifiedRuntimeScript[] {
  const resources = buildResourceIndex(input.resources, input.resourceBase);
  const $ = load(input.html, { xmlMode: false });
  const result: ClassifiedRuntimeScript[] = [];
  $('script').each((index, element) => {
    const attributes = 'attribs' in element ? { ...(element.attribs || {}) } : {};
    const source = String(attributes.src || '').trim();
    const inlineCode = $(element).html() || '';
    const resource = source ? findResource(resources, source, input.resourceBase, input.canonicalPath) : undefined;
    const code = resource && resource.role === 'script' ? Buffer.from(resource.bytes).toString('utf8') : inlineCode;
    const type = String(attributes.type || '').trim().toLowerCase();
    const nonExecutableData = Boolean(type && !/(?:java|ecma)script|module/i.test(type));
    const libraries = detectRuntimeLibraries(`${source}\n${code}`);
    const captureDependencyProvider = !nonExecutableData
      && /(?:^|[/_.-])jquery(?:-\d+(?:\.\d+)*)?(?:\.min)?(?:[./_-]|$)/i.test(source);
    const application = !nonExecutableData && hasApplicationScriptSignals(`${source}\n${code}`);
    const visual = !application && !nonExecutableData && hasVisualScriptSignals(`${source}\n${code}`);
    const frameworkBundle = !application && !nonExecutableData && hasFrameworkBundleScriptSignals(`${source}\n${code}`);
    const visualLibraryProvider = visual && libraries.length > 0 && (
      /(?:^|[/_.-])(?:gsap|scrolltrigger|three|d3|p5|lottie|swiper)(?:[./_-]|$)/i.test(source)
      || code.length > MAX_RETAINED_VISUAL_SCRIPT_BYTES
      || /(?:GreenSock|greensock|registerPlugin|window\.gsap\s*=|function\s+Animation)/i.test(code.slice(0, 20_000))
    );
    const hydration = !application && !visual && !nonExecutableData && hasHydrationScriptSignals(`${source}\n${code}`);
    const missingLocalSource = Boolean(source && !/^(?:data:|blob:)/i.test(source) && !resource);

    let disposition: PixflowHtmlRuntimeScriptAudit['disposition'] = 'blocked';
    let reasonCodes = ['unsupported_or_ambiguous_script'];
    let executedDuringCapture = false;
    let retainForConversion = false;
    let finalStrategy: PixflowHtmlRuntimeScriptAudit['finalStrategy'] = 'manual_review';
    let confidence: PixflowHtmlRuntimeScriptAudit['confidence'] = 'low';
    let preserveDuringCapture = false;

    if (nonExecutableData) {
      disposition = 'capture_only';
      reasonCodes = ['non_executable_hydration_data'];
      finalStrategy = 'none';
      confidence = 'high';
      preserveDuringCapture = true;
    } else if (captureDependencyProvider) {
      // jQuery contains network primitives by design, but a declared local
      // copy is a dependency for the source page's own visual/hydration code.
      // Execute it only in the isolated, network-denied capture and never
      // carry the library into the final Bricks page.
      disposition = 'capture_only';
      reasonCodes = ['capture_dependency_provider'];
      executedDuringCapture = true;
      finalStrategy = 'none';
      confidence = 'high';
      preserveDuringCapture = true;
    } else if (application) {
      disposition = 'application';
      reasonCodes = runtimeApplicationReasonCodes(`${source}\n${code}`);
      finalStrategy = 'none';
      confidence = 'high';
    } else if (missingLocalSource) {
      disposition = 'blocked';
      reasonCodes = [/^https?:|^\/\//i.test(source) ? 'unknown_remote_script' : 'missing_declared_local_script'];
      finalStrategy = 'manual_review';
      confidence = 'low';
    } else if (visualLibraryProvider) {
      disposition = 'capture_only';
      reasonCodes = ['visual_library_provider'];
      executedDuringCapture = true;
      finalStrategy = 'library';
      confidence = 'high';
      preserveDuringCapture = true;
    } else if (frameworkBundle) {
      // Framework/module chunks often contain incidental class, style, scroll,
      // and animation tokens even though they are not standalone authored
      // page behaviour. They may participate in the network-denied hydration
      // capture, but copying them into Bricks page settings would ship a large,
      // dependency-incomplete application runtime as page JavaScript.
      disposition = 'capture_only';
      reasonCodes = ['framework_bundle_chunk'];
      executedDuringCapture = true;
      finalStrategy = 'none';
      confidence = 'high';
      preserveDuringCapture = true;
    } else if (visual) {
      const unsafeDynamicCode = /\beval\s*\(|\bnew\s+Function\b|\bimport\s*\(/.test(code);
      disposition = unsafeDynamicCode ? 'blocked' : 'visual_behavior';
      reasonCodes = unsafeDynamicCode ? ['dynamic_code_not_retained'] : runtimeVisualReasonCodes(`${source}\n${code}`);
      executedDuringCapture = !unsafeDynamicCode;
      retainForConversion = !unsafeDynamicCode && Buffer.byteLength(code, 'utf8') <= MAX_RETAINED_VISUAL_SCRIPT_BYTES;
      finalStrategy = unsafeDynamicCode ? 'manual_review' : (libraries.length > 0 ? 'library' : 'pixflow_js');
      confidence = unsafeDynamicCode ? 'low' : 'high';
      preserveDuringCapture = !unsafeDynamicCode;
    } else if (hydration) {
      disposition = 'capture_only';
      reasonCodes = ['framework_or_dom_hydration'];
      executedDuringCapture = true;
      finalStrategy = 'none';
      confidence = 'medium';
      preserveDuringCapture = true;
    }

    const audit: ClassifiedRuntimeScript = {
      id: `script-${String(index + 1).padStart(3, '0')}`,
      source: source || `inline:${index + 1}`,
      inline: !source,
      disposition,
      reasonCodes,
      libraries,
      executedDuringCapture,
      retainForConversion,
      finalStrategy,
      confidence,
      _code: code,
      _attributes: attributes,
      _preserveDuringCapture: preserveDuringCapture,
    };
    for (const key of ['_code', '_attributes', '_preserveDuringCapture'] as const) {
      Object.defineProperty(audit, key, { value: audit[key], enumerable: false, writable: false });
    }
    result.push(audit);
  });
  return result;
}

function materializeRuntimeCaptureHtml(
  html: string,
  scripts: ClassifiedRuntimeScript[],
  resources: Map<string, HtmlToBricksSourceResource>,
  resourceBase: string,
  canonicalPath: string,
): string {
  const $ = load(html, { xmlMode: false });
  $('script').each((index, element) => {
    const audit = scripts[index];
    if (!audit?._preserveDuringCapture) {
      $(element).remove();
      return;
    }
    if (!audit.executedDuringCapture) return;
    const source = String($(element).attr('src') || '').trim();
    if (source) {
      const resource = findResource(resources, source, resourceBase, canonicalPath);
      if (!resource || resource.role !== 'script') {
        $(element).remove();
        return;
      }
      $(element).removeAttr('src').removeAttr('integrity').removeAttr('crossorigin').removeAttr('nonce');
      // External JavaScript becomes inline only inside the network-denied
      // capture document. A literal closing-script sequence in that source
      // must stay JavaScript data; otherwise the HTML parser terminates the
      // element early and projects the remaining bundle bytes into the body
      // as fake visible tags/text before the DOM is frozen.
      $(element).text(Buffer.from(resource.bytes).toString('utf8').replace(/<\/script/gi, '<\\/script'));
    }
  });

  // A browser "Save page as" can freeze the DOM after Pace has declared the
  // loader complete but before the theme's final visibility write. In that
  // state the saved page is permanently blank even though its body explicitly
  // records `pace-done`. Recover only the conventional direct content wrapper
  // and only its stale zero-opacity declaration; all other inline styles remain
  // authored evidence for the converter.
  $('body.pace-done').children('#main-container').each((_index, element) => {
    const declaration = String($(element).attr('style') || '');
    const recovered = declaration
      .split(';')
      .filter((part) => !/^\s*opacity\s*:\s*(?:0+(?:\.0*)?|\.0+)\s*(?:!important\s*)?$/i.test(part))
      .join(';')
      .trim();
    if (recovered) $(element).attr('style', recovered.endsWith(';') ? recovered : `${recovered};`);
    else $(element).removeAttr('style');
  });
  return $.html();
}

function retainedVisualScriptMarkup(scripts: ClassifiedRuntimeScript[]): string {
  return scripts
    .filter((script) => script.disposition === 'visual_behavior' && script.retainForConversion && script._code.trim())
    .map((script) => `<script data-pixflow-runtime-script="${escapeAttribute(script.id)}">\n${script._code.replace(/<\/script/gi, '<\\/script')}\n</script>`)
    .join('\n');
}

function mergeHydratedBody(html: string, bodyHtml: string, visualScripts: string): string {
  const $ = load(html, { xmlMode: false });
  const body = $('body').first();
  if (body.length === 0) throw new Error('HTML_SOURCE_RENDER_INCOMPLETE: hydrated source has no body element.');
  body.html(bodyHtml);
  if (visualScripts) body.append(`\n${visualScripts}`);
  return $.html();
}

function assignCompilerSourceIds(html: string, visualScripts: string): string {
  // Keep static source byte-for-byte intact. Cheerio normalisation here would
  // rewrite authored boolean attributes and quoting before the converter sees
  // them. Static DOM IDs are assigned independently by the capture and bridge
  // walkers in the same document order, so the compiler document does not need
  // internal IDs unless it came from a genuinely hydrated browser DOM.
  if (!visualScripts) return html;
  if (/<\/body\s*>/i.test(html)) {
    return html.replace(/<\/body\s*>/i, `${visualScripts}\n</body>`);
  }
  return `${html}\n${visualScripts}`;
}

function scriptRequiresHydratedDom(script: ClassifiedRuntimeScript): boolean {
  if (!script.executedDuringCapture) return false;
  if (script.disposition === 'capture_only' && script.reasonCodes.includes('framework_or_dom_hydration')) return true;
  return script.disposition === 'visual_behavior'
    && /(?:innerHTML|outerHTML|insertAdjacentHTML|appendChild|replaceChildren|createElement\s*\()/i.test(script._code);
}

function restoreHydratedAssetReferences(bodyHtml: string, mappings: Array<Record<string, unknown>>): string {
  let result = bodyHtml;
  for (const mapping of mappings) {
    const sandbox = String(mapping.sandbox || '');
    const source = String(mapping.source || '');
    if (!sandbox || !source) continue;
    result = result.split(sandbox).join(source);
  }
  return result;
}

function buildRuntimeBehaviors(scripts: ClassifiedRuntimeScript[], captures: SnapshotCapture[]): PixflowHtmlRuntimeBehavior[] {
  const behaviors: PixflowHtmlRuntimeBehavior[] = [];
  for (const script of scripts) {
    if (script.disposition === 'capture_only' && script.reasonCodes.includes('framework_or_dom_hydration')) {
      behaviors.push({
        id: `behavior-${script.id}`,
        kind: 'hydration',
        trigger: 'document_load',
        affectedSourceNodeIds: [],
        visualChanges: ['settled_dom'],
        libraries: script.libraries,
        implementation: 'none',
        confidence: script.confidence,
      });
    }
    if (script.disposition !== 'visual_behavior') continue;
    const source = script._code;
    const kind: PixflowHtmlRuntimeBehavior['kind'] = /ScrollTrigger|\bscroll\b/i.test(source)
      ? 'scroll'
      : /mouseenter|mouseover|pointerenter|\bhover\b/i.test(source)
        ? 'hover'
        : /accordion|aria-expanded|<details/i.test(source)
          ? 'accordion'
          : /carousel|swiper|slider/i.test(source)
            ? 'carousel'
            : 'load_animation';
    behaviors.push({
      id: `behavior-${script.id}`,
      kind,
      trigger: kind === 'load_animation' ? 'document_load' : kind,
      affectedSourceNodeIds: [],
      visualChanges: runtimeVisualReasonCodes(source),
      libraries: script.libraries,
      implementation: script.finalStrategy,
      confidence: script.confidence,
    });
  }
  const seenCssAnimations = new Set<string>();
  for (const capture of captures) {
    for (const value of capture.interactions || []) {
      const interaction = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      if (String(interaction.kind || '') !== 'css-animation') continue;
      const sourceNodeId = String(interaction.sourceNodeId || '');
      const name = String(interaction.name || '');
      const key = `${sourceNodeId}:${name}`;
      if (seenCssAnimations.has(key)) continue;
      seenCssAnimations.add(key);
      behaviors.push({
        id: `behavior-css-${String(behaviors.length + 1).padStart(3, '0')}`,
        kind: 'css_animation',
        trigger: 'css_animation_timeline',
        affectedSourceNodeIds: sourceNodeId ? [sourceNodeId] : [],
        visualChanges: name ? [`animation:${name}`] : ['css_animation'],
        libraries: [],
        implementation: 'css',
        confidence: 'high',
      });
    }
  }
  return behaviors.slice(0, 80);
}

function injectRuntimeCapturePolicy(html: string): string {
  const policy = `<script data-pixflow-runtime-policy>
    (() => {
      const denied = () => Promise.reject(new Error('Pixflow source sandbox blocked an application network request.'));
      window.fetch = denied;
      window.XMLHttpRequest = class { open() {} send() { throw new Error('Pixflow source sandbox blocked XMLHttpRequest.'); } };
      window.WebSocket = class { constructor() { throw new Error('Pixflow source sandbox blocked WebSocket.'); } };
      window.EventSource = class { constructor() { throw new Error('Pixflow source sandbox blocked EventSource.'); } };
      if (navigator.sendBeacon) navigator.sendBeacon = () => false;
      if (navigator.serviceWorker?.register) navigator.serviceWorker.register = denied;
      addEventListener('submit', (event) => event.preventDefault(), true);
    })();
  </script>`;
  return /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (head) => `${head}${policy}`) : `${policy}${html}`;
}

function comparePngDifferenceRatio(referenceBytes: Uint8Array, actualBytes: Uint8Array): number {
  try {
    const reference = PNG.sync.read(Buffer.from(referenceBytes));
    const actual = PNG.sync.read(Buffer.from(actualBytes));
    if (reference.width !== actual.width || reference.height !== actual.height) return 1;
    const differentPixels = pixelmatch(reference.data, actual.data, undefined, actual.width, actual.height, { threshold: 0.1 });
    return differentPixels / Math.max(1, actual.width * actual.height);
  } catch {
    return 1;
  }
}

function detectRuntimeLibraries(value: string): string[] {
  const libraries: string[] = [];
  if (/\bgsap\b|GreenSock/i.test(value)) libraries.push('gsap');
  if (/ScrollTrigger|scrolltrigger|scroll-trigger/i.test(value)) libraries.push('gsap-scrolltrigger');
  if (/\bTHREE\b|three(?:\.min)?\.js/i.test(value)) libraries.push('three');
  if (/\bd3\s*\.|d3(?:\.min)?\.js/i.test(value)) libraries.push('d3');
  if (/\bp5\s*\.|p5(?:\.min)?\.js/i.test(value)) libraries.push('p5');
  if (/\blottie\b|bodymovin/i.test(value)) libraries.push('lottie');
  if (/\bSwiper\b|swiper(?:-bundle)?(?:\.min)?\.js/i.test(value)) libraries.push('swiper');
  return uniqueStrings(libraries);
}

function hasApplicationScriptSignals(value: string): boolean {
  return /(?:intercom|drift|\bcrisp\b|zendesk|freshchat|chatwoot|openai\/chat|gtag\s*\(|google-analytics|googletagmanager|segment\.|mixpanel|posthog|hotjar|fullstory|sentry|serviceWorker|sendBeacon|\bfetch\s*\(|XMLHttpRequest|\bstripe\b|paypal|checkout|captcha|recaptcha|turnstile|__CF\$cv\$params|cdn-cgi\/challenge-platform|\bauth\b|login|logout|signIn|signOut|WebSocket|EventSource|\/api\/(?:chat|auth|user|account|billing|payment)|graphql)/i.test(value);
}

function hasFrameworkBundleScriptSignals(value: string): boolean {
  return /(?:globalThis\.)?(?:TURBOPACK|webpackChunk[\w$-]*)\s*\|\||(?:globalThis\.)?(?:TURBOPACK|webpackChunk[\w$-]*)\s*\.push\s*\(|\b__webpack_require__\b|\bparcelRequire\b/i.test(value);
}

function hasVisualScriptSignals(value: string): boolean {
  return /(?:\bgsap\s*\.|ScrollTrigger|\bTHREE\b|\bd3\s*\.|\bp5\s*\.|\blottie\b|\bSwiper\b|requestAnimationFrame|\.animate\s*\(|getAnimations\s*\(|IntersectionObserver|classList\.(?:add|remove|toggle)|\.style\.[a-z]|setAttribute\(\s*['"](?:class|style|aria-expanded)|addEventListener\(\s*['"](?:scroll|wheel|mouseenter|mouseover|pointerenter|click))/i.test(value);
}

function hasHydrationScriptSignals(value: string): boolean {
  return /(?:webpackChunk|__NEXT_DATA__|_next\/static|ReactDOM|hydrateRoot|createRoot\s*\(|\bVue\b|createApp\s*\(|__NUXT__|angular|vite|parcelRequire|document\.(?:body|querySelector|getElementById)|innerHTML|insertAdjacentHTML|appendChild)/i.test(value);
}

function runtimeApplicationReasonCodes(value: string): string[] {
  const reasons: string[] = [];
  if (/(?:intercom|drift|\bcrisp\b|zendesk|freshchat|chatwoot|openai\/chat)/i.test(value)) reasons.push('chat_or_support_application');
  if (/(?:gtag\s*\(|google-analytics|googletagmanager|segment\.|mixpanel|posthog|hotjar|fullstory|sentry|sendBeacon)/i.test(value)) reasons.push('analytics_or_tracking');
  if (/(?:__CF\$cv\$params|cdn-cgi\/challenge-platform|captcha|recaptcha|turnstile)/i.test(value)) reasons.push('security_or_challenge_runtime');
  if (/(?:serviceWorker|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|\/api\/|graphql)/i.test(value)) reasons.push('network_or_private_api');
  if (/(?:\bstripe\b|paypal|checkout|billing|payment|captcha|recaptcha|turnstile|\bauth\b|login|logout|signIn|signOut)/i.test(value)) reasons.push('business_or_identity_function');
  return reasons.length > 0 ? uniqueStrings(reasons) : ['application_business_code'];
}

function runtimeVisualReasonCodes(value: string): string[] {
  const reasons: string[] = [];
  if (/\bgsap\s*\.|\.animate\s*\(|requestAnimationFrame/i.test(value)) reasons.push('animation');
  if (/ScrollTrigger|IntersectionObserver|addEventListener\(\s*['"](?:scroll|wheel)/i.test(value)) reasons.push('scroll_trigger');
  if (/mouseenter|mouseover|pointerenter|\bhover\b/i.test(value)) reasons.push('hover_interaction');
  if (/classList\.|\.style\.|setAttribute\(\s*['"](?:class|style|aria-expanded)/i.test(value)) reasons.push('visual_dom_state');
  return reasons.length > 0 ? uniqueStrings(reasons) : ['visual_behavior'];
}

async function writeEvidence(
  root: string,
  name: string,
  value: string | Uint8Array,
  mimeType: string,
  role: PixflowHtmlSourceManifestFile['role'],
  disposition: PixflowHtmlSourceManifestFile['disposition'] = 'evidence',
): Promise<PixflowHtmlSourceManifestFile> {
  const bytes = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value);
  await fs.writeFile(path.join(root, name), bytes);
  return manifestFile(`source-evidence/${name}`, role, mimeType, bytes, `source-evidence/${name}`, disposition);
}

function manifestFile(sourcePath: string, role: PixflowHtmlSourceManifestFile['role'], mimeType: string, bytes: Uint8Array, resolvedPath: string, disposition: PixflowHtmlSourceManifestFile['disposition']): PixflowHtmlSourceManifestFile {
  return { path: normalizeRelativePath(sourcePath), role, mimeType, size: bytes.byteLength, sha256: sha256(bytes), resolvedPath: normalizeRelativePath(resolvedPath), disposition, sourcePath: normalizeRelativePath(sourcePath) };
}

function assertCompleteHtml(html: string): void {
  const value = html.trim();
  if (!/(?:<!doctype\s+html|<html\b|<(?:main|section|article|div)\b)/i.test(value) || !/<\/(?:html|main|section|article|div)>/i.test(value)) throw new Error('HTML source snapshot requires a complete HTML document or bounded structural fragment.');
}

function isCssResource(resource: HtmlToBricksSourceResource): boolean { return /text\/css/i.test(resource.mimeType) || /\.css$/i.test(resource.path); }
function buildResourceIndex(resources: HtmlToBricksSourceResource[], resourceBase: string): Map<string, HtmlToBricksSourceResource> {
  const index = new Map<string, HtmlToBricksSourceResource>();
  for (const resource of resources) {
    const safePath = assertSafeRelativePath(resource.path, 'bundle resource');
    index.set(safePath, resource);
    const base = normalizeRelativePath(resourceBase);
    if (base && safePath.startsWith(`${base}/`)) index.set(safePath.slice(base.length + 1), resource);
  }
  return index;
}

type MissingBundleResource = {
  kind: 'stylesheet' | 'asset' | 'image' | 'media';
  reference: string;
  containingPath: string;
};

function assertCompleteSourceBundle(
  html: string,
  canonicalPath: string,
  resources: Map<string, HtmlToBricksSourceResource>,
  resourceBase: string,
): void {
  const missing: MissingBundleResource[] = [];
  const seenStylesheets = new Set<string>();
  const recordMissing = (kind: MissingBundleResource['kind'], reference: string, containingPath: string) => {
    const value = reference.trim();
    if (!isLocalBundleReference(value)) return;
    const key = `${kind}:${containingPath}:${value}`;
    if (missing.some((entry) => `${entry.kind}:${entry.containingPath}:${entry.reference}` === key)) return;
    missing.push({ kind, reference: value, containingPath });
  };
  const auditCss = (css: string, stylesheetPath: string) => {
    for (const match of css.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s]+)["']?\s*\)?\s*[^;]*;/gi)) {
      const reference = String(match[1] || '').trim();
      if (!isLocalBundleReference(reference)) continue;
      const resource = findResource(resources, reference, resourceBase, stylesheetPath);
      if (!resource || !isCssResource(resource)) {
        recordMissing('stylesheet', reference, stylesheetPath);
        continue;
      }
      const key = normalizeRelativePath(resource.path);
      if (seenStylesheets.has(key)) continue;
      seenStylesheets.add(key);
      auditCss(Buffer.from(resource.bytes).toString('utf8'), resource.path);
    }
    const withoutImports = css.replace(/@import\s+(?:url\(\s*)?["']?[^"')\s]+["']?\s*\)?\s*[^;]*;/gi, '');
    for (const match of withoutImports.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)) {
      const reference = String(match[2] || '').trim();
      if (!isLocalBundleReference(reference)) continue;
      if (!findResource(resources, reference, resourceBase, stylesheetPath)) recordMissing('asset', reference, stylesheetPath);
    }
  };

  const $ = load(html, { xmlMode: false });
  $('link[rel~="stylesheet"]').each((_index, element) => {
    const reference = String($(element).attr('href') || '').trim();
    if (!isLocalBundleReference(reference)) return;
    const resource = findResource(resources, reference, resourceBase, canonicalPath);
    if (!resource || !isCssResource(resource)) {
      recordMissing('stylesheet', reference, canonicalPath);
      return;
    }
    const key = normalizeRelativePath(resource.path);
    if (seenStylesheets.has(key)) return;
    seenStylesheets.add(key);
    auditCss(Buffer.from(resource.bytes).toString('utf8'), resource.path);
  });
  $('style').each((_index, element) => auditCss($(element).html() || '', canonicalPath));
  $('[style]').each((_index, element) => auditCss(String($(element).attr('style') || ''), canonicalPath));

  for (const { selector, attribute, kind } of [
    { selector: 'img[src]', attribute: 'src', kind: 'image' as const },
    { selector: 'input[type="image"][src]', attribute: 'src', kind: 'image' as const },
    { selector: 'source[src]', attribute: 'src', kind: 'media' as const },
    { selector: 'video[poster]', attribute: 'poster', kind: 'image' as const },
  ]) {
    $(selector).each((_index, element) => {
      const reference = String($(element).attr(attribute) || '').trim();
      if (isLocalBundleReference(reference) && !findResource(resources, reference, resourceBase, canonicalPath)) {
        recordMissing(kind, reference, canonicalPath);
      }
    });
  }
  $('img[srcset], source[srcset]').each((_index, element) => {
    const srcset = String($(element).attr('srcset') || '');
    for (const candidate of srcset.split(',')) {
      const reference = candidate.trim().split(/\s+/)[0] || '';
      if (isLocalBundleReference(reference) && !findResource(resources, reference, resourceBase, canonicalPath)) {
        recordMissing(element.tagName === 'source' ? 'media' : 'image', reference, canonicalPath);
      }
    }
  });

  if (missing.length === 0) return;
  const first = missing[0]!;
  const remainder = missing.length > 1 ? `; ${missing.length - 1} additional local resource${missing.length === 2 ? '' : 's'} missing` : '';
  throw new Error(`HTML_SOURCE_BUNDLE_INCOMPLETE: missing local ${first.kind} "${first.reference}" referenced by "${first.containingPath}"${remainder}`);
}

function isLocalBundleReference(value: string): boolean {
  const reference = value.trim();
  return Boolean(reference) && !/^(?:data:|blob:|#|%23|https?:|\/\/|mailto:|tel:|javascript:)/i.test(reference);
}

function materializeCompilerHtml(
  html: string,
  resources: Map<string, HtmlToBricksSourceResource>,
  resourceBase: string,
  canonicalPath: string,
): string {
  const withoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  const withoutHandlers = withoutScripts.replace(/\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  const withEmbeddedCss = withoutHandlers.replace(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi, (_match, attributes: string, css: string) => (
    `<style${attributes}>${resolveStylesheetResources(css, canonicalPath, resources, resourceBase, new Set<string>(), false)}</style>`
  ));
  return withEmbeddedCss.replace(/<link\b[^>]*\brel\s*=\s*(["'])[^"']*\bstylesheet\b[^"']*\1[^>]*>/gi, (tag) => {
    const href = String(tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2] || '').trim();
    const resource = findResource(resources, href, resourceBase);
    if (!resource || !isCssResource(resource)) return '';
    const css = resolveStylesheetResources(
      Buffer.from(resource.bytes).toString('utf8'),
      resource.path,
      resources,
      resourceBase,
      new Set<string>(),
      false,
    );
    return `<style data-pixflow-source-href="${escapeAttribute(href)}">${css}</style>`;
  });
}

function findResource(resources: Map<string, HtmlToBricksSourceResource>, value: string, resourceBase: string, containingPath = ''): HtmlToBricksSourceResource | undefined {
  const nextImageResource = findNextImageSourceResource(resources, value);
  if (nextImageResource) return nextImageResource;
  const reference = value.split(/[?#]/)[0] || '';
  if (!reference || /^(?:data:|blob:|#|https?:|\/\/)/i.test(reference)) return undefined;
  const candidates = [
    normalizeRelativePath(path.posix.join(path.posix.dirname(normalizeRelativePath(containingPath)), reference)),
    normalizeRelativePath(path.posix.join(normalizeRelativePath(resourceBase), reference)),
    normalizeRelativePath(reference),
  ];
  return candidates.map((candidate) => resources.get(candidate)).find(Boolean);
}

function findNextImageSourceResource(
  resources: Map<string, HtmlToBricksSourceResource>,
  value: string,
): HtmlToBricksSourceResource | undefined {
  const raw = value.replace(/&amp;/gi, '&');
  if (!/^\/?_next\/image(?:\?|$)/i.test(raw)) return undefined;
  let sourcePath = '';
  try {
    sourcePath = new URL(raw, 'https://pixflow.invalid').searchParams.get('url') || '';
  } catch {
    return undefined;
  }
  const normalized = normalizeRelativePath(sourcePath.split(/[?#]/)[0] || '');
  if (!normalized) return undefined;
  const exact = resources.get(normalized);
  if (exact) return exact;
  const suffix = `/${normalized}`.toLowerCase();
  const matches = [...new Set(resources.values())].filter((resource) => (
    `/${normalizeRelativePath(resource.path)}`.toLowerCase().endsWith(suffix)
  ));
  if (matches.length === 1) return matches[0];
  const basename = path.posix.basename(normalized).toLowerCase();
  const basenameMatches = [...new Set(resources.values())].filter((resource) => (
    path.posix.basename(normalizeRelativePath(resource.path)).toLowerCase() === basename
  ));
  return basenameMatches.length === 1 ? basenameMatches[0] : undefined;
}

function resolveStylesheetResources(
  css: string,
  stylesheetPath: string,
  resources: Map<string, HtmlToBricksSourceResource>,
  resourceBase: string,
  seen = new Set<string>(),
  inlineAssets = true,
): string {
  const withImports = css.replace(/@import\s+(?:url\(\s*)?["']?([^"')\s]+)["']?\s*\)?\s*([^;]*);/gi, (statement, reference: string, media: string) => {
    const resource = findResource(resources, reference, resourceBase, stylesheetPath);
    if (!resource || !isCssResource(resource)) return `/* Pixflow blocked unresolved CSS import: ${statement.replace(/\*\//g, '* /')} */`;
    const key = normalizeRelativePath(resource.path);
    if (seen.has(key)) return `/* Pixflow blocked recursive CSS import: ${key} */`;
    const nextSeen = new Set(seen).add(key);
    const imported = resolveStylesheetResources(Buffer.from(resource.bytes).toString('utf8'), resource.path, resources, resourceBase, nextSeen, inlineAssets);
    return media.trim() ? `@media ${media.trim()} {\n${imported}\n}` : imported;
  });
  return withImports.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (statement, _quote: string, reference: string) => {
    const value = reference.trim();
    if (/^(?:data:|blob:|#|https?:|\/\/)/i.test(value)) return statement;
    const resource = findResource(resources, value, resourceBase, stylesheetPath);
    if (!resource || isCssResource(resource)) return statement;
    // Once an imported stylesheet is embedded into the canonical HTML, its
    // relative URL no longer has the stylesheet's original directory as a
    // browser base. Rebase it to the declared bundle path so downstream media
    // import can resolve the exact local resource instead of manufacturing an
    // invalid `http://../...` URL.
    if (!inlineAssets) return `url("${normalizeRelativePath(resource.path)}")`;
    return `url("data:${resource.mimeType};base64,${Buffer.from(resource.bytes).toString('base64')}")`;
  });
}

function collectSourceDeclaredRemoteFontUrls(css: string): string[] {
  const urls: string[] = [];
  for (const match of css.matchAll(/@font-face\s*\{[\s\S]*?\}/gi)) {
    const block = match[0];
    for (const urlMatch of block.matchAll(/url\(\s*(["']?)(https?:\/\/[^"')\s]+)\1\s*\)/gi)) {
      const value = urlMatch[2];
      if (!value) continue;
      try {
        const parsed = new URL(value);
        if (!/\.(?:woff2?|ttf|otf|eot)$/i.test(parsed.pathname)) continue;
        urls.push(parsed.href);
      } catch {}
    }
  }
  return uniqueStrings(urls).slice(0, 32);
}

function assertSafeRelativePath(value: string, label: string): string {
  const raw = String(value || '').replace(/\\/g, '/').trim();
  if (!raw || raw.startsWith('/') || /^[a-z]:\//i.test(raw) || raw.split('/').includes('..')) {
    throw new Error(`HTML source manifest ${label} path is unsafe: ${value}`);
  }
  return normalizeRelativePath(raw);
}
function normalizeRelativePath(value: string): string { return String(value || '').replace(/\\/g, '/').replace(/^\.?\/+/, '').split('/').filter((part) => part && part !== '.').join('/'); }
function sha256(value: Uint8Array): string { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function uniqueStrings(values: string[]): string[] { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }
function escapeAttribute(value: string): string { return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
