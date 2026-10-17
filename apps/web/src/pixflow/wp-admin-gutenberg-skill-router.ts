import type {
  PixflowWpAdminSkillSummary,
} from '@open-design/contracts';

export type WpAdminPromptSkillCatalogue = {
  skills: PixflowWpAdminSkillSummary[];
  branches: PixflowWpAdminSkillSummary[];
};

type SkillRecord = Record<string, unknown>;

function record(value: unknown): SkillRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as SkillRecord
    : {};
}

function strings(value: unknown, max = 24): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, max);
}

function normalizeSkill(value: unknown, internalFallback = false): PixflowWpAdminSkillSummary | null {
  const source = record(value);
  const id = String(source.id || '').trim();
  if (!id || source.enabled === false || source.active === false) return null;
  const instruction = String(source.instruction || source.body || '').replace(/\r\n?/g, '\n').trim().slice(0, 16_000);
  return {
    id: id.slice(0, 160),
    label: String(source.label || source.displayName || source.name || id).trim().slice(0, 160),
    description: String(source.description || source.relatedInstruction || source.instruction || '').trim().slice(0, 800),
    active: true,
    linkedIntegrationId: typeof source.integrationId === 'string'
      ? source.integrationId.slice(0, 160)
      : typeof source.linkedIntegrationId === 'string'
        ? source.linkedIntegrationId.slice(0, 160)
        : null,
    ...(instruction ? { instruction } : {}),
    ...(strings(source.relatedIds, 32).length ? { relatedIds: strings(source.relatedIds, 32) } : {}),
    internal: source.internal === true || internalFallback,
    source: source.source === 'official-library' ? 'official-library' : source.internal === true || internalFallback || source.source === 'built-in' || source.source === 'pixflow' ? 'pixflow' : 'user',
  };
}

function normalizeList(value: unknown, internalFallback = false): PixflowWpAdminSkillSummary[] {
  const items = Array.isArray(value) ? value : [];
  return items.slice(0, 256).flatMap((item) => {
    const skill = normalizeSkill(item, internalFallback);
    return skill ? [skill] : [];
  });
}

/**
 * Merge the product-owned prompt catalogue with ordinary user skill summaries.
 * Internal leaves remain addressable by the router but never become composer
 * entries. Product-owned definitions win an ID collision so a user skill cannot
 * replace the Gutenberg safety contract.
 */
export function mergeWpAdminSkillCatalogues(
  promptCatalogue: unknown,
  userCatalogue: unknown,
): WpAdminPromptSkillCatalogue {
  const prompt = record(promptCatalogue);
  const user = record(userCatalogue);
  const publicSkills = new Map<string, PixflowWpAdminSkillSummary>();
  const branches = new Map<string, PixflowWpAdminSkillSummary>();

  for (const skill of normalizeList(user.skills ?? (Array.isArray(userCatalogue) ? userCatalogue : []))) {
    publicSkills.set(skill.id, skill);
  }
  for (const item of Array.isArray(prompt.skills) ? prompt.skills : []) {
    const skill = normalizeSkill(item);
    if (skill) publicSkills.set(skill.id, { ...skill, source: record(item).source === 'user' ? 'user' : 'pixflow', internal: false });
  }
  for (const skill of normalizeList(prompt.branches, true)) {
    branches.set(skill.id, { ...skill, source: 'pixflow', internal: true });
    if (skill.id === ROOT) {
      publicSkills.set(skill.id, { ...skill, source: 'pixflow', internal: false });
    }
  }

  return {
    skills: [...publicSkills.values()],
    branches: [...branches.values()].slice(0, 256),
  };
}

const ROOT = 'wordpress-gutenberg-authoring';

/**
 * Resolve full skill bodies only from the semantic agent's validated typed
 * selection. Prompt text is deliberately absent from this API: the host may
 * constrain and load a route, but it may not invent one from vocabulary.
 */
export function activateWpAdminSkillsFromDecision(input: {
  selectedSkillIds: string[];
  skills: PixflowWpAdminSkillSummary[];
  branches: PixflowWpAdminSkillSummary[];
}): PixflowWpAdminSkillSummary[] {
  const catalogue = new Map([...input.skills, ...input.branches].map((skill) => [skill.id, skill]));
  return strings(input.selectedSkillIds, 12).flatMap((id) => {
    const skill = catalogue.get(id);
    return skill?.active && skill.instruction ? [skill] : [];
  });
}

export type WpAdminGutenbergPreparationFailurePolicy = 'repair_once' | 'fail_closed';

/**
 * Repair is limited to model-correctable block schema and structure defects.
 * Empty output, timeouts, authority, conflicts, receipts, and permissions fail
 * closed because another generation cannot make those conditions trustworthy.
 */
export function wpAdminGutenbergPreparationFailurePolicy(error: unknown): WpAdminGutenbergPreparationFailurePolicy {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  if (/\b(?:empty|timed?\s*out|did not finish|aborted|stopped|permission|forbidden|cannot edit|stale|changed|fingerprint|receipt|session|nonce|authority|context|expired|replayed|media.*missing|attachment.*missing|network|fetch)\b/.test(message)) {
    return 'fail_closed';
  }
  if (/\b(?:unavailable target-editor blocks?|invalid attribute|validation failed|block validation|parent|ancestor|allowed blocks?|nesting|could not canonicalize|disappeared during|schema|unsupported block)\b/.test(message)) {
    return 'repair_once';
  }
  return 'fail_closed';
}

export function wpAdminActivatedSkillEvidence(skills: PixflowWpAdminSkillSummary[]): Array<Record<string, unknown>> {
  return skills.slice(0, 12).map((skill) => ({
    id: skill.id,
    label: skill.label,
    description: skill.description,
    instruction: String(skill.instruction || '').slice(0, 16_000),
    source: skill.source || 'pixflow',
  }));
}
