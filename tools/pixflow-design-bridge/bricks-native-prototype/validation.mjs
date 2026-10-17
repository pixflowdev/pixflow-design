import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT_PARENT_VALUES = new Set(['', '0', 'root', 'ROOT']);

export async function validateBricksNativePrototypeWorkspace(input = {}) {
  const workspaceDir = path.resolve(String(input.workspaceDir || input.workspace || '.'));
  const files = validationFiles(workspaceDir);
  const result = await readJsonSafe(files.result);
  const context = await readJsonSafe(files.context);
  const schemaCatalog = await readJsonSafe(files.schemaCatalog);
  const briefText = await readTextSafe(files.brief);
  const errors = [];
  const warnings = [];
  const checks = [];

  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    errors.push(issue('result-json', 'bricks-result.json must contain a JSON object.'));
    return writeValidation(files.validation, {
      ok: false,
      status: 'failed',
      errors,
      warnings,
      checks,
      files,
    });
  }

  checks.push(check('result-json', true, 'bricks-result.json parsed.'));
  validateIdentity(result, errors, warnings, checks);

  const content = extractContent(result);
  if (!content.length) {
    if (isReadyToApply(result)) {
      errors.push(issue('content', 'Apply-ready Bricks-native result must include Bricks content elements.'));
    } else {
      warnings.push(issue('content', 'No Bricks content elements found yet.'));
    }
    checks.push(check('content', false, 'No content elements found.'));
  } else {
    checks.push(check('content', true, `Found ${content.length} Bricks content element(s).`));
    validateElementTree(content, errors, warnings, checks);
    validateExternalSchemaDrift(content, errors, warnings, checks);
    validateSectionStructure(content, errors, warnings, checks);
    validateSchemaPayload(content, schemaCatalog, errors, warnings, checks);
  }

  validateThemeStylePayload(result, context, errors, warnings, checks);
  validateColorPayload(result, context, errors, warnings, checks);
  validateSidecarPayload(result, content, context, errors, warnings, checks);
  validateFrameworkRouteUsage(result, context, errors, warnings, checks);
  validateBriefAdherence(result, briefText, errors, warnings, checks);

  const ok = errors.length === 0;
  const status = ok ? (warnings.length ? 'warnings' : 'passed') : 'failed';
  return writeValidation(files.validation, {
    ok,
    status,
    errors,
    warnings,
    checks,
    files,
  });
}

export async function applyValidationGateToResult(workspaceDir, validation) {
  const files = validationFiles(workspaceDir);
  const result = await readJsonSafe(files.result);
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
  if (validation?.ok !== false) return false;
  if (!isReadyToApply(result)) return false;

  const diagnostics = result.diagnostics && typeof result.diagnostics === 'object' && !Array.isArray(result.diagnostics)
    ? result.diagnostics
    : {};
  diagnostics.readyToApply = false;
  diagnostics.validationStatus = validation.status || 'failed';
  diagnostics.validationErrors = Array.isArray(validation.errors) ? validation.errors : [];
  result.diagnostics = diagnostics;
  result.status = result.status === 'ready' ? 'needs_repair' : result.status || 'needs_repair';
  await fs.writeFile(files.result, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return true;
}

function validateIdentity(result, errors, warnings, checks) {
  const type = stringValue(result.type);
  const generationMode = stringValue(result.generation_mode || result.generationMode);
  if (type && type !== 'bricks_native_prototype') {
    warnings.push(issue('result-type', `Expected type "bricks_native_prototype"; found "${type}".`));
  }
  if (generationMode && generationMode !== 'bricks_native_prototype') {
    warnings.push(issue('generation-mode', `Expected generation_mode "bricks_native_prototype"; found "${generationMode}".`));
  }
  if (!type) {
    warnings.push(issue('result-type', 'Missing result type.'));
  }
  if (!generationMode) {
    warnings.push(issue('generation-mode', 'Missing generation_mode.'));
  }
  checks.push(check('identity', errors.length === 0, 'Checked Bricks-native identity fields.'));
}

function validateElementTree(elements, errors, warnings, checks) {
  const ids = new Map();
  for (const [index, element] of elements.entries()) {
    if (!element || typeof element !== 'object' || Array.isArray(element)) {
      errors.push(issue('element-shape', `Element at index ${index} must be an object.`));
      continue;
    }
    const id = stringValue(element.id);
    const name = elementName(element);
    if (!id) {
      errors.push(issue('element-id', `Element at index ${index} is missing an id.`));
    } else if (ids.has(id)) {
      errors.push(issue('element-id', `Duplicate Bricks element id "${id}".`));
    } else {
      ids.set(id, element);
      if (!/^[a-z0-9]{6}$/.test(id)) {
        warnings.push(issue('element-id-shape', `Element "${id}" does not follow Bricks' six-character generated id convention. Preserve known existing/template ids, but generate new ids in the short Bricks style.`));
      }
    }
    if (!name) {
      errors.push(issue('element-name', `Element "${id || index}" is missing name/type.`));
    }
  }

  for (const element of elements) {
    if (!element || typeof element !== 'object' || Array.isArray(element)) continue;
    const id = stringValue(element.id);
    const parent = normalizeParent(element.parent ?? element.parentId);
    if (parent && !ids.has(parent)) {
      errors.push(issue('element-parent', `Element "${id || '(missing id)'}" references missing parent "${parent}".`));
    }
    const children = Array.isArray(element.children) ? element.children : [];
    for (const childIdRaw of children) {
      const childId = stringValue(childIdRaw);
      if (!childId) continue;
      const child = ids.get(childId);
      if (!child) {
        errors.push(issue('element-children', `Element "${id || '(missing id)'}" references missing child "${childId}".`));
        continue;
      }
      const childParent = normalizeParent(child.parent ?? child.parentId);
      if (childParent && id && childParent !== id) {
        warnings.push(issue('element-children', `Element "${childId}" is listed under "${id}" but has parent "${childParent}".`));
      }
    }
  }

  checks.push(check('tree', errors.filter((entry) => entry.code.startsWith('element-')).length === 0, 'Checked parent/child references and duplicate ids.'));
}

function validateExternalSchemaDrift(elements, errors, warnings, checks) {
  let driftCount = 0;
  for (const [index, element] of elements.entries()) {
    if (!element || typeof element !== 'object' || Array.isArray(element)) continue;
    const id = stringValue(element.id) || `index ${index}`;
    if (Object.prototype.hasOwnProperty.call(element, 'component')) {
      driftCount += 1;
      errors.push(issue('external-schema-drift', `Element "${id}" uses external-converter field "component"; Pixflow expects Bricks "name" plus flat parent/children links.`));
    }
    if (Array.isArray(element.elements)) {
      driftCount += 1;
      errors.push(issue('external-schema-drift', `Element "${id}" nests child records in "elements"; flatten children into the top-level content array and connect them with parent/children ids.`));
    }
    const settings = firstObject(element.settings) || {};
    for (const key of Object.keys(settings)) {
      if (['cssCode', 'javascriptCode'].includes(key) && containsWrapperTag(settings[key], key)) {
        driftCount += 1;
        warnings.push(issue('code-wrapper', `Element "${id}" setting "${key}" contains wrapper tags. Bricks code fields should usually store the inner CSS/JS only.`));
      }
      if (broadRawStyleKey(key)) {
        driftCount += 1;
        warnings.push(issue('raw-style-key', `Element "${id}" uses broad raw style setting "${key}". Move this into a verified Bricks control, Theme Style/global class setting, or scoped _cssCustom only when unsupported.`));
      }
    }
  }

  checks.push(check(
    'external-schema-drift',
    driftCount === 0,
    driftCount === 0
      ? 'Checked for external-converter schema drift.'
      : `Found ${driftCount} external-converter/schema-drift issue(s).`,
  ));
}

function validateSectionStructure(elements, errors, warnings, checks) {
  const byParent = new Map();
  for (const element of elements) {
    if (!element || typeof element !== 'object' || Array.isArray(element)) continue;
    const parent = normalizeParent(element.parent ?? element.parentId) || '';
    const list = byParent.get(parent) || [];
    list.push(element);
    byParent.set(parent, list);
  }

  let sectionCount = 0;
  let missingContainerCount = 0;
  for (const element of elements) {
    if (!element || typeof element !== 'object' || Array.isArray(element)) continue;
    if (elementName(element) !== 'section') continue;
    sectionCount += 1;
    const id = stringValue(element.id);
    const children = byParent.get(id) || [];
    const firstChild = children[0];
    const hasContainerChild = children.some((child) => elementName(child) === 'container');
    if (!hasContainerChild) {
      missingContainerCount += 1;
      errors.push(issue('section-container', `Section "${id || '(missing id)'}" must contain a Bricks container child.`));
    } else if (firstChild && elementName(firstChild) !== 'container') {
      warnings.push(issue('section-container', `Section "${id || '(missing id)'}" has a container, but its first child is "${elementName(firstChild)}".`));
    }
  }

  checks.push(check(
    'section-container',
    missingContainerCount === 0,
    sectionCount
      ? `Checked ${sectionCount} section(s); ${missingContainerCount} missing container children.`
      : 'No section elements found to validate.',
  ));
}

function validateThemeStylePayload(result, context, errors, warnings, checks) {
  const payload = firstObject(
    result.bricks_native_theme_style_contract,
    result.bricksNativeThemeStyleContract,
    result.stage_b_theme_style_contract,
    result.stage_b_theme_style_payload,
    result.theme_style_payload,
    result.themeStylePayload,
  );
  if (!payload) {
    errors.push(issue('theme-style', 'No Theme Style sidecar/contract found. Bricks-native output must include a create-or-reuse page-scoped Theme Style contract.'));
    checks.push(check('theme-style', false, 'Theme Style sidecar missing.'));
    return;
  }

  const serialized = JSON.stringify(payload).toLowerCase();
  if (payload.overwrite === true || payload.replace === true || serialized.includes('"applystrategy":"overwrite"') || serialized.includes('"strategy":"overwrite"')) {
    errors.push(issue('theme-style', 'Theme Style payload must create or reuse a page-scoped style; it must not overwrite existing styles.'));
  }
  const targetPostId = stringValue(context?.request?.targetPage?.postId || context?.request?.targetPage?.id || context?.targetPage?.postId || context?.target?.postId || context?.postId);
  const conditionText = JSON.stringify(payload.conditions || payload.condition || payload.where || payload.assignments || payload);
  if (targetPostId && !conditionText.includes(targetPostId)) {
    errors.push(issue('theme-style', `Theme Style payload does not visibly scope itself to target page ${targetPostId}. Add an explicit page condition/assignment before marking the result apply-ready.`));
  }
  checks.push(check('theme-style', !errors.some((entry) => entry.code === 'theme-style'), 'Checked Theme Style create/reuse safety.'));
}

function validateColorPayload(result, context, errors, warnings, checks) {
  const payload = firstObject(
    result.bricks_native_color_system,
    result.bricksNativeColorSystem,
    result.stage_b_color_system,
    result.color_scheme,
    result.colorScheme,
    result.colorSystem,
  );
  if (!payload) {
    errors.push(issue('color-system', 'No color scheme sidecar/contract found. Bricks-native output must include a color plan that either creates a safe scheme or explicitly reuses current page colors.'));
    checks.push(check('color-system', false, 'Color scheme sidecar missing.'));
    return;
  }

  const projectName = stringValue(context?.request?.title || context?.projectId || context?.title || context?.project?.title || result.page_title || result.pageTitle);
  const expectedPrefix = slugify(projectName);
  const tokens = collectColorTokens(payload);
  const tokenNames = tokens.map((token) => stringValue(token.name || token.id || token.key)).filter(Boolean);
  const explicitReuse = payload.reuseExisting === true || payload.mode === 'reuse_existing' || payload.strategy === 'reuse_existing';
  if (tokenNames.length && !explicitReuse) {
    const genericNames = tokenNames.filter((name) => genericColorTokenName(name));
    if (genericNames.length) {
      errors.push(issue('color-system', `Color token name(s) must be prefixed to avoid Bricks scheme conflicts; found generic token(s): ${genericNames.slice(0, 8).join(', ')}.`));
    }
    const commonPrefix = commonTokenPrefix(tokenNames);
    if (!commonPrefix) {
      errors.push(issue('color-system', 'Color token names must share a short project/page prefix, for example project-page-primary and project-page-surface.'));
    }
  }
  if (expectedPrefix && tokenNames.length && !explicitReuse) {
    const prefixed = tokenNames.filter((name) => slugify(name).startsWith(expectedPrefix.slice(0, Math.min(expectedPrefix.length, 24))));
    if (prefixed.length === 0) {
      warnings.push(issue('color-system', `Color token names do not appear to use the project/page prefix "${expectedPrefix}".`));
    }
  }
  if (payload.overwrite === true || payload.replace === true) {
    errors.push(issue('color-system', 'Color scheme payload must not overwrite existing schemes.'));
  }
  const entryPoint = stringValue(context?.siteContext?.generationEntryPoint || context?.request?.generationIntent?.entryPoint || context?.request?.generationIntent?.source).toLowerCase();
  const isFloatingGeneration = entryPoint.includes('pixflow_generation') || stringValue(context?.request?.generationIntent?.source).toLowerCase().includes('floating');
  const existingColors = Array.isArray(context?.existingColorContext?.colors) ? context.existingColorContext.colors : [];
  const hasExistingContent = Number(context?.siteContext?.elementCount || 0) > 0 || Array.isArray(context?.siteContext?.elements) && context.siteContext.elements.length > 0;
  const hasExistingColors = existingColors.length > 0;
  if (isFloatingGeneration && hasExistingContent && hasExistingColors) {
    const resultText = JSON.stringify(payload).toLowerCase();
    const existingColorEvidence = JSON.stringify(existingColors).toLowerCase();
    const existingHexes = Array.from(new Set(existingColorEvidence.match(/#[0-9a-f]{3,8}\b/g) || []));
    const reused = existingHexes.some((hex) => resultText.includes(hex));
    const createsNewVariables = Array.isArray(payload.variables) && payload.variables.length > 0;
    if (createsNewVariables && !explicitReuse) {
      errors.push(issue('color-system', '@Pixflow Generation found existing page/scheme colors but created a new color system. Reuse current page colors instead, or set an explicit reuse_existing color plan with evidence.'));
    }
    if (existingHexes.length > 0 && !reused) {
      errors.push(issue('color-system', '@Pixflow Generation should reuse existing page/scheme colors when they are available before creating new colors.'));
    }
  }
  checks.push(check('color-system', !errors.some((entry) => entry.code === 'color-system'), `Checked color scheme safety (${tokenNames.length} token name(s)).`));
}

function validateSidecarPayload(result, content, context, errors, warnings, checks) {
  const globalClasses = Array.isArray(result.global_classes)
    ? result.global_classes
    : Array.isArray(result.globalClasses)
      ? result.globalClasses
      : [];
  const classIds = new Set();
  const bemBlockNames = new Set();
  const existingClassNames = new Set(arrayValue(context?.existingGlobalClasses?.normalizedNames));
  for (const [index, item] of globalClasses.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(issue('global-classes', `Global class at index ${index} must be an object.`));
      continue;
    }
    const id = stringValue(item.id || item.name);
    if (!id) {
      errors.push(issue('global-classes', `Global class at index ${index} is missing id/name.`));
    } else if (classIds.has(id)) {
      errors.push(issue('global-classes', `Duplicate global class id/name "${id}".`));
    } else {
      classIds.add(id);
      const normalized = slugify(id);
      if (existingClassNames.has(normalized)) {
        errors.push(issue('global-classes', `Global class "${id}" collides with an existing Bricks Class Manager class. Choose a unique BEM block/element name.`));
      }
      if (isBemBlockClass(id)) {
        bemBlockNames.add(id);
      } else if (!isBemElementOrModifierClass(id)) {
        warnings.push(issue('global-classes', `Global class "${id}" does not follow the expected BEM block, block__element, or block--modifier pattern.`));
      }
    }
  }
  const sectionCount = content.filter((element) => elementName(element) === 'section').length;
  const referencedClassIds = collectReferencedGlobalClassIds(content);
  if (sectionCount > 0 && globalClasses.length === 0) {
    errors.push(issue('global-classes', 'Bricks-native result must include reusable global classes for section/page styling; classless output is not apply-ready.'));
  }
  if (sectionCount > 0 && bemBlockNames.size === 0) {
    errors.push(issue('global-classes', 'Bricks-native result must include at least one BEM block class for generated section structures.'));
  }
  if (globalClasses.length > 0 && referencedClassIds.size === 0) {
    errors.push(issue('global-classes', 'Global classes were defined but no Bricks elements reference them.'));
  }
  checks.push(check('global-classes', !errors.some((entry) => entry.code === 'global-classes'), `Checked ${globalClasses.length} global class(es), ${referencedClassIds.size} element class reference(s).`));
  if (!firstObject(result.bricks_native_font_system, result.stage_b_font_system, result.fontSystem)) {
    warnings.push(issue('font-system', 'No font system sidecar found.'));
  }
  if (!firstObject(result.bricks_native_icon_system, result.stage_b_icon_system, result.iconSystem)) {
    warnings.push(issue('icon-system', 'No icon system sidecar found.'));
  }
}

function validateFrameworkRouteUsage(result, context, errors, warnings, checks) {
  const route = firstObject(context?.frameworkRoute);
  if (!route || Object.keys(route).length === 0) {
    checks.push(check('framework-route', true, 'No active framework route was supplied.'));
    return;
  }
  const serialized = JSON.stringify(result).toLowerCase();
  const routeSerialized = JSON.stringify(route).toLowerCase();
  const routeLabel = stringValue(route.id || route.key || route.slug || route.name || route.label);
  const evidence = [];
  if (routeLabel && serialized.includes(routeLabel.toLowerCase())) evidence.push(routeLabel);
  for (const token of routeSerialized.match(/--[a-z0-9-]+|var\(--[a-z0-9-]+\)|\b(?:spacing|space|radius|typography|font|container|grid|layout)[a-z0-9-]*\b/g) || []) {
    if (token.length < 4) continue;
    if (serialized.includes(token)) evidence.push(token);
    if (evidence.length >= 3) break;
  }
  const hasRouteEvidence = evidence.length > 0
    || JSON.stringify(result?.diagnostics || {}).toLowerCase().includes('framework route')
    || JSON.stringify(result?.bricks_native_theme_style_contract || {}).toLowerCase().includes('framework');
  if (!hasRouteEvidence) {
    errors.push(issue('framework-route', 'An active framework route was supplied, but the result does not show evidence of using its non-color spacing, typography, radius, grid, or layout tokens.'));
  }
  checks.push(check('framework-route', hasRouteEvidence, hasRouteEvidence ? `Framework route evidence found (${evidence.slice(0, 3).join(', ') || 'diagnostics/theme style'}).` : 'Framework route evidence missing.'));
}

function validateBriefAdherence(result, briefText, errors, warnings, checks) {
  const attachmentContent = extractAttachmentContent(briefText);
  if (!attachmentContent) {
    checks.push(check('brief-adherence', true, 'No readable attachment content to validate.'));
    return;
  }

  const evidence = extractBriefEvidence(attachmentContent);
  if (!evidence.required.length && !evidence.supporting.length) {
    checks.push(check('brief-adherence', true, 'Readable attachment content was present, but no stable evidence terms were extracted.'));
    return;
  }

  const resultText = normalizeEvidenceText(JSON.stringify(result));
  const requiredMissing = evidence.required.filter((term) => !resultText.includes(normalizeEvidenceText(term)));
  const supportingMatches = evidence.supporting.filter((term) => evidenceTermMatches(resultText, term));
  const minimumSupportingMatches = Math.min(2, evidence.supporting.length);
  const ready = isReadyToApply(result);

  if (ready && requiredMissing.length) {
    errors.push(issue('brief-adherence', `Apply-ready result does not include required attachment brief term(s): ${requiredMissing.join(', ')}.`));
  }
  if (ready && minimumSupportingMatches > 0 && supportingMatches.length < minimumSupportingMatches) {
    errors.push(issue('brief-adherence', `Apply-ready result only matched ${supportingMatches.length}/${evidence.supporting.length} supporting attachment brief term(s). It must visibly use the attached brief before Apply.`));
  } else if (minimumSupportingMatches > 0 && supportingMatches.length < minimumSupportingMatches) {
    warnings.push(issue('brief-adherence', `Result only matched ${supportingMatches.length}/${evidence.supporting.length} supporting attachment brief term(s).`));
  }

  checks.push(check(
    'brief-adherence',
    !errors.some((entry) => entry.code === 'brief-adherence'),
    `Checked attachment brief adherence: ${evidence.required.length - requiredMissing.length}/${evidence.required.length} required term(s), ${supportingMatches.length}/${evidence.supporting.length} supporting term(s).`,
  ));
}

function extractAttachmentContent(briefText) {
  const text = stringValue(briefText);
  const marker = '## Attachment Content';
  const index = text.indexOf(marker);
  if (index < 0) return '';
  return text
    .slice(index + marker.length)
    .replace(/```(?:text|md|markdown|html|json)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

function extractBriefEvidence(attachmentContent) {
  const required = [];
  const supporting = [];
  const lines = attachmentContent.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const labelMatch = line.match(/^(brand|company|client|product|project)\s*:\s*(.+)$/i);
    if (labelMatch) {
      pushUnique(required, cleanEvidenceTerm(labelMatch[2]));
      continue;
    }
    const importantMatch = line.match(/^(audience|goal|offer|must include|tone)\s*:\s*(.+)$/i);
    if (importantMatch) {
      pushUnique(supporting, cleanEvidenceTerm(importantMatch[2]));
      continue;
    }
    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      pushUnique(supporting, cleanEvidenceTerm(bulletMatch[1]));
      continue;
    }
    for (const phrase of line.match(/\b[A-Z][A-Za-z0-9&'.-]+(?:\s+[A-Z][A-Za-z0-9&'.-]+){1,5}\b/g) || []) {
      pushUnique(supporting, cleanEvidenceTerm(phrase));
    }
  }

  return {
    required: required.filter((term) => usefulEvidenceTerm(term)).slice(0, 4),
    supporting: supporting.filter((term) => usefulEvidenceTerm(term)).slice(0, 8),
  };
}

function cleanEvidenceTerm(value) {
  return stringValue(value)
    .replace(/^["'`]+|["'`.,:;!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function usefulEvidenceTerm(value) {
  const normalized = normalizeEvidenceText(value);
  if (normalized.length < 4) return false;
  return !['none', 'n/a', 'not applicable'].includes(normalized);
}

function normalizeEvidenceText(value) {
  return stringValue(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function evidenceTermMatches(normalizedResultText, term) {
  const normalizedTerm = normalizeEvidenceText(term);
  if (!normalizedTerm) return false;
  if (normalizedResultText.includes(normalizedTerm)) return true;

  const tokens = evidenceKeywords(normalizedTerm);
  if (tokens.length === 0) return false;
  if (tokens.length === 1) return normalizedResultText.includes(tokens[0]);

  const matches = tokens.filter((token) => normalizedResultText.includes(token)).length;
  return matches >= Math.min(tokens.length, Math.max(2, Math.ceil(tokens.length * 0.6)));
}

function evidenceKeywords(normalizedTerm) {
  const stopWords = new Set([
    'with',
    'that',
    'this',
    'from',
    'into',
    'need',
    'needs',
    'clear',
    'clearer',
    'specific',
    'include',
    'includes',
    'including',
    'final',
    'three',
    'style',
    'block',
    'section',
    'sections',
    'statement',
    'founders',
    'founder',
    'teams',
    'team',
  ]);
  return normalizedTerm
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !stopWords.has(token));
}

function pushUnique(list, value) {
  const term = cleanEvidenceTerm(value);
  if (!term) return;
  const normalized = normalizeEvidenceText(term);
  if (list.some((item) => normalizeEvidenceText(item) === normalized)) return;
  list.push(term);
}

function validateSchemaPayload(elements, schemaCatalog, errors, warnings, checks) {
  const schemas = extractElementSchemas(schemaCatalog);
  const schemaNames = Object.keys(schemas);
  if (!schemaNames.length) {
    warnings.push(issue('schema', 'No Bricks schema catalog snapshot is available for this workspace.'));
    checks.push(check('schema', false, 'Skipped Bricks schema validation because no schema catalog was available.'));
    return;
  }

  const allowedNames = new Set(schemaNames);
  let schemaWarningCount = 0;
  let schemaErrorCount = 0;
  for (const [index, element] of elements.entries()) {
    if (!element || typeof element !== 'object' || Array.isArray(element)) {
      errors.push(schemaIssue(`elements[${index}]`, 'Element is not an object.', 'Every Bricks element must be an object with id, name, settings, and parent fields.'));
      schemaErrorCount += 1;
      continue;
    }
    const name = elementName(element);
    if (!name) {
      warnings.push(schemaIssue(`elements[${index}].name`, 'Element name is missing.', 'Use a Bricks element name from the schema catalog.'));
      schemaWarningCount += 1;
      continue;
    }
    if (!allowedNames.has(name)) {
      warnings.push(schemaIssue(`elements[${index}].name`, `Element type ${name} is not in the Bricks schema catalog.`, 'Use the focused Bricks schema catalog before choosing element names.'));
      schemaWarningCount += 1;
      continue;
    }

    const controls = firstObject(schemas[name]?.controls) || {};
    const settings = firstObject(element.settings) || {};
    if (!Object.keys(controls).length || !Object.keys(settings).length) continue;

    for (const key of Object.keys(settings)) {
      const baseKey = settingBaseKey(key);
      if (controls[baseKey] || allowedGenericSettingKey(baseKey)) continue;
      warnings.push(schemaIssue(`elements[${index}].settings.${key}`, `Setting ${key} is not exposed by the ${name} schema.`, 'Prefer a native schema control or document the custom CSS fallback.'));
      schemaWarningCount += 1;
    }
  }

  checks.push(check(
    'schema',
    schemaErrorCount === 0,
    `Checked ${elements.length} element(s) against ${schemaNames.length} Bricks schema definition(s); ${schemaErrorCount} error(s), ${schemaWarningCount} warning(s).`,
  ));
}

function extractContent(result) {
  const candidates = [
    result.content,
    result.elements,
    result?.bricks?.content,
    result?.bricks?.elements,
    result?.payload?.content,
    result?.payload?.elements,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function extractElementSchemas(schemaCatalog) {
  if (!schemaCatalog || typeof schemaCatalog !== 'object' || Array.isArray(schemaCatalog)) return {};
  const candidates = [
    schemaCatalog.elements,
    schemaCatalog.catalog?.elements,
    schemaCatalog.schema?.elements,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) return candidate;
  }
  return {};
}

function collectColorTokens(payload) {
  const tokens = [];
  const stack = [payload];
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== 'object') continue;
    if (Array.isArray(item)) {
      stack.push(...item);
      continue;
    }
    if (typeof item.hex === 'string' || typeof item.color === 'string' || typeof item.value === 'string') {
      if (item.name || item.id || item.key) tokens.push(item);
    }
    for (const value of Object.values(item)) {
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return tokens;
}

async function writeValidation(filePath, validation) {
  const output = {
    type: 'bricks_native_prototype_validation',
    generatedAt: new Date().toISOString(),
    ...validation,
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  return output;
}

function validationFiles(workspaceDir) {
  return {
    context: path.join(workspaceDir, 'bricks-native-context.json'),
    brief: path.join(workspaceDir, 'bricks-native-brief.md'),
    schemaCatalog: path.join(workspaceDir, 'bricks-native-schema-catalog.json'),
    result: path.join(workspaceDir, 'bricks-result.json'),
    validation: path.join(workspaceDir, 'bricks-validation.json'),
  };
}

async function readJsonSafe(filePath) {
  try {
    return JSON.parse(cleanJsonText(await fs.readFile(filePath, 'utf8')));
  } catch {
    return null;
  }
}

async function readTextSafe(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function isReadyToApply(result) {
  return result?.diagnostics?.readyToApply === true || result?.readyToApply === true;
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || null;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function elementName(element) {
  return stringValue(element.name || element.type || element.element || element.tag).toLowerCase();
}

function normalizeParent(value) {
  if (value === null || value === undefined || value === false) return '';
  const parent = stringValue(value);
  return ROOT_PARENT_VALUES.has(parent) ? '' : parent;
}

function stringValue(value) {
  return String(value ?? '').trim();
}

function slugify(value) {
  return stringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function genericColorTokenName(value) {
  const normalized = slugify(value);
  return new Set([
    'primary',
    'secondary',
    'accent',
    'background',
    'bg',
    'surface',
    'text',
    'body',
    'heading',
    'border',
    'muted',
    'light',
    'dark',
    'white',
    'black',
  ]).has(normalized);
}

function commonTokenPrefix(names) {
  const prefixes = new Map();
  for (const name of names) {
    const normalized = slugify(name);
    const parts = normalized.split('-').filter(Boolean);
    if (parts.length < 2) continue;
    const prefix = parts.slice(0, Math.min(parts.length - 1, 2)).join('-');
    if (!prefix || genericColorTokenName(prefix)) continue;
    prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
  }
  const minimum = Math.max(1, Math.ceil(names.length * 0.6));
  for (const [prefix, count] of prefixes.entries()) {
    if (count >= minimum) return prefix;
  }
  return '';
}

function isBemBlockClass(value) {
  const text = stringValue(value);
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(text);
}

function isBemElementOrModifierClass(value) {
  const text = stringValue(value);
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__(?:[a-z0-9]+-?)+|--(?:[a-z0-9]+-?)+)$/.test(text);
}

function collectReferencedGlobalClassIds(content) {
  const ids = new Set();
  for (const element of arrayValue(content)) {
    if (!element || typeof element !== 'object' || Array.isArray(element)) continue;
    const settings = firstObject(element.settings) || {};
    const candidates = [
      element.globalClasses,
      element.global_classes,
      element.classIds,
      element.class_ids,
      element.classes,
      settings._cssGlobalClasses,
      settings._globalClasses,
      settings.globalClasses,
      settings.cssClasses,
      settings._cssClasses,
    ];
    for (const candidate of candidates) {
      for (const item of arrayValue(candidate)) {
        if (typeof item === 'string') {
          const value = stringValue(item);
          if (value) ids.add(value);
          continue;
        }
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const value = stringValue(item.id || item.name || item.key);
          if (value) ids.add(value);
        }
      }
    }
    const className = stringValue(settings.className || settings._className || element.className);
    for (const name of className.split(/\s+/).map((item) => item.trim()).filter(Boolean)) {
      ids.add(name);
    }
  }
  return ids;
}

function issue(code, message) {
  return { code, message };
}

function schemaIssue(pathName, message, suggestion) {
  return { code: 'schema', path: pathName, message, suggestion };
}

function check(name, ok, message) {
  return { name, ok, message };
}

function settingBaseKey(key) {
  return String(key || '').split(':')[0] || '';
}

function allowedGenericSettingKey(key) {
  return key.startsWith('_') || [
    'text',
    'tag',
    'link',
    'image',
    'items',
    'fields',
    'actions',
    'icon',
    'menu',
    'query',
  ].includes(key);
}

function containsWrapperTag(value, key) {
  const text = stringValue(value).toLowerCase();
  if (!text) return false;
  if (key === 'cssCode') return text.includes('<style');
  if (key === 'javascriptCode') return text.includes('<script');
  return false;
}

function broadRawStyleKey(key) {
  return [
    '_background',
    '_fontSize',
    '_fontWeight',
    '_fontFamily',
    '_borderRadius',
    '_textAlign',
    '_color',
    '_opacity',
    '_cursor',
  ].includes(key);
}

function cleanJsonText(value) {
  let text = String(value ?? '').replace(/^\uFEFF/, '').trim();
  text = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1].trim();
  return text;
}
