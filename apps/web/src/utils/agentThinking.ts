type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function textFrom(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function textPartFrom(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return '';
  return firstNonEmpty([
    textFrom(value.text),
    textFrom(value.delta),
    textFrom(value.content),
    textFrom(value.summary),
    textFrom(value.reasoning),
    textFrom(value.reasoning_content),
    textFrom(value.reasoning_summary),
    textFrom(value.thinking),
    textFrom(value.thinking_summary),
  ]);
}

function textFromParts(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return textPartFrom(value);
  return value
    .map(textPartFrom)
    .filter((part) => part.trim().length > 0)
    .join('\n');
}

function nestedText(record: UnknownRecord, path: string[]): string {
  let current: unknown = record;
  for (const key of path) {
    if (!isRecord(current)) return '';
    current = current[key];
  }
  return textFrom(current);
}

function firstNonEmpty(values: string[]): string {
  for (const value of values) {
    if (value.trim()) return value;
  }
  return '';
}

export function extractPublicThinkingText(payload: unknown): string {
  if (!isRecord(payload)) return '';

  const event = isRecord(payload.event) ? payload.event : null;
  if (event) {
    const nested = extractPublicThinkingText(event);
    if (nested) return nested;
  }

  const type = textFrom(payload.type);
  const kind = textFrom(payload.kind);
  const delta = isRecord(payload.delta) ? payload.delta : null;
  const item = isRecord(payload.item) ? payload.item : null;
  const message = isRecord(payload.message) ? payload.message : null;
  const content = isRecord(payload.content) ? payload.content : null;
  const part = isRecord(payload.part) ? payload.part : null;

  if (
    type === 'thinking_delta' ||
    type === 'reasoning_delta' ||
    type === 'reasoning_summary_delta' ||
    type === 'response.reasoning_summary_text.delta' ||
    kind === 'thinking' ||
    kind === 'reasoning_summary'
  ) {
    return firstNonEmpty([
      textFrom(payload.delta),
      textFrom(payload.text),
      textFromParts(payload.content),
      nestedText(payload, ['data', 'deltaContent']),
    ]);
  }

  if (
    type === 'response.reasoning_summary_part.added' ||
    type === 'response.reasoning_summary_part.done'
  ) {
    return firstNonEmpty([
      part ? textFromParts(part.text) : '',
      part ? textFromParts(part.summary) : '',
      part ? textFromParts(part.content) : '',
      textFrom(payload.text),
    ]);
  }

  if (delta) {
    return firstNonEmpty([
      textFrom(delta.reasoning_content),
      textFrom(delta.reasoning_summary),
      textFrom(delta.thinking),
      textFromParts(delta.summary),
      textFromParts(delta.content),
      nestedText(delta, ['data', 'deltaContent']),
    ]);
  }

  if (item) {
    return firstNonEmpty([
      textFrom(item.reasoning_summary),
      textFromParts(item.summary),
      textFrom(item.thinking),
      textFromParts(item.content),
      nestedText(item, ['content', 'reasoning_summary']),
      nestedText(item, ['content', 'summary']),
    ]);
  }

  if (message) {
    return firstNonEmpty([
      textFrom(message.reasoning_content),
      textFrom(message.reasoning_summary),
      textFrom(message.thinking),
      textFromParts(message.summary),
      textFromParts(message.content),
    ]);
  }

  if (content) {
    return firstNonEmpty([
      textFrom(content.reasoning_content),
      textFrom(content.reasoning_summary),
      textFrom(content.thinking),
      textFromParts(content.summary),
      textFromParts(content.content),
    ]);
  }

  return firstNonEmpty([
    textFrom(payload.reasoning_content),
    textFrom(payload.reasoning_summary),
    textFrom(payload.thinking_summary),
    textFrom(payload.thinking),
    textFromParts(payload.summary),
    textFromParts(payload.content),
  ]);
}
