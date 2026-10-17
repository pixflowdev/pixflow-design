/** Mentions are reference hints, never a capability allowlist. */
export function directSkillMentions(meta?: { skillIds?: unknown; context?: { skillIds?: unknown } }): string[] {
  return [...new Set([meta?.skillIds, meta?.context?.skillIds].flatMap(value => Array.isArray(value) ? value : [])
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '').map(value => value.trim()))];
}

/** Menu-only retirement: saved mentions and skills.list/read keep these references. */
const retiredMentionShortcuts = new Set([
  'build-in-bricks-html-first', 'bricks-native-prototype', 'element-controls',
  'bricks-forms', 'bricks-interactions', 'bricks-schema',
]);

export function isDiscoverableSkillMention(id: string): boolean {
  return !retiredMentionShortcuts.has(id)
    && (!id.startsWith('wordpress-gutenberg-') || id === 'wordpress-gutenberg-authoring');
}
