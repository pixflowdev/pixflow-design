import type { AgentEvent, ProjectFile } from '../../types';

/** Only explicit, unfinished generation calls drive the placeholder. Prose is not progress. */
export function pendingMediaGenerations(events: AgentEvent[], streaming: boolean): Array<{ id: string; kind: 'image' | 'video'; startedAtMs?: number }> {
  if (!streaming) return [];
  const settled = new Set(events.flatMap(event => event.kind === 'tool_result' ? [event.toolUseId] : []));
  return events.flatMap(event => {
    if (event.kind !== 'tool_use' || settled.has(event.id)) return [];
    const name = event.name.toLowerCase().split(/[./]/).pop() ?? '';
    const input = event.input && typeof event.input === 'object' ? event.input as Record<string, unknown> : {};
    if (event.name === 'codex.imagegen' && typeof input.startedAtMs === 'number' && Number.isFinite(input.startedAtMs)) {
      return [{ id: event.id, kind: 'image' as const, startedAtMs: input.startedAtMs }];
    }
    const providerImage = name === 'bash' && typeof input.command === 'string'
      && /(?:^|\s)(?:od|\$env:OD_BIN|\$OD_BIN|["']\$OD_BIN["'])\s+media\s+generate\b[^;&|\n]*?--surface(?:=|\s+)image\b/i.test(input.command);
    const kind = /(?:^|__)generate_video$/.test(name) ? 'video'
      : providerImage || /(?:^|__)(?:generate_image|image_generation|imagegen)$/.test(name) ? 'image' : null;
    return kind ? [{ id: event.id, kind }] : [];
  });
}

export function isInlineMedia(file: ProjectFile): boolean {
  return file.type !== 'dir' && (file.kind === 'image' || file.kind === 'video');
}
