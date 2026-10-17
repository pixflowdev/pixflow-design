import type { AgentEvent, ChatMessage } from '../types';

function segmentEvents(events: AgentEvent[], content: string): AgentEvent[] {
  if (events.filter(event => event.kind === 'text').map(event => event.text).join('') === content) return events;
  return [...events.filter(event => event.kind !== 'text'), ...(content ? [{ kind: 'text' as const, text: content }] : [])];
}

/** Accepted guidance and its native display boundaries survive diagnostic cleanup. */
export function steeringTranscriptEvents(events: unknown[] | undefined): AgentEvent[] {
  return (events ?? []).filter((event): event is AgentEvent =>
    !!event && typeof event === 'object' && ['steering_message', 'assistant_message_boundary'].includes(String((event as { kind?: string }).kind)));
}

type Steering = Extract<AgentEvent, { kind: 'steering_message' }>;

/** Only durable accepted events can clear an uncertain delivery after recovery. */
export function acceptedSteeringMessageIds(messages: readonly { events?: unknown[] }[]): string[] {
  return [...new Set(messages.flatMap(message => (message.events ?? [])
    .filter((event): event is Steering => !!event && typeof event === 'object'
      && (event as AgentEvent).kind === 'steering_message' && typeof (event as Steering).id === 'string').map(event => event.id)))];
}

/** Display admission never delays native delivery or cuts a streaming message in half. */
export function expandSteeringMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.flatMap(message => {
    const timeline = message.events ?? [];
    if (message.role !== 'assistant' || !timeline.some(event => event.kind === 'steering_message')) return [message];
    const terminal = !!message.endedAt || ['succeeded', 'failed', 'canceled'].includes(message.runStatus ?? '');
    const completions = new Map<string, { offset: number; index: number }>();
    timeline.forEach((event, index) => {
      if (event.kind === 'assistant_message_boundary' && event.phase === 'completed') completions.set(event.messageId, { offset: event.contentOffset, index: index + 1 });
    });
    const placements: { event: Steering; offset: number; index: number }[] = [];
    const seen = new Set<string>();
    let activeItem: string | null = null;
    timeline.forEach((event, index) => {
      if (event.kind === 'assistant_message_boundary') {
        if (event.phase === 'started') activeItem = event.messageId;
        else if (activeItem === event.messageId) activeItem = null;
      }
      if (event.kind !== 'steering_message' || seen.has(event.id)) return;
      seen.add(event.id);
      const boundary = activeItem ? completions.get(activeItem) : undefined;
      // Recovery of a stopped/disconnected item still retains every accepted steer.
      if (activeItem && !boundary && !terminal) return;
      placements.push({ event, offset: boundary?.offset ?? (activeItem ? message.content.length : event.contentOffset), index: boundary?.index ?? (activeItem ? timeline.length : index + 1) });
    });
    if (!placements.length) return [message];
    const rows: ChatMessage[] = [];
    let offset = 0, eventOffset = 0, segment = 0;
    for (const placement of placements) {
      const end = Math.max(offset, Math.min(message.content.length, Number.isFinite(placement.offset) ? placement.offset : offset));
      const content = message.content.slice(offset, end);
      const endIndex = Math.max(eventOffset, placement.index);
      const events = timeline.slice(eventOffset, endIndex).filter(event => event.kind !== 'steering_message');
      if (content || events.some(event => !['text', 'assistant_message_boundary'].includes(event.kind))) rows.push({ ...message, id: `${message.id}:before-steer:${segment++}`, content,
        events: segmentEvents(events, content), runStatus: 'succeeded', endedAt: placement.event.createdAt });
      const event = placement.event;
      rows.push({ id: `${message.id}:steer:${event.id}`, role: 'user', content: event.text, createdAt: event.createdAt,
        attachments: event.attachments, commentAttachments: event.commentAttachments, sessionMode: message.sessionMode });
      offset = end; eventOffset = endIndex;
    }
    const content = message.content.slice(offset);
    const events = timeline.slice(eventOffset).filter(event => event.kind !== 'steering_message');
    // An acknowledgement does not start a new response. Keep the existing live
    // footer on the completed text until actual follow-up text or activity arrives.
    if (content || events.some(event => !['text', 'assistant_message_boundary'].includes(event.kind))) rows.push({ ...message, content,
      // Preserve acceptance evidence on this display continuation so its footer
      // stays Working during tools/thinking rather than restarting at Preparing.
      events: segmentEvents([...timeline.filter(event => event.kind === 'steering_message'), ...events], content) });
    else {
      const lastAssistant = [...rows].reverse().find(row => row.role === 'assistant');
      if (lastAssistant) Object.assign(lastAssistant, { id: message.id, runStatus: message.runStatus, endedAt: message.endedAt });
    }
    return rows;
  });
}

/** Include delivered guidance when composing a later turn's history. */
export function steeringPromptHistory(messages: Array<{ role?: string; content?: string; events?: unknown[] }>) {
  return expandSteeringMessages(messages.map((message,index) => ({ ...message, id: `history-${index}`,
    role: message.role === 'user' ? 'user' : 'assistant', content: message.content || '', events: message.events as AgentEvent[] | undefined })))
    .filter(message => message.content).map(({role,content}) => ({role,content}));
}
