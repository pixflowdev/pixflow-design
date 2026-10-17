function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function stringList(value, limit = 160) {
  return [...new Set(arrayValue(value).map((item) => firstString(item)).filter(Boolean))].slice(0, limit);
}

function boundedValue(value, depth = 0) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 1000);
  if (depth >= 3) {
    if (Array.isArray(value)) return { count: value.length, truncated: true };
    return { keys: Object.keys(objectValue(value)).slice(0, 80), truncated: true };
  }
  if (Array.isArray(value)) return value.slice(0, 120).map((item) => boundedValue(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 120).map(([key, item]) => [
      key,
      boundedValue(item, depth + 1),
    ]));
  }
  return undefined;
}

function compactGlobalClasses(value) {
  return arrayValue(value).slice(0, 600).map((item) => {
    const entry = objectValue(item);
    const settings = objectValue(entry.settings);
    return {
      id: firstString(entry.id),
      name: firstString(entry.name),
      ...(firstString(entry.category) ? { category: firstString(entry.category) } : {}),
      ...(entry.locked === true ? { locked: true } : {}),
      settingKeys: Object.keys(settings).slice(0, 80),
    };
  }).filter((item) => item.id || item.name);
}

function compactElement(value) {
  const element = objectValue(value);
  const settings = objectValue(element.settings);
  const previewSettings = {};
  for (const key of [
    'text', 'tag', 'link', 'hasLoop', 'query', '_conditions', '_attributes', '_cssGlobalClasses',
    '_display', '_direction', '_flexDirection', '_gridTemplateColumns', '_width', '_widthMax',
  ]) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      previewSettings[key] = boundedValue(settings[key], 1);
    }
  }
  return {
    id: firstString(element.id, element.elementId),
    name: firstString(element.name, element.type, element.elementType),
    label: firstString(element.label, element.title, element.descriptor),
    parent: firstString(element.parent, element.parentId),
    children: stringList(element.children, 80),
    content: firstString(element.content, element.text, element.currentText, element.currentVisibleText).slice(0, 700),
    classNames: stringList(element.classNames || element.classes, 80),
    settingKeys: Object.keys(settings).slice(0, 120),
    settings: previewSettings,
  };
}

function compactTokenRoute(value) {
  const route = objectValue(value);
  const activeRoute = objectValue(route.route);
  const mapping = objectValue(route.mapping);
  const native = objectValue(route.nativeBricksMapping);
  const variables = arrayValue(native.variables);
  const palettes = arrayValue(native.colorPalettes);
  const scaleCategories = arrayValue(native.scaleCategories);
  return {
    id: firstString(route.id),
    activeRouteId: firstString(route.activeRouteId),
    route: {
      id: firstString(activeRoute.id),
      group: firstString(activeRoute.group),
      title: firstString(activeRoute.title),
      label: firstString(activeRoute.label),
      description: firstString(activeRoute.description).slice(0, 500),
      available: activeRoute.available !== false,
    },
    mapping: {
      present: mapping.present === true,
      source: firstString(mapping.source),
      message: firstString(mapping.message).slice(0, 500),
    },
    nativeBricksMapping: {
      mappingSource: firstString(native.mappingSource),
      effectiveBundlePresent: native.effectiveBundlePresent === true,
      variableCount: variables.length,
      variableNames: variables.slice(0, 220).map((item) => firstString(item?.name, item?.id)).filter(Boolean),
      paletteCount: palettes.length,
      paletteNames: palettes.slice(0, 40).map((item) => firstString(item?.name, item?.id)).filter(Boolean),
      scaleCategoryCount: scaleCategories.length,
      scaleCategoryNames: scaleCategories.slice(0, 30).map((item) => firstString(item?.name, item?.id)).filter(Boolean),
    },
    source: firstString(route.source),
  };
}

export function compactQuickTextEditBricksContext(value) {
  const context = objectValue(value);
  const compact = {};
  for (const [key, item] of Object.entries(context)) {
    if (key === 'globalClasses' || key === 'global_classes') {
      compact[key] = compactGlobalClasses(item);
    } else if (key === 'tokenRoute' || key === 'token_route') {
      compact[key] = compactTokenRoute(item);
    } else if (key === 'elements') {
      compact.elements = arrayValue(item).slice(0, 300).map(compactElement);
    } else if (key === 'selectedElement' || key === 'selectedTarget') {
      compact[key] = Object.keys(objectValue(item)).length > 0 ? compactElement(item) : null;
    } else {
      compact[key] = boundedValue(item);
    }
  }
  return compact;
}

export function compactQuickTextEditMcpRuntimeContext(value) {
  const context = objectValue(value);
  const abilities = objectValue(context.nativeAbilities || context.native_abilities);
  const evidence = arrayValue(abilities.evidence);
  return {
    source: firstString(context.source),
    topics: stringList(context.topics, 80),
    knowledge: boundedValue(context.knowledge),
    nativeAbilities: {
      supported: abilities.supported !== false,
      read: stringList(abilities.read, 160),
      write: stringList(abilities.write, 160),
      evidence: evidence.slice(0, 60).map((item) => {
        const entry = objectValue(item);
        return {
          ability: firstString(entry.ability, entry.name, entry.id),
          ok: entry.ok === true,
          summary: firstString(entry.summary, entry.message).slice(0, 700),
        };
      }),
      evidenceCount: evidence.length,
    },
  };
}
