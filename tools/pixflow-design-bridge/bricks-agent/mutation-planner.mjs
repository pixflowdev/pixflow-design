import { indexBricksAgentTargets, normalizeBricksAgentTargets } from './target-inventory.mjs';

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Keep generated-media intent as a small, credential-free host instruction.
 * The agent chooses the brief and target token; the WordPress host resolves
 * the configured provider, creates the attachment, and replaces the token
 * before Bricks sees the payload. API keys and arbitrary URLs never cross
 * this boundary.
 */
function normalizeGeneratedMediaRequest(value, fallbackToken = 'generated-image-1') {
  const input = objectValue(value);
  const prompt = firstString(input.prompt, input.description, input.brief).slice(0, 4_000);
  if (!prompt) return null;
  const surface = firstString(input.surface, 'image').toLowerCase();
  if (!['image', 'video'].includes(surface)) return null;
  const defaultPrefix = surface === 'video' ? 'generated-video' : 'generated-image';
  const token = firstString(input.token, input.id, input.assetId, `${defaultPrefix}-${fallbackToken.split('-').pop()}`)
    .replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 80) || `${defaultPrefix}-1`;
  const fileValue = typeof input.file === 'string'
    ? input.file
    : firstString(objectValue(input.file).name, objectValue(input.file).filename, objectValue(input.file).path);
  const rawFilename = firstString(input.filename, input.output, fileValue)
    .replace(/[/\\]+/g, '/')
    .split('/')
    .pop()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .slice(0, 160);
  return {
    token,
    surface,
    prompt,
    providerId: firstString(input.providerId, input.provider, input.provider_id).slice(0, 64),
    model: firstString(input.model).slice(0, 160),
    aspect: firstString(input.aspect, input.aspectRatio, input.aspect_ratio, '1:1').slice(0, 16),
    ...(surface === 'video' && Number.isFinite(Number(input.length || input.duration))
      ? { length: Math.max(1, Math.min(60, Number(input.length || input.duration))) }
      : {}),
    ...(rawFilename ? { filename: rawFilename } : {}),
  };
}

export function normalizedGeneratedMediaRequests(value) {
  const input = objectValue(value);
  const list = Array.isArray(value)
    ? value
    : Array.isArray(input.mediaGenerations || input.media_generations)
      ? (input.mediaGenerations || input.media_generations)
      : [value];
  return list.slice(0, 8).map((entry, index) => normalizeGeneratedMediaRequest(entry, `generated-image-${index + 1}`)).filter(Boolean);
}

function generatedMediaMetadata(value) {
  const requests = normalizedGeneratedMediaRequests(value);
  return requests.length > 0 ? { mediaGenerations: requests } : {};
}

function stringArray(...values) {
  const source = values.find((value) => Array.isArray(value));
  return Array.isArray(source)
    ? [...new Set(source.map((value) => firstString(value)).filter(Boolean))].slice(0, 12)
    : [];
}

// Pixflow owns the conversational/mutation workflow, while Bricks owns the
// live schema and save pipeline. Keep the operation-to-skill routing explicit
// so a compound mutation never depends on the model remembering to name its
// own repair branch. `skillIds` are Pixflow's source-backed branches; the
// native ids/routes are carried as evidence for the Bricks runtime and repair
// turn, not as a second mutation transport.
const BRICKS_MUTATION_SKILL_BUNDLES = Object.freeze({
  generic: {
    skillIds: ['bricks-operation-design-mode-mutation', 'bricks-operation-selected-element-patch', 'bricks-elements', 'bricks-schema'],
    nativeSkillIds: ['bricks-element-schemas', 'bricks-quality-gate'],
    nativeAbilityRoutes: ['bricks/get-page-elements', 'bricks/get-element-schema', 'bricks/get-design-context'],
  },
  text: {
    skillIds: ['selected-element', 'bricks-elements', 'bricks-elements-text', 'bricks-controls', 'bricks-controls-typography', 'bricks-schema'],
    nativeSkillIds: ['bricks-element-schemas', 'bricks-naming-conventions'],
    nativeAbilityRoutes: ['bricks/get-page-elements', 'bricks/get-element-schema', 'bricks/get-design-context'],
  },
  query: {
    skillIds: ['query-loops', 'dynamic-data', 'bricks-elements-dynamic', 'bricks-elements-layout', 'bricks-operation-design-mode-mutation', 'bricks-schema'],
    nativeSkillIds: ['bricks-query-loops', 'bricks-dynamic-data', 'bricks-element-schemas'],
    nativeAbilityRoutes: ['bricks/list-query-loop-types', 'bricks/list-dynamic-data-tags', 'bricks/get-page-elements', 'bricks/get-element-schema'],
  },
  dynamic: {
    skillIds: ['dynamic-data', 'bricks-elements-dynamic-data', 'bricks-elements-dynamic', 'bricks-operation-selected-element-patch', 'bricks-schema'],
    nativeSkillIds: ['bricks-dynamic-data', 'bricks-element-schemas'],
    nativeAbilityRoutes: ['bricks/list-dynamic-data-tags', 'bricks/preview-dynamic-tag', 'bricks/get-element-schema'],
  },
  filter: {
    skillIds: ['bricks-filters', 'query-loops', 'bricks-elements-filters', 'bricks-elements-dynamic', 'bricks-schema'],
    nativeSkillIds: ['bricks-query-filters', 'bricks-query-loops', 'bricks-element-schemas'],
    nativeAbilityRoutes: ['bricks/list-query-filters', 'bricks/list-query-loop-types', 'bricks/get-filter-element', 'bricks/get-element-schema'],
  },
  condition: {
    skillIds: ['bricks-conditions', 'dynamic-data', 'bricks-elements-conditions', 'bricks-elements-dynamic-data', 'bricks-operation-selected-element-patch', 'bricks-schema'],
    nativeSkillIds: ['bricks-element-conditions', 'bricks-dynamic-data', 'bricks-element-schemas'],
    nativeAbilityRoutes: ['bricks/get-element-conditions', 'bricks/list-dynamic-data-tags', 'bricks/get-element-schema'],
  },
  form: {
    skillIds: ['bricks-forms', 'forms', 'bricks-elements-forms', 'bricks-controls', 'accessibility', 'bricks-schema'],
    nativeSkillIds: ['bricks-forms', 'bricks-element-schemas'],
    nativeAbilityRoutes: ['bricks/get-form-config', 'bricks/get-element-schema', 'bricks/get-design-context'],
  },
  code: {
    skillIds: ['custom-code', 'bricks-elements-code', 'bricks-controls-custom-css-fallback', 'bricks-operation-design-mode-mutation', 'bricks-schema'],
    nativeSkillIds: ['bricks-custom-code', 'bricks-element-schemas'],
    nativeAbilityRoutes: ['bricks/get-element-schema', 'bricks/get-page-settings', 'bricks/get-design-context'],
  },
  interaction: {
    skillIds: ['bricks-interactions', 'interactions', 'bricks-elements-interactive', 'bricks-operation-design-mode-mutation', 'bricks-schema'],
    nativeSkillIds: ['bricks-interactions', 'bricks-element-schemas'],
    nativeAbilityRoutes: ['bricks/get-element-interactions', 'bricks/get-element-schema', 'bricks/get-design-context'],
  },
  media: {
    skillIds: ['bricks-generated-media', 'bricks-elements-media', 'wordpress-content', 'bricks-operation-selected-element-patch', 'bricks-schema'],
    nativeSkillIds: ['bricks-media', 'bricks-element-schemas'],
    nativeAbilityRoutes: ['bricks/find-media', 'bricks/get-page-elements', 'bricks/get-element-schema'],
  },
  layout: {
    skillIds: ['bricks-elements-layout', 'bricks-controls', 'element-controls', 'bricks-controls-spacing', 'bricks-controls-layout', 'responsive', 'design-tokens', 'bricks-schema'],
    nativeSkillIds: ['bricks-element-schemas', 'bricks-breakpoints'],
    nativeAbilityRoutes: ['bricks/get-element-schema', 'bricks/list-breakpoints', 'bricks/get-design-context'],
  },
});

function uniqueStrings(...values) {
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => firstString(value))
    .filter(Boolean))].slice(0, 24);
}

function normalizedMutationAction(value) {
  return firstString(value).toLowerCase().replace(/[\s-]+/g, '_');
}

function mutationOperationText(operation) {
  const input = objectValue(operation);
  const parts = [
    input.action,
    input.operation,
    input.mutationType,
    input.mutation_type,
    input.targetKind,
    input.target_kind,
    input.fieldKey,
    input.field_key,
  ];
  for (const patch of Array.isArray(input.patches) ? input.patches : []) {
    const row = objectValue(patch);
    parts.push(row.fieldKey, row.field_key, row.targetKind, row.target_kind, ...Object.keys(objectValue(row.settings)));
  }
  for (const element of Array.isArray(input.elements) ? input.elements : []) {
    const row = objectValue(element);
    parts.push(row.name, row.type, row.elementType, ...Object.keys(objectValue(row.settings)));
  }
  return parts.filter((part) => part !== undefined && part !== null).map((part) => String(part)).join(' ').toLowerCase();
}

/**
 * Return the deterministic Pixflow branch and native Bricks evidence for one
 * model-led operation. This is intentionally additive: model-provided skill
 * ids are retained, but the daemon always adds the canonical branches for the
 * fields/elements it can observe.
 */
export function bricksMutationSkillBundle(operation) {
  const action = normalizedMutationAction(objectValue(operation).action || objectValue(operation).operation);
  const text = mutationOperationText(operation);
  const kinds = new Set();
  const add = (kind) => kinds.add(kind);

  if (action.includes('query') || /\b(?:query|loop|posts_per_page|objecttype|orderby|pagination|infinite_scroll|related_query)\b/.test(text)) add('query');
  if (action.includes('filter') || /\b(?:filter|live_search|sort_options|filterqueryid|filter_query)\b/.test(text)) add('filter');
  if (action.includes('condition') || /(?:_conditions|condition|visibility|visible|logged_in|current_url)/.test(text)) add('condition');
  if (action.includes('form') || /\b(?:form|formfields|formactions|submit|webhook|validation|spam)\b/.test(text)) add('form');
  if (action.includes('dynamic') || /(?:usedynamicdata|dynamic_data|dynamicdata|post_title|post_url|featured_image|query_loop_index)/.test(text)) add('dynamic');
  if (action.includes('code') || /(?:javascriptcode|csscode|execute_code|executecode|php|custom_code|custom_css)/.test(text)) add('code');
  if (action.includes('interaction') || /(?:_interactions|animation|transition|enter_view|hover|trigger|toggleattribute|startanimation)/.test(text)) add('interaction');
  if (action.includes('media') || /(?:image|video|audio|alt_text|background_image|featured_image|media_id)/.test(text)) add('media');
  if (action.includes('text') || action.includes('replace') || /\b(?:text|content|title|label|caption|description|heading|buttontext|submitbuttontext)\b/.test(text)) add('text');
  if (action.includes('reorder') || action.includes('move') || action.includes('layout') || /(?:_padding|_margin|_gap|_display|_direction|_grid|_width|_height|responsive|breakpoint)/.test(text)) add('layout');
  if (kinds.size === 0) add('generic');

  const skillIds = [];
  const nativeSkillIds = [];
  const nativeAbilityRoutes = [];
  const append = (bundle) => {
    if (!bundle) return;
    skillIds.push(...bundle.skillIds);
    nativeSkillIds.push(...bundle.nativeSkillIds);
    nativeAbilityRoutes.push(...bundle.nativeAbilityRoutes);
  };
  append(BRICKS_MUTATION_SKILL_BUNDLES.generic);
  kinds.forEach((kind) => append(BRICKS_MUTATION_SKILL_BUNDLES[kind]));
  return {
    kinds: [...kinds],
    skillIds: uniqueStrings(skillIds),
    nativeSkillIds: uniqueStrings(nativeSkillIds),
    nativeAbilityRoutes: uniqueStrings(nativeAbilityRoutes),
  };
}

function operationSkillMetadata(operation) {
  const input = objectValue(operation);
  const bundle = bricksMutationSkillBundle(input);
  return {
    skillIds: uniqueStrings(input.skillIds, input.skill_ids, bundle.skillIds),
    nativeSkillIds: uniqueStrings(input.nativeSkillIds, input.native_skill_ids, bundle.nativeSkillIds),
    nativeAbilityRoutes: uniqueStrings(input.nativeAbilityRoutes, input.native_ability_routes, bundle.nativeAbilityRoutes),
  };
}

function isModelLedBricksSession(request) {
  if (firstString(request?.mode).toLowerCase() !== 'design') return false;
  const runContext = objectValue(request?.runContext || request?.run_context);
  const sessionType = firstString(request?.sessionType, request?.session_type).toLowerCase();
  const modelLed = firstString(request?.modelLed, request?.model_led).toLowerCase() === 'true'
    || request?.modelLed === true
    || request?.model_led === true;
  return sessionType === 'bricks_agent_model_edit'
    || modelLed
    || runContext.authorizedMutationSession === true
    || runContext.sessionAuthorized === true;
}

function liveBricksElements(request) {
  const bricksContext = objectValue(request?.bricksContext || request?.bricks_context);
  const inventory = objectValue(bricksContext.inventory);
  return [
    ...(Array.isArray(bricksContext.elements) ? bricksContext.elements : []),
    ...(Array.isArray(bricksContext.content) ? bricksContext.content : []),
    ...(Array.isArray(inventory.elements) ? inventory.elements : []),
  ].filter((element, index, all) => {
    const id = firstString(element?.id, element?.elementId, element?.element_id);
    return id && all.findIndex((candidate) => firstString(candidate?.id, candidate?.elementId, candidate?.element_id) === id) === index;
  });
}

function hasLiveBricksElement(request, elementId) {
  const id = firstString(elementId);
  return Boolean(id && liveBricksElements(request).some((element) => (
    firstString(element?.id, element?.elementId, element?.element_id) === id
  )));
}

function modelLedRawSettingsPatch(id, fieldKey, value, request, target, valueIsSettings = false) {
  const knownSettings = valueIsSettings && value && typeof value === 'object' && !Array.isArray(value)
    ? { ...objectValue(value) }
    : { [fieldKey]: safeValue(value) };
  if (Object.keys(knownSettings).length === 0) return null;

  // Raw model-led patches and structured condition actions must converge on
  // the same native Bricks value shapes. In particular, User role is a
  // multi-select even when the model names a single role. Preserve malformed
  // condition data for Bricks' repair packet, but normalize a valid group
  // before it crosses the native boundary.
  if (Array.isArray(knownSettings._conditions)) {
    const normalizedConditions = normalizeElementConditions(knownSettings._conditions, id, request);
    if (normalizedConditions) knownSettings._conditions = normalizedConditions;
  }
  let encoded = '';
  try {
    encoded = JSON.stringify(knownSettings);
  } catch {
    return null;
  }
  if (encoded.length > 24_000) return null;

  // Sensitive code still gets a bounded source check. Ordinary Bricks
  // settings, repeaters, conditions, interactions, attributes, and provider
  // values deliberately pass through to Bricks so its native schema can
  // accept, normalize, or reject them and feed an exact repair packet back to
  // the same model. Pixflow must not turn design-quality/schema drift into a
  // preflight failure before the native boundary has seen the decision.
  for (const key of Object.keys(knownSettings)) {
    if (['code', 'javascriptCode', 'cssCode'].includes(key)) {
      const runtimeKnowledge = objectValue(objectValue(request?.mcpRuntimeContext || request?.mcp_runtime_context).knowledge);
      const codeSchema = objectValue(runtimeKnowledge.codeElementSchema || runtimeKnowledge.code_element_schema);
      const capabilities = objectValue(codeSchema.capabilities);
      if (capabilities.canExecuteCode !== true || capabilities.canReadSensitiveCode !== true) return null;
      if (key === 'code' && capabilities.nativeSavePipeline !== true) return null;
      const source = normalizedCodeSource(knownSettings[key]);
      if (!source) return null;
      if (key === 'javascriptCode' && /<\s*\/?\s*script\b/i.test(source)) return null;
      if (key === 'cssCode' && /<\s*\/?\s*style\b/i.test(source)) return null;
      knownSettings[key] = source;
    }
  }
  return knownSettings;
}

function safeValue(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value === null) return null;
  if (Array.isArray(value)) return value.slice(0, 40);
  if (value && typeof value === 'object') return objectValue(value);
  return '';
}

export function normalizeBricksAgentOptionTargets(targets) {
  return (Array.isArray(targets) ? targets : [])
    .map((item) => {
      const record = objectValue(item);
      const elementId = firstString(record.elementId, record.element_id, record.id);
      const fieldKey = firstString(record.fieldKey, record.field_key, record.key);
      if (!elementId || !fieldKey) return null;
      return {
        elementId,
        fieldKey,
        fieldPath: firstString(record.fieldPath, record.field_path, `settings.${fieldKey}`),
        targetKind: firstString(record.targetKind, record.target_kind, 'option'),
        targetLabel: firstString(record.targetLabel, record.target_label, record.label, elementId),
        valuePreview: firstString(record.valuePreview, record.value_preview),
        valueState: firstString(record.valueState, record.value_state),
        placeholderPreview: firstString(record.placeholderPreview, record.placeholder_preview).slice(0, 320),
        dynamicDataContexts: stringArray(
          record.dynamicDataContexts,
          record.dynamic_data_contexts,
        ),
      };
    })
    .filter(Boolean);
}

export function buildBricksAgentMutationInventory(request) {
  const textTargets = normalizeBricksAgentTargets(request?.targets);
  const optionTargets = normalizeBricksAgentOptionTargets(request?.editableOptionTargets || request?.editable_option_targets);
  const index = indexBricksAgentTargets(textTargets);
  optionTargets.forEach((target) => {
    index.set(`${target.elementId}:${target.fieldKey}`, target);
    if (!index.has(target.elementId)) index.set(target.elementId, target);
  });
  return {
    textTargets,
    optionTargets,
    allTargets: [...textTargets, ...optionTargets],
    index,
  };
}

/**
 * A model may return only its exact live target decision when a prior typed
 * intent already owns the bounded mutation values. Rehydrate that decision
 * into the normal capability action without treating chat prose as authority.
 */
export function hydrateModelTargetDecisionFromTypedIntent(modelValue, request) {
  const model = objectValue(modelValue);
  const action = firstString(model.action).toLowerCase().replace(/[\s-]+/g, '_');
  if (!['repair', 'target_selection', 'target_selection_repair'].includes(action)) return null;

  const targetId = firstString(model.targetId, model.target_id, model.elementId, model.element_id);
  const fieldKey = firstString(model.fieldKey, model.field_key);
  if (!targetId || !fieldKey) return null;
  const fact = objectValue(
    request?.resolvedWorkingMemoryFact
    || request?.resolved_working_memory_fact
    || request?.workingMemoryIntentCandidate
    || request?.working_memory_intent_candidate,
  );
  const intent = objectValue(fact.intent);
  const kind = firstString(fact.kind);
  if (!kind || firstString(intent.kind) !== kind) return null;

  const inventory = buildBricksAgentMutationInventory(request);
  const target = inventory.index.get(`${targetId}:${fieldKey}`);
  if (!target) return null;
  const label = firstString(model.targetLabel, model.target_label, target.targetLabel, targetId);
  const reason = firstString(
    model.selectionRationale,
    model.selection_rationale,
    model.reason,
    'Selected one exact compatible live Bricks target for the prior typed intent.',
  );
  const common = {
    targetId,
    fieldKey,
    targetLabel: label,
    confidence: firstString(model.confidence, 'medium'),
    reason,
    selectionRationale: reason,
  };

  if (kind === 'text_replacement' && target.targetKind === 'text') {
    const value = firstString(intent.value).slice(0, 4000);
    if (!value) return null;
    return {
      ...common,
      action: 'replace',
      replacementText: value,
      answer: `I updated ${label} to “${value}”.`,
      mutationTitle: `Update ${label}`,
      changeSummary: `Changed the text to “${value}”.`,
    };
  }

  if (kind === 'visibility_condition' && fieldKey === '_conditions') {
    if (Array.isArray(intent.groups)) {
      return {
        ...common,
        action: 'condition',
        conditionGroups: intent.groups,
        replaceExisting: intent.replaceExisting === true,
      };
    }
    const key = firstString(intent.key);
    const operator = firstString(intent.operator);
    if (!key || !operator) return null;
    return {
      ...common,
      action: 'condition',
      condition: {
        key,
        operator,
        ...(!['empty', 'empty_not'].includes(operator) ? { value: intent.value } : {}),
        ...(firstString(intent.dynamicDataTag, intent.dynamic_data_tag) ? { dynamicDataTag: firstString(intent.dynamicDataTag, intent.dynamic_data_tag) } : {}),
      },
    };
  }

  if (kind === 'dynamic_data_binding') {
    const expression = firstString(intent.expression);
    if (!expression) return null;
    return { ...common, action: 'dynamic_data', expression, placement: firstString(intent.placement) };
  }

  if (kind === 'query_loop' && fieldKey === 'query') {
    return {
      ...common,
      action: 'query_loop',
      query: {
        objectType: firstString(intent.objectType, 'post'),
        ...(firstString(intent.postType) ? { post_type: [firstString(intent.postType)] } : {}),
        ...(firstString(intent.taxonomy) ? { taxonomy: [firstString(intent.taxonomy)] } : {}),
        ...(Number.isFinite(Number(intent.postsPerPage)) ? { posts_per_page: Number(intent.postsPerPage) } : {}),
        ...(firstString(intent.orderBy) ? { orderby: firstString(intent.orderBy) } : {}),
        ...(firstString(intent.order) ? { order: firstString(intent.order) } : {}),
        ...(Number.isFinite(Number(intent.offset)) ? { offset: Number(intent.offset) } : {}),
        ...(intent.excludeCurrentPost === true ? { exclude_current_post: true } : {}),
        ...(intent.ignoreStickyPosts === true ? { ignore_sticky_posts: true } : {}),
        ...(intent.infiniteScroll === true ? { infinite_scroll: true } : {}),
        ...(intent.currentPostTerm === true ? { current_post_term: true } : {}),
        ...(intent.showEmpty === true ? { show_empty: true } : {}),
      },
    };
  }

  if (kind === 'code_update' && ['code', 'javascriptCode', 'cssCode'].includes(fieldKey)) {
    const source = typeof intent.source === 'string' ? intent.source.slice(0, 32_000) : '';
    if (!source || firstString(intent.fieldKey) !== fieldKey) return null;
    return {
      ...common,
      action: 'code_update',
      source,
      ...(Object.keys(objectValue(intent.attributeBinding || intent.attribute_binding)).length > 0
        ? { attributeBinding: intent.attributeBinding || intent.attribute_binding }
        : {}),
    };
  }

  if (kind === 'settings_patch') {
    const values = (Array.isArray(intent.values) ? intent.values : []).map((entry) => objectValue(entry));
    if (!values.length || !values.some((entry) => firstString(entry.fieldKey, entry.field_key) === fieldKey)) return null;
    const patches = values.map((entry) => {
      const entryField = firstString(entry.fieldKey, entry.field_key);
      return entryField && inventory.index.has(`${targetId}:${entryField}`)
        ? { elementId: targetId, fieldKey: entryField, value: entry.value }
        : null;
    });
    if (patches.some((entry) => entry === null)) return null;
    return {
      ...common,
      action: 'patch',
      mutationType: 'bricks_settings_patch',
      answer: `I updated the requested settings on ${label}.`,
      mutationTitle: `Update ${label}`,
      changeSummary: `Updated ${patches.length} verified Bricks setting${patches.length === 1 ? '' : 's'}.`,
      patches,
    };
  }

  return null;
}

/**
 * Interpret one unambiguous live-v2 user proposal for conversational fluency.
 * The historical row supplies only the bounded value; current Design intent,
 * the model's exact target choice, and live inventory validation remain the
 * mutation authority. Restored or competing rows are rejected.
 */
function parseTargetValuePreview(target) {
  const preview = firstString(target?.valuePreview);
  if (!preview) return {};
  try {
    return objectValue(JSON.parse(preview));
  } catch {
    return {};
  }
}

function conditionTargetIsEmpty(target) {
  const preview = firstString(target?.valuePreview);
  if (!preview) return true;
  try {
    const groups = JSON.parse(preview);
    return Array.isArray(groups)
      && groups.every((group) => Array.isArray(group) && group.length === 0);
  } catch {
    return false;
  }
}

function dynamicDataExpressionBase(expression) {
  const inner = firstString(expression).replace(/^\{/, '').replace(/\}$/, '').trim();
  return firstString(inner.match(/^([a-zA-Z_][a-zA-Z0-9_.-]*)(?=[:\s@|]|$)/)?.[1]).toLowerCase();
}

function dynamicDataExpressionUsesModifier(expression, baseTag) {
  const inner = firstString(expression).replace(/^\{/, '').replace(/\}$/, '').trim();
  if (/\s@[a-z]/i.test(inner)) return true;
  if (!inner.toLowerCase().startsWith(baseTag)) return false;
  const suffix = inner.slice(baseTag.length);
  if (!suffix.startsWith(':')) return false;
  return !BRICKS_DYNAMIC_PARAMETER_TAGS.has(baseTag);
}

function dynamicDataPlacementIsSafe(target, expression, rules) {
  const baseTag = dynamicDataExpressionBase(expression);
  const descriptor = rules.catalog.get(baseTag) || {};
  const returns = firstString(descriptor.returns, descriptor.returnType, descriptor.return_type, 'mixed').toLowerCase();
  const targetKind = firstString(target?.targetKind).toLowerCase();
  const fieldKey = firstString(target?.fieldKey);
  const contexts = stringArray(target?.dynamicDataContexts).map((value) => value.toLowerCase());
  const requiredContexts = stringArray(descriptor.contexts).map((value) => value.toLowerCase());
  const queryLoopOnly = requiredContexts.length > 0
    && requiredContexts.every((value) => value.includes('query-loop'));
  if (
    queryLoopOnly
    && !contexts.some((value) => value.includes('query-loop'))
  ) return false;

  if (targetKind === 'link' && fieldKey === 'link') {
    return returns.includes('url') || returns.includes('email') || /:url(?:[\s@|}]|$)/i.test(expression);
  }
  if (targetKind === 'media' && fieldKey === 'image') {
    return returns.includes('media') || /:(?:image|url)(?:[\s@|}]|$)/i.test(expression);
  }
  if (targetKind === 'text') {
    return !returns.includes('media') && !returns.includes('array');
  }
  return false;
}

export function buildStructuredDynamicDataPatchModelResult(modelResult, request) {
  const result = objectValue(modelResult);
  const action = firstString(result.action).toLowerCase().replace(/-/g, '_');
  if (action !== 'dynamic_data') return null;
  if (firstString(request?.mode).toLowerCase() !== 'design') return null;
  const inventory = buildBricksAgentMutationInventory(request);
  const rules = collectRuntimeDynamicDataRules(request);
  const requestedTargets = Array.isArray(result.targets)
    ? result.targets
    : Array.isArray(result.bindings)
      ? result.bindings
      : [result];
  if (requestedTargets.length === 0 || requestedTargets.length > 64) return null;
  const patches = [];
  const labels = [];
  const seen = new Set();
  for (const rawTarget of requestedTargets) {
    const row = objectValue(rawTarget);
    const targetId = firstString(row.targetId, row.target_id, row.elementId, row.element_id, result.targetId, result.target_id);
    const fieldKey = firstString(row.fieldKey, row.field_key, result.fieldKey, result.field_key);
    const expression = firstString(
      row.expression,
      row.dynamicDataTag,
      row.dynamic_data_tag,
      result.expression,
      result.dynamicDataTag,
      result.dynamic_data_tag,
    ).slice(0, 240);
    if (!targetId || !fieldKey || !expression || seen.has(`${targetId}:${fieldKey}`)) return null;
    const candidates = [...new Map(inventory.allTargets
      .filter((target) => target.elementId === targetId && target.fieldKey === fieldKey)
      .map((target) => [`${target.elementId}:${target.fieldKey}`, target])).values()];
    if (candidates.length !== 1) return null;
    const target = candidates[0];
    if (!validateDynamicDataExpression(expression, rules, { requireRuntimeAvailability: true })) return null;
    if (!dynamicDataPlacementIsSafe(target, expression, rules)) return null;
    const baseTag = dynamicDataExpressionBase(expression);
    if (dynamicDataExpressionUsesModifier(expression, baseTag) && !rules.previews.has(expression)) return null;

    let value = expression;
    if (target.targetKind === 'link') {
      const current = parseTargetValuePreview(target);
      value = { ...current, type: 'meta', useDynamicData: expression };
      delete value.url;
    } else if (target.targetKind === 'media') {
      const current = parseTargetValuePreview(target);
      value = { useDynamicData: expression, ...(firstString(current.size) ? { size: firstString(current.size) } : {}) };
    }
    seen.add(`${targetId}:${fieldKey}`);
    const targetLabel = target.targetLabel || targetId;
    labels.push(targetLabel);
    patches.push({
      elementId: targetId,
      fieldKey,
      value,
      targetLabel,
      changeSummary: `Set ${fieldKey} to ${expression}.`,
    });
  }
  const targetLabel = labels.length === 1 ? labels[0] : `${labels.length} Bricks targets`;
  return {
    action: 'patch',
    mutationType: 'dynamic_data_update',
    targetLabel,
    answer: firstString(result.answer, `I bound dynamic data on ${targetLabel}.`),
    mutationTitle: firstString(result.mutationTitle, result.mutation_title, `Bind ${targetLabel} dynamic data`),
    changeSummary: firstString(result.changeSummary, result.change_summary, `Set dynamic data on ${targetLabel}.`),
    confidence: firstString(result.confidence, 'high'),
    reason: firstString(result.reason, `Validated runtime-available Bricks dynamic-data expressions against ${targetLabel}.`),
    patches,
  };
}

/**
 * Normalize one or more model-selected native link controls. The older
 * prompt-derived link helper remains a conversational fallback; model-led
 * Design decisions may explicitly provide a targets/updates list and
 * therefore are not limited to the currently selected link.
 */
export function buildStructuredLinkPatchModelResult(modelResult, request) {
  const result = objectValue(modelResult);
  const action = firstString(result.action).toLowerCase().replace(/[\s-]+/g, '_');
  if (!['link', 'link_update'].includes(action) || firstString(request?.mode).toLowerCase() !== 'design') return null;
  const inventory = buildBricksAgentMutationInventory(request);
  const rows = Array.isArray(result.targets)
    ? result.targets
    : Array.isArray(result.updates)
      ? result.updates
      : [result];
  if (rows.length === 0 || rows.length > 64) return null;
  const patches = [];
  const labels = [];
  const seen = new Set();
  for (const rawRow of rows) {
    const row = objectValue(rawRow);
    const elementId = firstString(row.targetId, row.target_id, row.elementId, row.element_id, result.targetId, result.target_id);
    const target = inventory.optionTargets.find((candidate) => (
      candidate.elementId === elementId && candidate.fieldKey === 'link' && candidate.targetKind === 'link'
    ));
    if (!target || seen.has(elementId)) return null;
    const rawValue = row.value ?? row.link ?? result.value ?? result.link;
    const link = normalizeBricksLinkValue(rawValue);
    if (!link) return null;
    seen.add(elementId);
    labels.push(target.targetLabel || elementId);
    patches.push({
      elementId,
      fieldKey: 'link',
      value: link,
      targetLabel: target.targetLabel || elementId,
      changeSummary: firstString(row.changeSummary, row.change_summary, 'Update ' + (target.targetLabel || elementId) + ' link.'),
    });
  }
  const targetLabel = labels.length === 1 ? labels[0] : String(labels.length) + ' Bricks links';
  return {
    action: 'patch',
    mutationType: 'link_update',
    targetLabel,
    answer: firstString(result.answer, 'I updated ' + targetLabel + '.'),
    mutationTitle: firstString(result.mutationTitle, result.mutation_title, 'Update ' + targetLabel),
    changeSummary: firstString(result.changeSummary, result.change_summary, 'Updated ' + targetLabel + '.'),
    confidence: firstString(result.confidence, 'high'),
    reason: firstString(result.reason, 'Validated ' + labels.length + ' exact live Bricks link target' + (labels.length === 1 ? '' : 's') + '.'),
    patches,
  };
}

function normalizedCodeSource(value) {
  if (typeof value !== 'string') return '';
  if (!value.trim() || value.length > 32_000 || value.includes('\0')) return '';
  return value;
}

export function normalizeCodeAttributeBinding(value, request) {
  const attribute = objectValue(value);
  const elementId = firstString(attribute.elementId, attribute.element_id);
  const name = firstString(attribute.name).toLowerCase();
  const attributeValue = typeof attribute.value === 'string' || typeof attribute.value === 'number'
    ? String(attribute.value).slice(0, 500)
    : '';
  if (!elementId && !name && !attributeValue) return undefined;
  if (!elementId || !/^data-[a-z][a-z0-9_.:-]{0,62}$/.test(name)) return null;
  const candidates = buildBricksAgentMutationInventory(request).optionTargets.filter((target) => (
    target.elementId === elementId && target.fieldKey === '_attributes'
  ));
  return candidates.length === 1 ? { elementId, name, value: attributeValue } : null;
}

export function buildStructuredCodePatchModelResult(modelResult, request) {
  const result = objectValue(modelResult);
  const action = firstString(result.action).toLowerCase().replace(/-/g, '_');
  if (action !== 'code_update' || firstString(request?.mode).toLowerCase() !== 'design') return null;

  const runtimeKnowledge = objectValue(objectValue(request?.mcpRuntimeContext || request?.mcp_runtime_context).knowledge);
  const codeSchema = objectValue(runtimeKnowledge.codeElementSchema || runtimeKnowledge.code_element_schema);
  const capabilities = objectValue(codeSchema.capabilities);
  const inventory = buildBricksAgentMutationInventory(request);
  const requestedTargets = Array.isArray(result.targets)
    ? result.targets
    : Array.isArray(result.updates)
      ? result.updates
      : [result];
  if (requestedTargets.length === 0 || requestedTargets.length > 64) return null;
  const patches = [];
  const labels = [];
  const seen = new Set();
  for (const rawTarget of requestedTargets) {
    const row = objectValue(rawTarget);
    const targetId = firstString(row.targetId, row.target_id, row.elementId, row.element_id, result.targetId, result.target_id);
    const fieldKey = firstString(row.fieldKey, row.field_key, result.fieldKey, result.field_key);
    const source = normalizedCodeSource(
      typeof row.source === 'string'
        ? row.source
        : typeof row.replacementSource === 'string'
          ? row.replacementSource
          : row.value !== undefined ? row.value
            : typeof result.source === 'string'
              ? result.source
              : typeof result.replacementSource === 'string'
                ? result.replacementSource
                : result.value,
    );
    if (!targetId || !['code', 'javascriptCode', 'cssCode'].includes(fieldKey) || !source || seen.has(`${targetId}:${fieldKey}`)) return null;
    if (capabilities.canExecuteCode !== true || capabilities.canReadSensitiveCode !== true) return null;
    if (fieldKey === 'code' && capabilities.nativeSavePipeline !== true) return null;
    if (fieldKey !== 'code' && /<\?(?:php|=)?/i.test(source)) return null;
    if (fieldKey === 'javascriptCode' && /<\s*\/?\s*script\b/i.test(source)) return null;
    if (fieldKey === 'cssCode' && /<\s*\/?\s*style\b/i.test(source)) return null;
    if (fieldKey === 'code' && /<\s*\/?\s*script\b/i.test(source)) return null;
    const expectedKind = { code: 'code_html_php', javascriptCode: 'code_javascript', cssCode: 'code_css' }[fieldKey];
    const candidates = inventory.optionTargets.filter((target) => (
      target.elementId === targetId && target.fieldKey === fieldKey && target.targetKind === expectedKind
    ));
    if (candidates.length !== 1) return null;
    const target = candidates[0];
    seen.add(`${targetId}:${fieldKey}`);
    labels.push(target.targetLabel || targetId);
    patches.push({
      elementId: targetId,
      settings: { [fieldKey]: source, executeCode: true },
      targetLabel: target.targetLabel || targetId,
      changeSummary: `Replace ${fieldKey} on ${target.targetLabel || targetId}.`,
    });
  }

  const rowBindings = requestedTargets.flatMap((row) => {
    const target = objectValue(row);
    if (Array.isArray(target.attributeBindings)) return target.attributeBindings;
    if (Array.isArray(target.attribute_bindings)) return target.attribute_bindings;
    return [target.attributeBinding || target.attribute_binding].filter(Boolean);
  });
  const topLevelBindings = Array.isArray(result.attributeBindings)
    ? result.attributeBindings
    : Array.isArray(result.attribute_bindings)
      ? result.attribute_bindings
      : [result.attributeBinding || result.attribute_binding].filter(Boolean);
  const rawBindings = [...topLevelBindings, ...rowBindings];
  const bindings = rawBindings.map((binding) => normalizeCodeAttributeBinding(binding, request));
  if (bindings.some((binding) => binding === null) || (bindings.length > 0 && labels.length === 0)) return null;
  const attributePatches = new Map();
  for (const binding of bindings.filter(Boolean)) {
    const attributeTarget = inventory.optionTargets.find((target) => (
      target.elementId === binding.elementId && target.fieldKey === '_attributes'
    ));
    if (!attributeTarget) return null;
    let existing = attributePatches.get(binding.elementId)?.value || null;
    if (!existing) {
      try {
        const parsed = JSON.parse(firstString(attributeTarget.valuePreview, '[]'));
        existing = Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object').slice(0, 11) : [];
      } catch {
        existing = [];
      }
    }
    const attributes = normalizeBricksDataAttributes(
      existing.filter((item) => firstString(item.name).toLowerCase() !== binding.name)
        .concat([{ id: `pxf${stableBricksConditionId(`${binding.elementId}:${binding.name}`).slice(0, 6)}`, name: binding.name, value: binding.value }]),
    );
    if (!attributes) return null;
    attributePatches.set(binding.elementId, {
      elementId: binding.elementId,
      fieldKey: '_attributes',
      value: attributes,
      targetLabel: attributeTarget.targetLabel || binding.elementId,
      changeSummary: `Bind requested data attributes on ${attributeTarget.targetLabel || binding.elementId}.`,
    });
  }
  patches.push(...attributePatches.values());
  const targetLabel = labels.length === 1 ? labels[0] : `${labels.length} Code targets`;
  return {
    action: 'patch',
    mutationType: 'code_update',
    targetLabel,
    answer: firstString(result.answer, `I updated ${targetLabel}.`),
    mutationTitle: firstString(result.mutationTitle, result.mutation_title, `Update ${targetLabel}`),
    changeSummary: firstString(result.changeSummary, result.change_summary, 'Replace the requested Code source and hooks.'),
    confidence: firstString(result.confidence, 'high'),
    reason: firstString(result.reason, `Validated ${labels.length} exact live Code target${labels.length === 1 ? '' : 's'} and native capability evidence.`),
    patches,
  };
}

function buildProposedCodeUpdateFactForSource(request, proposed) {
  const mode = firstString(request?.mode).toLowerCase();
  if (mode !== 'chat' && mode !== 'ask' && mode !== 'plan') return null;
  if (!proposed || !['code', 'javascriptCode', 'cssCode'].includes(firstString(proposed.fieldKey))) return null;
  const source = normalizedCodeSource(proposed.source);
  if (!source) return null;
  const attributeBinding = normalizeCodeAttributeBinding(proposed.attributeBinding, request);
  if (attributeBinding === null) return null;
  proposed = {
    fieldKey: firstString(proposed.fieldKey),
    source,
    ...(attributeBinding ? { attributeBinding } : {}),
  };

  const runtimeKnowledge = objectValue(objectValue(request?.mcpRuntimeContext || request?.mcp_runtime_context).knowledge);
  const codeSchema = objectValue(runtimeKnowledge.codeElementSchema || runtimeKnowledge.code_element_schema);
  const capabilities = objectValue(codeSchema.capabilities);
  if (capabilities.canExecuteCode !== true || capabilities.canReadSensitiveCode !== true) return null;
  if (proposed.fieldKey === 'code' && capabilities.nativeSavePipeline !== true) return null;
  if (proposed.fieldKey === 'javascriptCode' && /<\s*\/?\s*script\b/i.test(proposed.source)) return null;
  if (proposed.fieldKey === 'cssCode' && /<\s*\/?\s*style\b/i.test(proposed.source)) return null;
  if (proposed.fieldKey !== 'code' && /<\?(?:php|=)?/i.test(proposed.source)) return null;

  const bricksContext = objectValue(request?.bricksContext || request?.bricks_context);
  const selectedId = firstString(bricksContext.selectedId, request?.elementId, request?.element_id);
  const expectedKind = {
    code: 'code_html_php',
    javascriptCode: 'code_javascript',
    cssCode: 'code_css',
  }[proposed.fieldKey];
  const targets = buildBricksAgentMutationInventory(request).optionTargets.filter((target) => (
    target.elementId === selectedId
    && target.fieldKey === proposed.fieldKey
    && target.targetKind === expectedKind
  ));
  if (!selectedId || targets.length !== 1) return null;

  const memory = objectValue(request?.workingMemory || request?.working_memory);
  const currentTurn = objectValue(memory.currentTurn || memory.current_turn);
  const currentTarget = objectValue(currentTurn.target);
  const fingerprints = objectValue(currentTurn.fingerprints);
  const messageId = firstString(currentTurn.messageId, currentTurn.message_id);
  const createdTurn = Number(currentTurn.number || currentTurn.createdTurn || currentTurn.created_turn || 0);
  const postId = Number(currentTarget.postId || currentTarget.post_id || bricksContext.postId || bricksContext.post_id || 0);
  const area = firstString(currentTarget.area, bricksContext.area, 'content');
  const pageFingerprint = firstString(fingerprints.page);
  const inventoryFingerprint = firstString(fingerprints.inventory);
  if (!messageId || !Number.isInteger(createdTurn) || createdTurn < 1 || !Number.isInteger(postId) || postId < 1 || !pageFingerprint || !inventoryFingerprint) return null;

  return {
    id: `fact:${messageId}:code_update`,
    kind: 'code_update',
    capability: 'code_element',
    skillIds: [],
    target: { postId, area, elementId: selectedId, fieldKey: proposed.fieldKey },
    intent: {
      kind: 'code_update',
      fieldKey: proposed.fieldKey,
      source: proposed.source,
      ...(proposed.attributeBinding ? { attributeBinding: proposed.attributeBinding } : {}),
    },
    status: 'proposed',
    supersedesFactIds: [],
    createdTurn,
    fingerprints: { page: pageFingerprint, inventory: inventoryFingerprint },
    provenance: {
      surface: 'bricks_floating_panel',
      sourceMessageId: messageId,
      sourceMessageMode: mode === 'plan' ? 'plan' : 'chat',
      sourceMessageRole: 'user',
      sourceMessageSource: 'live_v2',
      extractedBy: 'bridge',
    },
  };
}

export function buildResolvedCodePatchModelResult(request) {
  const fact = objectValue(request?.resolvedWorkingMemoryFact || request?.resolved_working_memory_fact);
  const target = objectValue(fact.target);
  const intent = objectValue(fact.intent);
  if (firstString(fact.kind) !== 'code_update' || firstString(intent.kind) !== 'code_update') return null;
  return buildStructuredCodePatchModelResult({
    action: 'code_update',
    targetId: firstString(target.elementId),
    fieldKey: firstString(intent.fieldKey, target.fieldKey),
    source: typeof intent.source === 'string' ? intent.source : '',
    attributeBinding: intent.attributeBinding,
    answer: 'I updated the selected Code element source.',
    mutationTitle: 'Update Code element',
    changeSummary: 'Applied the exact source from the grounded plan.',
    confidence: 'high',
    reason: 'Resolved one exact v2 Code element working-memory fact against the current live selection.',
  }, request);
}

export function buildStructuredConditionPatchModelResult(modelResult, request) {
  const mode = firstString(request?.mode).toLowerCase();
  if (mode !== 'design') return null;
  const result = objectValue(modelResult);
  const action = firstString(result.action).toLowerCase().replace(/[\s-]+/g, '_');
  if (!['condition', 'condition_patch'].includes(action)) return null;
  const inventory = buildBricksAgentMutationInventory(request);
  const requestedTargets = Array.isArray(result.targets)
    ? result.targets
    : Array.isArray(result.conditionsByTarget)
      ? result.conditionsByTarget
      : [result];
  if (requestedTargets.length === 0 || requestedTargets.length > 64) return null;
  const patches = [];
  const labels = [];
  const seen = new Set();
  const allowedOperators = new Set(['==', '!=', '>=', '<=', '>', '<', 'contains', 'contains_not', 'empty', 'empty_not']);
  for (const rawTarget of requestedTargets) {
    const row = objectValue(rawTarget);
    const conditionInput = objectValue(row.condition || result.condition);
    const targetId = firstString(row.targetId, row.target_id, row.elementId, row.element_id, conditionInput.targetId, conditionInput.target_id, result.targetId, result.target_id);
    if (!targetId || seen.has(targetId)) return null;
    const requestedGroups = Array.isArray(row.conditionGroups)
      ? row.conditionGroups
      : Array.isArray(row.condition_groups)
        ? row.condition_groups
        : Array.isArray(row.conditions)
          ? [row.conditions]
          : Array.isArray(result.conditionGroups)
            ? result.conditionGroups
            : Array.isArray(result.condition_groups)
              ? result.condition_groups
              : Array.isArray(result.conditions)
                ? [result.conditions]
                : Object.keys(conditionInput).length > 0
                  ? [[conditionInput]]
                  : [];
    if (requestedGroups.length === 0 || requestedGroups.length > 8) return null;
    const canonicalGroups = [];
    for (const requestedGroup of requestedGroups) {
      if (!Array.isArray(requestedGroup) || requestedGroup.length === 0 || requestedGroup.length > 8) return null;
      const canonicalGroup = [];
      for (const rawCondition of requestedGroup) {
        const condition = objectValue(rawCondition);
        const key = firstString(condition.key).toLowerCase();
        const compare = firstString(condition.operator, condition.compare).toLowerCase();
        const dynamicDataTag = firstString(condition.dynamicDataTag, condition.dynamic_data_tag, condition.dynamic_data);
        if (!key || !allowedOperators.has(compare)) return null;
        if (key === 'dynamic_data' && !dynamicDataTag) return null;
        if (key !== 'dynamic_data' && dynamicDataTag) return null;
        const hasValue = Object.prototype.hasOwnProperty.call(condition, 'value');
        const value = safeValue(condition.value);
        if (!['empty', 'empty_not'].includes(compare) && (!hasValue || value === '' || value === null)) return null;
        canonicalGroup.push({
          key,
          compare,
          ...(key === 'dynamic_data' ? { dynamic_data: dynamicDataTag } : {}),
          ...(!['empty', 'empty_not'].includes(compare) ? { value } : {}),
        });
      }
      canonicalGroups.push(canonicalGroup);
    }
    const candidates = inventory.optionTargets.filter((target) => target.elementId === targetId && target.fieldKey === '_conditions');
    if (candidates.length !== 1) return null;
    const target = candidates[0];
    const replaceExisting = row.replaceExisting === true || row.replace_existing === true
      || result.replaceExisting === true || result.replace_existing === true;
    if (!isModelLedBricksSession(request) && !conditionTargetIsEmpty(target) && !replaceExisting) return null;
    // The Design session is already authorized and the model owns whether a
    // complete native condition value replaces or extends the current value.
    // Do not turn an existing condition group into a second confirmation gate;
    // Bricks receives the model's canonical replacement and can reject it with
    // a repair packet if the native schema requires a different shape.
    const normalizedGroups = normalizeElementConditions(canonicalGroups, targetId, request);
    if (!normalizedGroups) return null;
    const targetLabel = target.targetLabel || targetId;
    labels.push(targetLabel);
    seen.add(targetId);
    const changeSummary = directConditionGroupsSummary(canonicalGroups);
    patches.push({ elementId: targetId, fieldKey: '_conditions', value: normalizedGroups, targetLabel, changeSummary });
  }
  const targetLabel = labels.length === 1 ? labels[0] : `${labels.length} Bricks targets`;
  const changeSummary = labels.length === 1 ? patches[0].changeSummary : `Applied visibility conditions to ${targetLabel}.`;
  return {
    action: 'patch',
    mutationType: 'element_condition_update',
    targetLabel,
    answer: firstString(result.answer, `I applied the requested visibility conditions to ${targetLabel}.`),
    mutationTitle: firstString(result.mutationTitle, result.mutation_title, `Update ${targetLabel} conditions`),
    changeSummary: firstString(result.changeSummary, result.change_summary, changeSummary),
    confidence: firstString(result.confidence, 'high'),
    reason: firstString(result.reason, `Validated bounded OR-of-AND condition expressions against ${targetLabel}.`),
    patches,
  };
}
function buildNestedStructuredCodeProposalFact(modelFact, request) {
  const proposed = objectValue(modelFact);
  const modelTurn = objectValue(proposed.currentTurn || proposed.current_turn);
  const modelTarget = objectValue(modelTurn.target);
  const modelIntent = objectValue(modelTurn.intent);
  const modelKind = firstString(modelIntent.kind).toLowerCase();
  const kindToField = {
    code_javascript: 'javascriptCode',
    javascript: 'javascriptCode',
    code_css: 'cssCode',
    css: 'cssCode',
    code_html_php: 'code',
    html_php: 'code',
    php_html: 'code',
  };
  const inferredField = kindToField[modelKind] || '';
  const fieldKey = firstString(modelIntent.fieldKey, modelTarget.fieldKey, inferredField);
  const source = firstString(modelIntent.source, modelIntent.value);
  const bricksContext = objectValue(request?.bricksContext || request?.bricks_context);
  const selectedId = firstString(bricksContext.selectedId, request?.elementId, request?.element_id);
  const intentElementId = firstString(modelIntent.elementId);
  const targetElementId = firstString(modelTarget.elementId);
  if (
    !inferredField
    || fieldKey !== inferredField
    || !selectedId
    || (!intentElementId && !targetElementId)
    || (intentElementId && intentElementId !== selectedId)
    || (targetElementId && targetElementId !== selectedId)
    || !source
  ) return null;
  return buildProposedCodeUpdateFactForSource(request, {
    fieldKey,
    source,
    attributeBinding: modelIntent.attributeBinding || modelIntent.attribute_binding,
  });
}

export function validateAgentProposedWorkingMemoryFact(modelFact, request) {
  const proposed = objectValue(modelFact);
  if (Object.keys(proposed).length === 0) return null;
  if (firstString(proposed.kind)) return proposed;
  return buildNestedStructuredCodeProposalFact(proposed, request);
}

function directConditionSummary(condition) {
  if (condition.key === 'user_logged_in') return condition.value === '1'
    ? 'Show the selected element only to logged-in visitors.'
    : 'Show the selected element only to logged-out visitors.';
  if (condition.key === 'current_url') return `Show the selected element when the current URL contains ${condition.value}.`;
  if (condition.key === 'weekday') {
    const weekday = {
      1: 'Mondays',
      2: 'Tuesdays',
      3: 'Wednesdays',
      4: 'Thursdays',
      5: 'Fridays',
      6: 'Saturdays',
      7: 'Sundays',
    }[String(condition.value)] || `weekday ${condition.value}`;
    return `Show the selected element only on ${weekday}.`;
  }
  if (condition.key === 'date') return `Show the selected element on or after ${condition.value}.`;
  return `Show the selected element when ${condition.dynamic_data} ${condition.compare} ${condition.value}.`;
}

function directConditionGroupsSummary(groups) {
  const describe = (condition) => {
    if (condition.key === 'weekday') {
      const weekday = {
        1: 'Monday',
        2: 'Tuesday',
        3: 'Wednesday',
        4: 'Thursday',
        5: 'Friday',
        6: 'Saturday',
        7: 'Sunday',
      }[String(condition.value)];
      if (weekday && condition.compare === '==') return `weekday is ${weekday}`;
    }
    if (condition.key === 'operating_system' && condition.compare === '==') {
      return `operating system is ${condition.value}`;
    }
    if (condition.key === 'browser' && condition.compare === '==') {
      return `browser is ${condition.value}`;
    }
    if (condition.key === 'dynamic_data') {
      return `${condition.dynamic_data} ${condition.compare}${Object.prototype.hasOwnProperty.call(condition, 'value') ? ` ${condition.value}` : ''}`;
    }
    return `${condition.key} ${condition.compare}${Object.prototype.hasOwnProperty.call(condition, 'value') ? ` ${condition.value}` : ''}`;
  };
  return `Show the selected element when ${groups
    .map((group) => `(${group.map(describe).join(' and ')})`)
    .join(' or ')}.`;
}

export function hasStructuredQueryLoopIntentPayload(modelResult) {
  const result = objectValue(modelResult);
  const requestedTargets = Array.isArray(result.targets)
    ? result.targets
    : (Array.isArray(result.loops) ? result.loops : []);
  return requestedTargets.some((target) => {
    const row = objectValue(target);
    return Boolean(firstString(row.targetId, row.target_id, row.elementId, row.element_id))
      && Object.keys(objectValue(row.query)).length > 0;
  });
}

/**
 * Convert one model-chosen, schema-bounded Query Loop intent into the two
 * native Bricks fields. Inventory membership is capability evidence: an
 * inactive `hasLoop: false` value is writable state, not incompatibility.
 */
export function buildStructuredQueryLoopPatchModelResult(modelResult, request) {
  const mode = firstString(request?.mode).toLowerCase();
  if (mode !== 'design') return null;
  const result = objectValue(modelResult);
  const action = firstString(result.action).toLowerCase().replace(/[\s-]+/g, '_');
  if (!['query_loop', 'query_loop_update'].includes(action)) return null;
  const inventory = buildBricksAgentMutationInventory(request);
  let requestedTargets = Array.isArray(result.targets)
    ? result.targets
    : Array.isArray(result.loops)
      ? result.loops
      : [result];
  if (requestedTargets.length === 0 || requestedTargets.length > 64) return null;
  const patches = [];
  const labels = [];
  const seen = new Set();
  for (const rawTarget of requestedTargets) {
    const row = objectValue(rawTarget);
    const targetId = firstString(row.targetId, row.target_id, row.elementId, row.element_id, result.targetId, result.target_id);
    const queryInput = objectValue(row.query || result.query);
    if (!targetId || Object.keys(queryInput).length === 0 || seen.has(targetId)) return null;
    const targets = inventory.optionTargets.filter((target) => (
      target.elementId === targetId && target.targetKind === 'query_loop' && ['hasLoop', 'query'].includes(target.fieldKey)
    ));
    if (targets.length !== 2 || new Set(targets.map((target) => target.fieldKey)).size !== 2) return null;
    const normalizedQuery = normalizeBricksQueryLoopValue(queryInput, request);
    if (!normalizedQuery || Object.keys(normalizedQuery).length === 0) return null;
    const hasLoopTarget = targets.find((target) => target.fieldKey === 'hasLoop');
    const queryTarget = targets.find((target) => target.fieldKey === 'query');
    let currentQuery = {};
    try {
      currentQuery = objectValue(JSON.parse(firstString(queryTarget?.valuePreview, '{}')));
    } catch {
      currentQuery = {};
    }
    const hasActiveQuery = firstString(hasLoopTarget?.valuePreview).toLowerCase() === 'true' || Object.keys(currentQuery).length > 0;
    const replaceExisting = row.replaceExisting === true || row.replace_existing === true || result.replaceExisting === true || result.replace_existing === true;
    const targetLabel = targets[0].targetLabel || targetId;
    // A Design session is already authorized. Native Bricks remains the schema
    // authority, so an active loop is live state rather than a second consent
    // gate and can be repaired if Bricks rejects the replacement.
    if (hasActiveQuery && !replaceExisting && !isModelLedBricksSession(request)) {
      return {
        action: 'answer',
        answer: `${targetLabel} already has an active query loop. Would you like me to replace it with the requested query?`,
        confidence: 'high',
        reason: 'The current session is not authorized for replacing an active query loop.',
      };
    }
    const changeSummary = firstString(row.changeSummary, row.change_summary, result.changeSummary, result.change_summary, `Configure the native ${firstString(normalizedQuery.objectType)} query on ${targetLabel}.`);
    labels.push(targetLabel);
    seen.add(targetId);
    patches.push(
      { elementId: targetId, fieldKey: 'hasLoop', value: true, targetLabel, changeSummary: 'Enable Query Loop.' },
      { elementId: targetId, fieldKey: 'query', value: normalizedQuery, targetLabel, changeSummary },
    );
  }
  const targetLabel = labels.length === 1 ? labels[0] : `${labels.length} Query Loop targets`;
  const changeSummary = firstString(result.changeSummary, result.change_summary, `Configured ${targetLabel}.`);
  return {
    action: 'patch',
    mutationType: 'query_loop_update',
    targetLabel,
    answer: firstString(result.answer, `I configured ${targetLabel} as the requested Bricks query loop.`),
    mutationTitle: firstString(result.mutationTitle, result.mutation_title, `Configure ${targetLabel} query loop`),
    changeSummary,
    confidence: firstString(result.confidence, 'high'),
    reason: firstString(result.reason, `Validated ${labels.length} model-selected live Query Loop target${labels.length === 1 ? '' : 's'} and bounded native query schemas.`),
    patches,
  };
}

function nativePatchesFromCapabilityResult(result) {
  return (Array.isArray(result?.patches) ? result.patches : []).map((patch) => {
    const item = objectValue(patch);
    const id = firstString(item.elementId, item.element_id, item.id);
    const fieldKey = firstString(item.fieldKey, item.field_key, item.key);
    const rawSettings = item.settings && typeof item.settings === 'object' && !Array.isArray(item.settings)
      ? item.settings
      : {};
    const settings = Object.keys(rawSettings).length > 0
      ? rawSettings
      : (fieldKey && Object.prototype.hasOwnProperty.call(item, 'value') ? { [fieldKey]: item.value } : {});
    if (!id || Object.keys(settings).length === 0) return null;
    return {
      id,
      settings,
      ...(['name', 'label', 'parent', 'children'].reduce((next, key) => {
        if (Object.prototype.hasOwnProperty.call(item, key)) next[key] = item[key];
        return next;
      }, {})),
    };
  }).filter(Boolean);
}

function modelLedCodeSettingsAreAllowed(settings, request) {
  const entries = Object.entries(objectValue(settings)).filter(([key]) => (
    ['code', 'javascriptCode', 'cssCode'].includes(key)
  ));
  if (entries.length === 0) return true;

  const runtimeKnowledge = objectValue(objectValue(request?.mcpRuntimeContext || request?.mcp_runtime_context).knowledge);
  const codeSchema = objectValue(runtimeKnowledge.codeElementSchema || runtimeKnowledge.code_element_schema);
  const capabilities = objectValue(codeSchema.capabilities);
  if (capabilities.canExecuteCode !== true || capabilities.canReadSensitiveCode !== true) return false;

  for (const [key, rawSource] of entries) {
    if (key === 'code' && capabilities.nativeSavePipeline !== true) return false;
    const source = normalizedCodeSource(rawSource);
    if (!source) return false;
    if (key !== 'code' && /<\?(?:php|=)?/i.test(source)) return false;
    if (key === 'javascriptCode' && /<\s*\/?\s*script\b/i.test(source)) return false;
    if (key === 'cssCode' && /<\s*\/?\s*style\b/i.test(source)) return false;
    if (key === 'code' && /<\s*\/?\s*script\b/i.test(source)) return false;
  }
  return true;
}

/**
 * Preserve a model-led typed capability inside a compound transaction when a
 * newer/native control is not yet represented by Pixflow's convenience
 * normalizer. The operation remains inside the authorized post/area envelope
 * while Bricks remains responsible for accepting, normalizing, or rejecting
 * target ids and native settings. Rejected targets become repair packets
 * instead of disappearing during normalization.
 */
function modelLedNativePatchesFromTypedOperation(input, request, availableElementIds = null) {
  if (!isModelLedBricksSession(request)) return [];
  const rawAction = firstString(input.action, input.operation).toLowerCase().replace(/[\s-]+/g, '_');
  const action = rawAction === 'media_update' ? 'patch' : rawAction;
  const typedActions = new Set([
    'condition', 'condition_patch', 'condition_update', 'query_loop', 'query_loop_update', 'query_loop_configure',
    'dynamic_data', 'dynamic_data_update', 'code_update', 'interaction_update', 'form_update',
    'media_update', 'icon_update', 'link_update', 'layout_settings_update',
    'button_text_update', 'text_update', 'style_update', 'settings_update',
    'attribute_update', 'element_update',
    // Native skills may use a generic verb for the same settings patch. Keep
    // those child operations inside a compound transaction instead of
    // emitting an unsupported operation that would lose its target context.
    'update', 'edit', 'configure', 'configuration', 'style', 'settings',
    'mutation', 'native_mutation', 'native_update', 'bricks_mutation', 'bricks_update',
  ]);
  if (!typedActions.has(action)) return [];
  // Native MCP/skill implementations sometimes return their already-shaped
  // `patches` array instead of the convenience `{targets|updates}` form. Keep
  // that payload intact for the same model-led repair path. In particular,
  // do not collapse a form/interaction/media action to one target or silently
  // drop a second patch on the same element.
  const rawPatches = Array.isArray(input.patches) ? input.patches : [];
  if (rawPatches.length > 0) {
    if (rawPatches.length > 100) return [];
    const nativePatches = [];
    for (const rawPatch of rawPatches) {
      const patch = objectValue(rawPatch);
      const id = firstString(patch.id, patch.elementId, patch.element_id);
      const settings = patch.settings && typeof patch.settings === 'object' && !Array.isArray(patch.settings)
        ? patch.settings
        : null;
      const structural = ['name', 'label', 'parent', 'children'].reduce((next, key) => {
        if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
        return next;
      }, {});
      if (!id) {
        // Keep a malformed target in the native envelope. The controlled
        // boundary will report the missing id as a repairable Bricks error;
        // dropping it here would make the compound decision look complete.
        nativePatches.push({
          id: '',
          settings: settings || {},
          targetLabel: firstString(patch.targetLabel, patch.target_label),
          changeSummary: firstString(patch.changeSummary, patch.change_summary),
        });
        continue;
      }
      if (action === 'code_update' && !modelLedCodeSettingsAreAllowed(settings || {}, request)) return [];
      nativePatches.push({
        id,
        settings: settings || {},
        ...structural,
        targetLabel: firstString(patch.targetLabel, patch.target_label, id),
        changeSummary: firstString(patch.changeSummary, patch.change_summary),
      });
    }
    return nativePatches;
  }
  const rows = Array.isArray(input.targets)
    ? input.targets
    : Array.isArray(input.updates)
      ? input.updates
      : [input];
  if (rows.length === 0 || rows.length > 64) return [];
  const patches = [];
  const seen = new Set();
  for (const rawRow of rows) {
    const row = objectValue(rawRow);
    const id = firstString(row.targetId, row.target_id, row.elementId, row.element_id, input.targetId, input.target_id);
    if (!id) {
      const malformedSettings = row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)
        ? row.settings
        : {};
      patches.push({
        id: '',
        settings: malformedSettings,
        targetLabel: firstString(row.targetLabel, row.target_label, input.targetLabel, input.target_label),
        changeSummary: firstString(row.changeSummary, row.change_summary, input.changeSummary, input.change_summary),
      });
      continue;
    }
    let fieldKey = firstString(row.fieldKey, row.field_key, input.fieldKey, input.field_key);
    let value;
    if (['condition', 'condition_patch', 'condition_update'].includes(action)) {
      fieldKey = '_conditions';
      value = row.conditionGroups || row.condition_groups || row.conditions
        || input.conditionGroups || input.condition_groups || input.conditions;
    } else if (['query_loop', 'query_loop_update', 'query_loop_configure'].includes(action)) {
      fieldKey = 'query';
      value = row.query || input.query;
    } else if (action === 'code_update') {
      fieldKey = fieldKey || 'javascriptCode';
      value = row.source ?? row.replacementSource ?? row.value ?? input.source ?? input.replacementSource ?? input.value;
    } else if (['dynamic_data', 'dynamic_data_update'].includes(action)) {
      fieldKey = fieldKey || 'text';
      value = row.settings || row.value || row.expression || input.value || input.expression;
    } else {
      value = row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)
        ? row.settings
        : row.value !== undefined ? row.value : input.value;
    }
    const nativeSettings = row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)
      ? row.settings
      : null;
    // Form, interaction, media, and icon skills commonly return a complete
    // native settings object without a synthetic field key. That is a valid
    // model-led decision; Bricks should validate the object rather than the
    // bridge rejecting it as an unknown single-field action.
    // Preserve an otherwise live-targeted malformed row as an empty native
    // patch. The WordPress boundary can then return a repair packet instead
    // of the planner silently dropping one requested mutation from a batch.
    if ((!fieldKey && !nativeSettings) || (value === undefined && !nativeSettings)) {
      if (!id) return [];
      const malformedKey = `${id}:malformed`;
      if (seen.has(malformedKey)) return [];
      patches.push({
        id,
        settings: {},
        targetLabel: firstString(row.targetLabel, row.target_label, input.targetLabel, input.target_label, id),
        changeSummary: firstString(row.changeSummary, row.change_summary, input.changeSummary, input.change_summary),
      });
      seen.add(malformedKey);
      continue;
    }
    const settings = row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)
      ? row.settings
      : { [fieldKey]: value };
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return [];
    if (!modelLedCodeSettingsAreAllowed(settings, request)) return [];
    const seenKey = `${id}:${fieldKey || Object.keys(settings).sort().join(',')}`;
    if (seen.has(seenKey)) return [];
    patches.push({
      id,
      settings,
      targetLabel: firstString(row.targetLabel, row.target_label, input.targetLabel, input.target_label, id),
      changeSummary: firstString(row.changeSummary, row.change_summary, input.changeSummary, input.change_summary),
    });
    seen.add(seenKey);
    if (['query_loop', 'query_loop_update', 'query_loop_configure'].includes(action)) {
      patches.push({
        id,
        settings: { hasLoop: true },
        targetLabel: firstString(row.targetLabel, row.target_label, input.targetLabel, input.target_label, id),
        changeSummary: 'Enable Query Loop.',
      });
    }
  }
  return patches;
}

function normalizeCompoundElement(value, budget = { remaining: 500 }, depth = 0) {
  if (budget.remaining <= 0 || depth > 24) return null;
  const element = objectValue(value);
  const name = firstString(element.name, element.type, element.elementType, element.element_type).toLowerCase();
  const settings = element.settings && typeof element.settings === 'object' && !Array.isArray(element.settings)
    ? element.settings
    : {};
  if (!name || !/^[a-z][a-z0-9_-]*$/.test(name)) return null;
  budget.remaining -= 1;
  const normalized = {
    ...element,
    name,
    settings,
  };

  const id = firstString(element.id);
  const parent = firstString(element.parent);
  if (id) normalized.id = id;
  else delete normalized.id;
  if (parent) normalized.parent = parent;
  else delete normalized.parent;

  if (Array.isArray(element.children)) {
    normalized.children = element.children.flatMap((child) => {
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        const nested = normalizeCompoundElement(child, budget, depth + 1);
        return nested ? [nested] : [];
      }
      const childId = firstString(child);
      return childId ? [childId] : [];
    });
  } else {
    delete normalized.children;
  }

  return normalized;
}

// Keep a malformed model-led element visible to the native boundary.  The
// bridge may preserve only a bounded JSON object here; Bricks (and the repair
// packet it returns) remains responsible for deciding whether the element is
// a valid native subtree.  Returning an empty object for a non-object value is
// intentional: it produces a precise native shape error instead of silently
// dropping an operation from an otherwise atomic transaction.
function preserveCompoundElement(value, budget = { remaining: 500 }, depth = 0) {
  if (budget.remaining <= 0 || depth > 24) return {};
  const element = objectValue(value);
  const settings = element.settings && typeof element.settings === 'object' && !Array.isArray(element.settings)
    ? element.settings
    : {};
  budget.remaining -= 1;
  const preserved = {
    ...element,
    ...(firstString(element.name, element.type, element.elementType, element.element_type)
      ? { name: firstString(element.name, element.type, element.elementType, element.element_type).toLowerCase() }
      : {}),
    settings,
  };

  const id = firstString(element.id);
  const parent = firstString(element.parent);
  if (id) preserved.id = id;
  else delete preserved.id;
  if (parent) preserved.parent = parent;
  else delete preserved.parent;

  if (Array.isArray(element.children)) {
    preserved.children = element.children.flatMap((child) => {
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        return [preserveCompoundElement(child, budget, depth + 1)];
      }
      const childId = firstString(child);
      return childId ? [childId] : [];
    });
  } else {
    delete preserved.children;
  }

  return preserved;
}

/**
 * Normalize one operation in a model-led compound Design mutation. Typed
 * capability actions are converted to the same native operation envelope as
 * raw patches, so the agent can mix targets and action types without losing
 * the skill-specific schema work.
 */
function normalizeCompoundOperation(value, request, index, availableElementIds = null) {
  const input = objectValue(value);
  const action = firstString(input.action, input.operation).toLowerCase().replace(/[\s-]+/g, '_');
  const opId = firstString(input.opId, input.op_id, input.id, `op-${index + 1}`).slice(0, 80);
  const skillMetadata = operationSkillMetadata(input);
  const skillIds = skillMetadata.skillIds;
  const nativeSkillIds = skillMetadata.nativeSkillIds;
  const nativeAbilityRoutes = skillMetadata.nativeAbilityRoutes;
  const mediaContext = generatedMediaMetadata(input.mediaGeneration || input.mediaGenerations || input.media_generation);
  const skillContext = {
    ...(skillIds.length > 0 ? { skillIds } : {}),
    ...(nativeSkillIds.length > 0 ? { nativeSkillIds } : {}),
    ...(nativeAbilityRoutes.length > 0 ? { nativeAbilityRoutes } : {}),
  };

  const typed = buildStructuredCodePatchModelResult(input, request)
    || buildStructuredConditionPatchModelResult(input, request)
    || buildStructuredQueryLoopPatchModelResult(input, request)
    || buildStructuredDynamicDataPatchModelResult(input, request)
    || buildStructuredLinkPatchModelResult(input, request);
  if (typed) {
    const patches = nativePatchesFromCapabilityResult(typed);
    if (patches.length === 0) return null;
    return {
      opId,
      operation: 'patch',
      patches,
      merge: input.merge !== false,
      mutationType: firstString(typed.mutationType, typed.mutation_type, action, 'bricks_settings_patch'),
      targetLabel: firstString(input.targetLabel, input.target_label, typed.targetLabel, typed.target_label),
      changeSummary: firstString(input.changeSummary, input.change_summary, typed.changeSummary, typed.change_summary),
      ...mediaContext,
      ...skillContext,
    };
  }

  const nativeCapabilityPatches = modelLedNativePatchesFromTypedOperation(input, request, availableElementIds);
  if (nativeCapabilityPatches.length > 0) {
    return {
      opId,
      operation: 'patch',
      patches: nativeCapabilityPatches.map((patch) => ({
        id: firstString(patch.id),
        settings: patch.settings,
      })),
      merge: input.merge !== false,
      mutationType: firstString(input.mutationType, input.mutation_type, action, 'bricks_settings_patch'),
      targetLabel: firstString(input.targetLabel, input.target_label, nativeCapabilityPatches[0].targetLabel),
      changeSummary: firstString(input.changeSummary, input.change_summary),
      ...mediaContext,
      ...skillContext,
    };
  }

  if (action === 'replace') {
    const replacements = Array.isArray(input.replacements)
      ? input.replacements
      : (firstString(input.elementId, input.element_id, input.targetId, input.target_id)
        ? [input]
        : []);
    const patches = replacements.map((replacement) => {
      const row = objectValue(replacement);
      const id = firstString(row.elementId, row.element_id, row.id, row.targetId, row.target_id);
      const fieldKey = firstString(row.fieldKey, row.field_key, row.key, 'text');
      const value = row.replacementText ?? row.replacement_text ?? row.text ?? row.value;
      return id && fieldKey && value !== undefined && value !== null
        ? { id, settings: { [fieldKey]: String(value) } }
        : null;
    }).filter(Boolean);
    return patches.length > 0
      ? { opId, operation: 'patch', patches, merge: true, mutationType: 'text_replacement', ...mediaContext, ...skillContext }
      : null;
  }

  if (action === 'patch' || action === 'mutate') {
    const normalized = normalizeBricksAgentMutationPlan({ ...input, patches: input.patches || input.mutations }, request);
    if (normalized.patches.length === 0) {
      if (isModelLedBricksSession(request)) {
        return {
          opId,
          operation: 'patch',
          patches: Array.isArray(input.patches)
            ? input.patches.slice(0, 100).map((patch) => objectValue(patch))
            : Array.isArray(input.mutations)
              ? input.mutations.slice(0, 100).map((patch) => objectValue(patch))
              : [],
          merge: input.merge !== false,
          mutationType: firstString(input.mutationType, input.mutation_type, 'bricks_settings_patch'),
          targetLabel: firstString(input.targetLabel, input.target_label),
          changeSummary: firstString(input.changeSummary, input.change_summary),
          ...mediaContext,
          ...skillContext,
        };
      }
      return null;
    }
    return {
      opId,
      operation: 'patch',
      patches: normalized.patches.map((patch) => ({
        id: firstString(patch.id),
        settings: patch.settings,
        ...(['name', 'label', 'parent', 'children'].reduce((next, key) => {
          if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
          return next;
        }, {})),
      })),
      merge: input.merge !== false,
      mutationType: firstString(input.mutationType, input.mutation_type, normalized.mutationType),
      targetLabel: firstString(input.targetLabel, input.target_label, normalized.targetLabel),
      changeSummary: firstString(input.changeSummary, input.change_summary, normalized.changeSummary),
      ...mediaContext,
      ...skillContext,
    };
  }

  if (action === 'insert') {
    const rawElements = Array.isArray(input.elements)
      ? input.elements
      : Object.keys(objectValue(input.element)).length > 0
        ? [input.element]
        : [];
    const normalizationBudget = { remaining: 500 };
    const elements = rawElements.map((element) => normalizeCompoundElement(element, normalizationBudget)).filter(Boolean);
    const position = objectValue(input.position);
    if (elements.length === rawElements.length && elements.length > 0) {
      return { opId, operation: 'insert', elements, position: { mode: firstString(position.mode, position.type, 'append'), targetId: firstString(position.targetId, position.target_id) }, ...(input.merge === false ? { merge: false } : {}), ...mediaContext, ...skillContext };
    }
    if (isModelLedBricksSession(request)) {
      const preservationBudget = { remaining: 500 };
      return {
        opId,
        operation: 'insert',
        elements: rawElements.slice(0, 500).map((element) => preserveCompoundElement(element, preservationBudget)),
        position: { mode: firstString(position.mode, position.type, 'append'), targetId: firstString(position.targetId, position.target_id) },
        ...(input.merge === false ? { merge: false } : {}),
        ...mediaContext,
        ...skillContext,
      };
    }
    return null;
  }

  if (action === 'set') {
    const rawElements = Array.isArray(input.elements) ? input.elements : [];
    const normalizationBudget = { remaining: 500 };
    const elements = rawElements.map((element) => normalizeCompoundElement(element, normalizationBudget)).filter(Boolean);
    if (elements.length === rawElements.length && elements.length > 0) {
      return { opId, operation: 'set', elements, ...mediaContext, ...skillContext };
    }
    if (isModelLedBricksSession(request)) {
      const preservationBudget = { remaining: 500 };
      return {
        opId,
        operation: 'set',
        elements: rawElements.slice(0, 500).map((element) => preserveCompoundElement(element, preservationBudget)),
        ...mediaContext,
        ...skillContext,
      };
    }
    return null;
  }

  // A page clear is not an empty set. The model must make this explicit so a
  // failed or malformed replacement can never erase a document by accident.
  if (action === 'clear') {
    if (input.clear !== true) return null;
    return {
      opId,
      operation: 'clear',
      clear: true,
      mutationType: firstString(input.mutationType, input.mutation_type, 'bricks_content_clear'),
      targetLabel: firstString(input.targetLabel, input.target_label, 'Current Bricks page'),
      changeSummary: firstString(input.changeSummary, input.change_summary, 'Remove all Bricks content from the active page.'),
      ...skillContext,
    };
  }

  if (['reorder', 'reorder_elements', 'move'].includes(action)) {
    let orderedIds = (Array.isArray(input.orderedIds || input.ordered_ids) ? input.orderedIds || input.ordered_ids : [])
      .map((id) => firstString(id).trim()).filter(Boolean).slice(0, 200);
    const destination = objectValue(input.destination);
    const position = objectValue(
      input.position
      || input.placement
      || destination.position
      || destination.placement,
    );
    let parentId = firstString(
      input.parentId,
      input.parent_id,
      destination.parentId,
      destination.parent_id,
      position.parentId,
      position.parent_id,
    );
    let reparent = input.reparent === true || action === 'move';
    const explicitMovingId = firstString(input.elementId, input.element_id);
    // Agents may express one moved element through a single-item orderedIds
    // list and carry the destination entirely in position. Treat that as the
    // moving subject so the executor receives the complete destination sibling
    // order instead of a one-item reorder that can be rejected or become a no-op.
    const orderedMovingId = orderedIds.length === 1 ? orderedIds[0] : '';
    const movingId = firstString(explicitMovingId, input.targetId, input.target_id, orderedMovingId);
    const anchorId = firstString(
      position.targetId,
      position.target_id,
      explicitMovingId ? input.targetId : '',
      explicitMovingId ? input.target_id : '',
      input.anchorId,
      input.anchor_id,
    );
    const positionMode = firstString(position.mode, position.type, input.mode).toLowerCase();

    if (movingId && anchorId && ['before', 'after'].includes(positionMode)) {
      const liveElements = liveBricksElements(request);
      const byId = new Map(liveElements
        .map((element) => [firstString(element?.id, element?.elementId), element])
        .filter(([id]) => Boolean(id)));
      const moving = byId.get(movingId);
      const anchor = byId.get(anchorId);
      if (moving && anchor) {
        parentId = firstString(parentId, anchor.parent, anchor.parentId, anchor.parent_id);
        const parent = parentId ? byId.get(parentId) : null;
        const declaredChildren = Array.isArray(parent?.children)
          ? parent.children.map((id) => firstString(id)).filter(Boolean)
          : [];
        const destinationSiblings = declaredChildren.length > 0
          ? declaredChildren
          : liveElements
            .filter((element) => firstString(element?.parent, element?.parentId, element?.parent_id) === parentId)
            .map((element) => firstString(element?.id, element?.elementId))
            .filter(Boolean);
        const withoutMoving = destinationSiblings.filter((id) => id !== movingId);
        const anchorIndex = withoutMoving.indexOf(anchorId);
        if (anchorIndex >= 0) {
          const insertionIndex = positionMode === 'before' ? anchorIndex : anchorIndex + 1;
          withoutMoving.splice(insertionIndex, 0, movingId);
          orderedIds = withoutMoving.slice(0, 200);
          reparent = reparent || firstString(moving.parent, moving.parentId, moving.parent_id) !== parentId;
        }
      }
    }
    if (orderedIds.length > 0) {
      return {
        opId,
        operation: 'reorder',
        orderedIds,
        parentId,
        ...(reparent ? { reparent: true } : {}),
        ...mediaContext,
        ...skillContext,
      };
    }
    if (isModelLedBricksSession(request)) {
      return {
        opId,
        operation: 'reorder',
        orderedIds: [],
        parentId,
        ...mediaContext,
        ...skillContext,
      };
    }
    return null;
  }

  if (isModelLedBricksSession(request)) {
    // Preserve a malformed/novel native operation for the Bricks boundary.
    // Dropping it here would make a compound request look successful while
    // silently losing one of the user's requested mutations. The WordPress
    // compound executor is the repair authority for unsupported kinds,
    // missing ids, malformed subtrees, and native setting shapes.
    const preserved = {
      ...input,
      ...skillContext,
      opId,
      operation: action || firstString(input.operation, input.action),
    };
    Object.assign(preserved, mediaContext);
    for (const [key, limit] of [['elements', 500], ['patches', 100], ['orderedIds', 200]]) {
      if (Array.isArray(preserved[key])) preserved[key] = preserved[key].slice(0, limit);
    }
    if (Array.isArray(preserved.actions)) preserved.actions = preserved.actions.slice(0, 64);
    return preserved;
  }

  return null;
}

function simulateCompoundReorderElements(elements, operation) {
  if (operation?.operation !== 'reorder') return elements;
  const orderedIds = (Array.isArray(operation.orderedIds) ? operation.orderedIds : [])
    .map((id) => firstString(id)).filter(Boolean);
  if (orderedIds.length === 0) return elements;

  const next = elements.map((element) => ({
    ...element,
    ...(Array.isArray(element?.children) ? { children: element.children.map((id) => firstString(id)).filter(Boolean) } : {}),
  }));
  const byId = new Map(next
    .map((element) => [firstString(element?.id, element?.elementId), element])
    .filter(([id]) => Boolean(id)));
  const parentId = firstString(operation.parentId, operation.parent_id);

  if (operation.reparent === true) {
    for (const id of orderedIds) {
      const element = byId.get(id);
      if (!element) continue;
      const previousParentId = firstString(element.parent, element.parentId, element.parent_id);
      const previousParent = byId.get(previousParentId);
      if (previousParent && Array.isArray(previousParent.children)) {
        previousParent.children = previousParent.children.filter((childId) => childId !== id);
      }
      element.parent = parentId || 0;
    }
  }

  const destinationParent = byId.get(parentId);
  if (destinationParent && Array.isArray(destinationParent.children)) {
    const ordered = new Set(orderedIds);
    destinationParent.children = orderedIds.concat(
      destinationParent.children.filter((id) => !ordered.has(id)),
    );
  }
  return next;
}

/**
 * Combine independently schema-validated capability actions into one atomic
 * Bricks transaction. Operations may target different elements and may mix
 * patch, insert, set, and reorder actions; the native boundary persists the
 * composed tree once and reports failed operation ids for repair.
 */
export function buildStructuredCompoundPatchModelResult(modelResult, request) {
  const mode = firstString(request?.mode).toLowerCase();
  if (mode !== 'design') return null;
  const result = objectValue(modelResult);
  const action = firstString(result.action).toLowerCase().replace(/[\s-]+/g, '_');
  if (!['compound', 'compound_patch', 'multi_action', 'compound_mutation'].includes(action)) return null;
  const operations = Array.isArray(result.operations)
    ? result.operations
    : Array.isArray(result.actions)
      ? result.actions
      : [];
  if (operations.length < 1 || operations.length > 64) return null;

  let simulatedElements = liveBricksElements(request);
  const availableElementIds = new Set(simulatedElements
    .map((element) => firstString(element?.id, element?.elementId))
    .filter(Boolean));
  const normalizedOperations = operations.map((operation, index) => {
    const requestContext = objectValue(request?.bricksContext || request?.bricks_context);
    const simulatedContext = { ...requestContext, elements: simulatedElements };
    const normalized = normalizeCompoundOperation(operation, {
      ...request,
      bricksContext: simulatedContext,
      bricks_context: simulatedContext,
    }, index, availableElementIds);
    if (normalized?.operation === 'insert' || normalized?.operation === 'set') {
      for (const element of normalized.elements || []) {
        const id = firstString(element?.id);
        if (id) availableElementIds.add(id);
      }
    }
    simulatedElements = simulateCompoundReorderElements(simulatedElements, normalized);
    return normalized;
  });
  if (normalizedOperations.some((operation) => !operation)) return null;
  // Preserve the historical `compound_patch` response shape for legacy
  // typed-condition/query callers. The new model-led `compound_mutation`
  // envelope remains atomic and carries the full operation list, including
  // insert/set/reorder operations. Keeping this compatibility branch avoids
  // breaking older handoff consumers without reintroducing a single-target
  // limit for the authorized Design path.
  if (action === 'compound_patch' && !isModelLedBricksSession(request)
    && normalizedOperations.every((operation) => operation.operation === 'patch' && Array.isArray(operation.patches))) {
    const patches = normalizedOperations.flatMap((operation) => (operation.patches || []).flatMap((patch) => {
      const id = firstString(patch.id, patch.elementId);
      const settings = objectValue(patch.settings);
      return Object.entries(settings).map(([fieldKey, value]) => ({
        elementId: id,
        fieldKey,
        value,
        targetLabel: firstString(patch.targetLabel, id),
        changeSummary: firstString(patch.changeSummary),
      }));
    }));
    if (patches.length > 0) {
      const labels = normalizedOperations.map((operation) => firstString(operation.targetLabel)).filter(Boolean);
      return {
        action: 'patch',
        mutationType: 'compound_settings_update',
        targetLabel: firstString(result.targetLabel, result.target_label, labels.join(', '), 'Bricks elements'),
        answer: firstString(result.answer, 'I applied the requested Bricks changes.'),
        mutationTitle: firstString(result.mutationTitle, result.mutation_title, 'Update Bricks elements'),
        changeSummary: firstString(result.changeSummary, result.change_summary, 'Applied the requested Bricks changes atomically.'),
        confidence: firstString(result.confidence, 'high'),
        reason: firstString(result.reason, 'Validated the typed Bricks changes as one settings transaction.'),
        patches,
      };
    }
  }
  const targetIds = new Set();
  normalizedOperations.forEach((operation) => {
    (operation.patches || []).forEach((patch) => targetIds.add(firstString(patch.id)));
    (operation.elements || []).forEach((element) => { if (firstString(element.id)) targetIds.add(firstString(element.id)); });
    (operation.orderedIds || []).forEach((id) => targetIds.add(firstString(id)));
  });
  const summaries = normalizedOperations.map((operation) => firstString(operation.changeSummary, operation.mutationType)).filter(Boolean);
  const mediaGenerations = [
    ...normalizedGeneratedMediaRequests(result.mediaGeneration || result.mediaGenerations || result.media_generation),
    ...normalizedOperations.flatMap((operation) => normalizedGeneratedMediaRequests(operation.mediaGenerations || operation.mediaGeneration)),
  ].filter((entry, index, list) => list.findIndex((candidate) => candidate.token === entry.token) === index).slice(0, 8);
  const targetLabel = firstString(result.targetLabel, result.target_label, [...targetIds][0], 'the requested Bricks elements');
  const operationSkillIds = normalizedOperations.flatMap((operation) => operation.skillIds || []);
  const operationNativeSkillIds = normalizedOperations.flatMap((operation) => operation.nativeSkillIds || []);
  const operationNativeAbilityRoutes = normalizedOperations.flatMap((operation) => operation.nativeAbilityRoutes || []);
  return {
    action: 'compound_mutation',
    mutationType: 'compound_bricks_mutation',
    targetLabel,
    operationCount: normalizedOperations.length,
    targetIds: [...targetIds].filter(Boolean).slice(0, 200),
    operations: normalizedOperations,
    ...(mediaGenerations.length > 0 ? { mediaGenerations } : {}),
    skillIds: uniqueStrings(result.skillIds, result.skill_ids, operationSkillIds),
    nativeSkillIds: uniqueStrings(result.nativeSkillIds, result.native_skill_ids, operationNativeSkillIds),
    nativeAbilityRoutes: uniqueStrings(result.nativeAbilityRoutes, result.native_ability_routes, operationNativeAbilityRoutes),
    answer: firstString(result.answer, `I applied ${normalizedOperations.length} requested Bricks changes.`),
    mutationTitle: firstString(result.mutationTitle, result.mutation_title, `Update ${targetLabel}`),
    changeSummary: firstString(result.changeSummary, result.change_summary, summaries.join(' ')),
    confidence: firstString(result.confidence, 'high'),
    reason: firstString(result.reason, 'Validated every requested operation against the live Bricks context.'),
  };
}

export function normalizeBricksAgentMutationPlan(modelResult, request) {
  const result = objectValue(modelResult);
  const inventory = buildBricksAgentMutationInventory(request);
  const modelLed = isModelLedBricksSession(request);
  const rawPatches = Array.isArray(result.patches)
    ? result.patches
    : Array.isArray(result.mutations)
      ? result.mutations
      : [];
  const patches = [];
  for (const item of rawPatches.slice(0, modelLed ? 100 : 12)) {
    const normalized = normalizeMutationPatch(item, inventory, request);
    if (normalized) {
      patches.push(normalized);
      continue;
    }
    if (!modelLed) continue;

    // Do not discard a structurally malformed model-led patch before Bricks
    // can report the native error. Preserve only the bounded transport shape;
    // code capability checks remain hard security boundaries even on this
    // repair path.
    const raw = objectValue(item);
    const rawFieldKey = firstString(raw.fieldKey, raw.field_key, raw.key);
    const rawHasValue = Object.prototype.hasOwnProperty.call(raw, 'value')
      || Object.prototype.hasOwnProperty.call(raw, 'replacementText')
      || Object.prototype.hasOwnProperty.call(raw, 'replacement_text');
    const rawValue = Object.prototype.hasOwnProperty.call(raw, 'value')
      ? raw.value
      : Object.prototype.hasOwnProperty.call(raw, 'replacementText')
        ? raw.replacementText
        : raw.replacement_text;
    const rawChanges = raw.changes && typeof raw.changes === 'object' && !Array.isArray(raw.changes)
      ? raw.changes
      : {};
    const rawSettings = raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings)
      ? raw.settings
      : rawFieldKey && rawHasValue
        ? { [rawFieldKey]: safeValue(rawValue) }
        : Object.keys(rawChanges).length > 0
          ? rawChanges
          : {};
    if (!modelLedCodeSettingsAreAllowed(rawSettings, request)) continue;
    const rawStructural = ['name', 'label', 'parent', 'children'].reduce((next, key) => {
      if (Object.prototype.hasOwnProperty.call(raw, key)) next[key] = raw[key];
      return next;
    }, {});
    patches.push({
      id: firstString(raw.id, raw.elementId, raw.element_id),
      settings: rawSettings,
      ...rawStructural,
      fieldKey: rawFieldKey,
      targetLabel: firstString(raw.targetLabel, raw.target_label),
      changeSummary: firstString(raw.changeSummary, raw.change_summary),
    });
  }

  return {
    patches,
    ...generatedMediaMetadata(result.mediaGeneration || result.mediaGenerations || result.media_generation),
    mutationType: firstString(result.mutationType, result.mutation_type, inferMutationType(patches), 'bricks_settings_patch'),
    targetLabel: firstString(result.targetLabel, result.target_label, patches[0]?.targetLabel, 'Bricks page'),
    changeSummary: firstString(result.changeSummary, result.change_summary, result.reason, summarizePatches(patches)),
  };
}

function normalizeMutationPatch(item, inventory, request) {
  const record = objectValue(item);
  const id = firstString(record.elementId, record.element_id, record.id);
  const fieldKey = firstString(record.fieldKey, record.field_key, record.key);
  const modelLed = isModelLedBricksSession(request);
  const rawSettings = record.settings && typeof record.settings === 'object' && !Array.isArray(record.settings)
    ? record.settings
    : null;
  const rawChanges = record.changes && typeof record.changes === 'object' && !Array.isArray(record.changes)
    ? record.changes
    : {};
  const hasStructuralChange = ['name', 'label', 'parent', 'children'].some((key) => (
    Object.prototype.hasOwnProperty.call(record, key) || Object.prototype.hasOwnProperty.call(rawChanges, key)
  ));
  const hasValue = Object.prototype.hasOwnProperty.call(record, 'value')
    || Object.prototype.hasOwnProperty.call(record, 'replacementText')
    || Object.prototype.hasOwnProperty.call(record, 'replacement_text');
  const hasSettings = Boolean(rawSettings && Object.keys(rawSettings).length > 0);
  if (!id || (!fieldKey && !(modelLed && (hasSettings || hasStructuralChange))) || (!hasValue && !hasSettings && !hasStructuralChange)) return null;

  const target = fieldKey ? inventory.index.get(`${id}:${fieldKey}`) : null;
  // In an already-authorized Design session the live inventory is context,
  // not a semantic preflight gate. A target can disappear between the model
  // turn and the write (or be a native control Pixflow has not catalogued
  // yet). Preserve that decision so Bricks can reject/normalize it and return
  // the exact repair packet instead of silently dropping the patch here.
  if (!target && !modelLed) return null;

  const value = Object.prototype.hasOwnProperty.call(record, 'value')
    ? record.value
    : Object.prototype.hasOwnProperty.call(record, 'replacementText')
      ? record.replacementText
      : record.replacement_text;
  const modelLedSettings = modelLed
    ? (!hasValue && !hasSettings && hasStructuralChange
      ? {}
      : modelLedRawSettingsPatch(
        id,
        fieldKey,
        rawSettings || value,
        request,
        target,
        Boolean(rawSettings),
      ))
    : null;
  // Model-led Design has already crossed the authenticated session boundary.
  // Let native Bricks decide whether a live setting is supported and return a
  // repair packet if not; only legacy/non-model routes use Pixflow's narrower
  // deterministic normalizer before the native call.
  const settings = !modelLed && target
    ? normalizeSettingsPatch(id, fieldKey, safeValue(value), request, target)
    : null;
  const resolvedSettings = modelLedSettings || settings;
  if (!resolvedSettings) return null;

  const structuralChanges = ['name', 'label', 'parent', 'children'].reduce((next, key) => {
    if (Object.prototype.hasOwnProperty.call(record, key)) next[key] = record[key];
    else if (Object.prototype.hasOwnProperty.call(rawChanges, key)) next[key] = rawChanges[key];
    return next;
  }, {});
  return {
    id,
    settings: resolvedSettings,
    targetLabel: firstString(record.targetLabel, record.target_label, target?.targetLabel, id),
    fieldKey,
    targetKind: firstString(target?.targetKind, 'option'),
    changeSummary: firstString(record.changeSummary, record.change_summary),
    ...(modelLed ? structuralChanges : {}),
  };
}

function dynamicDataExpressionFromPatchValue(value) {
  if (typeof value === 'string' && /[{}]/.test(value)) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return firstString(parsed.useDynamicData, parsed.dynamicData, parsed.dynamic_data);
      }
    } catch {
      return value;
    }
    return '';
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return firstString(value.useDynamicData, value.dynamicData, value.dynamic_data);
  }
  return '';
}

function normalizeSettingsPatch(elementId, fieldKey, value, request, target = {}) {
  if (fieldKey === 'code' || fieldKey === 'javascriptCode' || fieldKey === 'cssCode') {
    const expectedKind = fieldKey === 'javascriptCode'
      ? 'code_javascript'
      : fieldKey === 'cssCode'
        ? 'code_css'
        : 'code_html_php';
    const source = normalizedCodeSource(value);
    if (target.targetKind !== expectedKind || !source) return null;
    const runtimeKnowledge = objectValue(objectValue(request?.mcpRuntimeContext || request?.mcp_runtime_context).knowledge);
    const capabilities = objectValue(objectValue(runtimeKnowledge.codeElementSchema || runtimeKnowledge.code_element_schema).capabilities);
    if (capabilities.canExecuteCode !== true || capabilities.canReadSensitiveCode !== true) return null;
    if (fieldKey === 'code' && capabilities.nativeSavePipeline !== true) return null;
    if (fieldKey !== 'code' && /<\?(?:php|=)?/i.test(source)) return null;
    if (fieldKey === 'javascriptCode' && /<\s*\/?\s*script\b/i.test(source)) return null;
    if (fieldKey === 'cssCode' && /<\s*\/?\s*style\b/i.test(source)) return null;
    if (fieldKey === 'code' && /<\s*\/?\s*script\b/i.test(source)) return null;
    return { [fieldKey]: source };
  }
  const dynamicExpression = dynamicDataExpressionFromPatchValue(value);
  if (dynamicExpression) {
    const rules = collectRuntimeDynamicDataRules(request);
    const baseTag = dynamicDataExpressionBase(dynamicExpression);
    if (!validateDynamicDataExpression(dynamicExpression, rules, { requireRuntimeAvailability: true })) return null;
    if (!dynamicDataPlacementIsSafe(target, dynamicExpression, rules)) return null;
    if (dynamicDataExpressionUsesModifier(dynamicExpression, baseTag) && !rules.previews.has(dynamicExpression)) return null;
    if (target.targetKind === 'media' && fieldKey === 'image') {
      const media = objectValue(value);
      return {
        image: {
          useDynamicData: dynamicExpression,
          ...(firstString(media.size) ? { size: firstString(media.size) } : {}),
        },
      };
    }
  }
  if (fieldKey === '_conditions') {
    const conditions = normalizeElementConditions(value, elementId, request);
    return conditions ? { _conditions: conditions } : null;
  }
  if (fieldKey === '_interactions') {
    const interactions = normalizeBricksInteractions(value, elementId);
    return interactions ? { _interactions: interactions } : null;
  }
  if (fieldKey === '_attributes') {
    const attributes = normalizeBricksDataAttributes(value);
    return attributes ? { _attributes: attributes } : null;
  }
  if (fieldKey === 'link') {
    const link = normalizeBricksLinkValue(value);
    if (!link) return null;
    if (dynamicExpression) {
      return {
        link: {
          type: 'meta',
          useDynamicData: dynamicExpression,
          ...(typeof link.newTab === 'boolean' ? { newTab: link.newTab } : {}),
          ...(firstString(link.rel) ? { rel: firstString(link.rel) } : {}),
          ...(firstString(link.ariaLabel) ? { ariaLabel: firstString(link.ariaLabel) } : {}),
        },
      };
    }
    return { link };
  }
  if (fieldKey === 'hasLoop') {
    return typeof value === 'boolean' ? { hasLoop: value } : null;
  }
  if (fieldKey === 'query') {
    const query = normalizeBricksQueryLoopValue(value, request);
    return query ? { query } : null;
  }
  const settings = { [fieldKey]: value };
  if (['_direction', '_flexDirection', '_alignItems', '_justifyContent', '_flexWrap'].includes(fieldKey)) {
    settings._display = 'flex';
  }
  if (fieldKey === '_gridTemplateColumns') {
    settings._display = 'grid';
  }
  return settings;
}

const BRICKS_INTERACTION_TRIGGERS = new Set([
  'click', 'mouseover', 'focus', 'blur', 'mouseenter', 'mouseleave',
  'enterView', 'leaveView', 'animationEnd', 'ajaxStart', 'ajaxEnd',
  'filterSubmitStart', 'filterSubmitEnd', 'formSubmit', 'formSuccess',
  'formError', 'scroll', 'contentLoaded', 'mouseleaveWindow',
  'filterOptionEmpty', 'filterOptionNotEmpty', 'wooAddedToCart',
  'wooAddingToCart', 'wooRemovedFromCart', 'wooUpdateCart',
  'wooCouponApplied', 'wooCouponRemoved',
]);
const BRICKS_INTERACTION_ACTIONS = new Set([
  'show', 'hide', 'click', 'setAttribute', 'removeAttribute',
  'toggleAttribute', 'toggleOffCanvas', 'loadMore', 'loadMoreGallery',
  'startAnimation', 'scrollTo', 'javascript', 'openAddress',
  'closeAddress', 'clearForm', 'storageAdd', 'storageRemove',
  'storageCount',
]);
const BRICKS_INTERACTION_TARGETED_ACTIONS = new Set([
  'show', 'hide', 'click', 'setAttribute', 'removeAttribute',
  'toggleAttribute', 'startAnimation', 'scrollTo', 'javascript',
]);
const BRICKS_INTERACTION_KEYS = new Set([
  'id', 'trigger', 'disablePreventDefault', 'rootMargin', 'ajaxQueryId',
  'filterElementId', 'formId', 'delay', 'scrollOffset', 'animationId',
  'action', 'storageType', 'actionAttributeKey', 'actionAttributeValue',
  'loadMoreQuery', 'loadMoreTargetSelector', 'animationType',
  'animationDuration', 'animationDelay', 'targetFormSelector', 'target',
  'targetSelector', 'offCanvasSelector', 'scrollToOffset', 'scrollToDelay',
  'templateId', 'infoBoxId', 'popupContextType', 'popupContextId',
  'jsFunction', 'jsFunctionArgs', 'runOnce',
]);
const BRICKS_INTERACTION_BOOLEAN_KEYS = new Set([
  'disablePreventDefault', 'runOnce',
]);
const BRICKS_INTERACTION_NUMBER_KEYS = new Set([
  'delay', 'scrollOffset', 'animationDuration', 'animationDelay',
  'scrollToOffset', 'scrollToDelay', 'templateId', 'popupContextId',
]);

/**
 * Keep the bridge validator aligned with Bricks' native `_interactions`
 * replacement schema. The model may choose a live target, but it cannot add
 * unknown row keys, triggers, actions, targets, or omit action-specific fields.
 */
function normalizeBricksInteractions(value, elementId) {
  if (!Array.isArray(value) || value.length > 20) return null;
  const normalized = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = objectValue(value[index]);
    if (Object.keys(row).length === 0 || Object.keys(row).some((key) => !BRICKS_INTERACTION_KEYS.has(key))) {
      return null;
    }
    const trigger = firstString(row.trigger);
    const action = firstString(row.action);
    const requestedTarget = firstString(row.target);
    const target = requestedTarget || 'self';
    if (
      !BRICKS_INTERACTION_TRIGGERS.has(trigger)
      || !BRICKS_INTERACTION_ACTIONS.has(action)
      || !['self', 'custom', 'popup'].includes(target)
    ) return null;

    const next = {
      id: /^[a-z0-9]{6}$/.test(firstString(row.id).toLowerCase())
        ? firstString(row.id).toLowerCase()
        : stableBricksConditionId(`${elementId}:interaction:${index}:${trigger}:${action}`),
      trigger,
      action,
      target,
    };
    for (const [key, raw] of Object.entries(row)) {
      if (['id', 'trigger', 'action', 'target'].includes(key)) continue;
      if (BRICKS_INTERACTION_BOOLEAN_KEYS.has(key)) {
        if (typeof raw !== 'boolean') return null;
        next[key] = raw;
        continue;
      }
      if (BRICKS_INTERACTION_NUMBER_KEYS.has(key)) {
        const number = typeof raw === 'number' ? raw : Number(firstString(raw));
        if (!Number.isFinite(number) || Math.abs(number) > 1_000_000) return null;
        next[key] = number;
        continue;
      }
      const text = firstString(raw).slice(0, 500);
      if (!text || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return null;
      next[key] = text;
    }

    if (BRICKS_INTERACTION_TARGETED_ACTIONS.has(action) && target === 'custom') {
      if (!firstString(next.targetSelector) || /[<>{}\r\n]/.test(firstString(next.targetSelector))) return null;
    }
    if (BRICKS_INTERACTION_TARGETED_ACTIONS.has(action) && target === 'popup') {
      if (!Number.isInteger(next.templateId) || next.templateId <= 0) return null;
    }
    if (['setAttribute', 'removeAttribute', 'toggleAttribute'].includes(action)) {
      const key = firstString(next.actionAttributeKey);
      if (!/^(?:class|hidden|title|aria-[a-z][a-z0-9_.:-]*|data-[a-z][a-z0-9_.:-]*)$/.test(key)) return null;
      if (action !== 'removeAttribute' && !firstString(next.actionAttributeValue)) return null;
    }
    if (['ajaxStart', 'ajaxEnd', 'filterSubmitStart', 'filterSubmitEnd'].includes(trigger) && !firstString(next.ajaxQueryId)) return null;
    if (['filterOptionEmpty', 'filterOptionNotEmpty'].includes(trigger) && !firstString(next.filterElementId)) return null;
    if (['formSubmit', 'formSuccess', 'formError'].includes(trigger) && !firstString(next.formId)) return null;
    if (trigger === 'scroll' && !Number.isFinite(next.scrollOffset)) return null;
    if (action === 'toggleOffCanvas' && !firstString(next.offCanvasSelector)) return null;
    if (action === 'loadMore' && !firstString(next.loadMoreQuery)) return null;
    if (action === 'loadMoreGallery' && !firstString(next.loadMoreTargetSelector)) return null;
    if (action === 'startAnimation' && !/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(firstString(next.animationType))) return null;
    if (action === 'clearForm' && !['formSubmit', 'formSuccess', 'formError'].includes(trigger) && !firstString(next.targetFormSelector)) return null;
    if (action === 'javascript' && !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(firstString(next.jsFunction))) return null;
    if (['openAddress', 'closeAddress'].includes(action) && !firstString(next.infoBoxId)) return null;
    if (['storageAdd', 'storageRemove', 'storageCount'].includes(action)) {
      if (!['windowStorage', 'sessionStorage', 'localStorage'].includes(firstString(next.storageType))) return null;
      if (!firstString(next.actionAttributeKey)) return null;
    }
    normalized.push(next);
  }
  return normalized;
}

function normalizeBricksDataAttributes(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) return null;
  const names = new Set();
  const normalized = [];
  for (let index = 0; index < value.length; index += 1) {
    const attribute = objectValue(value[index]);
    const name = firstString(attribute.name).toLowerCase();
    const attributeValue = firstString(attribute.value);
    const id = firstString(attribute.id) || `pxf${String(index + 1).padStart(3, '0')}`;
    if (
      !/^data-[a-z][a-z0-9_.:-]{0,62}$/.test(name)
      || names.has(name)
      || !/^[A-Za-z0-9_-]{1,40}$/.test(id)
      || attributeValue.length > 500
    ) return null;
    names.add(name);
    normalized.push({ id, name, value: attributeValue });
  }
  return normalized;
}

function normalizeBricksQueryLoopValue(value, request) {
  const query = objectValue(value);
  const globalQueryId = firstString(query.id);
  if (globalQueryId) {
    return Object.keys(query).length === 1 && /^[A-Za-z0-9_-]+$/.test(globalQueryId)
      ? { id: globalQueryId }
      : null;
  }
  const objectType = firstString(query.objectType, query.object_type);
  if (!/^[A-Za-z0-9_-]+$/.test(objectType)) return null;

  const commonKeys = new Set([
    'objectType', 'no_results_text', 'no_results_template',
    'infinite_scroll', 'infinite_scroll_margin', 'infinite_scroll_delay',
  ]);
  const keysByType = {
    post: new Set([
      ...commonKeys, 'post_type', 'posts_per_page', 'offset', 'orderby', 'order',
      'exclude_current_post', 'ignore_sticky_posts', 'post__in', 'post__not_in',
      'tax_query', 'tax_query_not', 'meta_key', 'meta_query_relation', 'meta_query',
    ]),
    term: new Set([
      ...commonKeys, 'taxonomy', 'number', 'offset', 'orderby', 'order', 'parent',
      'include', 'exclude', 'current_post_term', 'show_empty',
    ]),
    user: new Set([
      ...commonKeys, 'role__in', 'role__not_in', 'number', 'offset', 'orderby', 'order',
      'include', 'exclude', 'search', 'meta_key', 'meta_query_relation', 'meta_query',
    ]),
    api: new Set([
      ...commonKeys, 'api_name', 'api_url', 'api_method', 'api_headers', 'api_body_type',
      'api_body_json', 'api_body_params', 'response_path', 'cache_time', 'items_per_page',
    ]),
    array: new Set([
      ...commonKeys, 'arrayEditor', 'items_per_page', 'offset', 'array_conditions',
    ]),
  };
  const runtimeTypes = collectRuntimeQueryObjectTypes(request);
  const isProviderType = runtimeTypes.has(objectType) && !keysByType[objectType];
  const isWooType = /^woo[A-Za-z0-9_-]*$/.test(objectType) && runtimeTypes.has(objectType);
  const allowedKeys = keysByType[objectType]
    || (isProviderType || isWooType
      ? new Set([...commonKeys, 'items_per_page', 'offset', 'array_conditions'])
      : null);
  if (!allowedKeys || Object.keys(query).some((key) => !allowedKeys.has(key))) return null;

  const normalized = { objectType };
  const order = query.order === undefined ? undefined : firstString(query.order).toUpperCase();
  if (order !== undefined && !['ASC', 'DESC'].includes(order)) return null;
  const copyInt = (key, min, max) => {
    if (query[key] === undefined) return true;
    const number = Number(query[key]);
    if (!Number.isInteger(number) || number < min || number > max) return false;
    normalized[key] = number;
    return true;
  };
  const copyBoolean = (key) => {
    if (query[key] === undefined) return true;
    if (typeof query[key] !== 'boolean') return false;
    normalized[key] = query[key];
    return true;
  };
  const copyString = (key, maxLength = 5000) => {
    if (query[key] === undefined) return true;
    if (typeof query[key] !== 'string' || query[key].length > maxLength) return false;
    normalized[key] = query[key];
    return true;
  };
  const copySlugArray = (key) => {
    if (query[key] === undefined) return true;
    if (!Array.isArray(query[key]) || query[key].length > 50 || query[key].some((item) => !/^[A-Za-z0-9_-]+$/.test(firstString(item)))) return false;
    normalized[key] = [...query[key]];
    return true;
  };
  const copyIdArray = (key) => {
    if (query[key] === undefined) return true;
    if (!Array.isArray(query[key]) || query[key].length > 200) return false;
    const ids = query[key].map(Number);
    if (ids.some((id) => !Number.isInteger(id) || id < 1)) return false;
    normalized[key] = ids;
    return true;
  };
  const copyTaxonomyTokens = (key) => {
    if (query[key] === undefined) return true;
    if (!Array.isArray(query[key]) || query[key].length > 200 || query[key].some((item) => !/^[A-Za-z0-9_-]+::\d+$/.test(firstString(item)))) return false;
    normalized[key] = [...query[key]];
    return true;
  };

  if (!copyString('no_results_text', 1000) || !copyInt('no_results_template', 1, 2147483647)) return null;
  if (!copyBoolean('infinite_scroll') || !copyString('infinite_scroll_margin', 40) || !copyInt('infinite_scroll_delay', 0, 60000)) return null;

  if (objectType === 'post') {
    const orderby = firstString(query.orderby);
    const allowedOrderBy = ['none', 'ID', 'author', 'title', 'name', 'type', 'date', 'modified', 'rand', 'comment_count', 'relevance', 'menu_order', 'parent', 'meta_value', 'meta_value_num', 'post__in', '_default'];
    if (!copySlugArray('post_type') || normalized.post_type?.length !== 1) return null;
    if (!copyInt('posts_per_page', 1, 100) || !orderby || !allowedOrderBy.includes(orderby) || !order) return null;
    normalized.orderby = orderby;
    normalized.order = order;
    if (!copyInt('offset', 0, 10000) || !copyBoolean('exclude_current_post') || !copyBoolean('ignore_sticky_posts')) return null;
    if (!copyIdArray('post__in') || !copyIdArray('post__not_in') || !copyTaxonomyTokens('tax_query') || !copyTaxonomyTokens('tax_query_not')) return null;
    if (!copyString('meta_key', 255) || !copyString('meta_query_relation', 3) || (normalized.meta_query_relation && !['AND', 'OR'].includes(normalized.meta_query_relation.toUpperCase()))) return null;
    if (query.meta_query !== undefined) normalized.meta_query = normalizeQueryConditions(query.meta_query);
    if (query.meta_query !== undefined && !normalized.meta_query) return null;
    return normalized;
  }

  if (objectType === 'term') {
    const orderby = firstString(query.orderby);
    if (!copySlugArray('taxonomy') || normalized.taxonomy?.length !== 1) return null;
    if (!copyInt('number', 1, 100) || !['name', 'count', 'term_id', 'slug', 'term_order', 'include'].includes(orderby) || !order) return null;
    normalized.orderby = orderby;
    normalized.order = order;
    if (!copyInt('offset', 0, 10000) || !copyInt('parent', 0, 2147483647)) return null;
    if (!copyIdArray('include') || !copyIdArray('exclude') || !copyBoolean('current_post_term') || !copyBoolean('show_empty')) return null;
    return normalized;
  }

  if (objectType === 'user') {
    const orderby = firstString(query.orderby);
    if (!copyInt('number', 1, 100) || !['registered', 'display_name', 'user_login', 'user_email', 'ID', 'name', 'post_count'].includes(orderby) || !order) return null;
    normalized.orderby = orderby;
    normalized.order = order;
    if (!copySlugArray('role__in') || !copySlugArray('role__not_in') || !copyInt('offset', 0, 10000)) return null;
    if (!copyIdArray('include') || !copyIdArray('exclude') || !copyString('search', 255) || !copyString('meta_key', 255) || !copyString('meta_query_relation', 3)) return null;
    if (query.meta_query !== undefined) normalized.meta_query = normalizeQueryConditions(query.meta_query);
    if (query.meta_query !== undefined && !normalized.meta_query) return null;
    return normalized;
  }

  if (objectType === 'api') {
    if (!copyString('api_name', 255) || !copyString('api_url', 4000) || !/^https?:\/\//i.test(normalized.api_url || '')) return null;
    if (!copyString('api_method', 12) || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes((normalized.api_method || 'GET').toUpperCase())) return null;
    normalized.api_method = (normalized.api_method || 'GET').toUpperCase();
    if (!copyString('api_body_type', 40) || !copyString('api_body_json', 20000) || !copyString('response_path', 1000)) return null;
    if (!copyInt('cache_time', 0, 604800) || !copyInt('items_per_page', 0, 1000)) return null;
    for (const key of ['api_headers', 'api_body_params']) {
      if (query[key] !== undefined) {
        if (!Array.isArray(query[key]) || query[key].length > 100) return null;
        normalized[key] = safeValue(query[key]);
      }
    }
    return normalized;
  }

  if (objectType === 'array') {
    if (!copyString('arrayEditor', 100000) || !copyInt('items_per_page', 0, 1000) || !copyInt('offset', 0, 10000)) return null;
    if (query.array_conditions !== undefined) {
      if (!Array.isArray(query.array_conditions) || query.array_conditions.length > 100) return null;
      normalized.array_conditions = safeValue(query.array_conditions);
    }
    return normalized;
  }

  if (!copyInt('items_per_page', 0, 1000) || !copyInt('offset', 0, 10000)) return null;
  if (query.array_conditions !== undefined) {
    if (!Array.isArray(query.array_conditions) || query.array_conditions.length > 100) return null;
    normalized.array_conditions = safeValue(query.array_conditions);
  }
  return normalized;
}

function normalizeQueryConditions(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return null;
  const allowedCompare = new Set(['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN', 'BETWEEN', 'NOT BETWEEN', 'EXISTS', 'NOT EXISTS']);
  const allowedType = new Set(['CHAR', 'NUMERIC', 'BINARY', 'DATE', 'DATETIME', 'DECIMAL', 'SIGNED', 'TIME', 'UNSIGNED']);
  const result = [];
  for (const item of value) {
    const condition = objectValue(item);
    const key = firstString(condition.key);
    const compare = firstString(condition.compare, '=');
    const type = firstString(condition.type, 'CHAR').toUpperCase();
    if (!key || key.length > 255 || !allowedCompare.has(compare) || !allowedType.has(type)) return null;
    const entry = { key, compare, type };
    if (condition.value !== undefined) entry.value = safeValue(condition.value);
    result.push(entry);
  }
  return result;
}

function collectRuntimeQueryObjectTypes(request) {
  const types = new Set(['post', 'term', 'user', 'api', 'array']);
  const roots = [
    request?.runtimeKnowledge,
    request?.runtime_knowledge,
    request?.bricksKnowledgeSnapshot,
    request?.bricks_knowledge_snapshot,
    request?.mcpRuntimeContext,
    request?.mcp_runtime_context,
    request?.bricksContext?.runtimeKnowledge,
  ];
  const visit = (value, depth = 0) => {
    if (depth > 8 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.slice(0, 500).forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    const record = value;
    const objectType = firstString(record.objectType, record.object_type);
    if (/^[A-Za-z0-9_-]+$/.test(objectType)) types.add(objectType);
    Object.values(record).slice(0, 500).forEach((item) => visit(item, depth + 1));
  };
  roots.forEach((root) => visit(root));
  return types;
}
function normalizeBricksLinkValue(value) {
  let link = value;
  if (typeof link === 'string') {
    try {
      link = JSON.parse(link);
    } catch {
      return null;
    }
  }
  if (!link || typeof link !== 'object' || Array.isArray(link)) return null;

  const normalized = { ...link };
  const type = firstString(normalized.type);
  const url = firstString(normalized.url, normalized.useDynamicData);
  if (!type || !url) return null;
  if (
    typeof normalized.url === 'string'
    && !/^(?:#|\/(?!\/)|https?:\/\/|mailto:|tel:)/i.test(normalized.url)
  ) {
    return null;
  }
  normalized.type = type;
  return normalized;
}

function normalizeElementConditions(value, elementId, request) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) return null;
  const conditionRules = collectRuntimeConditionRules(request);
  const dynamicDataRules = collectRuntimeDynamicDataRules(request);
  const groups = [];
  for (let groupIndex = 0; groupIndex < value.length; groupIndex += 1) {
    const group = value[groupIndex];
    if (!Array.isArray(group) || group.length === 0 || group.length > 8) return null;
    const normalizedGroup = [];
    for (let conditionIndex = 0; conditionIndex < group.length; conditionIndex += 1) {
      const condition = normalizeElementCondition(
        group[conditionIndex],
        elementId,
        groupIndex,
        conditionIndex,
        conditionRules,
        dynamicDataRules,
      );
      if (!condition) return null;
      normalizedGroup.push(condition);
    }
    groups.push(normalizedGroup);
  }
  return groups;
}

const CONDITION_MATH_COMPARES = ['==', '!=', '>=', '<=', '>', '<'];
const CONDITION_IS_COMPARES = ['==', '!='];
const CONDITION_STRING_COMPARES = ['==', '!=', 'contains', 'contains_not'];
const CONDITION_DYNAMIC_COMPARES = [...CONDITION_MATH_COMPARES, 'contains', 'contains_not', 'empty', 'empty_not'];
const BRICKS_ELEMENT_CONDITION_RULES = new Map([
  ['post_id', CONDITION_MATH_COMPARES],
  ['post_title', CONDITION_STRING_COMPARES],
  ['post_parent', CONDITION_MATH_COMPARES],
  ['post_status', CONDITION_IS_COMPARES],
  ['post_author', CONDITION_IS_COMPARES],
  ['post_date', CONDITION_MATH_COMPARES],
  ['featured_image', CONDITION_IS_COMPARES],
  ['user_logged_in', CONDITION_IS_COMPARES],
  ['user_id', CONDITION_MATH_COMPARES],
  ['user_registered', ['<', '>']],
  ['user_role', CONDITION_IS_COMPARES],
  ['weekday', CONDITION_MATH_COMPARES],
  ['date', CONDITION_MATH_COMPARES],
  ['time', CONDITION_MATH_COMPARES],
  ['datetime', CONDITION_MATH_COMPARES],
  ['woo_product_type', CONDITION_IS_COMPARES],
  ['woo_product_sale', CONDITION_IS_COMPARES],
  ['woo_product_new', CONDITION_IS_COMPARES],
  ['woo_product_stock_status', CONDITION_IS_COMPARES],
  ['woo_product_stock_quantity', CONDITION_MATH_COMPARES],
  ['woo_product_stock_management', CONDITION_IS_COMPARES],
  ['woo_product_sold_individually', CONDITION_IS_COMPARES],
  ['woo_product_purchased_by_user', CONDITION_IS_COMPARES],
  ['woo_product_featured', CONDITION_IS_COMPARES],
  ['woo_product_rating', CONDITION_MATH_COMPARES],
  ['woo_product_category', CONDITION_IS_COMPARES],
  ['woo_product_tag', CONDITION_IS_COMPARES],
  ['woo_checkout_needs_shipping_address', CONDITION_IS_COMPARES],
  ['woo_order_has_status', CONDITION_IS_COMPARES],
  ['woo_order_needs_shipping_address', CONDITION_IS_COMPARES],
  ['woo_order_has_downloads', CONDITION_IS_COMPARES],
  ['dynamic_data', CONDITION_DYNAMIC_COMPARES],
  ['browser', CONDITION_IS_COMPARES],
  ['operating_system', CONDITION_IS_COMPARES],
  ['current_url', CONDITION_STRING_COMPARES],
  ['referer', CONDITION_STRING_COMPARES],
]);
const BRICKS_ELEMENT_CONDITION_COMPARES = new Set(CONDITION_DYNAMIC_COMPARES);

function collectRuntimeConditionRules(request) {
  const rules = new Map(Array.from(BRICKS_ELEMENT_CONDITION_RULES, ([key, compares]) => [key, new Set(compares)]));
  const roots = [
    request?.runtimeKnowledge,
    request?.runtime_knowledge,
    request?.bricksKnowledgeSnapshot,
    request?.bricks_knowledge_snapshot,
    request?.mcpRuntimeContext,
    request?.mcp_runtime_context,
    request?.bricksContext?.runtimeKnowledge,
  ];
  const addCondition = (value) => {
    const condition = objectValue(value);
    const key = firstString(condition.key).toLowerCase();
    if (!/^[a-z][a-z0-9_:-]{0,119}$/.test(key)) return;
    const rawOperators = Array.isArray(condition.operators)
      ? condition.operators
      : Array.isArray(condition.compares)
        ? condition.compares
        : Object.keys(objectValue(condition.compare?.options));
    const operators = rawOperators
      .map((operator) => firstString(operator).toLowerCase())
      .map((operator) => operator === 'not_contains' ? 'contains_not' : operator)
      .filter((operator) => BRICKS_ELEMENT_CONDITION_COMPARES.has(operator));
    if (operators.length > 0) rules.set(key, new Set(operators));
  };
  const visitSchema = (value, depth = 0) => {
    if (depth > 6 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.slice(0, 500).forEach((item) => {
        addCondition(item);
        visitSchema(item, depth + 1);
      });
      return;
    }
    if (typeof value !== 'object') return;
    const record = value;
    addCondition(record);
    Object.values(record).slice(0, 500).forEach((item) => visitSchema(item, depth + 1));
  };
  const seekConditionSchema = (value, depth = 0) => {
    if (depth > 8 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.slice(0, 500).forEach((item) => seekConditionSchema(item, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'conditionSchema' || key === 'condition_schema') visitSchema(item);
      else seekConditionSchema(item, depth + 1);
    }
  };
  roots.forEach((root) => seekConditionSchema(root));
  return rules;
}

const BRICKS_NATIVE_DYNAMIC_BASE_TAGS = new Set([
  'post_title', 'post_id', 'post_url', 'post_slug', 'post_type', 'post_date', 'post_modified', 'post_time',
  'post_comments_count', 'post_comments', 'post_content', 'post_excerpt', 'read_more', 'featured_image',
  'featured_image_tag', 'author_id', 'author_name', 'author_bio', 'author_email', 'author_website',
  'author_archive_url', 'author_avatar', 'author_meta', 'site_title', 'site_tagline', 'site_url', 'site_login',
  'site_logout', 'url_parameter', 'archive_title', 'archive_description', 'term_id', 'term_name',
  'term_taxonomy_slug', 'term_slug', 'term_count', 'term_url', 'term_parent', 'term_children',
  'term_description', 'term_meta', 'current_date', 'current_wp_date', 'format_date', 'query_loop_index',
  'query_results_count', 'query_results_count_filter', 'active_filters_count', 'search_term',
  'search_term_filter', 'query_api', 'query_array', 'wp_user_id', 'wp_user_login', 'wp_user_email',
  'wp_user_url', 'wp_user_role', 'wp_user_registered_date', 'wp_user_author_url', 'wp_user_nicename',
  'wp_user_nickname', 'wp_user_description', 'wp_user_first_name', 'wp_user_last_name',
  'wp_user_display_name', 'wp_user_picture', 'wp_user_meta',
]);
const BRICKS_DYNAMIC_PARAMETER_TAGS = new Set(['url_parameter', 'author_meta', 'term_meta', 'wp_user_meta']);
const BRICKS_DYNAMIC_KEY_VALUE_MODIFIERS = new Set([
  'fallback', 'fallback-image', 'sanitize', 'exclude', 'start-at', 'pad', 'key', 'is-array', 'date', 'from', 'to',
]);

function collectRuntimeDynamicDataRules(request) {
  const tags = new Set(BRICKS_NATIVE_DYNAMIC_BASE_TAGS);
  const availableTags = new Set();
  const catalog = new Map();
  const previews = new Set();
  const keyValueModifiers = new Set(BRICKS_DYNAMIC_KEY_VALUE_MODIFIERS);
  const roots = [
    request?.runtimeKnowledge,
    request?.runtime_knowledge,
    request?.bricksKnowledgeSnapshot,
    request?.bricks_knowledge_snapshot,
    request?.mcpRuntimeContext,
    request?.mcp_runtime_context,
    request?.bricksContext?.runtimeKnowledge,
  ];
  const tagIdentity = (value) => {
    if (typeof value !== 'string') return null;
    const expression = value.trim().startsWith('{') ? value.trim() : `{${value.trim()}}`;
    const inner = expression.replace(/^\{/, '').replace(/\}$/, '');
    const match = inner.match(/^([a-zA-Z_][a-zA-Z0-9_.-]*)(?=[:\s@|]|$)/);
    return match ? { baseTag: match[1].toLowerCase(), expression } : null;
  };
  const visitCatalog = (value, depth = 0) => {
    if (depth > 8 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.slice(0, 1000).forEach((item) => visitCatalog(item, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    const record = value;
    const identity = tagIdentity(firstString(record.tag, record.name, record.expression));
    if (identity) {
      tags.add(identity.baseTag);
      const existing = catalog.get(identity.baseTag) || {};
      catalog.set(identity.baseTag, { ...existing, ...record });
      const source = firstString(record.source).toLowerCase();
      if (record.runtimeAvailable === true || record.runtime_available === true || record.runtimeAvailable === undefined || source.includes('bricks_runtime')) {
        if (record.runtimeAvailable !== false && record.runtime_available !== false) availableTags.add(identity.baseTag);
      }
      if (
        Array.isArray(record.unknownTags)
        && record.unknownTags.length === 0
        && Object.prototype.hasOwnProperty.call(record, 'rendered')
      ) previews.add(identity.expression);
    }
    const modifier = firstString(record.modifier, record.key).toLowerCase();
    if (/^[a-z][a-z0-9-]*$/.test(modifier) && (record.purpose || record.description)) {
      keyValueModifiers.add(modifier);
    }
    Object.values(record).slice(0, 1000).forEach((item) => visitCatalog(item, depth + 1));
  };
  const seekCatalog = (value, depth = 0) => {
    if (depth > 10 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.slice(0, 1000).forEach((item) => seekCatalog(item, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if ([
        'dynamicTags', 'dynamic_tags', 'dynamicDataSchema', 'dynamic_data_schema',
        'bricks/list-dynamic-data-tags', 'bricks/preview-dynamic-tag', 'modifierCatalog', 'modifiers',
      ].includes(key)) visitCatalog(item);
      else seekCatalog(item, depth + 1);
    }
  };
  roots.forEach((root) => seekCatalog(root));
  return { tags, availableTags, catalog, previews, keyValueModifiers };
}

function validateDynamicDataExpression(expression, rules, options = {}) {
  if (!/^\{[^{}\r\n]{1,238}\}$/.test(expression)) return false;
  const inner = expression.slice(1, -1).trim();
  const match = inner.match(/^([a-zA-Z_][a-zA-Z0-9_.-]*)(?=[:\s@|]|$)/);
  if (!match) return false;
  const baseTag = match[1].toLowerCase();
  if (!rules.tags.has(baseTag)) return false;
  if (options.requireRuntimeAvailability === true && !rules.availableTags.has(baseTag)) return false;
  if (BRICKS_DYNAMIC_PARAMETER_TAGS.has(baseTag) && !new RegExp(`^${baseTag}:[a-zA-Z0-9_.-]+(?:$|[:\\s@|])`).test(inner)) {
    return false;
  }
  const keyValueMatches = inner.matchAll(/@([a-z][a-z0-9-]*)(?=\s*:|:)/gi);
  for (const modifier of keyValueMatches) {
    if (!rules.keyValueModifiers.has(modifier[1].toLowerCase())) return false;
    if (modifier[1].toLowerCase() === 'is-array') return false;
  }
  return true;
}
function normalizeElementCondition(value, elementId, groupIndex, conditionIndex, conditionRules, dynamicDataRules) {
  const record = objectValue(value);
  const key = firstString(record.key).toLowerCase();
  const requestedCompare = firstString(record.compare, '==').toLowerCase();
  const compare = requestedCompare === 'not_contains' ? 'contains_not' : requestedCompare;
  const allowedFields = key === 'dynamic_data'
    ? new Set(['id', 'key', 'compare', 'value', 'dynamic_data', 'dynamicData'])
    : new Set(['id', 'key', 'compare', 'value']);
  if (Object.keys(record).some((field) => !allowedFields.has(field))) return null;
  const allowedCompares = conditionRules.get(key);
  if (!allowedCompares || !allowedCompares.has(compare)) return null;

  const hasValue = Object.prototype.hasOwnProperty.call(record, 'value');
  if (!hasValue && !['empty', 'empty_not'].includes(compare)) return null;

  let normalizedValue = hasValue ? safeValue(record.value) : undefined;
  if (key === 'user_logged_in') {
    normalizedValue = record.value === true || record.value === 1 ? '1'
      : record.value === false || record.value === 0 ? '0'
        : firstString(record.value);
    if (!['0', '1'].includes(normalizedValue)) return null;
  } else if (key === 'user_role') {
    const roles = (Array.isArray(record.value) ? record.value : [record.value])
      .map((role) => firstString(role).toLowerCase())
      .filter((role, index, all) => /^[a-z0-9_-]{1,80}$/.test(role) && all.indexOf(role) === index)
      .slice(0, 32);
    if (roles.length === 0) return null;
    normalizedValue = roles;
  } else if (key === 'current_url' || key === 'referer') {
    normalizedValue = firstString(record.value).slice(0, 500);
    if (!normalizedValue) return null;
  } else if (key === 'dynamic_data') {
    const dynamicData = firstString(record.dynamic_data, record.dynamicData).slice(0, 240);
    if (!validateDynamicDataExpression(dynamicData, dynamicDataRules)) return null;
    if (hasValue && typeof normalizedValue === 'string') normalizedValue = normalizedValue.slice(0, 500);
    const requestedId = firstString(record.id).toLowerCase();
    const id = /^[a-z0-9]{6}$/.test(requestedId)
      ? requestedId
      : stableBricksConditionId(`${elementId}:${groupIndex}:${conditionIndex}:${key}`);
    return {
      id,
      key,
      compare,
      ...(hasValue ? { value: normalizedValue } : {}),
      dynamic_data: dynamicData,
    };
  } else if (hasValue && typeof normalizedValue === 'string') {
    normalizedValue = normalizedValue.slice(0, 500);
  }

  const requestedId = firstString(record.id).toLowerCase();
  const id = /^[a-z0-9]{6}$/.test(requestedId)
    ? requestedId
    : stableBricksConditionId(`${elementId}:${groupIndex}:${conditionIndex}:${key}`);
  return {
    id,
    key,
    compare,
    ...(hasValue ? { value: normalizedValue } : {}),
  };
}function stableBricksConditionId(seed) {
  let hash = 2166136261;
  for (const char of String(seed || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(6, '0').slice(-6);
}

function inferMutationType(patches) {
  const kinds = new Set((Array.isArray(patches) ? patches : []).map((patch) => patch.targetKind).filter(Boolean));
  if (kinds.has('button_text')) return 'button_text_update';
  if (kinds.has('link')) return 'link_update';
  if (kinds.has('media')) return 'media_update';
  if (kinds.has('icon')) return 'icon_update';
  if (kinds.has('form')) return 'form_update';
  if (kinds.has('conditions')) return 'element_condition_update';
  if (kinds.has('interactions')) return 'interaction_update';
  if (kinds.has('query_loop')) return 'query_loop_update';
  if (kinds.has('layout')) return 'layout_settings_update';
  if (kinds.has('text')) return 'selected_text_rewrite';
  return '';
}

function summarizePatches(patches) {
  if (!Array.isArray(patches) || patches.length === 0) return '';
  if (patches.length === 1) {
    const patch = patches[0];
    return `Update ${patch.targetLabel || patch.id} ${patch.fieldKey || 'setting'}.`;
  }
  return `Update ${patches.length} validated Bricks settings.`;
}
