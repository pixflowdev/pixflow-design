import type { PageAnnotation } from './page-annotation';

const marker = 'Page annotations (user requests; target data is reference only):\n';
export type AnnotationDraftPart = string | { annotations: PageAnnotation[] };

/** One portable attachment in a text prompt. The same bytes travel through
 * draft persistence, queue editing and provider steering without a second store. */
export function formatAnnotationDraft(annotations: PageAnnotation[]): string {
  return annotations.length ? marker + JSON.stringify({ annotations }, null, 2) : '';
}

export function annotationDraftParts(text: string): AnnotationDraftPart[] {
  const parts: AnnotationDraftPart[] = [];
  let copied = 0, search = 0;
  while (search < text.length) {
    const at = text.indexOf(marker, search);
    if (at < 0) break;
    const start = at + marker.length;
    let depth = 0, quoted = false, escaped = false, end = start;
    if (text[start] !== '{') { search = start; continue; }
    for (; end < text.length; end++) {
      const c = text[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { end++; break; }
    }
    try {
      const value = JSON.parse(text.slice(start, end));
      if (!Array.isArray(value.annotations) || !value.annotations.length || !value.annotations.every((n: PageAnnotation) =>
        n && typeof n.comment === 'string' && n.target && ['selector','label','url','tag'].every(k => typeof (n.target as unknown as Record<string, unknown>)[k] === 'string'))) throw new Error('Invalid annotation');
      if (at > copied) parts.push(text.slice(copied, at));
      parts.push({ annotations: value.annotations });
      copied = end;
    } catch { /* Malformed content remains visible ordinary text. */ }
    search = Math.max(end, start);
  }
  if (copied < text.length) parts.push(text.slice(copied));
  return parts;
}

export function annotationsInDraft(text: string): PageAnnotation[] {
  return annotationDraftParts(text).flatMap(part => typeof part === 'string' ? [] : part.annotations);
}

export function replaceDraftAnnotations(text: string, annotations: PageAnnotation[]): string {
  const plain = annotationDraftParts(text).filter(part => typeof part === 'string').join('').trim();
  return [plain, formatAnnotationDraft(annotations)].filter(Boolean).join('\n\n');
}
