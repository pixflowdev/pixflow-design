/** Durable composer attachments keep their full reference text in saved drafts. */
export type ContextAttachment = { label: string; content: string };
const marker = '[Pixflow context attachment]';
export function formatContextAttachment(value: ContextAttachment): string {
  return `${marker}${JSON.stringify(value)}[/Pixflow context attachment]`;
}
export function contextAttachmentParts(text: string): Array<string | ContextAttachment> {
  const parts: Array<string | ContextAttachment> = [];
  const pattern = /\[Pixflow context attachment\](\{[^\n]*?\})\[\/Pixflow context attachment\]/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    try {
      const value = JSON.parse(match[1]!);
      if (!value || typeof value.label !== 'string' || !value.label.trim() || value.label.length > 160 || typeof value.content !== 'string' || !value.content) continue;
      parts.push(text.slice(offset, match.index), { label: value.label, content: value.content });
      offset = match.index! + match[0].length;
    } catch { /* Invalid or old drafts remain readable and unchanged. */ }
  }
  parts.push(text.slice(offset));
  return parts;
}
