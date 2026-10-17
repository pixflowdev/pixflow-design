import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  PIXFLOW_FRAMEWORK_PROFILE_SCHEMA,
  type PixflowFrameworkColorGroup,
  type PixflowFrameworkDesignSystemProfile,
  type PixflowFrameworkProfileDocument,
  type PublishPixflowFrameworkDesignSystemRequest,
  type PublishPixflowFrameworkDesignSystemResponse,
} from '@open-design/contracts';

import {
  createUserDesignSystem,
  updateUserDesignSystem,
} from './design-systems.js';

const MAX_CONTEXT_BYTES = 1_000_000;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const USER_ID = /^user:([a-z0-9][a-z0-9-]{0,79})$/;
const COLOR_GROUP_NAMES = [
  'main',
  'secondary',
  'tertiary',
  'quaternary',
  'quinary',
  'senary',
] as const;
const COLOR_ROLE_NAMES = ['background', 'foreground', 'heading', 'text', 'accent'] as const;

function requiredText(value: unknown, label: string, maxLength = 160): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim().slice(0, maxLength);
}

function optionalText(value: unknown, maxLength = 500): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function color(value: unknown, label: string): string {
  const normalized = requiredText(value, label, 7);
  if (!HEX_COLOR.test(normalized)) throw new Error(`${label} must be a six-digit hex color`);
  return normalized.toLowerCase();
}

function colorGroup(value: unknown, label: string): PixflowFrameworkColorGroup {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is required`);
  }
  const record = value as Record<string, unknown>;
  return {
    background: color(record.background, `${label}.background`),
    foreground: color(record.foreground, `${label}.foreground`),
    heading: color(record.heading, `${label}.heading`),
    text: color(record.text, `${label}.text`),
    accent: color(record.accent, `${label}.accent`),
  };
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

export function normalizePixflowFrameworkProfile(
  value: unknown,
): PixflowFrameworkDesignSystemProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('profile is required');
  }
  const record = value as Record<string, unknown>;
  const colors = record.colors;
  if (!colors || typeof colors !== 'object' || Array.isArray(colors)) {
    throw new Error('profile.colors is required');
  }
  const colorRecord = colors as Record<string, unknown>;
  const normalizedColors: PixflowFrameworkDesignSystemProfile['colors'] = {
    main: colorGroup(colorRecord.main, 'profile.colors.main'),
    secondary: colorGroup(colorRecord.secondary, 'profile.colors.secondary'),
    tertiary: colorGroup(colorRecord.tertiary, 'profile.colors.tertiary'),
  };
  for (const name of COLOR_GROUP_NAMES.slice(3)) {
    if (colorRecord[name] !== undefined) {
      normalizedColors[name] = colorGroup(colorRecord[name], `profile.colors.${name}`);
    }
  }

  const sourcePalette = Array.isArray(record.sourcePalette)
    ? record.sourcePalette.slice(0, 32).map((entry, index) => color(entry, `profile.sourcePalette[${index}]`))
    : undefined;
  const schemeCount = typeof record.colorSchemeCount === 'number'
    ? Math.max(3, Math.min(6, Math.round(record.colorSchemeCount)))
    : undefined;

  return {
    colors: normalizedColors,
    ...(sourcePalette?.length ? { sourcePalette } : {}),
    ...(record.neutralTintHex === null
      ? { neutralTintHex: null }
      : typeof record.neutralTintHex === 'string'
        ? { neutralTintHex: color(record.neutralTintHex, 'profile.neutralTintHex') }
        : {}),
    ...(schemeCount ? { colorSchemeCount: schemeCount } : {}),
    headingFont: requiredText(record.headingFont, 'profile.headingFont', 120),
    bodyFont: requiredText(record.bodyFont, 'profile.bodyFont', 120),
    typographySize: enumValue(record.typographySize, ['small', 'regular', 'large'], 'regular'),
    headingWeightPreset: enumValue(record.headingWeightPreset, ['normal', 'medium', 'bold'], 'bold'),
    headingStylePreset: enumValue(record.headingStylePreset, ['default', 'spacious', 'uppercase'], 'default'),
    designStyle: enumValue(record.designStyle, ['unset', 'default', 'flat', 'outlined', 'edgy'], 'default'),
    buttonStylePreset: enumValue(
      record.buttonStylePreset,
      ['default', 'bubble', 'brick', 'gradient', 'sleek', 'elevate'],
      'default',
    ),
    ...(typeof record.buttonGradientEnd === 'string'
      ? { buttonGradientEnd: color(record.buttonGradientEnd, 'profile.buttonGradientEnd') }
      : {}),
    buttonRadius: enumValue(record.buttonRadius, ['unset', 'none', 'small', 'medium', 'large'], 'unset'),
    surfaceRadius: enumValue(record.surfaceRadius, ['unset', 'none', 'small', 'medium', 'large'], 'unset'),
  };
}

function canonicalize(
  value: unknown,
  depth = 0,
  budget: { remaining: number } = { remaining: 25_000 },
): unknown {
  if (depth > 24 || budget.remaining-- <= 0) {
    throw new Error('published design-system context is too deeply nested');
  }
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry, depth + 1, budget));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry, depth + 1, budget)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function pixflowFrameworkProfileHash(
  profile: PixflowFrameworkDesignSystemProfile,
): string {
  return createHash('sha256').update(stableJson(profile)).digest('hex');
}

function radiusValue(value: PixflowFrameworkDesignSystemProfile['buttonRadius']): string {
  return { unset: 'inherit', none: '0', small: '0.25rem', medium: '0.625rem', large: '999px' }[value];
}

function renderDesignMarkdown(
  title: string,
  summary: string | undefined,
  routeId: string,
  profile: PixflowFrameworkDesignSystemProfile,
): string {
  const colorSections = COLOR_GROUP_NAMES
    .filter((name) => profile.colors[name])
    .map((name) => {
      const group = profile.colors[name]!;
      const rows = COLOR_ROLE_NAMES.map((role) => `| ${role} | \`${group[role]}\` |`).join('\n');
      return `### ${name[0]!.toUpperCase()}${name.slice(1)}\n\n| Role | Value |\n| --- | --- |\n${rows}`;
    })
    .join('\n\n');

  return `# ${title}

> Category: Pixflow Framework
> Surface: web

${summary ?? `A reusable design system published from the Pixflow Framework route \`${routeId}\`.`}

## Source

- Route: \`${routeId}\`
- Exact round-trip profile: \`pixflow/profile.json\`
- Bricks token mapping: \`pixflow/bricks-token-map.json\`
- Route context: \`pixflow/route-context.json\`

## Colors

${colorSections}

## Typography

- Heading font: **${profile.headingFont}**
- Body font: **${profile.bodyFont}**
- Scale: **${profile.typographySize ?? 'regular'}**
- Heading weight: **${profile.headingWeightPreset ?? 'bold'}**
- Heading style: **${profile.headingStylePreset ?? 'default'}**

## Shape and controls

- Design style: **${profile.designStyle}**
- Button style: **${profile.buttonStylePreset ?? 'default'}**
- Button radius: **${profile.buttonRadius}**
- Surface radius: **${profile.surfaceRadius}**

## Usage

Use the semantic color roles instead of raw palette values. Preserve the heading/body font split, shape language, and button treatment across generated interfaces. When applying this package back to Pixflow Framework, use \`pixflow/profile.json\` for lossless restoration.
`;
}

function renderTokensCss(profile: PixflowFrameworkDesignSystemProfile): string {
  const declarations: string[] = [];
  for (const groupName of COLOR_GROUP_NAMES) {
    const group = profile.colors[groupName];
    if (!group) continue;
    for (const role of COLOR_ROLE_NAMES) {
      declarations.push(`  --pixflow-${groupName}-${role}: ${group[role]};`);
    }
  }
  declarations.push(`  --pixflow-font-heading: ${JSON.stringify(profile.headingFont)};`);
  declarations.push(`  --pixflow-font-body: ${JSON.stringify(profile.bodyFont)};`);
  declarations.push(`  --pixflow-button-radius: ${radiusValue(profile.buttonRadius)};`);
  declarations.push(`  --pixflow-surface-radius: ${radiusValue(profile.surfaceRadius)};`);
  return `:root {\n${declarations.join('\n')}\n}\n`;
}

function boundedRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = canonicalize(value) as Record<string, unknown>;
  if (Buffer.byteLength(JSON.stringify(record), 'utf8') > MAX_CONTEXT_BYTES) {
    throw new Error(`${label} is too large`);
  }
  return record;
}

function designSystemDir(root: string, id: string): string {
  const match = USER_ID.exec(id);
  if (!match) throw new Error('existingDesignSystemId must identify an editable user design system');
  return path.join(root, match[1]!);
}

function designSystemSlug(id: string): string {
  const match = USER_ID.exec(id);
  if (!match) throw new Error('published design system must identify an editable user design system');
  return match[1]!;
}

export async function publishPixflowFrameworkDesignSystem(
  root: string,
  input: PublishPixflowFrameworkDesignSystemRequest,
): Promise<PublishPixflowFrameworkDesignSystemResponse> {
  const title = requiredText(input.title, 'title');
  const summary = optionalText(input.summary, 1_000);
  const routeId = requiredText(input.routeId, 'routeId', 120);
  const profile = normalizePixflowFrameworkProfile(input.profile);
  const routeContext = boundedRecord(input.routeContext, 'routeContext');
  const bricksTokenMap = boundedRecord(input.bricksTokenMap, 'bricksTokenMap');
  const syncHash = pixflowFrameworkProfileHash(profile);
  const body = renderDesignMarkdown(title, summary, routeId, profile);
  const existingId = optionalText(input.existingDesignSystemId, 100);
  const siteUrl = optionalText(input.siteUrl, 2_000);
  const siteName = optionalText(input.siteName, 160);
  const packageInput = {
    title,
    ...(summary ? { summary } : {}),
    category: 'Pixflow Framework',
    surface: 'web' as const,
    status: 'published' as const,
    body,
    sourceNotes: `Published from Pixflow Framework route ${routeId}.`,
    provenance: {
      sourceNotes: `Lossless Pixflow Framework profile (${PIXFLOW_FRAMEWORK_PROFILE_SCHEMA}).`,
    },
  };

  const designSystem = existingId
    ? await updateUserDesignSystem(root, existingId, packageInput)
    : await createUserDesignSystem(root, packageInput);
  if (!designSystem) throw new Error('editable design system not found');

  const directory = designSystemDir(root, designSystem.id);
  const directoryId = designSystemSlug(designSystem.id);
  const pixflowDirectory = path.join(directory, 'pixflow');
  await mkdir(pixflowDirectory, { recursive: true });
  const document: PixflowFrameworkProfileDocument = {
    schemaVersion: PIXFLOW_FRAMEWORK_PROFILE_SCHEMA,
    syncHash,
    publishedAt: new Date().toISOString(),
    source: {
      routeId,
      ...(siteUrl ? { siteUrl } : {}),
      ...(siteName ? { siteName } : {}),
    },
    profile,
  };
  await Promise.all([
    writeFile(path.join(pixflowDirectory, 'profile.json'), stableJson(document), 'utf8'),
    writeFile(path.join(pixflowDirectory, 'route-context.json'), stableJson(routeContext), 'utf8'),
    writeFile(path.join(pixflowDirectory, 'bricks-token-map.json'), stableJson(bricksTokenMap), 'utf8'),
    writeFile(path.join(directory, 'tokens.json'), stableJson({ syncHash, profile }), 'utf8'),
    writeFile(path.join(directory, 'tokens.css'), renderTokensCss(profile), 'utf8'),
    writeFile(
      path.join(directory, 'manifest.json'),
      stableJson({
        schemaVersion: 'od-design-system-project/v1',
        id: directoryId,
        name: title,
        category: 'Pixflow Framework',
        ...(summary ? { description: summary } : {}),
        files: {
          design: 'DESIGN.md',
          tokens: 'tokens.css',
        },
        usage: 'pixflow/profile.json',
        sourceFiles: {
          tokens: 'tokens.json',
          evidence: 'pixflow/route-context.json',
          report: 'pixflow/bricks-token-map.json',
        },
        importMode: 'normalized',
      }),
      'utf8',
    ),
  ]);

  return {
    designSystem,
    designSystemId: designSystem.id,
    syncHash,
    created: !existingId,
    profileFile: 'pixflow/profile.json',
  };
}

export async function readPixflowFrameworkProfile(
  root: string,
  id: string,
): Promise<PixflowFrameworkProfileDocument | null> {
  let raw: string;
  try {
    raw = await readFile(path.join(designSystemDir(root, id), 'pixflow', 'profile.json'), 'utf8');
  } catch {
    return null;
  }
  const parsed = JSON.parse(raw) as PixflowFrameworkProfileDocument;
  if (parsed.schemaVersion !== PIXFLOW_FRAMEWORK_PROFILE_SCHEMA) return null;
  return parsed;
}
