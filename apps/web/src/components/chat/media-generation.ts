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

/** A completed Media import is visible message content even in compact history. */
export function isGeneratedMediaReceipt(event: unknown): event is Extract<AgentEvent, {kind:'tool_result'}> {
  if (!event || typeof event !== 'object') return false;
  const result = event as Partial<Extract<AgentEvent, {kind:'tool_result'}>>;
  return result.kind === 'tool_result' && !result.isError && typeof result.content === 'string'
    && result.content.startsWith('{"pixflowGeneratedMedia":');
}

type ChatImage = { attachmentId?: number; url: string; title: string };

export function transcriptImageCards(events: AgentEvent[], origin: string, wordpressText: string): ChatImage[] {
  const cards = new Map<string, ChatImage>(importedImageCards(events, origin).map(card => [card.url, card]));
  if (!wordpressText.includes('![')) return [...cards.values()];
  const prose = wordpressText.replace(/```[\s\S]*?(?:```|$)|`[^`\n]*`/g, '');
  for (const match of prose.matchAll(/!\[([^\]]*)\]\(([^\s)]+)\)/g)) {
    let url: URL;
    try { url = new URL(match[2]!, origin); } catch { continue; }
    if (url.origin === origin && /\/uploads\//.test(url.pathname) && !cards.has(url.href)) {
      cards.set(url.href, { url: url.href, title: match[1] || '' });
    }
  }
  return [...cards.values()];
}

export function importedImageCards(events: AgentEvent[], origin: string) {
  const images = new Map<number, {attachmentId:number; url:string; libraryUrl:string; title:string}>();
  for (const event of events) {
    if (!isGeneratedMediaReceipt(event)) continue;
    try {
      const media = JSON.parse(event.content).pixflowGeneratedMedia;
      const link = new URL(media.libraryUrl);
      const image = new URL(media.url);
      if (link.origin !== origin || !Number.isSafeInteger(media.attachmentId) || media.attachmentId <= 0
        || link.searchParams.get('pixflow_media_id') !== String(media.attachmentId)
        || !['https:', 'http:'].includes(image.protocol)) continue;
      images.set(media.attachmentId, {attachmentId:media.attachmentId, url:image.href, libraryUrl:link.href,title:String(media.title || '')});
    } catch { /* A malformed receipt cannot open a library item. */ }
  }
  return Array.from(images.values());
}
