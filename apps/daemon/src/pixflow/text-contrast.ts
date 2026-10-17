import type { PixflowVisualLayoutEvidence } from '@open-design/contracts';

type Sample = NonNullable<PixflowVisualLayoutEvidence['typography']>['samples'][number];
type Rgba = [number, number, number, number];

/** Computed browser sRGB syntax only; other colour spaces remain explicitly unresolved. */
function srgb(value: string): Rgba | null {
  if (value === 'transparent') return [0, 0, 0, 0];
  const legacy = value.match(/^rgba?\(([^)]+)\)$/);
  const modern = value.match(/^color\(srgb\s+([^)]+)\)$/);
  if (!legacy && !modern) return null;
  const parts = (legacy?.[1] ?? modern?.[1] ?? '').trim().split(/[\s,/]+/);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const channels = parts.map((part, index) => {
    const number = Number(part.replace(/%$/, ''));
    return part.endsWith('%') ? number / 100 : index < 3 && legacy ? number / 255 : number;
  });
  if (channels.some(value => !Number.isFinite(value) || value < 0 || value > 1)) return null;
  return [channels[0]!, channels[1]!, channels[2]!, channels[3] ?? 1];
}

function luminance(rgb: number[]): number {
  return rgb.reduce((sum, channel, index) => sum + (channel <= 0.04045
    ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index]!, 0);
}

/** Resolve a solid ancestor stack without guessing pixels behind images/effects or missing backgrounds. */
export function measureTextContrast(sample: Sample): NonNullable<Sample['contrast']> {
  const unknown = (reason: string) => ({ ratio: null, reason });
  if (sample.compositingEffects?.length) return unknown('compositing-effects');
  const foreground = srgb(sample.color ?? '');
  if (!foreground) return unknown('unsupported-foreground-colour');
  const layers = sample.backgroundLayers ?? [];
  if (layers.some(layer => layer.opacity && Number(layer.opacity) !== 1)) return unknown('ancestor-opacity');
  const background = [0, 0, 0];
  let remaining = 1;
  for (const layer of layers) {
    if (layer.image && layer.image !== 'none') return unknown('background-image');
    const colour = srgb(layer.color);
    if (!colour) return unknown('unsupported-background-colour');
    for (let i = 0; i < 3; i++) background[i]! += colour[i]! * colour[3] * remaining;
    remaining *= 1 - colour[3];
    if (remaining === 0) break;
  }
  if (remaining !== 0) return unknown('no-opaque-background');
  const ink = foreground.slice(0, 3).map((value, index) => value * foreground[3] + background[index]! * (1 - foreground[3]));
  const a = luminance(ink), b = luminance(background);
  return { ratio: Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(3)),
    foreground: ink.map(value => Number((value * 255).toFixed(3))),
    background: background.map(value => Number((value * 255).toFixed(3))) };
}
