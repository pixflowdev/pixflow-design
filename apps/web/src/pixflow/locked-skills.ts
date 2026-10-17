import type { LockedSkillSummary } from '@open-design/contracts';

/** Keep upsell metadata separate from agent catalogues and selected mentions. */
export function readLockedSkills(value: unknown): LockedSkillSummary[] {
  const list = value && typeof value === 'object' ? (value as {lockedSkills?: unknown}).lockedSkills : null;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  return list.slice(0, 128).flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    if (item.requiresPro !== true || typeof item.id !== 'string' || !/^[a-z0-9_-]{1,160}$/.test(item.id) || seen.has(item.id)) return [];
    seen.add(item.id);
    return [{id: item.id, name: String(item.name || item.id).slice(0, 160), description: String(item.description || '').slice(0, 400), requiresPro: true as const}];
  });
}
