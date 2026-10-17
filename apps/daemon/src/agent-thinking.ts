type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
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

function nestedText(record: JsonRecord, path: string[]): string {
  let current: unknown = record;
  for (const key of path) {
    if (!isRecord(current)) return '';
    current = current[key];
  }
  return textFrom(current);
}

function firstNonEmpty(values: string[]): string {
  for (const value of values) {
    const text = value.trim();
    if (text) return value;
  }
  return '';
}

/**
 * Normalise public provider/CLI thinking summaries into Pixflow's canonical
 * thinking delta channel. This intentionally avoids raw hidden reasoning
 * event names and only accepts fields providers expose as stream text,
 * summaries, or documented reasoning-content deltas.
 */
export function extractPublicThinkingDelta(payload: unknown): string {
  if (!isRecord(payload)) return '';

  const eventType = textFrom(payload.type);
  const delta = isRecord(payload.delta) ? payload.delta : null;
  const item = isRecord(payload.item) ? payload.item : null;
  const message = isRecord(payload.message) ? payload.message : null;
  const content = isRecord(payload.content) ? payload.content : null;
  const part = isRecord(payload.part) ? payload.part : null;

  if (
    eventType === 'thinking_delta' ||
    eventType === 'reasoning_delta' ||
    eventType === 'reasoning_summary_delta' ||
    eventType === 'response.reasoning_summary_text.delta'
  ) {
    return firstNonEmpty([
      textFrom(payload.delta),
      textFrom(payload.text),
      textFromParts(payload.content),
      nestedText(payload, ['data', 'deltaContent']),
    ]);
  }

  if (
    eventType === 'response.reasoning_summary_part.added' ||
    eventType === 'response.reasoning_summary_part.done'
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
    ]);
  }

  if (item) {
    const explicit = firstNonEmpty([
      textFrom(item.reasoning_summary),
      textFrom(item.thinking),
      nestedText(item, ['content', 'reasoning_summary']),
    ]);
    if (explicit) return explicit;

    // Codex/OpenAI reasoning items expose their public summary through the
    // otherwise-generic `summary`/`content` fields. Only accept those fields
    // when the item is explicitly typed as reasoning; assistant message
    // content must remain on the normal text channel.
    const itemType = textFrom(item.type).toLowerCase();
    if (itemType === 'reasoning' || itemType === 'thinking') {
      return firstNonEmpty([
        textFromParts(item.summary),
        textFromParts(item.content),
        nestedText(item, ['content', 'summary']),
      ]);
    }
    return '';
  }

  if (message) {
    return firstNonEmpty([
      textFrom(message.reasoning_content),
      textFrom(message.reasoning_summary),
      textFrom(message.thinking),
    ]);
  }

  if (content) {
    return firstNonEmpty([
      textFrom(content.reasoning_content),
      textFrom(content.reasoning_summary),
      textFrom(content.thinking),
    ]);
  }

  return firstNonEmpty([
    textFrom(payload.reasoning_content),
    textFrom(payload.reasoning_summary),
    textFrom(payload.thinking_summary),
    textFrom(payload.thinking),
  ]);
}

/**
 * Extract only provider-declared public reasoning summaries from BYOK wire
 * payloads. Raw `reasoning_content`, `thinking`, and equivalent hidden
 * chain-of-thought fields are intentionally excluded from this boundary.
 */
export function extractByokPublicReasoningSummary(payload: unknown): string {
  if (!isRecord(payload)) return '';

  const eventType = textFrom(payload.type);
  const delta = isRecord(payload.delta) ? payload.delta : null;
  if (
    eventType === 'response.reasoning_summary_text.delta' ||
    eventType === 'reasoning_summary_delta'
  ) {
    return firstNonEmpty([textFrom(payload.delta), textFrom(payload.text)]);
  }
  if (
    eventType === 'content_block_delta' &&
    delta &&
    (delta.type === 'thinking_summary_delta' || delta.type === 'reasoning_summary_delta')
  ) {
    return firstNonEmpty([
      textFrom(delta.text),
      textFrom(delta.summary),
      textFrom(delta.delta),
    ]);
  }

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  for (const choice of choices) {
    if (!isRecord(choice) || !isRecord(choice.delta)) continue;
    const summary = firstNonEmpty([
      textFrom(choice.delta.reasoning_summary),
      textFrom(choice.delta.thinking_summary),
    ]);
    if (summary) return summary;
  }

  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  for (const candidate of candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content)) continue;
    const parts = Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
    for (const candidatePart of parts) {
      if (!isRecord(candidatePart)) continue;
      if (candidatePart.thoughtSummary === true || candidatePart.type === 'reasoning_summary') {
        const summary = textFrom(candidatePart.text);
        if (summary.trim()) return summary;
      }
    }
  }

  return '';
}
