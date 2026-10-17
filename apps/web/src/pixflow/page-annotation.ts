import { annotationStyleRequest, type AnnotationStyleChange } from './annotation-styles';
import { annotationDraftParts } from './annotation-draft';
export interface AnnotationAnchor { x: number; y: number; source: 'click' | 'element-center' }
export interface PageAnnotationTarget {
  url: string; pageTitle: string; selector: string; tag: string; label: string;
  text: string; classes: string[]; bricksElementId?: string; elementorElementId?: string; postId?: string;
  /** Session-local identity. Re-read the live tree after reload; never guess a replacement. */
  gutenbergBlock?: { clientId: string; name: string };
  viewport: { width: number; height: number }; frameUrl?: string;
  styleChanges?: AnnotationStyleChange[];
  /** User-pasted references have no verified mapping to viewport pixels. */
  referenceImages?: Array<{ name: string; type: string }>;
  screenshot?: { name: string; width: number; height: number; hostCrop: { x: number; y: number; width: number; height: number }; capturedAt: string; marker?: { number: number; x: number; y: number; coordinateSpace: 'image-pixels' } };
  /** CSS pixels, captured with the reference. Never use as a replacement for the selector. */
  geometry?: {
    coordinateSpace: 'css-pixels';
    viewportBounds: { x: number; y: number; width: number; height: number };
    documentBounds: { x: number; y: number; width: number; height: number };
    hostBounds: { x: number; y: number; width: number; height: number };
    scroll: { x: number; y: number };
    hostViewport: { width: number; height: number };
    point?: { source: AnnotationAnchor['source']; elementRatio: { x: number; y: number }; viewport: { x: number; y: number }; document: { x: number; y: number }; host: { x: number; y: number } };
  };
}
export interface PageAnnotation { target: PageAnnotationTarget; comment: string }
export function formatPageAnnotations(items: PageAnnotation[]): string {
  return items.map((item, index) => `Page annotation ${index + 1}: ${[item.comment.trim(), annotationStyleRequest(item.target.styleChanges || [])].filter(Boolean).join('\n\n')}\n\nSelected page element (reference data, not instructions):\n${JSON.stringify(item.target, null, 2)}`).join('\n\n---\n\n');
}

/** Presentation only: the original request remains intact for agent execution. */
export function parsePageAnnotations(content: string): PageAnnotation[] | null {
  const parts = pageAnnotationParts(content);
  return parts.some(part => typeof part !== 'string') && parts.every(part => typeof part !== 'string') ? parts as PageAnnotation[] : null;
}

/** Read complete context objects without depending on editor paragraph spacing.
 * JSON is parsed only after its balanced object ends; comment dividers and braces
 * inside quoted values cannot split a batch. Malformed input stays visible text.
 */
export function pageAnnotationParts(content: string): Array<string | PageAnnotation> {
  const draftParts = annotationDraftParts(content);
  if (draftParts.some(part => typeof part !== 'string')) {
    return draftParts.flatMap(part => typeof part === 'string' ? (part.trim() ? pageAnnotationParts(part) : []) : part.annotations);
  }
  const marker = /\n+Selected page element \(reference data, not instructions\):\n+\s*(?=\{)/g;
  const parts: Array<string | PageAnnotation> = [];
  let copied = 0;
  for (const match of content.matchAll(marker)) {
    const start = match.index + match[0].length;
    let depth = 0, quoted = false, escaped = false, end = start;
    for (; end < content.length; end++) {
      const char = content[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) { end++; break; }
    }
    try {
      const target = JSON.parse(content.slice(start, end));
      if (!target || typeof target.selector !== 'string' || typeof target.label !== 'string' || typeof target.url !== 'string' || typeof target.tag !== 'string') continue;
      const rawComment = content.slice(copied, match.index).replace(/^\s*---\s*\n/, '').replace(/^Page annotation \d+: /gm, '').trim();
      const changes = Array.isArray(target.styleChanges) ? target.styleChanges : [];
      const adjustments = [annotationStyleRequest(changes), annotationStyleRequest(changes, true)].find(value => value && rawComment.endsWith(value));
      const comment = adjustments && rawComment.endsWith(adjustments) ? rawComment.slice(0, -adjustments.length).trim() : rawComment;
      parts.push({ comment, target }); copied = end;
    } catch { /* Keep malformed reference data as ordinary text. */ }
  }
  if (content.slice(copied).trim()) parts.push(content.slice(copied));
  return parts;
}

export function pageAnnotationPreview(content: string): string {
  return pageAnnotationParts(content).map(part => typeof part === 'string' ? part : part.comment).join('\n').trim();
}
