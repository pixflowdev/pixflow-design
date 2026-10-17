import type { PixflowDesignValueProvenance } from './pixflow-design-value-provenance.js';
import type { PixflowPromptProvenance } from './pixflow-prompt-provenance.js';
import {
  formatPixflowBuildInBricksThemeStyleContext,
  listPixflowBuildInBricksThemeStyleEffectiveDeclarations,
  type PixflowBuildInBricksThemeStyleContext,
} from './pixflow-build-in-bricks-theme-style.js';
import type { PixflowBuildInBricksThemeStylePolicy } from './pixflow-build-in-bricks-theme-style.js';
import type { PixflowBuildInBricksSkillManifest } from './pixflow-build-in-bricks-skills.js';

export const PIXFLOW_BUILD_IN_BRICKS_STAGE_A_SCHEMA = 'pixflow.build_in_bricks.stage_a.v1' as const;
export const PIXFLOW_BUILD_IN_BRICKS_CONTEXT_SCHEMA = 'pixflow.build_in_bricks.design_context.v1' as const;

export type PixflowBuildInBricksGenerationScope = 'full_page' | 'section' | 'component';

export type PixflowBuildInBricksBreakpoint = {
  key: string;
  label: string;
  width: number | null;
  base: boolean;
};

export type PixflowBuildInBricksClass = {
  id?: string;
  name: string;
  collision?: 'framework' | 'user' | 'unknown';
};

export type PixflowBuildInBricksToken = {
  id?: string;
  name?: string;
  cssVar: string;
  value?: string;
  category?: string;
  semanticRole?: string;
  provenance: Partial<PixflowDesignValueProvenance>;
};

export type PixflowBuildInBricksDesignContext = {
  schema: typeof PIXFLOW_BUILD_IN_BRICKS_CONTEXT_SCHEMA;
  version: 1;
  revision: string;
  capturedAt: string;
  generationScope?: PixflowBuildInBricksGenerationScope;
  route: {
    id: string;
    family: string;
    label?: string;
    available: boolean;
  };
  breakpoints: PixflowBuildInBricksBreakpoint[];
  breakpointMode: Record<string, unknown>;
  tokens: {
    all: PixflowBuildInBricksToken[];
    colours: PixflowBuildInBricksToken[];
    typography: PixflowBuildInBricksToken[];
    spacing: PixflowBuildInBricksToken[];
    radii: PixflowBuildInBricksToken[];
    containers: PixflowBuildInBricksToken[];
    grid: PixflowBuildInBricksToken[];
    utilities: string[];
  };
  colours: Array<Record<string, unknown>>;
  typography: Record<string, unknown>;
  pixflowDesignSystem: Record<string, unknown>;
  /**
   * The normalized destination Bricks defaults used by ordinary Build.
   * Kept optional while legacy readers continue to consume the historical
   * design-context shape.
   */
  themeStyle?: PixflowBuildInBricksThemeStyleContext;
  globalClasses: PixflowBuildInBricksClass[];
  pageSpecificGeneratedTokens: PixflowBuildInBricksToken[];
  diagnostics: {
    eligibleTokenCount: number;
    excludedTokenCount: number;
    unknownTokenCount: number;
    collisionClassCount: number;
    omissions: string[];
  };
};

export type PixflowBuildInBricksDesignContextInput = Omit<Partial<PixflowBuildInBricksDesignContext>, 'tokens'> & {
  tokens?: Partial<PixflowBuildInBricksDesignContext['tokens']>;
};

/**
 * @deprecated Historical persisted Stage-A request shape. New ordinary Build
 * writes use PixflowBuildInBricksSourceRequestBundle from the source contract.
 */
export type PixflowBuildInBricksStageARequestBundle = {
  schema: typeof PIXFLOW_BUILD_IN_BRICKS_STAGE_A_SCHEMA;
  version: 1;
  requestId: string;
  scope: PixflowBuildInBricksGenerationScope;
  userRequest: string;
  targetTitle: string;
  skill: { id: 'build-in-bricks-html-first'; version: string };
  /** Canonical new writes carry the closed manifest; legacy readers may omit it. */
  skillManifest?: PixflowBuildInBricksSkillManifest;
  context: PixflowBuildInBricksDesignContext;
  themeStylePolicy?: PixflowBuildInBricksThemeStylePolicy;
  themeStyleSnapshotHash?: string;
  businessContext: Record<string, unknown>;
  pageContext: Record<string, unknown>;
  pagePlan: PixflowBuildInBricksPagePlan | null;
  existingSource: { html?: string; css?: string; js?: string; hash?: string } | null;
  promptProvenance?: PixflowPromptProvenance;
  artifacts: {
    htmlPath: 'stage-a/source/index.html';
    cssPath: 'stage-a/source/styles.css';
    jsPath: 'stage-a/source/script.js';
    jsOptional: true;
  };
};

export type PixflowBuildInBricksPagePlanSection = {
  id: string;
  title: string;
  purpose: string;
  contentIntent?: string;
  mediaIntent?: string;
  interactionIntent?: string;
  responsiveTransformations?: string[];
};

export type PixflowBuildInBricksPagePlan = {
  schema: 'pixflow.build_in_bricks.page_plan.v1';
  scope: PixflowBuildInBricksGenerationScope;
  sections: PixflowBuildInBricksPagePlanSection[];
};

/** @deprecated Historical Stage-A persisted source reader shape. */
export type PixflowBuildInBricksStageASource = {
  schema: 'pixflow.build_in_bricks.source.v1';
  html: string;
  css: string;
  js?: string | null;
  pagePlan?: PixflowBuildInBricksPagePlan | null;
  provider: 'local-cli' | 'byok-api';
  runId?: string | null;
  warnings: string[];
};

export type PixflowBuildInBricksSourceArtifactInput = {
  html: string;
  css: string;
  js?: string | null;
  scope?: PixflowBuildInBricksGenerationScope;
  allowedCssVariables?: string[];
  enforceGlobalTokenProvenance?: boolean;
  /** Ordinary Build references supplied site variables; it never authors their definitions. */
  forbidGlobalSiteVariableDeclarations?: boolean;
  /** Effective inherited defaults used to reject accidental local duplication. */
  themeStyleContext?: PixflowBuildInBricksThemeStyleContext;
  enforceInheritedThemeStyleDiscipline?: boolean;
  /** Provenance-filtered supplied tokens whose values may be resolved for equivalence checks. */
  eligibleCssVariableValues?: Record<string, string>;
};

export type PixflowBuildInBricksThemeStyleSourceFinding = {
  code: 'theme_style_redundant_inheritance' | 'theme_style_responsive_shadow';
  severity: 'blocking';
  message: string;
  element: string;
  property: string;
  breakpoint: string | null;
  selector: string;
  authoredValue: string;
  effectiveValue: string;
};

export type PixflowBuildInBricksSourceValidation = {
  ok: boolean;
  issues: string[];
  warnings: string[];
  findings: PixflowBuildInBricksThemeStyleSourceFinding[];
  referencedCssVariables: string[];
  locallyDeclaredCssVariables: string[];
  conversionReady: boolean;
};

/** @deprecated Compatibility writer for historical fixtures/readers only. */
export function createPixflowBuildInBricksStageARequestBundle(input: Omit<PixflowBuildInBricksStageARequestBundle, 'schema' | 'version'>): PixflowBuildInBricksStageARequestBundle {
  return {
    schema: PIXFLOW_BUILD_IN_BRICKS_STAGE_A_SCHEMA,
    version: 1,
    ...input,
    context: normalizePixflowBuildInBricksDesignContext(input.context),
  };
}

export function normalizePixflowBuildInBricksDesignContext(input: PixflowBuildInBricksDesignContextInput | null | undefined): PixflowBuildInBricksDesignContext {
  const candidate = input ?? {};
  const all = compactTokens(candidate.tokens?.all ?? []);
  const colours = compactTokens(candidate.tokens?.colours ?? all.filter((token) => /color|colour|accent|background|foreground|text/i.test(tokenSearchText(token))));
  const typography = compactTokens(candidate.tokens?.typography ?? all.filter((token) => /font|text|type|line|weight/i.test(tokenSearchText(token))));
  const spacing = compactTokens(candidate.tokens?.spacing ?? all.filter((token) => /space|gap|gutter|padding|margin/i.test(tokenSearchText(token))));
  const radii = compactTokens(candidate.tokens?.radii ?? all.filter((token) => /radius|round/i.test(tokenSearchText(token))));
  const containers = compactTokens(candidate.tokens?.containers ?? all.filter((token) => /container|content|width/i.test(tokenSearchText(token))));
  const grid = compactTokens(candidate.tokens?.grid ?? all.filter((token) => /grid|column|track|layout/i.test(tokenSearchText(token))));
  const classes = Array.isArray(candidate.globalClasses)
    ? candidate.globalClasses.filter((item): item is PixflowBuildInBricksClass => Boolean(item && typeof item.name === 'string' && item.name.trim())).slice(0, 160)
    : [];
  // Unknown provenance is not trusted for the design-facing context. A
  // token must be explicitly eligible; framework membership alone is not
  // sufficient, and generated/imported values are excluded by the registry.
  const eligible = all.filter((token) => token.provenance.designContextEligible === true);
  const unknown = all.filter((token) => !token.provenance.origin || token.provenance.origin === 'unknown');
  return {
    schema: PIXFLOW_BUILD_IN_BRICKS_CONTEXT_SCHEMA,
    version: 1,
    revision: String(candidate.revision || 'unknown'),
    capturedAt: String(candidate.capturedAt || new Date(0).toISOString()),
    ...(candidate.generationScope ? { generationScope: candidate.generationScope } : {}),
    route: {
      id: String(candidate.route?.id || ''),
      family: String(candidate.route?.family || 'bricks'),
      ...(candidate.route?.label ? { label: String(candidate.route.label) } : {}),
      available: candidate.route?.available === true,
    },
    breakpoints: Array.isArray(candidate.breakpoints) ? candidate.breakpoints.slice(0, 12) : [],
    breakpointMode: record(candidate.breakpointMode),
    tokens: {
      all: eligible,
      colours: colours.filter((token) => token.provenance.designContextEligible === true),
      typography: typography.filter((token) => token.provenance.designContextEligible === true),
      spacing: spacing.filter((token) => token.provenance.designContextEligible === true),
      radii: radii.filter((token) => token.provenance.designContextEligible === true),
      containers: containers.filter((token) => token.provenance.designContextEligible === true),
      grid: grid.filter((token) => token.provenance.designContextEligible === true),
      utilities: uniqueStrings(candidate.tokens?.utilities),
    },
    colours: compactColourPalettes(candidate.colours),
    typography: record(candidate.typography),
    pixflowDesignSystem: record(candidate.pixflowDesignSystem),
    ...(candidate.themeStyle ? { themeStyle: candidate.themeStyle } : {}),
    globalClasses: classes,
    pageSpecificGeneratedTokens: compactTokens(candidate.pageSpecificGeneratedTokens ?? []),
    diagnostics: {
      eligibleTokenCount: eligible.length,
      excludedTokenCount: Math.max(0, all.length - eligible.length),
      unknownTokenCount: unknown.length,
      collisionClassCount: classes.filter((item) => item.collision).length,
      omissions: uniqueStrings(candidate.diagnostics?.omissions),
    },
  };
}

function pixflowPaletteCssVariable(value: unknown): string {
  const match = String(value || '').trim().match(/^var\(\s*(--[a-z0-9_-]+)\s*\)$/i);
  return match?.[1] || '';
}

/**
 * Lists the provenance-approved CSS variables that authored Build source may
 * reference. Palette entries use opaque WordPress resource IDs, so authority
 * comes from their canonical `var(--name)` value rather than their id/name.
 */
export function listPixflowBuildInBricksEligibleCssVariables(
  context: PixflowBuildInBricksDesignContextInput | null | undefined,
): string[] {
  const normalized = normalizePixflowBuildInBricksDesignContext(context);
  const paletteVariables = normalized.colours.flatMap((palette) => (
    Array.isArray(palette.colors)
      ? palette.colors.map((colour) => pixflowPaletteCssVariable(
          colour && typeof colour === 'object'
            ? (colour as Record<string, unknown>).raw || (colour as Record<string, unknown>).value
            : '',
        ))
      : []
  ));
  return uniqueStrings([
    ...normalized.tokens.all.map((token) => token.cssVar),
    ...normalized.pageSpecificGeneratedTokens.map((token) => token.cssVar),
    ...paletteVariables,
  ]);
}

/** Values used only for deterministic equivalence checks, never as authority. */
export function pixflowBuildInBricksEligibleCssVariableValues(
  context: PixflowBuildInBricksDesignContextInput | null | undefined,
): Record<string, string> {
  const normalized = normalizePixflowBuildInBricksDesignContext(context);
  const entries: Array<[string, string]> = [
    ...normalized.tokens.all
      .filter((token) => typeof token.value === 'string' && token.value.trim())
      .map((token): [string, string] => [token.cssVar, token.value!.trim()]),
    ...normalized.pageSpecificGeneratedTokens
      .filter((token) => typeof token.value === 'string' && token.value.trim())
      .map((token): [string, string] => [token.cssVar, token.value!.trim()]),
  ];
  for (const palette of normalized.colours) {
    if (!Array.isArray(palette.colors)) continue;
    for (const colour of palette.colors) {
      if (!colour || typeof colour !== 'object') continue;
      const item = colour as Record<string, unknown>;
      const name = pixflowPaletteCssVariable(item.raw || item.value);
      const value = String(item.hex || '').trim();
      if (name && value) entries.push([name, value]);
    }
  }
  return Object.fromEntries(entries.slice(0, 320));
}

export function formatPixflowBuildInBricksDesignContext(context: PixflowBuildInBricksDesignContext): string {
  const normalized = normalizePixflowBuildInBricksDesignContext(context);
  const categorizedTokenNames = new Set([
    ...normalized.tokens.colours,
    ...normalized.tokens.typography,
    ...normalized.tokens.spacing,
    ...normalized.tokens.radii,
    ...normalized.tokens.containers,
    ...normalized.tokens.grid,
  ].map((token) => token.cssVar));
  const otherTokens = normalized.tokens.all.filter((token) => !categorizedTokenNames.has(token.cssVar));
  const lines = [
    'ACTIVE DESIGN SYSTEM (trusted, provenance-filtered)',
    `Framework route: ${normalized.route.label || normalized.route.id || 'Native Bricks'}`,
    `Route family: ${normalized.route.family}`,
    `Context revision: ${normalized.revision}`,
    '',
    'Breakpoints:',
    ...(normalized.breakpoints.length > 0
      ? normalized.breakpoints.map((breakpoint) => `- ${breakpoint.label} (${breakpoint.key}): ${breakpoint.base ? 'base' : `${breakpoint.width ?? 'unknown'}px`}`)
      : ['- No live breakpoint values were returned; use normal responsive CSS without inventing named breakpoints.']),
    '',
    'Design tokens (use only when a token fits; literals remain valid for implementation details):',
    ...formatTokenGroup('Colours', normalized.tokens.colours),
    ...formatTokenGroup('Typography', normalized.tokens.typography),
    ...formatTokenGroup('Spacing', normalized.tokens.spacing),
    ...formatTokenGroup('Radii', normalized.tokens.radii),
    ...formatTokenGroup('Containers', normalized.tokens.containers),
    ...formatTokenGroup('Grid/layout', normalized.tokens.grid),
    ...formatTokenGroup('Other eligible tokens', otherTokens),
    '',
    'Colour palettes (eligible site colours):',
    ...(normalized.colours.length > 0
      ? normalized.colours.slice(0, 20).map((palette) => {
          const paletteName = String(palette.name || palette.label || palette.id || 'Site palette');
          const colors = Array.isArray(palette.colors)
            ? palette.colors.slice(0, 24).map((color) => {
                if (!color || typeof color !== 'object') return '';
                const item = color as Record<string, unknown>;
                const label = String(item.label || item.name || item.id || 'colour');
                const value = String(item.value || item.raw || item.hex || '').trim();
                return value ? `${label} = ${value}` : label;
              }).filter(Boolean).join(', ')
            : '';
          return `- ${paletteName}${colors ? `: ${colors}` : ''}`;
        })
      : ['- none supplied']),
    '',
    'PAGE-SPECIFIC GENERATED TOKENS (available only when editing this retained page; never treat as global framework tokens):',
    ...(normalized.pageSpecificGeneratedTokens.length > 0
      ? normalized.pageSpecificGeneratedTokens.map((token) => `- ${token.cssVar}${token.value ? ` = ${token.value}` : ''}${token.category ? ` [${token.category}]` : ''}`)
      : ['- none supplied']),
    '',
    'Existing global classes (avoid accidental redefinition; no naming convention is imposed):',
    ...(normalized.globalClasses.length > 0 ? normalized.globalClasses.map((item) => `- .${item.name}${item.collision ? ` (${item.collision} class)` : ''}`) : ['- none supplied']),
    ...formatCollisionWarnings(normalized.globalClasses),
    '',
    `Context diagnostics: ${normalized.diagnostics.eligibleTokenCount} eligible, ${normalized.diagnostics.excludedTokenCount} excluded, ${normalized.diagnostics.unknownTokenCount} unknown, ${normalized.diagnostics.collisionClassCount} class collisions.`,
    ...(normalized.diagnostics.omissions.length > 0 ? [`Omitted context: ${normalized.diagnostics.omissions.join('; ')}`] : []),
    ...(normalized.themeStyle ? ['', formatPixflowBuildInBricksThemeStyleContext(normalized.themeStyle)] : []),
  ];
  return lines.join('\n');
}

function formatCollisionWarnings(classes: PixflowBuildInBricksClass[]): string[] {
  const common = new Set(['container', 'button', 'card', 'grid']);
  const collisions = classes
    .map((item) => item.name.replace(/^\./, ''))
    .filter((name) => common.has(name));
  return collisions.length > 0
    ? [`Collision reminders: ${[...new Set(collisions)].map((name) => `.${name}`).join(', ')} already exist in the supplied site inventory; reuse intentionally or scope a new class.`]
    : [];
}

export function validatePixflowBuildInBricksSourceArtifacts(input: PixflowBuildInBricksSourceArtifactInput): PixflowBuildInBricksSourceValidation {
  const html = String(input.html || '').trim();
  const css = String(input.css || '').trim();
  const js = String(input.js || '').trim();
  const issues: string[] = [];
  const warnings: string[] = [];
  const findings: PixflowBuildInBricksThemeStyleSourceFinding[] = [];
  if (!html) issues.push('HTML artifact is empty.');
  if (!css) issues.push('CSS artifact is empty.');
  if (/<(?:script|style)\b/i.test(css)) issues.push('CSS artifact contains HTML script/style markup.');
  if (/<script\b[^>]*src\s*=\s*["']https?:/i.test(html)) issues.push('HTML references a remote script.');
  if (/(?:href|src)\s*=\s*["'](?:javascript:|file:)/i.test(html)) issues.push('HTML contains a blocked javascript: or file: asset/reference scheme.');
  if (/\bon[a-z]+\s*=\s*["']/i.test(html)) warnings.push('HTML contains an inline event handler; prefer separate script.js listeners.');
  const htmlWithoutScriptBodies = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  if (/\b(?:bricks|_cssCustom|settings|children)\b\s*:/i.test(htmlWithoutScriptBodies) && /[{[]/.test(htmlWithoutScriptBodies)) issues.push('HTML appears to contain raw Bricks JSON/schema.');
  if (input.scope === 'section' && !/^<section\b/i.test(html)) issues.push('Section scope must start with one <section> root.');
  if (input.scope === 'component' && !/^<(?:article|div|nav|form|figure|ul|ol|aside|header|footer|section)\b/i.test(html)) issues.push('Component scope must start with one bounded semantic root.');
  if (js && /<script\b|<\/script>/i.test(js)) issues.push('JavaScript artifact contains script tags.');
  const referenced = uniqueStrings([...css.matchAll(/var\(\s*(--[a-z0-9_-]+)(?:\s*,\s*([^(){};]+?))?\s*\)/gi)].map((match) => match[1] || ''));
  const declarations = extractCssCustomPropertyDeclarations(css);
  const declared = declarations.all;
  const localDeclarations = declarations.local;
  const globalDeclarations = declarations.global;
  const allowed = new Set(uniqueStrings(input.allowedCssVariables));
  for (const name of globalDeclarations) {
    if (allowed.has(name) && input.forbidGlobalSiteVariableDeclarations === true) {
      issues.push(`CSS redeclares supplied site variable ${name}; reference the existing variable without defining it in authored source.`);
    } else if (!allowed.has(name)) {
      const message = `CSS declares unknown global site variable ${name}; use an eligible supplied token or declare implementation properties on a local component selector.`;
      if (input.enforceGlobalTokenProvenance === true) {
        issues.push(message);
      } else {
        warnings.push(`${message} No canonical site provenance was available, so this source-local declaration was not treated as a framework token.`);
      }
    }
  }
  for (const match of css.matchAll(/var\(\s*(--[a-z0-9_-]+)(?:\s*,\s*([^(){};]+?))?\s*\)/gi)) {
    const name = String(match[1] || '');
    if (!name || allowed.has(name) || localDeclarations.includes(name) || globalDeclarations.includes(name)) continue;
    if (String(match[2] || '').trim()) {
      warnings.push(`CSS references unknown site variable ${name} with a fallback; verify the fallback is intentional.`);
    } else {
      issues.push(`CSS references unknown site variable ${name}; declare a local property or use an eligible supplied token.`);
    }
  }
  if (input.enforceInheritedThemeStyleDiscipline === true && input.themeStyleContext) {
    findings.push(...findInheritedThemeStyleOwnershipFindings(
      html,
      css,
      input.themeStyleContext,
      input.eligibleCssVariableValues || {},
    ));
    issues.push(...findings.map((finding) => finding.message));
  }
  return {
    ok: issues.length === 0,
    issues,
    warnings,
    findings,
    referencedCssVariables: referenced,
    locallyDeclaredCssVariables: declared,
    conversionReady: issues.length === 0,
  };
}

function findInheritedThemeStyleOwnershipFindings(
  html: string,
  css: string,
  themeStyleContext: PixflowBuildInBricksThemeStyleContext,
  eligibleCssVariableValues: Record<string, string>,
): PixflowBuildInBricksThemeStyleSourceFinding[] {
  const inherited = listPixflowBuildInBricksThemeStyleEffectiveDeclarations(themeStyleContext);
  if (inherited.length === 0) return [];
  const authoredElements = extractAuthoredSemanticElements(html);
  const rules = parseBoundedCssRules(css);
  const findings: PixflowBuildInBricksThemeStyleSourceFinding[] = [];
  for (const rule of rules) {
    const selector = rule.selector;
    const authored = expandCssDeclarations(rule.body);
    for (const expected of inherited) {
      if (!selectorRepresentsThemeStyleElement(selector, expected.element, authoredElements)) continue;
      const actual = authored.get(expected.property);
      if (actual === undefined) continue;
      if (equivalentInheritedCssValue(actual, expected.value, expected.property, eligibleCssVariableValues)) {
        if (mediaRuleAppliesToBreakpoint(rule.mediaQuery, expected.breakpoint, themeStyleContext)) {
          findings.push({
            code: 'theme_style_redundant_inheritance',
            severity: 'blocking',
            message: `CSS redundantly restates inherited Theme Style defaults: ${expected.element} ${expected.property}=${expected.value} in ${selector}${expected.breakpoint ? ` at ${expected.breakpoint}` : ''}. Omit matching declarations and keep only intentional overrides.`,
            element: expected.element,
            property: expected.property,
            breakpoint: expected.breakpoint,
            selector,
            authoredValue: actual,
            effectiveValue: expected.value,
          });
        }
        continue;
      }
      if (!expected.breakpoint || rule.mediaQuery || !selectorHasAuthoredSpecificity(selector)) continue;
      const ownsResponsiveTreatment = authoredValueOwnsFluidResponsiveTreatment(actual) || rules.some((candidate) => (
        Boolean(candidate.mediaQuery)
        && mediaRuleAppliesToBreakpoint(candidate.mediaQuery, expected.breakpoint, themeStyleContext)
        && selectorsShareTarget(selector, candidate.selector)
        && selectorRepresentsThemeStyleElement(candidate.selector, expected.element, authoredElements)
        && expandCssDeclarations(candidate.body).has(expected.property)
      ));
      if (ownsResponsiveTreatment) continue;
      findings.push({
        code: 'theme_style_responsive_shadow',
        severity: 'blocking',
        message: `Authored selector ${selector} shadows inherited ${expected.element} ${expected.property}=${expected.value} at ${expected.breakpoint} without an intentional responsive treatment.`,
        element: expected.element,
        property: expected.property,
        breakpoint: expected.breakpoint,
        selector,
        authoredValue: actual,
        effectiveValue: expected.value,
      });
    }
  }
  return [...new Map(findings.map((finding) => [
    `${finding.code}:${finding.selector}:${finding.element}:${finding.breakpoint || 'base'}:${finding.property}`,
    finding,
  ])).values()];
}

type AuthoredSemanticElement = { tag: string; id: string | null; classes: Set<string> };
type BoundedCssRule = { selector: string; body: string; mediaQuery: string | null };

function extractAuthoredSemanticElements(html: string): AuthoredSemanticElement[] {
  const elements: AuthoredSemanticElement[] = [];
  for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    if (elements.length >= 1_000) break;
    const tag = String(match[1] || '').toLowerCase();
    const attributes = String(match[2] || '');
    const id = attributes.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1]?.trim() || null;
    const classValue = attributes.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1] || '';
    elements.push({ tag, id, classes: new Set(classValue.split(/\s+/).filter(Boolean)) });
  }
  return elements;
}

function parseBoundedCssRules(css: string): BoundedCssRule[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const rules: BoundedCssRule[] = [];
  const walk = (start: number, end: number, mediaQuery: string | null): void => {
    let cursor = start;
    while (cursor < end && rules.length < 400) {
      const open = source.indexOf('{', cursor);
      if (open < 0 || open >= end) break;
      const header = source.slice(cursor, open).trim();
      let depth = 1;
      let close = open + 1;
      while (close < end && depth > 0) {
        if (source[close] === '{') depth += 1;
        else if (source[close] === '}') depth -= 1;
        close += 1;
      }
      if (depth !== 0) break;
      const bodyStart = open + 1;
      const bodyEnd = close - 1;
      if (/^@media\b/i.test(header)) {
        walk(bodyStart, bodyEnd, header.replace(/^@media\s*/i, '').trim());
      } else if (!header.startsWith('@') && !source.slice(bodyStart, bodyEnd).includes('{')) {
        rules.push({ selector: header, body: source.slice(bodyStart, bodyEnd), mediaQuery });
      }
      cursor = close;
    }
  };
  walk(0, source.length, null);
  return rules;
}

function expandCssDeclarations(body: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const match of body.matchAll(/([a-z][a-z0-9-]*)\s*:\s*([^;{}]+)\s*;?/gi)) {
    const property = String(match[1] || '').toLowerCase();
    const value = String(match[2] || '').trim();
    if (!property || !value) continue;
    declarations.set(property, value);
    if (property === 'padding' || property === 'margin') {
      const parts = splitCssShorthand(value);
      const top = parts[0];
      if (top) {
        const right = parts[1] ?? top;
        const bottom = parts[2] ?? top;
        const left = parts[3] ?? right;
        declarations.set(`${property}-top`, top);
        declarations.set(`${property}-right`, right);
        declarations.set(`${property}-bottom`, bottom);
        declarations.set(`${property}-left`, left);
      }
    } else if (property === 'padding-inline' || property === 'margin-inline') {
      const parts = splitCssShorthand(value);
      const start = parts[0];
      const prefix = property.replace('-inline', '');
      if (start) {
        const end = parts[1] ?? start;
        declarations.set(`${prefix}-left`, start);
        declarations.set(`${prefix}-right`, end);
      }
    } else if (property === 'padding-block' || property === 'margin-block') {
      const parts = splitCssShorthand(value);
      const start = parts[0];
      const prefix = property.replace('-block', '');
      if (start) {
        const end = parts[1] ?? start;
        declarations.set(`${prefix}-top`, start);
        declarations.set(`${prefix}-bottom`, end);
      }
    } else if (property === 'border-radius') {
      const parts = splitCssShorthand(value);
      const topLeft = parts[0];
      if (topLeft) {
        const topRight = parts[1] ?? topLeft;
        const bottomRight = parts[2] ?? topLeft;
        const bottomLeft = parts[3] ?? topRight;
        declarations.set('border-top-left-radius', topLeft);
        declarations.set('border-top-right-radius', topRight);
        declarations.set('border-bottom-right-radius', bottomRight);
        declarations.set('border-bottom-left-radius', bottomLeft);
      }
    }
  }
  return declarations;
}

function splitCssShorthand(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 4);
}

function selectorRepresentsThemeStyleElement(
  selector: string,
  element: string,
  authoredElements: AuthoredSemanticElement[],
): boolean {
  const value = selector.toLowerCase();
  const hasTag = (tag: string) => new RegExp(`(?:^|[\\s>+~,])${tag}(?:$|[\\s>+~,.#:\\[])`, 'i').test(value);
  const classEndsWith = (name: string) => new RegExp(`\\.[a-z0-9_-]*(?:^|[-_])${name}(?:$|[\\s>+~,.#:\\[])`, 'i').test(value)
    || new RegExp(`\\.${name}(?:$|[\\s>+~,.#:\\[])`, 'i').test(value);
  if (element === 'page') return /(?:^|[\s,]):root(?:$|[\s,])/.test(value) || hasTag('html');
  if (element === 'body') return hasTag('body');
  const tags = semanticElementTags(element);
  const authoredMatch = authoredElements.some((authored) => (
    tags.has(authored.tag) && selectorTargetsAuthoredElement(selector, authored)
  ));
  if (authoredMatch) return true;
  if (element === 'section') return hasTag('section') || classEndsWith('section');
  if (element === 'container') return classEndsWith('container') || classEndsWith('wrap') || classEndsWith('inner');
  if (element === 'heading') return /(?:^|[\s>+~,])h[1-6](?:$|[\s>+~,.#:\[])/i.test(value);
  if (/^h[1-6]$/.test(element)) return hasTag(element);
  if (element === 'button' || element === 'form-submit') return hasTag('button') || classEndsWith('button') || classEndsWith('btn');
  if (element === 'text' || element === 'text-basic') return hasTag('p');
  if (element === 'text-link') return hasTag('a');
  if (element === 'image') return hasTag('img');
  if (element === 'list') return hasTag('ul') || hasTag('ol');
  if (element === 'form') return hasTag('form');
  if (element === 'form-field') return hasTag('input') || hasTag('textarea') || hasTag('select');
  if (element === 'form-label') return hasTag('label');
  return false;
}

function semanticElementTags(element: string): Set<string> {
  if (element === 'heading') return new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  if (/^h[1-6]$/.test(element)) return new Set([element]);
  if (element === 'button' || element === 'form-submit') return new Set(['button', 'a', 'input']);
  if (element === 'text' || element === 'text-basic') return new Set(['p']);
  if (element === 'text-link') return new Set(['a']);
  if (element === 'image') return new Set(['img']);
  if (element === 'list') return new Set(['ul', 'ol']);
  if (element === 'form-field') return new Set(['input', 'textarea', 'select']);
  if (element === 'form-label') return new Set(['label']);
  return new Set([element]);
}

function selectorTargetsAuthoredElement(selector: string, element: AuthoredSemanticElement): boolean {
  return selector.split(',').some((part) => {
    const rightmost = part.trim().split(/[\s>+~]+/).filter(Boolean).at(-1) || '';
    if (!rightmost) return false;
    const tag = rightmost.match(/^([a-z][a-z0-9-]*)/i)?.[1]?.toLowerCase();
    if (tag && tag !== element.tag) return false;
    const ids = [...rightmost.matchAll(/#([a-z0-9_-]+)/gi)].map((match) => match[1] || '');
    if (ids.length > 0 && (!element.id || !ids.includes(element.id))) return false;
    const classes = [...rightmost.matchAll(/\.([a-z0-9_-]+)/gi)].map((match) => match[1] || '');
    if (classes.some((name) => !element.classes.has(name))) return false;
    return Boolean(tag || ids.length > 0 || classes.length > 0);
  });
}

function selectorHasAuthoredSpecificity(selector: string): boolean {
  return /[.#\[]/.test(selector);
}

function selectorsShareTarget(left: string, right: string): boolean {
  const signatures = (selector: string) => selector.split(',').map((part) => {
    const rightmost = part.trim().split(/[\s>+~]+/).filter(Boolean).at(-1) || '';
    return rightmost.replace(/:{1,2}[a-z-]+(?:\([^)]*\))?/gi, '').toLowerCase();
  });
  const rightSignatures = new Set(signatures(right));
  return signatures(left).some((signature) => rightSignatures.has(signature));
}

function authoredValueOwnsFluidResponsiveTreatment(value: string): boolean {
  const authored = value.replace(/\s*!important\s*$/i, '').trim();
  if (/^var\s*\(/i.test(authored)) return false;
  return /(?:clamp|min|max|calc)\s*\([^)]*(?:vw|vh|vmin|vmax|vi|vb|cqw|cqh|cqi|cqb|cqmin|cqmax|%)/i.test(authored);
}

function mediaRuleAppliesToBreakpoint(
  mediaQuery: string | null,
  breakpoint: string | null,
  context: PixflowBuildInBricksThemeStyleContext,
): boolean {
  if (!breakpoint) {
    if (!mediaQuery) return true;
    const responsiveWidths = context.breakpoints
      .filter((entry) => !entry.base && entry.width !== null && Number.isFinite(entry.width))
      .map((entry) => Number(entry.width));
    const baseLowerBound = responsiveWidths.length > 0 ? Math.max(...responsiveWidths) + 0.001 : 0;
    return mediaQueryOverlapsWidthRange(mediaQuery, baseLowerBound, Number.POSITIVE_INFINITY);
  }
  if (!mediaQuery) return false;
  const record = context.breakpoints.find((entry) => (
    entry.key === breakpoint || `${entry.width}px` === breakpoint || String(entry.width) === breakpoint
  ));
  const width = record?.width ?? (/^\d+(?:\.\d+)?(?:px)?$/.test(breakpoint) ? Number.parseFloat(breakpoint) : null);
  if (width === null || !Number.isFinite(width)) return false;
  return mediaQueryAppliesAtWidth(mediaQuery, width);
}

function mediaQueryAppliesAtWidth(mediaQuery: string, width: number): boolean {
  return mediaQueryOverlapsWidthRange(mediaQuery, width, width);
}

function mediaQueryOverlapsWidthRange(mediaQuery: string, lowerBound: number, upperBound: number): boolean {
  const max = mediaQuery.match(/max-width\s*:\s*(\d+(?:\.\d+)?)px/i)?.[1];
  const min = mediaQuery.match(/min-width\s*:\s*(\d+(?:\.\d+)?)px/i)?.[1];
  if (!max && !min) return false;
  const queryMin = min ? Number.parseFloat(min) : Number.NEGATIVE_INFINITY;
  const queryMax = max ? Number.parseFloat(max) : Number.POSITIVE_INFINITY;
  return queryMin <= upperBound && queryMax >= lowerBound;
}

function equivalentInheritedCssValue(
  actual: string,
  expected: string,
  property: string,
  eligibleCssVariableValues: Record<string, string>,
): boolean {
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').replace(/^['"]|['"]$/g, '').toLowerCase();
  const resolveEligibleVariable = (value: string): string => {
    let resolved = value.trim();
    for (let depth = 0; depth < 4; depth += 1) {
      const exact = resolved.match(/^var\(\s*(--[a-z0-9_-]+)\s*(?:,\s*([^()]+))?\)$/i);
      if (!exact) break;
      const supplied = eligibleCssVariableValues[exact[1] || ''];
      if (typeof supplied === 'string' && supplied.trim()) {
        resolved = supplied.trim();
        continue;
      }
      if (exact[2]) resolved = exact[2].trim();
      break;
    }
    return resolved;
  };
  const normalizedActual = normalize(resolveEligibleVariable(actual));
  const normalizedExpected = normalize(expected);
  if (normalizedActual === normalizedExpected) return true;
  const fallback = actual.trim().match(/^var\([^,]+,\s*(.+)\)$/i)?.[1];
  if (fallback && normalize(fallback) === normalizedExpected) return true;
  if (property === 'font-family') {
    return normalize(resolveEligibleVariable(actual).split(',')[0] || '') === normalize(expected.split(',')[0] || '');
  }
  return false;
}

function extractCssCustomPropertyDeclarations(css: string): {
  all: string[];
  local: string[];
  global: string[];
} {
  // Selector classification must ignore comments. Otherwise instructional
  // comments such as "never declare on :root, html, or body" are captured by
  // the lightweight rule matcher as part of the following local selector and
  // incorrectly promote component-scoped properties into the global bucket.
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const all = uniqueStrings([...cssWithoutComments.matchAll(/(--[a-z0-9_-]+)\s*:/gi)].map((match) => match[1] || ''));
  const local: string[] = [];
  const global: string[] = [];
  for (const match of cssWithoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = String(match[1] || '').trim();
    const body = String(match[2] || '');
    const names = uniqueStrings([...body.matchAll(/(--[a-z0-9_-]+)\s*:/gi)].map((declaration) => declaration[1] || ''));
    if (names.length === 0) continue;
    const isGlobal = !selector
      || /(?:^|[,\s])(?::root|html|body|:host|\*)(?:$|[,\s])/i.test(selector)
      || /^@(?:layer|scope|supports|media|container)\b/i.test(selector);
    for (const name of names) {
      (isGlobal ? global : local).push(name);
    }
  }
  return {
    all,
    local: uniqueStrings(local),
    global: uniqueStrings(global),
  };
}

function formatTokenGroup(label: string, tokens: PixflowBuildInBricksToken[]): string[] {
  return [
    `${label}:`,
    ...(tokens.length > 0
      ? tokens.slice(0, 80).map((token) => `- ${token.cssVar}${token.value ? ` = ${token.value}` : ''}${token.semanticRole ? ` (${token.semanticRole})` : ''}`)
      : ['- none supplied']),
  ];
}

function compactColourPalettes(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  const palettes: Array<Record<string, unknown>> = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const palette = item as Record<string, unknown>;
    const paletteProvenance = record(palette.provenance);
    if (paletteProvenance.designContextEligible !== true) continue;
    const colors = Array.isArray(palette.colors)
      ? palette.colors.filter((color): color is Record<string, unknown> => (
          Boolean(color && typeof color === 'object')
          && record((color as Record<string, unknown>).provenance).designContextEligible === true
        )).slice(0, 40)
      : [];
    palettes.push({
      ...(palette.id ? { id: String(palette.id) } : {}),
      ...(palette.name ? { name: String(palette.name) } : {}),
      ...(palette.label ? { label: String(palette.label) } : {}),
      colors,
      provenance: paletteProvenance,
    });
  }
  return palettes.slice(0, 40);
}

function tokenSearchText(token: PixflowBuildInBricksToken): string {
  return `${token.cssVar} ${token.name || ''} ${token.category || ''} ${token.semanticRole || ''}`;
}

function compactTokens(value: unknown): PixflowBuildInBricksToken[] {
  if (!Array.isArray(value)) return [];
  const out: PixflowBuildInBricksToken[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Record<string, unknown>;
    const cssVar = String(candidate.cssVar || candidate.cssName || candidate.name || '').trim();
    if (!cssVar || seen.has(cssVar)) continue;
    seen.add(cssVar);
    out.push({
      ...(candidate.id ? { id: String(candidate.id) } : {}),
      ...(candidate.name ? { name: String(candidate.name) } : {}),
      cssVar: cssVar.startsWith('--') ? cssVar : `--${cssVar.replace(/^-+/, '')}`,
      ...(candidate.value !== undefined ? { value: String(candidate.value) } : {}),
      ...(candidate.category ? { category: String(candidate.category) } : {}),
      ...(candidate.semanticRole ? { semanticRole: String(candidate.semanticRole) } : {}),
      provenance: record(candidate.provenance),
    });
  }
  return out.slice(0, 240);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function uniqueStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].slice(0, 240)
    : [];
}

/** @deprecated Historical Stage-A compatibility alias. */
export type PixflowStageABreakpoint = PixflowBuildInBricksBreakpoint;
/** @deprecated Historical Stage-A compatibility alias. */
export type PixflowStageAClass = PixflowBuildInBricksClass;
/** @deprecated Historical Stage-A compatibility alias. */
export type PixflowStageAToken = PixflowBuildInBricksToken;
/** @deprecated Historical Stage-A compatibility alias. */
export type PixflowStageADesignContext = PixflowBuildInBricksDesignContext;
/** @deprecated Historical Stage-A compatibility alias. */
export type PixflowStageADesignContextInput = PixflowBuildInBricksDesignContextInput;
/** @deprecated Historical Stage-A compatibility alias. */
export type PixflowStageASourceArtifactInput = PixflowBuildInBricksSourceArtifactInput;
/** @deprecated Historical Stage-A compatibility alias. */
export type PixflowStageASourceValidation = PixflowBuildInBricksSourceValidation;

/** @deprecated Use normalizePixflowBuildInBricksDesignContext. */
export const normalizePixflowStageADesignContext = normalizePixflowBuildInBricksDesignContext;
/** @deprecated Use formatPixflowBuildInBricksDesignContext. */
export const formatPixflowStageADesignContext = formatPixflowBuildInBricksDesignContext;
/** @deprecated Use validatePixflowBuildInBricksSourceArtifacts. */
export const validatePixflowStageASourceArtifacts = validatePixflowBuildInBricksSourceArtifacts;
