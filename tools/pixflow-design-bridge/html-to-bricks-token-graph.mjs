import { createHash } from 'node:crypto';

import { parsePixflowStylesheetDeclarations } from './html-to-bricks-style-ownership.mjs';

export const PIXFLOW_HTML_TOKEN_GRAPH_SCHEMA = 'pixflow.html_to_bricks.token_graph.v1';

export function reconcilePixflowHtmlTokenGraph({
  cssText = '',
  globalClasses = [],
  pageSettings = {},
  sourceClassIdByName = new Map(),
  runtimeVariables = {},
  routeContract = {},
  existingGlobalData = {},
  colorSystem = {},
  additionalSettings = [],
} = {}) {
  const declarations = parsePixflowStylesheetDeclarations(cssText);
  const variableDeclarations = declarations.filter((item) => firstString(item?.property).startsWith('--'));
  const definitionsByName = new Map();
  const declarationsByName = new Map();
  for (const declaration of variableDeclarations) {
    const name = firstString(declaration.property);
    const list = declarationsByName.get(name) || [];
    list.push(declaration);
    declarationsByName.set(name, list);
    if (!declaration.media || !definitionsByName.has(name)) definitionsByName.set(name, declaration);
  }
  const runtime = new Map(Object.entries(record(runtimeVariables))
    .filter(([name, value]) => name.startsWith('--') && firstString(value))
    .map(([name, value]) => [name, firstString(value)]));
  const cycles = detectVariableCycles(definitionsByName);
  const cycleNames = new Set(cycles.flat());
  const memo = new Map();
  const substitutedUndefinedNames = new Set();

  const resolveToken = (name, stack = []) => {
    if (memo.has(name)) return memo.get(name);
    if (stack.includes(name)) return { ok: false, value: '', resolution: 'cycle_without_fallback', missing: [name], cycle: true };
    const declaration = definitionsByName.get(name);
    if (!declaration) {
      const runtimeValue = runtime.get(name);
      return runtimeValue
        ? { ok: true, value: runtimeValue, resolution: 'runtime_evidence', missing: [], cycle: false }
        : { ok: false, value: '', resolution: 'undefined', missing: [name], cycle: false };
    }
    const resolved = resolveCssValue(declaration.value, [...stack, name], resolveToken);
    const result = {
      ok: resolved.ok,
      value: resolved.value,
      resolution: resolved.usedCycleFallback
        ? 'cycle_fallback'
        : (resolved.usedFallback ? 'authored_fallback' : (resolved.usedRuntime ? 'runtime_evidence' : 'source_definition')),
      missing: resolved.missing,
      cycle: cycleNames.has(name),
    };
    memo.set(name, result);
    return result;
  };

  const tokens = [...declarationsByName.entries()].map(([name, tokenDeclarations]) => {
    const resolved = resolveToken(name);
    return {
      name,
      status: resolved.ok ? 'resolved' : 'unresolved',
      authoredValue: firstString(definitionsByName.get(name)?.value),
      resolvedValue: resolved.ok ? resolved.value : 'unset',
      resolution: resolved.ok ? resolved.resolution : 'css_semantic_unset',
      scopes: uniqueStrings(tokenDeclarations.map((item) => firstString(item.selector))),
      responsive: tokenDeclarations.some((item) => Boolean(firstString(item.media))),
      modeSpecific: tokenDeclarations.some((item) => /\[(?:data-theme|data-mode|class)[^\]]*\]|prefers-color-scheme/i.test(firstString(item.selector, item.media))),
      sourceOrders: tokenDeclarations.map((item) => Number(item.sourceOrder || 0)),
      missingReferences: resolved.missing,
      provenance: resolved.resolution === 'runtime_evidence' ? 'observed_source' : 'authored_source',
    };
  });

  const classById = new Map(arrayValue(globalClasses).map((item) => [firstString(item?.id), item]).filter(([id]) => id));
  const pageTokenBlocks = [];
  for (const declaration of variableDeclarations) {
    const name = firstString(declaration.property);
    const resolved = resolveToken(name);
    const emittedValue = resolved.ok && (resolved.resolution === 'authored_fallback' || resolved.resolution === 'cycle_fallback')
      ? resolved.value
      : firstString(declaration.value, 'unset');
    const simpleClass = firstString(declaration.selector).match(/^\.([A-Za-z0-9_-]+)$/);
    if (simpleClass) {
      const classId = firstString(sourceClassIdByName?.get?.(simpleClass[1]));
      const classItem = classById.get(classId);
      if (classItem) appendClassTokenDefinition(classItem, name, emittedValue, declaration.media);
      continue;
    }
    const selector = normalizeTokenSelector(declaration.selector);
    if (!selector) continue;
    const rule = `${selector} { ${name}: ${emittedValue}; }`;
    pageTokenBlocks.push(declaration.media ? `@media ${declaration.media} { ${rule} }` : rule);
  }
  if (pageTokenBlocks.length > 0) {
    pageSettings.customCss = uniqueStrings([firstString(pageSettings.customCss), ...pageTokenBlocks]).join('\n');
  }

  const trustedDestinationVariableNames = collectTrustedDestinationVariableNames(routeContract);
  const outputDefinedNames = new Set([
    ...variableDeclarations.map((item) => firstString(item.property)),
    ...trustedDestinationVariableNames,
  ]);
  for (const classItem of arrayValue(globalClasses)) {
    rewriteUndefinedReferencesDeep(classItem.settings, {
      definitions: outputDefinedNames,
      runtime,
      substitutedUndefinedNames,
    });
  }
  if (pageSettings && typeof pageSettings === 'object') {
    rewriteUndefinedReferencesDeep(pageSettings, {
      definitions: outputDefinedNames,
      runtime,
      substitutedUndefinedNames,
    });
  }
  for (const settings of arrayValue(additionalSettings)) {
    if (!settings || typeof settings !== 'object') continue;
    rewriteUndefinedReferencesDeep(settings, {
      definitions: outputDefinedNames,
      runtime,
      substitutedUndefinedNames,
    });
  }

  const framework = applyExactFrameworkReuse(globalClasses, routeContract);
  const frameworkDefinedNames = new Set(framework.exactReuses.map((item) => firstString(item.cssVariable)).filter(Boolean));
  const repeatedValueCandidates = collectRepeatedSettingValues(globalClasses);
  const colourInventory = buildColourInventory(cssText, existingGlobalData, colorSystem);
  const resourceAdditions = buildResourceAdditions({
    colourInventory,
    repeatedValueCandidates,
    colorSystem,
    existingGlobalData,
  });
  applyResourceReferences(globalClasses, resourceAdditions);
  for (const variable of resourceAdditions.variables) {
    const cssVariable = firstString(variable?.cssVariable);
    if (cssVariable) outputDefinedNames.add(cssVariable);
  }
  const outputStrings = collectStrings([globalClasses, pageSettings, ...arrayValue(additionalSettings)]);
  const undefinedOutputReferences = [];
  for (const value of outputStrings) {
    for (const reference of parseVarReferences(value)) {
      if (!outputDefinedNames.has(reference.name)
        && !frameworkDefinedNames.has(reference.name)
        && !runtime.has(reference.name)
        && !reference.fallback) {
        undefinedOutputReferences.push({ name: reference.name, value });
      }
    }
  }

  return {
    schema: PIXFLOW_HTML_TOKEN_GRAPH_SCHEMA,
    version: 1,
    ok: undefinedOutputReferences.length === 0,
    tokenCount: tokens.length,
    resolvedTokenCount: tokens.filter((item) => item.status === 'resolved').length,
    unresolvedTokenCount: tokens.filter((item) => item.status !== 'resolved').length,
    cycleCount: cycles.length,
    undefinedOutputReferenceCount: undefinedOutputReferences.length,
    outputDefinedVariables: [...new Set([...outputDefinedNames, ...frameworkDefinedNames])].sort(),
    resolvedUndefinedVariableNames: [...substitutedUndefinedNames].sort(),
    tokens,
    cycles,
    undefinedOutputReferences,
    repeatedValueCandidates,
    colours: colourInventory,
    framework,
    collisions: colourInventory.collisions,
    mutationIntent: {
      variableCategory: colourInventory.variableCategory,
      palette: colourInventory.palette,
      resourceAdditions,
      persistenceAuthority: 'controlled_insert_global_data_journal',
      requiresPersistenceBeforeContent: resourceAdditions.variables.length > 0 || resourceAdditions.paletteColors.length > 0,
    },
  };
}

function resolveCssValue(value, stack, resolveToken) {
  const references = parseVarReferences(value);
  if (references.length === 0) {
    return { ok: true, value: firstString(value), missing: [], usedFallback: false, usedCycleFallback: false, usedRuntime: false };
  }
  let output = String(value);
  let ok = true;
  let usedFallback = false;
  let usedCycleFallback = false;
  let usedRuntime = false;
  const missing = [];
  for (const reference of references.reverse()) {
    const resolved = resolveToken(reference.name, stack);
    let replacement = '';
    if (resolved.ok) {
      replacement = resolved.value;
      usedRuntime ||= resolved.resolution === 'runtime_evidence';
    } else if (reference.fallback) {
      const fallback = resolveCssValue(reference.fallback, stack, resolveToken);
      replacement = fallback.ok ? fallback.value : 'unset';
      usedFallback = true;
      usedCycleFallback ||= resolved.cycle || stack.includes(reference.name);
      ok &&= fallback.ok;
      missing.push(...fallback.missing);
    } else {
      replacement = 'unset';
      ok = false;
      missing.push(reference.name, ...arrayValue(resolved.missing));
    }
    output = `${output.slice(0, reference.start)}${replacement}${output.slice(reference.end)}`;
  }
  return { ok, value: output.trim(), missing: uniqueStrings(missing), usedFallback, usedCycleFallback, usedRuntime };
}

function parseVarReferences(value) {
  const source = String(value || '');
  const result = [];
  const pattern = /var\(\s*(--[A-Za-z0-9_-]+)/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const open = source.indexOf('(', match.index);
    const close = findClosingParen(source, open);
    if (close < 0) break;
    const body = source.slice(open + 1, close);
    const comma = findTopLevelComma(body);
    result.push({
      name: match[1],
      fallback: comma >= 0 ? body.slice(comma + 1).trim() : '',
      start: match.index,
      end: close + 1,
    });
    pattern.lastIndex = close + 1;
  }
  return result;
}

function findClosingParen(source, open) {
  let depth = 0;
  let quote = '';
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote && source[index - 1] !== '\\') quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(') depth += 1;
    else if (char === ')' && --depth === 0) return index;
  }
  return -1;
}

function findTopLevelComma(source) {
  let depth = 0;
  let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote && source[index - 1] !== '\\') quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) return index;
  }
  return -1;
}

function detectVariableCycles(definitionsByName) {
  const graph = new Map();
  for (const [name, declaration] of definitionsByName) {
    graph.set(name, parseVarReferences(declaration.value).map((item) => item.name).filter((ref) => definitionsByName.has(ref)));
  }
  const cycles = [];
  const visited = new Set();
  const active = [];
  const walk = (name) => {
    const activeIndex = active.indexOf(name);
    if (activeIndex >= 0) {
      const cycle = [...active.slice(activeIndex), name];
      const signature = [...new Set(cycle)].sort().join('|');
      if (!cycles.some((item) => [...new Set(item)].sort().join('|') === signature)) cycles.push([...new Set(cycle)]);
      return;
    }
    if (visited.has(name)) return;
    active.push(name);
    for (const dependency of graph.get(name) || []) walk(dependency);
    active.pop();
    visited.add(name);
  };
  for (const name of graph.keys()) walk(name);
  return cycles;
}

function appendClassTokenDefinition(classItem, name, value, media) {
  classItem.settings = record(classItem.settings);
  const body = `%root% { ${name}: ${value}; }`;
  const rule = media ? `@media ${media} { ${body} }` : body;
  const existing = firstString(classItem.settings._cssCustom);
  if (!existing.includes(rule)) classItem.settings._cssCustom = [existing, rule].filter(Boolean).join('\n');
}

function normalizeTokenSelector(selector) {
  const value = firstString(selector);
  if (/^(?::root|html|body)$/i.test(value)) return ':root';
  return value;
}

function rewriteUndefinedReferencesDeep(value, context) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') value[key] = rewriteUndefinedString(item, context);
    else if (item && typeof item === 'object') rewriteUndefinedReferencesDeep(item, context);
  }
}

function rewriteUndefinedString(value, context) {
  const references = parseVarReferences(value);
  if (references.length === 0) return value;
  let output = String(value);
  let hardUndefined = false;
  for (const reference of references.reverse()) {
    if (context.definitions.has(reference.name)) continue;
    let replacement = '';
    if (context.runtime.has(reference.name)) replacement = context.runtime.get(reference.name);
    else if (reference.fallback) replacement = rewriteUndefinedString(reference.fallback, context);
    else {
      replacement = 'unset';
      hardUndefined = true;
    }
    context.substitutedUndefinedNames.add(reference.name);
    output = `${output.slice(0, reference.start)}${replacement}${output.slice(reference.end)}`;
  }
  return hardUndefined && references.length === 1 && references[0].start === 0 && references[0].end === String(value).length
    ? 'unset'
    : output;
}

function applyExactFrameworkReuse(globalClasses, routeContract) {
  const contract = record(routeContract);
  const frameworkContext = record(contract.frameworkContext);
  const authority = record(contract.variableAuthority);
  const available = frameworkContext.status === 'available' && authority.mode === 'live_route_context';
  const variables = arrayValue(authority.variables);
  const allowed = new Set(arrayValue(authority.allowedCssVariables).map(firstString).filter(Boolean));
  const exactReuses = [];
  const fallbacks = [];
  let rejectedColourCount = 0;

  const visit = (value, path = []) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      const nextPath = [...path, key];
      if (typeof item === 'string') {
        const category = categoryForSettingPath(nextPath);
        if (!category || item.includes('var(')) continue;
        const candidates = variables.filter((variable) => variableCategory(variable) === category);
        const exact = candidates.find((variable) => normalizeCssValue(variable?.value) === normalizeCssValue(item)
          && allowed.has(firstString(variable?.cssName)));
        if (category === 'colour') {
          if (exact) rejectedColourCount += 1;
          if (exact || candidates.length > 0) fallbacks.push({ sourceValue: item, category, reason: 'colour_uses_separate_authority', provenance: 'observed_source' });
          continue;
        }
        if (available && exact) {
          value[key] = `var(${firstString(exact.cssName)})`;
          exactReuses.push({
            sourceValue: item,
            targetValue: firstString(exact.value),
            targetToken: firstString(exact.name),
            cssVariable: firstString(exact.cssName),
            category,
            confidence: 'exact',
            reason: 'live_route_exact_resolved_match',
            provenance: { source: 'observed_source', output: 'framework_equivalent' },
          });
        } else if (candidates.length > 0) {
          fallbacks.push({
            sourceValue: item,
            category,
            reason: available ? 'uploaded_html_requires_exact_framework_match' : 'framework_context_not_available',
            provenance: 'observed_source',
          });
        }
      } else if (item && typeof item === 'object') visit(item, nextPath);
    }
  };
  for (const classItem of arrayValue(globalClasses)) visit(record(classItem?.settings));
  return {
    contextStatus: firstString(frameworkContext.status, 'unavailable'),
    exactReuseCount: exactReuses.length,
    rejectedColourCount,
    exactReuses,
    fallbacks,
    libraryMappingAllowed: false,
  };
}

function collectTrustedDestinationVariableNames(routeContract) {
  const contract = record(routeContract);
  const frameworkContext = record(contract.frameworkContext);
  const authority = record(contract.variableAuthority);
  if (frameworkContext.status !== 'available' || authority.mode !== 'live_route_context') return new Set();
  return new Set(arrayValue(authority.allowedCssVariables)
    .map(firstString)
    .filter((name) => name.startsWith('--')));
}

function categoryForSettingPath(path) {
  const value = path.join('.').toLowerCase();
  if (/color|colour|background/.test(value)) return 'colour';
  if (/padding|margin|gap|space/.test(value)) return 'spacing';
  if (/font-size|line-height|letter-spacing|typography/.test(value)) return 'typography';
  if (/radius/.test(value)) return 'radius';
  if (/shadow/.test(value)) return 'shadow';
  if (/widthmax|container/.test(value)) return 'container';
  if (/display|grid|direction|align|justify|layout/.test(value)) return 'layout';
  return '';
}

function variableCategory(variable) {
  const value = firstString(variable?.categoryName, variable?.category).toLowerCase();
  if (/colou?r/.test(value)) return 'colour';
  if (/spacing|space/.test(value)) return 'spacing';
  if (/type|font|typography/.test(value)) return 'typography';
  if (/radius/.test(value)) return 'radius';
  if (/shadow/.test(value)) return 'shadow';
  if (/container/.test(value)) return 'container';
  if (/layout|grid/.test(value)) return 'layout';
  return '';
}

function buildColourInventory(cssText, existingGlobalData, colorSystem = {}) {
  // The compact functional-colour matcher intentionally handles only flat
  // literals. A value such as `hsl(var(--brand))` contains nested parentheses;
  // matching to the first `)` produces the invalid token `hsl(var(--brand)`
  // and can invalidate the remainder of Bricks' generated stylesheet when it
  // is persisted as a global variable. Those values already retain their
  // authored CSS-variable owner, so exclude them from literal tokenisation.
  const matches = (String(cssText || '').match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)/g) || [])
    .filter((value) => !/var\(/i.test(value));
  const frequency = new Map();
  for (const value of matches.map((item) => normalizeCssValue(item))) frequency.set(value, (frequency.get(value) || 0) + 1);
  const repeated = [...frequency.entries()].filter(([, count]) => count > 1);
  const sourceHash = createHash('sha256').update(repeated.map(([value]) => value).sort().join('|')).digest('hex').slice(0, 10);
  const suppliedPalette = record(record(colorSystem).palette);
  const suppliedCategory = record(record(colorSystem).variableCategory);
  const proposedName = firstString(suppliedPalette.name, `Pixflow HTML source colours ${sourceHash}`);
  const palettes = arrayValue(record(existingGlobalData).palettes);
  const variables = arrayValue(record(existingGlobalData).variables);
  const nameCollision = palettes.find((item) => firstString(item?.name).toLowerCase() === proposedName.toLowerCase() && firstString(item?.owner) !== 'pixflow');
  const finalName = nameCollision ? `${proposedName} (Pixflow)` : proposedName;
  const paletteId = firstString(suppliedPalette.id, `pfh-${sourceHash}`);
  const colors = repeated.map(([value, count]) => ({
    id: createHash('sha256').update(`${paletteId}:${value}`).digest('hex').slice(0, 6),
    name: `source-${createHash('sha256').update(value).digest('hex').slice(0, 6)}`,
    value,
    occurrences: count,
    provenance: 'observed_source',
  }));
  const userVariableNames = new Set(variables.filter((item) => firstString(item?.owner) !== 'pixflow').map((item) => firstString(item?.name).toLowerCase()));
  return {
    occurrenceCount: matches.length,
    uniqueCount: frequency.size,
    repeatedCount: repeated.length,
    palette: { id: paletteId, name: finalName, owner: 'pixflow', colors },
    variableCategory: {
      id: firstString(suppliedCategory.id, `pfv-${sourceHash}`),
      name: firstString(suppliedCategory.name, `Pixflow HTML source tokens ${sourceHash}`),
      owner: 'pixflow',
    },
    collisions: {
      paletteNameCollisionCount: nameCollision ? 1 : 0,
      variableNameCollisionCount: [...userVariableNames].filter((name) => name.startsWith('pf-source-')).length,
      userOwnedOverwriteCount: 0,
      policy: 'rename_pixflow_record_never_overwrite_user_owned_global_data',
    },
  };
}

function collectRepeatedSettingValues(globalClasses) {
  const values = [];
  const visit = (value, path = []) => {
    if (typeof value === 'string' && isStableNonColourTokenCandidate(value, path)) {
      values.push({ value, path: path.join('.'), category: categoryForSettingPath(path) });
    }
    else if (Array.isArray(value)) value.forEach((item, index) => visit(item, [...path, String(index)]));
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) visit(item, [...path, key]);
  };
  for (const classItem of arrayValue(globalClasses)) visit(record(classItem?.settings));
  const frequency = new Map();
  for (const item of values) {
    const key = `${normalizeCssValue(item.value)}\u0000${item.category}`;
    const current = frequency.get(key) || { value: item.value, category: item.category, paths: [], count: 0 };
    current.count += 1;
    current.paths.push(item.path);
    frequency.set(key, current);
  }
  return [...frequency.values()].filter((item) => item.count > 1);
}

function isStableNonColourTokenCandidate(value, path) {
  const text = firstString(value);
  const category = categoryForSettingPath(path);
  if (!text || !category || category === 'colour' || text.includes('var(')) return false;
  if (/^#|^(?:rgb|hsl|oklch)a?\(/i.test(text)) return false;
  return /-?\d*\.?\d+(?:px|rem|em|%|vw|vh|vmin|vmax|ch|ex|s|ms|deg)\b|^(?:calc|min|max|clamp)\(/i.test(text)
    || (category === 'shadow' && /\s/.test(text));
}

function buildResourceAdditions({ colourInventory, repeatedValueCandidates, colorSystem, existingGlobalData }) {
  const suppliedVariables = arrayValue(record(colorSystem).variables);
  const existingVariables = [
    ...suppliedVariables,
    ...arrayValue(record(existingGlobalData).variables),
  ];
  const reservedNames = new Set(existingVariables.map((item) => firstString(item?.name).replace(/^--/, '')).filter(Boolean));
  const category = record(colourInventory.variableCategory);
  const variables = [];
  const paletteColors = [];
  const colourReferences = [];
  const valueReferences = [];

  for (const color of arrayValue(colourInventory.palette?.colors)) {
    const value = firstString(color?.value);
    const existing = suppliedVariables.find((item) => normalizeCssValue(item?.value) === normalizeCssValue(value)
      && firstString(item?.cssVariable, item?.name));
    const suffix = createHash('sha256').update(`colour:${value}`).digest('hex').slice(0, 8);
    const baseName = existing
      ? firstString(existing.cssVariable, existing.name).replace(/^--/, '')
      : collisionSafeResourceName(`pf-source-color-${suffix}`, reservedNames);
    const cssVariable = `--${baseName}`;
    if (!existing) {
      reservedNames.add(baseName);
      const variableId = createHash('sha256').update(`variable:${baseName}`).digest('hex').slice(0, 6);
      variables.push({
        id: variableId,
        name: baseName,
        label: `Source colour ${suffix}`,
        cssVariable,
        value,
        category: firstString(category.id),
        owner: 'pixflow',
        create: true,
        semanticRole: 'colour',
        provenance: 'repeated_authored_source_literal',
      });
      paletteColors.push({
        id: firstString(color?.id, createHash('sha256').update(`palette:${baseName}`).digest('hex').slice(0, 6)),
        name: baseName,
        label: `Source colour ${suffix}`,
        raw: `var(${cssVariable})`,
        light: value,
        owner: 'pixflow',
        provenance: 'repeated_authored_source_literal',
      });
    }
    colourReferences.push({ value, cssVariable });
  }

  for (const candidate of arrayValue(repeatedValueCandidates)) {
    const value = firstString(candidate?.value);
    const semanticRole = firstString(candidate?.category, 'value');
    const existing = suppliedVariables.find((item) => normalizeCssValue(item?.value) === normalizeCssValue(value)
      && variableCategory(item) === semanticRole
      && firstString(item?.cssVariable, item?.name));
    const suffix = createHash('sha256').update(`${semanticRole}:${normalizeCssValue(value)}`).digest('hex').slice(0, 8);
    const baseName = existing
      ? firstString(existing.cssVariable, existing.name).replace(/^--/, '')
      : collisionSafeResourceName(`pf-source-${semanticRole}-${suffix}`, reservedNames);
    const cssVariable = `--${baseName}`;
    if (!existing) {
      reservedNames.add(baseName);
      variables.push({
        id: createHash('sha256').update(`variable:${baseName}`).digest('hex').slice(0, 6),
        name: baseName,
        label: `Source ${semanticRole} ${suffix}`,
        cssVariable,
        value,
        category: firstString(category.id),
        owner: 'pixflow',
        create: true,
        semanticRole,
        scope: 'global_stable_repetition',
        occurrences: Number(candidate?.count || 0),
        provenance: 'repeated_authored_source_literal',
      });
    }
    valueReferences.push({ value, semanticRole, cssVariable });
  }

  return {
    variableCategory: category,
    palette: { id: firstString(colourInventory.palette?.id), name: firstString(colourInventory.palette?.name), owner: 'pixflow' },
    variables,
    paletteColors,
    colourReferences,
    valueReferences,
  };
}

function applyResourceReferences(globalClasses, additions) {
  const colours = arrayValue(additions?.colourReferences);
  const values = arrayValue(additions?.valueReferences);
  const visit = (value, path = []) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      const nextPath = [...path, key];
      if (typeof item === 'string') {
        if (key === '_cssCustom') continue;
        const colour = colours.find((candidate) => normalizeCssValue(candidate.value) === normalizeCssValue(item));
        if (colour) {
          value[key] = `var(${colour.cssVariable})`;
          continue;
        }
        const category = categoryForSettingPath(nextPath);
        const token = values.find((candidate) => candidate.semanticRole === category
          && normalizeCssValue(candidate.value) === normalizeCssValue(item));
        if (token) value[key] = `var(${token.cssVariable})`;
      } else if (item && typeof item === 'object') visit(item, nextPath);
    }
  };
  for (const classItem of arrayValue(globalClasses)) visit(record(classItem?.settings));
}

function collisionSafeResourceName(baseName, reservedNames) {
  if (!reservedNames.has(baseName)) return baseName;
  let index = 2;
  while (reservedNames.has(`${baseName}-${index}`)) index += 1;
  return `${baseName}-${index}`;
}

function collectStrings(value, result = []) {
  if (typeof value === 'string') result.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, result);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) collectStrings(item, result);
  return result;
}

function normalizeCssValue(value) {
  return firstString(value).replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').trim().toLowerCase();
}

function uniqueStrings(values) {
  return [...new Set(arrayValue(values).map(firstString).filter(Boolean))];
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstString(...values) {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim();
  return '';
}
