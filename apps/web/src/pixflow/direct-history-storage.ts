import { steeringTranscriptEvents } from './steering-messages';
/** Display diagnostics are expendable; prompts, attachments and execution state are not. */
export function withoutTranscriptEvents(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return metadata;
  const result = { ...metadata } as Record<string, unknown>;
  for (const key of ['messages', 'initial']) {
    if (Array.isArray(result[key])) result[key] = result[key].map(message => {
      if (!message || typeof message !== 'object') return message;
      const { events, ...rest } = message;
      const steering = steeringTranscriptEvents(events);
      return steering.length ? { ...rest, events: steering } : rest;
    });
  }
  return result;
}
