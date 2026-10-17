import { describe, expect, it } from 'vitest';
import { measureTextContrast } from '../../src/pixflow/text-contrast.js';

const sample = (color: string, backgrounds: string[]) => ({
  selector: '.copy', text: 'Copy', fontSize: '16px', fontFamily: 'Arial', lineHeight: '24px', width: 100, height: 24,
  color, backgroundLayers: backgrounds.map(color => ({ color, image: 'none', opacity: '1' })),
});

describe('nominal sRGB text contrast observations', () => {
  it('measures known endpoints and the observed brand pairing without assigning a verdict', () => {
    expect(measureTextContrast(sample('rgb(0, 0, 0)', ['rgb(255, 255, 255)']))).toMatchObject({ ratio: 21 });
    expect(measureTextContrast(sample('rgb(255, 255, 255)', ['rgb(255, 255, 255)']))).toMatchObject({ ratio: 1 });
    expect(measureTextContrast(sample('rgb(255, 255, 255)', ['rgb(230, 85, 54)'])).ratio).toBeCloseTo(3.67, 2);
  });
  it('composites translucent foreground and nearest-first translucent backgrounds', () => {
    const result = measureTextContrast(sample('color(srgb 1 1 1 / 50%)', ['rgba(255, 0, 0, 0.5)', 'rgb(0, 0, 255)']));
    expect(result).toMatchObject({ background: [127.5, 0, 127.5], foreground: [191.25, 127.5, 191.25] });
    expect(measureTextContrast(sample('rgb(100% 100% 100%)', ['rgb(0 0 0)']))).toMatchObject({ ratio: 21 });
  });
  it('reports unresolved surfaces and compositing instead of assuming white or a solid image', () => {
    expect(measureTextContrast(sample('rgb(0,0,0)', []))).toEqual({ ratio: null, reason: 'no-opaque-background' });
    const image = sample('rgb(0,0,0)', ['rgb(255,255,255)']);
    image.backgroundLayers[0]!.image = 'linear-gradient(red,blue)';
    expect(measureTextContrast(image)).toEqual({ ratio: null, reason: 'background-image' });
    expect(measureTextContrast({ ...image, compositingEffects: ['filter'] })).toEqual({ ratio: null, reason: 'compositing-effects' });
    expect(measureTextContrast(sample('color(display-p3 1 0 0)', ['rgb(255,255,255)']))).toMatchObject({ ratio: null });
    expect(measureTextContrast(sample('color(srgb 2 0 0)', ['rgb(255,255,255)']))).toMatchObject({ ratio: null });
  });
  it('uses the nearest opaque surface even when an image exists behind it', () => {
    const s = sample('rgb(0,0,0)', ['rgb(255,255,255)', 'rgb(0,0,0)']);
    s.backgroundLayers[1]!.image = 'url(photo.png)';
    expect(measureTextContrast(s)).toMatchObject({ ratio: 21 });
  });
});
