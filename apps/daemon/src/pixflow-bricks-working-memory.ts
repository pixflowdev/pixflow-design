import {
  PIXFLOW_BRICKS_WORKING_MEMORY_CAPS,
  PIXFLOW_BRICKS_WORKING_MEMORY_SCHEMA,
  PIXFLOW_BRICKS_WORKING_MEMORY_VERSION,
  resolvePixflowBricksWorkingMemoryAuthority,
  type PixflowBricksWorkingMemoryArea,
  type PixflowBricksWorkingMemoryCapability,
  type PixflowBricksWorkingMemoryEnvelope,
  type PixflowBricksWorkingMemoryFact,
  type PixflowBricksWorkingMemoryFactKind,
  type PixflowBricksWorkingMemoryIntent,
  type PixflowBricksWorkingMemoryMessageEvent,
  type PixflowBricksWorkingMemoryRecentMessage,
  type PixflowBricksWorkingMemorySettingValue,
  type PixflowBricksPendingTargetClarification,
  type PixflowBricksWorkingMemoryTarget,
  type PixflowBricksTargetResolution,
  type PixflowBricksConversationInterpretationDecision,
} from '@open-design/contracts';

const AREAS = new Set<PixflowBricksWorkingMemoryArea>(['content', 'header', 'footer', 'popup', 'template']);
const KINDS = new Set<PixflowBricksWorkingMemoryFactKind>([
  'text_replacement', 'settings_patch', 'dynamic_data_binding', 'visibility_condition',
  'query_loop', 'code_update', 'element_insert', 'library_insert', 'section_generation',
]);
const CAPABILITIES = new Set<PixflowBricksWorkingMemoryCapability>([
  'selected_element', 'bricks_settings', 'dynamic_data', 'conditions', 'query_loop',
  'code_element', 'element_insert', 'library_insertion', 'section_generation',
]);
const STATUSES = new Set(['proposed', 'user_confirmed', 'applied', 'reverted']);
const PORTABLE_REBIND_KINDS = new Set<PixflowBricksWorkingMemoryFactKind>([
  'settings_patch', 'dynamic_data_binding', 'visibility_condition', 'query_loop',
]);

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedString(value: unknown, max: number = PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxFactStringChars): string {
  return String(value || '').trim().slice(0, max);
}

const SENSITIVE_TRANSCRIPT_KEYS = new Set([
  'apikey', 'api_key', 'secret', 'secretkey', 'secret_key', 'token', 'accesstoken',
  'access_token', 'password', 'credential', 'credentials',
]);

function compactTranscriptValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return undefined;
  if (typeof value === 'string') return boundedString(value, PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxRecentMessageEventChars);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, 24)
      .map((entry) => compactTranscriptValue(entry, depth + 1))
      .filter((entry) => entry !== undefined);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 32)) {
      if (!key || SENSITIVE_TRANSCRIPT_KEYS.has(key.toLowerCase())) continue;
      const compact = compactTranscriptValue(entry, depth + 1);
      if (compact !== undefined) result[key.slice(0, 120)] = compact;
    }
    return result;
  }
  return undefined;
}

function sanitizeRecentMessageEvents(value: unknown): PixflowBricksWorkingMemoryRecentMessage['events'] {
  if (!Array.isArray(value)) return undefined;
  return value
    .slice(-PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxRecentMessageEvents)
    .map((entry) => {
      const event = objectValue(entry);
      const kind = boundedString(event.kind || event.type, 80);
      if (!kind) return null;
      const compact = compactTranscriptValue({ ...event, kind });
      return compact && typeof compact === 'object' && !Array.isArray(compact)
        ? compact as PixflowBricksWorkingMemoryMessageEvent
        : null;
    })
    .filter((entry): entry is PixflowBricksWorkingMemoryMessageEvent => Boolean(entry));
}

const PIXFLOW_INSERTED_FORM_FIELD_TYPES = new Set([
  'text', 'textarea', 'email', 'tel', 'url', 'number',
  'select', 'checkbox', 'radio', 'file', 'hidden', 'password', 'datepicker',
]);
const PIXFLOW_INSERTED_FORM_FIELD_KEYS = new Set([
  'type', 'label', 'placeholder', 'id', 'required', 'width',
  'name', 'autocomplete', 'options', 'valueLabelOptions', 'value',
]);
const PIXFLOW_INSERTED_FORM_SETTING_KEYS = new Set([
  'fields', 'actions', 'submitButtonText', 'successMessage',
  'showLabels', 'requiredAsterisk',
]);

/**
 * Canonical bounded settings for a newly inserted native Bricks Form.
 *
 * The additive path creates structure only. Post-submit actions stay empty so
 * a model cannot invent a recipient, webhook, integration, role, post action,
 * or other side effect. Those settings can be configured later against the
 * exact live Form element through the normal field-inventory verifier.
 */
export function normalizePixflowInsertedFormSettings(value: unknown): Record<string, unknown> | null {
  const settings = objectValue(value);
  const settingKeys = Object.keys(settings);
  if (
    settingKeys.length === 0
    || settingKeys.some((key) => !PIXFLOW_INSERTED_FORM_SETTING_KEYS.has(key))
    || !Array.isArray(settings.fields)
    || settings.fields.length < 1
    || settings.fields.length > 12
    || !Array.isArray(settings.actions)
    || settings.actions.length !== 0
  ) return null;

  const ids = new Set<string>();
  const fields = settings.fields.map((rawField, index) => {
    const field = objectValue(rawField);
    const fieldKeys = Object.keys(field);
    const type = boundedString(field.type, 24).toLowerCase();
    const label = boundedString(field.label, 160);
    const id = boundedString(field.id, 40) || `pxf${String(index + 1).padStart(3, '0')}`;
    if (
      fieldKeys.length === 0
      || fieldKeys.some((key) => !PIXFLOW_INSERTED_FORM_FIELD_KEYS.has(key))
      || !PIXFLOW_INSERTED_FORM_FIELD_TYPES.has(type)
      || !/^[A-Za-z0-9_-]{1,40}$/u.test(id)
      || ids.has(id)
      || (type !== 'hidden' && !label)
    ) return null;
    ids.add(id);

    const normalized: Record<string, unknown> = { type };
    if (label) normalized.label = label;
    const placeholder = boundedString(field.placeholder, 240);
    if (placeholder) normalized.placeholder = placeholder;
    if (typeof field.required === 'boolean') normalized.required = field.required;
    if (field.width !== undefined) {
      const width = Number(field.width);
      if (!Number.isFinite(width) || width < 0 || width > 100) return null;
      normalized.width = width;
    }
    if (field.name !== undefined) {
      const name = boundedString(field.name, 64);
      if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/u.test(name)) return null;
      normalized.name = name;
    }
    if (field.autocomplete !== undefined) {
      const autocomplete = boundedString(field.autocomplete, 80);
      if (!autocomplete || /[\r\n<>"']/u.test(autocomplete)) return null;
      normalized.autocomplete = autocomplete;
    }
    if (field.options !== undefined) {
      const options = Array.isArray(field.options)
        ? (
            field.options.length >= 1
            && field.options.length <= 50
            && field.options.every((option) => ['string', 'number'].includes(typeof option))
              ? field.options
                  .map((option) => boundedString(option, 120))
                  .filter(Boolean)
                  .join('\n')
                  .slice(0, 2_000)
              : ''
          )
        : boundedString(field.options, 2_000);
      if (!['select', 'checkbox', 'radio'].includes(type) || !options) return null;
      normalized.options = options;
    }
    if (field.valueLabelOptions !== undefined) {
      if (!['select', 'checkbox', 'radio'].includes(type) || typeof field.valueLabelOptions !== 'boolean') return null;
      normalized.valueLabelOptions = field.valueLabelOptions;
    }
    if (field.value !== undefined) {
      const fieldValue = boundedString(field.value, 500);
      if (type !== 'hidden' && !fieldValue) return null;
      normalized.value = fieldValue;
    }
    normalized.id = id;
    return normalized;
  });
  if (fields.some((field) => field === null)) return null;

  const normalized: Record<string, unknown> = { fields };
  for (const key of ['submitButtonText', 'successMessage'] as const) {
    if (settings[key] !== undefined) {
      const text = boundedString(settings[key], key === 'submitButtonText' ? 160 : 500);
      if (!text) return null;
      normalized[key] = text;
    }
  }
  for (const key of ['showLabels', 'requiredAsterisk'] as const) {
    if (settings[key] !== undefined) {
      if (typeof settings[key] !== 'boolean') return null;
      normalized[key] = settings[key];
    }
  }
  normalized.actions = [];
  return normalized;
}

/**
 * Keep schema and patch data out of the floating panel's prose while leaving
 * the typed result fields available to the mutation boundary.
 */
export function sanitizePixflowBricksUserFacingAnswer(value: unknown): string {
  let output = String(value || '').trim();
  output = output
    .replace(/```json\s*[\s\S]*?```/giu, '')
    .replace(/^```(?:text|markdown)?\s*/iu, '')
    .replace(/```$/u, '')
    .trim();

  const containsInternalMutationData = (fragment: string): boolean => (
    /_conditions|workingMemoryFact|(?:page|inventory)Fingerprint|schema\s+v?\d/iu.test(fragment)
    || /^\s*(?:```json\s*)?\{\s*["']?action["']?\s*:\s*["']?(?:code_update|patch|replace|insert|library_insert)/iu.test(fragment)
    || /canonical\s+(?:Bricks\s+)?(?:setting|settings|patch|JSON|schema|value)/iu.test(fragment)
    || /\[\s*\[\s*\{[\s\S]*?\}\s*\]\s*\]/u.test(fragment)
    || /\{\s*["']?(?:key|fieldKey|elementId)["']?\s*:/u.test(fragment)
    || /\(\s*`?["']?\[\]["']?`?\s*\)/u.test(fragment)
  );

  output = output
    .split(/\r?\n/u)
    .map((line) => line
      .split(/(?<=[.!?])\s+/u)
      .filter((sentence) => !containsInternalMutationData(sentence))
      .join(' '))
    .filter((line) => line.trim() && !containsInternalMutationData(line))
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();

  return output.slice(0, 12_000).trim();
}

export function sanitizePixflowBricksReadOnlyAnswer(
  value: unknown,
  mode: 'chat' | 'plan',
): string {
  const answer = sanitizePixflowBricksUserFacingAnswer(value);
  if (!answer) return '';
  const mutationClaim = /(?:^|\n)\s*(?:[-*]\s*)?(?:(?:I|we)(?:'ve|\s+have)?\s+)?(?:renamed|changed|updated|added|removed|set|applied|configured|enabled|disabled|replaced|inserted)\b|(?:^|\n)\s*(?:[-*]\s*)?(?:I|we)(?:'ll|\s+will)\s+(?:rename|change|update|add|remove|set|apply|configure|enable|disable|replace|insert)\b/iu;
  if (!mutationClaim.test(answer)) return answer;
  const label = mode === 'plan' ? 'Plan' : 'Ask';
  const outcome = mode === 'plan' ? 'Planned outcome' : 'Proposed result';
  return `No change was made in ${label} mode.\n\n${outcome}: ${answer}`.slice(0, 12_000).trim();
}

function sanitizeTarget(value: unknown): PixflowBricksWorkingMemoryTarget | null {
  const record = objectValue(value);
  const postId = Number(record.postId || 0);
  const requestedArea = boundedString(record.area, 40) as PixflowBricksWorkingMemoryArea;
  if (!Number.isInteger(postId) || postId <= 0 || !AREAS.has(requestedArea)) return null;
  const elementId = record.elementId === null ? null : boundedString(record.elementId, 160) || null;
  const fieldKey = record.fieldKey === null ? null : boundedString(record.fieldKey, 160) || null;
  return { postId, area: requestedArea, elementId, fieldKey };
}

function scalar(value: unknown): string | number | boolean | null | undefined {
  if (value === null) return null;
  if (typeof value === 'string') return value.slice(0, PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxFactStringChars);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  return undefined;
}

const BLOCKED_SETTING_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_SETTING_VALUE_DEPTH = 7;
const MAX_SETTING_VALUE_KEYS = 40;
const MAX_SETTING_VALUE_ARRAY_ITEMS = 40;

function boundedSettingValue(value: unknown, depth = 0): unknown | undefined {
  if (depth > MAX_SETTING_VALUE_DEPTH) return undefined;
  if (typeof value === 'string' && value.length > PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxFactStringChars) return undefined;
  const scalarValue = scalar(value);
  if (scalarValue !== undefined) return scalarValue;
  if (Array.isArray(value)) {
    if (value.length > MAX_SETTING_VALUE_ARRAY_ITEMS) return undefined;
    const result: unknown[] = [];
    for (const entry of value) {
      const sanitized = boundedSettingValue(entry, depth + 1);
      if (sanitized === undefined) return undefined;
      result.push(sanitized);
    }
    return result;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_SETTING_VALUE_KEYS) return undefined;
    const result: Record<string, unknown> = {};
    for (const [rawKey, rawValue] of entries) {
      const key = rawKey.trim();
      if (!key || key.length > 160 || BLOCKED_SETTING_OBJECT_KEYS.has(key)) return undefined;
      const sanitized = boundedSettingValue(rawValue, depth + 1);
      if (sanitized === undefined) return undefined;
      result[key] = sanitized;
    }
    return result;
  }
  return undefined;
}

function settingValues(value: unknown): PixflowBricksWorkingMemorySettingValue[] {
  if (!Array.isArray(value) || value.length > PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxIntentValues) return [];
  const result: PixflowBricksWorkingMemorySettingValue[] = [];
  for (const entry of value) {
    const item = objectValue(entry);
    const fieldKey = boundedString(item.fieldKey, 160);
    const sanitized = boundedSettingValue(item.value);
    if (!fieldKey || BLOCKED_SETTING_OBJECT_KEYS.has(fieldKey) || sanitized === undefined) return [];
    result.push({ fieldKey, value: sanitized as PixflowBricksWorkingMemorySettingValue['value'] });
  }
  return result;
}

export type PixflowBricksCanonicalPatch = {
  id: string;
  settings: Record<string, unknown>;
};

function normalizePixflowFormWebhooks(value: unknown): Array<Record<string, unknown>> | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) return null;
  const allowedKeys = new Set(['id', 'name', 'url', 'contentType', 'dataTemplate', 'headers']);
  const normalized: Array<Record<string, unknown>> = [];
  for (const entry of value) {
    const webhook = objectValue(entry);
    if (Object.keys(webhook).some((key) => !allowedKeys.has(key))) return null;
    const id = boundedString(webhook.id, 40);
    const name = boundedString(webhook.name, 160);
    const url = boundedString(webhook.url, 2_000);
    const contentType = boundedString(webhook.contentType, 40) || 'json';
    const dataTemplate = boundedString(webhook.dataTemplate, 8_000);
    const headers = boundedString(webhook.headers, 8_000);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || !name || !url || !['json', 'form-data'].includes(contentType)) {
      return null;
    }
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    } catch {
      return null;
    }
    normalized.push({
      id,
      name,
      url,
      contentType,
      ...(Object.prototype.hasOwnProperty.call(webhook, 'dataTemplate') ? { dataTemplate } : {}),
      ...(Object.prototype.hasOwnProperty.call(webhook, 'headers') ? { headers } : {}),
    });
  }
  return normalized;
}

/**
 * Final daemon-side patch boundary. Bridge model output must already be in the
 * canonical `{ id, settings }` shape, and every top-level setting must still
 * exist in the fresh live Builder inventory. Raw `{ elementId, fieldKey,
 * value }` model patches deliberately fail here instead of gaining authority.
 */
export function normalizePixflowBricksCanonicalPatches(
  value: unknown,
  liveTargets: unknown,
): PixflowBricksCanonicalPatch[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) return null;
  const allowedTargets = new Map<string, Record<string, unknown>>();
  for (const entry of Array.isArray(liveTargets) ? liveTargets : []) {
    const target = objectValue(entry);
    const id = boundedString(target.elementId || target.element_id || target.id, 160);
    const fieldKey = boundedString(target.fieldKey || target.field_key || target.key, 160);
    if (id && fieldKey) allowedTargets.set(`${id}:${fieldKey}`, target);
  }
  if (allowedTargets.size === 0) return null;

  const patches: PixflowBricksCanonicalPatch[] = [];
  for (const entry of value) {
    const patch = objectValue(entry);
    const id = boundedString(patch.id, 160);
    const settings = objectValue(patch.settings);
    const keys = Object.keys(settings);
    const declaredFieldKey = boundedString(patch.fieldKey || patch.field_key, 160);
    if (
      !id
      || keys.length === 0
      || keys.length > PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxIntentValues
      || (declaredFieldKey && !keys.includes(declaredFieldKey))
    ) return null;

    const normalizedSettings: Record<string, unknown> = {};
    for (const key of keys) {
      if (
        !key.trim()
        || key.length > 160
        || BLOCKED_SETTING_OBJECT_KEYS.has(key)
        || !allowedTargets.has(`${id}:${key}`)
      ) return null;
      const target = allowedTargets.get(`${id}:${key}`) || {};
      const targetKind = boundedString(target.targetKind || target.target_kind, 80);
      let sanitized = boundedSettingValue(settings[key]);
      if (key === 'actions' && targetKind === 'form') {
        const allowedActions = new Set([
          'custom',
          'email',
          'webhook',
          'redirect',
          'mailchimp',
          'sendgrid',
          'login',
          'registration',
          'lost-password',
          'reset-password',
          'create-post',
          'update-post',
        ]);
        if (
          !Array.isArray(sanitized)
          || sanitized.length > 12
          || sanitized.some((action) => typeof action !== 'string' || !allowedActions.has(action))
        ) return null;
        sanitized = [...new Set(sanitized)];
      } else if (targetKind === 'form_webhooks') {
        const webhooks = normalizePixflowFormWebhooks(sanitized);
        if (!webhooks) return null;
        sanitized = webhooks;
      } else if (targetKind === 'form_email_to') {
        if (sanitized !== 'admin_email' && sanitized !== 'custom') return null;
      } else if (targetKind === 'form_checkbox') {
        if (typeof sanitized !== 'boolean') return null;
      } else if (targetKind === 'form_number') {
        if (
          typeof sanitized !== 'number'
          && !(typeof sanitized === 'string' && /^\d+(?:\.\d+)?$/.test(sanitized))
        ) return null;
      }
      if (sanitized === undefined) return null;
      normalizedSettings[key] = sanitized;
    }
    patches.push({ id, settings: normalizedSettings });
  }

  try {
    if (JSON.stringify(patches).length > PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxStoredBytes) return null;
  } catch {
    return null;
  }
  return patches;
}

/** Text decisions must retain every explicit target; selection is not a fallback authority. */
export function normalizePixflowBricksTextReplacements(
  value: unknown,
  liveTargets: unknown,
): PixflowBricksCanonicalPatch[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) return null;
  const seen = new Set<string>();
  const patches: PixflowBricksCanonicalPatch[] = [];
  for (const entry of value) {
    const row = objectValue(entry);
    const id = boundedString(row.elementId || row.element_id, 160);
    const field = boundedString(row.fieldKey || row.field_key, 160);
    const text = row.replacementText;
    const key = `${id}:${field}`;
    if (!id || !field || seen.has(key) || typeof text !== 'string' || !text.trim()) return null;
    seen.add(key);
    patches.push({ id, settings: { [field]: text } });
  }
  return normalizePixflowBricksCanonicalPatches(patches, liveTargets);
}

function sanitizeIntent(kind: PixflowBricksWorkingMemoryFactKind, value: unknown): PixflowBricksWorkingMemoryIntent | null {
  const intent = objectValue(value);
  if (boundedString(intent.kind, 80) !== kind) return null;
  if (kind === 'text_replacement') {
    const replacement = boundedString(intent.value);
    return replacement ? { kind, value: replacement, ...(intent.previousValue !== undefined ? { previousValue: boundedString(intent.previousValue) } : {}) } : null;
  }
  if (kind === 'settings_patch') {
    const values = settingValues(intent.values);
    return values.length ? { kind, values } : null;
  }
  if (kind === 'dynamic_data_binding') {
    const expression = boundedString(intent.expression, 240);
    const placement = boundedString(intent.placement, 20);
    return expression && ['text', 'link', 'image'].includes(placement)
      ? { kind, expression, placement: placement as 'text' | 'link' | 'image' }
      : null;
  }
  if (kind === 'visibility_condition') {
    const operators = ['==', '!=', '>=', '<=', '>', '<', 'contains', 'contains_not', 'empty', 'empty_not'];
    const sanitizeRow = (raw: unknown) => {
      const row = objectValue(raw);
      const key = boundedString(row.key, 120);
      const operator = boundedString(row.operator || row.compare, 40);
      const valueScalar = scalar(row.value);
      const dynamicDataTag = boundedString(row.dynamicDataTag || row.dynamic_data, 240);
      if (!key || !operators.includes(operator)) return null;
      if (!['empty', 'empty_not'].includes(operator) && valueScalar === undefined) return null;
      if (key === 'dynamic_data' && !dynamicDataTag) return null;
      if (key !== 'dynamic_data' && dynamicDataTag) return null;
      return {
        key,
        operator: operator as never,
        ...(valueScalar !== undefined ? { value: valueScalar } : {}),
        ...(dynamicDataTag ? { dynamicDataTag } : {}),
      };
    };
    if (Array.isArray(intent.groups)) {
      if (intent.groups.length === 0 || intent.groups.length > 8) return null;
      const groups = [];
      for (const rawGroup of intent.groups) {
        if (!Array.isArray(rawGroup) || rawGroup.length === 0 || rawGroup.length > 8) return null;
        const group = rawGroup.map(sanitizeRow);
        if (group.some((row) => row === null)) return null;
        groups.push(group as NonNullable<ReturnType<typeof sanitizeRow>>[]);
      }
      return { kind, groups, replaceExisting: intent.replaceExisting === true };
    }
    const row = sanitizeRow(intent);
    return row ? { kind, ...row } : null;
  }
  if (kind === 'query_loop') {
    const objectType = boundedString(intent.objectType, 20);
    if (!['post', 'term', 'user', 'api', 'array'].includes(objectType)) return null;
    const offset = Number(intent.offset);
    if (objectType === 'api') {
      const apiUrl = boundedString(intent.apiUrl, 4000);
      const apiMethod = boundedString(intent.apiMethod || 'GET', 12).toUpperCase();
      const itemsPerPage = Number(intent.itemsPerPage);
      const cacheTime = Number(intent.cacheTime);
      if (!/^https?:\/\//iu.test(apiUrl) || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(apiMethod)) return null;
      return {
        kind,
        objectType,
        apiUrl,
        apiMethod: apiMethod as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        responsePath: boundedString(intent.responsePath, 1000),
        ...(Number.isFinite(itemsPerPage) && itemsPerPage >= 0 ? { itemsPerPage: Math.min(1000, Math.floor(itemsPerPage)) } : {}),
        ...(Number.isFinite(cacheTime) && cacheTime >= 0 ? { cacheTime: Math.min(604_800, Math.floor(cacheTime)) } : {}),
        ...(Number.isFinite(offset) && offset > 0 ? { offset: Math.min(100_000, Math.floor(offset)) } : {}),
      };
    }
    if (objectType === 'array') {
      const arrayEditor = typeof intent.arrayEditor === 'string'
        ? intent.arrayEditor.slice(0, PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxFactStringChars)
        : '';
      const itemsPerPage = Number(intent.itemsPerPage);
      if (!arrayEditor.trim()) return null;
      return {
        kind,
        objectType,
        arrayEditor,
        ...(Number.isFinite(itemsPerPage) && itemsPerPage >= 0 ? { itemsPerPage: Math.min(1000, Math.floor(itemsPerPage)) } : {}),
        ...(Number.isFinite(offset) && offset > 0 ? { offset: Math.min(100_000, Math.floor(offset)) } : {}),
      };
    }
    const order = boundedString(intent.order, 10);
    const postsPerPage = Number(intent.postsPerPage);
    return {
      kind,
      objectType: objectType as 'post' | 'term' | 'user',
      ...(intent.postType ? { postType: boundedString(intent.postType, 120) } : {}),
      ...(intent.taxonomy ? { taxonomy: boundedString(intent.taxonomy, 120) } : {}),
      ...(Number.isFinite(postsPerPage) && postsPerPage > 0 ? { postsPerPage: Math.min(500, Math.floor(postsPerPage)) } : {}),
      ...(intent.orderBy ? { orderBy: boundedString(intent.orderBy, 120) } : {}),
      ...(['ASC', 'DESC'].includes(order.toUpperCase()) ? { order: order.toUpperCase() as 'ASC' | 'DESC' } : {}),
      ...(Number.isFinite(offset) && offset > 0 ? { offset: Math.min(100_000, Math.floor(offset)) } : {}),
      ...(typeof intent.excludeCurrentPost === 'boolean' ? { excludeCurrentPost: intent.excludeCurrentPost } : {}),
      ...(typeof intent.ignoreStickyPosts === 'boolean' ? { ignoreStickyPosts: intent.ignoreStickyPosts } : {}),
      ...(typeof intent.infiniteScroll === 'boolean' ? { infiniteScroll: intent.infiniteScroll } : {}),
      ...(typeof intent.currentPostTerm === 'boolean' ? { currentPostTerm: intent.currentPostTerm } : {}),
      ...(typeof intent.showEmpty === 'boolean' ? { showEmpty: intent.showEmpty } : {}),
    };
  }
  if (kind === 'code_update') {
    const fieldKey = boundedString(intent.fieldKey, 40);
    const source = typeof intent.source === 'string'
      ? intent.source.slice(0, PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxFactStringChars)
      : '';
    if (!['code', 'javascriptCode', 'cssCode'].includes(fieldKey) || !source.trim() || source.includes('\0')) return null;
    if (fieldKey === 'javascriptCode' && /<\s*\/?\s*script\b/iu.test(source)) return null;
    if (fieldKey === 'cssCode' && /<\s*\/?\s*style\b/iu.test(source)) return null;
    if (fieldKey !== 'code' && /<\?(?:php|=)?/iu.test(source)) return null;
    const attribute = objectValue(intent.attributeBinding);
    const attributeElementId = boundedString(attribute.elementId, 160);
    const attributeName = boundedString(attribute.name, 80).toLowerCase();
    const attributeValue = boundedString(attribute.value, 500);
    const attributeBinding = attributeElementId || attributeName || attributeValue
      ? (
          fieldKey === 'javascriptCode'
          && attributeElementId
          && /^data-[a-z][a-z0-9_.:-]{0,62}$/u.test(attributeName)
            ? { elementId: attributeElementId, name: attributeName, value: attributeValue }
            : null
        )
      : undefined;
    if (attributeBinding === null) return null;
    return {
      kind,
      fieldKey: fieldKey as 'code' | 'javascriptCode' | 'cssCode',
      source,
      ...(attributeBinding ? { attributeBinding } : {}),
    };
  }
  if (kind === 'element_insert') {
    const allowedElementNames = ['text-basic', 'text', 'heading', 'button', 'container', 'block', 'div', 'code', 'form'];
    const validCodeSettings = (settings: PixflowBricksWorkingMemorySettingValue[]) => {
      if (settings.length !== 1) return false;
      const fieldKey = settings[0]?.fieldKey || '';
      const source = typeof settings[0]?.value === 'string' ? settings[0].value : '';
      if (!['code', 'javascriptCode', 'cssCode'].includes(fieldKey) || !source.trim() || source.includes('\0')) return false;
      if (fieldKey === 'javascriptCode' && /<\s*\/?\s*script\b/iu.test(source)) return false;
      if (fieldKey === 'cssCode' && /<\s*\/?\s*style\b/iu.test(source)) return false;
      return fieldKey === 'code' || !/<\?(?:php|=)?/iu.test(source);
    };
    const elementName = boundedString(intent.elementName, 40);
    const position = boundedString(intent.position, 40);
    if (!allowedElementNames.includes(elementName)) return null;
    if (!['before', 'after', 'prepend_to', 'append_to', 'append'].includes(position)) return null;
    const settings = settingValues(intent.settings);
    if (elementName === 'code' && !validCodeSettings(settings)) return null;
    if (elementName === 'form') {
      const formSettings = Object.fromEntries(settings.map((entry) => [entry.fieldKey, entry.value]));
      if (!normalizePixflowInsertedFormSettings(formSettings)) return null;
    }
    const additionalElements = (Array.isArray(intent.additionalElements) ? intent.additionalElements : [])
      .slice(0, 1)
      .map((rawElement) => {
        const element = objectValue(rawElement);
        const additionalElementName = boundedString(element.elementName, 40);
        const additionalSettings = settingValues(element.settings);
        if (!allowedElementNames.includes(additionalElementName) || additionalSettings.length === 0) return null;
        if (additionalElementName === 'code' && !validCodeSettings(additionalSettings)) return null;
        if (additionalElementName === 'form') {
          const formSettings = Object.fromEntries(additionalSettings.map((entry) => [entry.fieldKey, entry.value]));
          if (!normalizePixflowInsertedFormSettings(formSettings)) return null;
        }
        return { elementName: additionalElementName as never, settings: additionalSettings };
      });
    if (additionalElements.some((element) => element === null)) return null;
    const attribute = objectValue(intent.attributeBinding);
    const attributeElementId = boundedString(attribute.elementId, 160);
    const attributeName = boundedString(attribute.name, 80).toLowerCase();
    const attributeValue = boundedString(attribute.value, 500);
    const attributeBinding = attributeElementId || attributeName || attributeValue
      ? (
          attributeElementId
          && /^data-[a-z][a-z0-9_.:-]{0,62}$/u.test(attributeName)
            ? { elementId: attributeElementId, name: attributeName, value: attributeValue }
            : null
        )
      : undefined;
    if (attributeBinding === null) return null;
    return {
      kind,
      elementName: elementName as never,
      position: position as never,
      positionTargetId: boundedString(intent.positionTargetId, 160) || null,
      settings,
      ...(additionalElements.length > 0 ? { additionalElements: additionalElements as never } : {}),
      ...(attributeBinding ? { attributeBinding } : {}),
    };
  }
  if (kind === 'library_insert') {
    const templateId = Number(intent.templateId || 0);
    const position = boundedString(intent.position, 40);
    return templateId > 0 && ['before', 'after', 'prepend_to', 'append_to', 'append'].includes(position)
      ? { kind, templateId, position: position as never, positionTargetId: boundedString(intent.positionTargetId, 160) || null }
      : null;
  }
  if (kind === 'section_generation') {
    const sectionKind = boundedString(intent.sectionKind, 40);
    const position = boundedString(intent.position, 40);
    const sections = ['hero', 'banner', 'cta', 'features', 'pricing', 'testimonials', 'faq', 'footer', 'header', 'navigation', 'content'];
    return sections.includes(sectionKind) && ['before', 'after', 'prepend_to', 'append_to', 'append'].includes(position)
      ? { kind, sectionKind: sectionKind as never, position: position as never, positionTargetId: boundedString(intent.positionTargetId, 160) || null }
      : null;
  }
  return null;
}

export function sanitizePixflowBricksWorkingMemoryFact(value: unknown): PixflowBricksWorkingMemoryFact | null {
  const record = objectValue(value);
  const kind = boundedString(record.kind, 80) as PixflowBricksWorkingMemoryFactKind;
  const capability = boundedString(record.capability, 80) as PixflowBricksWorkingMemoryCapability;
  const target = sanitizeTarget(record.target);
  const intent = KINDS.has(kind) ? sanitizeIntent(kind, record.intent) : null;
  const fingerprints = objectValue(record.fingerprints);
  const provenance = objectValue(record.provenance);
  const status = boundedString(record.status, 40);
  const id = boundedString(record.id, 160);
  const sourceMessageId = boundedString(provenance.sourceMessageId, 160);
  const sourceMessageMode = boundedString(provenance.sourceMessageMode, 20);
  if (!id || !KINDS.has(kind) || !CAPABILITIES.has(capability) || !target || !intent || !STATUSES.has(status)) return null;
  if (!sourceMessageId || !['chat', 'plan', 'design'].includes(sourceMessageMode)) return null;
  const page = boundedString(fingerprints.page, 160);
  const inventory = boundedString(fingerprints.inventory, 160);
  if (!page || !inventory) return null;
  return {
    id,
    kind,
    capability,
    skillIds: (Array.isArray(record.skillIds) ? record.skillIds : []).map((entry) => boundedString(entry, 120)).filter(Boolean).slice(0, PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxSkillIds),
    target,
    intent,
    status: status as never,
    supersedesFactIds: (Array.isArray(record.supersedesFactIds) ? record.supersedesFactIds : []).map((entry) => boundedString(entry, 160)).filter(Boolean).slice(0, PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxSupersessionRefs),
    ...(record.supersededByFactId ? { supersededByFactId: boundedString(record.supersededByFactId, 160) } : {}),
    ...(record.reboundFromFactId ? { reboundFromFactId: boundedString(record.reboundFromFactId, 160) } : {}),
    ...(record.reboundFromSourceMessageId ? { reboundFromSourceMessageId: boundedString(record.reboundFromSourceMessageId, 160) } : {}),
    ...(Number(record.reboundAtTurn || 0) > 0 ? { reboundAtTurn: Math.max(1, Number(record.reboundAtTurn)) } : {}),
    createdTurn: Math.max(1, Number(record.createdTurn || 1)),
    fingerprints: { page, inventory },
    provenance: {
      surface: 'bricks_floating_panel',
      sourceMessageId,
      sourceMessageMode: sourceMessageMode as 'chat' | 'plan' | 'design',
      sourceMessageRole: provenance.sourceMessageRole === 'assistant' ? 'assistant' : 'user',
      sourceMessageSource: ['session_restore_v2', 'device_restore_v2'].includes(String(provenance.sourceMessageSource)) ? provenance.sourceMessageSource as never : 'live_v2',
      extractedBy: ['builder', 'bridge'].includes(String(provenance.extractedBy)) ? provenance.extractedBy as never : 'daemon',
    },
  } as PixflowBricksWorkingMemoryFact;
}

function pixflowBricksMutationTextAfterLeadingSkillRoute(prompt: unknown): string {
  const text = String(prompt || '').trim();
  const slashCommandStripped = text.replace(/^\/[a-z][a-z0-9-]*\s+/iu, '');
  let routedText = slashCommandStripped !== text ? slashCommandStripped : text;
  if (routedText.startsWith('@')) {
    const directMutation = routedText.match(/\b(?:(?:please|kindly)\s+|(?:can|could|would)\s+you\s+)?(?:apply|change|update|set|bind|link|toggle|insert|add|create|write|replace|remove|make|give|show|hide|turn|use|configure|enable|disable)\b/iu);
    if (directMutation?.index !== undefined && directMutation.index <= 240) {
      routedText = routedText.slice(directMutation.index);
    }
  }
  const targetPrefix = routedText.match(
    /^(?:on|for|in)\s+(?:(?:the\s+)?(?:(?:currently|current)\s+)?selected\s+(?:element|section|container|block|heading|text|button|image|icon|form|area|region)(?:\s+[a-z0-9_-]{3,160})?|(?:the\s+)?(?:exact\s+)?bricks\s+id\s+[a-z0-9_-]{3,160})\s*,?\s*(?=(?:(?:please|kindly)\s+|(?:can|could|would)\s+you\s+)?(?:change|update|set|bind|link|toggle|insert|add|create|write|replace|remove|make|give|show|hide|turn|use|configure|enable|disable)\b)/iu,
  );
  return targetPrefix ? routedText.slice(targetPrefix[0].length) : routedText;
}

export function pixflowBricksExplicitTurnAction(prompt: unknown): 'converse' | 'apply' | 'implement' {
  const text = pixflowBricksMutationTextAfterLeadingSkillRoute(prompt).toLowerCase();
  if (/\b(?:implement|execute|carry out|put into practice)\b/u.test(text)) return 'implement';
  if (/\b(?:do|perform)\s+(?:the\s+)?(?:first|second|third|fourth|fifth|last|earlier|previous|prior)\s+(?:thing|one|question|request|plan|change|proposal|binding|condition|edit)\b/u.test(text)) return 'apply';
  if (/\b(?:apply|proceed|go ahead|do it|make (?:that|this|the) change)\b/u.test(text)) return 'apply';
  if (/^(?:(?:please|kindly)\s+|(?:can|could|would)\s+you\s+)?(?:change|update|set|bind|link|toggle|insert|add|create|write|replace|remove|make|give|show|hide|turn|use|configure|enable|disable)\b/u.test(text)) return 'apply';
  return 'converse';
}

export function pixflowBricksPromptReferencesPriorFact(prompt: unknown): boolean {
  const text = String(prompt || '').trim();
  const routedText = pixflowBricksMutationTextAfterLeadingSkillRoute(text);
  const explicitHistoricalReference = /\b(?:first|second|third|fourth|fifth|last|earlier|previous|prior)\s+(?:thing|one|question|request|plan|change|proposal|binding|condition|edit)\b/iu.test(text);
  const startsWithSelfContainedMutation = /^(?:(?:please|kindly)\s+|(?:can|could|would)\s+you\s+)?(?:change|update|set|bind|link|toggle|insert|add|create|write|replace|remove|make|give|show|hide|turn|use|configure|enable|disable)\b/iu.test(routedText);
  const startsWithSelfContainedQueryLoop = /^(?:(?:please|kindly)\s+|(?:can|could|would)\s+you\s+)?apply\s+(?:an?\s+|the\s+)?(?:native\s+bricks\s+)?query\s+loop\b/iu.test(routedText);
  const startsWithTargetedSelfContainedMutation = /^(?:on|for)\s+(?:this|that|the\s+(?:currently\s+)?selected|the\s+current|currently\s+selected|selected|current)\s+[a-z][a-z0-9 _-]{0,50},?\s+(?:change|update|set|bind|link|toggle|insert|add|create|write|replace|remove|make|give|show|hide|turn|use|configure|enable|disable)\b/iu.test(routedText);
  const startsWithConditionalSelfContainedMutation = /^when\b[\s\S]{1,600}\b(?:change|update|set|bind|link|toggle|insert|add|create|write|replace|remove|make|give|show|hide|turn|use|configure|enable|disable)\b/iu.test(routedText);
  const expandsHistoricalReferenceWithExactChange = explicitHistoricalReference
    && /:\s*(?:(?:on|for|in)\s+[^,:;.]{1,100},?\s*)?(?:change|update|set|bind|link|toggle|insert|add|create|write|replace|remove|make|give|show|hide|turn|use|configure|enable|disable)\b/iu.test(text);
  // A historical label can help the model find conversational context without
  // making that old turn mutation authority. When the current user also
  // restates the concrete change after a delimiter, treat it as a fresh,
  // self-contained Design command and verify the model's live target normally.
  if (expandsHistoricalReferenceWithExactChange) return false;
  if ((startsWithSelfContainedMutation || startsWithSelfContainedQueryLoop || startsWithTargetedSelfContainedMutation || startsWithConditionalSelfContainedMutation) && !explicitHistoricalReference) return false;
  if (/^(?:(?:please|kindly)\s+)?(?:apply|implement|execute|proceed|go ahead|do it|carry it out|make (?:that|this|the) change)[.!?\s]*$/iu.test(text)) return true;
  return /\b(?:first|second|third|fourth|fifth|last|earlier|previous|prior)\s+(?:thing|one|question|request|plan|change|proposal|binding|condition|edit)\b|\b(?:that|this|the|the above)\s+(?:plan|change|proposal|binding|condition|edit|request)\b|\b(?:apply|implement|execute)\s+(?:that|this)\b|\b(?:apply|implement|execute|do)\s+it\b/iu.test(text);
}

export type PixflowBricksConversationInterpretationValidation =
  | { ok: true; decision: PixflowBricksConversationInterpretationDecision }
  | {
      ok: false;
      reason:
        | 'explicit_apply_required'
        | 'restored_context'
        | 'invalid_decision'
        | 'source_not_live'
        | 'source_context_stale'
        | 'source_fact_ineligible'
        | 'sequence_mismatch'
        | 'ordinal_mismatch';
    };

/**
 * Validate which bounded live-v2 user turn the model interpreted.
 *
 * Passing this check does not grant mutation authority. The current Design
 * turn, typed fact, exact model target decision, page/area fingerprints, live
 * inventory, mutation schema, and native Undo path are all checked later.
 */
export function validatePixflowBricksConversationInterpretationDecision(input: {
  memory: PixflowBricksWorkingMemoryEnvelope;
  prompt: unknown;
  decision: unknown;
}): PixflowBricksConversationInterpretationValidation {
  const { memory } = input;
  if (
    memory.currentTurn.mode !== 'design'
    || (memory.currentTurn.action !== 'apply' && memory.currentTurn.action !== 'implement')
  ) {
    return { ok: false, reason: 'explicit_apply_required' };
  }
  if (memory.restored) return { ok: false, reason: 'restored_context' };

  const record = objectValue(input.decision);
  const relation = boundedString(record.relation, 20);
  const sourceMessageId = boundedString(record.sourceMessageId || record.source_message_id, 160);
  const sourceUserSequence = Number(record.sourceUserSequence || record.source_user_sequence || 0);
  const confidence = boundedString(record.confidence, 20);
  const rationale = boundedString(record.rationale || record.reason, 500);
  if (
    Number(record.version || 0) !== 1
    || record.chronology !== 'oldest_to_newest'
    || !['first', 'second', 'third', 'fourth', 'fifth', 'last', 'earlier', 'continuation'].includes(relation)
    || !sourceMessageId
    || !Number.isInteger(sourceUserSequence)
    || sourceUserSequence < 1
    || !['high', 'medium'].includes(confidence)
    || !rationale
  ) {
    return { ok: false, reason: 'invalid_decision' };
  }

  const liveUserMessages = memory.recentChat.filter((message) => (
    message.role === 'user'
    && message.provenance.source === 'live_v2'
    && message.provenance.authority === 'conversation_only'
    && message.provenance.schemaVersion === 2
  ));
  const sourceIndex = liveUserMessages.findIndex((message) => message.id === sourceMessageId);
  if (sourceIndex < 0) return { ok: false, reason: 'source_not_live' };
  const sourceContext = liveUserMessages[sourceIndex]?.originContext;
  if (
    !sourceContext
    || sourceContext.postId !== memory.currentTurn.target.postId
    || sourceContext.area !== memory.currentTurn.target.area
    || sourceContext.fingerprints.page !== memory.currentTurn.fingerprints.page
    || sourceContext.fingerprints.inventory !== memory.currentTurn.fingerprints.inventory
  ) {
    return { ok: false, reason: 'source_context_stale' };
  }
  const sourceFacts = memory.facts.filter((fact) => (
    fact.provenance.sourceMessageId === sourceMessageId
  ));
  if (
    sourceFacts.length > 0
    && !sourceFacts.some((fact) => (
      (fact.status === 'proposed' || fact.status === 'user_confirmed')
      && !fact.supersededByFactId
    ))
  ) {
    // A reverted/applied/superseded typed fact is a durable revocation signal.
    // Raw conversation may help interpret a factless follow-up, but it must
    // never resurrect an intent whose structured authority is no longer live.
    return { ok: false, reason: 'source_fact_ineligible' };
  }
  if (sourceUserSequence !== sourceIndex + 1) return { ok: false, reason: 'sequence_mismatch' };

  const ordinalMatch = String(input.prompt || '').toLowerCase().match(
    /\b(first|second|third|fourth|fifth|last)\s+(?:thing|one|question|request|plan|change|proposal|binding|condition|edit)\b/u,
  );
  if (ordinalMatch) {
    const requestedRelation = ordinalMatch[1] as PixflowBricksConversationInterpretationDecision['relation'];
    const proposalSourceIds = new Set(memory.facts.filter((fact) => (
      ['chat', 'plan'].includes(fact.provenance.sourceMessageMode)
      && fact.provenance.sourceMessageSource === 'live_v2'
    )).map((fact) => fact.provenance.sourceMessageId));
    const groundedProposalMessages = liveUserMessages.filter((message) => proposalSourceIds.has(message.id));
    const ordinalMessages = groundedProposalMessages.length > 0 ? groundedProposalMessages : liveUserMessages;
    const expectedMessage = requestedRelation === 'last'
      ? ordinalMessages.at(-1)
      : ordinalMessages[['first', 'second', 'third', 'fourth', 'fifth'].indexOf(requestedRelation)];
    const expectedSequence = expectedMessage
      ? liveUserMessages.findIndex((message) => message.id === expectedMessage.id) + 1
      : 0;
    if (relation !== requestedRelation || sourceUserSequence !== expectedSequence) {
      return { ok: false, reason: 'ordinal_mismatch' };
    }
  } else if (relation === 'continuation' && sourceUserSequence !== liveUserMessages.length) {
    return { ok: false, reason: 'sequence_mismatch' };
  }

  return {
    ok: true,
    decision: {
      version: 1,
      chronology: 'oldest_to_newest',
      relation: relation as PixflowBricksConversationInterpretationDecision['relation'],
      sourceMessageId,
      sourceUserSequence,
      confidence: confidence as 'high' | 'medium',
      rationale,
    },
  };
}

function ordinalFactId(
  prompt: string,
  facts: PixflowBricksWorkingMemoryFact[],
  recentChat: PixflowBricksWorkingMemoryEnvelope['recentChat'] = [],
): string | undefined {
  const match = prompt.toLowerCase().match(/\b(first|second|third|fourth|fifth|last)\s+(?:thing|one|question|request|plan|change|proposal|binding|condition|edit)\b/u);
  if (!match) return undefined;
  const userMessages = recentChat.filter((message) => message.role === 'user');
  if (userMessages.length > 0) {
    const proposalSourceIds = new Set(facts.filter((fact) => (
      ['chat', 'plan'].includes(fact.provenance.sourceMessageMode)
      && fact.provenance.sourceMessageSource === 'live_v2'
    )).map((fact) => fact.provenance.sourceMessageId));
    const groundedProposalMessages = userMessages.filter((message) => proposalSourceIds.has(message.id));
    const ordinalMessages = groundedProposalMessages.length > 0 ? groundedProposalMessages : userMessages;
    const requestedIndex = match[1] === 'last'
      ? ordinalMessages.length - 1
      : ['first', 'second', 'third', 'fourth', 'fifth'].indexOf(match[1] || '');
    const sourceMessageId = requestedIndex >= 0 ? ordinalMessages[requestedIndex]?.id : undefined;
    const sourceFacts = sourceMessageId
      ? facts.filter((fact) => fact.provenance.sourceMessageId === sourceMessageId)
      : [];
    return sourceFacts.length === 1 ? sourceFacts[0]?.id : undefined;
  }
  const ordered = [...facts].sort((left, right) => left.createdTurn - right.createdTurn || left.id.localeCompare(right.id));
  const index = match[1] === 'last' ? ordered.length - 1 : ['first', 'second', 'third', 'fourth', 'fifth'].indexOf(match[1] || '');
  return index >= 0 ? ordered[index]?.id : undefined;
}

function sanitizeTargetResolution(value: unknown): PixflowBricksTargetResolution | undefined {
  const record = objectValue(value);
  if (Number(record.version) !== 1) return undefined;
  const status = boundedString(record.status, 20);
  const source = boundedString(record.source, 40);
  if (!['resolved', 'ambiguous', 'unresolved'].includes(status)) return undefined;
  if (!['prompt-element-id', 'active-selection', 'active-selected-element', 'active-selected-section', 'semantic-element-role', 'semantic-section-role', 'none'].includes(source)) return undefined;
  const candidates = (Array.isArray(record.candidates) ? record.candidates : []).slice(0, 8).map((candidate) => {
    const row = objectValue(candidate);
    const elementId = boundedString(row.elementId || row.element_id, 160);
    const reason = boundedString(row.reason, 40);
    if (!elementId || !['explicit-id', 'active-selection', 'active-selected-section', 'semantic-section-role', 'semantic-element-role'].includes(reason)) return null;
    return {
      elementId,
      label: boundedString(row.label, 160) || elementId,
      elementType: boundedString(row.elementType || row.element_type, 80),
      score: Math.max(0, Math.min(100, Number(row.score || 0))),
      reason: reason as never,
      capabilities: (Array.isArray(row.capabilities) ? row.capabilities : []).map((entry) => boundedString(entry, 80)).filter(Boolean).slice(0, 16),
      editableFieldKeys: (Array.isArray(row.editableFieldKeys) ? row.editableFieldKeys : []).map((entry) => boundedString(entry, 120)).filter(Boolean).slice(0, 40),
      matchedTokens: (Array.isArray(row.matchedTokens) ? row.matchedTokens : []).map((entry) => boundedString(entry, 60)).filter(Boolean).slice(0, 8),
    };
  }).filter(Boolean) as PixflowBricksTargetResolution['candidates'];
  const activeSelectionId = boundedString(record.activeSelectionId || record.active_selection_id, 160) || null;
  const resolvedElementId = boundedString(record.resolvedElementId || record.resolved_element_id, 160) || null;
  if (status === 'resolved' && (!resolvedElementId || candidates.length !== 1 || candidates[0]?.elementId !== resolvedElementId)) return undefined;
  if (status === 'ambiguous' && candidates.length < 2) return undefined;
  return {
    version: 1,
    status: status as never,
    source: source as never,
    query: boundedString(record.query, 120),
    activeSelectionId,
    resolvedElementId,
    candidates,
  };
}

function visibilityConditionIntentFromPrompt(value: unknown): PixflowBricksWorkingMemoryIntent | null {
  const prompt = String(value || '');
  const lower = prompt.toLowerCase();
  if (/\blogged[\s-]?out\b/u.test(lower)) {
    return { kind: 'visibility_condition', key: 'user_logged_in', operator: '==', value: '0' };
  }
  if (/\b(?:logged[\s-]?in|authenticated)\b/u.test(lower)) {
    return { kind: 'visibility_condition', key: 'user_logged_in', operator: '==', value: '1' };
  }
  const weekday = ([
    ['mondays?', '1'],
    ['tuesdays?', '2'],
    ['wednesdays?', '3'],
    ['thursdays?', '4'],
    ['fridays?', '5'],
    ['saturdays?', '6'],
    ['sundays?', '7'],
  ] as const).find(([pattern]) => new RegExp(`\\b${pattern}\\b`, 'u').test(lower));
  if (weekday) {
    return { kind: 'visibility_condition', key: 'weekday', operator: '==', value: weekday[1] };
  }
  const currentUrl = prompt.match(/\bcurrent\s+url\s+contains\s+["'“‘`]?([^"'”’`.,\s]+)["'”’`]?/iu);
  if (currentUrl?.[1]) {
    return { kind: 'visibility_condition', key: 'current_url', operator: 'contains', value: currentUrl[1] };
  }
  return null;
}

function sanitizePendingTargetClarification(value: unknown): PixflowBricksPendingTargetClarification | undefined {
  const record = objectValue(value);
  if (Number(record.version) !== 1) return undefined;
  const resolution = sanitizeTargetResolution({
    version: 1,
    status: 'ambiguous',
    source: 'none',
    query: record.query,
    activeSelectionId: record.activeSelectionId,
    resolvedElementId: null,
    candidates: record.candidates,
  });
  const postId = Number(record.postId || 0);
  const area = boundedString(record.area, 40) as PixflowBricksWorkingMemoryArea;
  const action = boundedString(record.action, 20);
  const sourceMessageMode = boundedString(record.sourceMessageMode, 20);
  const sourceMessageId = boundedString(record.sourceMessageId, 160);
  const pageFingerprint = boundedString(record.pageFingerprint, 160);
  const inventoryFingerprint = boundedString(record.inventoryFingerprint, 160);
  if (
    !resolution
    || !Number.isInteger(postId)
    || postId <= 0
    || !AREAS.has(area)
    || !['converse', 'apply', 'implement'].includes(action)
    || !['chat', 'plan', 'design'].includes(sourceMessageMode)
    || !sourceMessageId
    || !pageFingerprint
    || !inventoryFingerprint
  ) return undefined;
  const kind = boundedString(record.kind, 80) as PixflowBricksWorkingMemoryFactKind;
  const capability = boundedString(record.capability, 80) as PixflowBricksWorkingMemoryCapability;
  const intent = KINDS.has(kind) ? sanitizeIntent(kind, record.intent) : null;
  const fieldKey = boundedString(record.fieldKey, 160);
  const hasTypedIntent = Boolean(intent && CAPABILITIES.has(capability) && fieldKey);
  return {
    version: 1,
    createdTurn: Math.max(1, Number(record.createdTurn || 1)),
    sourceMessageId,
    sourceMessageMode: sourceMessageMode as 'chat' | 'plan' | 'design',
    action: action as 'converse' | 'apply' | 'implement',
    postId,
    area,
    pageFingerprint,
    inventoryFingerprint,
    activeSelectionId: boundedString(record.activeSelectionId, 160) || null,
    query: boundedString(record.query, 120),
    candidates: resolution.candidates,
    ...(hasTypedIntent ? { kind, capability, fieldKey, intent: intent! } : {}),
  };
}

export function createPixflowBricksPendingTargetClarification(input: {
  memory: PixflowBricksWorkingMemoryEnvelope;
  prompt: unknown;
}): PixflowBricksPendingTargetClarification | null {
  const turn = input.memory.currentTurn;
  const resolution = turn.targetResolution;
  if (!resolution || resolution.status !== 'ambiguous') return null;
  const intent = visibilityConditionIntentFromPrompt(input.prompt);
  return sanitizePendingTargetClarification({
    version: 1,
    createdTurn: turn.number,
    sourceMessageId: turn.messageId,
    sourceMessageMode: turn.mode,
    action: turn.action,
    postId: turn.target.postId,
    area: turn.target.area,
    pageFingerprint: turn.fingerprints.page,
    inventoryFingerprint: turn.fingerprints.inventory,
    activeSelectionId: resolution.activeSelectionId,
    query: resolution.query,
    candidates: resolution.candidates,
    ...(intent ? { kind: 'visibility_condition', capability: 'conditions', fieldKey: '_conditions', intent } : {}),
  }) || null;
}

export function pixflowBricksTargetClarificationText(resolution: PixflowBricksTargetResolution): string {
  const choices = resolution.candidates.slice(0, 4).map((candidate) => {
    const label = boundedString(candidate.label, 120) || candidate.elementId;
    const type = boundedString(candidate.elementType, 60) || 'element';
    return `- ${label} — ${type} — Bricks ID \`${candidate.elementId}\``;
  });
  const query = boundedString(resolution.query, 100);
  return [
    `I found more than one matching element${query ? ` for “${query}”` : ''}:`,
    ...choices,
    'Select the intended element in Bricks and say “use the selected element”, or provide its exact Bricks ID.',
  ].join('\n');
}

export function pixflowBricksAmbiguityRequiresClarification(
  mode: 'chat' | 'plan' | 'design',
  prompt: unknown,
  resolution: PixflowBricksTargetResolution | undefined,
): boolean {
  if (!resolution || resolution.status !== 'ambiguous') return false;
  if (mode === 'design') return true;
  const text = String(prompt || '').trim();
  const expresslyTargeted = (
    /\b(?:this|that|selected|currently\s+selected|current)\s+(?:element|section|container|block|heading|text|button|image|icon|form|area|region)\b/iu.test(text)
    || /\b(?:make|show|hide|change|update|set|bind|add|remove|replace|apply|implement|configure|inspect|audit|review)\b/iu.test(text)
    || /\b(?:steps|instructions|guidance|plan)\s+(?:for|on|to)\s+(?:this|that|the)\b/iu.test(text)
    || /\b(?:what|which)\b[\s\S]{0,50}\b(?:does|do|is|are|has|have)\b[\s\S]{0,80}\b(?:currently|right\s+now|existing|already)\b/iu.test(text)
  );
  const generalInformation = (
    /\b(?:in\s+general|generally|best\s+practices?|conceptually)\b/iu.test(text)
    || /^\s*(?:(?:@[^\n]{1,80}?|\/[a-z0-9][a-z0-9-]*)\s+)*(?:how\s+(?:do|does|can|could|would|should)|what\s+(?:are|is|can|could|would|should)|why\s+(?:do|does|is|are)|explain\b)/iu.test(text)
    || /\bwhen\s+(?:would|should|can|could)\s+(?:i|we|you)\s+(?:use|choose|prefer)\b/iu.test(text)
    || /^\s*(?:(?:@[^\n]{1,80}?|\/[a-z0-9][a-z0-9-]*)\s+)*if\s+(?:i|we|you)\s+(?:wanted|needed|were)\b/iu.test(text)
    || (
      mode === 'plan'
      && /^\s*(?:(?:@[^\n]{1,80}?|\/[a-z0-9][a-z0-9-]*)\s+)*plan\b/iu.test(text)
      && /https?:\/\/|\b(?:this|current|the)\s+page\b|\b(?:website|site-wide)\b/iu.test(text)
    )
  );
  const explicitLiveTarget = (
    /\b(?:this|that|selected|currently\s+selected|current)\s+(?:element|section|container|block|heading|text|button|image|icon|form|area|region)\b/iu.test(text)
    || /\b(?:currently|right\s+now|existing|already)\b/iu.test(text)
  );
  // A how-to question can contain ordinary edit verbs ("add", "change") and
  // incidental page language ("without changing this page") without asking
  // Pixflow to identify one live element. Only an explicit live target/current
  // state request turns that general Ask into a candidate handoff.
  if (generalInformation && !explicitLiveTarget) return false;
  return expresslyTargeted;
}

export function pixflowBricksDesignAnswerRequiresTargetClarification(
  mode: 'chat' | 'plan' | 'design',
  action: unknown,
  resolution: PixflowBricksTargetResolution | undefined,
): boolean {
  return mode === 'design'
    && String(action || '').trim().toLowerCase() === 'answer'
    && resolution?.status === 'ambiguous';
}

/**
 * An explicit Design apply/implement turn may only report success through a
 * verified mutation action. A model answer is conversational output, so it
 * cannot stand in for a live Builder receipt even when its prose claims that
 * the requested change was applied.
 */
export function pixflowBricksDesignAnswerRequiresMutationClarification(
  mode: 'chat' | 'plan' | 'design',
  prompt: unknown,
  action: unknown,
  answer: unknown,
): boolean {
  const text = String(answer || '').trim();
  const unverifiedMutationClaim = /\b(?:applied|changed|updated|added|removed|set|configured|enabled|disabled|replaced|inserted|created|renamed|bound|linked)\b/iu.test(text);
  const alreadySafeClarification = /\b(?:nothing\s+was\s+changed|no\s+changes?\s+(?:were|was|have\s+been)\s+made|could\s+not|cannot|can['â€™]?t|unable|not\s+supported|unsupported|read[\s-]?only|select\s+the|provide\s+(?:the|an?)|need(?:s|ed)?\s+(?:the|an?|more)|requires?\s+(?:the|an?)|clarif(?:y|ication))\b/iu.test(text);
  return mode === 'design'
    && String(action || '').trim().toLowerCase() === 'answer'
    // Prompt verbs are not an authorization signal. Only prevent an answer
    // from claiming a successful mutation when no verified mutation action
    // was emitted; normal explanations and clarifications pass through.
    && unverifiedMutationClaim
    && !alreadySafeClarification;
}

function pendingTargetResolutionPrompt(prompt: unknown, resolution: PixflowBricksTargetResolution | undefined): boolean {
  const text = String(prompt || '').trim();
  if (/^(?:please\s+)?use\s+the\s+selected\s+(?:element|section)[.!?]*$/iu.test(text)) return true;
  return resolution?.source === 'prompt-element-id'
    && /^(?:please\s+)?(?:use\s+)?(?:the\s+)?(?:exact\s+)?(?:bricks\s+)?id\s+[a-z0-9_-]+[.!?]*$/iu.test(text);
}

function explicitlyRebindsPriorIntent(prompt: unknown): boolean {
  const text = String(prompt || '');
  return pixflowBricksPromptReferencesPriorFact(text)
    && /\b(?:currently|current|now)\s+selected\s+(?:section|element)\b|\bselected\s+(?:section|element)\s+(?:now|instead)\b/iu.test(text);
}

export function preparePixflowBricksWorkingMemory(input: {
  raw: unknown;
  recentChat: unknown;
  prompt: unknown;
  mode: 'chat' | 'plan' | 'design';
  runContext: unknown;
}): {
  memory: PixflowBricksWorkingMemoryEnvelope;
  resolution: ReturnType<typeof resolvePixflowBricksWorkingMemoryAuthority>;
  pendingTargetResolution?: { status: 'resolved' | 'invalid'; reason: string };
} {
  const raw = objectValue(input.raw);
  const run = objectValue(input.runContext);
  const target = sanitizeTarget({ postId: run.postId, area: run.area, elementId: run.selectedId || null, fieldKey: run.fieldKey || null })
    || { postId: Math.max(1, Number(run.postId || 1)), area: 'content', elementId: boundedString(run.selectedId, 160) || null, fieldKey: boundedString(run.fieldKey, 160) || null };
  const page = boundedString(run.pageFingerprint, 160);
  const inventory = boundedString(run.inventoryFingerprint, 160);
  const facts = (Array.isArray(raw.facts) ? raw.facts : []).map(sanitizePixflowBricksWorkingMemoryFact).filter(Boolean) as PixflowBricksWorkingMemoryFact[];
  const targetResolution = sanitizeTargetResolution(run.targetResolution || run.target_resolution);
  const pendingTargetClarification = sanitizePendingTargetClarification(raw.pendingTargetClarification || raw.pending_target_clarification);
  const conversationSummary = boundedString(
    raw.conversationSummary || raw.conversation_summary,
    8_000,
  );
  const recentInput = (Array.isArray(input.recentChat) ? input.recentChat : [])
    .slice(-(PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxRecentChatMessages * 4));
  const recent = recentInput.map((entry, index) => {
    const row = objectValue(entry);
    const role = row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : null;
    const content = boundedString(row.content, PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxRecentChatMessageChars);
    const events = sanitizeRecentMessageEvents(row.events);
    if (!role || (!content && (!events || events.length === 0))) return null;
    const rawSource = boundedString(objectValue(row.provenance).source, 40);
    const source = ['session_restore_v2', 'device_restore_v2', 'legacy_v1'].includes(rawSource)
      ? rawSource
      : 'live_v2';
    const createdAt = Number(row.createdAt);
    const rawOriginContext = objectValue(row.originContext || row.origin_context);
    const rawOriginFingerprints = objectValue(rawOriginContext.fingerprints);
    const originPostId = Number(rawOriginContext.postId || rawOriginContext.post_id || 0);
    const originArea = boundedString(rawOriginContext.area, 20);
    const originPage = boundedString(rawOriginFingerprints.page, 160);
    const originInventory = boundedString(rawOriginFingerprints.inventory, 160);
    const originContext = Number.isInteger(originPostId)
      && originPostId > 0
      && ['content', 'header', 'footer', 'popup', 'template'].includes(originArea)
      && originPage
      && originInventory
      ? {
          postId: originPostId,
          area: originArea as PixflowBricksWorkingMemoryEnvelope['currentTurn']['target']['area'],
          fingerprints: { page: originPage, inventory: originInventory },
        }
      : undefined;
    const rowStatus = boundedString(row.status, 20);
    const rowRunStatus = boundedString(row.runStatus || row.run_status, 40);
    return {
      id: boundedString(row.id, 160) || `recent:${index + 1}`,
      role,
      content,
      createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : index + 1,
      sessionMode: ['chat', 'plan'].includes(String(row.sessionMode)) ? row.sessionMode as 'chat' | 'plan' : 'design',
      ...( ['draft', 'queued', 'streaming', 'complete', 'error'].includes(rowStatus)
        ? { status: rowStatus as 'draft' | 'queued' | 'streaming' | 'complete' | 'error' }
        : {}),
      ...(rowRunStatus
        ? { runStatus: rowRunStatus }
        : {}),
      ...(events && events.length > 0
        ? { events }
        : {}),
      originContext,
      provenance: {
        surface: 'bricks_floating_panel' as const,
        source: source as 'live_v2' | 'session_restore_v2' | 'device_restore_v2' | 'legacy_v1',
        authority: source === 'legacy_v1' ? 'display_only' as const : 'conversation_only' as const,
        schemaVersion: source === 'legacy_v1' ? 1 as const : 2 as const,
      },
      inputIndex: index,
    };
  }).filter((message) => message !== null)
    .sort((left, right) => (
      Number(left?.createdAt || 0) - Number(right?.createdAt || 0)
      || Number(left?.inputIndex || 0) - Number(right?.inputIndex || 0)
    ))
    .slice(-PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxRecentChatMessages)
    .map(({ inputIndex: _inputIndex, ...message }) => message) as PixflowBricksWorkingMemoryEnvelope['recentChat'];
  const selectorFactId = ordinalFactId(String(input.prompt || ''), facts, recent);
  const currentTurnNumber = Math.max(1, Number(run.createdTurn || raw.currentTurn && objectValue(raw.currentTurn).number || 1));
  let preparedFacts = facts.slice(-PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxFacts);
  let effectiveSelectorFactId = selectorFactId;
  let rebindFailure: ReturnType<typeof resolvePixflowBricksWorkingMemoryAuthority> | null = null;
  let pendingTargetResolution: { status: 'resolved' | 'invalid'; reason: string } | undefined;
  let turnTarget = target;
  // Keep the legacy action label as continuity metadata for typed working
  // memory and existing receipts. It is not mutation authority: the floating
  // panel's model-led Design path authorizes the session once and decides the
  // actual Bricks action from its structured result, live schema, and skills.
  // In particular, this label is never used to auto-apply a model result.
  let turnAction: 'converse' | 'apply' | 'implement' = pixflowBricksExplicitTurnAction(input.prompt);
  if (pendingTargetClarification && pendingTargetResolutionPrompt(input.prompt, targetResolution)) {
    const resolvedId = targetResolution?.status === 'resolved' ? targetResolution.resolvedElementId : null;
    const resolvesByExplicitId = targetResolution?.source === 'prompt-element-id';
    const candidateIds = new Set(pendingTargetClarification.candidates.map((candidate) => candidate.elementId));
    const samePage = pendingTargetClarification.postId === target.postId
      && pendingTargetClarification.area === target.area
      && pendingTargetClarification.pageFingerprint === page;
    const resumedAction = pendingTargetClarification.sourceMessageMode === 'design'
      ? pendingTargetClarification.action
      : 'converse';
    if (!samePage) {
      pendingTargetResolution = { status: 'invalid', reason: 'The page or Builder area changed.' };
    } else if (
      !resolvedId
      || !candidateIds.has(resolvedId)
      || (!resolvesByExplicitId && target.elementId !== resolvedId)
    ) {
      pendingTargetResolution = { status: 'invalid', reason: 'The selected or supplied ID is not one of the live candidates.' };
    } else if (input.mode !== 'design') {
      pendingTargetResolution = { status: 'invalid', reason: 'Target rebinding is available only in Design mode.' };
    } else if (!pendingTargetClarification.intent || !pendingTargetClarification.kind || !pendingTargetClarification.capability || !pendingTargetClarification.fieldKey) {
      // The bounded recent chat may explain what the pending request meant, but
      // it never becomes mutation authority. Confirm only the exact live
      // candidate here, then require the model to emit a fresh typed mutation
      // whose target, field, schema, and fingerprints pass the normal Design
      // verifier immediately before apply.
      turnAction = resumedAction;
      turnTarget = { ...target, elementId: resolvedId, fieldKey: null };
      effectiveSelectorFactId = undefined;
      pendingTargetResolution = {
        status: 'resolved',
        reason: 'One pending request was confirmed for one exact live candidate; the model must return a fresh typed mutation decision.',
      };
    } else {
      turnAction = resumedAction;
      const rebound: PixflowBricksWorkingMemoryFact = {
        id: `fact:${pendingTargetClarification.sourceMessageId}:clarified:${resolvedId}`.slice(0, 240),
        kind: pendingTargetClarification.kind,
        capability: pendingTargetClarification.capability,
        skillIds: [],
        target: { ...target, elementId: resolvedId, fieldKey: pendingTargetClarification.fieldKey },
        intent: pendingTargetClarification.intent,
        status: 'user_confirmed',
        supersedesFactIds: [],
        createdTurn: currentTurnNumber,
        fingerprints: { page, inventory },
        reboundFromFactId: `pending:${pendingTargetClarification.sourceMessageId}`,
        reboundFromSourceMessageId: pendingTargetClarification.sourceMessageId,
        reboundAtTurn: currentTurnNumber,
        provenance: {
          surface: 'bricks_floating_panel',
          sourceMessageId: pendingTargetClarification.sourceMessageId,
          sourceMessageMode: pendingTargetClarification.sourceMessageMode,
          sourceMessageRole: 'user',
          sourceMessageSource: 'live_v2',
          extractedBy: 'daemon',
        },
      } as PixflowBricksWorkingMemoryFact;
      preparedFacts = [...preparedFacts.slice(-(PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxFacts - 1)), rebound];
      effectiveSelectorFactId = rebound.id;
      turnTarget = rebound.target;
      pendingTargetResolution = { status: 'resolved', reason: 'One pending typed intent was rebound to one exact live candidate.' };
    }
  } else if (input.mode === 'design' && explicitlyRebindsPriorIntent(input.prompt) && target.elementId) {
    const portable = facts.filter((fact) => (
      (fact.status === 'proposed' || fact.status === 'user_confirmed')
      && !fact.supersededByFactId
      && fact.createdTurn < currentTurnNumber
      && fact.target.postId === target.postId
      && fact.target.area === target.area
      && fact.fingerprints.page === page
      && PORTABLE_REBIND_KINDS.has(fact.kind)
      && (!selectorFactId || fact.id === selectorFactId)
    ));
    if (portable.length === 1) {
      const source = portable[0]!;
      const { supersededByFactId: _supersededByFactId, ...portableSource } = source;
      const rebound: PixflowBricksWorkingMemoryFact = {
        ...portableSource,
        id: `fact:${boundedString(run.sourceMessageId, 80) || currentTurnNumber}:rebind:${source.id}`.slice(0, 240),
        target: { ...target, fieldKey: source.target.fieldKey },
        status: 'user_confirmed',
        supersedesFactIds: [source.id],
        createdTurn: currentTurnNumber,
        fingerprints: { page, inventory },
        reboundFromFactId: source.id,
        reboundFromSourceMessageId: source.provenance.sourceMessageId,
        reboundAtTurn: currentTurnNumber,
        provenance: {
          surface: 'bricks_floating_panel',
          sourceMessageId: boundedString(run.sourceMessageId, 160) || `turn:${currentTurnNumber}`,
          sourceMessageMode: 'design',
          sourceMessageRole: 'user',
          sourceMessageSource: 'live_v2',
          extractedBy: 'daemon',
        },
      };
      preparedFacts = [...preparedFacts.slice(-(PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxFacts - 1)), rebound];
      effectiveSelectorFactId = rebound.id;
      turnTarget = rebound.target;
    } else {
      rebindFailure = {
        ok: false,
        reason: portable.length > 1 ? 'ambiguous_facts' : 'no_compatible_fact',
        compatibleFactIds: portable.map((fact) => fact.id),
      };
    }
  } else {
    const compatible = facts.filter((fact) => fact.target.postId === target.postId && fact.target.area === target.area && fact.target.elementId === target.elementId);
    turnTarget = selectorFactId ? facts.find((fact) => fact.id === selectorFactId)?.target || target : compatible.length === 1 ? compatible[0]?.target || target : target;
  }
  const memory: PixflowBricksWorkingMemoryEnvelope = {
    schema: PIXFLOW_BRICKS_WORKING_MEMORY_SCHEMA,
    version: PIXFLOW_BRICKS_WORKING_MEMORY_VERSION,
    sessionId: boundedString(raw.sessionId, 160) || `bricks-memory:${Date.now()}`,
    createdAt: Number(raw.createdAt || Date.now()),
    updatedAt: Date.now(),
    retention: raw.retention === 'device' ? 'device' : 'session',
    restored: raw.restored === true,
    currentTurn: {
      number: currentTurnNumber,
      messageId: boundedString(run.sourceMessageId, 160) || `turn:${currentTurnNumber}`,
      mode: input.mode,
      action: turnAction,
      target: turnTarget,
      fingerprints: { page, inventory },
      ...(effectiveSelectorFactId ? { factSelector: { factId: effectiveSelectorFactId } } : {}),
      ...(targetResolution ? { targetResolution } : {}),
    },
    ...(conversationSummary ? { conversationSummary } : {}),
    ...(!pendingTargetResolution && pendingTargetClarification ? { pendingTargetClarification } : {}),
    recentChat: recent,
    facts: preparedFacts,
  };
  const resolvedAuthority = rebindFailure || resolvePixflowBricksWorkingMemoryAuthority(memory);
  const resolution = input.mode === 'design'
    && !pixflowBricksPromptReferencesPriorFact(input.prompt)
    && pendingTargetResolution?.status !== 'resolved'
    && resolvedAuthority.ok
    ? {
        ok: false as const,
        reason: 'no_compatible_fact' as const,
        compatibleFactIds: [],
      }
    : resolvedAuthority;
  return {
    memory,
    resolution,
    ...(pendingTargetResolution ? { pendingTargetResolution } : {}),
  };
}

function capabilityForKind(kind: PixflowBricksWorkingMemoryFactKind): PixflowBricksWorkingMemoryCapability {
  return ({
    text_replacement: 'selected_element',
    settings_patch: 'bricks_settings',
    dynamic_data_binding: 'dynamic_data',
    visibility_condition: 'conditions',
    query_loop: 'query_loop',
    code_update: 'code_element',
    element_insert: 'element_insert',
    library_insert: 'library_insertion',
    section_generation: 'section_generation',
  } as const)[kind];
}

export function pixflowBricksFactMatchesLiveInventory(input: {
  fact: PixflowBricksWorkingMemoryFact;
  postId: number;
  area: PixflowBricksWorkingMemoryArea;
  liveElementIds: { has(value: string): boolean };
  targetIndex: { has(value: string): boolean };
}): boolean {
  const { fact } = input;
  if (fact.target.postId !== input.postId || fact.target.area !== input.area) return false;
  if (['element_insert', 'library_insert', 'section_generation'].includes(fact.kind)) {
    const intent = fact.intent as Extract<PixflowBricksWorkingMemoryIntent, {
      kind: 'element_insert' | 'library_insert' | 'section_generation';
    }>;
    return intent.position === 'append'
      || Boolean(intent.positionTargetId && input.liveElementIds.has(intent.positionTargetId));
  }
  return Boolean(
    fact.target.elementId
    && fact.target.fieldKey
    && input.targetIndex.has(`${fact.target.elementId}:${fact.target.fieldKey}`),
  );
}

export function createPixflowBricksFactFromResult(input: {
  result: unknown;
  memory: PixflowBricksWorkingMemoryEnvelope;
  skillIds?: string[];
}): PixflowBricksWorkingMemoryFact | null {
  const result = objectValue(input.result);
  const turn = input.memory.currentTurn;
  if (turn.mode !== 'design' || (turn.action !== 'apply' && turn.action !== 'implement')) return null;
  const action = boundedString(result.action, 40);
  let kind: PixflowBricksWorkingMemoryFactKind | null = null;
  let target = turn.target;
  let intent: PixflowBricksWorkingMemoryIntent | null = null;
  if (action === 'replace') {
    const replacements = Array.isArray(result.replacements) ? result.replacements : [];
    const entry = objectValue(replacements[0] || result);
    const elementId = boundedString(entry.elementId || result.elementId || target.elementId, 160);
    const fieldKey = boundedString(entry.fieldKey || result.fieldKey || target.fieldKey || 'text', 160);
    const value = boundedString(entry.replacementText || result.replacementText);
    if (replacements.length <= 1 && elementId && fieldKey && value) {
      kind = 'text_replacement';
      target = { ...target, elementId, fieldKey };
      intent = { kind, value };
    }
  } else if (action === 'patch') {
    const patches = Array.isArray(result.patches) ? result.patches : [];
    const mutationType = boundedString(result.mutationType, 120);
    const firstPatch = objectValue(patches[0]);
    const elementId = boundedString(firstPatch.elementId || firstPatch.id || target.elementId, 160);
    const patchesShareElement = Boolean(elementId) && patches.length > 0 && patches.every((rawPatch) => {
      const patch = objectValue(rawPatch);
      return boundedString(patch.elementId || patch.id, 160) === elementId;
    });
    const queryPatch = objectValue(patches.find((rawPatch) => boundedString(objectValue(rawPatch).fieldKey, 160) === 'query'));
    const queryPatchFieldKeys = patches.map((rawPatch) => boundedString(objectValue(rawPatch).fieldKey, 160));
    const isBoundedQueryLoopPatch = patchesShareElement
      && Boolean(queryPatch.fieldKey)
      && queryPatchFieldKeys.every((key) => key === 'hasLoop' || key === 'query');
    if ((mutationType === 'query_loop_update' || isBoundedQueryLoopPatch) && patchesShareElement) {
      const queryFieldKey = boundedString(queryPatch.fieldKey, 160) || 'query';
      const querySettings = objectValue(queryPatch.settings);
      const query = objectValue(queryPatch.value !== undefined ? queryPatch.value : querySettings[queryFieldKey]);
      const postTypeValue = Array.isArray(query.post_type) ? query.post_type[0] : query.post_type;
      const taxonomyValue = Array.isArray(query.taxonomy) ? query.taxonomy[0] : query.taxonomy;
      const queryIntent = sanitizeIntent('query_loop', {
        kind: 'query_loop',
        objectType: query.objectType,
        postType: postTypeValue,
        taxonomy: taxonomyValue,
        postsPerPage: query.posts_per_page || query.number,
        itemsPerPage: query.items_per_page,
        orderBy: query.orderby,
        order: query.order,
        offset: query.offset,
        apiUrl: query.api_url,
        apiMethod: query.api_method,
        ...(Object.prototype.hasOwnProperty.call(query, 'response_path')
          ? { responsePath: query.response_path }
          : {}),
        cacheTime: query.cache_time,
        arrayEditor: query.arrayEditor,
        ...(Object.prototype.hasOwnProperty.call(query, 'exclude_current_post')
          ? { excludeCurrentPost: query.exclude_current_post === true }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(query, 'ignore_sticky_posts')
          ? { ignoreStickyPosts: query.ignore_sticky_posts === true }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(query, 'infinite_scroll')
          ? { infiniteScroll: query.infinite_scroll === true }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(query, 'current_post_term')
          ? { currentPostTerm: query.current_post_term === true }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(query, 'show_empty')
          ? { showEmpty: query.show_empty === true }
          : {}),
      });
      if (queryIntent) {
        kind = 'query_loop';
        target = { ...target, elementId, fieldKey: 'query' };
        intent = queryIntent;
      }
    } else if (patches.length === 1 && elementId) {
      const patchSettings = objectValue(firstPatch.settings);
      const settingsFieldKey = Object.keys(patchSettings)[0] || '';
      const fieldKey = boundedString(firstPatch.fieldKey || settingsFieldKey || target.fieldKey, 160);
      const value = firstPatch.value !== undefined ? firstPatch.value : patchSettings[fieldKey];
      if (mutationType === 'code_update') {
        const codeIntent = sanitizeIntent('code_update', {
          kind: 'code_update',
          fieldKey,
          source: value,
          attributeBinding: result.attributeBinding || result.attribute_binding,
        });
        if (codeIntent?.kind === 'code_update' && fieldKey === codeIntent.fieldKey) {
          kind = 'code_update';
          target = { ...target, elementId, fieldKey };
          intent = codeIntent;
        }
      } else if (mutationType === 'dynamic_data_update') {
        const structuredValue = objectValue(value);
        const expression = typeof value === 'string' ? boundedString(value, 240) : boundedString(structuredValue.useDynamicData, 240);
        const placement = typeof value === 'string'
          ? 'text'
          : boundedString(structuredValue.type, 20) === 'meta' || /(?:link|url)/i.test(fieldKey)
            ? 'link'
            : 'image';
        const dynamicIntent = sanitizeIntent('dynamic_data_binding', { kind: 'dynamic_data_binding', expression, placement });
        if (fieldKey && dynamicIntent) {
          kind = 'dynamic_data_binding';
          target = { ...target, elementId, fieldKey };
          intent = dynamicIntent;
        }
      } else if (mutationType === 'element_condition_update' && fieldKey === '_conditions') {
        const rawGroups = Array.isArray(value) ? value : [];
        const conditionGroups = rawGroups.map((rawGroup) => (
          Array.isArray(rawGroup)
            ? rawGroup.map((rawCondition) => {
                const condition = objectValue(rawCondition);
                return {
                  key: boundedString(condition.key, 120),
                  operator: boundedString(condition.compare || condition.operator, 40),
                  ...(Object.prototype.hasOwnProperty.call(condition, 'value') ? { value: condition.value } : {}),
                  ...(condition.dynamic_data ? { dynamicDataTag: boundedString(condition.dynamic_data, 240) } : {}),
                };
              })
            : []
        ));
        const onlyCondition = conditionGroups.length === 1 && conditionGroups[0]?.length === 1
          ? conditionGroups[0][0]
          : null;
        const conditionIntent = sanitizeIntent('visibility_condition', onlyCondition
          ? { kind: 'visibility_condition', ...onlyCondition }
          : {
              kind: 'visibility_condition',
              groups: conditionGroups,
              replaceExisting: true,
            });
        if (conditionIntent) {
          kind = 'visibility_condition';
          target = { ...target, elementId, fieldKey };
          intent = conditionIntent;
        }
      } else {
        const values = Object.keys(patchSettings).length > 0
          ? settingValues(Object.entries(patchSettings).map(([settingsKey, settingsValue]) => ({
              fieldKey: settingsKey,
              value: settingsValue,
            })))
          : settingValues([{ fieldKey, value }]);
        if (fieldKey && values.length > 0) {
          kind = 'settings_patch';
          target = { ...target, elementId, fieldKey };
          intent = { kind, values };
        }
      }
    } else if (
      patchesShareElement
      && !['code_update', 'dynamic_data_update', 'element_condition_update'].includes(mutationType)
    ) {
      const rawValues = patches.flatMap((rawPatch) => {
        const patch = objectValue(rawPatch);
        const settings = objectValue(patch.settings);
        const settingsEntries = Object.entries(settings);
        if (settingsEntries.length > 0) {
          return settingsEntries.map(([settingsKey, settingsValue]) => ({
            fieldKey: settingsKey,
            value: settingsValue,
          }));
        }
        const patchFieldKey = boundedString(patch.fieldKey || patch.field_key, 160);
        return patchFieldKey && patch.value !== undefined
          ? [{ fieldKey: patchFieldKey, value: patch.value }]
          : [];
      });
      const values = settingValues(rawValues);
      const uniqueFieldKeys = new Set(values.map((entry) => entry.fieldKey));
      const primaryFieldKey = boundedString(
        firstPatch.fieldKey
        || firstPatch.field_key
        || Object.keys(objectValue(firstPatch.settings))[0]
        || target.fieldKey,
        160,
      );
      if (
        primaryFieldKey
        && values.length === rawValues.length
        && uniqueFieldKeys.size === values.length
      ) {
        kind = 'settings_patch';
        target = { ...target, elementId, fieldKey: primaryFieldKey };
        intent = { kind, values };
      }
    }
  } else if (action === 'library_insert' && Number(result.templateId || 0) > 0) {
    kind = 'library_insert';
    const position = objectValue(result.position);
    intent = { kind, templateId: Number(result.templateId), position: boundedString(position.mode, 40) as never || 'append', positionTargetId: boundedString(position.targetId, 160) || null };
  } else if (action === 'insert') {
    const elements = Array.isArray(result.elements) ? result.elements : [];
    const normalizedElements = elements.slice(0, 2).map((rawElement) => {
      const element = objectValue(rawElement);
      return {
        elementName: boundedString(element.name, 40),
        settings: settingValues(Object.entries(objectValue(element.settings)).map(([fieldKey, value]) => ({ fieldKey, value }))),
      };
    }).filter((element) => element.elementName && element.settings.length > 0);
    const primaryIndex = normalizedElements.findIndex((element) => element.elementName === 'code');
    const primary = normalizedElements[primaryIndex >= 0 ? primaryIndex : 0];
    const additionalElements = normalizedElements.filter((_, index) => index !== (primaryIndex >= 0 ? primaryIndex : 0));
    const position = objectValue(result.position);
    const rawAttributeBinding = objectValue(result.attributeBinding || result.attribute_binding);
    const attributeElementId = boundedString(rawAttributeBinding.elementId || rawAttributeBinding.element_id, 160);
    const attributeName = boundedString(rawAttributeBinding.name, 80).toLowerCase();
    const attributeValue = boundedString(rawAttributeBinding.value, 500);
    if (normalizedElements.length === elements.length && normalizedElements.length >= 1 && normalizedElements.length <= 2 && primary) {
      kind = 'element_insert';
      if (attributeElementId && /^data-[a-z][a-z0-9_.:-]{0,62}$/u.test(attributeName)) {
        target = { ...target, elementId: attributeElementId, fieldKey: '_attributes' };
      }
      intent = {
        kind,
        elementName: primary.elementName as never,
        position: boundedString(position.mode, 40) as never || 'append',
        positionTargetId: boundedString(position.targetId, 160) || null,
        settings: primary.settings,
        ...(additionalElements.length > 0 ? {
          additionalElements: additionalElements.map((element) => ({
            elementName: element.elementName as never,
            settings: element.settings,
          })),
        } : {}),
        ...(attributeElementId && /^data-[a-z][a-z0-9_.:-]{0,62}$/u.test(attributeName) ? {
          attributeBinding: {
            elementId: attributeElementId,
            name: attributeName,
            value: attributeValue,
          },
        } : {}),
      };
    }
  }
  if (!kind || !intent) return null;
  input.memory.currentTurn.target = target;
  return {
    id: `fact:${turn.messageId}:${kind}`,
    kind,
    capability: capabilityForKind(kind),
    skillIds: (input.skillIds || []).slice(0, PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxSkillIds),
    target,
    intent,
    status: 'user_confirmed',
    supersedesFactIds: [],
    createdTurn: turn.number,
    fingerprints: turn.fingerprints,
    provenance: {
      surface: 'bricks_floating_panel',
      sourceMessageId: turn.messageId,
      sourceMessageMode: turn.mode,
      sourceMessageRole: 'user',
      sourceMessageSource: 'live_v2',
      extractedBy: 'daemon',
    },
  } as PixflowBricksWorkingMemoryFact;
}

/**
 * Rebuild the one allowed Code-element patch from an already-resolved v2 fact.
 * The browser and WordPress mutation boundaries still revalidate the live
 * selection, fingerprints, execute-code capability, and native save path.
 */
export function createPixflowBricksCodePatchResultFromFact(input: {
  fact: PixflowBricksWorkingMemoryFact;
  selectedId: unknown;
  liveTarget: unknown;
}): Record<string, unknown> | null {
  const { fact } = input;
  if (fact.kind !== 'code_update' || fact.intent.kind !== 'code_update') return null;
  const selectedId = boundedString(input.selectedId, 160);
  const liveTarget = objectValue(input.liveTarget);
  const targetId = boundedString(fact.target.elementId, 160);
  const fieldKey = fact.intent.fieldKey;
  const expectedTargetKind = ({
    code: 'code_html_php',
    javascriptCode: 'code_javascript',
    cssCode: 'code_css',
  } as const)[fieldKey];
  if (
    !selectedId
    || selectedId !== targetId
    || boundedString(fact.target.fieldKey, 160) !== fieldKey
    || boundedString(liveTarget.elementId || liveTarget.element_id, 160) !== targetId
    || boundedString(liveTarget.fieldKey || liveTarget.field_key, 160) !== fieldKey
    || boundedString(liveTarget.targetKind || liveTarget.target_kind, 80) !== expectedTargetKind
  ) return null;
  const targetLabel = boundedString(liveTarget.targetLabel || liveTarget.target_label, 160) || targetId;
  const language = fieldKey === 'javascriptCode' ? 'JavaScript' : fieldKey === 'cssCode' ? 'CSS' : 'PHP & HTML';
  return {
    type: 'pixflow_bridge_quick_text_edit_result',
    version: 1,
    status: 'completed',
    action: 'patch',
    mutationType: 'code_update',
    targetLabel,
    answer: `I updated the selected ${targetLabel} ${language} source.`,
    mutationTitle: `Update ${targetLabel} ${language}`,
    changeSummary: `Applied the exact grounded ${language} source to ${targetId}.`,
    confidence: 'high',
    reason: 'Recovered one exact Code element patch from one resolved v2 working-memory fact.',
    ...(fact.intent.attributeBinding ? { attributeBinding: fact.intent.attributeBinding } : {}),
    patches: [{
      id: targetId,
      elementId: targetId,
      fieldKey,
      settings: { [fieldKey]: fact.intent.source },
      targetLabel,
      changeSummary: `Replace ${fieldKey} on the selected Code element.`,
    }],
  };
}

export function authorizePixflowBricksWorkingMemoryFact(
  memory: PixflowBricksWorkingMemoryEnvelope,
  fact: PixflowBricksWorkingMemoryFact,
) {
  const turn = memory.currentTurn;
  if (turn.mode !== 'design' || (turn.action !== 'apply' && turn.action !== 'implement')) return null;
  if (fact.status !== 'proposed' && fact.status !== 'user_confirmed') return null;
  if (fact.supersededByFactId) return null;
  if (fact.target.postId !== turn.target.postId || fact.target.area !== turn.target.area) return null;
  if (fact.target.elementId !== turn.target.elementId || fact.target.fieldKey !== turn.target.fieldKey) return null;
  if (fact.fingerprints.page !== turn.fingerprints.page || fact.fingerprints.inventory !== turn.fingerprints.inventory) return null;
  return {
    schema: PIXFLOW_BRICKS_WORKING_MEMORY_SCHEMA,
    receiptVersion: 1 as const,
    id: `authority:${memory.sessionId}:${turn.messageId}:${fact.id}`,
    sessionId: memory.sessionId,
    factId: fact.id,
    sourceMessageId: fact.provenance.sourceMessageId,
    applyMessageId: turn.messageId,
    resolvedAtTurn: turn.number,
    mode: 'design' as const,
    action: turn.action,
    resolution: 'exactly_one' as const,
    capability: fact.capability,
    skillIds: fact.skillIds,
    target: fact.target,
    fingerprints: fact.fingerprints,
  };
}

export function selectPixflowBricksPriorIntentCandidate(
  memory: PixflowBricksWorkingMemoryEnvelope,
): { fact: PixflowBricksWorkingMemoryFact | null; ambiguousFactIds: string[] } {
  const turn = memory.currentTurn;
  const candidates = memory.facts.filter((fact) => {
    if (fact.status !== 'proposed' && fact.status !== 'user_confirmed') return false;
    if (fact.supersededByFactId || fact.createdTurn >= turn.number) return false;
    if (fact.target.postId !== turn.target.postId || fact.target.area !== turn.target.area) return false;
    if (fact.fingerprints.page !== turn.fingerprints.page) return false;
    const selector = turn.factSelector;
    if (!selector) return true;
    if (selector.factId !== undefined && fact.id !== selector.factId) return false;
    if (selector.sourceMessageId !== undefined && fact.provenance.sourceMessageId !== selector.sourceMessageId) return false;
    if (selector.kind !== undefined && fact.kind !== selector.kind) return false;
    if (selector.capability !== undefined && fact.capability !== selector.capability) return false;
    return true;
  });
  return candidates.length === 1
    ? { fact: candidates[0] || null, ambiguousFactIds: [] }
    : { fact: null, ambiguousFactIds: candidates.map((fact) => fact.id) };
}

export function pixflowBricksFactIntentsEqual(
  left: PixflowBricksWorkingMemoryFact,
  right: PixflowBricksWorkingMemoryFact,
): boolean {
  if (left.kind !== right.kind || left.intent.kind !== right.intent.kind) return false;
  if (left.kind === 'text_replacement' && right.kind === 'text_replacement') {
    // `previousValue` records the observed baseline for stale-state checks; it
    // does not change what the user authorized. The live target inventory is
    // revalidated immediately before apply, so compare only the bounded text
    // mutation value here.
    return left.intent.value === right.intent.value;
  }
  if (left.kind === 'query_loop' && right.kind === 'query_loop') {
    const withoutNativeNoopDefaults = (intent: typeof left.intent) => Object.fromEntries(
      Object.entries(intent).filter(([key, value]) => {
        if (
          value === false
          && ['excludeCurrentPost', 'ignoreStickyPosts', 'infiniteScroll', 'currentPostTerm', 'showEmpty'].includes(key)
        ) return false;
        if (intent.objectType === 'post') {
          if (key === 'postType' && value === 'post') return false;
          if (key === 'orderBy' && value === 'date') return false;
          if (key === 'order' && value === 'DESC') return false;
        }
        return true;
      }),
    );
    return JSON.stringify(withoutNativeNoopDefaults(left.intent))
      === JSON.stringify(withoutNativeNoopDefaults(right.intent));
  }
  return JSON.stringify(left.intent) === JSON.stringify(right.intent);
}

/**
 * Authorize a model-selected exact target after the caller has verified that
 * the chosen ID/field exists in the fresh live inventory. Selection identity
 * is intentionally not part of this check.
 */
export function authorizePixflowBricksTargetDecision(
  memory: PixflowBricksWorkingMemoryEnvelope,
  fact: PixflowBricksWorkingMemoryFact,
) {
  return authorizePixflowBricksWorkingMemoryFact({
    ...memory,
    currentTurn: {
      ...memory.currentTurn,
      target: fact.target,
      fingerprints: fact.fingerprints,
    },
  }, fact);
}
