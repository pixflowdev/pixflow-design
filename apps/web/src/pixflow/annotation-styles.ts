export interface AnnotationStyleChange { property: string; label: string; previousValue: string; value: string }
export const annotationStyleScope = 'Apply these adjustments only to the selected element on the identified page unless the user explicitly asks for a shared change. Check shared-class usage before editing: preserve existing shared rules and use a native element override or a new page-specific class when other elements or pages use them. Preserve the authored CSS variable expressions.';
export function annotationStyleRequest(changes: AnnotationStyleChange[], legacy = false): string {
  return changes.length ? `Requested element adjustments:\n${changes.map(change => `- ${change.label}: ${change.previousValue || '(not set)'} → ${change.value}`).join('\n')}\nSave these through the active builder’s native settings or stylesheet system. The temporary preview is not a saved change.${legacy ? '' : `\n${annotationStyleScope}`}` : '';
}
