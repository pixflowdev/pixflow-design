import {
  PIXFLOW_BRICKS_GENERATION_REQUIREMENT_KINDS,
  PIXFLOW_BRICKS_INTENT_CONTRACT_SCHEMA,
  PIXFLOW_BRICKS_INTENT_SCOPES,
  PIXFLOW_BRICKS_INTENTS,
  PIXFLOW_BRICKS_MEDIA_POLICIES,
  PIXFLOW_BRICKS_MEDIA_SURFACES,
  PIXFLOW_BRICKS_PLACEMENT_MODES,
  PIXFLOW_BRICKS_PREFLIGHT_STATES,
  PIXFLOW_BRICKS_SOURCE_LIFECYCLES,
  type PixflowBricksIntentContract,
} from '@open-design/contracts';

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedString(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

function enumValue<T extends readonly string[]>(value: unknown, values: T): T[number] | null {
  const candidate = boundedString(value, 80);
  return values.includes(candidate as T[number]) ? candidate as T[number] : null;
}

function boundedStringList(value: unknown, maxItems: number, maxChars: number): string[] {
  return (Array.isArray(value) ? value : [])
    .map((entry) => boundedString(entry, maxChars))
    .filter(Boolean)
    .filter((entry, index, all) => all.indexOf(entry) === index)
    .slice(0, maxItems);
}

/**
 * Preserve the selected agent's semantic decision across the daemon/Bridge
 * boundary while bounding every client-supplied field. The Bridge remains the
 * mutation authority: it revalidates these subjects against the live Builder
 * inventory and fails closed when the model returns a conflicting operation.
 */
export function sanitizePixflowBricksIntentContract(value: unknown): PixflowBricksIntentContract | null {
  const raw = recordValue(value);
  if (raw.schema !== PIXFLOW_BRICKS_INTENT_CONTRACT_SCHEMA) return null;

  const intent = enumValue(raw.intent, PIXFLOW_BRICKS_INTENTS);
  const scope = enumValue(raw.scope, PIXFLOW_BRICKS_INTENT_SCOPES);
  const mediaPolicy = enumValue(raw.mediaPolicy ?? raw.media_policy, PIXFLOW_BRICKS_MEDIA_POLICIES);
  const mediaSurface = enumValue(raw.mediaSurface ?? raw.media_surface, PIXFLOW_BRICKS_MEDIA_SURFACES);
  const state = enumValue(raw.state, PIXFLOW_BRICKS_PREFLIGHT_STATES);
  const sourceLifecycle = enumValue(raw.sourceLifecycle ?? raw.source_lifecycle, PIXFLOW_BRICKS_SOURCE_LIFECYCLES);
  if (!intent || !scope || !mediaPolicy || !mediaSurface || !state || !sourceLifecycle) return null;

  const placementRaw = recordValue(raw.placement);
  const placementMode = enumValue(placementRaw.mode, PIXFLOW_BRICKS_PLACEMENT_MODES);
  const placement = Object.keys(placementRaw).length === 0
    ? null
    : placementMode
      ? {
          mode: placementMode,
          targetId: boundedString(placementRaw.targetId ?? placementRaw.target_id, 160) || null,
          targetLabel: boundedString(placementRaw.targetLabel ?? placementRaw.target_label, 240) || null,
          preserveExisting: placementRaw.preserveExisting === true || placementRaw.preserve_existing === true,
          rationale: boundedString(placementRaw.rationale, 1_200),
        }
      : null;
  if (Object.keys(placementRaw).length > 0 && !placement) return null;

  const generationRequirementsValue = raw.generationRequirements ?? raw.generation_requirements;
  const generationRequirements = (Array.isArray(generationRequirementsValue)
    ? generationRequirementsValue
    : [])
    .map((entry: unknown) => {
      const requirement = recordValue(entry);
      const kind = enumValue(requirement.kind, PIXFLOW_BRICKS_GENERATION_REQUIREMENT_KINDS);
      if (!kind) return null;
      return {
        kind,
        minimumMatches: Math.max(0, Math.min(64, Math.trunc(Number(requirement.minimumMatches ?? requirement.minimum_matches) || 0))),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(0, 16);

  const retainedRaw = recordValue(raw.retainedEdit ?? raw.retained_edit);
  const retainedEdit = Object.keys(retainedRaw).length === 0
    ? null
    : retainedRaw.kind === 'replace_visible_text'
      ? {
          kind: 'replace_visible_text' as const,
          targetElementId: boundedString(retainedRaw.targetElementId ?? retainedRaw.target_element_id, 160),
          currentText: boundedString(retainedRaw.currentText ?? retainedRaw.current_text, 8_000),
          replacementText: boundedString(retainedRaw.replacementText ?? retainedRaw.replacement_text, 8_000),
          preserveUnrelated: true as const,
        }
      : null;
  if (Object.keys(retainedRaw).length > 0 && (!retainedEdit || !retainedEdit.targetElementId)) return null;

  return {
    schema: PIXFLOW_BRICKS_INTENT_CONTRACT_SCHEMA,
    intent,
    scope,
    mediaPolicy,
    mediaSurface,
    state,
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
    clarification: boundedString(raw.clarification, 1_200) || null,
    skillIds: boundedStringList(raw.skillIds ?? raw.skill_ids, 32, 160),
    capabilityIds: boundedStringList(raw.capabilityIds ?? raw.capability_ids, 32, 160),
    rationale: boundedString(raw.rationale, 2_000),
    targetElementIds: boundedStringList(raw.targetElementIds ?? raw.target_element_ids, 64, 160),
    placement,
    sourceLifecycle,
    generationRequirements,
    retainedEdit,
  };
}
