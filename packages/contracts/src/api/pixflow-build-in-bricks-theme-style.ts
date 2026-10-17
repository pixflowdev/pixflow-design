export const PIXFLOW_BUILD_IN_BRICKS_THEME_STYLE_SCHEMA = 'pixflow.build_in_bricks.theme_style_context.v1' as const;

export type PixflowBuildInBricksThemeStylePolicy = 'inherit_effective' | 'isolated';
export type PixflowBuildInBricksThemeStyleResolutionStatus = 'available' | 'partial' | 'unavailable';

export type PixflowBuildInBricksThemeStyleDefaultValue = string | number | boolean | null;

export type PixflowBuildInBricksThemeStyleDefaults = {
  element: string;
  properties: Record<string, PixflowBuildInBricksThemeStyleDefaultValue | Record<string, unknown>>;
  responsive?: Record<string, Record<string, unknown>>;
};

export type PixflowBuildInBricksThemeStyleEntry = {
  id: string;
  label: string;
  order: number;
  active: boolean;
  conditions: Record<string, unknown>;
  defaults: PixflowBuildInBricksThemeStyleDefaults[];
  typography: {
    body?: string;
    headings?: string;
  };
};

export type PixflowBuildInBricksThemeStyleContext = {
  schema: typeof PIXFLOW_BUILD_IN_BRICKS_THEME_STYLE_SCHEMA;
  version: 1;
  policy: PixflowBuildInBricksThemeStylePolicy;
  targetPostId: number | null;
  route: {
    id: string;
    family: string;
    source: string;
  };
  loadingMethod: 'all' | 'specific' | 'unknown';
  breakpoints: Array<{ key: string; label: string; width: number | null; base: boolean }>;
  breakpointMode: {
    mobileFirst: boolean;
    baseKey: string;
  };
  resolution: {
    status: PixflowBuildInBricksThemeStyleResolutionStatus;
    reason: string;
    activeStyleIds: string[];
    styles: PixflowBuildInBricksThemeStyleEntry[];
  };
  capturedAt: string;
  snapshotHash: string;
  diagnostics: {
    supportedElementCount: number;
    omittedRuleCount: number;
    warnings: string[];
    unsupportedSettings: string[];
  };
};

export type PixflowBuildInBricksThemeStyleContextInput = {
  policy?: PixflowBuildInBricksThemeStylePolicy;
  targetPostId?: number | null;
  route?: Partial<PixflowBuildInBricksThemeStyleContext['route']>;
  loadingMethod?: unknown;
  activeStyleIds?: unknown;
  themeStyles?: unknown;
  capturedAt?: string;
  resolutionStatus?: PixflowBuildInBricksThemeStyleResolutionStatus;
  resolutionReason?: string;
  diagnostics?: unknown;
  breakpoints?: unknown;
  breakpointMode?: unknown;
};

export type PixflowBuildInBricksThemeStyleEffectiveDeclaration = {
  element: string;
  breakpoint: string | null;
  property: string;
  value: string;
};

/**
 * A Build source run may rely on destination defaults only when Bricks has
 * supplied an authoritative resolution. `partial` and `unavailable` are
 * explicit readiness states, not permission to invent defaults.
 */
export function isPixflowBuildInBricksThemeStyleContextAuthoritative(
  context: PixflowBuildInBricksThemeStyleContext | null | undefined,
): boolean {
  return Boolean(
    context
    && context.policy === 'inherit_effective'
    && context.resolution.status === 'available',
  );
}

const SUPPORTED_ELEMENTS = new Set([
  'page',
  'body',
  'section',
  'container',
  'block',
  'div',
  'heading',
  'text',
  'text-basic',
  'text-link',
  'button',
  'image',
  'list',
  'form',
  'form-field',
  'form-label',
  'form-placeholder',
  'form-submit',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);

const MAX_STYLES = 20;
const MAX_PROPERTIES = 120;
const MAX_DEPTH = 4;
const MAX_EFFECTIVE_PROMPT_DECLARATIONS = 480;
const MAX_UNSUPPORTED_SETTINGS = 80;
const DEFAULT_BRICKS_BREAKPOINT_KEYS = [
  'desktop',
  'tablet_landscape',
  'tablet_portrait',
  'mobile_landscape',
  'mobile_portrait',
] as const;

export function normalizePixflowBuildInBricksThemeStyleContext(
  input: PixflowBuildInBricksThemeStyleContextInput | null | undefined,
): PixflowBuildInBricksThemeStyleContext {
  const inputBreakpoints = normalizeBreakpoints(input?.breakpoints);
  const breakpointKeys = themeStyleBreakpointKeys(inputBreakpoints);
  if (
    input
    && typeof input === 'object'
    && (input as { schema?: unknown }).schema === PIXFLOW_BUILD_IN_BRICKS_THEME_STYLE_SCHEMA
    && record((input as unknown as { resolution?: unknown }).resolution).styles instanceof Array
  ) {
    const canonical = input as unknown as PixflowBuildInBricksThemeStyleContext;
    const breakpoints = normalizeBreakpoints(canonical.breakpoints);
    const canonicalUnsupportedSettings = boundedStrings(
      record(canonical.diagnostics).unsupportedSettings,
      MAX_UNSUPPORTED_SETTINGS,
    );
    const styles = canonical.resolution.styles.map((style) => ({
      ...style,
      defaults: style.defaults.map((defaults) => sanitizeCanonicalThemeStyleDefaults(
        defaults,
        breakpointKeys,
        canonicalUnsupportedSettings,
        `${style.id}.defaults.${defaults.element}`,
      )),
    }));
    const mode = record(canonical.breakpointMode);
    const { snapshotHash: _transportedHash, ...transportedBase } = canonical;
    const base = {
      ...transportedBase,
      breakpoints,
      resolution: {
        ...canonical.resolution,
        styles,
      },
      breakpointMode: {
        mobileFirst: mode.mobileFirst === true,
        baseKey: stringValue(mode.baseKey)
          || breakpoints.find((breakpoint) => breakpoint.base)?.key
          || 'desktop',
      },
      diagnostics: {
        supportedElementCount: Number(record(canonical.diagnostics).supportedElementCount) || 0,
        omittedRuleCount: Number(record(canonical.diagnostics).omittedRuleCount) || 0,
        warnings: boundedStrings(record(canonical.diagnostics).warnings, MAX_UNSUPPORTED_SETTINGS),
        unsupportedSettings: canonicalUnsupportedSettings,
      },
    };
    return {
      ...base,
      snapshotHash: stableSnapshotHash(base),
    };
  }
  const candidate = input ?? {};
  const activeStyleIds = uniqueStrings(candidate.activeStyleIds);
  const sourceDiagnostics = record(candidate.diagnostics);
  const unsupportedSettings = boundedStrings(sourceDiagnostics.unsupportedSettings, MAX_UNSUPPORTED_SETTINGS);
  const rawStyles = Array.isArray(candidate.themeStyles) ? candidate.themeStyles : [];
  const indexedStyles = rawStyles
    .filter((style): style is Record<string, unknown> => Boolean(style && typeof style === 'object' && !Array.isArray(style)))
    .map((style, index) => normalizeStyle(style, index, activeStyleIds, breakpointKeys, unsupportedSettings));
  const styles = normalizeEffectiveStyleOrder(indexedStyles, activeStyleIds).slice(0, MAX_STYLES);
  const omittedRuleCount = indexedStyles.reduce((count, style) => count + style.defaults.reduce((sum, defaults) => {
    const raw = defaults.properties as Record<string, unknown>;
    return sum + Object.keys(raw).length;
  }, 0), 0) - styles.reduce((count, style) => count + style.defaults.reduce((sum, defaults) => sum + Object.keys(defaults.properties).length, 0), 0);
  const status: PixflowBuildInBricksThemeStyleResolutionStatus = candidate.resolutionStatus
    || (activeStyleIds.length > 0 || styles.some((style) => style.active) ? 'available' : 'unavailable');
  const route = {
    id: stringValue(candidate.route?.id),
    family: stringValue(candidate.route?.family) || 'bricks',
    source: stringValue(candidate.route?.source) || 'wordpress_route_context',
  };
  const breakpoints = inputBreakpoints;
  const breakpointModeSource = record(candidate.breakpointMode);
  const breakpointMode = {
    mobileFirst: breakpointModeSource.mobileFirst === true,
    baseKey: stringValue(breakpointModeSource.baseKey)
      || breakpoints.find((breakpoint) => breakpoint.base)?.key
      || 'desktop',
  };
  const base = {
    schema: PIXFLOW_BUILD_IN_BRICKS_THEME_STYLE_SCHEMA,
    version: 1 as const,
    policy: candidate.policy === 'isolated' ? 'isolated' as const : 'inherit_effective' as const,
    targetPostId: typeof candidate.targetPostId === 'number' && candidate.targetPostId > 0 ? Math.trunc(candidate.targetPostId) : null,
    route,
    loadingMethod: (candidate.loadingMethod === 'all' || candidate.loadingMethod === 'specific' ? candidate.loadingMethod : 'unknown') as 'all' | 'specific' | 'unknown',
    breakpoints,
    breakpointMode,
    resolution: {
      status,
      reason: stringValue(candidate.resolutionReason) || (status === 'available'
        ? 'Bricks returned an applicable Theme Style environment.'
        : 'No authoritative applicable Theme Style environment was returned.'),
      activeStyleIds,
      styles,
    },
    capturedAt: stringValue(candidate.capturedAt) || new Date(0).toISOString(),
    diagnostics: {
      supportedElementCount: styles.reduce((count, style) => count + style.defaults.length, 0),
      omittedRuleCount: Math.max(0, omittedRuleCount),
      warnings: uniqueStrings([
        ...(Array.isArray(sourceDiagnostics.warnings) ? sourceDiagnostics.warnings : []),
        ...(styles.length >= MAX_STYLES && indexedStyles.length > styles.length
          ? ['Theme Style context was capped; omitted styles remain outside the prompt-readable surface.']
          : []),
        ...(activeStyleIds.some((id) => !styles.some((style) => style.id === id))
          ? ['One or more Bricks-resolved active Theme Styles were not present in the bounded context payload.']
          : []),
      ]),
      unsupportedSettings: boundedStrings(unsupportedSettings, MAX_UNSUPPORTED_SETTINGS),
    },
  };
  return {
    ...base,
    snapshotHash: stableSnapshotHash(base),
  };
}

export function formatPixflowBuildInBricksThemeStyleContext(
  context: PixflowBuildInBricksThemeStyleContext,
): string {
  const normalized = normalizePixflowBuildInBricksThemeStyleContext(context);
  const effective = listPixflowBuildInBricksThemeStyleEffectiveDeclarations(normalized);
  const grouped = new Map<string, Map<string, Array<[string, string]>>>();
  for (const declaration of effective.slice(0, MAX_EFFECTIVE_PROMPT_DECLARATIONS)) {
    const byBreakpoint = grouped.get(declaration.element) || new Map<string, Array<[string, string]>>();
    const breakpoint = declaration.breakpoint || 'base';
    const declarations = byBreakpoint.get(breakpoint) || [];
    declarations.push([declaration.property, declaration.value]);
    byBreakpoint.set(breakpoint, declarations);
    grouped.set(declaration.element, byBreakpoint);
  }
  const lines = [
    'EFFECTIVE BRICKS THEME STYLE (destination rendering environment)',
    `Policy: ${normalized.policy}`,
    `Resolution: ${normalized.resolution.status} - ${normalized.resolution.reason}`,
    `Snapshot: ${normalized.snapshotHash}`,
    `Loading method: ${normalized.loadingMethod}`,
    normalized.resolution.activeStyleIds.length > 0
      ? `Applicable styles (effective order): ${normalized.resolution.activeStyleIds.join(', ')}`
      : 'Applicable styles (effective order): none returned',
    '',
    'Use this as the native Bricks default environment. If the requested design agrees with a listed default, it may rely on that default. If it differs, explicitly override the relevant property in authored CSS. Do not duplicate every inherited default in local source.',
  ];
  if (grouped.size > 0) lines.push('', 'Effective inherited declarations:');
  for (const [element, byBreakpoint] of grouped) {
    lines.push(`${element}:`);
    const orderedBreakpoints = [...byBreakpoint.keys()].sort((left, right) => {
      if (left === 'base') return -1;
      if (right === 'base') return 1;
      const leftIndex = normalized.breakpoints.findIndex((entry) => entry.key === left || `${entry.width}px` === left || String(entry.width) === left);
      const rightIndex = normalized.breakpoints.findIndex((entry) => entry.key === right || `${entry.width}px` === right || String(entry.width) === right);
      return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
        || left.localeCompare(right);
    });
    for (const breakpoint of orderedBreakpoints) {
      const breakpointRecord = normalized.breakpoints.find((entry) => entry.key === breakpoint || `${entry.width}px` === breakpoint || String(entry.width) === breakpoint);
      const label = breakpoint === 'base'
        ? 'base'
        : `${breakpointRecord?.label || breakpoint}${breakpointRecord?.width !== null && breakpointRecord?.width !== undefined ? ` (${breakpointRecord.width}px)` : ''}`;
      lines.push(`  ${label}:`);
      for (const [property, value] of byBreakpoint.get(breakpoint) || []) {
        lines.push(`    ${property}: ${value}`);
      }
    }
  }
  if (normalized.diagnostics.warnings.length > 0) {
    lines.push('', `Theme Style context diagnostics: ${normalized.diagnostics.warnings.join('; ')}`);
  }
  if (normalized.diagnostics.unsupportedSettings.length > 0) {
    lines.push('', `Theme Style unsupported settings omitted: ${normalized.diagnostics.unsupportedSettings.join('; ')}`);
  }
  if (effective.length > MAX_EFFECTIVE_PROMPT_DECLARATIONS) {
    lines.push('', `Theme Style context diagnostics: ${effective.length - MAX_EFFECTIVE_PROMPT_DECLARATIONS} lower-priority effective declarations were omitted from the prompt ledger.`);
  }
  return lines.join('\n');
}

/**
 * Render-only approximation of supported native defaults. This string is
 * injected into the browser capture page and is never written to a source
 * artifact or sent to the converter. Unsupported Bricks selectors remain
 * outside the HTML-first review contract rather than being guessed here.
 */
export function formatPixflowBuildInBricksThemeStylePreviewCss(
  context: PixflowBuildInBricksThemeStyleContext,
): string {
  if (context.policy !== 'inherit_effective') return '';
  const selectors: Record<string, string> = {
    page: ':root',
    body: 'body',
    section: 'section, .brxe-section',
    // Bricks owns the page <main> boundary; it is not a native container.
    // Mirror the converter's normal web-container class contract so inherited
    // gutters/max-width affect the source node that will become a container,
    // without widening the flattened page root during rendered review.
    container: ':where(section, header, footer) > div:is(.container, .wrap, [class$="-container"], [class*="-container "], [class$="_container"], [class*="_container "], [class*="__container"], [class*="__inner"], .site-shell, .page-shell, .content-shell, .layout-shell), .brxe-container',
    block: '.brxe-block',
    div: '.brxe-div',
    heading: 'h1, h2, h3, h4, h5, h6, .brxe-heading',
    text: 'p, .brxe-text, .brxe-text-basic',
    'text-basic': 'p, .brxe-text-basic',
    'text-link': 'a, .brxe-text-link',
    button: 'button, .brxe-button, a[role="button"]',
    image: 'img, .brxe-image',
    list: 'ul, ol, .brxe-list',
    form: 'form, .brxe-form',
    'form-field': 'form input:not([type="submit"]), form textarea, form select, .brxe-form input:not([type="submit"]), .brxe-form textarea, .brxe-form select',
    'form-label': 'form label, .brxe-form label',
    'form-placeholder': 'form input::placeholder, form textarea::placeholder, .brxe-form input::placeholder, .brxe-form textarea::placeholder',
    'form-submit': 'form button[type="submit"], form input[type="submit"], .brxe-form button[type="submit"], .brxe-form input[type="submit"]',
    h1: 'h1',
    h2: 'h2',
    h3: 'h3',
    h4: 'h4',
    h5: 'h5',
    h6: 'h6',
  };
  const rules: string[] = [];
  const grouped = new Map<string, Map<string, PixflowBuildInBricksThemeStyleEffectiveDeclaration[]>>();
  for (const declaration of listPixflowBuildInBricksThemeStyleEffectiveDeclarations(context)) {
    const selector = selectors[declaration.element];
    if (!selector) continue;
    const byBreakpoint = grouped.get(declaration.element) || new Map<string, PixflowBuildInBricksThemeStyleEffectiveDeclaration[]>();
    const breakpoint = declaration.breakpoint || 'base';
    const declarations = byBreakpoint.get(breakpoint) || [];
    declarations.push(declaration);
    byBreakpoint.set(breakpoint, declarations);
    grouped.set(declaration.element, byBreakpoint);
  }
  for (const [element, byBreakpoint] of grouped) {
    const selector = selectors[element];
    if (!selector) continue;
    const breakpointOrder = new Map(context.breakpoints.map((entry, index) => [entry.key, index] as const));
    const orderedBreakpoints = [...byBreakpoint.entries()].sort(([left], [right]) => {
      if (left === 'base') return -1;
      if (right === 'base') return 1;
      return (breakpointOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
        - (breakpointOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
        || left.localeCompare(right);
    });
    for (const [breakpoint, declarations] of orderedBreakpoints) {
      const css = declarations
        .slice(0, 80)
        .map((declaration) => `  ${declaration.property}: ${declaration.value};`)
        .join('\n');
      if (!css) continue;
      if (breakpoint === 'base') {
        rules.push(`${selector} {\n${css}\n}`);
        continue;
      }
      const media = responsiveMediaQuery(breakpoint, context);
      if (media) rules.push(`${media} {\n${selector} {\n${css}\n}\n}`);
    }
  }
  return rules.length > 0
    ? `/* Pixflow render-only Bricks Theme Style snapshot ${context.snapshotHash} */\n${rules.join('\n')}`
    : '';
}

/**
 * Return the effective supported declaration surface after applying the
 * Bricks-resolved active-style order. This is shared by render simulation and
 * source validation so neither layer invents an independent cascade model.
 */
export function listPixflowBuildInBricksThemeStyleEffectiveDeclarations(
  context: PixflowBuildInBricksThemeStyleContext,
): PixflowBuildInBricksThemeStyleEffectiveDeclaration[] {
  if (context.policy !== 'inherit_effective') return [];
  const effective = new Map<string, PixflowBuildInBricksThemeStyleEffectiveDeclaration>();
  for (const style of context.resolution.styles.filter((entry) => entry.active)) {
    for (const defaults of style.defaults) {
      // Bricks emits the heading-group control and each H1-H6 control in
      // stored style order. Both selectors have the same type-selector
      // specificity, so a later applicable style's heading-group declaration
      // can legitimately replace an earlier style's H1-specific declaration.
      // Project that native selector relationship into the canonical ledger
      // instead of treating `heading` and `h1` as unrelated policy buckets.
      const targetElements = defaults.element === 'heading'
        ? ['heading', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']
        : [defaults.element];
      for (const [property, value] of flattenThemeStyleProperties(defaults.properties)) {
        if (!/^[a-z][a-z0-9-]*$/i.test(property)) continue;
        for (const element of targetElements) {
          const declaration = {
            element,
            breakpoint: null,
            property,
            value: formatPreviewValue(value),
          } satisfies PixflowBuildInBricksThemeStyleEffectiveDeclaration;
          effective.set(`${declaration.element}\u0000\u0000${declaration.property}`, declaration);
        }
      }
      for (const [breakpoint, properties] of Object.entries(defaults.responsive || {})) {
        for (const [property, value] of flattenThemeStyleProperties(properties)) {
          if (!/^[a-z][a-z0-9-]*$/i.test(property)) continue;
          for (const element of targetElements) {
            const declaration = {
              element,
              breakpoint,
              property,
              value: formatPreviewValue(value),
            } satisfies PixflowBuildInBricksThemeStyleEffectiveDeclaration;
            effective.set(`${declaration.element}\u0000${breakpoint}\u0000${declaration.property}`, declaration);
          }
        }
      }
    }
  }
  return [...effective.values()];
}

function normalizeStyle(
  style: Record<string, unknown>,
  index: number,
  activeStyleIds: string[],
  breakpointKeys: Set<string>,
  unsupportedSettings: string[],
): PixflowBuildInBricksThemeStyleEntry {
  const id = stringValue(style.id) || `style-${index + 1}`;
  const settings = record(style.settings);
  const typography = record(settings.typography);
  const defaults: PixflowBuildInBricksThemeStyleDefaults[] = [];
  const typographyDefaults: Array<[string, string, string?]> = [
    ['body', 'typographyBody', 'body'],
    ['heading', 'typographyHeadings', 'heading'],
    ['h1', 'typographyHeadingH1'],
    ['h2', 'typographyHeadingH2'],
    ['h3', 'typographyHeadingH3'],
    ['h4', 'typographyHeadingH4'],
    ['h5', 'typographyHeadingH5'],
    ['h6', 'typographyHeadingH6'],
    ['text', 'typographyParagraph'],
    ['text-link', 'typographyLink'],
  ];
  for (const [element, controlKey, fallbackKey] of typographyDefaults) {
    const resolvedControlKey = hasThemeStyleControl(typography, controlKey)
      ? controlKey
      : fallbackKey && hasThemeStyleControl(typography, fallbackKey) ? fallbackKey : controlKey;
    const normalizedDefaults = normalizeThemeStyleControl(
      element,
      typography,
      resolvedControlKey,
      breakpointKeys,
      unsupportedSettings,
      `${id}.settings.typography.${resolvedControlKey}`,
    );
    if (normalizedDefaults) defaults.push(normalizedDefaults);
  }

  const links = record(settings.links);
  const linkDefaults = normalizeThemeStyleDefaults('text-link', semanticControlSettings(links, {
    typography: 'typography',
  }), breakpointKeys, unsupportedSettings, `${id}.settings.links`);
  if (linkDefaults) defaults.push(linkDefaults);

  const general = record(settings.general);
  const bodySurfaceDefaults = normalizeThemeStyleDefaults('body', semanticControlSettings(general, {
    siteBackground: 'background',
  }), breakpointKeys, unsupportedSettings, `${id}.settings.general`);
  if (bodySurfaceDefaults) defaults.push(bodySurfaceDefaults);

  const button = record(settings.button);
  const buttonDefaults = normalizeThemeStyleDefaults('button', semanticControlSettings(button, {
    _background: '_background',
    _border_radius: '_border_radius',
    sizeDefaultPadding: 'padding',
    padding: 'padding',
    typography: 'typography',
    border: 'border',
    transition: 'transition',
  }), breakpointKeys, unsupportedSettings, `${id}.settings.button`);
  if (buttonDefaults) defaults.push(buttonDefaults);

  const form = record(settings.form);
  const formMappings: Array<[string, Record<string, string>]> = [
    ['form-label', { labelTypography: 'typography' }],
    ['form-placeholder', { placeholderTypography: 'typography' }],
    ['form-field', {
      fieldTypography: 'typography',
      fieldBackgroundColor: 'background-color',
      fieldBorder: 'border',
      fieldMargin: 'margin',
      fieldPadding: 'padding',
    }],
    ['form-submit', { submitButtonBorder: 'border' }],
  ];
  for (const [element, mappings] of formMappings) {
    const normalizedDefaults = normalizeThemeStyleDefaults(element, semanticControlSettings(form, mappings), breakpointKeys, unsupportedSettings, `${id}.settings.form`);
    if (normalizedDefaults) defaults.push(normalizedDefaults);
  }

  const image = record(settings.image);
  const imageDefaults = normalizeThemeStyleDefaults('image', semanticControlSettings(image, {
    border: 'border',
  }), breakpointKeys, unsupportedSettings, `${id}.settings.image`);
  if (imageDefaults) defaults.push(imageDefaults);

  for (const [element, value] of Object.entries(settings)) {
    if (['typography', 'links', 'general', 'button', 'form', 'image'].includes(element)) continue;
    if (!SUPPORTED_ELEMENTS.has(element)) continue;
    const normalizedDefaults = normalizeThemeStyleDefaults(element, value, breakpointKeys, unsupportedSettings, `${id}.settings.${element}`);
    if (normalizedDefaults) defaults.push(normalizedDefaults);
  }
  return {
    id,
    label: stringValue(style.label) || stringValue(style.name) || 'Theme Style',
    // WordPress/Bricks may provide an explicit cascade order. When it does
    // not, leave the value outside the effective order contract so incidental
    // option-array order cannot become a snapshot identity input.
    order: typeof style.order === 'number' && Number.isFinite(style.order)
      ? style.order
      : Number.MAX_SAFE_INTEGER,
    active: style.active === true || activeStyleIds.includes(id),
    conditions: record(style.conditions),
    defaults,
    typography: {
      ...(stringValue(record(typography.typographyBody)['font-family']) ? { body: stringValue(record(typography.typographyBody)['font-family']) } : {}),
      ...(stringValue(record(typography.typographyHeadings)['font-family']) ? { headings: stringValue(record(typography.typographyHeadings)['font-family']) } : {}),
    },
  };
}

function semanticControlSettings(
  source: Record<string, unknown>,
  mappings: Record<string, string>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [sourceProperty, targetProperty] of Object.entries(mappings)) {
    if (source[sourceProperty] !== undefined) output[targetProperty] = source[sourceProperty];
    const prefix = `${sourceProperty}:`;
    for (const [property, value] of Object.entries(source)) {
      if (!property.startsWith(prefix)) continue;
      const breakpoint = property.slice(prefix.length).trim();
      if (breakpoint) output[`${targetProperty}:${breakpoint}`] = value;
    }
  }
  return output;
}

/**
 * Bricks supplies active style ids in effective cascade order. The stored
 * option order is not part of that effective result and may vary when the
 * same options are decoded from a different map/array order. Keep the
 * authoritative active order, then place inactive diagnostic records in a
 * deterministic id order.
 */
function normalizeEffectiveStyleOrder(
  styles: PixflowBuildInBricksThemeStyleEntry[],
  activeStyleIds: string[],
): PixflowBuildInBricksThemeStyleEntry[] {
  const orderedActiveIds = activeStyleIds.length > 0
    ? activeStyleIds
    : styles
      .filter((style) => style.active)
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map((style) => style.id);
  const activeOrder = new Map(orderedActiveIds.map((id, index) => [id, index] as const));
  const ordered = [...styles].sort((left, right) => {
    const leftRank = activeOrder.get(left.id);
    const rightRank = activeOrder.get(right.id);
    if (leftRank !== undefined || rightRank !== undefined) {
      if (leftRank === undefined) return 1;
      if (rightRank === undefined) return -1;
      return leftRank - rightRank;
    }
    return left.id.localeCompare(right.id);
  });

  let inactiveOrder = orderedActiveIds.length;
  return ordered.map((style) => {
    const activeRank = activeOrder.get(style.id);
    const order = activeRank === undefined ? inactiveOrder++ : activeRank;
    return order === style.order ? style : { ...style, order };
  });
}

function normalizeThemeStyleDefaults(
  element: string,
  value: unknown,
  breakpointKeys: Set<string>,
  unsupportedSettings: string[],
  path: string,
): PixflowBuildInBricksThemeStyleDefaults | null {
  const source = record(value);
  const baseProperties: Record<string, unknown> = {};
  const responsiveSource: Record<string, Record<string, unknown>> = {};
  for (const [controlKey, controlValue] of Object.entries(source)) {
    if (controlKey === 'responsive' || controlKey === '_responsive') {
      pushUnsupportedSetting(unsupportedSettings, `${path}.${controlKey} (nested responsive maps are not native Bricks control storage)`);
      continue;
    }
    const separator = controlKey.indexOf(':');
    if (separator < 0) {
      baseProperties[controlKey] = sanitizeThemeStyleControlValue(controlValue, `${path}.${controlKey}`, unsupportedSettings);
      continue;
    }
    const baseControlKey = controlKey.slice(0, separator);
    const breakpoint = controlKey.slice(separator + 1);
    if (!baseControlKey || !breakpointKeys.has(breakpoint)) {
      pushUnsupportedSetting(unsupportedSettings, `${path}.${controlKey} (unknown or unsupported breakpoint control)`);
      continue;
    }
    responsiveSource[breakpoint] = {
      ...(responsiveSource[breakpoint] || {}),
      [baseControlKey]: sanitizeThemeStyleControlValue(controlValue, `${path}.${controlKey}`, unsupportedSettings),
    };
  }
  const properties = Object.fromEntries(flattenThemeStyleProperties(baseProperties));
  const responsive = Object.fromEntries(Object.entries(responsiveSource)
    .map(([breakpoint, breakpointValue]) => [breakpoint, Object.fromEntries(flattenThemeStyleProperties(record(breakpointValue)))])
    .filter(([, breakpointValue]) => Object.keys(breakpointValue as Record<string, unknown>).length > 0)) as Record<string, Record<string, unknown>>;
  if (Object.keys(properties).length === 0 && Object.keys(responsive).length === 0) return null;
  return {
    element,
    properties,
    ...(Object.keys(responsive).length > 0 ? { responsive } : {}),
  };
}

function normalizeThemeStyleControl(
  element: string,
  source: Record<string, unknown>,
  controlKey: string,
  breakpointKeys: Set<string>,
  unsupportedSettings: string[],
  path: string,
): PixflowBuildInBricksThemeStyleDefaults | null {
  const properties = Object.fromEntries(flattenThemeStyleProperties(record(
    sanitizeThemeStyleControlValue(source[controlKey], path, unsupportedSettings),
  )));
  const responsive: Record<string, Record<string, unknown>> = {};
  const prefix = `${controlKey}:`;
  for (const [candidateKey, candidateValue] of Object.entries(source)) {
    if (!candidateKey.startsWith(prefix)) continue;
    const breakpoint = candidateKey.slice(prefix.length).trim();
    if (!breakpointKeys.has(breakpoint)) {
      pushUnsupportedSetting(unsupportedSettings, `${path}:${breakpoint} (unknown or unsupported breakpoint control)`);
      continue;
    }
    const responsiveProperties = Object.fromEntries(flattenThemeStyleProperties(record(
      sanitizeThemeStyleControlValue(candidateValue, `${path}:${breakpoint}`, unsupportedSettings),
    )));
    if (Object.keys(responsiveProperties).length > 0) responsive[breakpoint] = responsiveProperties;
  }
  if (Object.keys(properties).length === 0 && Object.keys(responsive).length === 0) return null;
  return {
    element,
    properties,
    ...(Object.keys(responsive).length > 0 ? { responsive } : {}),
  };
}

function sanitizeCanonicalThemeStyleDefaults(
  defaults: PixflowBuildInBricksThemeStyleDefaults,
  breakpointKeys: Set<string>,
  unsupportedSettings: string[],
  path: string,
): PixflowBuildInBricksThemeStyleDefaults {
  const sanitizeProperties = (value: unknown, propertyPath: string): Record<string, unknown> => Object.fromEntries(
    Object.entries(record(value)).filter(([property]) => {
      if (!property.includes(':')) return true;
      pushUnsupportedSetting(unsupportedSettings, `${propertyPath}.${property} (breakpoint suffix belongs on the Bricks control key)`);
      return false;
    }),
  );
  const properties = sanitizeProperties(defaults.properties, path) as PixflowBuildInBricksThemeStyleDefaults['properties'];
  const responsive = Object.fromEntries(Object.entries(record(defaults.responsive)).flatMap(([breakpoint, value]) => {
    if (!breakpointKeys.has(breakpoint)) {
      pushUnsupportedSetting(unsupportedSettings, `${path}.responsive.${breakpoint} (unknown or unsupported breakpoint control)`);
      return [];
    }
    const responsiveProperties = sanitizeProperties(value, `${path}.responsive.${breakpoint}`);
    return Object.keys(responsiveProperties).length > 0 ? [[breakpoint, responsiveProperties]] : [];
  })) as Record<string, Record<string, unknown>>;
  return {
    element: defaults.element,
    properties,
    ...(Object.keys(responsive).length > 0 ? { responsive } : {}),
  };
}

function hasThemeStyleControl(source: Record<string, unknown>, controlKey: string): boolean {
  return source[controlKey] !== undefined || Object.keys(source).some((key) => key.startsWith(`${controlKey}:`));
}

function sanitizeThemeStyleControlValue(
  value: unknown,
  path: string,
  unsupportedSettings: string[],
  depth = 0,
): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > MAX_DEPTH) return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key.includes(':')) {
      pushUnsupportedSetting(unsupportedSettings, `${path}.${key} (breakpoint suffix belongs on the Bricks control key)`);
      continue;
    }
    output[key] = sanitizeThemeStyleControlValue(item, `${path}.${key}`, unsupportedSettings, depth + 1);
  }
  return output;
}

function pushUnsupportedSetting(target: string[], value: string): void {
  if (target.length >= MAX_UNSUPPORTED_SETTINGS || target.includes(value)) return;
  target.push(value);
}

function compactRecord(value: unknown, depth: number): Record<string, unknown> {
  if (depth > MAX_DEPTH || !value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, MAX_PROPERTIES)) {
    if (item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      out[key] = item;
    } else if (Array.isArray(item)) {
      out[key] = item.slice(0, 24).map((entry) => (entry && typeof entry === 'object' ? compactRecord(entry, depth + 1) : entry));
    } else if (item && typeof item === 'object') {
      out[key] = compactRecord(item, depth + 1);
    }
  }
  return out;
}

function flattenThemeStyleProperties(
  properties: Record<string, unknown>,
): Array<[string, PixflowBuildInBricksThemeStyleDefaultValue]> {
  const output: Array<[string, PixflowBuildInBricksThemeStyleDefaultValue]> = [];
  const aliases: Record<string, string> = {
    _background: 'background',
    _color: 'color',
    _font_family: 'font-family',
    _font_size: 'font-size',
    _font_weight: 'font-weight',
    _line_height: 'line-height',
    _letter_spacing: 'letter-spacing',
    _border_radius: 'border-radius',
    _box_shadow: 'box-shadow',
    _max_width: 'max-width',
    _min_height: 'min-height',
    widthMax: 'max-width',
    _rowGap: 'row-gap',
    _columnGap: 'column-gap',
  };
  for (const [rawProperty, value] of Object.entries(properties)) {
    const property = aliases[rawProperty] || cssPropertyName(rawProperty);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const directValue = themeStyleCssValue(value);
      if (directValue !== null) {
        output.push([property === 'background' && record(value).raw ? 'background-color' : property, directValue]);
        continue;
      }
      for (const [child, childValue] of Object.entries(value as Record<string, unknown>)) {
        const childProperty = cssPropertyName(child);
        if (property === 'border' && childProperty === 'radius') {
          const radius = record(childValue);
          const corners: Record<string, string> = {
            top: 'border-top-left-radius',
            right: 'border-top-right-radius',
            bottom: 'border-bottom-right-radius',
            left: 'border-bottom-left-radius',
          };
          for (const [side, cssProperty] of Object.entries(corners)) {
            const normalizedValue = themeStyleCssValue(radius[side]);
            if (normalizedValue !== null) output.push([cssProperty, normalizedValue]);
          }
        } else if (property === 'border' && childProperty === 'width') {
          const width = record(childValue);
          for (const side of ['top', 'right', 'bottom', 'left']) {
            const normalizedValue = themeStyleCssValue(width[side]);
            if (normalizedValue !== null) output.push([`border-${side}-width`, normalizedValue]);
          }
        } else if (property === 'border' && childProperty === 'color') {
          const normalizedValue = themeStyleCssValue(childValue);
          if (normalizedValue !== null) output.push(['border-color', normalizedValue]);
        } else if (property === 'border' && childProperty === 'style') {
          const normalizedValue = themeStyleCssValue(childValue);
          if (normalizedValue !== null) output.push(['border-style', normalizedValue]);
        } else
        if (/^(top|right|bottom|left)$/.test(childProperty)) {
          const expanded = property === 'padding' || property === 'margin' || property === 'border'
            ? `${property}-${childProperty}`
            : childProperty;
          const normalizedValue = themeStyleCssValue(childValue);
          if (normalizedValue !== null) output.push([expanded, normalizedValue]);
        } else if (property === 'typography') {
          const normalizedValue = themeStyleCssValue(childValue);
          if (normalizedValue !== null) output.push([childProperty, normalizedValue]);
        }
      }
      continue;
    }
    const normalizedValue = themeStyleCssValue(value);
    if (normalizedValue !== null) output.push([property, normalizedValue]);
  }
  return output;
}

function cssPropertyName(value: string): string {
  return value
    .replace(/^_/, '')
    .replace(/_/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function themeStyleCssValue(value: unknown): string | number | boolean | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  const source = record(value);
  const raw = stringValue(source.raw) || stringValue(source.hex);
  if (raw) return raw;
  const size = source.size ?? source.value;
  if ((typeof size === 'string' || typeof size === 'number') && String(size).trim()) {
    return `${String(size).trim()}${stringValue(source.unit)}`;
  }
  return null;
}

function formatPreviewValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'initial' : 'none';
  return JSON.stringify(value);
}

function responsiveMediaQuery(breakpoint: string, context: PixflowBuildInBricksThemeStyleContext): string | null {
  const configured = context.breakpoints.find((entry) => entry.key === breakpoint);
  if (configured?.base) return null;
  if (configured && typeof configured.width === 'number' && Number.isFinite(configured.width)) {
    return `@media (${context.breakpointMode.mobileFirst ? 'min' : 'max'}-width: ${configured.width}px)`;
  }
  const normalized = String(breakpoint || '').trim().replace(/px$/i, '');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  return `@media (${context.breakpointMode.mobileFirst ? 'min' : 'max'}-width: ${normalized}px)`;
}

function normalizeBreakpoints(value: unknown): PixflowBuildInBricksThemeStyleContext['breakpoints'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    .map((item) => ({
      key: stringValue(item.key),
      label: stringValue(item.label) || stringValue(item.key),
      width: typeof item.width === 'number' && Number.isFinite(item.width) ? item.width : null,
      base: item.base === true,
    }))
    .filter((item) => item.key)
    .slice(0, 12);
}

function themeStyleBreakpointKeys(
  breakpoints: PixflowBuildInBricksThemeStyleContext['breakpoints'],
): Set<string> {
  return new Set(breakpoints.length > 0
    ? breakpoints.map((breakpoint) => breakpoint.key)
    : DEFAULT_BRICKS_BREAKPOINT_KEYS);
}

function stableSnapshotHash(value: unknown): string {
  const text = JSON.stringify(sortRecord(canonicalThemeStyleHashInput(value)));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `theme-style-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Return only the effective, semantic Theme Style surface for identity.
 * Capture timestamps, route labels, resolver prose, diagnostics and inactive
 * option records are intentionally excluded. Bricks' resolved activeStyleIds
 * remain ordered because that order is the cascade contract.
 */
function canonicalThemeStyleHashInput(value: unknown): Record<string, unknown> {
  const source = record(value);
  const resolution = record(source.resolution);
  const activeStyleIds = uniqueStrings(resolution.activeStyleIds);
  const rawStyles = Array.isArray(resolution.styles)
    ? resolution.styles.filter((style): style is Record<string, unknown> => Boolean(style && typeof style === 'object' && !Array.isArray(style)))
    : [];
  const normalizedStyles = normalizeEffectiveStyleOrder(
    rawStyles.map((style, index) => ({
      id: stringValue(style.id) || `style-${index + 1}`,
      label: stringValue(style.label),
      order: typeof style.order === 'number' ? style.order : index,
      active: style.active === true || activeStyleIds.includes(stringValue(style.id)),
      conditions: record(style.conditions),
      defaults: Array.isArray(style.defaults) ? style.defaults as PixflowBuildInBricksThemeStyleDefaults[] : [],
      typography: record(style.typography) as PixflowBuildInBricksThemeStyleEntry['typography'],
    })),
    activeStyleIds,
  )
    .filter((style) => style.active || activeStyleIds.includes(style.id))
    .map((style) => ({
      id: style.id,
      order: style.order,
      defaults: canonicalDefaults(style.defaults),
      typography: style.typography,
    }));
  const effectiveActiveStyleIds = activeStyleIds.length > 0
    ? activeStyleIds
    : normalizedStyles
      .filter((style) => style.order >= 0)
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map((style) => style.id);

  // Bricks iterates the configured breakpoint array when it emits overlapping
  // media rules. Preserve that authoritative order in snapshot identity.
  const breakpoints = normalizeBreakpoints(source.breakpoints)
    .map(({ key, width, base }) => ({ key, width, base }));
  const breakpointMode = record(source.breakpointMode);

  return {
    schema: source.schema || PIXFLOW_BUILD_IN_BRICKS_THEME_STYLE_SCHEMA,
    version: source.version || 1,
    policy: source.policy === 'isolated' ? 'isolated' : 'inherit_effective',
    breakpoints,
    breakpointMode: {
      mobileFirst: breakpointMode.mobileFirst === true,
      baseKey: stringValue(breakpointMode.baseKey) || 'desktop',
    },
    resolution: {
      status: resolution.status || 'unavailable',
      activeStyleIds: effectiveActiveStyleIds,
      styles: normalizedStyles,
    },
  };
}

function canonicalDefaults(
  defaults: PixflowBuildInBricksThemeStyleDefaults[],
): Array<Record<string, unknown>> {
  const merged = new Map<string, { properties: Record<string, unknown>; responsive: Record<string, Record<string, unknown>> }>();
  for (const entry of defaults) {
    const element = stringValue(entry.element);
    if (!element) continue;
    const previous = merged.get(element) || { properties: {}, responsive: {} };
    previous.properties = { ...previous.properties, ...entry.properties };
    for (const [breakpoint, properties] of Object.entries(entry.responsive || {})) {
      previous.responsive[breakpoint] = {
        ...(previous.responsive[breakpoint] || {}),
        ...properties,
      };
    }
    merged.set(element, previous);
  }
  return [...merged.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([element, value]) => ({
      element,
      properties: value.properties,
      ...(Object.keys(value.responsive).length > 0 ? { responsive: value.responsive } : {}),
    }));
}

function sortRecord(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortRecord);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortRecord(item)]));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].slice(0, MAX_STYLES)
    : [];
}

function boundedStrings(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].slice(0, limit)
    : [];
}
