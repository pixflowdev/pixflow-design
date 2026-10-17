/**
 * Pixflow-owned CSS cascade and style-ownership evidence.
 *
 * This module knows CSS semantics and the public compatibility adapter, but it
 * does not know Bricks internals or call a native converter. It resolves the
 * safe subset that can be represented by one source global class and reports
 * the destination chosen for every authored declaration.
 */

import { resolvePixflowBricksCssMapping } from './html-to-bricks-compatibility.mjs';

export const PIXFLOW_HTML_STYLE_OWNERSHIP_SCHEMA = 'pixflow.html_to_bricks.style_ownership.v1';

export function parsePixflowStylesheetDeclarations(cssText = '') {
  return parseStylesheet(cssText).declarations.map((item) => ({ ...item }));
}

export function resolvePixflowSimpleClassCascade({ rules = [], usageByClass = new Map() } = {}) {
  const candidatesByClass = new Map();
  const decisions = [];

  for (const rule of arrayValue(rules)) {
    const selectors = splitSelectorList(rule?.selector);
    for (let selectorIndex = 0; selectorIndex < selectors.length; selectorIndex += 1) {
      const selector = selectors[selectorIndex];
      const simpleClass = simpleClassSelector(selector);
      if (!simpleClass) continue;
      const tag = firstString(String(selector || '').trim().match(/^([a-z][a-z0-9-]*)\s*\./i)?.[1]).toLowerCase();
      const className = firstString(simpleClass.className);
      const usedTags = arrayValue(usageByClass?.get?.(className)?.tags)
        .map((item) => firstString(item).toLowerCase())
        .filter(Boolean);
      const safelyLiftable = !tag || usedTags.length === 0 || usedTags.every((usedTag) => usedTag === tag);
      for (const [propertyValue, rawValue] of Object.entries(record(rule?.declarations))) {
        const property = firstString(propertyValue).toLowerCase();
        const parsed = parseImportant(rawValue);
        if (!property || !parsed.value || property.startsWith('--')) continue;
        const candidate = {
          className,
          tag,
          selector,
          ruleIndex: positiveInteger(rule?.index),
          property,
          value: parsed.value,
          rawValue: String(rawValue),
          important: parsed.important,
          specificity: tag ? [0, 1, 1] : [0, 1, 0],
          sourceOrder: (positiveInteger(rule?.index) * 1000) + selectorIndex,
          safelyLiftable,
        };
        const byProperty = candidatesByClass.get(className) || new Map();
        const incumbent = byProperty.get(property);
        if (!incumbent || compareCascade(candidate, incumbent) >= 0) {
          byProperty.set(property, candidate);
        }
        candidatesByClass.set(className, byProperty);
      }
    }
  }

  const declarationsByClass = new Map();
  for (const [className, byProperty] of candidatesByClass) {
    const declarations = {};
    for (const winner of byProperty.values()) {
      const destination = winner.important || !winner.safelyLiftable
        ? 'scoped_class_css'
        : 'global_class_native_candidate';
      decisions.push({ ...winner, destination });
      if (destination === 'global_class_native_candidate') declarations[winner.property] = winner.value;
    }
    declarationsByClass.set(className, declarations);
  }

  return { declarationsByClass, decisions };
}

export function buildPixflowStyleOwnershipReport({
  cssText = '',
  sourceHtml = '',
  globalClasses = [],
  sourceClassIdByName = new Map(),
  usageByClass = new Map(),
  cascadeDecisions = [],
  pageSettings = {},
  compatibilityContext = {},
  resolvedUndefinedVariableNames = [],
  themeStylePayload = {},
} = {}) {
  const parsed = parseStylesheet(cssText);
  const sourceEvidence = buildSourceSelectorEvidence(sourceHtml, sourceClassIdByName, usageByClass);
  const classById = new Map(arrayValue(globalClasses)
    .map((item) => [firstString(item?.id), item])
    .filter(([id]) => id));
  const publicClassNameBySourceName = new Map();
  if (sourceClassIdByName?.entries) {
    for (const [sourceNameValue, classIdValue] of sourceClassIdByName.entries()) {
      const sourceName = firstString(sourceNameValue);
      const publicName = firstString(classById.get(firstString(classIdValue))?.name);
      if (sourceName && publicName && sourceName !== publicName) {
        publicClassNameBySourceName.set(sourceName, publicName);
      }
    }
  }
  const declaredVariables = new Set(parsed.declarations
    .filter((item) => item.property.startsWith('--'))
    .map((item) => item.property));
  const resolvedVariables = new Set(arrayValue(resolvedUndefinedVariableNames).map(firstString).filter(Boolean));
  const pageCss = firstString(record(pageSettings).customCss);
  const themeStyleSettings = record(record(themeStylePayload).settings);
  const themeStyleStylesheet = firstString(record(themeStyleSettings.css).stylesheet);
  const themeStyleDeclarations = new Map(arrayValue(record(record(themeStylePayload).ownership).declarations)
    .map((item) => [[
      firstString(item?.selector),
      firstString(item?.property).toLowerCase(),
      firstString(item?.value),
    ].join('\u0000'), item]));
  const cascadeWinnerKeys = new Set(arrayValue(cascadeDecisions).map((item) => [
    firstString(item?.selector),
    firstString(item?.property).toLowerCase(),
    firstString(item?.value),
  ].join('\u0000')));
  const declarations = [];
  const ignoredDeclarations = [];

  for (const declaration of parsed.declarations) {
    if (declaration.kind !== 'keyframes' && !selectorCanAffectSource(declaration.selector, sourceEvidence)) {
      ignoredDeclarations.push({
        selector: declaration.selector,
        property: declaration.property,
        value: declaration.value,
        sourceOrder: declaration.sourceOrder,
        reason: 'selector_does_not_match_frozen_source_dom',
      });
      continue;
    }
    const classNames = classNamesFromSelector(declaration.selector);
    const mapping = resolvePixflowBricksCssMapping(declaration.property, compatibilityContext);
    const state = simpleClassState(declaration.selector);
    const simpleClass = simpleClassSelector(declaration.selector);
    const relationship = selectorHasRelationship(declaration.selector);
    const pseudoElement = /::[A-Za-z0-9_-]+/.test(declaration.selector);
    let destination = '';
    let ownerId = '';
    let control = '';
    let fallbackReason = '';
    let emitted = false;
    let browserWinner = 'runtime_selector_preserved';

    if (simpleClass && !state && !declaration.media && cascadeWinnerKeys.size > 0) {
      const winnerKey = [declaration.selector, declaration.property, declaration.value].join('\u0000');
      if (!cascadeWinnerKeys.has(winnerKey)) {
        declarations.push({
          selector: declaration.selector,
          property: declaration.property,
          value: declaration.value,
          important: declaration.important,
          media: declaration.media,
          state: '',
          destination: 'overridden_source_declaration',
          ownerId: '',
          control: '',
          emitted: true,
          fallbackReason: 'overridden_by_higher_priority_source_declaration',
          unresolvedVariables: [],
          sourceOrder: declaration.sourceOrder,
          sourceRule: { selector: declaration.selector, sourceOrder: declaration.sourceOrder },
          browserWinner: 'overridden_source_declaration',
          confidence: 1,
        });
        continue;
      }
      browserWinner = 'author_cascade_winner';
    }

    if (declaration.kind === 'keyframes') {
      destination = 'page_css';
      fallbackReason = 'shared_keyframe_definition';
      emitted = pageCss.includes(declaration.name);
    } else if (declaration.property.startsWith('--')) {
      destination = 'variable_token_candidate';
      fallbackReason = 'custom_property_owned_by_token_phase';
      emitted = true;
    } else if (themeStyleDeclarations.has([declaration.selector, declaration.property, declaration.value].join('\u0000'))) {
      const foundationOwner = record(themeStyleDeclarations.get([declaration.selector, declaration.property, declaration.value].join('\u0000')));
      destination = firstString(foundationOwner.destination, 'theme_style_stylesheet');
      ownerId = firstString(record(themeStylePayload).id);
      control = [firstString(foundationOwner.group), firstString(foundationOwner.control)].filter(Boolean).join('.');
      fallbackReason = destination === 'theme_style_native_control'
        ? 'source_derived_page_foundation_native_control'
        : 'source_derived_page_foundation_scoped_stylesheet';
      emitted = destination === 'theme_style_native_control'
        ? Boolean(firstString(foundationOwner.group) && Object.prototype.hasOwnProperty.call(
          record(themeStyleSettings[firstString(foundationOwner.group)]),
          firstString(foundationOwner.control),
        ))
        : themeStyleStylesheet.includes(declaration.property);
    } else if (/^(?::root|html|body)(?:\b|\s|,)/i.test(declaration.selector)) {
      destination = 'page_css';
      fallbackReason = 'document_level_selector';
      emitted = pageCss.includes(declaration.property);
    } else if (simpleClass || state) {
      const className = firstString(simpleClass?.className, state?.className);
      const classId = firstString(sourceClassIdByName?.get?.(className));
      const settings = record(classById.get(classId)?.settings);
      const possibleControls = arrayValue(mapping.controls);
      const suffix = state ? `:${state.state}` : '';
      const nativeControlKey = possibleControls
        .flatMap((candidate) => {
          const exact = `${candidate}${suffix}`;
          const responsive = declaration.media
            ? Object.keys(settings).filter((key) => key.startsWith(`${exact}:`))
            : [];
          return [exact, ...responsive];
        })
        .find((candidate) => Object.prototype.hasOwnProperty.call(settings, candidate));
      const customCss = firstString(settings._cssCustom);
      if (!declaration.important && mapping.ownership === 'native_control' && nativeControlKey) {
        destination = 'global_class_native_control';
        ownerId = classId;
        control = nativeControlKey;
        emitted = true;
      } else {
        destination = 'scoped_class_css';
        ownerId = classId;
        fallbackReason = declaration.important
          ? 'important_cascade_requires_scoped_css'
          : (mapping.ownership === 'native_control' ? 'native_control_not_safe_for_selector' : mapping.reason);
        emitted = customCss.includes(declaration.property);
      }
    } else if (classNames.length > 0) {
      destination = 'scoped_class_css';
      fallbackReason = pseudoElement
        ? 'pseudo_element_requires_scoped_css'
        : (relationship ? 'relationship_selector_requires_scoped_css' : 'compound_selector_requires_scoped_css');
      for (const className of classNames) {
        const classId = firstString(sourceClassIdByName?.get?.(className));
        const customCss = firstString(record(classById.get(classId)?.settings)._cssCustom);
        if (!ownerId && customCss.includes(declaration.property)) ownerId = classId;
        if (customCss.includes(declaration.property)) emitted = true;
      }
      if (!emitted && pageCss.includes(declaration.property) && pageCssContainsSelectorDependency(
        pageCss,
        declaration.selector,
        publicClassNameBySourceName,
      )) {
        destination = 'page_css';
        fallbackReason = 'selector_owner_pruned_page_scope_preserves_source_cascade';
        emitted = true;
      }
    } else {
      destination = 'page_css';
      fallbackReason = 'classless_selector_requires_page_scope';
      emitted = pageCss.includes(declaration.property);
    }

    const unresolvedVariables = [...String(declaration.value).matchAll(/var\((--[A-Za-z0-9_-]+)/g)]
      .map((match) => match[1])
      .filter((name) => !declaredVariables.has(name) && !resolvedVariables.has(name));
    declarations.push({
      selector: declaration.kind === 'keyframes' ? `@keyframes ${declaration.name}` : declaration.selector,
      property: declaration.kind === 'keyframes' ? '@keyframes' : declaration.property,
      value: declaration.value,
      important: declaration.important,
      media: declaration.media,
      state: firstString(state?.state),
      destination,
      ownerId,
      control,
      emitted,
      fallbackReason,
      unresolvedVariables,
      sourceOrder: declaration.sourceOrder,
      sourceRule: { selector: declaration.selector, sourceOrder: declaration.sourceOrder },
      browserWinner,
      confidence: emitted ? (destination === 'global_class_native_control' ? 1 : 0.95) : 0,
    });
  }

  const silentLoss = declarations.filter((item) => !item.emitted && item.destination !== 'variable_token_candidate');
  const unresolved = declarations.filter((item) => item.unresolvedVariables.length > 0);
  const destinations = {
    theme_style_candidate: 0,
    theme_style_native_control: 0,
    theme_style_stylesheet: 0,
    global_class_native_control: 0,
    element_native_control: 0,
    variable_token_candidate: 0,
    scoped_class_css: 0,
    element_css: 0,
    page_css: 0,
    overridden_source_declaration: 0,
  };
  for (const item of declarations) destinations[item.destination] = (destinations[item.destination] || 0) + 1;
  const customCssBytes = arrayValue(globalClasses)
    .reduce((sum, item) => sum + Buffer.byteLength(firstString(record(item?.settings)._cssCustom)), 0);
  const pageCssBytes = Buffer.byteLength(pageCss);

  return {
    schema: PIXFLOW_HTML_STYLE_OWNERSHIP_SCHEMA,
    version: 1,
    ok: silentLoss.length === 0 && unresolved.length === 0,
    declarationCount: declarations.length,
    ignoredDeclarationCount: ignoredDeclarations.length,
    unresolvedDeclarationCount: unresolved.length,
    silentLossCount: silentLoss.length,
    nativeControlDeclarationCount: destinations.global_class_native_control || 0,
    themeStyleNativeDeclarationCount: destinations.theme_style_native_control || 0,
    themeStyleStylesheetDeclarationCount: destinations.theme_style_stylesheet || 0,
    fallbackDeclarationCount: (destinations.scoped_class_css || 0)
      + (destinations.page_css || 0)
      + (destinations.theme_style_stylesheet || 0),
    scopedCustomCssBytes: customCssBytes,
    pageCssBytes,
    destinations,
    declarations,
    ignoredDeclarations,
    errors: [
      ...silentLoss.map((item) => ({
        code: 'style_declaration_not_emitted',
        severity: 'error',
        message: `${item.selector} ${item.property} has no verified output owner.`,
        selector: item.selector,
        property: item.property,
      })),
      ...unresolved.map((item) => ({
        code: 'style_value_has_undefined_variable',
        severity: 'error',
        message: `${item.selector} ${item.property} references ${item.unresolvedVariables.join(', ')}.`,
        selector: item.selector,
        property: item.property,
      })),
    ],
  };
}

function pageCssContainsSelectorDependency(pageCss, sourceSelector, publicClassNameBySourceName) {
  const css = String(pageCss || '');
  const selector = String(sourceSelector || '').trim();
  if (!css || !selector) return false;
  if (css.includes(selector)) return true;

  let collisionAliasedSelector = selector;
  for (const sourceName of extractPixflowCssClassNames(selector)) {
    const publicName = firstString(publicClassNameBySourceName?.get?.(sourceName));
    if (!publicName || publicName === sourceName) continue;
    collisionAliasedSelector = replacePixflowCssClassSelector(
      collisionAliasedSelector,
      sourceName,
      `:is(.${encodePixflowCssIdentifier(sourceName)},.${encodePixflowCssIdentifier(publicName)})`,
    );
  }
  return collisionAliasedSelector !== selector && css.includes(collisionAliasedSelector);
}

function buildSourceSelectorEvidence(sourceHtml, sourceClassIdByName, usageByClass) {
  const html = String(sourceHtml || '');
  const markup = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const tags = new Set([...markup.matchAll(/<([a-z][a-z0-9-]*)\b/gi)].map((match) => match[1].toLowerCase()));
  const ids = new Set([...markup.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]));
  const attributes = new Set([...markup.matchAll(/\s([a-z_:][-a-z0-9_:.]*)\s*(?:=|\s|>)/gi)].map((match) => match[1].toLowerCase()));
  const classes = new Set();
  if (sourceClassIdByName?.keys) {
    for (const name of sourceClassIdByName.keys()) classes.add(String(name));
  }
  // After structure compilation the lifecycle-pruned source-name map is the
  // authority. Fall back to parser usage only for isolated report callers
  // that do not provide that post-structure map.
  if (classes.size === 0 && usageByClass?.keys) {
    for (const name of usageByClass.keys()) classes.add(String(name));
  }
  return { htmlPresent: Boolean(html.trim()), tags, ids, attributes, classes };
}

function selectorCanAffectSource(selector, evidence) {
  if (!evidence.htmlPresent) return true;
  const value = String(selector || '').trim();
  const classNames = classNamesFromSelector(value);
  if (classNames.length > 0 && !classNames.every((name) => evidence.classes.has(name))) return false;
  const ids = [...value.matchAll(/#([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
  if (ids.length > 0 && !ids.every((id) => evidence.ids.has(id))) return false;
  const attributes = [...value.matchAll(/\[\s*([A-Za-z_:][-A-Za-z0-9_:.]*)/g)].map((match) => match[1].toLowerCase());
  if (attributes.length > 0 && !attributes.every((name) => evidence.attributes.has(name))) return false;
  if (/^(?:\*|::?before|::?after|:root)(?:\b|$)/i.test(value)) return true;
  const tags = [...value.matchAll(/(?:^|[\s>+~,])([a-z][a-z0-9-]*)\b/gi)]
    .map((match) => match[1].toLowerCase())
    .filter((tag) => !['from', 'to'].includes(tag));
  if (tags.some((tag) => tag !== 'html' && tag !== 'body' && !evidence.tags.has(tag))) return false;
  if (classNames.length > 0 || ids.length > 0 || attributes.length > 0) return true;
  return tags.length === 0 || tags.every((tag) => tag === 'html' || tag === 'body' || evidence.tags.has(tag));
}

function parseStylesheet(cssText) {
  const source = String(cssText || '').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const declarations = [];
  let sourceOrder = 0;

  const visit = (text, context = {}) => {
    let cursor = 0;
    while (cursor < text.length) {
      while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
      if (cursor >= text.length) break;
      const open = findNextOutside(text, '{', cursor);
      if (open < 0) break;
      const close = findBlockClose(text, open);
      if (close < 0) break;
      const header = text.slice(cursor, open).trim();
      const body = text.slice(open + 1, close);
      cursor = close + 1;
      if (!header) continue;
      const media = header.match(/^@media(?:\s+|(?=\())(.+)$/i);
      if (media) {
        visit(body, { ...context, media: media[1].trim() });
        continue;
      }
      const keyframes = header.match(/^@(?:-[a-z]+-)?keyframes\s+([A-Za-z0-9_-]+)/i);
      if (keyframes) {
        declarations.push({
          kind: 'keyframes',
          name: keyframes[1],
          selector: header,
          property: '@keyframes',
          value: body.trim(),
          important: false,
          media: firstString(context.media),
          sourceOrder: sourceOrder += 1,
        });
        continue;
      }
      if (header.startsWith('@')) {
        visit(body, { ...context, condition: header });
        continue;
      }
      for (const selector of splitSelectorList(header)) {
        for (const [property, rawValue] of parseDeclarations(body)) {
          const parsed = parseImportant(rawValue);
          declarations.push({
            kind: 'declaration',
            selector,
            property: property.toLowerCase(),
            value: parsed.value,
            important: parsed.important,
            media: firstString(context.media),
            sourceOrder: sourceOrder += 1,
          });
        }
      }
    }
  };
  visit(source);
  return { declarations };
}

function parseDeclarations(body) {
  const entries = [];
  let current = '';
  let quote = '';
  let depth = 0;
  const flush = () => {
    const separator = findNextOutside(current, ':', 0);
    if (separator > 0) {
      const property = current.slice(0, separator).trim();
      const value = current.slice(separator + 1).trim();
      if (property && value) entries.push([property, value]);
    }
    current = '';
  };
  for (const char of String(body || '')) {
    if (quote) {
      current += char;
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    if (char === ';' && depth === 0) flush();
    else current += char;
  }
  flush();
  return entries;
}

function compareCascade(left, right) {
  if (left.important !== right.important) return left.important ? 1 : -1;
  for (let index = 0; index < 3; index += 1) {
    if (left.specificity[index] !== right.specificity[index]) {
      return left.specificity[index] > right.specificity[index] ? 1 : -1;
    }
  }
  return left.sourceOrder === right.sourceOrder ? 0 : (left.sourceOrder > right.sourceOrder ? 1 : -1);
}

function parseImportant(value) {
  const text = String(value || '').trim();
  return {
    value: text.replace(/\s*!important\s*$/i, '').trim(),
    important: /\s!important\s*$/i.test(text),
  };
}

function simpleClassSelector(selector) {
  const value = String(selector || '').trim();
  const classNames = extractPixflowCssClassNames(value);
  if (classNames.length !== 1) return null;
  const encoded = encodePixflowCssIdentifier(classNames[0]);
  const match = value.match(new RegExp(`^(?:[a-z][a-z0-9-]*\\s*)?\\.${escapeRegExp(encoded)}$`, 'i'));
  return match ? { className: classNames[0] } : null;
}

function simpleClassState(selector) {
  const value = String(selector || '').trim();
  const classNames = extractPixflowCssClassNames(value);
  if (classNames.length !== 1) return null;
  const encoded = encodePixflowCssIdentifier(classNames[0]);
  const match = value.match(new RegExp(`^(?:[a-z][a-z0-9-]*\\s*)?\\.${escapeRegExp(encoded)}:(hover|focus|focus-visible|focus-within|active|visited|disabled|checked)$`, 'i'));
  return match ? { className: classNames[0], state: match[1].toLowerCase() } : null;
}

function selectorHasRelationship(selector) {
  const value = String(selector || '').trim();
  return /\s[>+~]\s/.test(value) || /\s+[.#a-z*[\]]/i.test(value);
}

function classNamesFromSelector(selector) {
  return extractPixflowCssClassNames(selector);
}

export function extractPixflowCssClassNames(selector) {
  const source = String(selector || '');
  const names = [];
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (source[index] === '"' || source[index] === "'") {
      index = readPixflowQuotedCssEnd(source, index);
      continue;
    }
    if (source[index] !== '.') {
      index += 1;
      continue;
    }
    const identifier = readPixflowCssIdentifier(source, index + 1);
    if (identifier.value) names.push(decodePixflowCssIdentifier(identifier.value));
    index = Math.max(index + 1, identifier.end);
  }
  return [...new Set(names.filter(Boolean))];
}

export function replacePixflowCssClassSelector(selector, className, replacement) {
  const source = String(selector || '');
  const expected = String(className || '');
  let output = '';
  let index = 0;
  while (index < source.length) {
    if (source[index] === '"' || source[index] === "'") {
      const stop = readPixflowQuotedCssEnd(source, index);
      output += source.slice(index, stop);
      index = stop;
      continue;
    }
    if (source[index] === '.') {
      const identifier = readPixflowCssIdentifier(source, index + 1);
      if (identifier.value && decodePixflowCssIdentifier(identifier.value) === expected) {
        output += replacement;
        index = identifier.end;
        continue;
      }
    }
    output += source[index];
    index += 1;
  }
  return output;
}

export function encodePixflowCssIdentifier(value) {
  return [...String(value || '')].map((character, index) => {
    if (/[A-Za-z0-9_-]/.test(character) && !(index === 0 && /[0-9]/.test(character))) return character;
    if (index === 0 && /[0-9]/.test(character)) return `\\${character.codePointAt(0).toString(16)} `;
    return `\\${character}`;
  }).join('');
}

function readPixflowCssIdentifier(source, start) {
  let index = start;
  while (index < source.length) {
    const character = source[index];
    if (character === '\\') {
      index += 1;
      if (index >= source.length) break;
      if (/[0-9a-f]/i.test(source[index])) {
        let digits = 0;
        while (index < source.length && /[0-9a-f]/i.test(source[index]) && digits < 6) {
          index += 1;
          digits += 1;
        }
        if (/\s/.test(source[index] || '')) index += 1;
      } else index += 1;
      continue;
    }
    if (/[A-Za-z0-9_-]/.test(character) || character.codePointAt(0) > 127) {
      index += 1;
      continue;
    }
    break;
  }
  return { value: source.slice(start, index), end: index };
}

function decodePixflowCssIdentifier(value) {
  return String(value || '').replace(/\\([0-9a-f]{1,6})(?:\s)?|\\(.)/gi, (full, hex, escaped) => (
    hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : escaped
  ));
}

function readPixflowQuotedCssEnd(source, start) {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    index += 1;
    if (source[index - 1] === quote) break;
  }
  return index;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitSelectorList(selector) {
  const result = [];
  let current = '';
  let quote = '';
  let depth = 0;
  for (const char of String(selector || '')) {
    if (quote) {
      current += char;
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      if (current.trim()) result.push(current.trim());
      current = '';
    } else current += char;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function findNextOutside(text, target, start) {
  let quote = '';
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote && text[index - 1] !== '\\') quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    if (char === target && depth === 0) return index;
  }
  return -1;
}

function findBlockClose(text, open) {
  let depth = 0;
  let quote = '';
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote && text[index - 1] !== '\\') quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return index;
  }
  return -1;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}
