/** The embedding root owns direction; no rule may depend on WordPress's html direction. */
export function scopeWordPressLanguageSelector(selector: string, scope: string): string | null {
  const direction = selector.match(/^(?:html)?(\[dir=(?:"(?:rtl|ltr)"|'(?:rtl|ltr)'|rtl|ltr)\])(\s+.+)?$/);
  if (direction) return `${scope}${direction[1]}${direction[2] ?? ''}`;
  const language = selector.match(/^(:lang\([\w-]+\))(\s+.+)?$/);
  return language ? `${scope}${language[1]}${language[2] ?? ''}` : null;
}
