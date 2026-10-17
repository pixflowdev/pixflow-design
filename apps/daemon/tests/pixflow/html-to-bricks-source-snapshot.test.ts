import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { resolvePixflowCaptureBrowser } from '../../src/pixflow/browser-screenshot.js';

import {
  classifyHtmlToBricksScripts,
  prepareHtmlToBricksSourceSnapshot,
  validateHtmlToBricksSourceManifest,
} from '../../src/pixflow/html-to-bricks-source-snapshot.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

async function temporaryWorkspace(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-source-snapshot-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

const capture = async ({ viewports }: Parameters<NonNullable<Parameters<typeof prepareHtmlToBricksSourceSnapshot>[0]['capture']>>[0]) => viewports.map((viewport) => ({
  viewport,
  document: { width: viewport.width, height: 1200 },
  variables: { '--accent': '#e63946' },
  nodes: [{ sourceNodeId: 'pf-source-00001', rect: { x: 0, y: 0, width: viewport.width, height: 1200 } }],
  interactions: [{ sourceNodeId: 'pf-source-00001', kind: 'css-animation', name: 'pulse' }],
  frozenBodyHtml: '<main data-pf-source-id="pf-source-00001"><form action="/submit"><img src="images/dot.svg"></form></main>',
  render: { status: 'complete' as const, visibleElementCount: 1, visibleTextLength: 8 },
  staticReplay: { compared: true, matched: true, differenceRatio: 0 },
  screenshot: Buffer.from(`png-${viewport.id}`),
}));

describe('HTML to Bricks source snapshot', () => {
  it('allows only source-declared remote font files during sandbox capture', async () => {
    const workspaceDir = await temporaryWorkspace();
    let allowedExternalAssetUrls: string[] | undefined;
    const fontUrl = 'https://static.example.test/fonts/source-variable.woff2?v=4';
    await prepareHtmlToBricksSourceSnapshot({
      html: `<!doctype html><html><head><style>
        @font-face { font-family: "Source Face"; src: url("${fontUrl}") format("woff2"); font-weight: 300 800; }
        .hero { background-image: url("https://tracking.example.test/pixel.png"); }
      </style></head><body><main class="hero">Visible</main></body></html>`,
      workspaceDir,
      sourceId: 'remote-font-capture-fixture',
      canonicalPath: 'index.html',
      inputKind: 'single_document',
      selectionReason: 'fixture',
      resourceBase: '.',
      capture: async (input) => {
        allowedExternalAssetUrls = input.allowedExternalAssetUrls;
        return capture(input);
      },
    });

    expect(allowedExternalAssetUrls).toEqual([fontUrl]);
  });

  it('materialises a document bundle and captures immutable responsive evidence', async () => {
    const workspaceDir = await temporaryWorkspace();
    let sandboxHtml = '';
    const result = await prepareHtmlToBricksSourceSnapshot({
      html: '<!doctype html><html><head><link rel="stylesheet" href="styles/main.css"><script>fetch("/private")</script></head><body><main onclick="go()"><form action="/submit"><img src="images/dot.svg"></form></main></body></html>',
      workspaceDir,
      sourceId: 'fixture',
      runId: 'run-fixture',
      canonicalPath: 'bundle/index.html',
      inputKind: 'document_bundle',
      selectionReason: 'user_selected_complete_document',
      resourceBase: 'bundle',
      resources: [
        { path: 'bundle/styles/main.css', role: 'stylesheet', mimeType: 'text/css', bytes: Buffer.from('@import "./tokens.css"; main::before{content:"";background:url(../images/dot.svg)} @keyframes pulse{to{opacity:.5}}') },
        { path: 'bundle/styles/tokens.css', role: 'stylesheet', mimeType: 'text/css', bytes: Buffer.from(':root{--accent:#e63946} main{display:grid;color:var(--accent)}') },
        { path: 'bundle/images/dot.svg', role: 'image', mimeType: 'image/svg+xml', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') },
      ],
      capture: async (input) => {
        sandboxHtml = input.html;
        return capture(input);
      },
    });

    expect(result.html).not.toContain('data-pf-source-id="pf-source-00001"');
    expect(sandboxHtml).toContain('data-pf-source-id="pf-source-00001"');
    expect(result.html).not.toContain('<script');
    expect(result.html).not.toContain('onclick=');
    expect(result.html).toContain('action="/submit"');
    expect(result.html).not.toContain('data-pixflow-submit-blocked');
    expect(sandboxHtml).toContain('data-pixflow-submit-blocked="true"');
    expect(sandboxHtml).toContain('inert=""');
    expect(sandboxHtml).toContain('aria-disabled="true"');
    expect(sandboxHtml).not.toContain('action="/submit"');
    expect(sandboxHtml).not.toContain('method="post"');
    expect(result.html).toContain('src="images/dot.svg"');
    expect(result.html).not.toContain('src="data:image/svg+xml;base64,');
    expect(result.html).toContain('url("bundle/images/dot.svg")');
    expect(result.manifest.schema).toBe('pixflow.html_to_bricks.source_manifest.v1');
    expect(result.manifest.canonicalHtml.resolvedPath).toBe('source-evidence/canonical-input.html');
    expect(result.manifest.files).toHaveLength(4);
    expect(result.manifest.viewports.map(({ width }) => width)).toEqual([1440, 992, 390]);
    expect(result.manifest.evidence.computedStyles).toHaveLength(3);
    expect(result.manifest.evidence.screenshots).toHaveLength(3);
    expect(result.manifest.evidence.runtimeAudit).toMatchObject({ role: 'evidence' });
    expect(result.manifest.evidence.hydratedDom).toMatchObject({ role: 'evidence' });
    expect(result.manifest.runtimeAudit).toMatchObject({
      mode: 'safe_hydration_then_static_replay',
      sourceRenderStatus: 'complete',
      agentReview: 'not_required',
    });
    expect(result.manifest.runtimeAudit.scripts).toEqual(expect.arrayContaining([
      expect.objectContaining({ disposition: 'application', executedDuringCapture: false }),
    ]));
    expect(result.manifest.capabilities.every(({ status }) => status === 'completed')).toBe(true);

    const resolvedCss = await fs.readFile(path.join(workspaceDir, result.manifest.evidence.resolvedStylesheet.resolvedPath), 'utf8');
    expect(resolvedCss).toContain('--accent:#e63946');
    expect(resolvedCss).toContain('@keyframes pulse');
    expect(resolvedCss).toContain('data:image/svg+xml;base64,');
    await validateHtmlToBricksSourceManifest(workspaceDir, result.manifest);
  });

  it('stops before capture when a saved-page stylesheet imports missing local CSS', async () => {
    await expect(prepareHtmlToBricksSourceSnapshot({
      html: '<!doctype html><html><head><link rel="stylesheet" href="assets/style.css"></head><body><main>Visible</main></body></html>',
      workspaceDir: await temporaryWorkspace(),
      sourceId: 'missing-css-import-fixture',
      canonicalPath: 'index.html',
      inputKind: 'document_bundle',
      selectionReason: 'fixture',
      resourceBase: '.',
      resources: [{
        path: 'assets/style.css',
        role: 'stylesheet',
        mimeType: 'text/css',
        bytes: Buffer.from('@import url(css/theme.css); main { color: red; }'),
      }],
      capture,
    })).rejects.toThrow('HTML_SOURCE_BUNDLE_INCOMPLETE: missing local stylesheet "css/theme.css" referenced by "assets/style.css"');
  });

  it('stops before capture when saved-page markup references a missing local image', async () => {
    await expect(prepareHtmlToBricksSourceSnapshot({
      html: '<!doctype html><html><body><main><img src="assets/missing-card" alt="Card"></main></body></html>',
      workspaceDir: await temporaryWorkspace(),
      sourceId: 'missing-image-fixture',
      canonicalPath: 'index.html',
      inputKind: 'document_bundle',
      selectionReason: 'fixture',
      resourceBase: '.',
      resources: [],
      capture,
    })).rejects.toThrow('HTML_SOURCE_BUNDLE_INCOMPLETE: missing local image "assets/missing-card" referenced by "index.html"');
  });

  it('does not treat an encoded CSS fragment URL as a missing bundle asset', async () => {
    const result = await prepareHtmlToBricksSourceSnapshot({
      html: '<!doctype html><html><head><link rel="stylesheet" href="assets/style.css"></head><body><main>Visible</main></body></html>',
      workspaceDir: await temporaryWorkspace(),
      sourceId: 'encoded-fragment-fixture',
      canonicalPath: 'index.html',
      inputKind: 'document_bundle',
      selectionReason: 'fixture',
      resourceBase: '.',
      resources: [{
        path: 'assets/style.css',
        role: 'stylesheet',
        mimeType: 'text/css',
        bytes: Buffer.from('.mask { filter: url(%23n); }'),
      }],
      capture,
    });

    expect(result.manifest.sourceId).toBe('encoded-fragment-fixture');
  });

  it('resolves a saved Next image optimizer URL to its bundled source image', async () => {
    const result = await prepareHtmlToBricksSourceSnapshot({
      html: '<!doctype html><html><body><main><img src="/_next/image?url=%2Fchatnoir.png&w=32&q=75" alt="Avatar"></main></body></html>',
      workspaceDir: await temporaryWorkspace(),
      sourceId: 'next-image-fixture',
      canonicalPath: 'Unlumen.html',
      inputKind: 'document_bundle',
      selectionReason: 'fixture',
      resourceBase: '.',
      resources: [{
        path: 'Unlumen_files/chatnoir.png',
        role: 'image',
        mimeType: 'image/png',
        bytes: Buffer.from('png-fixture'),
      }],
      capture,
    });

    expect(result.html).toContain('/_next/image?url=%2Fchatnoir.png&w=32&q=75');
  });

  it('classifies capture hydration, visual behaviour, application code, and unknown remote scripts before execution', () => {
    const scripts = classifyHtmlToBricksScripts({
      html: `<!doctype html><html><body>
        <script src="assets/runtime.js"></script>
        <script src="assets/gsap.min.js"></script>
        <script>gsap.to('.hero', { opacity: 1 }); ScrollTrigger.create({ trigger: '.hero' });</script>
        <script>window.Intercom('boot'); fetch('/api/chat');</script>
        <script src="https://unknown.example/widget.js"></script>
      </body></html>`,
      resourceBase: 'bundle',
      canonicalPath: 'bundle/index.html',
      resources: [
        { path: 'bundle/assets/runtime.js', role: 'script', mimeType: 'text/javascript', bytes: Buffer.from('self.webpackChunk_N_E=[]; document.body.dataset.hydrated="true";') },
        { path: 'bundle/assets/gsap.min.js', role: 'script', mimeType: 'text/javascript', bytes: Buffer.from('/*! GSAP */ window.gsap={to:function(){}};') },
      ],
    });

    expect(scripts.map(({ disposition }) => disposition)).toEqual([
      'capture_only',
      'capture_only',
      'visual_behavior',
      'application',
      'blocked',
    ]);
    expect(scripts[1]).toMatchObject({ libraries: ['gsap'], finalStrategy: 'library' });
    expect(scripts[2]).toMatchObject({ libraries: ['gsap', 'gsap-scrolltrigger'], finalStrategy: 'library', retainForConversion: true });
    expect(scripts[3]).toMatchObject({ executedDuringCapture: false, retainForConversion: false });
  });

  it('does not mistake a site folder named CRISP for the Crisp chat application', () => {
    const scripts = classifyHtmlToBricksScripts({
      html: '<!doctype html><html><body><script src="CRISPmtl_files/gsap.min.js.download"></script></body></html>',
      resourceBase: '.',
      canonicalPath: 'CRISPmtl.html',
      resources: [{
        path: 'CRISPmtl_files/gsap.min.js.download',
        role: 'script',
        mimeType: 'text/javascript',
        bytes: Buffer.from('/*! GSAP */ window.gsap={to:function(){}};'),
      }],
    });

    expect(scripts[0]).toMatchObject({
      disposition: 'capture_only',
      reasonCodes: ['visual_library_provider'],
      executedDuringCapture: true,
    });
  });

  it('allows a declared local jQuery runtime during capture without shipping it to Bricks', () => {
    const scripts = classifyHtmlToBricksScripts({
      html: '<!doctype html><html><body><script src="assets/jquery.min.js"></script></body></html>',
      resourceBase: 'bundle',
      canonicalPath: 'bundle/index.html',
      resources: [{
        path: 'bundle/assets/jquery.min.js',
        role: 'script',
        mimeType: 'text/javascript',
        bytes: Buffer.from('/*! jQuery */ window.jQuery=window.$=function(){}; XMLHttpRequest=function(){};'),
      }],
    });

    expect(scripts[0]).toMatchObject({
      disposition: 'capture_only',
      reasonCodes: ['capture_dependency_provider'],
      executedDuringCapture: true,
      retainForConversion: false,
    });
  });

  it('does not promote framework chunks or security challenge bootstraps into final-page JavaScript', () => {
    const scripts = classifyHtmlToBricksScripts({
      html: `<!doctype html><html><body>
        <script src="assets/visual-chunk.js"></script>
        <script>(function(){var frame=document.createElement('iframe');frame.style.visibility='hidden';window.__CF$cv$params={};frame.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.body.appendChild(frame)})();</script>
        <script>document.querySelector('.menu').addEventListener('click', () => document.body.classList.toggle('menu-open'));</script>
      </body></html>`,
      resourceBase: 'bundle',
      canonicalPath: 'bundle/index.html',
      resources: [{
        path: 'bundle/assets/visual-chunk.js',
        role: 'script',
        mimeType: 'text/javascript',
        bytes: Buffer.from('(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push([123,t=>{document.body.classList.add("ready");addEventListener("click",()=>{})}]);'),
      }],
    });

    expect(scripts[0]).toMatchObject({
      disposition: 'capture_only',
      reasonCodes: ['framework_bundle_chunk'],
      retainForConversion: false,
      finalStrategy: 'none',
    });
    expect(scripts[1]).toMatchObject({
      disposition: 'application',
      reasonCodes: expect.arrayContaining(['security_or_challenge_runtime']),
      executedDuringCapture: false,
      retainForConversion: false,
    });
    expect(scripts[2]).toMatchObject({
      disposition: 'visual_behavior',
      retainForConversion: true,
      finalStrategy: 'pixflow_js',
    });
  });

  it('keeps an inlined runtime closing-script literal inside the capture script instead of leaking bundle text into the frozen DOM', async () => {
    const workspaceDir = await temporaryWorkspace();
    let captureHtml = '';
    const result = await prepareHtmlToBricksSourceSnapshot({
      html: `<!doctype html><html><head><script src="assets/runtime.js"></script></head><body>
        <main>Loading</main>
        <pre><code>const theme = { accent: "#f00" };</code></pre>
        <script>gsap.to("main", { opacity: 1 })</script>
      </body></html>`,
      workspaceDir,
      sourceId: 'runtime-closing-script-fixture',
      canonicalPath: 'bundle/index.html',
      inputKind: 'document_bundle',
      selectionReason: 'fixture',
      resourceBase: 'bundle',
      resources: [{
        path: 'bundle/assets/runtime.js',
        role: 'script',
        mimeType: 'text/javascript',
        bytes: Buffer.from('self.webpackChunk_N_E=[];const closing="</script><arguments>bundle{leak</arguments>";document.querySelector("main").innerHTML="<section>Ready</section>";'),
      }],
      capture: async (input) => {
        captureHtml = input.html;
        return input.viewports.map((viewport) => ({
          viewport,
          document: { width: viewport.width, height: 900 },
          variables: {},
          nodes: [{ sourceNodeId: 'pf-source-00001', tag: 'section', styles: { display: 'block' }, rect: { x: 0, y: 0, width: viewport.width, height: 200 } }],
          interactions: [],
          frozenBodyHtml: '<main data-pf-source-id="pf-source-00001"><section>Ready</section></main><pre><code>const theme = { accent: "#f00" };</code></pre>',
          render: { status: 'complete' as const, visibleElementCount: 3, visibleTextLength: 43 },
          staticReplay: { compared: true, matched: true, differenceRatio: 0 },
        }));
      },
    });

    expect(captureHtml).toContain('"<\\/script><arguments>bundle{leak</arguments>"');
    expect(captureHtml).not.toContain('"</script><arguments>bundle{leak</arguments>"');
    expect(result.html).not.toContain('<arguments>');
    expect(result.html).toContain('<pre><code>const theme = { accent: "#f00" };</code></pre>');
    expect(result.html).toContain('gsap.to');
  });

  it('recovers content left hidden after a completed Pace loader before rendered capture', async () => {
    const workspaceDir = await temporaryWorkspace();
    let captureHtml = '';
    await prepareHtmlToBricksSourceSnapshot({
      html: `<!doctype html><html><head></head><body class="home pace-done">
        <div class="pace pace-inactive"></div>
        <div id="main-container" style="opacity: 0; color: red"><main>Ready</main></div>
      </body></html>`,
      workspaceDir,
      sourceId: 'completed-loader-fixture',
      canonicalPath: 'index.html',
      inputKind: 'single_document',
      selectionReason: 'fixture',
      resourceBase: '.',
      capture: async (input) => {
        captureHtml = input.html;
        return input.viewports.map((viewport) => ({
          viewport,
          document: { width: viewport.width, height: 900 },
          variables: {},
          nodes: [{ sourceNodeId: 'pf-source-00001', tag: 'main', styles: { display: 'block' }, rect: { x: 0, y: 0, width: viewport.width, height: 200 } }],
          interactions: [],
          frozenBodyHtml: '<div id="main-container" style="color: red"><main data-pf-source-id="pf-source-00001">Ready</main></div>',
          render: { status: 'complete' as const, visibleElementCount: 2, visibleTextLength: 5 },
          staticReplay: { compared: true, matched: true, differenceRatio: 0 },
        }));
      },
    });

    expect(captureHtml).toContain('id="main-container"');
    expect(captureHtml).toContain('color: red');
    expect(captureHtml).not.toMatch(/id="main-container"[^>]*opacity\s*:\s*0/i);
  });

  it('converts the frozen hydrated DOM and retains only bounded visual behaviour code', async () => {
    const workspaceDir = await temporaryWorkspace();
    const result = await prepareHtmlToBricksSourceSnapshot({
      html: '<!doctype html><html><head><script src="assets/runtime.js"></script></head><body><main>Loading</main><script>gsap.to(".hero", {opacity: 1})</script><script>fetch("/api/chat")</script></body></html>',
      workspaceDir,
      sourceId: 'hydrated-fixture',
      canonicalPath: 'bundle/index.html',
      inputKind: 'document_bundle',
      selectionReason: 'fixture',
      resourceBase: 'bundle',
      resources: [
        { path: 'bundle/assets/runtime.js', role: 'script', mimeType: 'text/javascript', bytes: Buffer.from('document.querySelector("main").innerHTML="<section class=hero>Ready</section>"') },
      ],
      capture: async ({ viewports }) => viewports.map((viewport) => ({
        viewport,
        document: { width: viewport.width, height: 900 },
        variables: {},
        nodes: [{ sourceNodeId: 'pf-source-00001', tag: 'section', styles: { display: 'block' }, rect: { x: 0, y: 0, width: viewport.width, height: 200 } }],
        interactions: [],
        frozenBodyHtml: '<main data-pf-source-id="pf-source-00001"><section class="hero">Ready</section></main>',
        render: { status: 'complete', visibleElementCount: 2, visibleTextLength: 5 },
        staticReplay: { compared: true, matched: true, differenceRatio: 0 },
      })),
    });

    expect(result.html).toContain('<section class="hero">Ready</section>');
    expect(result.html).toContain('gsap.to');
    expect(result.html).not.toContain('runtime.js');
    expect(result.html).not.toContain('fetch("/api/chat")');
    expect(result.manifest.runtimeAudit.scripts).toEqual(expect.arrayContaining([
      expect.objectContaining({ disposition: 'capture_only', retainForConversion: false }),
      expect.objectContaining({ disposition: 'visual_behavior', retainForConversion: true }),
      expect.objectContaining({ disposition: 'application', retainForConversion: false }),
    ]));
  });

  it('stops before conversion when the hydrated source render is blank or incomplete', async () => {
    await expect(prepareHtmlToBricksSourceSnapshot({
      html: '<!doctype html><html><body><main>Loading</main></body></html>',
      workspaceDir: await temporaryWorkspace(),
      sourceId: 'blank-fixture',
      canonicalPath: 'index.html',
      inputKind: 'single_document',
      selectionReason: 'fixture',
      resourceBase: '.',
      capture: async ({ viewports }) => viewports.map((viewport) => ({
        viewport,
        document: { width: viewport.width, height: 0 },
        variables: {},
        nodes: [],
        interactions: [],
        frozenBodyHtml: '',
        render: { status: 'incomplete', visibleElementCount: 0, visibleTextLength: 0 },
        staticReplay: { compared: false, matched: false },
      })),
    })).rejects.toThrow('HTML_SOURCE_RENDER_INCOMPLETE');
  });

  it('stops before conversion when any required static replay was not recorded', async () => {
    await expect(prepareHtmlToBricksSourceSnapshot({
      html: '<!doctype html><html><body><main>Visible</main></body></html>',
      workspaceDir: await temporaryWorkspace(),
      sourceId: 'missing-replay-fixture',
      canonicalPath: 'index.html',
      inputKind: 'single_document',
      selectionReason: 'fixture',
      resourceBase: '.',
      capture: async ({ viewports }) => viewports.map((viewport, index) => ({
        viewport,
        document: { width: viewport.width, height: 200 },
        variables: {},
        nodes: [{ sourceNodeId: 'pf-source-00001' }],
        interactions: [],
        frozenBodyHtml: '<main data-pf-source-id="pf-source-00001">Visible</main>',
        render: { status: 'complete', visibleElementCount: 1, visibleTextLength: 7 },
        staticReplay: { compared: index !== 1, matched: index !== 1, differenceRatio: 0 },
      })),
    })).rejects.toThrow('static replay was not recorded for every required viewport');
  });

  it('captures browser-authoritative matched-rule and winning-cascade evidence', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const workspaceDir = await temporaryWorkspace();
    const result = await prepareHtmlToBricksSourceSnapshot({
      html: `<!doctype html><html><head><style>
        .html-last { color: rgb(180, 0, 0); }
        .css-last { color: rgb(0, 20, 180); }
        .css-last, .shared { margin-left: 13px; }
        body .css-last { font-size: 31px; }
        .wrapper > .css-last { padding-top: 7px; }
        @media (max-width: 500px) { body .css-last { font-size: 22px; } }
      </style></head><body><main class="wrapper"><h1 class="css-last html-last shared">Cascade</h1></main></body></html>`,
      workspaceDir,
      sourceId: 'browser-cascade-fixture',
      canonicalPath: 'index.html',
      inputKind: 'single_document',
      selectionReason: 'fixture',
      resourceBase: '.',
    });

    const evidence = await Promise.all(result.manifest.evidence.computedStyles.map(async (entry) => (
      JSON.parse(await fs.readFile(path.join(workspaceDir, entry.resolvedPath), 'utf8')) as {
        viewport: { id: string };
        nodes: Array<{
          tag: string;
          styles: Record<string, string>;
          authoredProperties?: string[];
          winningDeclarations?: Record<string, { value: string; computedValue: string; selector: string }>;
          matchedRules?: Array<{ selector: string }>;
        }>;
      }
    )));
    const baseHeading = evidence.find((entry) => entry.viewport.id === 'bricks_base')?.nodes.find((node) => node.tag === 'h1');
    const mobileHeading = evidence.find((entry) => entry.viewport.id === 'mobile')?.nodes.find((node) => node.tag === 'h1');
    expect(baseHeading?.styles).toMatchObject({
      color: 'rgb(0, 20, 180)',
      'font-size': '31px',
      'margin-left': '13px',
      'padding-top': '7px',
    });
    expect(mobileHeading?.styles['font-size']).toBe('22px');
    expect(baseHeading?.authoredProperties).toEqual(expect.arrayContaining(['color', 'font-size', 'margin-left', 'padding-top']));
    expect(baseHeading?.winningDeclarations).toMatchObject({
      color: { value: 'rgb(0, 20, 180)', computedValue: 'rgb(0, 20, 180)', selector: '.css-last' },
      'font-size': { value: '31px', computedValue: '31px', selector: 'body .css-last' },
      'margin-left': { value: '13px', computedValue: '13px', selector: expect.stringMatching(/^\.(?:css-last|shared)$/) },
      'padding-top': { value: '7px', computedValue: '7px', selector: '.wrapper > .css-last' },
    });
    expect(baseHeading?.matchedRules?.map((rule) => rule.selector)).toEqual(expect.arrayContaining([
      '.css-last',
      '.css-last, .shared',
      'body .css-last',
      '.wrapper > .css-last',
    ]));
  }, 30_000);

  it('waits for finite layout animation to settle before recording converter geometry', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const workspaceDir = await temporaryWorkspace();
    const result = await prepareHtmlToBricksSourceSnapshot({
      html: `<!doctype html><html><head><style>
        html, body { margin: 0; }
        #hero { width: 100%; height: 100px; }
      </style></head><body>
        <section id="hero" style="max-width: 66%; margin: 64px auto">Animated layout</section>
        <script>
          const hero = document.querySelector('#hero');
          setTimeout(() => {
            hero.style.maxWidth = '880px';
            hero.style.marginTop = '52px';
            hero.style.marginBottom = '52px';
          }, 750);
        </script>
      </body></html>`,
      workspaceDir,
      sourceId: 'settled-layout-fixture',
      canonicalPath: 'index.html',
      inputKind: 'single_document',
      selectionReason: 'fixture',
      resourceBase: '.',
    });

    const baseEvidenceFile = result.manifest.evidence.computedStyles.find((entry) => entry.path.includes('bricks_base'));
    expect(baseEvidenceFile).toBeDefined();
    const baseEvidence = JSON.parse(await fs.readFile(path.join(workspaceDir, baseEvidenceFile!.resolvedPath), 'utf8')) as {
      nodes: Array<{
        selector: string;
        rect: { width: number };
        styles: Record<string, string>;
        winningDeclarations?: Record<string, { value: string; computedValue: string; selector: string }>;
      }>;
    };
    const hero = baseEvidence.nodes.find((node) => node.selector === '#hero');
    expect(hero?.rect.width).toBeCloseTo(880, 0);
    expect(hero?.styles).toMatchObject({
      'margin-top': '52px',
      'margin-bottom': '52px',
      'max-width': '880px',
    });
    expect(hero?.winningDeclarations).toMatchObject({
      'max-width': { value: '880px', computedValue: '880px', selector: '<inline style>' },
    });
  }, 30_000);

  it('restores stylesheet-owned layout when saved HTML contains a scroll-animation frame', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const workspaceDir = await temporaryWorkspace();
    const result = await prepareHtmlToBricksSourceSnapshot({
      html: `<!doctype html><html><head><style>
        html, body { margin: 0; }
        .cta { width: 100%; max-width: 880px; margin: 52px auto; }
        @media (prefers-reduced-motion: reduce) {
          .cta { max-width: 100%; margin: 0; border-radius: 0; }
        }
      </style></head><body>
        <section id="cta" class="cta" data-scroll="bg" style="max-width: 66.7716%; margin-top: 64px; margin-bottom: 64px; border-radius: 24px">Saved mid-scroll</section>
      </body></html>`,
      workspaceDir,
      sourceId: 'saved-scroll-frame-fixture',
      canonicalPath: 'index.html',
      inputKind: 'single_document',
      selectionReason: 'fixture',
      resourceBase: '.',
    });

    const baseEvidenceFile = result.manifest.evidence.computedStyles.find((entry) => entry.path.includes('bricks_base'));
    expect(baseEvidenceFile).toBeDefined();
    const baseEvidence = JSON.parse(await fs.readFile(path.join(workspaceDir, baseEvidenceFile!.resolvedPath), 'utf8')) as {
      nodes: Array<{
        selector: string;
        rect: { width: number };
        styles: Record<string, string>;
        winningDeclarations?: Record<string, { value: string; computedValue: string; selector: string }>;
      }>;
    };
    const cta = baseEvidence.nodes.find((node) => node.selector === '#cta');
    expect(cta?.rect.width).toBeCloseTo(880, 0);
    expect(cta?.styles).toMatchObject({
      'margin-top': '52px',
      'margin-bottom': '52px',
      'max-width': '880px',
      'border-top-left-radius': '24px',
    });
    expect(cta?.winningDeclarations).toMatchObject({
      'max-width': { value: '880px', computedValue: '880px', selector: '.cta' },
      'border-top-left-radius': { value: '24px', selector: '<inline style>' },
    });
  }, 30_000);

  it('rejects stale hashes and escaping bundle paths before conversion', async () => {
    const workspaceDir = await temporaryWorkspace();
    const result = await prepareHtmlToBricksSourceSnapshot({
      html: '<!doctype html><html><body><main>Safe</main></body></html>',
      workspaceDir,
      sourceId: 'fixture',
      canonicalPath: 'index.html',
      inputKind: 'single_document',
      selectionReason: 'only_complete_document',
      resourceBase: '.',
      capture,
    });
    await fs.writeFile(path.join(workspaceDir, result.manifest.evidence.sanitizedDom.resolvedPath), 'changed', 'utf8');
    await expect(validateHtmlToBricksSourceManifest(workspaceDir, result.manifest)).rejects.toThrow('changed after capture');

    await expect(prepareHtmlToBricksSourceSnapshot({
      html: '<!doctype html><html><body><main>Unsafe</main></body></html>',
      workspaceDir: await temporaryWorkspace(),
      sourceId: 'unsafe',
      canonicalPath: 'index.html',
      inputKind: 'document_bundle',
      selectionReason: 'fixture',
      resourceBase: '.',
      resources: [{ path: '../secret.css', role: 'stylesheet', mimeType: 'text/css', bytes: Buffer.from('body{}') }],
      capture,
    })).rejects.toThrow('path is unsafe');
  });

  it('owns its source boundary without Website Clone runtime dependencies', async () => {
    const source = await fs.readFile(new URL('../../src/pixflow/html-to-bricks-source-snapshot.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/website[- ]clone|RECON\/|NOTES\.md/i);
  });
});
