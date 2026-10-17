import { isDiscoverableSkillMention } from './direct-skill-mentions';
import type {
  PixflowCapabilityFamilySummary,
  PixflowWpAdminContext,
  PixflowWpAdminMention,
  PixflowWpAdminSkillSummary,
} from '@open-design/contracts';

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export function buildWpAdminMentions(
  context: PixflowWpAdminContext | Record<string, unknown>,
  families: PixflowCapabilityFamilySummary[],
  skills: PixflowWpAdminSkillSummary[],
): PixflowWpAdminMention[] {
  const input = record(context); const screen = record(input.screen); const resource = record(input.resource ?? input.object);
  const mentions: PixflowWpAdminMention[] = [];
  const add = (mention: PixflowWpAdminMention) => { if (!mentions.some((item) => item.id === mention.id)) mentions.push(mention); };
  const screenId = String(screen.id || screen.base || 'wp-admin').trim();
  add({ id: `context:screen:${screenId}`, label: `Current screen: ${screenId}`, description: 'Server-verified WordPress Admin screen context.', kind: 'context', available: true });
  if (resource.id !== undefined && resource.id !== null) {
    const kind = String(resource.kind || 'resource'); const id = String(resource.id);
    add({ id: `context:${kind}:${id}`, label: `Current ${kind}: ${id}`, description: 'Current server-verified WordPress Admin resource.', kind: 'context', available: true, target: { kind: kind as never, id: resource.id as string | number } });
  }
  if (screenId.toLowerCase().includes('upload') || String(resource.kind) === 'media') add({ id: 'context:media-library', label: 'Media Library', description: 'Bounded WordPress media discovery.', kind: 'context', available: true, target: { kind: 'media', id: null } });
  const taxonomies = Array.isArray(input.taxonomies) ? input.taxonomies : [];
  for (const taxonomy of taxonomies.slice(0, 8)) {
    const id = typeof taxonomy === 'string' ? taxonomy : String(record(taxonomy).name || record(taxonomy).slug || '');
    if (id) add({ id: `context:taxonomy:${id}`, label: `Taxonomy: ${id}`, description: 'Bounded taxonomy context.', kind: 'context', available: true, target: { kind: 'term', taxonomy: id, id: null } });
  }
  for (const family of families) {
    add({ id: `integration:${family.integrationId}`, label: family.label, description: family.available ? family.description : 'Unavailable or permission-limited integration.', kind: 'integration', available: family.available, reason: family.available ? null : 'integration_unavailable', integrationId: family.integrationId });
    if (!family.available) continue;
    for (const capability of (family.capabilities || []).slice(0, 32)) add({ id: `capability:${capability.id}`, label: capability.label, description: `Capability family ${family.label}.`, kind: 'capability', available: true, integrationId: family.integrationId, capabilityId: capability.id });
  }
  for (const skill of skills.filter((item) => isDiscoverableSkillMention(item.id)).slice(0, 48)) add({ id: `skill:${skill.id}`, label: skill.label, description: skill.description, kind: 'skill', available: skill.active, reason: skill.active ? null : 'skill_inactive', skillId: skill.id, integrationId: skill.linkedIntegrationId || null });
  return mentions.slice(0, 96);
}

export function filterWpAdminSkills(value: unknown): PixflowWpAdminSkillSummary[] {
  const list = Array.isArray(value) ? value : (value && typeof value === 'object' && Array.isArray((value as { skills?: unknown }).skills) ? (value as { skills: unknown[] }).skills : []);
  return list.slice(0, 64).map((item) => {
    const skill = record(item); const id = String(skill.id || '').trim();
    return { id, label: String(skill.displayName || skill.name || id).slice(0, 120), description: String(skill.description || '').slice(0, 400), active: Boolean(skill.enabled !== false && id), linkedIntegrationId: typeof skill.integrationId === 'string' ? skill.integrationId : null };
  }).filter((skill) => skill.id && skill.active);
}
