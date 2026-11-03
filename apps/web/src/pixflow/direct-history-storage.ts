import type { AgentEvent } from '../types';
import { isGeneratedMediaReceipt } from '../components/chat/media-generation';
import { steeringTranscriptEvents } from './steering-messages';
export function compactTranscriptEvents(events: unknown[] | undefined): AgentEvent[] {
  const steering = new Set<unknown>(steeringTranscriptEvents(events));
  return (events ?? []).filter((event): event is AgentEvent => steering.has(event) || isGeneratedMediaReceipt(event));
}

/** Display diagnostics are expendable; prompts, attachments and execution state are not. */
export function withoutTranscriptEvents(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return metadata;
  const result = { ...metadata } as Record<string, unknown>;
  for (const key of ['messages', 'initial']) {
    if (Array.isArray(result[key])) result[key] = result[key].map(message => {
      if (!message || typeof message !== 'object') return message;
      const { events, ...rest } = message;
      const retained = compactTranscriptEvents(events);
      return retained.length ? { ...rest, events: retained } : rest;
    });
  }
  return result;
}
