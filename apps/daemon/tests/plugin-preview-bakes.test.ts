import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyBakedPreviews, bakedPreviewBlock } from '../src/plugin-preview-bakes.js';

describe('community preview hosting compatibility', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'pixflow-preview-hosting-'));
    vi.stubEnv('OD_PLUGIN_PREVIEWS_BASE_URL', '');
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ previews: { sample: { video: 'sample.webm', poster: 'sample.jpg', holdMs: 500 } } }));
  });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
  it('keeps remote previews working until migration is ready', () => {
    expect(bakedPreviewBlock('sample', dir)?.poster).toBe('https://repo-assets.open-design.ai/plugin-previews/sample.jpg');
  });
  it('serves both bundled assets locally without a CDN', () => {
    writeFileSync(path.join(dir, 'sample.webm'), 'video');
    writeFileSync(path.join(dir, 'sample.jpg'), 'poster');
    expect(bakedPreviewBlock('sample', dir)?.video).toBe('/api/plugin-previews/sample.webm');
  });
  it('supports a configured replacement host', () => {
    vi.stubEnv('OD_PLUGIN_PREVIEWS_BASE_URL', 'https://assets.example.test/previews/');
    expect(bakedPreviewBlock('sample', dir)?.poster).toBe('https://assets.example.test/previews/sample.jpg');
  });
  it('preserves the interactive preview and does not mutate catalog data', () => {
    const record = { id: 'sample', manifest: { od: { preview: { type: 'html', src: 'example.html' } } } };
    const original = structuredClone(record);
    const result = applyBakedPreviews([record], dir);
    expect(record).toEqual(original);
    expect(result[0]?.manifest.od.preview).toEqual(original.manifest.od.preview);
    expect(result[0]?.manifest).toHaveProperty('od.bakedPreview');
    expect(bakedPreviewBlock('unknown', dir)).toBeNull();
  });
});
