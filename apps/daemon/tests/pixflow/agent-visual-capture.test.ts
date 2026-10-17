import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { captureAgentPage } from '../../src/pixflow/agent-visual-capture.js';

let directory: string | undefined;
afterEach(async () => { vi.unstubAllGlobals(); if (directory) await fs.rm(directory, { recursive: true, force: true }); });

it('shows every distinct measured style compactly and keeps complete records in the evidence file', async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'capture-summary-'));
  const normal = { selector: '.copy', text: 'First', fontSize: '16px', fontWeight: '400', color: 'rgb(0,0,0)',
    contrast: { ratio: 21, foreground: [0,0,0], background: [255,255,255] }, inViewport: true,
    bounds: { left: 10, top: 20, width: 300, height: 50 }, parentBounds: { left: 10, top: 20, width: 200, height: 100 } };
  const samples = [normal, { ...normal, text: 'Second', inViewport: false },
    { ...normal, selector: '.badge', text: 'Offscreen badge', color: 'rgb(255,255,255)', contrast: { ...normal.contrast, ratio: 1 } }];
  const typography = { rootFontSize: '16px', samples: [normal], documentSamples: samples, documentTextCount: 3, documentTruncated: false };
  const headings = [{ level: 2, selector: 'h2', text: 'Page title' }];
  const images = { count: 1, truncated: false, samples: [{ selector: 'img.photo', alt: 'Workshop', naturalWidth: 120, naturalHeight: 80, objectFit: 'fill', objectPosition: '50% 50%', bounds: { left: 0, top: 0, width: 60, height: 160 } }] };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, captures: [
    { viewport: 'desktop', base64: 'iVBORw==', layout: { typography, headings, headingsTruncated: false, images } },
  ] }))));
  const result = await captureAgentPage('http://capture.test', { url: 'http://page.test', viewports: [{ id: 'desktop', width: 1440, height: 1000 }] }, directory);
  const capture = result.captures[0]!;
  expect(capture.headings).toEqual(headings);
  expect(capture.images).toEqual(images);
  expect(capture.typography?.styles).toHaveLength(2);
  expect(capture.typography?.styles[0]).toMatchObject({ count: 2, contrast: { ratio: 21 } });
  expect(capture.typography?.styles[0]?.examples[0]).toMatchObject({ bounds: normal.bounds, parentBounds: normal.parentBounds });
  expect(capture.typography?.styles[1]).toMatchObject({ count: 1, contrast: { ratio: 1 }, examples: [{ text: 'Offscreen badge' }] });
  expect(capture.typography).not.toHaveProperty('documentSamples');
  expect(capture.typography).not.toHaveProperty('passed');
  const saved = JSON.parse(await fs.readFile(capture.evidencePath, 'utf8'));
  expect(saved.layout.typography).toEqual(typography);
});
