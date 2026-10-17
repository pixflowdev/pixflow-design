import type {
  PixflowDesignSystemColorGroup,
  PixflowDesignSystemProfile,
} from './framework';

export type PixflowDesignSystemRouteId =
  | 'pixflow-native-bricks'
  | 'pixflow-core'
  | 'pixflow-at'
  | string;

const WHITE = '#ffffff';
const BLACK = '#000000';
const READABLE_BLACK = '#111111';
const DEFAULT_ACCENT = '#6c32c3';
const CHROMATIC_LIGHT_MIXES = [0.3, 0.8, 0.9] as const;
const CHROMATIC_DARK_MIXES = [0.2, 0.6, 0.7] as const;
const LEGACY_DARK_MIXES = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875] as const;
const NEUTRAL_WHITE_MIXES = [1, 0.95, 0.85, 0.7, 0.5, 0.3, 0.1, 0] as const;
const APCA_READABLE_TEXT_THRESHOLD = 54;
const APCA_ACCENT_THRESHOLD = 54;

type Rgb = [number, number, number];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function expandHex(value: string) {
  const clean = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(clean)) {
    return `#${clean.split('').map((character) => character + character).join('').toLowerCase()}`;
  }
  return /^[0-9a-f]{6}$/i.test(clean) ? `#${clean.toLowerCase()}` : DEFAULT_ACCENT;
}

function parseRgb(value: string): Rgb {
  const normalized = expandHex(value).slice(1);
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function rgbToHex(rgb: Rgb, floor = false) {
  return `#${rgb.map((channel) => {
    const rounded = floor ? Math.floor(channel) : Math.round(channel);
    return clamp(rounded, 0, 255).toString(16).padStart(2, '0');
  }).join('')}`;
}

export function normalizeFrameworkHex(value: string) {
  return expandHex(value);
}

export function mixFrameworkHex(source: string, target: string, amount: number, floor = false) {
  const [sr, sg, sb] = parseRgb(source);
  const [tr, tg, tb] = parseRgb(target);
  return rgbToHex([
    sr + (tr - sr) * amount,
    sg + (tg - sg) * amount,
    sb + (tb - sb) * amount,
  ], floor);
}

export function buildFrameworkColorRamp(baseColor: string) {
  const base = normalizeFrameworkHex(baseColor);
  const light = CHROMATIC_LIGHT_MIXES.map((amount) => mixFrameworkHex(base, WHITE, amount, true));
  const dark = CHROMATIC_DARK_MIXES.map((amount) => mixFrameworkHex(base, BLACK, amount, true));
  return {
    light,
    dark,
    display: [...light].reverse().concat(base, dark),
    legacyDark: LEGACY_DARK_MIXES.map((amount) => mixFrameworkHex(base, BLACK, amount, true)),
  };
}

export function buildFrameworkNeutralRamp(tintHex: string | null) {
  const seed = tintHex
    ? mixFrameworkHex(BLACK, normalizeFrameworkHex(tintHex), 0.05)
    : BLACK;
  return NEUTRAL_WHITE_MIXES.map((amount) => mixFrameworkHex(seed, WHITE, amount, true));
}

export function buildFrameworkVisibleNeutralRamp(tintHex: string | null) {
  return buildFrameworkNeutralRamp(tintHex).slice(1);
}

function apcaLuminance(hex: string) {
  const [r, g, b] = parseRgb(hex);
  const linear = (value: number) => (value / 255) ** 2.4;
  return 0.2126729 * linear(r) + 0.7151522 * linear(g) + 0.072175 * linear(b);
}

function apcaContrast(textHex: string, backgroundHex: string) {
  const text = apcaLuminance(textHex);
  const background = apcaLuminance(backgroundHex);
  if (Math.abs(background - text) < 0.0005) return 0;
  return background > text
    ? (background ** 0.56 - text ** 0.57) * 1.14 * 100
    : (background ** 0.65 - text ** 0.62) * 1.14 * 100;
}

export function getFrameworkReadableText(backgroundHex: string) {
  return Math.abs(apcaContrast(WHITE, normalizeFrameworkHex(backgroundHex))) >= APCA_READABLE_TEXT_THRESHOLD
    ? WHITE
    : READABLE_BLACK;
}

export function getFrameworkReadableTextForGradient(startHex: string, endHex: string) {
  const backgrounds = [
    normalizeFrameworkHex(startHex),
    mixFrameworkHex(startHex, endHex, 0.5),
    normalizeFrameworkHex(endHex),
  ];
  const white = Math.min(...backgrounds.map((background) => Math.abs(apcaContrast(WHITE, background))));
  const black = Math.min(...backgrounds.map((background) => Math.abs(apcaContrast(READABLE_BLACK, background))));
  return white >= black ? WHITE : READABLE_BLACK;
}

export function getFrameworkPaletteCardText(paletteHex: string) {
  const ramp = buildFrameworkColorRamp(paletteHex).display;
  return getFrameworkReadableText(mixFrameworkHex(paletteHex, ramp[4] ?? paletteHex, 0.5));
}

function colorDistance(firstHex: string, secondHex: string) {
  const first = parseRgb(firstHex);
  const second = parseRgb(secondHex);
  return (first[0] - second[0]) ** 2
    + (first[1] - second[1]) ** 2
    + (first[2] - second[2]) ** 2;
}

function closestRampIndex(hex: string, ramp: string[]) {
  let closest = 0;
  let distance = Number.POSITIVE_INFINITY;
  ramp.forEach((shade, index) => {
    const candidate = colorDistance(hex, shade);
    if (candidate < distance) {
      closest = index;
      distance = candidate;
    }
  });
  return closest;
}

function resolveForeground(background: string, ramp: string[]) {
  const backgroundIndex = closestRampIndex(background, ramp);
  const indexes = ramp.length >= 8 ? [1, 0, 3, 4, 3, 6, 7, 6] : [1, 0, 3, 4, 3, 6, 5];
  return normalizeFrameworkHex(ramp[indexes[backgroundIndex] ?? 3] ?? background);
}

function resolveReadableText(background: string, foreground: string) {
  const mixed = mixFrameworkHex(background, foreground, 0.5);
  return Math.abs(apcaContrast(mixed, WHITE)) < APCA_READABLE_TEXT_THRESHOLD
    ? READABLE_BLACK
    : WHITE;
}

function resolveAccent(
  background: string,
  foreground: string,
  primaryAccent: string,
  text: string,
) {
  const mixed = mixFrameworkHex(background, foreground, 0.5);
  return Math.abs(apcaContrast(mixed, primaryAccent)) < APCA_ACCENT_THRESHOLD
    ? normalizeFrameworkHex(text)
    : normalizeFrameworkHex(primaryAccent);
}

export function resolveFrameworkScheme(
  backgroundShadeHex: string,
  accentHex: string,
  sourceRampHexes?: string[],
): PixflowDesignSystemColorGroup {
  const background = normalizeFrameworkHex(backgroundShadeHex);
  const ramp = sourceRampHexes?.length
    ? sourceRampHexes.map(normalizeFrameworkHex)
    : buildFrameworkColorRamp(background).display;
  const foreground = resolveForeground(background, ramp);
  const text = resolveReadableText(background, foreground);
  return {
    background,
    foreground,
    heading: text,
    text,
    accent: resolveAccent(background, foreground, normalizeFrameworkHex(accentHex), text),
  };
}

export function resolveFrameworkDerivedTokens(
  group: PixflowDesignSystemColorGroup,
  designStyle: PixflowDesignSystemProfile['designStyle'] = 'default',
) {
  const background = normalizeFrameworkHex(group.background);
  const foreground = designStyle === 'outlined'
    ? background
    : normalizeFrameworkHex(group.foreground);
  const text = normalizeFrameworkHex(group.text);
  return {
    background,
    foreground,
    heading: normalizeFrameworkHex(group.heading),
    text,
    accent: normalizeFrameworkHex(group.accent),
    border: designStyle === 'edgy'
      ? normalizeFrameworkHex(group.heading)
      : mixFrameworkHex(background, text, text === WHITE ? 0.2 : 0.15),
    input: mixFrameworkHex(background, text, text === WHITE ? 0.1 : 0.08),
    buttonText: getFrameworkReadableText(group.accent),
  };
}
