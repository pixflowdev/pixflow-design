import type { AgentEvent, ChatMessage } from '../types';

/** Keep one persisted run owner while presenting spoken turns as normal chat rows. */
export function expandVoiceMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.flatMap(message => {
    if (message.role !== 'assistant' || !message.events?.some(event => event.kind === 'voice_transcript')) return [message];
    const sourceEvents = message.events;
    // Spoken rows retain their identity after transcript events become prose.
    message = { ...message, agentName: 'Codex Voice' };
    const rows: ChatMessage[] = [];
    let events: AgentEvent[] = [];
    let content = '';
    let segment = 0;
    let connection: AgentEvent | undefined;
    const flush = () => {
      if (events.some(event => event.kind === 'voice_transcript' && event.role === 'assistant')) {
        const written = events.some(event => event.kind === 'text' && event.text.trim());
        events = events.filter(event => !written || event.kind !== 'voice_transcript').map(event => event.kind === 'voice_transcript' ? { kind: 'text' as const, text: event.text + '\n\n' } : event);
        content = events.filter(event => event.kind === 'text').map(event => event.text).join('').trimEnd();
      }
      if (!content && !events.some(event => event.kind !== 'status')) { events = []; return; }
      rows.push({ ...message, id: `${message.id}:voice:${segment++}`, content, events, runStatus: 'succeeded' });
      content = ''; events = [];
    };
    for (const event of sourceEvents) {
      if (event.kind === 'status' && event.code === 'voice_connection') { connection = event; continue; }
      if (event.kind === 'voice_transcript') {
        if (!event.text.trim()) continue;
        if (event.role === 'user') {
          flush();
          const previous = rows.at(-1);
          // Legacy native completions followed the browser's partial user row.
          if (!event.id && previous?.role === 'user') { previous.content = event.text; continue; }
          rows.push({ id: `${message.id}:voice:${segment++}`, role: 'user', content: event.text, createdAt: message.createdAt });
        } else {
          const text = `${content ? '\n\n' : ''}${event.text}`;
          content += text; events.push(event);
        }
      } else {
        events.push(event);
        if (event.kind === 'text') content += event.text;
      }
    }
    // Only the tail owns streaming state, stop controls, errors and continuation.
    if (events.some(event => event.kind === 'voice_transcript' && event.role === 'assistant')) {
      const written = events.some(event => event.kind === 'text' && event.text.trim());
      events = events.filter(event => !written || event.kind !== 'voice_transcript').map(event => event.kind === 'voice_transcript' ? { kind: 'text' as const, text: event.text + '\n\n' } : event);
      content = events.filter(event => event.kind === 'text').map(event => event.text).join('').trimEnd();
    }
    rows.push({ ...message, content, events: [...events, ...(connection ? [connection] : [])] });
    return rows;
  });
}
