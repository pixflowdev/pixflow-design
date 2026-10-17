import type { PixflowBricksIntentContract } from '@open-design/contracts';

export type BuildInBricksScopedPlacementMode = 'before' | 'after' | 'prepend_to' | 'append_to' | 'append';

/**
 * Placement is the selected agent's semantic decision. The deterministic host
 * validates the exact target against the current builder inventory; it never
 * derives placement by parsing the user's natural-language prompt.
 */
export type BuildInBricksScopedPlacementIntent = {
  mode: BuildInBricksScopedPlacementMode;
  targetId: string | null;
  targetLabel: string | null;
  preserveExisting: boolean;
  rationale: string;
};

export type BuildInBricksScopedPlacement = {
  version: 1;
  mode: BuildInBricksScopedPlacementMode;
  targetId: string | null;
  targetLabel: string | null;
  requestedTarget: string;
  source: string;
  postId: number | null;
  pageFingerprint: string | null;
  inventoryFingerprint: string | null;
  warning: string | null;
};

/**
 * Retained-source edits reuse the physical placement already verified and
 * persisted with that source. A later natural-language turn may describe a
 * different semantic scope, but it must not make the host invent a new target
 * or discard the source-owned insertion boundary.
 */
export function restoreBuildInBricksScopedPlacement(
  value: unknown,
): BuildInBricksScopedPlacement | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<BuildInBricksScopedPlacement>;
  const mode = candidate.mode;
  if (
    candidate.version !== 1
    || (mode !== 'before'
      && mode !== 'after'
      && mode !== 'prepend_to'
      && mode !== 'append_to'
      && mode !== 'append')
    || candidate.warning !== null
  ) return null;

  const targetId = stringValue(candidate.targetId) || null;
  if (mode !== 'append' && !targetId) return null;

  const postIdValue = Number(candidate.postId || 0);
  return {
    version: 1,
    mode,
    targetId: mode === 'append' ? null : targetId,
    targetLabel: stringValue(candidate.targetLabel) || null,
    requestedTarget: stringValue(candidate.requestedTarget),
    source: stringValue(candidate.source) || 'retained-source-index',
    postId: Number.isInteger(postIdValue) && postIdValue > 0 ? postIdValue : null,
    pageFingerprint: stringValue(candidate.pageFingerprint) || null,
    inventoryFingerprint: stringValue(candidate.inventoryFingerprint) || null,
    warning: null,
  };
}

type ScopedPlacementElement = {
  elementId?: unknown;
  parentId?: unknown;
  rootSectionId?: unknown;
  targetLabel?: unknown;
  elementType?: unknown;
  currentVisibleText?: unknown;
};

export type BuildInBricksScopedPlacementContext = {
  postId?: unknown;
  selectedId?: unknown;
  inventory?: {
    pageFingerprint?: unknown;
    inventoryFingerprint?: unknown;
    selectedElement?: ScopedPlacementElement | null;
    selectedElements?: ScopedPlacementElement[] | null;
    selectedRelations?: {
      parent?: ScopedPlacementElement | null;
      rootSection?: ScopedPlacementElement | null;
      children?: ScopedPlacementElement[] | null;
      siblings?: ScopedPlacementElement[] | null;
    } | null;
    sections?: Array<{
      sectionId?: unknown;
      sectionName?: unknown;
    }> | null;
    placementSections?: Array<{
      sectionId?: unknown;
      sectionName?: unknown;
    }> | null;
  } | null;
} | null | undefined;

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function boundedTargetMap(context: BuildInBricksScopedPlacementContext): Map<string, string | null> {
  const inventory = context?.inventory || null;
  const relations = inventory?.selectedRelations || null;
  const targets = new Map<string, string | null>();
  const addElement = (value: ScopedPlacementElement | null | undefined) => {
    const id = stringValue(value?.elementId);
    if (id) targets.set(id, stringValue(value?.targetLabel) || null);
  };
  addElement(inventory?.selectedElement);
  for (const selected of Array.isArray(inventory?.selectedElements) ? inventory.selectedElements : []) addElement(selected);
  const selectedParentId = stringValue(inventory?.selectedElement?.parentId);
  if (selectedParentId && !targets.has(selectedParentId)) targets.set(selectedParentId, null);
  const selectedRootSectionId = stringValue(inventory?.selectedElement?.rootSectionId);
  if (selectedRootSectionId && !targets.has(selectedRootSectionId)) targets.set(selectedRootSectionId, null);
  addElement(relations?.parent);
  addElement(relations?.rootSection);
  for (const child of Array.isArray(relations?.children) ? relations.children : []) addElement(child);
  for (const sibling of Array.isArray(relations?.siblings) ? relations.siblings : []) addElement(sibling);
  const placementSections = Array.isArray(inventory?.placementSections)
    ? inventory.placementSections
    : Array.isArray(inventory?.sections)
      ? inventory.sections
      : [];
  for (const section of placementSections) {
    const id = stringValue(section?.sectionId);
    if (id) targets.set(id, stringValue(section?.sectionName) || null);
  }
  const selectedId = stringValue(context?.selectedId);
  if (selectedId && !targets.has(selectedId)) targets.set(selectedId, null);
  return targets;
}

export function buildInBricksScopedPlacementIntentFromContract(
  contract: PixflowBricksIntentContract | null | undefined,
  generationScope: 'full_page' | 'section' | 'component' | undefined,
): BuildInBricksScopedPlacementIntent | null {
  if (generationScope !== 'section' && generationScope !== 'component') return null;
  if (!contract?.placement) {
    return {
      mode: 'append',
      targetId: null,
      targetLabel: null,
      preserveExisting: true,
      rationale: '',
    };
  }
  return {
    mode: contract.placement.mode,
    targetId: stringValue(contract.placement.targetId) || null,
    targetLabel: stringValue(contract.placement.targetLabel) || null,
    preserveExisting: contract.placement.preserveExisting !== false,
    rationale: stringValue(contract.placement.rationale).slice(0, 500),
  };
}

export function freezeBuildInBricksScopedPlacement({
  intent,
  context,
}: {
  intent: BuildInBricksScopedPlacementIntent | null;
  context: BuildInBricksScopedPlacementContext;
}): BuildInBricksScopedPlacement | null {
  if (!intent) return null;
  const inventory = context?.inventory || null;
  const postIdValue = Number(context?.postId || 0);
  const postId = Number.isInteger(postIdValue) && postIdValue > 0 ? postIdValue : null;
  const pageFingerprint = stringValue(inventory?.pageFingerprint) || null;
  const inventoryFingerprint = stringValue(inventory?.inventoryFingerprint) || null;
  const base = {
    version: 1 as const,
    postId,
    pageFingerprint,
    inventoryFingerprint,
  };

  if (intent.mode === 'append') {
    return {
      ...base,
      mode: 'append',
      targetId: null,
      targetLabel: null,
      requestedTarget: '',
      source: 'agent-semantic-decision',
      warning: null,
    };
  }

  if (!intent.preserveExisting) {
    return {
      ...base,
      mode: intent.mode,
      targetId: intent.targetId,
      targetLabel: intent.targetLabel,
      requestedTarget: intent.targetLabel || intent.targetId || '',
      source: 'unsupported-agent-replacement',
      warning: 'The selected agent requested destructive replacement, but this scoped Build route only supports preserving existing content.',
    };
  }

  const targets = boundedTargetMap(context);
  const targetId = stringValue(intent.targetId);
  if (!targetId || !targets.has(targetId)) {
    return {
      ...base,
      mode: intent.mode,
      targetId: targetId || null,
      targetLabel: intent.targetLabel,
      requestedTarget: intent.targetLabel || targetId,
      source: 'invalid-agent-placement',
      warning: 'The selected agent chose a placement target that is not present in the current bounded builder context.',
    };
  }

  return {
    ...base,
    mode: intent.mode,
    targetId,
    targetLabel: intent.targetLabel || targets.get(targetId) || null,
    requestedTarget: intent.targetLabel || targetId,
    source: 'agent-semantic-decision',
    warning: null,
  };
}

export function buildInBricksScopedPlacementPosition(
  placement: BuildInBricksScopedPlacement | null | undefined,
): { mode: BuildInBricksScopedPlacementMode; targetId?: string } {
  if (!placement || placement.mode === 'append' || !placement.targetId) return { mode: 'append' };
  return { mode: placement.mode, targetId: placement.targetId };
}

/** @deprecated Prototype/Stage compatibility; canonical Build owns placement semantics. */
export type PrototypeBricksScopedPlacementMode = BuildInBricksScopedPlacementMode;
/** @deprecated Prototype/Stage compatibility; canonical Build owns placement semantics. */
export type PrototypeBricksScopedPlacementIntent = BuildInBricksScopedPlacementIntent;
/** @deprecated Prototype/Stage compatibility; canonical Build owns placement semantics. */
export type PrototypeBricksScopedPlacement = BuildInBricksScopedPlacement;
/** @deprecated Prototype/Stage compatibility; canonical Build owns placement semantics. */
export type PrototypeBricksScopedPlacementContext = BuildInBricksScopedPlacementContext;

/** @deprecated Prototype/Stage compatibility wrapper. */
export const freezePrototypeBricksScopedPlacement = freezeBuildInBricksScopedPlacement;
/** @deprecated Prototype/Stage compatibility wrapper. */
export const prototypeBricksScopedPlacementPosition = buildInBricksScopedPlacementPosition;
