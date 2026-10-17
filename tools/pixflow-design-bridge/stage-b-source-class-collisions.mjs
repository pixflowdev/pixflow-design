function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return [...new Set(arrayValue(values).map((value) => firstString(value)).filter(Boolean))];
}

function slugify(value) {
  return firstString(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeExistingClassNames(value) {
  return new Set(arrayValue(value)
    .map((item) => sanitizeStageBClassPublicName(firstString(item?.name), '').toLowerCase())
    .filter(Boolean));
}

function threeLetterPrefixSeed(value) {
  const letters = slugify(value).replace(/[^a-z]/g, '');
  return (letters || 'pfx').slice(0, 3).padEnd(3, 'x');
}

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function prefixFromOrdinal(seed, ordinal) {
  if (ordinal === 0) return seed;
  let value = (hashString(`${seed}:${ordinal}`) + ordinal) % (26 ** 3);
  let result = '';
  for (let index = 0; index < 3; index += 1) {
    result = String.fromCharCode(97 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export function buildStageBBemBlockPrefix(options = {}) {
  return threeLetterPrefixSeed(firstString(options.sourceId, options.title, 'handoff'));
}

export function buildStageBSourceClassName(sourceClassName) {
  return sanitizeStageBClassPublicName(firstString(sourceClassName, 'element'), 'element');
}

export function buildStageBSafeSourceClassName(sourceClassName, sourcePrefix) {
  const sanitized = buildStageBSourceClassName(sourceClassName);
  if (!sanitized) return '';
  if (/^[a-z_]/i.test(sanitized)) return sanitized;
  return `${sanitizeStageBClassPublicName(sourcePrefix, 'pfx')}-${sanitized}`;
}

export function parseStageBSourceBemClassName(sourceClassName, knownClassNames = null) {
  const sanitized = buildStageBSourceClassName(sourceClassName);
  const elementIndex = sanitized.indexOf('__');
  if (elementIndex > 0) {
    const block = sanitized.slice(0, elementIndex);
    const elementAndModifier = sanitized.slice(elementIndex + 2);
    const modifierIndex = elementAndModifier.indexOf('--');
    return {
      block,
      elementSeparator: '__',
      elementOrModifier: modifierIndex >= 0 ? elementAndModifier.slice(0, modifierIndex) : elementAndModifier,
      modifier: modifierIndex >= 0 ? elementAndModifier.slice(modifierIndex + 2) : '',
    };
  }
  const modifierIndex = sanitized.indexOf('--');
  if (modifierIndex > 0) {
    return {
      block: sanitized.slice(0, modifierIndex),
      elementSeparator: '--',
      elementOrModifier: sanitized.slice(modifierIndex + 2),
      modifier: '',
    };
  }
  const semanticBlock = inferSemanticHyphenClassBlock(sanitized, knownClassNames);
  if (semanticBlock && semanticBlock !== sanitized) {
    return {
      block: semanticBlock,
      elementSeparator: '-',
      elementOrModifier: sanitized.slice(semanticBlock.length + 1),
      modifier: '',
    };
  }
  return { block: sanitized, elementSeparator: '', elementOrModifier: '', modifier: '' };
}

function inferSemanticHyphenClassBlock(sanitizedClassName, knownClassNames = null) {
  const source = firstString(sanitizedClassName);
  if (!source.includes('-')) return source;
  const known = knownClassNames instanceof Set ? knownClassNames : new Set();
  const parts = source.split('-').filter(Boolean);
  for (let length = parts.length - 1; length >= 1; length -= 1) {
    const candidate = parts.slice(0, length).join('-');
    if (candidate && candidate !== source && known.has(candidate)) return candidate;
  }
  return source;
}

export function prefixStageBSourceBemTreeClassName(sourceClassName, sourcePrefix, parsedBem = null) {
  const source = buildStageBSourceClassName(sourceClassName);
  const prefix = sanitizeStageBClassPublicName(sourcePrefix, 'pfx');
  if (source.startsWith(`${prefix}-`)) return source;
  const bem = parsedBem || parseStageBSourceBemClassName(source);
  const prefixedBlock = `${prefix}-${bem.block}`;
  if (!bem.elementSeparator) return prefixedBlock;
  const modifier = bem.modifier ? `--${bem.modifier}` : '';
  return `${prefixedBlock}${bem.elementSeparator}${bem.elementOrModifier}${modifier}`;
}

export function buildStageBSourceBemClassName(sourceClassName, options = {}) {
  return prefixStageBSourceBemTreeClassName(
    sourceClassName,
    sanitizeStageBClassPublicName(options.sourcePrefix, 'pfx'),
  );
}

export function buildStageBSourceClassNamePlan(classNames, options = {}) {
  const existingNames = normalizeExistingClassNames(options.existingGlobalClasses);
  const initialPrefix = buildStageBBemBlockPrefix(options);
  const sanitizedNames = uniqueStrings(classNames)
    .map((source) => ({ source, sanitized: buildStageBSafeSourceClassName(source, initialPrefix) }))
    .filter((entry) => entry.sanitized);
  const sanitizedNameSet = new Set(sanitizedNames.map((entry) => entry.sanitized));
  const entries = sanitizedNames.map((entry) => {
    const bem = parseStageBSourceBemClassName(entry.sanitized, sanitizedNameSet);
    return { ...entry, block: bem.block, bem };
  }).filter((entry) => entry.block);

  const entriesByBlock = new Map();
  for (const entry of entries) {
    if (!entriesByBlock.has(entry.block)) entriesByBlock.set(entry.block, []);
    entriesByBlock.get(entry.block).push(entry);
  }

  const collidingBlocks = [...entriesByBlock.values()].filter((blockEntries) => (
    blockEntries.some((entry) => existingNames.has(entry.sanitized.toLowerCase()))
  ));
  let prefix = initialPrefix;
  for (let ordinal = 0; ordinal < 26 ** 3; ordinal += 1) {
    const candidate = prefixFromOrdinal(initialPrefix, ordinal);
    const candidateNames = collidingBlocks.flatMap((blockEntries) => blockEntries.map((entry) => (
      prefixStageBSourceBemTreeClassName(entry.sanitized, candidate, entry.bem).toLowerCase()
    )));
    if (candidateNames.every((name) => !existingNames.has(name))) {
      prefix = candidate;
      break;
    }
  }

  const names = new Map();
  for (const blockEntries of entriesByBlock.values()) {
    const blockTaken = blockEntries.some((entry) => existingNames.has(entry.sanitized.toLowerCase()));
    for (const entry of blockEntries) {
      names.set(entry.source, blockTaken
        ? prefixStageBSourceBemTreeClassName(entry.sanitized, prefix, entry.bem)
        : entry.sanitized);
    }
  }
  return { names, prefix };
}

export function sanitizeStageBClassPublicName(value, fallback = 'pf-stage-b-class') {
  const input = firstString(value, fallback)
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/-{3,}/g, '--')
    .replace(/_{3,}/g, '__')
    .replace(/^-+|-+$/g, '');
  return input || fallback;
}
