import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { createServer } from 'node:http';
import {
  formatPixflowBuildInBricksThemeStylePreviewCss,
  normalizePixflowBuildInBricksThemeStyleContext,
} from '@open-design/contracts';

import {
  buildPixflowBrowserScreenshotArgs,
  capturePixflowBrowserScreenshots,
  comparePixflowDomSnapshots,
  comparePixflowScreenshotBuffers,
  resolvePixflowCaptureBrowser,
} from '../../src/pixflow/browser-screenshot.js';
import type { PixflowDomFidelitySnapshot } from '../../src/pixflow/browser-screenshot.js';

describe('Pixflow browser screenshot capture', () => {
  it('measures visible placeholders without exposing entered values or hidden placeholders', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) { context.skip(); return; }
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<style>input,textarea{background:white}::placeholder{color:rgba(0,0,0,.35);opacity:1}#faded::placeholder{opacity:.5}</style>
        <input id="empty" placeholder="Your name"><textarea placeholder="Your message"></textarea>
        <input id="filled" placeholder="Hidden hint" value="Private entered value">
        <input id="hidden" style="display:none" placeholder="Invisible hint">
        <input id="faded" placeholder="Faded hint">`);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing fixture port');
      const result = await capturePixflowBrowserScreenshots({ url: `http://127.0.0.1:${address.port}`,
        viewports: [{ id: 'mobile', width: 390, height: 680 }], waitMs: 0 });
      expect(result.errors).toEqual([]);
      const samples = result.captures[0]?.layout?.typography?.documentSamples ?? [];
      expect(samples).toEqual(expect.arrayContaining([
        expect.objectContaining({ selector: 'input#empty::placeholder', text: 'Your name',
          contrast: expect.objectContaining({ ratio: expect.any(Number) }) }),
        expect.objectContaining({ selector: 'textarea::placeholder', text: 'Your message' }),
        expect.objectContaining({ selector: 'input#faded::placeholder',
          contrast: { ratio: null, reason: 'compositing-effects' } }),
      ]));
      expect(samples.find(sample => sample.selector === 'input#empty::placeholder')?.contrast?.ratio).toBeLessThan(3);
      expect(samples.some(sample => /Private entered|Hidden hint|Invisible hint/.test(sample.text))).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }, 30000);

  it('captures an explicitly opened menu rather than the initial hidden state', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) { context.skip(); return; }
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end('<!doctype html><body><h2>Only section heading</h2><button id="open" onclick="document.getElementById(\'menu\').hidden=false">Open menu</button><nav id="menu" hidden><a href="#child">Child page</a></nav><section style="margin-top:1000px;background:rgb(61,86,72)"><div style="color:rgb(57,54,61);font-size:13px">Later native badge</div></section></body>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing fixture port');
      const result = await capturePixflowBrowserScreenshots({
        url: `http://127.0.0.1:${address.port}`,
        viewports: [{ id: 'menu-open', width: 390, height: 680, actions: [{ type: 'click', selector: '#open' }] }],
        waitMs: 0,
      });
      expect(result.errors).toEqual([]);
      expect(result.captures[0]?.layout?.headings).toEqual([{ level: 2, selector: 'h2', text: 'Only section heading' }]);
      expect(result.captures[0]?.layout?.typography?.samples).toEqual(expect.arrayContaining([
        expect.objectContaining({ text: 'Child page' }),
      ]));
      expect(result.captures[0]?.layout?.typography?.documentSamples).toEqual(expect.arrayContaining([
        expect.objectContaining({ text: 'Later native badge', color: 'rgb(57, 54, 61)', inViewport: false,
          contrast: expect.objectContaining({ ratio: expect.any(Number), background: [61, 86, 72] }),
          backgroundLayers: expect.arrayContaining([expect.objectContaining({ color: 'rgb(61, 86, 72)' })]) }),
      ]));
      expect(result.captures[0]?.layout?.typography?.documentTruncated).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }, 30000);

  it('prefers an explicitly configured browser executable', async () => {
    const checked: string[] = [];
    const resolved = await resolvePixflowCaptureBrowser({
      platform: 'win32',
      env: {
        OD_BROWSER_EXECUTABLE: 'D:\\Browsers\\chrome.exe',
        PROGRAMFILES: 'C:\\Program Files',
      },
      homeDir: 'C:\\Users\\test',
      canExecute: async (candidate) => {
        checked.push(candidate);
        return candidate === 'D:\\Browsers\\chrome.exe';
      },
    });

    expect(resolved).toBe('D:\\Browsers\\chrome.exe');
    expect(checked).toEqual(['D:\\Browsers\\chrome.exe']);
  });

  it('builds isolated deterministic headless capture arguments', () => {
    const args = buildPixflowBrowserScreenshotArgs({
      url: 'http://127.0.0.1:7456/api/projects/project/raw/index.html',
      viewport: { id: 'mobile', width: 390, height: 844 },
      screenshotPath: 'C:\\capture\\mobile.png',
      userDataDir: 'C:\\capture\\profile',
      waitMs: 1_500,
      platform: 'win32',
    });

    expect(args).toContain('--headless=new');
    expect(args).toContain('--window-size=390,844');
    expect(args).toContain('--virtual-time-budget=1500');
    expect(args).toContain('--user-data-dir=C:\\capture\\profile');
    expect(args).toContain('--screenshot=C:\\capture\\mobile.png');
    expect(args.at(-1)).toBe('http://127.0.0.1:7456/api/projects/project/raw/index.html');
  });

  it('rejects non-http capture targets before launching a browser', async () => {
    await expect(capturePixflowBrowserScreenshots({
      url: 'file:///C:/secret.html',
      viewports: [{ id: 'desktop', width: 1440, height: 1000 }],
    })).resolves.toMatchObject({
      ok: false,
      captures: [],
      errors: ['Visual capture only supports http and https URLs.'],
    });
  });

  it('rejects an HTTP error page instead of treating its body as visual evidence', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((_request, response) => {
      response.statusCode = 404;
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end('<!doctype html><body><main>A styled WordPress 404 page</main></body>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve HTTP error fixture port.');
      const result = await capturePixflowBrowserScreenshots({
        url: `http://127.0.0.1:${address.port}/fresh-bricks-page`,
        viewports: [{ id: 'desktop', width: 800, height: 500 }],
        waitMs: 10,
      });

      expect(result.captures).toEqual([]);
      expect(result.errors).toEqual([
        'desktop: Visual capture target returned HTTP 404.',
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('captures the requested CSS viewport instead of Chrome\'s minimum window width', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0;width:100%;height:100%;background:#00f}</style>
        <body><script>if (window.innerWidth === 390) document.documentElement.style.background = document.body.style.background = '#f00'</script>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve viewport fixture port.');
      const result = await capturePixflowBrowserScreenshots({
        url: `http://127.0.0.1:${address.port}/`,
        viewports: [{ id: 'mobile', width: 390, height: 300 }],
        waitMs: 100,
      });
      expect(result.errors).toEqual([]);
      expect(result.timings).toMatchObject({
        settleDurationMs: 100,
        comparisonDurationMs: 0,
      });
      expect(result.timings?.captureDurationMs).toBeGreaterThan(0);
      expect(result.timings?.totalDurationMs).toBeGreaterThanOrEqual(result.timings?.captureDurationMs || 0);
      const capture = result.captures[0];
      expect(capture).toBeDefined();
      const png = PNG.sync.read(Buffer.from(capture!.base64, 'base64'));
      const offset = (150 * png.width + 195) * 4;
      expect(Array.from(png.data.subarray(offset, offset + 3))).toEqual([255, 0, 0]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('audits source motion engines and user-visible interaction signals', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>@keyframes drift{to{transform:translateX(10px)}}.hero{width:300px;height:120px;animation:drift 2s infinite}</style>
        <body><section class="hero" data-w-id="hero-motion" data-animation-type="lottie"></section>
        <video autoplay muted></video><script>window.Webflow={require:function(){}}; /* gsap ScrollTrigger Lenis lottie */</script></body>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve interaction fixture port.');
      const result = await capturePixflowBrowserScreenshots({
        url: `http://127.0.0.1:${address.port}/`,
        viewports: [{ id: 'desktop', width: 800, height: 500 }],
        waitMs: 50,
      });
      const kinds = result.captures[0]?.interactionAudit?.signals.map((signal) => signal.kind) || [];
      expect(kinds).toEqual(expect.arrayContaining([
        'webflow-ix2', 'lottie', 'gsap', 'scroll-trigger', 'lenis', 'css-animation', 'autoplay-video',
      ]));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('applies Theme Style preview defaults only inside the render context and reports the snapshot identity', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0;width:100%;height:100%;background:#00f}</style><body><main>Theme defaults</main></body>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve Theme Style preview fixture port.');
      const result = await capturePixflowBrowserScreenshots({
        url: `http://127.0.0.1:${address.port}/`,
        viewports: [{ id: 'desktop', width: 800, height: 500 }],
        waitMs: 20,
        themeStylePreviewCss: 'body { background: #0f0 !important; }',
        themeStyleSnapshotHash: 'theme-snapshot-test',
      });
      expect(result.errors).toEqual([]);
      expect(result.themeStyleSnapshotHash).toBe('theme-snapshot-test');
      const capture = result.captures[0];
      expect(capture).toBeDefined();
      const png = PNG.sync.read(Buffer.from(capture!.base64, 'base64'));
      const offset = (100 * png.width + 100) * 4;
      expect(Array.from(png.data.subarray(offset, offset + 3))).toEqual([0, 255, 0]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('resolves render-only site variables while preserving authored overrides above inherited defaults', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0;width:100%;height:100%;background:#00f}.token-panel{width:200px;height:200px;background:var(--site-panel)}</style>
        <body><main><div class="token-panel">Site variable</div></main></body>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve render-environment fixture port.');
      const result = await capturePixflowBrowserScreenshots({
        url: `http://127.0.0.1:${address.port}/`,
        viewports: [{ id: 'desktop', width: 800, height: 500 }],
        waitMs: 20,
        themeStylePreviewCss: '@layer pixflow-render-environment { :root { --site-panel: #0f0; } body { background: #f00; } }',
        themeStyleSnapshotHash: 'render-environment-test',
      });
      expect(result.errors).toEqual([]);
      const capture = result.captures[0];
      expect(capture).toBeDefined();
      const png = PNG.sync.read(Buffer.from(capture!.base64, 'base64'));
      const panelOffset = (100 * png.width + 100) * 4;
      const bodyOffset = (300 * png.width + 400) * 4;
      expect(Array.from(png.data.subarray(panelOffset, panelOffset + 3))).toEqual([0, 255, 0]);
      expect(Array.from(png.data.subarray(bodyOffset, bodyOffset + 3))).toEqual([0, 0, 255]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('applies native container defaults to the converter-recognized inner container without widening the page main', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const themeStyle = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['site-style'],
      themeStyles: [{ id: 'site-style', settings: {
        container: {
          widthMax: '76rem',
          padding: { left: '3rem', right: '3rem' },
        },
      } }],
    });
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0}.page{width:100%}.caldera-container{box-sizing:border-box}</style>
        <main class="page"><section><div class="caldera-container"><h1>Field journal</h1></div></section></main>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve container fixture port.');
      const result = await capturePixflowBrowserScreenshots({
        url: `http://127.0.0.1:${address.port}/`,
        viewports: [{ id: 'bricks_base', width: 992, height: 500 }],
        waitMs: 20,
        themeStylePreviewCss: formatPixflowBuildInBricksThemeStylePreviewCss(themeStyle),
        themeStyleSnapshotHash: themeStyle.snapshotHash,
      });

      expect(result.errors).toEqual([]);
      expect(result.captures[0]?.layout?.horizontalOverflowPx).toBe(0);
      expect(result.captures[0]?.layout?.viewportEscapes).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('reproduces the Bricks destination baseline for Canonical Build layout evidence', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>.checkpoint-header{width:100%}.rem-probe{background:#f00;height:20px;width:3rem}</style>
        <header class="checkpoint-header"><div class="checkpoint-container"><div class="rem-probe"></div></div></header>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve destination baseline fixture port.');
      const request = {
        url: `http://127.0.0.1:${address.port}/`,
        viewports: [
          { id: 'bricks-base', width: 992, height: 500 },
          { id: 'mobile', width: 390, height: 500 },
        ],
        waitMs: 20,
        renderEnvironmentProfile: 'canonical-build-bricks' as const,
        themeStylePreviewCss: [
          '.checkpoint-header > .checkpoint-container { width: 100%; padding-inline: 3rem; }',
          '@media (max-width: 478px) { .checkpoint-header > .checkpoint-container { padding-inline: 1rem; } }',
        ].join('\n'),
        themeStyleSnapshotHash: 'theme-style-live-checkpoint-a',
      };

      const result = await capturePixflowBrowserScreenshots(request);

      expect(result.errors).toEqual([]);
      expect(result.captures.map((capture) => ({
        viewport: capture.viewport,
        documentWidth: capture.layout?.documentWidth,
        clientWidth: capture.layout?.clientWidth,
        overflow: capture.layout?.horizontalOverflowPx,
      }))).toEqual([
        { viewport: 'bricks-base', documentWidth: 992, clientWidth: 992, overflow: 0 },
        { viewport: 'mobile', documentWidth: 390, clientWidth: 390, overflow: 0 },
      ]);
      expect(result.renderEnvironment).toMatchObject({
        profile: 'canonical-build-bricks',
        owner: 'pixflow-renderer',
        destination: 'bricks',
        baseline: { id: 'pixflow.bricks.destination_baseline', revision: 'bricks-2.4-generic.1' },
      });
      for (const capture of result.captures) {
        expect(capture.renderEnvironment).toMatchObject({
          applied: true,
          computed: {
            rootFontSizePx: 10,
            rootBoxSizing: 'border-box',
            bodyMarginTopPx: 0,
            bodyMarginRightPx: 0,
            bodyMarginBottomPx: 0,
            bodyMarginLeftPx: 0,
          },
        });
      }

      const basePng = PNG.sync.read(Buffer.from(result.captures[0]!.base64, 'base64'));
      // The Theme Style adds 3rem (30px) of container padding. The 3rem probe
      // therefore occupies x=30..60 under the Bricks 10px rem basis.
      const insideThreeRem = (10 * basePng.width + 40) * 4;
      const outsideThreeRem = (10 * basePng.width + 70) * 4;
      expect(Array.from(basePng.data.subarray(insideThreeRem, insideThreeRem + 3))).toEqual([255, 0, 0]);
      expect(Array.from(basePng.data.subarray(outsideThreeRem, outsideThreeRem + 3))).not.toEqual([255, 0, 0]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('renders native Bricks responsive typography control keys at the actual breakpoint boundaries', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const themeStyle = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['native-responsive-typography'],
      breakpoints: [
        { key: 'desktop', label: 'Desktop', width: 1279, base: true },
        { key: 'tablet_portrait', label: 'Tablet portrait', width: 991, base: false },
        { key: 'mobile_portrait', label: 'Mobile portrait', width: 478, base: false },
      ],
      breakpointMode: { mobileFirst: false, baseKey: 'desktop' },
      themeStyles: [{ id: 'native-responsive-typography', settings: { typography: {
        typographyHeadingH1: {
          'font-family': 'Arial',
          'font-size': '4.5rem',
          'font-weight': '750',
          'line-height': '1.02',
          'letter-spacing': '-0.025em',
        },
        'typographyHeadingH1:tablet_portrait': { 'font-size': '3.25rem' },
        'typographyHeadingH1:mobile_portrait': { 'font-size': '2.25rem' },
      } } }],
    });
    const previewCss = formatPixflowBuildInBricksThemeStylePreviewCss(themeStyle);
    expect(previewCss).toContain('@media (max-width: 991px)');
    expect(previewCss).toContain('@media (max-width: 478px)');
    expect(previewCss).not.toMatch(/font-size:(?:tablet|mobile)_portrait/);

    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0;min-height:100%}h1{margin:0}</style>
        <h1>Native responsive typography</h1>
        <script>var probe = setInterval(function(){
          var actual = parseFloat(getComputedStyle(document.querySelector('h1')).fontSize);
          var expected = innerWidth <= 478 ? 22.5 : innerWidth <= 991 ? 32.5 : 45;
          document.body.style.background = Math.abs(actual - expected) < 0.1 ? '#00ff00' : '#ff0000';
        }, 10); setTimeout(function(){ clearInterval(probe); }, 500)</script>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve native typography fixture port.');
      const result = await capturePixflowBrowserScreenshots({
        url: `http://127.0.0.1:${address.port}/`,
        viewports: [
          { id: 'desktop', width: 1440, height: 300 },
          { id: 'boundary-above-tablet', width: 992, height: 300 },
          { id: 'tablet', width: 991, height: 300 },
          { id: 'mobile', width: 390, height: 300 },
        ],
        waitMs: 80,
        renderEnvironmentProfile: 'canonical-build-bricks',
        themeStylePreviewCss: previewCss,
        themeStyleSnapshotHash: themeStyle.snapshotHash,
      });

      expect(result.errors).toEqual([]);
      for (const capture of result.captures) {
        const png = PNG.sync.read(Buffer.from(capture.base64, 'base64'));
        const offset = (200 * png.width + 200) * 4;
        expect(Array.from(png.data.subarray(offset, offset + 3)), capture.viewport).toEqual([0, 255, 0]);
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('keeps explicit authored CSS above the renderer baseline and Theme Style layer', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
          body { background: #00f; }
          .ownership-probe { box-sizing: content-box; height: 20px; padding: 4px; width: 100px; }
          .ownership-button { background: #00f; border-radius: 4px; height: 80px; width: 120px; }
        </style>
        <div class="ownership-probe"></div><button class="ownership-button">Authored override</button>
        <script>setTimeout(function(){
          var box = getComputedStyle(document.querySelector('.ownership-probe'));
          var button = getComputedStyle(document.querySelector('.ownership-button'));
          document.body.style.background = box.boxSizing === 'content-box' && button.borderRadius === '4px' ? '#0f0' : '#f00';
        }, 20)</script>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve authored override fixture port.');
      const result = await capturePixflowBrowserScreenshots({
        url: `http://127.0.0.1:${address.port}/`,
        viewports: [{ id: 'desktop', width: 500, height: 400 }],
        waitMs: 80,
        renderEnvironmentProfile: 'canonical-build-bricks',
        themeStylePreviewCss: 'body { background: #f00; } .ownership-button { border-radius: 28px; }',
        themeStyleSnapshotHash: 'theme-style-authored-override',
      });

      expect(result.errors).toEqual([]);
      const png = PNG.sync.read(Buffer.from(result.captures[0]!.base64, 'base64'));
      const bodyOffset = (300 * png.width + 300) * 4;
      expect(Array.from(png.data.subarray(bodyOffset, bodyOffset + 3))).toEqual([0, 255, 0]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('emits bounded text-first layout and runtime evidence without requiring a screenshot consumer', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0}.overflow{width:430px;height:80px}.clip{width:100px;height:20px;overflow:hidden;white-space:nowrap}</style>
        <main><section class="overflow">Mobile overflow</section><p class="clip" data-pixflow-allow-overflow="true">This text is clipped intentionally for the fixture</p>
        <img src="/missing-image.png" alt="Missing evidence"><button aria-label=""> </button>
        <script>console.error('fixture console error')</script></main>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve layout fixture port.');
      const result = await capturePixflowBrowserScreenshots({
        url: `http://127.0.0.1:${address.port}/`,
        viewports: [{ id: 'mobile', width: 390, height: 300 }],
        waitMs: 40,
      });
      const layout = result.captures[0]?.layout;
      expect(result.errors).toEqual([]);
      expect(layout).toMatchObject({
        viewport: 'mobile',
        horizontalOverflowPx: expect.any(Number),
      });
      expect(layout?.horizontalOverflowPx).toBeGreaterThan(0);
      expect(layout?.overflowSources).toContain('section.overflow');
      expect(layout?.clippedElements.some((element) => element.selector === 'p.clip')).toBe(false);
      expect(layout?.missingResources.some((resource) => resource.kind === 'image')).toBe(true);
      expect(layout?.consoleErrors).toContain('fixture console error');
      expect(layout?.invalidInteractiveTargets).toEqual(expect.arrayContaining([
        expect.objectContaining({ reason: 'missing accessible name' }),
      ]));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('does not classify native select options as zero-size visible layout elements', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0}form{padding:24px}select{width:220px;height:44px}</style>
        <form><label for="edition">Edition</label><select id="edition"><option>Digital</option><option>Print</option></select></form>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve select fixture port.');
      const result = await capturePixflowBrowserScreenshots({
        url: `http://127.0.0.1:${address.port}/`,
        viewports: [{ id: 'mobile', width: 390, height: 300 }],
        waitMs: 20,
      });

      expect(result.errors).toEqual([]);
      expect(result.captures[0]?.layout?.zeroSizeVisible).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('does not report normal long-page flow or decorative overflow clipping as blocking layout defects', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
          html,body{margin:0}
          main{min-height:3200px}
          section{padding:32px;min-height:600px}
          .later{margin-top:1200px}
          .visual-stage{width:240px;height:180px;overflow:hidden}
          .beam{width:320px;height:260px;background:linear-gradient(135deg,#fff3cc,transparent)}
          .decorative{position:relative;width:100%;height:80px;overflow:hidden}
          .decorative-label{position:absolute;left:360px;width:100px;height:40px}
          .hidden-nav{display:none}
          .real-clip{width:100px;height:20px;overflow:hidden;white-space:nowrap}
        </style>
        <main>
          <section><h1>Architectural lighting</h1><div class="visual-stage"><div class="beam"></div><span>2700K</span></div>
            <div class="decorative" aria-hidden="true"><div class="decorative-label">Decorative plate</div></div>
            <nav class="hidden-nav"><ul><li><a href="#later">Hidden mobile navigation</a></li></ul></nav>
          </section>
          <section class="later"><h2>Commissioning</h2><p>Normal content later in the document.</p></section>
          <p class="real-clip">This user-facing sentence is genuinely clipped.</p>
        </main>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve long-page layout fixture port.');
      const result = await capturePixflowBrowserScreenshots({
        url: `http://127.0.0.1:${address.port}/`,
        viewports: [{ id: 'mobile', width: 390, height: 300 }],
        waitMs: 20,
      });
      const layout = result.captures[0]?.layout;
      expect(result.errors).toEqual([]);
      expect(layout?.horizontalOverflowPx).toBe(0);
      expect(layout?.viewportEscapes).toEqual([]);
      expect(layout?.zeroSizeVisible).toEqual([]);
      expect(layout?.clippedElements.some((element) => element.selector === 'div.visual-stage')).toBe(false);
      expect(layout?.clippedElements).toEqual(expect.arrayContaining([
        expect.objectContaining({ selector: 'p.real-clip' }),
      ]));
      expect(layout?.oversizedElements.some((element) => element.selector === 'main')).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('captures a requested bottom scroll segment for long-page visual critique', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0}.top,.bottom{height:900px}.top{background:#f00}.bottom{background:#00f}</style>
        <body><section class="top"></section><section class="bottom"></section></body>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve scroll fixture port.');
      const result = await capturePixflowBrowserScreenshots({
        url: `http://127.0.0.1:${address.port}/`,
        viewports: [{ id: 'mobile-bottom', width: 390, height: 300, scrollPosition: 'bottom' }],
        waitMs: 50,
      });
      expect(result.errors).toEqual([]);
      const capture = result.captures[0];
      const png = PNG.sync.read(Buffer.from(capture!.base64, 'base64'));
      const offset = (150 * png.width + 195) * 4;
      expect(Array.from(png.data.subarray(offset, offset + 3))).toEqual([0, 0, 255]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('waits for viewport-triggered lazy media after positioning a scroll checkpoint', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((request, response) => {
      if (request.url === '/lazy.svg') {
        response.setHeader('Content-Type', 'image/svg+xml');
        response.end('<svg xmlns="http://www.w3.org/2000/svg" width="390" height="300"><rect width="390" height="300" fill="#00ff00"/></svg>');
        return;
      }
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0}.spacer{height:900px}img{display:block;width:390px;height:300px}</style>
        <div class="spacer"></div>
        <img id="lazy" alt="Deferred dashboard" data-src="/lazy.svg"
          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='390' height='300'%3E%3Crect width='390' height='300' fill='%23ff0000'/%3E%3C/svg%3E">
        <script>
          const lazy = document.querySelector('#lazy');
          new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              setTimeout(() => { lazy.src = lazy.dataset.src; }, 250);
            }
          }).observe(lazy);
        </script>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve lazy-scroll fixture port.');
      const result = await capturePixflowBrowserScreenshots({
        url: `http://127.0.0.1:${address.port}/`,
        viewports: [{ id: 'mobile-bottom', width: 390, height: 300, scrollPosition: 'bottom' }],
        waitMs: 20,
      });
      expect(result.errors).toEqual([]);
      const png = PNG.sync.read(Buffer.from(result.captures[0]!.base64, 'base64'));
      const offset = (150 * png.width + 195) * 4;
      expect(Array.from(png.data.subarray(offset, offset + 3))).toEqual([0, 255, 0]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('captures after DOM readiness when a page asset outlives the navigation budget', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((request, response) => {
      if (request.url === '/slow.png') {
        response.setHeader('Content-Type', 'image/png');
        setTimeout(() => response.end(Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAFAgIACR0C/QAAAABJRU5ErkJggg==',
          'base64',
        )), 1_200);
        return;
      }
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0;width:100%;height:100%;background:#0f0}</style>
        <body><img src="/slow.png" alt="">Ready`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve hanging-asset fixture port.');
      const result = await capturePixflowBrowserScreenshots({
        url: `http://127.0.0.1:${address.port}/`,
        viewports: [{ id: 'desktop', width: 600, height: 400 }],
        waitMs: 50,
      }, { navigationTimeoutMs: 500 });
      expect(result.errors).toEqual([]);
      expect(result.captures).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('falls back to the rendered Chromium surface when font readiness never settles', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((request, response) => {
      if (request.url === '/pending.woff2') {
        response.setHeader('Content-Type', 'font/woff2');
        // Keep the font request open to reproduce Playwright's otherwise
        // unbounded document.fonts.ready screenshot precondition.
        return;
      }
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>@font-face{font-family:Pending;src:url('/pending.woff2')}body{margin:0;font-family:Pending,sans-serif;background:#fed;color:#123}</style>
        <body>Rendered fallback</body>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve pending-font fixture port.');
      const startedAt = Date.now();
      const result = await capturePixflowBrowserScreenshots({
        url: `http://127.0.0.1:${address.port}/`,
        viewports: [{ id: 'mobile', width: 390, height: 300 }],
        waitMs: 10,
      }, { navigationTimeoutMs: 500 });
      expect(Date.now() - startedAt).toBeLessThan(5_000);
      expect(result.errors).toEqual([]);
      expect(result.captures).toHaveLength(1);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('captures multiple exact viewports in one request', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    let activeRequests = 0;
    let maximumConcurrentRequests = 0;
    const server = createServer((_request, response) => {
      activeRequests += 1;
      maximumConcurrentRequests = Math.max(maximumConcurrentRequests, activeRequests);
      setTimeout(() => {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body>Ready</body>');
        activeRequests -= 1;
      }, 100);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve multi-viewport fixture port.');
      const result = await capturePixflowBrowserScreenshots({
        url: `http://127.0.0.1:${address.port}/`,
        viewports: [
          { id: 'desktop', width: 800, height: 500 },
          { id: 'mobile', width: 390, height: 500 },
        ],
        waitMs: 10,
      });
      expect(result.errors).toEqual([]);
      expect(result.captures.map(({ viewport, width, height }) => ({ viewport, width, height }))).toEqual([
        { viewport: 'desktop', width: 800, height: 500 },
        { viewport: 'mobile', width: 390, height: 500 },
      ]);
      expect(maximumConcurrentRequests).toBeGreaterThanOrEqual(2);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('captures a DOM fidelity comparison against a rendered HTML reference', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>body{margin:0}.hero{display:flex;gap:24px;padding:48px;background:#fff}.hero h1{font:700 48px/1.1 Arial;color:#123}</style>
        <main><section id="hero" class="hero"><h1>Measured fidelity</h1></section></main>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve fidelity fixture port.');
      const url = `http://127.0.0.1:${address.port}/`;
      const result = await capturePixflowBrowserScreenshots({
        url,
        fidelityReferenceUrl: url,
        references: [{ viewport: 'desktop', url }],
        viewports: [{ id: 'desktop', width: 800, height: 500 }],
        waitMs: 10,
      });

      expect(result.errors).toEqual([]);
      expect(result.captures[0]?.comparison).toMatchObject({
        differenceRatio: 0,
        passed: true,
      });
      expect(result.captures[0]?.fidelity).toMatchObject({
        matchCoverage: 1,
        geometryScore: 1,
        styleScore: 1,
        passed: true,
      });
      expect(result.captures[0]?.referenceCapture).toMatchObject({
        mimeType: 'image/png',
        base64: result.captures[0]?.base64,
      });
      expect(result.captures[0]?.referenceCapture?.sha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('lets a live reference run normal motion so its transient intro can settle', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      const stableMarkup = '<main><section id="hero" class="hero"><h1>Stable product page</h1></section></main>';
      if (request.url === '/reference') {
        response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
          <style>html,body{margin:0}.intro{position:fixed;inset:0;background:#f40}.hero{display:flex;padding:48px;background:#fff}.hero h1{font:700 48px/1.1 Arial;color:#123}</style>
          <div class="intro"></div><div class="content" hidden>${stableMarkup}</div>
          <script>
            if (matchMedia('(prefers-reduced-motion: no-preference)').matches) {
              setTimeout(() => { document.querySelector('.intro').remove(); document.querySelector('.content').hidden = false; }, 250);
            }
          </script>`);
        return;
      }
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0}.hero{display:flex;padding:48px;background:#fff}.hero h1{font:700 48px/1.1 Arial;color:#123}</style>${stableMarkup}`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve intro fixture port.');
      const origin = `http://127.0.0.1:${address.port}`;
      const result = await capturePixflowBrowserScreenshots({
        url: `${origin}/target`,
        fidelityReferenceUrl: `${origin}/reference`,
        viewports: [{ id: 'desktop', width: 800, height: 500 }],
        waitMs: 10,
      });

      expect(result.errors).toEqual([]);
      expect(result.captures[0]?.comparison).toMatchObject({ differenceRatio: 0, passed: true });
      expect(result.captures[0]?.fidelity).toMatchObject({ passed: true });
      expect(result.captures[0]?.fidelity?.matchCoverage).toBeGreaterThanOrEqual(0.85);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('keeps representative live-reference evidence when an authored frame cannot reach strict consensus', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    let referenceRequestCount = 0;
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (request.url === '/reference') {
        const colors = ['#ff3355', '#22aa66', '#3366ff'];
        const color = colors[referenceRequestCount % colors.length];
        referenceRequestCount += 1;
        response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
          <style>html,body{margin:0}.hero{height:500px;background:${color};color:#fff}</style>
          <main><section class="hero"><h1>Dynamic product frame</h1></section></main>`);
        return;
      }
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0}.hero{height:500px;background:#111;color:#fff}</style>
        <main><section class="hero"><h1>Dynamic product frame</h1></section></main>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve dynamic reference fixture port.');
      const origin = `http://127.0.0.1:${address.port}`;
      const result = await capturePixflowBrowserScreenshots({
        url: `${origin}/target`,
        fidelityReferenceUrl: `${origin}/reference`,
        fidelityProfile: 'visual-clone',
        viewports: [{ id: 'desktop-middle', width: 800, height: 500, scrollPosition: 'middle' }],
        waitMs: 10,
      });

      expect(result.errors).toEqual([]);
      expect(result.captures).toHaveLength(1);
      expect(result.captures[0]?.comparison).toBeTruthy();
      expect(result.captures[0]?.referenceCapture?.stability).toMatchObject({
        mode: 'representative',
        attempts: 3,
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 45_000);

  it('lets a visual-clone target settle authored reveal motion before comparison', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      const stableMarkup = '<main><section class="hero"><h1>Revealed clone</h1></section></main>';
      if (request.url === '/target') {
        response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
          <style>html,body{margin:0}.hero{height:500px;background:#04f;color:#fff}</style>
          <div class="content" hidden>${stableMarkup}</div>
          <script>
            if (matchMedia('(prefers-reduced-motion: no-preference)').matches) {
              setTimeout(() => { document.querySelector('.content').hidden = false; }, 250);
            }
          </script>`);
        return;
      }
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0}.hero{height:500px;background:#04f;color:#fff}</style>${stableMarkup}`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve visual-clone reveal fixture port.');
      const origin = `http://127.0.0.1:${address.port}`;
      const result = await capturePixflowBrowserScreenshots({
        url: `${origin}/target`,
        fidelityReferenceUrl: `${origin}/reference`,
        fidelityProfile: 'visual-clone',
        viewports: [{ id: 'desktop', width: 800, height: 500 }],
        waitMs: 10,
      });

      expect(result.errors).toEqual([]);
      expect(result.captures[0]?.comparison).toMatchObject({ differenceRatio: 0, passed: true });
      expect(result.captures[0]?.fidelity).toMatchObject({ passed: true });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('keeps a settled live reference in its authored motion mode while capturing evidence', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0}.preloader{position:fixed;inset:0;background:#f40}.hero{height:100vh;background:#04f}@media(prefers-reduced-motion:reduce){.hero{display:none;background:#0f0}}</style>
        <div class="preloader"></div><main class="hero" hidden></main>
        <script>
          if (matchMedia('(prefers-reduced-motion: no-preference)').matches) {
            setTimeout(() => { document.querySelector('.preloader').remove(); document.querySelector('.hero').hidden = false; }, 250);
          }
        </script>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve live-reference fixture port.');
      const result = await capturePixflowBrowserScreenshots({
        url: `http://127.0.0.1:${address.port}/`,
        viewports: [{ id: 'desktop', width: 800, height: 500 }],
        waitMs: 10,
        captureMode: 'live-reference',
      });

      expect(result.errors).toEqual([]);
      const png = PNG.sync.read(Buffer.from(result.captures[0]!.base64, 'base64'));
      const offset = (250 * png.width + 400) * 4;
      expect(Array.from(png.data.subarray(offset, offset + 3))).toEqual([0, 68, 255]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('captures the same terminal frame when live-reference animation timing varies', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      const duration = requests === 1 ? 6 : 12;
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
          html,body{margin:0}.hero,canvas{width:100vw;height:100vh}.hero{background:#fff;animation:reveal ${duration}s linear forwards}canvas{position:fixed;inset:0}
          @keyframes reveal{to{transform:translateX(40px)}}
        </style>
        <main class="hero"></main><canvas width="800" height="500"></canvas>
        <script>
          const canvas = document.querySelector('canvas');
          const context = canvas.getContext('2d');
          context.fillStyle = '#f40'; context.fillRect(0, 0, canvas.width, canvas.height);
          window.bodymovin = { getRegisteredAnimations: () => [{
            totalFrames: 120,
            goToAndStop(frame) {
              context.fillStyle = frame >= 119 ? '#04f' : '#f40';
              context.fillRect(0, 0, canvas.width, canvas.height);
            }
          }] };
        </script>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve deterministic animation fixture port.');
      const request = {
        url: `http://127.0.0.1:${address.port}/`,
        viewports: [{ id: 'desktop', width: 800, height: 500 }],
        waitMs: 10,
        captureMode: 'live-reference' as const,
      };
      const first = await capturePixflowBrowserScreenshots(request);
      const second = await capturePixflowBrowserScreenshots(request);

      expect(first.errors).toEqual([]);
      expect(second.errors).toEqual([]);
      expect(first.captures[0]?.sha256).toBe(second.captures[0]?.sha256);
      const png = PNG.sync.read(Buffer.from(first.captures[0]!.base64, 'base64'));
      const offset = (250 * png.width + 400) * 4;
      expect(Array.from(png.data.subarray(offset, offset + 3))).toEqual([0, 68, 255]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('measures the settled geometry of offscreen Bricks entrance elements', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      const lazyClass = request.url === '/target' ? ' bricks-lazy-hidden' : '';
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
          body{margin:0}.spacer{height:900px}.feature{width:600px;padding:40px}.copy{width:420px;height:120px}
          .bricks-lazy-hidden{opacity:0;transform:translateY(40px)}
        </style>
        <main><div class="spacer"></div><section class="feature"><div class="copy${lazyClass}">Deferred feature copy</div></section></main>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve lazy fidelity fixture port.');
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const result = await capturePixflowBrowserScreenshots({
        url: `${baseUrl}/target`,
        fidelityReferenceUrl: `${baseUrl}/reference`,
        viewports: [{ id: 'desktop', width: 800, height: 500, scrollPosition: 'bottom' }],
        waitMs: 20,
      });

      expect(result.errors).toEqual([]);
      expect(result.captures[0]?.fidelity).toMatchObject({
        passed: true,
        matchCoverage: 1,
      });
      expect(result.captures[0]?.fidelity?.geometryScore).toBeGreaterThan(0.98);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('retries a transiently unsettled fidelity reference without recapturing the target evidence', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    let referenceRequests = 0;
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      const isReference = request.url === '/source';
      if (isReference) referenceRequests += 1;
      const shifted = isReference && referenceRequests === 1;
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>body{margin:0}.hero{margin-top:${shifted ? 260 : 0}px;width:600px;height:300px;background:#fff}.hero h1{font:700 48px/1.1 Arial;color:#123}</style>
        <main><section id="hero" class="hero"><h1>Settled reference</h1></section></main>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve transient reference fixture port.');
      const origin = `http://127.0.0.1:${address.port}`;
      const result = await capturePixflowBrowserScreenshots({
        url: `${origin}/target`,
        fidelityReferenceUrl: `${origin}/source`,
        viewports: [{ id: 'desktop', width: 800, height: 500 }],
        waitMs: 10,
      });

      expect(result.errors).toEqual([]);
      expect(referenceRequests).toBe(3);
      expect(result.captures[0]?.fidelity).toMatchObject({
        geometryScore: 1,
        passed: true,
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('accepts bounded raster noise as a settled live-reference consensus', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    let referenceRequests = 0;
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      const isReference = request.url === '/source';
      if (isReference) referenceRequests += 1;
      const noisyPixel = isReference ? referenceRequests % 2 : 0;
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0}.hero{width:800px;height:500px;background:#fff}.noise{position:fixed;left:${noisyPixel}px;top:0;width:1px;height:1px;background:#123}</style>
        <main><section id="hero" class="hero"><h1>Settled reference</h1></section></main><i class="noise"></i>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve raster-noise fixture port.');
      const origin = `http://127.0.0.1:${address.port}`;
      const result = await capturePixflowBrowserScreenshots({
        url: `${origin}/target`,
        fidelityReferenceUrl: `${origin}/source`,
        viewports: [{ id: 'desktop', width: 800, height: 500 }],
        waitMs: 10,
      });

      expect(result.errors).toEqual([]);
      expect(referenceRequests).toBe(2);
      expect(result.captures[0]?.referenceCapture?.sha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('prefers data-od-id over a secondary HTML anchor id for fidelity matching', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      const section = '<section id="top" data-od-id="hero" style="width:600px;height:300px"><h1>Hero</h1></section>';
      response.end(request.url === '/source'
        ? `<!doctype html><body style="margin:0"><main id="top">${section.replace(' id="top"', '')}</main></body>`
        : `<!doctype html><body style="margin:0">${section}</body>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve explicit-key fixture port.');
      const origin = `http://127.0.0.1:${address.port}`;
      const result = await capturePixflowBrowserScreenshots({
        url: `${origin}/target`,
        fidelityReferenceUrl: `${origin}/source`,
        viewports: [{ id: 'desktop', width: 800, height: 500 }],
        waitMs: 10,
      });

      const fidelity = result.captures[0]?.fidelity;
      expect(result.errors).toEqual([]);
      expect(fidelity?.mismatches).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceKey: 'top', matchBy: 'unmatched' }),
      ]));
      expect(fidelity?.mismatches).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceKey: 'hero', matchBy: 'unmatched' }),
      ]));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('matches lazy-loaded media by unique alt intent when the rendered src changes', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((request, response) => {
      if (request.url?.endsWith('.jpg')) {
        const fill = request.url === '/target.jpg' ? '#b84a2b' : '#171713';
        response.setHeader('Content-Type', 'image/svg+xml');
        response.end(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="${fill}"/></svg>`);
        return;
      }
      const target = request.url === '/target';
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>body{margin:0}img{display:block;width:320px;height:180px;object-fit:cover}</style>
        <img src="/${target ? 'target' : 'source'}.jpg" alt="Quiet architectural interior">`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve fidelity fixture port.');
      const origin = `http://127.0.0.1:${address.port}`;
      const result = await capturePixflowBrowserScreenshots({
        url: `${origin}/target`,
        fidelityReferenceUrl: `${origin}/source`,
        viewports: [{ id: 'desktop', width: 800, height: 500 }],
        waitMs: 10,
      });

      expect(result.errors).toEqual([]);
      expect(result.captures[0]?.fidelity).toMatchObject({
        matchedElements: 1,
        unmatchedSourceElements: 0,
        matchCoverage: 1,
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('does not let framework-only wrapper divs dilute semantic clone fidelity', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      const source = request.url === '/source';
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>body{margin:0}.outer{padding:40px}.inner{width:600px}h1{font:700 48px/1.1 Arial;margin:0}p{font:400 18px/1.5 Arial;margin:20px 0 0}</style>
        <div class="${source ? 'w-layout-vflex source-shell' : 'clone-shell'} outer">
          <div class="${source ? 'w-container source-inner' : 'clone-inner'} inner">
            <h1>Faithful product story</h1><p>Measured public copy remains intact.</p>
          </div>
        </div>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve wrapper fixture port.');
      const origin = `http://127.0.0.1:${address.port}`;
      const result = await capturePixflowBrowserScreenshots({
        url: `${origin}/target`,
        fidelityReferenceUrl: `${origin}/source`,
        viewports: [{ id: 'desktop', width: 800, height: 500 }],
        waitMs: 10,
      });

      expect(result.errors).toEqual([]);
      expect(result.captures[0]?.fidelity).toMatchObject({
        sourceElements: 2,
        targetElements: 2,
        matchedElements: 2,
        matchCoverage: 1,
        passed: true,
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('ignores offscreen animation staging nodes in viewport DOM fidelity', async (context) => {
    if (!await resolvePixflowCaptureBrowser()) {
      context.skip();
      return;
    }
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      const source = request.url === '/source';
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>body{margin:0}h1{margin:40px;font:700 48px/1.1 Arial}.staged{position:absolute;transform:translateX(-5000px)}.closed{height:0;overflow:hidden}</style>
        <h1>Visible clone heading</h1>
        ${source ? '<p class="staged">Animation staging copy</p><div class="closed"><p>Closed form content</p></div>' : ''}`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not resolve offscreen fidelity fixture port.');
      const origin = `http://127.0.0.1:${address.port}`;
      const result = await capturePixflowBrowserScreenshots({
        url: `${origin}/target`,
        fidelityReferenceUrl: `${origin}/source`,
        viewports: [{ id: 'desktop', width: 800, height: 500 }],
        waitMs: 10,
      });

      expect(result.errors).toEqual([]);
      expect(result.captures[0]?.fidelity).toMatchObject({
        sourceElements: 1,
        targetElements: 1,
        matchedElements: 1,
        unmatchedSourceElements: 0,
        matchCoverage: 1,
        passed: true,
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects a localized structural shift even when the whole-frame average is low', () => {
    const reference = new PNG({ width: 600, height: 800, colorType: 6 });
    const actual = new PNG({ width: 600, height: 800, colorType: 6 });
    reference.data.fill(255);
    actual.data.fill(255);
    const paint = (png: PNG, startX: number) => {
      for (let y = 24; y < 74; y += 1) {
        for (let x = startX; x < startX + 100; x += 1) {
          const offset = (y * png.width + x) * 4;
          png.data[offset] = 10;
          png.data[offset + 1] = 10;
          png.data[offset + 2] = 10;
          png.data[offset + 3] = 255;
        }
      }
    };
    paint(reference, 24);
    paint(actual, 476);

    const comparison = comparePixflowScreenshotBuffers(
      PNG.sync.write(actual),
      PNG.sync.write(reference),
    );

    expect(comparison.differenceRatio).toBeLessThan(comparison.fullFrameLimit);
    expect(comparison.maximumTopBandTileDifferenceRatio).toBeGreaterThan(comparison.maximumTopBandTileLimit);
    expect(comparison.passed).toBe(false);
  });

  it('reports subtle full-frame color drift that perceptual pixelmatch deliberately ignores', () => {
    const reference = new PNG({ width: 120, height: 80, colorType: 6 });
    const actual = new PNG({ width: 120, height: 80, colorType: 6 });
    for (let offset = 0; offset < reference.data.length; offset += 4) {
      reference.data[offset] = 238;
      reference.data[offset + 1] = 238;
      reference.data[offset + 2] = 238;
      reference.data[offset + 3] = 255;
      actual.data[offset] = 245;
      actual.data[offset + 1] = 245;
      actual.data[offset + 2] = 245;
      actual.data[offset + 3] = 255;
    }

    const comparison = comparePixflowScreenshotBuffers(
      PNG.sync.write(actual),
      PNG.sync.write(reference),
    );

    expect(comparison.differenceRatio).toBe(0);
    expect(comparison.meanAbsoluteChannelDifference).toBe(7);
    expect(comparison.maximumTileMeanAbsoluteChannelDifference).toBe(7);
  });

  it('passes matched DOM geometry and computed styles within rendering tolerances', () => {
    const comparison = comparePixflowDomSnapshots({
      url: 'http://source.test/',
      width: 1440,
      height: 1000,
      elements: [{
        key: 'source-hero',
        label: 'Build something remarkable',
        tag: 'h1',
        kind: 'text',
        importance: 3,
        matchKeys: ['explicit:hero-title', 'text:heading:build something remarkable'],
        rect: { x: 120, y: 180, width: 620, height: 130 },
        styles: {
          display: 'block',
          color: 'rgb(15, 20, 30)',
          'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
          'font-size': '72px',
          'font-weight': '700',
          'line-height': '79.2px',
          'text-align': 'left',
          'padding-top': '0px',
          'padding-right': '0px',
          'padding-bottom': '0px',
          'padding-left': '0px',
          'border-top-width': '0px',
          'border-top-style': 'solid',
          'border-top-color': 'rgb(15, 20, 30)',
        },
      }],
    }, {
      url: 'http://bricks.test/',
      width: 1440,
      height: 1000,
      elements: [{
        key: 'bricks-abc123',
        label: 'Build something remarkable',
        tag: 'h1',
        kind: 'text',
        importance: 3,
        matchKeys: ['explicit:hero-title', 'text:heading:build something remarkable'],
        rect: { x: 122, y: 182, width: 618, height: 131 },
        styles: {
          display: 'block',
          color: 'rgb(15, 20, 30)',
          'font-family': '"Segoe UI", sans-serif',
          'font-size': '72px',
          'font-weight': '700',
          'line-height': '79.2px',
          'text-align': 'left',
          'padding-top': '0px',
          'padding-right': '0px',
          'padding-bottom': '0px',
          'padding-left': '0px',
          'border-top-width': '0px',
          'border-top-style': 'none',
          'border-top-color': 'rgb(217, 216, 215)',
        },
      }],
    });

    expect(comparison).toMatchObject({
      matchedElements: 1,
      matchCoverage: 1,
      passed: true,
    });
    expect(comparison.geometryScore).toBeGreaterThan(0.95);
    expect(comparison.styleScore).toBe(1);
  });

  it('pairs repeated semantic elements in document order instead of treating every duplicate as unmatched', () => {
    const repeated = (prefix: string, yOffset: number) => ([0, 1].map((index) => ({
      key: `${prefix}-${index}`,
      label: 'Work',
      tag: 'a',
      kind: 'text' as const,
      importance: 2,
      matchKeys: ['tagtext:a:work', 'text:link:work'],
      rect: { x: 100, y: yOffset + index * 700, width: 48, height: 20 },
      styles: { display: 'inline', color: 'rgb(23, 23, 19)' },
    })));
    const comparison = comparePixflowDomSnapshots({
      url: 'http://source.test/',
      width: 1440,
      height: 1000,
      elements: repeated('source', 40),
    }, {
      url: 'http://bricks.test/',
      width: 1440,
      height: 1000,
      elements: repeated('target', 40),
    });

    expect(comparison).toMatchObject({
      matchedElements: 2,
      unmatchedSourceElements: 0,
      matchCoverage: 1,
      geometryScore: 1,
      styleScore: 1,
      passed: true,
    });
  });

  it('matches source copy across faithful wrapper and phrase-boundary changes', () => {
    const element = (key: string, text: string, y: number) => ({
      key,
      label: text,
      tag: 'span',
      kind: 'text' as const,
      importance: 1,
      matchKeys: [`tagtext:span:${text.toLowerCase()}`, `text:text:${text.toLowerCase()}`],
      rect: { x: 100, y, width: 320, height: 40 },
      styles: { display: 'block', color: 'rgb(23, 23, 19)' },
    });
    const comparison = comparePixflowDomSnapshots({
      url: 'http://source.test/',
      width: 1440,
      height: 1000,
      elements: [
        element('source-access', 'Fast and easy access', 100),
        element('source-work-1', 'Work', 300),
        element('source-work-2', 'Work', 700),
      ],
    }, {
      url: 'http://bricks.test/',
      width: 1440,
      height: 1000,
      elements: [
        element('target-access', 'Fast and easy access to analytics', 100),
        element('target-work-1', 'Work', 300),
        element('target-work-2', 'Work', 700),
        element('target-work-3', 'Work', 900),
      ],
    });

    expect(comparison).toMatchObject({
      matchedElements: 3,
      unmatchedSourceElements: 0,
      matchCoverage: 1,
    });
    expect(comparison.mismatches).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ matchBy: 'unmatched' }),
    ]));
  });

  it('credits source animation fragments when the clone preserves the complete visible phrase', () => {
    const sourceFragment = (key: string, text: string, x: number) => ({
      key,
      label: text,
      tag: 'p',
      kind: 'text' as const,
      importance: 1,
      matchKeys: [`tagtext:p:${text.toLowerCase()}`, `text:text:${text.toLowerCase()}`],
      rect: { x, y: 180, width: 120, height: 48 },
      styles: { display: 'block', color: 'rgb(23, 23, 19)' },
    });
    const comparison = comparePixflowDomSnapshots({
      url: 'http://source.test/',
      width: 1440,
      height: 900,
      elements: [
        sourceFragment('source-analytics', 'Analytics', 100),
        sourceFragment('source-shape', 'shape', 260),
        sourceFragment('source-future', 'f u t u r e', 390),
      ],
    }, {
      url: 'http://bricks.test/',
      width: 1440,
      height: 900,
      elements: [{
        key: 'target-heading',
        label: 'Analytics that helps you shape the future',
        tag: 'h1',
        kind: 'text',
        importance: 3,
        matchKeys: [
          'tagtext:h1:analytics that helps you shape the future',
          'text:heading:analytics that helps you shape the future',
        ],
        rect: { x: 100, y: 180, width: 900, height: 150 },
        styles: { display: 'block', color: 'rgb(23, 23, 19)' },
      }],
    });

    expect(comparison).toMatchObject({
      matchedElements: 3,
      unmatchedSourceElements: 0,
      matchCoverage: 1,
    });
    expect(comparison.mismatches).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ matchBy: 'unmatched' }),
    ]));
  });

  it('prefers a unique source class over identical ancestor text introduced by Bricks wrappers', () => {
    const sourceElement = {
      key: 'source-section-head',
      label: 'Capabilities A control plane for the messy edge',
      tag: 'div',
      kind: 'container' as const,
      importance: 3,
      matchKeys: [
        'tagtext:div:capabilities a control plane for the messy edge',
        'text:container:capabilities a control plane for the messy edge',
        'class:nexa-section-head',
      ],
      rect: { x: 120, y: 300, width: 620, height: 180 },
      styles: { display: 'flex', color: 'rgb(240, 244, 248)' },
    };
    const comparison = comparePixflowDomSnapshots({
      url: 'http://source.test/',
      width: 1440,
      height: 1000,
      elements: [sourceElement],
    }, {
      url: 'http://bricks.test/',
      width: 1440,
      height: 1000,
      elements: [{
        ...sourceElement,
        key: 'bricks-wrapper',
        matchKeys: ['tagtext:div:capabilities a control plane for the messy edge'],
        rect: { x: 0, y: 260, width: 1440, height: 260 },
        styles: { display: 'block', color: 'rgb(240, 244, 248)' },
      }, {
        ...sourceElement,
        key: 'bricks-section-head',
        matchKeys: ['class:nexa-section-head'],
      }],
    });

    expect(comparison).toMatchObject({
      matchedElements: 1,
      unmatchedSourceElements: 0,
      geometryScore: 1,
      styleScore: 1,
      passed: true,
    });
  });

  it('compares vertical flow proportionally when equivalent content changes total document height', () => {
    const element = {
      key: 'source-cta',
      label: 'Request consultation',
      tag: 'section',
      kind: 'container' as const,
      importance: 3,
      matchKeys: ['explicit:consultation'],
      rect: { x: 20, y: 5_000, width: 350, height: 800 },
      styles: { display: 'flex' },
    };
    const comparison = comparePixflowDomSnapshots({
      url: 'http://source.test/',
      width: 390,
      height: 844,
      documentHeight: 6_800,
      elements: [element],
    }, {
      url: 'http://bricks.test/',
      width: 390,
      height: 844,
      documentHeight: 6_600,
      elements: [{ ...element, key: 'target-cta', rect: { ...element.rect, y: 4_860 } }],
    });

    expect(comparison.geometryScore).toBeGreaterThan(0.95);
    expect(comparison.documentHeightScore).toBeGreaterThan(0.95);
    expect(comparison.passed).toBe(true);
  });

  it('blocks visual-clone fidelity when the generated document is materially shorter than the source', () => {
    const element = {
      key: 'source-section',
      label: 'Hearing Health',
      tag: 'section',
      kind: 'container' as const,
      importance: 3,
      matchKeys: ['explicit:hearing-health'],
      rect: { x: 0, y: 200, width: 390, height: 600 },
      styles: { display: 'flex' },
    };
    const comparison = comparePixflowDomSnapshots({
      url: 'https://source.test/',
      width: 390,
      height: 844,
      documentHeight: 10_000,
      elements: [element],
    }, {
      url: 'http://clone.test/',
      width: 390,
      height: 844,
      documentHeight: 6_000,
      elements: [{ ...element, key: 'target-section' }],
    }, 'visual-clone');

    expect(comparison).toMatchObject({
      sourceDocumentHeight: 10_000,
      targetDocumentHeight: 6_000,
      documentHeightScore: 0.6,
      minimumDocumentHeightScore: 0.88,
      passed: false,
    });
  });

  it('fails with actionable element-level geometry and style differences', () => {
    const source: PixflowDomFidelitySnapshot = {
      url: 'http://source.test/',
      width: 1440,
      height: 1000,
      elements: [{
        key: 'source-card',
        label: 'Conversion fidelity',
        tag: 'section',
        kind: 'container',
        importance: 3,
        matchKeys: ['class:feature-card'],
        rect: { x: 80, y: 300, width: 600, height: 420 },
        styles: {
          display: 'flex',
          'flex-direction': 'column',
          gap: '24px',
          'padding-left': '32px',
          'padding-right': '32px',
          'background-color': 'rgb(255, 255, 255)',
        },
      }],
    } as const;
    const target: PixflowDomFidelitySnapshot = {
      url: 'http://bricks.test/',
      width: 1440,
      height: 1000,
      elements: [{
        key: 'bricks-card',
        label: 'Conversion fidelity',
        tag: 'section',
        kind: 'container',
        importance: 3,
        matchKeys: ['class:feature-card'],
        rect: { x: 220, y: 420, width: 360, height: 720 },
        styles: {
          display: 'block',
          'flex-direction': 'row',
          gap: '0px',
          'padding-left': '8px',
          'padding-right': '8px',
          'background-color': 'rgb(245, 245, 245)',
        },
      }],
    } as const;

    const comparison = comparePixflowDomSnapshots(source, target);

    expect(comparison.passed).toBe(false);
    expect(comparison.mismatches[0]?.geometry.map((issue) => issue.property)).toContain('width');
    expect(comparison.mismatches[0]?.styles.map((issue) => issue.property)).toEqual(expect.arrayContaining([
      'display',
      'gap',
      'padding-left',
    ]));
  });

  it('keeps strict DOM fidelity by default but permits wrapper-safe visual clone evidence', () => {
    const source: PixflowDomFidelitySnapshot = {
      url: 'https://source.test/',
      width: 390,
      height: 844,
      elements: [{
        key: 'source-link',
        label: 'Explore',
        tag: 'a',
        kind: 'text' as const,
        importance: 2,
        matchKeys: ['tagtext:a:explore', 'text:link:explore'],
        rect: { x: 150, y: 70, width: 80, height: 28 },
        styles: { display: 'flex', color: 'rgb(153, 153, 153)', 'font-size': '24px' },
      }],
    };
    const target: PixflowDomFidelitySnapshot = {
      url: 'http://clone.test/',
      width: 390,
      height: 844,
      elements: [{
        ...source.elements[0]!,
        key: 'target-link',
        rect: { x: 160, y: 120, width: 70, height: 24 },
      }],
    };

    expect(comparePixflowDomSnapshots(source, target).passed).toBe(false);
    expect(comparePixflowDomSnapshots(source, target, 'visual-clone')).toMatchObject({
      profile: 'visual-clone',
      passed: true,
    });
  });
});
