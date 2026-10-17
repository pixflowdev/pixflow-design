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

function stringArray(...values) {
  const source = values.find((value) => Array.isArray(value));
  return Array.isArray(source)
    ? [...new Set(source.map((value) => firstString(value)).filter(Boolean))].slice(0, 12)
    : [];
}

export function normalizeBricksAgentTargets(targets) {
  return (Array.isArray(targets) ? targets : [])
    .map((item) => {
      const record = objectValue(item);
      const elementId = firstString(record.elementId, record.element_id, record.id);
      const fieldKey = firstString(record.fieldKey, record.field_key, record.key, 'text');
      const currentText = firstString(record.currentText, record.current_text);
      const currentVisibleText = firstString(record.currentVisibleText, record.current_visible_text, currentText);
      if (!elementId || !currentVisibleText) return null;
      return {
        elementId,
        fieldKey,
        fieldPath: firstString(record.fieldPath, record.field_path, `settings.${fieldKey}`),
        fieldType: firstString(record.fieldType, record.field_type),
        targetKind: firstString(record.targetKind, record.target_kind, 'text'),
        targetLabel: firstString(record.targetLabel, record.target_label, record.label, elementId),
        sectionId: firstString(record.sectionId, record.section_id),
        sectionIndex: Number(record.sectionIndex ?? record.section_index ?? 0),
        sectionName: firstString(record.sectionName, record.section_name),
        currentText,
        currentVisibleText,
        valueFormat: firstString(record.valueFormat, record.value_format, 'plain_text'),
        dynamicDataContexts: stringArray(
          record.dynamicDataContexts,
          record.dynamic_data_contexts,
        ),
      };
    })
    .filter(Boolean);
}

export function findBricksAgentTarget(targets, elementId, fieldKey = '') {
  const normalized = normalizeBricksAgentTargets(targets);
  const id = firstString(elementId);
  const key = firstString(fieldKey);
  if (!id) return null;
  return normalized.find((target) => target.elementId === id && (!key || target.fieldKey === key))
    || normalized.find((target) => target.elementId === id)
    || null;
}

export function indexBricksAgentTargets(targets) {
  const index = new Map();
  normalizeBricksAgentTargets(targets).forEach((target) => {
    index.set(`${target.elementId}:${target.fieldKey}`, target);
    if (!index.has(target.elementId)) index.set(target.elementId, target);
  });
  return index;
}
