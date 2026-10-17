/**
 * Post-structure global-class reachability for the Pixflow-owned converter.
 *
 * Class creation happens before the HTML tree is compiled because the compiler
 * needs stable IDs. This pass runs afterward and removes records that cannot
 * affect emitted output while retaining non-element dependencies explicitly.
 */

export const PIXFLOW_HTML_CLASS_LIFECYCLE_SCHEMA = 'pixflow.html_to_bricks.class_lifecycle.v1';

export function reconcilePixflowHtmlClassLifecycle({
  globalClasses = [],
  elementBuckets = [],
  classPlan = {},
  pageSettings = {},
  classIdBySourceName = new Map(),
} = {}) {
  const originalClasses = [...arrayValue(globalClasses)];
  const elements = arrayValue(elementBuckets).flatMap(arrayValue);
  const classById = new Map(originalClasses.map((item) => [firstString(item?.id), item]).filter(([id]) => id));
  const classByPublicName = new Map(originalClasses.map((item) => [firstString(item?.name), item]).filter(([name]) => name));
  const decisionById = new Map(arrayValue(record(classPlan).decisions)
    .map((item) => [firstString(item?.id), item])
    .filter(([id]) => id));
  const reasonsById = new Map();
  const referencesById = new Map();
  const addReason = (id, reason, reference = '') => {
    if (!classById.has(id)) return false;
    const reasons = reasonsById.get(id) || new Set();
    const changed = !reasons.has(reason);
    reasons.add(reason);
    reasonsById.set(id, reasons);
    if (reference) {
      const references = referencesById.get(id) || new Set();
      references.add(reference);
      referencesById.set(id, references);
    }
    return changed;
  };

  for (const element of elements) {
    const elementId = firstString(element?.id);
    for (const id of stringArray(record(element?.settings)._cssGlobalClasses)) {
      addReason(id, 'direct_element_reference', elementId);
    }
    for (const className of collectMarkupClassNames(record(element?.settings))) {
      const classItem = classByPublicName.get(className);
      if (classItem) addReason(firstString(classItem.id), 'retained_rich_markup_reference', elementId);
      const sourceId = firstString(classIdBySourceName?.get?.(className));
      if (sourceId) addReason(sourceId, 'retained_rich_markup_reference', elementId);
    }
  }

  const script = [
    firstString(record(pageSettings).customScriptsHeader),
    firstString(record(pageSettings).customScriptsBodyHeader),
    firstString(record(pageSettings).customScriptsBodyFooter),
  ].filter(Boolean).join('\n');
  for (const className of collectRetainedScriptClassHooks(script)) {
    const classItem = classByPublicName.get(className);
    if (classItem) addReason(firstString(classItem.id), 'retained_visual_script_hook', className);
    const sourceId = firstString(classIdBySourceName?.get?.(className));
    if (sourceId) addReason(sourceId, 'retained_visual_script_hook', className);
  }

  // A scoped fallback owned by one reachable class can refer to a folded rich
  // descendant or a runtime state class. Walk until no new dependency appears.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id] of reasonsById) {
      const customCss = firstString(record(classById.get(id)?.settings)._cssCustom);
      if (!customCss) continue;
      for (const className of classNamesFromCss(customCss)) {
        const dependency = classByPublicName.get(className);
        const dependencyId = firstString(dependency?.id, classIdBySourceName?.get?.(className));
        if (dependencyId && addReason(dependencyId, 'scoped_selector_dependency', id)) changed = true;
      }
    }
  }

  const retainedIds = new Set(reasonsById.keys());
  const retained = originalClasses.filter((item) => retainedIds.has(firstString(item?.id)));
  const retainedIdSet = new Set(retained.map((item) => firstString(item?.id)));
  const orphanReferences = [];
  const rawClassAttributes = [];
  for (const element of elements) {
    for (const id of stringArray(record(element?.settings)._cssGlobalClasses)) {
      if (!retainedIdSet.has(id)) orphanReferences.push({ elementId: firstString(element?.id), classId: id });
    }
    for (const attribute of arrayValue(record(element?.settings)._attributes)) {
      if (firstString(attribute?.name).toLowerCase() === 'class') {
        rawClassAttributes.push({ elementId: firstString(element?.id), value: firstString(attribute?.value) });
      }
    }
  }

  const classes = originalClasses.map((classItem) => {
    const id = firstString(classItem?.id);
    const decision = record(decisionById.get(id));
    const reasons = [...(reasonsById.get(id) || [])].sort();
    const nativeKeys = Object.keys(record(classItem?.settings)).filter((key) => key !== '_cssCustom');
    const customCss = firstString(record(classItem?.settings)._cssCustom);
    return {
      id,
      sourceName: firstString(decision.sourceName, classItem?.name),
      publicName: firstString(classItem?.name),
      kind: firstString(decision.kind, 'class'),
      status: firstString(decision.status, 'created'),
      disposition: retainedIds.has(id) ? 'retained' : 'pruned',
      reasons: retainedIds.has(id) ? reasons : ['unreachable_from_emitted_output'],
      references: [...(referencesById.get(id) || [])].sort(),
      nativeControlKeyCount: nativeKeys.length,
      customCssBytes: byteLength(customCss),
      customOnly: Boolean(customCss) && nativeKeys.length === 0,
    };
  });
  const duplicateSignatures = buildDuplicateSignatureReport(retained, decisionById);
  const retainedWithoutReason = classes.filter((item) => item.disposition === 'retained' && item.reasons.length === 0);
  const validationErrors = validateClassCatalog(retained);
  validationErrors.push(...orphanReferences.map((item) => ({ code: 'orphan_class_reference', ...item })));
  validationErrors.push(...rawClassAttributes.map((item) => ({ code: 'raw_class_attribute_with_global_class_contract', ...item })));
  const directIds = new Set(classes
    .filter((item) => item.reasons.includes('direct_element_reference'))
    .map((item) => item.id));

  // Mutate only the converter-owned in-memory catalog. Persistence and its
  // hash-guarded rollback journal remain at the controlled insert boundary.
  globalClasses.splice(0, globalClasses.length, ...retained);
  if (classIdBySourceName?.entries && classIdBySourceName?.delete) {
    for (const [sourceName, id] of classIdBySourceName.entries()) {
      if (!retainedIdSet.has(firstString(id))) classIdBySourceName.delete(sourceName);
    }
  }

  return {
    schema: PIXFLOW_HTML_CLASS_LIFECYCLE_SCHEMA,
    version: 1,
    ok: validationErrors.length === 0 && retainedWithoutReason.length === 0,
    originalClassCount: originalClasses.length,
    retainedClassCount: retained.length,
    prunedClassCount: originalClasses.length - retained.length,
    directlyReferencedClassCount: directIds.size,
    dependencyOnlyClassCount: retained.length - directIds.size,
    nativeControlClassCount: classes.filter((item) => item.disposition === 'retained' && item.nativeControlKeyCount > 0).length,
    customOnlyClassCount: classes.filter((item) => item.disposition === 'retained' && item.customOnly).length,
    duplicateSignatureGroupCount: duplicateSignatures.length,
    duplicateSignatureSurplusCount: duplicateSignatures.reduce((sum, item) => sum + item.classIds.length - 1, 0),
    orphanReferenceCount: orphanReferences.length,
    rawClassAttributeCount: rawClassAttributes.length,
    invalidClassRecordCount: validationErrors.length,
    unexplainedUnusedClassCount: retainedWithoutReason.length,
    classCustomCssBytes: classes
      .filter((item) => item.disposition === 'retained')
      .reduce((sum, item) => sum + item.customCssBytes, 0),
    classJsonBytes: byteLength(JSON.stringify(retained)),
    classes,
    duplicateSignatures,
    orphanReferences,
    rawClassAttributes,
    validationErrors,
    mutationIntent: {
      createdClassIds: arrayValue(record(classPlan).decisions)
        .filter((item) => firstString(item?.status) !== 'reused-compatible' && retainedIdSet.has(firstString(item?.id)))
        .map((item) => firstString(item?.id)),
      reusedClassIds: arrayValue(record(classPlan).decisions)
        .filter((item) => firstString(item?.status) === 'reused-compatible' && retainedIdSet.has(firstString(item?.id)))
        .map((item) => firstString(item?.id)),
      referenceCount: classes.reduce((sum, item) => sum + item.references.length, 0),
      persistenceAuthority: 'controlled_insert_global_data_journal',
    },
  };
}

/**
 * Reconcile every consumer of a source class after the collision planner has
 * selected the public Bricks class name. Bricks elements own styling through
 * `_cssGlobalClasses`, so raw source class attributes are deliberately absent.
 * Page/scoped CSS must therefore address both the public class and any exact
 * rich markup that still exposes the authored source name. Literal visual
 * script hooks target the public class so native Class Manager controls remain
 * effective when the hook mutates the DOM.
 */
export function reconcilePixflowHtmlClassRenameDependencies({
  globalClasses = [],
  elementBuckets = [],
  pageSettings = {},
  themeStylePayload = {},
  lifecycleReport = {},
} = {}) {
  const lifecycle = record(lifecycleReport);
  const aliases = arrayValue(lifecycle.classes)
    .filter((item) => firstString(item?.disposition) === 'retained')
    .map((item) => ({
      sourceName: firstString(item?.sourceName),
      publicName: firstString(item?.publicName),
    }))
    .filter((item) => item.sourceName && item.publicName && item.sourceName !== item.publicName);
  const renameMap = new Map(aliases.map((item) => [item.sourceName, item.publicName]));
  const statsBySource = new Map(aliases.map((item) => [item.sourceName, {
    sourceName: item.sourceName,
    publicName: item.publicName,
    cssSelectorAliasCount: 0,
    scriptSelectorAliasCount: 0,
    scriptHookRewriteCount: 0,
  }]));
  let cssConsumerCount = 0;
  let cssSelectorAliasCount = 0;
  let scriptConsumerCount = 0;
  let scriptSelectorAliasCount = 0;
  let scriptHookRewriteCount = 0;

  const applyCss = (owner, key) => {
    const source = firstString(owner?.[key]);
    if (!source || renameMap.size === 0) return;
    const rewritten = rewriteCssClassDependencies(source, renameMap);
    if (rewritten.value === source) return;
    owner[key] = rewritten.value;
    cssConsumerCount += 1;
    cssSelectorAliasCount += rewritten.count;
    mergeRenameDependencyCounts(statsBySource, rewritten.hitsBySource, 'cssSelectorAliasCount');
  };
  const applyScript = (owner, key) => {
    const source = firstString(owner?.[key]);
    if (!source || renameMap.size === 0) return;
    const rewritten = rewriteScriptClassDependencies(source, renameMap);
    if (rewritten.value === source) return;
    owner[key] = rewritten.value;
    scriptConsumerCount += 1;
    scriptSelectorAliasCount += rewritten.selectorAliasCount;
    scriptHookRewriteCount += rewritten.hookRewriteCount;
    mergeRenameDependencyCounts(statsBySource, rewritten.selectorHitsBySource, 'scriptSelectorAliasCount');
    mergeRenameDependencyCounts(statsBySource, rewritten.hookHitsBySource, 'scriptHookRewriteCount');
  };

  const page = record(pageSettings);
  applyCss(page, 'customCss');
  for (const key of ['customScriptsHeader', 'customScriptsBodyHeader', 'customScriptsBodyFooter']) {
    applyScript(page, key);
  }
  for (const fragment of arrayValue(page.pixflowScriptFragments)) applyScript(record(fragment), 'code');

  const themeSettings = record(record(themeStylePayload).settings);
  applyCss(record(themeSettings.css), 'stylesheet');
  for (const classItem of arrayValue(globalClasses)) applyCss(record(classItem?.settings), '_cssCustom');
  for (const element of arrayValue(elementBuckets).flatMap(arrayValue)) {
    applyCss(record(element?.settings), '_cssCustom');
  }

  const unresolvedBindings = [];
  for (const item of statsBySource.values()) {
    if (!item.publicName) unresolvedBindings.push({ sourceName: item.sourceName, reason: 'public_class_name_missing' });
  }
  const report = {
    schema: 'pixflow.html_to_bricks.class_rename_dependencies.v1',
    version: 1,
    ok: unresolvedBindings.length === 0,
    renamedClassCount: renameMap.size,
    cssConsumerCount,
    cssSelectorAliasCount,
    scriptConsumerCount,
    scriptSelectorAliasCount,
    scriptHookRewriteCount,
    unresolvedBindingCount: unresolvedBindings.length,
    unresolvedBindings,
    aliases: [...statsBySource.values()].sort((left, right) => left.sourceName.localeCompare(right.sourceName)),
    cssPolicy: 'preserve_source_arm_for_exact_rich_markup_and_add_public_bricks_class_arm',
    scriptPolicy: 'rewrite_supported_literal_hooks_to_public_bricks_class_and_alias_literal_selectors',
  };
  lifecycle.renameDependencies = report;
  lifecycle.ok = lifecycle.ok === true && report.ok;
  return report;
}

function mergeRenameDependencyCounts(statsBySource, hitsBySource, key) {
  for (const [sourceName, count] of hitsBySource) {
    const item = statsBySource.get(sourceName);
    if (item) item[key] += count;
  }
}

function rewriteCssClassDependencies(value, renameMap) {
  const source = String(value || '');
  const hitsBySource = new Map();
  let count = 0;
  let output = '';
  let index = 0;
  let statementStart = 0;
  const blockStack = [];
  while (index < source.length) {
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      output += source.slice(index, stop);
      index = stop;
      continue;
    }
    const character = source[index];
    if (character === '"' || character === "'") {
      const stop = readQuotedCssValueEnd(source, index);
      output += source.slice(index, stop);
      index = stop;
      continue;
    }
    const selectorContext = blockStack.at(-1) !== 'rule';
    if (selectorContext && character === '[') {
      const stop = readCssAttributeSelectorEnd(source, index);
      const block = source.slice(index, stop);
      const rewritten = rewriteCssClassAttributeSelector(block, renameMap);
      output += rewritten.value;
      count += rewritten.count;
      mergeCountMap(hitsBySource, rewritten.hitsBySource);
      index = stop;
      continue;
    }
    if (selectorContext && character === '.') {
      const identifier = readCssIdentifier(source, index + 1);
      const sourceName = decodeCssIdentifier(identifier.value);
      const publicName = renameMap.get(sourceName);
      if (identifier.value && publicName) {
        output += `:is(.${identifier.value},.${encodeCssIdentifier(publicName)})`;
        count += 1;
        hitsBySource.set(sourceName, (hitsBySource.get(sourceName) || 0) + 1);
        index = identifier.end;
        continue;
      }
    }
    output += character;
    if (character === '{') {
      const prelude = source.slice(statementStart, index).trim();
      blockStack.push(isCssRuleContainerAtRule(prelude) ? 'at-rule' : 'rule');
      statementStart = index + 1;
    } else if (character === '}') {
      blockStack.pop();
      statementStart = index + 1;
    } else if (character === ';' && blockStack.at(-1) !== 'rule') {
      statementStart = index + 1;
    }
    index += 1;
  }
  return { value: output, count, hitsBySource };
}

function rewriteSelectorClassDependencies(value, renameMap) {
  const source = String(value || '');
  const hitsBySource = new Map();
  let count = 0;
  let output = '';
  let index = 0;
  while (index < source.length) {
    if (source[index] === '[') {
      const stop = readCssAttributeSelectorEnd(source, index);
      const rewritten = rewriteCssClassAttributeSelector(source.slice(index, stop), renameMap);
      output += rewritten.value;
      count += rewritten.count;
      mergeCountMap(hitsBySource, rewritten.hitsBySource);
      index = stop;
      continue;
    }
    if (source[index] === '.') {
      const identifier = readCssIdentifier(source, index + 1);
      const sourceName = decodeCssIdentifier(identifier.value);
      const publicName = renameMap.get(sourceName);
      if (identifier.value && publicName) {
        output += `:is(.${identifier.value},.${encodeCssIdentifier(publicName)})`;
        count += 1;
        hitsBySource.set(sourceName, (hitsBySource.get(sourceName) || 0) + 1);
        index = identifier.end;
        continue;
      }
    }
    output += source[index];
    index += 1;
  }
  return { value: output, count, hitsBySource };
}

function rewriteCssClassAttributeSelector(value, renameMap) {
  const source = String(value || '');
  const match = source.match(/^(\[\s*class\s*([~|^$*]?=)\s*)(["'])([^"']*)(\3)(\s+[is])?(\s*\])$/i);
  const hitsBySource = new Map();
  if (!match) return { value: source, count: 0, hitsBySource };
  const operator = match[2];
  const sourceValue = match[4];
  let mappedValue = sourceValue;
  if (operator === '=') {
    mappedValue = sourceValue.split(/(\s+)/).map((token) => renameMap.get(token) || token).join('');
  } else {
    mappedValue = renameMap.get(sourceValue) || sourceValue;
  }
  if (mappedValue === sourceValue) return { value: source, count: 0, hitsBySource };
  const mappedSources = operator === '=' ? sourceValue.split(/\s+/).filter(Boolean) : [sourceValue];
  let count = 0;
  for (const sourceName of mappedSources) {
    if (!renameMap.has(sourceName)) continue;
    count += 1;
    hitsBySource.set(sourceName, (hitsBySource.get(sourceName) || 0) + 1);
  }
  const mapped = `${match[1]}${match[3]}${mappedValue}${match[3]}${match[6] || ''}${match[7]}`;
  return { value: `:is(${source},${mapped})`, count, hitsBySource };
}

function rewriteScriptClassDependencies(value, renameMap) {
  let source = String(value || '');
  const selectorHitsBySource = new Map();
  const hookHitsBySource = new Map();
  let selectorAliasCount = 0;
  let hookRewriteCount = 0;
  source = source.replace(/(\b(?:querySelector(?:All)?|matches|closest)\s*\(\s*)(["'])([^"'\r\n]*)(\2)/g, (full, prefix, quote, selector) => {
    const rewritten = rewriteSelectorClassDependencies(selector, renameMap);
    selectorAliasCount += rewritten.count;
    mergeCountMap(selectorHitsBySource, rewritten.hitsBySource);
    return `${prefix}${quote}${rewritten.value}${quote}`;
  });
  source = source.replace(/(\bgetElementsByClassName\s*\(\s*)(["'])([A-Za-z0-9_-]+)(\2)/g, (full, prefix, quote, className) => {
    const publicName = renameMap.get(className);
    if (!publicName) return full;
    hookRewriteCount += 1;
    hookHitsBySource.set(className, (hookHitsBySource.get(className) || 0) + 1);
    return `${prefix}${quote}${publicName}${quote}`;
  });
  source = source.replace(/(classList\s*\.\s*(?:add|remove|toggle|contains)\s*\()([^)]*)(\))/gi, (full, prefix, args, suffix) => {
    const rewrittenArgs = args.replace(/(["'])([A-Za-z0-9_-]+)(\1)/g, (token, quote, className) => {
      const publicName = renameMap.get(className);
      if (!publicName) return token;
      hookRewriteCount += 1;
      hookHitsBySource.set(className, (hookHitsBySource.get(className) || 0) + 1);
      return `${quote}${publicName}${quote}`;
    });
    return `${prefix}${rewrittenArgs}${suffix}`;
  });
  source = source.replace(/(setAttribute\s*\(\s*["']class["']\s*,\s*)(["'])([^"']*)(\2)/gi, (full, prefix, quote, classNames) => {
    let changed = false;
    const mapped = classNames.split(/(\s+)/).map((token) => {
      const publicName = renameMap.get(token);
      if (!publicName) return token;
      changed = true;
      hookRewriteCount += 1;
      hookHitsBySource.set(token, (hookHitsBySource.get(token) || 0) + 1);
      return publicName;
    }).join('');
    return changed ? `${prefix}${quote}${mapped}${quote}` : full;
  });
  return {
    value: source,
    selectorAliasCount,
    hookRewriteCount,
    selectorHitsBySource,
    hookHitsBySource,
  };
}

function readCssIdentifier(source, start) {
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
      } else {
        index += 1;
      }
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

function decodeCssIdentifier(value) {
  return String(value || '').replace(/\\([0-9a-f]{1,6})(?:\s)?|\\(.)/gi, (full, hex, escaped) => (
    hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : escaped
  ));
}

function encodeCssIdentifier(value) {
  return [...String(value || '')].map((character, index) => {
    if (/[A-Za-z0-9_-]/.test(character) && !(index === 0 && /[0-9]/.test(character))) return character;
    if (index === 0 && /[0-9]/.test(character)) return `\\${character.codePointAt(0).toString(16)} `;
    return `\\${character}`;
  }).join('');
}

function readQuotedCssValueEnd(source, start) {
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

function readCssAttributeSelectorEnd(source, start) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '"' || source[index] === "'") {
      index = readQuotedCssValueEnd(source, index);
      continue;
    }
    if (source[index] === ']') return index + 1;
    index += 1;
  }
  return source.length;
}

function isCssRuleContainerAtRule(prelude) {
  return /^@(?:media|supports|container|layer|document|scope|keyframes|-webkit-keyframes)\b/i.test(String(prelude || '').trim());
}

function mergeCountMap(target, source) {
  for (const [key, value] of source) target.set(key, (target.get(key) || 0) + value);
}

function validateClassCatalog(classes) {
  const errors = [];
  const seenIds = new Set();
  const seenNames = new Set();
  for (const classItem of classes) {
    const id = firstString(classItem?.id);
    const name = firstString(classItem?.name);
    if (!id) errors.push({ code: 'global_class_id_missing', className: name });
    else if (seenIds.has(id)) errors.push({ code: 'duplicate_global_class_id', classId: id });
    if (!name) errors.push({ code: 'global_class_name_missing', classId: id });
    else if (seenNames.has(name.toLowerCase())) errors.push({ code: 'duplicate_global_class_name', classId: id, className: name });
    seenIds.add(id);
    seenNames.add(name.toLowerCase());
    if (!classItem?.settings || typeof classItem.settings !== 'object' || Array.isArray(classItem.settings)) {
      errors.push({ code: 'global_class_settings_invalid', classId: id });
      continue;
    }
    for (const [key, value] of Object.entries(classItem.settings)) {
      if (!key.trim() || /:$/.test(key) || /\s/.test(key)) errors.push({ code: 'global_class_setting_key_invalid', classId: id, key });
      if (key === '_cssCustom' && typeof value !== 'string') errors.push({ code: 'global_class_custom_css_invalid', classId: id });
      if (key === '_cssGlobalClasses') errors.push({ code: 'nested_global_class_reference_invalid', classId: id });
    }
  }
  return errors;
}

function buildDuplicateSignatureReport(classes, decisionById) {
  const bySignature = new Map();
  for (const classItem of classes) {
    const signature = stableStringify(record(classItem?.settings));
    const items = bySignature.get(signature) || [];
    items.push(classItem);
    bySignature.set(signature, items);
  }
  return [...bySignature.entries()].filter(([, items]) => items.length > 1).map(([signature, items]) => {
    const roles = items.map((item) => {
      const decision = record(decisionById.get(firstString(item?.id)));
      return `${firstString(decision.kind, 'class')}:${firstString(decision.key, decision.sourceName, item?.name)}`;
    });
    const allSource = items.every((item) => firstString(record(decisionById.get(firstString(item?.id))).kind) === 'source-class');
    return {
      signature,
      classIds: items.map((item) => firstString(item?.id)),
      publicNames: items.map((item) => firstString(item?.name)),
      roles,
      disposition: 'retained_distinct',
      reason: allSource ? 'preserved_distinct_source_vocabulary' : 'responsive_state_selector_or_semantic_role_differs',
    };
  });
}

function collectMarkupClassNames(value) {
  const names = new Set();
  const visit = (item) => {
    if (typeof item === 'string') {
      for (const match of item.matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi)) {
        for (const name of match[1].split(/\s+/)) if (name) names.add(name);
      }
      return;
    }
    if (Array.isArray(item)) for (const nested of item) visit(nested);
    else if (item && typeof item === 'object') for (const nested of Object.values(item)) visit(nested);
  };
  visit(value);
  return [...names];
}

function collectRetainedScriptClassHooks(script) {
  const names = new Set();
  const source = String(script || '');
  for (const match of source.matchAll(/classList\s*\.\s*(?:add|remove|toggle|contains)\s*\(([^)]*)\)/gi)) {
    for (const token of match[1].matchAll(/["']([A-Za-z0-9_-]+)["']/g)) names.add(token[1]);
  }
  for (const match of source.matchAll(/setAttribute\s*\(\s*["']class["']\s*,\s*["']([^"']+)["']/gi)) {
    for (const name of match[1].split(/\s+/)) if (name) names.add(name);
  }
  return [...names];
}

function classNamesFromCss(css) {
  const source = String(css || '');
  const names = [];
  let index = 0;
  while (index < source.length) {
    if (source[index] === '"' || source[index] === "'") {
      index = readQuotedCssValueEnd(source, index);
      continue;
    }
    if (source[index] !== '.') {
      index += 1;
      continue;
    }
    const identifier = readCssIdentifier(source, index + 1);
    if (identifier.value) names.push(decodeCssIdentifier(identifier.value));
    index = Math.max(index + 1, identifier.end);
  }
  return [...new Set(names.filter(Boolean))];
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function byteLength(value) {
  return new TextEncoder().encode(String(value || '')).length;
}

function stringArray(value) {
  return arrayValue(value).map(firstString).filter(Boolean);
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
