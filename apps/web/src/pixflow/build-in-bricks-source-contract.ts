import type {
  PixflowBricksMediaPolicy,
  PixflowBricksRetainedEditDecision,
} from '@open-design/contracts';
import type { PixflowRouteContextSnapshot } from './framework';
import {
  extractBuildInBricksVisibleText,
  materializeBuildInBricksVisibleTextReplacement,
} from './bricks-html-visible-text';

export type BuildInBricksFindingSeverity = 'blocking' | 'warning' | 'informational';

export type BuildInBricksFindingCode =
  | 'source_artifact_contract'
  | 'theme_style_redundant_inheritance'
  | 'theme_style_responsive_shadow'
  | 'authored_document_shell'
  | 'html_discipline'
  | 'retained_source_scope_violation'
  | 'missing_required_content'
  | 'required_media_missing'
  | 'invalid_image'
  | 'invalid_form_label'
  | 'invalid_link_target'
  | 'unsupported_numeric_claim'
  | 'unsupported_fact'
  | 'forbidden_catalog_claim'
  | 'unsafe_motion_contract'
  | 'scope_mismatch'
  | 'aesthetic_hierarchy'
  | 'aesthetic_scaffold'
  | 'aesthetic_conversion_path'
  | 'aesthetic_typography'
  | 'aesthetic_interaction'
  | 'render_evidence';

export type BuildInBricksFinding = {
  code: BuildInBricksFindingCode;
  severity: BuildInBricksFindingSeverity;
  category:
    | 'source_contract'
    | 'prompt_compliance'
    | 'media_fidelity'
    | 'semantic_safety'
    | 'motion_safety'
    | 'scope_alignment'
    | 'visual_ambition'
    | 'composition_direction'
    | 'conversion_structure'
    | 'motion_fidelity'
    | 'route_token_discipline'
    | 'content_specificity'
    | 'visual_evidence';
  message: string;
  selector?: string;
  element?: string;
  property?: string;
  breakpoint?: string | null;
  authoredValue?: string;
  effectiveValue?: string;
  viewport?: string;
  requirement?: string;
  requirementKind?: 'semantic_content' | 'structural';
  matchingPolicy?: 'literal_phrase_in_normalized_visible_text' | 'required_html_structure';
  inspectedSurface?: 'normalized_user_visible_text' | 'authored_html_structure';
  retainedEditKind?: 'literal_text_replacement';
  retainedFrom?: string;
  retainedTo?: string;
};

export type BuildInBricksRetainedSource = {
  html?: string;
  css?: string;
  js?: string;
  hash?: string;
};

export type BuildInBricksRetainedSourceAnchor = {
  sourcePath: string;
};

export type BuildInBricksBoundedRetainedEditContract = PixflowBricksRetainedEditDecision;

function normalizeRetainedSourceFile(value: unknown): string {
  return String(value || '').replace(/\r\n?/g, '\n').trimEnd();
}

/**
 * Optional Build JavaScript exists only when it contains executable authored
 * behaviour. Provider commentary in an otherwise empty script sidecar is
 * canonicalised to absence at persistence time.
 */
export function normalizeBuildInBricksOptionalJavaScript(value: unknown): string {
  const source = String(value || '');
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .trim();
  return withoutComments ? source : '';
}

/**
 * Fail closed for explicit literal-only retained edits. The verified retained
 * artifact is the authority; the provider may perform the requested text
 * replacement but may not rewrite unrelated HTML, CSS, or JavaScript.
 */
export function validateBuildInBricksBoundedRetainedEdit({
  decision,
  retainedSource,
  retainedSourceAnchor,
  nextSource,
}: {
  decision?: BuildInBricksBoundedRetainedEditContract | null;
  retainedSource?: BuildInBricksRetainedSource | null;
  retainedSourceAnchor?: BuildInBricksRetainedSourceAnchor | null;
  nextSource: BuildInBricksRetainedSource;
}): BuildInBricksFinding[] {
  if (!retainedSource) return [];
  if (!decision) return [];
  const retainedHtml = normalizeRetainedSourceFile(retainedSource.html);
  const materializedReplacement = materializeBuildInBricksVisibleTextReplacement(
    retainedHtml,
    decision.currentText,
    decision.replacementText,
    { sourcePath: retainedSourceAnchor?.sourcePath },
  );
  const occurrenceCount = materializedReplacement.occurrenceCount;
  const expectedHtml = materializedReplacement.html;
  const htmlMatches = occurrenceCount === 1
    && normalizeRetainedSourceFile(nextSource.html) === expectedHtml;
  const cssMatches = normalizeRetainedSourceFile(nextSource.css) === normalizeRetainedSourceFile(retainedSource.css);
  const jsMatches = normalizeRetainedSourceFile(nextSource.js) === normalizeRetainedSourceFile(retainedSource.js);
  if (htmlMatches && cssMatches && jsMatches) return [];
  const reasons = [
    ...(occurrenceCount !== 1 ? [`the requested source text occurs ${occurrenceCount} times in the verified retained HTML`] : []),
    ...(!htmlMatches && occurrenceCount === 1 ? ['HTML changed beyond the requested literal replacement'] : []),
    ...(!cssMatches ? ['CSS changed'] : []),
    ...(!jsMatches ? ['JavaScript changed'] : []),
  ];
  return [{
    code: 'retained_source_scope_violation',
    severity: 'blocking',
    category: 'prompt_compliance',
    message: `Retained-source edit exceeded the explicit bounded change: ${reasons.join('; ')}. Restore the verified retained source and apply only the requested literal replacement.`,
    retainedEditKind: 'literal_text_replacement',
    retainedFrom: decision.currentText,
    retainedTo: decision.replacementText,
  }];
}

function cssRuleBodiesBySelector(value: unknown): Map<string, string> {
  const css = String(value || '').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = new Map<string, string[]>();
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const rawSelector = String(match[1] || '').trim();
    if (!rawSelector || rawSelector.startsWith('@')) continue;
    const selector = rawSelector.replace(/\s+/g, ' ');
    const body = String(match[2] || '').replace(/\s+/g, ' ').trim();
    const existing = rules.get(selector) || [];
    existing.push(body);
    rules.set(selector, existing);
  }
  return new Map([...rules].map(([selector, bodies]) => [selector, bodies.join('\n')]));
}

function htmlOwnershipTokens(value: unknown): Set<string> {
  const tokens = new Set<string>();
  const html = String(value || '');
  for (const match of html.matchAll(/\b(?:class|id)\s*=\s*["']([^"']+)["']/gi)) {
    for (const token of String(match[1] || '').trim().split(/\s+/)) {
      if (token) tokens.add(token);
    }
  }
  return tokens;
}

function selectorOwnsToken(selector: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:\\.|#)${escaped}(?![a-z0-9_-])`, 'i').test(selector);
}

/**
 * A retained-source aesthetic repair is subordinate to the selected agent's
 * already accepted change. It may refine selectors the current turn authored
 * or selectors owned by HTML introduced in that turn, but it may not use the
 * screenshot review as authority to restyle an untouched retained element.
 */
export function validateBuildInBricksRetainedAestheticRepairScope({
  retainedSource,
  generatedSource,
  repairedSource,
}: {
  retainedSource?: BuildInBricksRetainedSource | null;
  generatedSource: BuildInBricksRetainedSource;
  repairedSource: BuildInBricksRetainedSource;
}): BuildInBricksFinding[] {
  if (!retainedSource) return [];

  const retainedRules = cssRuleBodiesBySelector(retainedSource.css);
  const generatedRules = cssRuleBodiesBySelector(generatedSource.css);
  const repairedRules = cssRuleBodiesBySelector(repairedSource.css);
  const initiallyOwnedSelectors = new Set(
    [...new Set([...retainedRules.keys(), ...generatedRules.keys()])]
      .filter((selector) => retainedRules.get(selector) !== generatedRules.get(selector)),
  );
  const retainedTokens = htmlOwnershipTokens(retainedSource.html);
  const generatedTokens = htmlOwnershipTokens(generatedSource.html);
  const turnOwnedTokens = new Set([...generatedTokens].filter((token) => !retainedTokens.has(token)));
  const repairTouchedSelectors = [...new Set([...generatedRules.keys(), ...repairedRules.keys()])]
    .filter((selector) => generatedRules.get(selector) !== repairedRules.get(selector));

  const findings: BuildInBricksFinding[] = [];
  for (const selector of repairTouchedSelectors) {
    if (initiallyOwnedSelectors.has(selector)) continue;
    if ([...turnOwnedTokens].some((token) => selectorOwnsToken(selector, token))) continue;
    findings.push({
      code: 'retained_source_scope_violation',
      severity: 'blocking',
      category: 'prompt_compliance',
      selector,
      message: `Retained-source aesthetic repair exceeded the current agent-owned change by modifying untouched selector ${selector}. Restore the pre-repair source and keep the screenshot repair inside selectors authored by this turn.`,
    });
  }
  return findings;
}

export type BuildInBricksDesignPlan = {
  schema: 'pixflow.build_in_bricks.design_plan.v1';
  createdAt: string;
  targetTitle: string;
  promptSummary: string;
  scope: 'full_page' | 'section' | 'component';
  pageIntent: string;
  visualConcept: string;
  requiredMedia: Array<{
    kind: 'background_image' | 'content_image' | 'product_image' | 'portfolio_image' | 'iconography';
    reason: string;
  }>;
  requiredProof: string[];
  conversionGoal: string;
  routeContext: {
    available: boolean;
    activeRouteId: string | null;
    routeFamily: string | null;
    cssVariableCount: number;
    utilityClassCount: number;
    globalClassCount: number;
    bricksColorVariableCount: number;
  };
};

export type BuildInBricksQualityGate = {
  schema: 'pixflow.build_in_bricks.quality_gate.v1';
  createdAt: string;
  ok: boolean;
  status: 'pass' | 'warning' | 'fail';
  findings: BuildInBricksFinding[];
  /** Compatibility projection for callers that still render category/message. */
  issues: Array<BuildInBricksFinding & { severity: 'blocking' | 'warning' }>;
  designPlan: BuildInBricksDesignPlan;
  evidence: {
    sectionCount: number;
    headingCount: number;
    imageCount: number;
    requiredContent: string[];
    missingRequiredContent: string[];
    screenshotCount: number;
  };
};

export type BuildInBricksSourceCritique = {
  ok: boolean;
  /** Canonical Build critiques populate typed findings; optional for legacy adapters. */
  findings?: BuildInBricksFinding[];
  issues: string[];
  warnings?: string[];
  repaired: boolean;
  designPlan?: BuildInBricksDesignPlan;
  qualityGate?: BuildInBricksQualityGate;
};

export type BuildInBricksAuthoredHtmlValidation =
  | { ok: true; findings: [] }
  | { ok: false; findings: BuildInBricksFinding[] };

const BOUNDED_COMPONENT_ROOTS = new Set([
  'article', 'aside', 'div', 'figure', 'footer', 'form', 'header', 'nav', 'ol',
  'section', 'ul',
]);
const VOID_HTML_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);

/**
 * Return authored top-level element names without creating a browser document.
 * This deliberately small scanner is sufficient for the scoped source boundary:
 * comments are ignored, element nesting is retained, and void/self-closing
 * elements never become stack parents.
 */
function authoredTopLevelElementNames(value: string): string[] {
  const source = value.replace(/<!--[\s\S]*?-->/g, '');
  const roots: string[] = [];
  const stack: string[] = [];
  for (const match of source.matchAll(/<\s*(\/?)\s*([a-z][a-z0-9:-]*)\b[^>]*>/gi)) {
    const closing = match[1] === '/';
    const name = String(match[2] || '').toLowerCase();
    if (!name) continue;
    if (closing) {
      const matchingIndex = stack.lastIndexOf(name);
      if (matchingIndex >= 0) stack.splice(matchingIndex);
      continue;
    }
    if (stack.length === 0) roots.push(name);
    if (!VOID_HTML_ELEMENTS.has(name) && !/\/\s*>$/.test(String(match[0] || ''))) {
      stack.push(name);
    }
  }
  return roots;
}

/**
 * Validate the agent-authored page-content representation. Browser document
 * shell elements are host-owned and are therefore invalid here even though
 * they are required in the separately compiled render artifact.
 */
export function validateBuildInBricksAuthoredHtmlDiscipline(
  value: string,
  generationScope: 'full_page' | 'section' | 'component' = 'full_page',
): BuildInBricksAuthoredHtmlValidation {
  const findings: BuildInBricksFinding[] = [];
  if (/<!doctype\b|<\/?(?:html|head|body)\b/i.test(value)) {
    findings.push({
      code: 'authored_document_shell',
      severity: 'blocking',
      category: 'source_contract',
      message: 'Build source must contain page-content HTML only; Pixflow owns the browser document shell.',
    });
  }
  const roots = authoredTopLevelElementNames(value);
  if (generationScope === 'section' && (roots.length !== 1 || roots[0] !== 'section')) {
    findings.push({
      code: 'scope_mismatch',
      severity: 'blocking',
      category: 'scope_alignment',
      message: 'Section scope must contain exactly one bounded <section> root.',
    });
  }
  if (generationScope === 'component' && (roots.length !== 1 || !BOUNDED_COMPONENT_ROOTS.has(roots[0] || ''))) {
    findings.push({
      code: 'scope_mismatch',
      severity: 'blocking',
      category: 'scope_alignment',
      message: 'Component scope must contain exactly one bounded semantic/component root.',
    });
  }
  if (generationScope !== 'component'
    && !/(<main\b|<section\b|<header\b|<footer\b|<article\b|<nav\b|<form\b|<figure\b)/i.test(value)) {
    findings.push({
      code: 'html_discipline',
      severity: 'blocking',
      category: 'source_contract',
      message: 'Build source is missing semantic page regions.',
    });
  }
  return findings.length > 0 ? { ok: false, findings } : { ok: true, findings: [] };
}

/**
 * Compatibility/UI projection of the canonical deterministic findings.
 * Classification is already complete at this point; message wording cannot
 * change whether a finding blocks conversion.
 */
export function projectBuildInBricksSourceCritique(
  qualityGate: BuildInBricksQualityGate,
): BuildInBricksSourceCritique {
  const blocking = qualityGate.findings.filter((finding) => finding.severity === 'blocking');
  const warnings = qualityGate.findings.filter((finding) => finding.severity === 'warning');
  return {
    ok: blocking.length === 0,
    findings: qualityGate.findings,
    issues: blocking.map((finding) => finding.message),
    warnings: warnings.map((finding) => finding.message),
    repaired: false,
    designPlan: qualityGate.designPlan,
    qualityGate,
  };
}

type BuildContractContext = {
  prompt?: string;
  targetTitle?: string;
  claimEvidenceText?: string;
  baselineHtml?: string;
  generationScope?: 'full_page' | 'section' | 'component';
  cloneReconText?: string;
};

function containsRenderedReviewEvidenceMedia(value: string): boolean {
  const references = [
    ...value.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi),
    ...value.matchAll(/\burl\(\s*["']?([^"')]+)["']?\s*\)/gi),
  ].map((match) => {
    try {
      return decodeURIComponent(String(match[1] || ''));
    } catch {
      return String(match[1] || '');
    }
  });
  return references.some((reference) => {
    const normalized = reference.replace(/\\/g, '/').toLowerCase().split(/[?#]/, 1)[0] || '';
    return /(?:^|\/)build-source\/runs\/[^/]+\/captures\//.test(normalized)
      || /(?:^|\/)(?:\.\.\/)*runs\/[^/]+\/captures\//.test(normalized);
  });
}

function hasUnlabelledFormControl(html: string): boolean {
  const labelledIds = new Set([...html.matchAll(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]));
  for (const match of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const attrs = String(match[2] || '');
    if (/\btype\s*=\s*["']hidden["']/i.test(attrs)) continue;
    if (/\b(?:aria-label|aria-labelledby|title)\s*=\s*["'][^"']+["']/i.test(attrs)) continue;
    const id = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
    if (id && labelledIds.has(id)) continue;
    const before = html.slice(0, match.index || 0).toLowerCase();
    if (before.lastIndexOf('<label') > before.lastIndexOf('</label>')) continue;
    return true;
  }
  return false;
}

function unsupportedClaims(html: string, evidenceText: string): Array<{ code: 'unsupported_numeric_claim' | 'unsupported_fact'; value: string }> {
  const text = extractBuildInBricksVisibleText(html);
  const evidence = evidenceText.toLowerCase().replace(/\s+/g, ' ');
  const patterns: Array<['unsupported_numeric_claim' | 'unsupported_fact', RegExp]> = [
    ['unsupported_numeric_claim', /\btop\s+\d+\b|\b\d+(?:\.\d+)?\s*(?:%|x|×|\+)\b|\b\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\b/gi],
    ['unsupported_fact', /\b(?:award[-\s]?winning|certified|accredited|guaranteed?)\b[^.!?\n]{0,100}|(?:£|\$|€)\s?\d+(?:\.\d+)?\s?(?:[kmb])?\+?/gi],
  ];
  const output: Array<{ code: 'unsupported_numeric_claim' | 'unsupported_fact'; value: string }> = [];
  for (const [code, pattern] of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = String(match[0] || '').replace(/\s+/g, ' ').trim();
      if (value && !evidence.includes(value.toLowerCase())) output.push({ code, value });
    }
  }
  return output;
}

function routeCounts(routeContext?: PixflowRouteContextSnapshot | null): BuildInBricksDesignPlan['routeContext'] {
  const framework = routeContext?.sources?.framework;
  return {
    available: Boolean(routeContext?.activeRouteId),
    activeRouteId: routeContext?.activeRouteId || null,
    routeFamily: framework?.routeFamily || null,
    cssVariableCount: routeContext?.allowlists?.cssVariables?.length || 0,
    utilityClassCount: routeContext?.allowlists?.utilityClasses?.length || 0,
    globalClassCount: routeContext?.allowlists?.globalClassNames?.length || 0,
    bricksColorVariableCount: routeContext?.allowlists?.bricksColorVariables?.length || 0,
  };
}

export function buildBuildInBricksDesignPlan({
  prompt,
  targetTitle,
  routeContext,
  generationScope = 'full_page',
  mediaPolicy = 'unspecified',
}: {
  prompt: string;
  targetTitle: string;
  routeContext?: PixflowRouteContextSnapshot | null;
  generationScope?: 'full_page' | 'section' | 'component';
  mediaPolicy?: PixflowBricksMediaPolicy;
}): BuildInBricksDesignPlan {
  const requiredMedia: BuildInBricksDesignPlan['requiredMedia'] = [];
  if (mediaPolicy === 'generated' || mediaPolicy === 'placeholder') {
    requiredMedia.push({
      kind: 'content_image',
      reason: `The selected agent established the ${mediaPolicy} media policy.`,
    });
  }
  return {
    schema: 'pixflow.build_in_bricks.design_plan.v1',
    createdAt: new Date().toISOString(),
    targetTitle: targetTitle || 'Current Bricks page',
    promptSummary: String(prompt || targetTitle).replace(/\s+/g, ' ').trim().slice(0, 480),
    scope: generationScope,
    pageIntent: generationScope === 'full_page' ? 'Deliver the requested page purpose.' : `Deliver the requested ${generationScope}.`,
    visualConcept: 'Use the supplied destination design context and intentional web-native composition.',
    requiredMedia,
    requiredProof: [],
    conversionGoal: 'Preserve the selected agent\'s requested content and conversion intent.',
    routeContext: routeCounts(routeContext),
  };
}

export function critiqueBuildInBricksSource(value: string, context: BuildContractContext = {}): BuildInBricksSourceCritique {
  const findings: BuildInBricksFinding[] = [];
  const warnings: BuildInBricksFinding[] = [];
  const text = extractBuildInBricksVisibleText(value);
  const scope = context.generationScope || 'full_page';
  if (/<img\b(?![^>]*\bsrc\s*=)|<img\b[^>]*\bsrc\s*=\s*["']\s*["']|<img\b(?![^>]*\balt\s*=)/i.test(value)) findings.push({ code: 'invalid_image', severity: 'blocking', category: 'media_fidelity', message: 'Build source image slots need valid source and alt intent.' });
  if (containsRenderedReviewEvidenceMedia(value)) findings.push({ code: 'invalid_image', severity: 'blocking', category: 'media_fidelity', message: 'Build source must not promote rendered-review evidence captures into authored page media.' });
  if (hasUnlabelledFormControl(value)) findings.push({ code: 'invalid_form_label', severity: 'blocking', category: 'semantic_safety', message: 'Build source form controls need accessible labels.' });
  if (/<a\b(?![^>]*href\s*=)/i.test(value)) findings.push({ code: 'invalid_link_target', severity: 'blocking', category: 'semantic_safety', message: 'Build source link controls need real href targets or must be buttons.' });
  for (const claim of unsupportedClaims(value, [context.prompt, context.targetTitle, context.claimEvidenceText, context.baselineHtml].filter(Boolean).join('\n'))) {
    findings.push({ code: claim.code, severity: 'blocking', category: 'semantic_safety', message: `${claim.code === 'unsupported_numeric_claim' ? 'Unsupported numeric proof claim' : 'Unsupported factual claim'}: ${claim.value}.` });
  }
  if (scope === 'full_page' && !/<h1\b/i.test(value)) warnings.push({ code: 'aesthetic_hierarchy', severity: 'warning', category: 'visual_ambition', message: 'Build source aesthetic review: missing clear H1 for page purpose.' });
  if ((value.match(/<section\b/gi) || []).length > 1 && (value.match(/<h[1-3]\b/gi) || []).length < 2) warnings.push({ code: 'aesthetic_hierarchy', severity: 'warning', category: 'visual_ambition', message: 'Build source aesthetic review: weak visual hierarchy with too few meaningful headings.' });
  if (scope === 'full_page' && !/(<a\b[^>]*href\s*=|<button\b|<form\b)/i.test(value)) warnings.push({ code: 'aesthetic_conversion_path', severity: 'warning', category: 'content_specificity', message: 'Build source aesthetic review: missing conversion path or useful visitor action.' });
  if (/\b(lorem ipsum|your company|company name|service one|feature one|placeholder|insert copy|coming soon)\b/i.test(text)) warnings.push({ code: 'aesthetic_scaffold', severity: 'warning', category: 'visual_ambition', message: 'Build source aesthetic review: contains placeholder or generic scaffold copy.' });
  return {
    ok: findings.length === 0,
    findings: [...findings, ...warnings],
    issues: findings.map((finding) => finding.message),
    warnings: warnings.map((finding) => finding.message),
    repaired: false,
  };
}

export function evaluateBuildInBricksSourceQualityGate(
  html: string,
  options: {
    prompt: string;
    targetTitle: string;
    routeContext?: PixflowRouteContextSnapshot | null;
    designPlan?: BuildInBricksDesignPlan;
    visualGate?: { screenshotCount: number; completed: boolean; attempted: boolean; repaired: boolean };
    generationScope?: 'full_page' | 'section' | 'component';
    compositionDna?: string | null;
    includePageSpecificTokens?: boolean;
    buildInBricksSource?: boolean;
  },
): BuildInBricksQualityGate {
  const designPlan = options.designPlan || buildBuildInBricksDesignPlan({
    prompt: options.prompt,
    targetTitle: options.targetTitle,
    routeContext: options.routeContext,
    generationScope: options.generationScope,
  });
  const critique = critiqueBuildInBricksSource(html, options);
  const findings = [...(critique.findings || [])];
  if (designPlan.requiredMedia.length > 0 && !/<img\b[^>]*\bsrc\s*=|background(?:-image)?\s*:\s*url\(/i.test(html)) {
    findings.push({ code: 'required_media_missing', severity: 'blocking', category: 'media_fidelity', message: 'The selected agent required media, but Build source contains no recoverable image.' });
  }
  if (options.visualGate?.attempted && !options.visualGate.completed) {
    findings.push({ code: 'render_evidence', severity: 'warning', category: 'visual_evidence', message: 'Rendered evidence was unavailable or incomplete; deterministic source validation remains authoritative.' });
  }
  const blocking = findings.filter((finding) => finding.severity === 'blocking');
  const warning = findings.filter((finding) => finding.severity === 'warning');
  return {
    schema: 'pixflow.build_in_bricks.quality_gate.v1',
    createdAt: new Date().toISOString(),
    ok: blocking.length === 0,
    status: blocking.length > 0 ? 'fail' : warning.length > 0 ? 'warning' : 'pass',
    findings,
    issues: findings.filter((finding): finding is BuildInBricksFinding & { severity: 'blocking' | 'warning' } => finding.severity !== 'informational'),
    designPlan,
    evidence: {
      sectionCount: (html.match(/<section\b/gi) || []).length,
      headingCount: (html.match(/<h[1-3]\b/gi) || []).length,
      imageCount: (html.match(/<img\b/gi) || []).length,
      requiredContent: [],
      missingRequiredContent: [],
      screenshotCount: options.visualGate?.screenshotCount || 0,
    },
  };
}

export function validateBuildInBricksCompiledDocument(
  value: string,
  generationScope: 'full_page' | 'section' | 'component' = 'full_page',
): { ok: true } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  const text = value.trim().toLowerCase();
  if (generationScope === 'full_page' && (!text.includes('<html') || !text.includes('</html>') || !text.includes('<body'))) issues.push('missing complete html/body document');
  if (generationScope !== 'component'
    && !/(<main\b|<section\b|<header\b|<footer\b|<article\b|<nav\b|<form\b|<figure\b)/i.test(value)) {
    issues.push('missing semantic page regions');
  }
  const css = [...value.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1] || '').join('\n');
  if (/<link\b[^>]*\brel\s*=\s*["'][^"']*stylesheet[^"']*["'][^>]*\bhref\s*=\s*["'](?:https?:)?\/\//i.test(value)) issues.push('contains remote stylesheet links');
  if (/@import\b/i.test(css)) issues.push('contains CSS @import');
  if (/<script\b[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\//i.test(value)) issues.push('contains external script references');
  if (/(?:<main|<section|<article|<header|<footer)[^>]*(?:hidden|style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0))/i.test(value)) issues.push('contains hidden primary content');
  if (/\b(bricks-result|bricks-draft|bricks-page-plan|_cssGlobalClasses|_cssCustom|mutationType|applyMutation|bricks_control|bricksJson)\b/i.test(value)) issues.push('contains Bricks JSON/control/mutation terms');
  if (/<script\b[\s\S]*?(?:document\.body\.innerHTML|document\.documentElement\.innerHTML|window\.bricksData|document\.write\s*\(|eval\s*\(|new Function\s*\()/i.test(value)) issues.push('contains script-driven page replacement or Bricks runtime mutation');
  return issues.length > 0 ? { ok: false, issues } : { ok: true };
}

/** @deprecated Compatibility alias; canonical Build uses the explicit compiled-document name. */
export const validateBuildInBricksHtmlDiscipline = validateBuildInBricksCompiledDocument;
