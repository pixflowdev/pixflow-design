function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(values) {
  return [...new Set(arrayValue(values).map((value) => firstString(value)).filter(Boolean))];
}

function mergeStageBSettings(target, source) {
  for (const [key, value] of Object.entries(objectValue(source))) {
    if (value === undefined || value === null || value === '') continue;
    if (['_typography', '_padding', '_margin', '_border', '_background'].includes(key)) {
      target[key] = { ...objectValue(target[key]), ...objectValue(value) };
      continue;
    }
    if (key === '_cssGlobalClasses') {
      target._cssGlobalClasses = uniqueStrings([
        ...arrayValue(target._cssGlobalClasses),
        ...arrayValue(value),
      ]);
      continue;
    }
    target[key] = value;
  }
  return target;
}

function publicClassName(value) {
  return firstString(value)
    .replace(/^\.+/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function shouldWarnStageBReservedButtonClass(name, sourceOwnedClassNames = []) {
  const normalizedName = firstString(name);
  if (!/(?:^|[-_])(primary|secondary)(?:$|[-_])/i.test(normalizedName)) return false;
  const sourceNames = new Set(arrayValue(sourceOwnedClassNames).map((value) => firstString(value)).filter(Boolean));
  return !sourceNames.has(normalizedName);
}

function sourceClassAttributeNames(element) {
  return arrayValue(objectValue(element?.settings)._attributes)
    .filter((attribute) => firstString(attribute?.name).toLowerCase() === 'class')
    .flatMap((attribute) => firstString(attribute?.value).split(/\s+/))
    .map((name) => publicClassName(name))
    .filter(Boolean);
}

function sourceElementId(element) {
  return firstString(arrayValue(objectValue(element?.settings)._attributes)
    .find((attribute) => firstString(attribute?.name).toLowerCase() === 'id')?.value);
}

function isMatchingSourceIdClass(classItem, element) {
  const normalizedElementId = publicClassName(sourceElementId(element)).toLowerCase();
  if (!normalizedElementId) return false;
  return publicClassName(classItem?.name).toLowerCase()
    .endsWith(`pixflow-source-id-${normalizedElementId}`);
}

function repairClassScore(classItem, sourceClassNames = [], sourceElementId = '') {
  const name = publicClassName(classItem?.name);
  if (!name) return -1;
  const lowerName = name.toLowerCase();
  if (/^pixflow-measured-[a-f0-9]+$/i.test(name)) return -1;
  const normalizedElementId = publicClassName(sourceElementId).toLowerCase();
  if (
    normalizedElementId
    && lowerName.endsWith(`pixflow-source-id-${normalizedElementId}`)
  ) return 120;
  const sourceNames = sourceClassNames.map((source) => source.toLowerCase());
  if (sourceNames.includes(lowerName)) return 100;
  if (sourceNames.some((source) => lowerName.endsWith(`-${source}`))) return 95;
  if (/__(?:[a-z0-9_-]+)|--(?:[a-z0-9_-]+)$/i.test(name)) return 80;
  if (!/^(?:stage-a|stage-b|pf-stage-b|pixflow|prototype|pfod)(?:-|$)/i.test(name)) return 60;
  return 10;
}

function findExistingRepairClass(element, classById) {
  const sourceClassNames = sourceClassAttributeNames(element);
  const elementId = sourceElementId(element);
  return arrayValue(objectValue(element?.settings)._cssGlobalClasses)
    .map((id, index) => ({ classItem: classById.get(firstString(id)), index }))
    .filter((entry) => entry.classItem)
    .map((entry) => ({
      ...entry,
      score: repairClassScore(entry.classItem, sourceClassNames, elementId),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score || right.index - left.index)[0]?.classItem || null;
}

export function applyStageBRepairSettings(element, classById, settingsPatch) {
  const patch = objectValue(settingsPatch);
  if (Object.keys(patch).length === 0) return { target: 'none', classId: '' };
  const classItem = findExistingRepairClass(element, classById);
  if (classItem) {
    classItem.settings = objectValue(classItem.settings);
    mergeStageBSettings(classItem.settings, patch);
    return { target: 'class', classId: firstString(classItem.id) };
  }

  // An unclassed wrapper has no safe class-level repair target. Applying the
  // patch directly would create ID-level styling that outranks the Stage A
  // BEM cascade, so leave the element untouched and report the skipped patch.
  return { target: 'skipped_unclassed', classId: '' };
}

function collectAllElements(result) {
  const headerSpec = objectValue(result?.stage_b_header || result?.stageBHeader);
  const footerSpec = objectValue(result?.stage_b_footer || result?.stageBFooter);
  return [
    ...arrayValue(result?.content),
    ...arrayValue(headerSpec.content || result?.header_content || result?.headerContent),
    ...arrayValue(footerSpec.content || result?.footer_content || result?.footerContent),
  ];
}

const directStyleBaseKeys = new Set([
  '_cssCustom', '_display', '_direction', '_flexDirection', '_flexWrap', '_flexGrow', '_flexShrink',
  '_flexBasis', '_alignSelf', '_order', '_gridItemJustifySelf', '_alignItems', '_alignItemsGrid',
  '_justifyContent', '_justifyContentGrid', '_justifyItemsGrid', '_alignContentGrid', '_columnGap',
  '_rowGap', '_gridTemplateColumns', '_gridTemplateRows', '_background', '_typography', '_border',
  '_padding', '_margin', '_width', '_height', '_widthMin', '_widthMax', '_heightMin', '_heightMax',
  '_aspectRatio', '_objectFit', '_objectPosition', '_overflow', '_visibility', '_opacity', '_cursor',
  '_isolation', '_mixBlendMode', '_pointerEvents', '_perspective', '_perspectiveOrigin', '_scrollSnapType',
  '_scrollSnapAlign', '_scrollSnapStop', '_scrollMargin', '_cssFilters', '_position', '_top', '_right',
  '_bottom', '_left', '_zIndex', '_boxShadow', '_transform', '_transformOrigin', '_cssTransition', '_gradient',
]);

export function promoteStageBDirectStylesToClasses(result) {
  const globalClasses = arrayValue(result?.global_classes || result?.globalClasses);
  const classById = new Map(globalClasses
    .map((classItem) => [firstString(classItem?.id), classItem])
    .filter(([id]) => id));
  const promotedClassIds = new Set();
  const skippedElementIds = [];
  let promotedElementCount = 0;
  let promotedSettingCount = 0;
  let skippedSettingCount = 0;
  let discardedDuplicateClassSettingCount = 0;

  for (const element of collectAllElements(result)) {
    const settings = objectValue(element?.settings);
    const directKeys = Object.keys(settings).filter((key) => directStyleBaseKeys.has(key.split(':')[0]));
    if (directKeys.length === 0) continue;
    const patch = {};
    const classRefs = arrayValue(settings._cssGlobalClasses).map((id) => classById.get(firstString(id))).filter(Boolean);
    for (const key of directKeys) {
      const classAlreadyOwnsSetting = classRefs.some((classItem) => (
        Object.prototype.hasOwnProperty.call(objectValue(classItem?.settings), key)
      ));
      if (classAlreadyOwnsSetting) discardedDuplicateClassSettingCount += 1;
      else patch[key] = settings[key];
      delete settings[key];
    }
    element.settings = settings;
    if (Object.keys(patch).length === 0) continue;
    const outcome = applyStageBRepairSettings(element, classById, patch);
    if (outcome.target === 'class') {
      promotedElementCount += 1;
      promotedSettingCount += Object.keys(patch).length;
      promotedClassIds.add(outcome.classId);
    } else {
      skippedSettingCount += Object.keys(patch).length;
      skippedElementIds.push(firstString(element?.id));
    }
  }

  return {
    applied: promotedSettingCount > 0 || skippedSettingCount > 0,
    promotedElementCount,
    promotedSettingCount,
    promotedClassCount: promotedClassIds.size,
    skippedUnclassedElementCount: skippedElementIds.length,
    skippedUnclassedSettingCount: skippedSettingCount,
    skippedUnclassedElementIds: skippedElementIds,
    discardedDuplicateClassSettingCount,
    movedToDirectSettings: 0,
  };
}

export function dedupeStageBClassAttributesAgainstGlobalClasses(result) {
  let affectedElementCount = 0;
  let removedTokenCount = 0;
  let preservedRawTokenCount = 0;

  for (const element of collectAllElements(result)) {
    const settings = objectValue(element?.settings);
    let elementChanged = false;
    const attributes = arrayValue(settings._attributes).flatMap((attribute) => {
      if (firstString(attribute?.name).toLowerCase() !== 'class') return [attribute];
      const rawTokens = uniqueStrings(firstString(attribute?.value).split(/\s+/));
      elementChanged = true;
      removedTokenCount += rawTokens.length;
      // Classes are structural Bricks data, not custom HTML attributes. The
      // deterministic baseline restores every source class reference through
      // `_cssGlobalClasses` before this cleanup runs, so any residual class
      // attribute is duplicate or model-invented and must not reach the UI.
      return [];
    });
    if (!elementChanged) continue;
    affectedElementCount += 1;
    if (attributes.length > 0) settings._attributes = attributes;
    else delete settings._attributes;
    element.settings = settings;
  }

  return {
    applied: affectedElementCount > 0,
    affectedElementCount,
    removedTokenCount,
    preservedRawTokenCount,
  };
}

export function enforceStageBSourceClassInventory(result, sourceClassNames = [], options = {}) {
  const sourceNames = new Set(arrayValue(sourceClassNames).map((value) => firstString(value)).filter(Boolean));
  const isSourceClassName = (name) => {
    const normalized = firstString(name);
    if (sourceNames.has(normalized)) return true;
    // Collision isolation prefixes source classes with one deterministic
    // three-letter run namespace. The prefixed name remains source-owned and
    // must survive Stage B's helper-class cleanup.
    return /^[a-z]{3}-/i.test(normalized) && sourceNames.has(normalized.slice(4));
  };
  const globalClasses = arrayValue(result?.global_classes || result?.globalClasses);
  const classById = new Map(globalClasses
    .map((classItem) => [firstString(classItem?.id), classItem])
    .filter(([id]) => id));
  const sourceClassIds = new Set(globalClasses
    .filter((classItem) => isSourceClassName(classItem?.name))
    .map((classItem) => firstString(classItem?.id))
    .filter(Boolean));
  // Relationship, semantic-default, and responsive helpers produced by the
  // deterministic compiler are part of the authoritative baseline even
  // though their public names do not occur in source HTML. Preserve those
  // helpers while continuing to remove classes invented by a later model pass.
  const baselineClassIds = new Set(arrayValue(
    options?.baselineResult?.global_classes || options?.baselineResult?.globalClasses,
  ).map((classItem) => firstString(classItem?.id)).filter(Boolean));
  const authoritativeClassIds = new Set([...sourceClassIds, ...baselineClassIds]);
  const mergedTargetIds = new Set();
  let removedElementReferences = 0;
  let mergedHelperClasses = 0;
  let discardedUnclassedHelperClasses = 0;
  let discardedConflictingHelperSettings = 0;

  for (const element of collectAllElements(result)) {
    const settings = objectValue(element?.settings);
    const refs = uniqueStrings(arrayValue(settings._cssGlobalClasses));
    const sourceRefs = refs.filter((id) => sourceClassIds.has(id));
    const baselineHelperRefs = refs.filter((id) => baselineClassIds.has(id) && !sourceClassIds.has(id));
    const helperRefs = refs.filter((id) => !authoritativeClassIds.has(id));
    if (helperRefs.length === 0) continue;
    const preservedRefs = uniqueStrings([...sourceRefs, ...baselineHelperRefs]);
    settings._cssGlobalClasses = preservedRefs;
    if (preservedRefs.length === 0) delete settings._cssGlobalClasses;
    element.settings = settings;
    removedElementReferences += helperRefs.length;

    for (const helperId of helperRefs) {
      const helperClass = classById.get(helperId);
      const helperSettings = objectValue(helperClass?.settings);
      const patch = {};
      for (const [key, value] of Object.entries(helperSettings)) {
        const sourceClassAlreadyOwnsSetting = sourceRefs.some((sourceId) => (
          Object.prototype.hasOwnProperty.call(objectValue(classById.get(sourceId)?.settings), key)
        ));
        if (sourceClassAlreadyOwnsSetting) discardedConflictingHelperSettings += 1;
        else patch[key] = value;
      }
      const outcome = applyStageBRepairSettings(element, classById, patch);
      if (outcome.target === 'class' && sourceClassIds.has(outcome.classId)) {
        mergedHelperClasses += 1;
        mergedTargetIds.add(outcome.classId);
      } else {
        discardedUnclassedHelperClasses += 1;
      }
    }
  }

  const preservedClasses = globalClasses.filter((classItem) => (
    authoritativeClassIds.has(firstString(classItem?.id))
  ));
  if (Array.isArray(result.global_classes)) result.global_classes = preservedClasses;
  if (Array.isArray(result.globalClasses)) result.globalClasses = preservedClasses;
  if (!Array.isArray(result.global_classes) && !Array.isArray(result.globalClasses)) result.global_classes = preservedClasses;

  return {
    applied: true,
    sourceClassCount: sourceNames.size,
    baselineClassCount: baselineClassIds.size,
    preservedBaselineHelperClassCount: preservedClasses.filter((classItem) => (
      baselineClassIds.has(firstString(classItem?.id)) && !sourceClassIds.has(firstString(classItem?.id))
    )).length,
    preservedClassCount: preservedClasses.length,
    removedHelperClassCount: globalClasses.length - preservedClasses.length,
    removedElementReferences,
    mergedHelperClasses,
    mergedTargetClassCount: mergedTargetIds.size,
    discardedUnclassedHelperClasses,
    discardedConflictingHelperSettings,
  };
}

export function preserveStageBBaselineClassStructure(result, baselineResult) {
  const baselineClasses = arrayValue(baselineResult?.global_classes || baselineResult?.globalClasses);
  if (baselineClasses.length === 0) {
    return {
      applied: false,
      reason: 'baseline_class_inventory_missing',
      restoredNames: 0,
      restoredClasses: 0,
      restoredElementReferences: 0,
      removedInventedClasses: 0,
      mergedIntoBaselineClasses: 0,
      movedToDirectSettings: 0,
      skippedUnclassedRepairs: 0,
    };
  }

  const resultClasses = arrayValue(result?.global_classes || result?.globalClasses);
  const baselineClassById = new Map(baselineClasses
    .map((classItem) => [firstString(classItem?.id), classItem])
    .filter(([id]) => id));
  const baselineClassIds = new Set(baselineClassById.keys());
  const resultClassById = new Map(resultClasses
    .map((classItem) => [firstString(classItem?.id), classItem])
    .filter(([id]) => id));
  let restoredNames = 0;
  let restoredClasses = 0;

  for (const [id, baselineClass] of baselineClassById) {
    const resultClass = resultClassById.get(id);
    if (!resultClass) {
      const restored = structuredClone(baselineClass);
      resultClasses.push(restored);
      resultClassById.set(id, restored);
      restoredClasses += 1;
      continue;
    }
    const baselineName = firstString(baselineClass?.name);
    if (baselineName && firstString(resultClass?.name) !== baselineName) {
      resultClass.name = baselineName;
      restoredNames += 1;
    }
  }

  const resultElements = collectAllElements(result);
  const resultElementById = new Map(resultElements
    .map((element) => [firstString(element?.id), element])
    .filter(([id]) => id));
  let restoredElementReferences = 0;
  for (const baselineElement of collectAllElements(baselineResult)) {
    const resultElement = resultElementById.get(firstString(baselineElement?.id));
    if (!resultElement) continue;
    const baselineSettings = objectValue(baselineElement?.settings);
    const resultSettings = objectValue(resultElement?.settings);
    resultElement.settings = resultSettings;
    const baselineRefs = arrayValue(baselineSettings._cssGlobalClasses)
      .map((id) => firstString(id))
      .filter((id) => baselineClassIds.has(id));
    const resultRefs = arrayValue(resultSettings._cssGlobalClasses).map((id) => firstString(id)).filter(Boolean);
    const mergedRefs = uniqueStrings([...resultRefs, ...baselineRefs]);
    restoredElementReferences += mergedRefs.length - resultRefs.length;
    if (mergedRefs.length > 0) resultSettings._cssGlobalClasses = mergedRefs;

    const baselineClassAttribute = arrayValue(baselineSettings._attributes)
      .find((attribute) => firstString(attribute?.name).toLowerCase() === 'class');
    if (baselineClassAttribute) {
      const attributes = arrayValue(resultSettings._attributes);
      const index = attributes.findIndex((attribute) => firstString(attribute?.name).toLowerCase() === 'class');
      if (index >= 0) attributes[index] = structuredClone(baselineClassAttribute);
      else attributes.push(structuredClone(baselineClassAttribute));
      resultSettings._attributes = attributes;
    }
  }

  // The compiler can materialize an authored `#id` selector after the first
  // baseline inventory is frozen. That class is source-owned, not a model
  // repair: preserve it when it is referenced only by the element carrying
  // the matching authored id. Folding it into a reusable utility class would
  // leak unique layout/state across every utility-class consumer.
  const preservedSourceIdClassIds = new Set(resultClasses
    .filter((classItem) => {
      const classId = firstString(classItem?.id);
      if (!classId || baselineClassIds.has(classId)) return false;
      const references = resultElements.filter((element) => (
        arrayValue(objectValue(element?.settings)._cssGlobalClasses).map(firstString).includes(classId)
      ));
      return references.length > 0 && references.every((element) => isMatchingSourceIdClass(classItem, element));
    })
    .map((classItem) => firstString(classItem?.id)));
  const inventedClasses = resultClasses.filter((classItem) => (
    !baselineClassIds.has(firstString(classItem?.id))
    && !preservedSourceIdClassIds.has(firstString(classItem?.id))
  ));
  const mergedTargets = new Set();
  let skippedUnclassedRepairs = 0;
  for (const inventedClass of inventedClasses) {
    const inventedId = firstString(inventedClass?.id);
    if (!inventedId) continue;
    const patch = objectValue(inventedClass?.settings);
    for (const element of resultElements) {
      const settings = objectValue(element?.settings);
      const refs = arrayValue(settings._cssGlobalClasses).map((id) => firstString(id)).filter(Boolean);
      if (!refs.includes(inventedId)) continue;
      settings._cssGlobalClasses = refs.filter((id) => id !== inventedId);
      if (settings._cssGlobalClasses.length === 0) delete settings._cssGlobalClasses;
      element.settings = settings;

      // Baseline classes are the source-CSS authority. A measured/model helper
      // may add controls the source class does not own, but it must never
      // replace an existing source value (notably desktop `display:none` on a
      // navigation variant that becomes flex only at a breakpoint).
      const safePatch = Object.fromEntries(Object.entries(patch).filter(([key]) => (
        !refs.some((classId) => (
          baselineClassIds.has(classId)
          && Object.prototype.hasOwnProperty.call(objectValue(resultClassById.get(classId)?.settings), key)
        ))
      )));
      const outcome = applyStageBRepairSettings(element, resultClassById, safePatch);
      if (outcome.target === 'class' && baselineClassIds.has(outcome.classId)) {
        mergedTargets.add(outcome.classId);
      } else if (outcome.target === 'skipped_unclassed') {
        skippedUnclassedRepairs += 1;
      }
    }
  }

  const preservedClasses = resultClasses.filter((classItem) => (
    baselineClassIds.has(firstString(classItem?.id))
    || preservedSourceIdClassIds.has(firstString(classItem?.id))
  ));
  if (Array.isArray(result.global_classes)) result.global_classes = preservedClasses;
  if (Array.isArray(result.globalClasses)) result.globalClasses = preservedClasses;
  if (!Array.isArray(result.global_classes) && !Array.isArray(result.globalClasses)) result.global_classes = preservedClasses;

  return {
    applied: true,
    reason: 'baseline_bem_inventory_authoritative',
    restoredNames,
    restoredClasses,
    restoredElementReferences,
    removedInventedClasses: inventedClasses.length,
    preservedSourceIdClassCount: preservedSourceIdClassIds.size,
    mergedIntoBaselineClasses: mergedTargets.size,
    movedToDirectSettings: 0,
    skippedUnclassedRepairs,
  };
}
