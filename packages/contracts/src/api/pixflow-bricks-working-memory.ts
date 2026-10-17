import type { ChatSessionMode } from './chat.js';

/**
 * Floating-panel-only working memory for the Bricks Ask / Plan / Design flow.
 *
 * This contract is deliberately separate from project conversations and
 * Personal Memory. It carries a small conversation window for fluency and a
 * typed fact set for edit authority; recent chat is never mutation authority.
 */
export const PIXFLOW_BRICKS_WORKING_MEMORY_SCHEMA = 'pixflow.bricks.working-memory.v2' as const;
export const PIXFLOW_BRICKS_WORKING_MEMORY_VERSION = 2 as const;

export const PIXFLOW_BRICKS_WORKING_MEMORY_CAPS = {
  maxFacts: 32,
  maxRecentChatMessages: 24,
  maxRecentChatMessageChars: 6_000,
  maxRecentMessageEvents: 32,
  maxRecentMessageEventChars: 4_000,
  maxFactStringChars: 32_000,
  maxIntentValues: 24,
  maxSkillIds: 12,
  maxSupersessionRefs: 8,
  maxStoredBytes: 256 * 1_024,
  maxDeviceRetentionMs: 7 * 24 * 60 * 60 * 1_000,
} as const;

export type PixflowBricksWorkingMemoryRetention = 'session' | 'device';

export type PixflowBricksWorkingMemoryMessageProvenance = {
  surface: 'bricks_floating_panel';
  source: 'live_v2' | 'session_restore_v2' | 'device_restore_v2' | 'legacy_v1';
  /**
   * Transcript rows are conversational context only. Legacy v1 rows are even
   * stricter: they may be displayed after migration but cannot seed facts.
   */
  authority: 'conversation_only' | 'display_only';
  schemaVersion: 1 | typeof PIXFLOW_BRICKS_WORKING_MEMORY_VERSION;
};

/**
 * A bounded, non-authoritative event from the floating-panel transcript.
 * Tool calls, native mutation receipts, validation errors, and repair attempts
 * are conversation evidence for the next model turn. They are deliberately
 * JSON-shaped rather than tied to a provider event union so Local CLI, BYOK,
 * and the WordPress route can carry the same record without making any event
 * itself a permission or mutation authority.
 */
export type PixflowBricksWorkingMemoryMessageEvent = {
  kind: string;
  [key: string]: unknown;
};

export type PixflowBricksWorkingMemoryRecentMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  sessionMode: ChatSessionMode;
  provenance: PixflowBricksWorkingMemoryMessageProvenance;
  status?: 'draft' | 'queued' | 'streaming' | 'complete' | 'error';
  runStatus?: string;
  events?: PixflowBricksWorkingMemoryMessageEvent[];
  /**
   * Immutable live Builder context captured when this row was created.
   * Rows without a complete stamp remain useful for fluency, but cannot be
   * selected by a historical Design interpretation.
   */
  originContext?: {
    postId: number;
    area: PixflowBricksWorkingMemoryArea;
    fingerprints: PixflowBricksWorkingMemoryFingerprints;
  };
};

/**
 * The model's bounded interpretation of one earlier live v2 user turn.
 *
 * This decision never authorizes a mutation by itself. It only identifies
 * which conversation-only row was interpreted. The current Design turn must
 * still contain an explicit apply/implement action and produce one typed fact,
 * one exact target decision, and a fresh live validation receipt.
 */
export type PixflowBricksConversationInterpretationDecision = {
  version: 1;
  chronology: 'oldest_to_newest';
  relation: 'first' | 'second' | 'third' | 'fourth' | 'fifth' | 'last' | 'earlier' | 'continuation';
  sourceMessageId: string;
  sourceUserSequence: number;
  confidence: 'high' | 'medium';
  rationale: string;
};

export type PixflowBricksWorkingMemoryArea =
  | 'content'
  | 'header'
  | 'footer'
  | 'popup'
  | 'template';

/**
 * Every fact names the complete target tuple. Page- or area-level operations
 * use null for elementId/fieldKey instead of omitting target provenance.
 */
export type PixflowBricksWorkingMemoryTarget = {
  postId: number;
  area: PixflowBricksWorkingMemoryArea;
  elementId: string | null;
  fieldKey: string | null;
};

export type PixflowBricksWorkingMemoryFingerprints = {
  page: string;
  inventory: string;
};

export type PixflowBricksTargetResolutionCandidate = {
  elementId: string;
  label: string;
  elementType: string;
  score: number;
  reason: 'explicit-id' | 'active-selection' | 'active-selected-section' | 'semantic-section-role' | 'semantic-element-role';
  capabilities: string[];
  editableFieldKeys: string[];
  matchedTokens: string[];
};

export type PixflowBricksTargetResolution = {
  version: 1;
  status: 'resolved' | 'ambiguous' | 'unresolved';
  source:
    | 'prompt-element-id'
    | 'active-selection'
    | 'active-selected-element'
    | 'active-selected-section'
    | 'semantic-element-role'
    | 'semantic-section-role'
    | 'none';
  query: string;
  activeSelectionId: string | null;
  resolvedElementId: string | null;
  candidates: PixflowBricksTargetResolutionCandidate[];
};

/**
 * The model's bounded target choice for one Design mutation. This record is
 * evidence, not authority: the daemon and Builder must still verify the exact
 * live ID, field/capability, page/area, and fingerprints before applying.
 */
export type PixflowBricksTargetDecision = {
  version: 1;
  targetId: string;
  fieldKey: string;
  capability: PixflowBricksWorkingMemoryCapability;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
  source: 'explicit-id' | 'active-selection' | 'semantic-match' | 'prior-typed-intent' | 'model-selection' | 'repair-selection';
  repairAttempted: boolean;
  candidateIds: string[];
};

/**
 * Bounded typed state for one unresolved target choice. It intentionally
 * carries no transcript prose or raw Bricks inventory. A continuation may
 * bind the typed intent only to one of these exact live candidate IDs.
 */
export type PixflowBricksPendingTargetClarification = {
  version: 1;
  createdTurn: number;
  sourceMessageId: string;
  sourceMessageMode: ChatSessionMode;
  action: 'converse' | 'apply' | 'implement';
  postId: number;
  area: PixflowBricksWorkingMemoryArea;
  pageFingerprint: string;
  inventoryFingerprint: string;
  activeSelectionId: string | null;
  query: string;
  candidates: PixflowBricksTargetResolutionCandidate[];
  kind?: PixflowBricksWorkingMemoryFactKind;
  capability?: PixflowBricksWorkingMemoryCapability;
  fieldKey?: string;
  intent?: PixflowBricksWorkingMemoryIntent;
};

export type PixflowBricksWorkingMemoryFactStatus =
  | 'proposed'
  | 'user_confirmed'
  | 'applied'
  | 'reverted';

export type PixflowBricksWorkingMemoryFactKind =
  | 'text_replacement'
  | 'settings_patch'
  | 'dynamic_data_binding'
  | 'visibility_condition'
  | 'query_loop'
  | 'code_update'
  | 'element_insert'
  | 'library_insert'
  | 'section_generation';

export type PixflowBricksWorkingMemoryCapability =
  | 'selected_element'
  | 'bricks_settings'
  | 'dynamic_data'
  | 'conditions'
  | 'query_loop'
  | 'code_element'
  | 'element_insert'
  | 'library_insertion'
  | 'section_generation';

export type PixflowBricksWorkingMemoryIntentScalar = string | number | boolean | null;

/**
 * Bounded JSON-shaped Bricks setting value. Runtime sanitizers enforce fixed
 * depth, key-count, array-length, string-length, and total fact-size caps.
 * This keeps structured native controls (links, media, icons, forms,
 * typography, layout, and similar allowlisted settings) typed without storing
 * model prose or an unbounded Bricks settings tree.
 */
export type PixflowBricksWorkingMemoryIntentValue =
  | PixflowBricksWorkingMemoryIntentScalar
  | PixflowBricksWorkingMemoryIntentValue[]
  | { [key: string]: PixflowBricksWorkingMemoryIntentValue };

export type PixflowBricksWorkingMemorySettingValue = {
  fieldKey: string;
  value: PixflowBricksWorkingMemoryIntentValue;
};

export type PixflowBricksTextReplacementIntent = {
  kind: 'text_replacement';
  value: string;
  previousValue?: string;
};

export type PixflowBricksSettingsPatchIntent = {
  kind: 'settings_patch';
  values: PixflowBricksWorkingMemorySettingValue[];
};

export type PixflowBricksDynamicDataBindingIntent = {
  kind: 'dynamic_data_binding';
  expression: string;
  placement: 'text' | 'link' | 'image';
};

export type PixflowBricksVisibilityConditionRow = {
  key: string;
  operator:
    | '=='
    | '!='
    | '>='
    | '<='
    | '>'
    | '<'
    | 'contains'
    | 'contains_not'
    | 'empty'
    | 'empty_not';
  value?: PixflowBricksWorkingMemoryIntentScalar;
  dynamicDataTag?: string;
};

export type PixflowBricksVisibilityConditionIntent =
  | ({
      kind: 'visibility_condition';
      groups: PixflowBricksVisibilityConditionRow[][];
      replaceExisting: boolean;
    })
  | ({
      kind: 'visibility_condition';
    } & PixflowBricksVisibilityConditionRow);

export type PixflowBricksQueryLoopIntent = {
  kind: 'query_loop';
  objectType: 'post' | 'term' | 'user' | 'api' | 'array';
  postType?: string;
  taxonomy?: string;
  postsPerPage?: number;
  itemsPerPage?: number;
  orderBy?: string;
  order?: 'ASC' | 'DESC';
  offset?: number;
  apiUrl?: string;
  apiMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  responsePath?: string;
  cacheTime?: number;
  arrayEditor?: string;
  excludeCurrentPost?: boolean;
  ignoreStickyPosts?: boolean;
  infiniteScroll?: boolean;
  currentPostTerm?: boolean;
  showEmpty?: boolean;
};

export type PixflowBricksCodeUpdateIntent = {
  kind: 'code_update';
  fieldKey: 'code' | 'javascriptCode' | 'cssCode';
  /**
   * Complete replacement source. The mutation boundary separately revalidates
   * the selected Code element, pane inventory, runtime capability, and native
   * save/signing path before applying it.
   */
  source: string;
  /**
   * Optional companion hook for JavaScript that operates on another exact
   * live Bricks element. This remains part of the one bounded Code intent;
   * both targets are revalidated before the native mutation is applied.
   */
  attributeBinding?: {
    elementId: string;
    name: string;
    value: string;
  };
};

export type PixflowBricksElementInsertIntent = {
  kind: 'element_insert';
  elementName: 'text-basic' | 'text' | 'heading' | 'button' | 'container' | 'block' | 'div' | 'code' | 'form';
  position: 'before' | 'after' | 'prepend_to' | 'append_to' | 'append';
  positionTargetId: string | null;
  settings: PixflowBricksWorkingMemorySettingValue[];
  additionalElements?: Array<{
    elementName: 'text-basic' | 'text' | 'heading' | 'button' | 'container' | 'block' | 'div' | 'code' | 'form';
    settings: PixflowBricksWorkingMemorySettingValue[];
  }>;
  attributeBinding?: {
    elementId: string;
    name: string;
    value: string;
  };
};

export type PixflowBricksLibraryInsertIntent = {
  kind: 'library_insert';
  templateId: number;
  position: 'before' | 'after' | 'prepend_to' | 'append_to' | 'append';
  positionTargetId: string | null;
};

export type PixflowBricksSectionGenerationIntent = {
  kind: 'section_generation';
  sectionKind:
    | 'hero'
    | 'banner'
    | 'cta'
    | 'features'
    | 'pricing'
    | 'testimonials'
    | 'faq'
    | 'footer'
    | 'header'
    | 'navigation'
    | 'content';
  position: 'before' | 'after' | 'prepend_to' | 'append_to' | 'append';
  positionTargetId: string | null;
};

export type PixflowBricksWorkingMemoryIntent =
  | PixflowBricksTextReplacementIntent
  | PixflowBricksSettingsPatchIntent
  | PixflowBricksDynamicDataBindingIntent
  | PixflowBricksVisibilityConditionIntent
  | PixflowBricksQueryLoopIntent
  | PixflowBricksCodeUpdateIntent
  | PixflowBricksElementInsertIntent
  | PixflowBricksLibraryInsertIntent
  | PixflowBricksSectionGenerationIntent;

export type PixflowBricksWorkingMemoryFactProvenance = {
  surface: 'bricks_floating_panel';
  sourceMessageId: string;
  sourceMessageMode: ChatSessionMode;
  sourceMessageRole: 'user' | 'assistant';
  sourceMessageSource: 'live_v2' | 'session_restore_v2' | 'device_restore_v2';
  extractedBy: 'builder' | 'daemon' | 'bridge';
};

type PixflowBricksWorkingMemoryFactBase = {
  id: string;
  capability: PixflowBricksWorkingMemoryCapability;
  skillIds: string[];
  target: PixflowBricksWorkingMemoryTarget;
  status: PixflowBricksWorkingMemoryFactStatus;
  supersedesFactIds: string[];
  supersededByFactId?: string;
  reboundFromFactId?: string;
  reboundFromSourceMessageId?: string;
  reboundAtTurn?: number;
  createdTurn: number;
  fingerprints: PixflowBricksWorkingMemoryFingerprints;
  provenance: PixflowBricksWorkingMemoryFactProvenance;
};

/**
 * `kind` and `intent.kind` are coupled so consumers cannot accidentally pair
 * an allowlisted target with an unrelated free-form intent payload.
 */
export type PixflowBricksWorkingMemoryFact = PixflowBricksWorkingMemoryFactBase & (
  | { kind: 'text_replacement'; intent: PixflowBricksTextReplacementIntent }
  | { kind: 'settings_patch'; intent: PixflowBricksSettingsPatchIntent }
  | { kind: 'dynamic_data_binding'; intent: PixflowBricksDynamicDataBindingIntent }
  | { kind: 'visibility_condition'; intent: PixflowBricksVisibilityConditionIntent }
  | { kind: 'query_loop'; intent: PixflowBricksQueryLoopIntent }
  | { kind: 'code_update'; intent: PixflowBricksCodeUpdateIntent }
  | { kind: 'element_insert'; intent: PixflowBricksElementInsertIntent }
  | { kind: 'library_insert'; intent: PixflowBricksLibraryInsertIntent }
  | { kind: 'section_generation'; intent: PixflowBricksSectionGenerationIntent }
);

export type PixflowBricksWorkingMemoryFactSelector = {
  factId?: string;
  sourceMessageId?: string;
  kind?: PixflowBricksWorkingMemoryFactKind;
  capability?: PixflowBricksWorkingMemoryCapability;
  target?: PixflowBricksWorkingMemoryTarget;
};

export type PixflowBricksWorkingMemoryTurn = {
  number: number;
  messageId: string;
  mode: ChatSessionMode;
  /**
   * The host supplies this bounded current-turn action. Conversation text is
   * not replayed to infer edit authority in the resolver.
   */
  action: 'converse' | 'apply' | 'implement';
  target: PixflowBricksWorkingMemoryTarget;
  fingerprints: PixflowBricksWorkingMemoryFingerprints;
  factSelector?: PixflowBricksWorkingMemoryFactSelector;
  targetResolution?: PixflowBricksTargetResolution;
};

export type PixflowBricksWorkingMemoryEnvelope = {
  schema: typeof PIXFLOW_BRICKS_WORKING_MEMORY_SCHEMA;
  version: typeof PIXFLOW_BRICKS_WORKING_MEMORY_VERSION;
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  retention: PixflowBricksWorkingMemoryRetention;
  restored: boolean;
  currentTurn: PixflowBricksWorkingMemoryTurn;
  /**
   * Compact context for turns older than the bounded transcript window. It is
   * conversational context only and never contributes mutation authority.
   */
  conversationSummary?: string;
  pendingTargetClarification?: PixflowBricksPendingTargetClarification;
  recentChat: PixflowBricksWorkingMemoryRecentMessage[];
  facts: PixflowBricksWorkingMemoryFact[];
};

export type PixflowBricksWorkingMemoryAuthorityReceipt = {
  schema: typeof PIXFLOW_BRICKS_WORKING_MEMORY_SCHEMA;
  receiptVersion: 1;
  id: string;
  sessionId: string;
  factId: string;
  sourceMessageId: string;
  applyMessageId: string;
  resolvedAtTurn: number;
  mode: 'design';
  action: 'apply' | 'implement';
  resolution: 'exactly_one';
  capability: PixflowBricksWorkingMemoryCapability;
  skillIds: string[];
  target: PixflowBricksWorkingMemoryTarget;
  fingerprints: PixflowBricksWorkingMemoryFingerprints;
};

export type PixflowBricksWorkingMemoryAuthorityFailure =
  | 'mode_forbids_mutation'
  | 'explicit_apply_required'
  | 'no_compatible_fact'
  | 'ambiguous_facts';

export type PixflowBricksWorkingMemoryAuthorityResolution =
  | {
      ok: true;
      fact: PixflowBricksWorkingMemoryFact;
      receipt: PixflowBricksWorkingMemoryAuthorityReceipt;
    }
  | {
      ok: false;
      reason: PixflowBricksWorkingMemoryAuthorityFailure;
      compatibleFactIds: string[];
    };

function sameTarget(
  left: PixflowBricksWorkingMemoryTarget,
  right: PixflowBricksWorkingMemoryTarget,
): boolean {
  return left.postId === right.postId
    && left.area === right.area
    && left.elementId === right.elementId
    && left.fieldKey === right.fieldKey;
}

function sameSelectedElement(
  factTarget: PixflowBricksWorkingMemoryTarget,
  turnTarget: PixflowBricksWorkingMemoryTarget,
): boolean {
  return factTarget.postId === turnTarget.postId
    && factTarget.area === turnTarget.area
    && factTarget.elementId === turnTarget.elementId;
}

function matchesSelector(
  fact: PixflowBricksWorkingMemoryFact,
  selector: PixflowBricksWorkingMemoryFactSelector | undefined,
): boolean {
  if (!selector) return true;
  if (selector.factId !== undefined && fact.id !== selector.factId) return false;
  if (
    selector.sourceMessageId !== undefined
    && fact.provenance.sourceMessageId !== selector.sourceMessageId
  ) return false;
  if (selector.kind !== undefined && fact.kind !== selector.kind) return false;
  if (selector.capability !== undefined && fact.capability !== selector.capability) return false;
  if (selector.target !== undefined && !sameTarget(fact.target, selector.target)) return false;
  return true;
}

/**
 * Resolves mutation authority without consulting recentChat. Callers must
 * still perform runtime schema validation and re-check the live builder target
 * immediately before applying the receipt.
 */
export function resolvePixflowBricksWorkingMemoryAuthority(
  memory: PixflowBricksWorkingMemoryEnvelope,
): PixflowBricksWorkingMemoryAuthorityResolution {
  const turn = memory.currentTurn;
  if (turn.mode !== 'design') {
    return { ok: false, reason: 'mode_forbids_mutation', compatibleFactIds: [] };
  }
  if (turn.action !== 'apply' && turn.action !== 'implement') {
    return { ok: false, reason: 'explicit_apply_required', compatibleFactIds: [] };
  }

  const candidates = memory.facts.filter((fact) => {
    if (fact.status !== 'proposed' && fact.status !== 'user_confirmed') return false;
    if (fact.supersededByFactId) return false;
    const isCurrentTurnRebind = fact.reboundAtTurn === turn.number
      && Boolean(fact.reboundFromFactId)
      && turn.factSelector?.factId === fact.id;
    if (fact.createdTurn >= turn.number && !isCurrentTurnRebind) return false;
    if (!sameSelectedElement(fact.target, turn.target)) return false;
    if (fact.fingerprints.page !== turn.fingerprints.page) return false;
    if (fact.fingerprints.inventory !== turn.fingerprints.inventory) return false;
    return matchesSelector(fact, turn.factSelector);
  });

  if (candidates.length === 0) {
    return { ok: false, reason: 'no_compatible_fact', compatibleFactIds: [] };
  }
  if (candidates.length !== 1) {
    return {
      ok: false,
      reason: 'ambiguous_facts',
      compatibleFactIds: candidates.map((fact) => fact.id),
    };
  }

  const fact = candidates[0];
  if (!fact) {
    return { ok: false, reason: 'no_compatible_fact', compatibleFactIds: [] };
  }
  return {
    ok: true,
    fact,
    receipt: {
      schema: PIXFLOW_BRICKS_WORKING_MEMORY_SCHEMA,
      receiptVersion: 1,
      id: `authority:${memory.sessionId}:${turn.messageId}:${fact.id}`,
      sessionId: memory.sessionId,
      factId: fact.id,
      sourceMessageId: fact.provenance.sourceMessageId,
      applyMessageId: turn.messageId,
      resolvedAtTurn: turn.number,
      mode: 'design',
      action: turn.action,
      resolution: 'exactly_one',
      capability: fact.capability,
      skillIds: fact.skillIds.slice(0, PIXFLOW_BRICKS_WORKING_MEMORY_CAPS.maxSkillIds),
      target: fact.target,
      fingerprints: fact.fingerprints,
    },
  };
}
