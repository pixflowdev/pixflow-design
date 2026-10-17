import type { AgentEvent, ProjectFile } from '../../types';

/** Only explicit, unfinished generation calls drive the placeholder. Prose is not progress. */
export function pendingMediaGenerations(events: AgentEvent[], streaming: boolean): Array<{ id: string; kind: 'image' | 'video' }> {
  if (!streaming) return [];
  const settled = new Set(events.flatMap(event => event.kind === 'tool_result' ? [event.toolUseId] : []));
  return events.flatMap(event => {
    if (event.kind !== 'tool_use' || settled.has(event.id)) return [];
    const name = event.name.toLowerCase().split(/[./]/).pop() ?? '';
    const kind = /(?:^|__)generate_video$/.test(name) ? 'video'
      : /(?:^|__)(?:generate_image|imagegen)$/.test(name) ? 'image' : null;
    return kind ? [{ id: event.id, kind }] : [];
  });
}

export function isInlineMedia(file: ProjectFile): boolean {
  return file.type !== 'dir' && (file.kind === 'image' || file.kind === 'video');
}
