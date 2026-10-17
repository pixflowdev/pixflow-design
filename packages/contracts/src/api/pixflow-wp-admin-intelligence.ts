import type { ChatSessionMode } from './chat.js';
import type { ResearchProviderId } from './research.js';
import type { PixflowSurface } from './pixflow-surface.js';
import type {
  PixflowCapabilityFamilySummary,
  PixflowWpAdminContext,
  PixflowWpAdminInteractionMode,
  PixflowWpAdminPendingClarification,
  PixflowWpAdminResourceContext,
  PixflowWpAdminRiskClass,
  PixflowWpAdminWorkingMemory,
} from './pixflow-wp-admin.js';

/**
 * Model-facing preflight contracts are deliberately separate from the
 * execution contracts. A preflight can suggest an intent, but it cannot
 * grant a capability, approval, target, or mode; the server revalidates all
 * of those at execution time.
 */
export const PIXFLOW_WP_ADMIN_INTELLIGENCE_SCHEMA = 'pixflow.wp-admin.intelligence.v1' as const;

export type PixflowWpAdminMentionKind = 'context' | 'integration' | 'skill' | 'capability';

export type PixflowWpAdminMention = {
  id: string;
  label: string;
  description: string;
  kind: PixflowWpAdminMentionKind;
  available: boolean;
  reason?: string | null;
  target?: PixflowWpAdminResourceContext | null;
  integrationId?: string | null;
  skillId?: string | null;
  capabilityId?: string | null;
};

export type PixflowWpAdminSkillSummary = {
  id: string;
  label: string;
  description: string;
  active: boolean;
  linkedIntegrationId?: string | null;
  /** Full product-owned body, transported only for a bounded activated path. */
  instruction?: string;
  relatedIds?: string[];
  internal?: boolean;
  source?: 'pixflow' | 'user' | 'official-library';
};

export type PixflowWpAdminContentMutationIntent = 'preserve' | 'replace' | 'clear';

export type PixflowWpAdminPreflightRequest = {
  schema: typeof PIXFLOW_WP_ADMIN_INTELLIGENCE_SCHEMA;
  version: 1;
  surface: 'wp_admin';
  mode: PixflowWpAdminInteractionMode;
  prompt: string;
  context: PixflowWpAdminContext | Record<string, unknown>;
  families: PixflowCapabilityFamilySummary[];
  mentions: PixflowWpAdminMention[];
  skills: PixflowWpAdminSkillSummary[];
  /** At most twelve full-body leaves selected by an earlier semantic routing pass. */
  activatedSkills?: PixflowWpAdminSkillSummary[];
  explicitSkillIds: string[];
  explicitMentionIds: string[];
  recentConversation: Array<{ role: 'user' | 'assistant'; content: string }>;
  attachments: Array<{ name: string; mime: string }>;
  memoryIndex: Array<{ id: string; type: string; name: string; description: string }>;
  /** One bounded host research pass. Results are quoted untrusted data. */
  groundingResults?: PixflowWpAdminGroundingResult[];
  /** Active object-bound clarification presented as context, never authority. */
  pendingClarification?: PixflowWpAdminPendingClarification | null;
  /** Shared daemon research availability; contains no credentials. */
  research?: PixflowWpAdminResearchAvailability;
};

export type PixflowWpAdminPreflightState = 'ready' | 'needs_clarification' | 'fallback';

export const PIXFLOW_WP_ADMIN_MAX_PROPOSED_ACTIONS = 12;
export const PIXFLOW_WP_ADMIN_MAX_PROPOSED_READS = 6;
export const PIXFLOW_WP_ADMIN_MAX_PROPOSED_RESEARCH = 6;

export type PixflowWpAdminResearchAvailability = {
  available: boolean;
  providers: ResearchProviderId[];
  groundingRound?: number;
};

export type PixflowWpAdminProposedResearch = {
  query: string;
  maxSources?: number;
  includeContent?: boolean;
  domains?: string[];
  recencyDays?: number;
};

export type PixflowWpAdminProposedAction = {
  capabilityId: string;
  arguments: Record<string, unknown>;
};

export type PixflowWpAdminGroundingResult = {
  capabilityId: string;
  arguments: Record<string, unknown>;
  result: unknown;
};

export type PixflowWpAdminSemanticPreflightDecision = {
  schema: typeof PIXFLOW_WP_ADMIN_INTELLIGENCE_SCHEMA;
  version: 1;
  surface: 'wp_admin';
  state: PixflowWpAdminPreflightState;
  intent: string;
  mode: PixflowWpAdminInteractionMode;
  target: PixflowWpAdminResourceContext;
  /** Agent-owned target provenance; the host proves it with a fresh live read. */
  targetProvenance?: 'active_context_target' | 'explicit_user_target';
  integrationIds: string[];
  skillIds: string[];
  capabilityIds: string[];
  riskCeiling: PixflowWpAdminRiskClass;
  readOnly: boolean;
  answerOnly: boolean;
  clarification: string | null;
  confidence: number;
  rationale: string;
  unresolvedChoices: string[];
  /** Content authority is explicit; an empty string never implies preserve. */
  contentMutationIntent?: PixflowWpAdminContentMutationIntent;
  /** Untrusted review defaults for the first writable leaf; never authority. */
  proposedArguments?: Record<string, unknown>;
  /** Ordered, untrusted review defaults. Every leaf is approved separately. */
  proposedActions?: PixflowWpAdminProposedAction[];
  /** Bounded typed reads to execute before one grounded preflight pass. */
  proposedReads?: PixflowWpAdminProposedAction[];
  /** Bounded online reads selected by the semantic agent, never by wording. */
  proposedResearch?: PixflowWpAdminProposedResearch[];
  /** The semantic agent, not a wording classifier, decides turn continuation. */
  clarificationDisposition?: {
    kind: 'none' | 'answer' | 'supersede';
    clarificationId: string | null;
  };
};

export type PixflowWpAdminPreflightResult = {
  decision: PixflowWpAdminSemanticPreflightDecision;
  prompt: string;
  source: 'model' | 'fallback';
};

export type PixflowWpAdminWorkingMemoryEnvelope = {
  memory: PixflowWpAdminWorkingMemory;
  /** Memory is context-only. These fields are intentionally not executable. */
  authority: 'conversation_only';
  capabilityIds: [];
  approvalToken: null;
};

export type PixflowWpAdminPreflightValidation =
  | { ok: true }
  | { ok: false; issues: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedStringList(value: unknown, max = 24): value is string[] {
  return Array.isArray(value)
    && value.length <= max
    && value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function boundedProposal(value: unknown, depth = 0): value is Record<string, unknown> {
  if (!isRecord(value) || depth > 6) return false;
  const keys = Object.keys(value);
  if (keys.length > 64 || keys.some((key) => /(?:token|secret|password|nonce|api[_-]?key|credential)/i.test(key))) return false;
  try {
    if (JSON.stringify(value).length > 16_000) return false;
  } catch {
    return false;
  }
  return keys.every((key) => {
    const child = value[key];
    if (child === null || typeof child === 'string' || typeof child === 'number' || typeof child === 'boolean') return true;
    if (Array.isArray(child)) return boundedProposalArray(child, depth + 1);
    return boundedProposal(child, depth + 1);
  });
}

function boundedProposalArray(value: unknown[], depth: number): boolean {
  if (depth > 6 || value.length > 64) return false;
  return value.every((item) => (
    item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
      || (Array.isArray(item) ? boundedProposalArray(item, depth + 1) : boundedProposal(item, depth + 1))
  ));
}

function boundedGutenbergProposal(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  try {
    const encoded = JSON.stringify(value);
    if (!encoded || encoded.length > 512_000) return false;
  } catch {
    return false;
  }
  let visited = 0;
  const bounded = (candidate: unknown, depth: number): boolean => {
    visited += 1;
    if (visited > 20_000 || depth > 32) return false;
    if (candidate === null || typeof candidate === 'boolean') return true;
    if (typeof candidate === 'string') return candidate.length <= 200_000;
    if (typeof candidate === 'number') return Number.isFinite(candidate);
    if (Array.isArray(candidate)) return candidate.length <= 512 && candidate.every((item) => bounded(item, depth + 1));
    if (!isRecord(candidate)) return false;
    const keys = Object.keys(candidate);
    return keys.length <= 128
      && !keys.some((key) => /(?:token|secret|password|nonce|api[_-]?key|credential)/i.test(key))
      && keys.every((key) => bounded(candidate[key], depth + 1));
  };
  return bounded(value, 0);
}

function boundedProposedActions(value: unknown): value is PixflowWpAdminProposedAction[] {
  return Array.isArray(value)
    && value.length <= PIXFLOW_WP_ADMIN_MAX_PROPOSED_ACTIONS
    && value.every((item) => isRecord(item)
      && typeof item.capabilityId === 'string'
      && item.capabilityId.trim().length > 0
      && (item.capabilityId === 'pixflow/wp-admin/gutenberg/apply-document'
        ? boundedGutenbergProposal(item.arguments)
        : boundedProposal(item.arguments)));
}

function boundedProposedReads(value: unknown): value is PixflowWpAdminProposedAction[] {
  return Array.isArray(value)
    && value.length <= PIXFLOW_WP_ADMIN_MAX_PROPOSED_READS
    && value.every((item) => isRecord(item)
      && typeof item.capabilityId === 'string'
      && item.capabilityId.trim().length > 0
      && boundedProposal(item.arguments));
}

function safeResearchDomain(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const domain = value.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  if (!domain || domain.length > 253 || domain === 'localhost' || domain.endsWith('.localhost')) return false;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) return false;
  return !/^(?:0|10|127|169\.254|172\.(?:1[6-9]|2\d|3[01])|192\.168|224|255)\./.test(domain);
}

function boundedProposedResearch(value: unknown): value is PixflowWpAdminProposedResearch[] {
  return Array.isArray(value)
    && value.length <= PIXFLOW_WP_ADMIN_MAX_PROPOSED_RESEARCH
    && value.every((item) => {
      if (!isRecord(item) || typeof item.query !== 'string') return false;
      const query = item.query.trim();
      if (!query || query.length > 1_000
        || /\b(?:api[_-]?key|token|password|secret|credential)\s*[:=]\s*\S+/i.test(query)) return false;
      if (item.maxSources !== undefined
        && (typeof item.maxSources !== 'number' || !Number.isInteger(item.maxSources) || item.maxSources < 1 || item.maxSources > 8)) return false;
      if (item.includeContent !== undefined && typeof item.includeContent !== 'boolean') return false;
      if (item.recencyDays !== undefined
        && (typeof item.recencyDays !== 'number' || !Number.isInteger(item.recencyDays) || item.recencyDays < 1 || item.recencyDays > 3_650)) return false;
      if (item.domains !== undefined
        && (!Array.isArray(item.domains) || item.domains.length > 8 || !item.domains.every(safeResearchDomain))) return false;
      return Object.keys(item).every((key) => ['query', 'maxSources', 'includeContent', 'domains', 'recencyDays'].includes(key));
    });
}

export function validatePixflowWpAdminPreflightDecision(value: unknown): PixflowWpAdminPreflightValidation {
  const issues: string[] = [];
  if (!isRecord(value)) return { ok: false, issues: ['decision_not_object'] };
  if (value.schema !== PIXFLOW_WP_ADMIN_INTELLIGENCE_SCHEMA) issues.push('invalid_schema');
  if (value.version !== 1) issues.push('invalid_version');
  if (value.surface !== 'wp_admin') issues.push('invalid_surface');
  if (!['ready', 'needs_clarification', 'fallback'].includes(String(value.state))) issues.push('invalid_state');
  if (typeof value.intent !== 'string' || value.intent.trim().length === 0) issues.push('invalid_intent');
  if (!['ask', 'chat', 'plan', 'design'].includes(String(value.mode))) issues.push('invalid_mode');
  if (!isRecord(value.target) || typeof value.target.kind !== 'string') issues.push('invalid_target');
  if (value.targetProvenance !== undefined
    && !['active_context_target', 'explicit_user_target'].includes(String(value.targetProvenance))) {
    issues.push('invalid_target_provenance');
  }
  for (const key of ['integrationIds', 'skillIds', 'capabilityIds'] as const) {
    if (!boundedStringList(value[key])) issues.push(`invalid_${key}`);
  }
  if (value.capabilityIds && Array.isArray(value.capabilityIds)
    && value.capabilityIds.some((id) => /^bricks[_:.-]/i.test(String(id)))) {
    issues.push('bricks_capability_in_wp_admin');
  }
  if (!['read_only', 'reversible_write', 'destructive', 'privileged', 'code_filesystem', 'unknown'].includes(String(value.riskCeiling))) {
    issues.push('invalid_risk');
  }
  if (typeof value.readOnly !== 'boolean') issues.push('invalid_read_only');
  if (typeof value.answerOnly !== 'boolean') issues.push('invalid_answer_only');
  if (value.clarification !== null && typeof value.clarification !== 'string') issues.push('invalid_clarification');
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
    issues.push('invalid_confidence');
  }
  if (typeof value.rationale !== 'string' || value.rationale.length > 1_000) issues.push('invalid_rationale');
  if (!boundedStringList(value.unresolvedChoices, 8)) issues.push('invalid_unresolved_choices');
  if (value.contentMutationIntent !== undefined
    && !['preserve', 'replace', 'clear'].includes(String(value.contentMutationIntent))) {
    issues.push('invalid_content_mutation_intent');
  }
  if (value.proposedArguments !== undefined && !boundedProposal(value.proposedArguments)) issues.push('invalid_proposed_arguments');
  if (value.proposedActions !== undefined && !boundedProposedActions(value.proposedActions)) issues.push('invalid_proposed_actions');
  if (value.proposedReads !== undefined && !boundedProposedReads(value.proposedReads)) issues.push('invalid_proposed_reads');
  if (value.proposedResearch !== undefined && !boundedProposedResearch(value.proposedResearch)) issues.push('invalid_proposed_research');
  if (value.clarificationDisposition !== undefined) {
    const disposition = value.clarificationDisposition;
    if (!isRecord(disposition)
      || !['none', 'answer', 'supersede'].includes(String(disposition.kind))
      || (disposition.clarificationId !== null && typeof disposition.clarificationId !== 'string')) {
      issues.push('invalid_clarification_disposition');
    }
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

/**
 * The only mode policy the client may use for presentation. Server-side
 * `evaluatePixflowWpAdminModePolicy` remains authoritative for every action.
 */
export function enforceWpAdminPreflightMode(
  decision: PixflowWpAdminSemanticPreflightDecision,
): PixflowWpAdminSemanticPreflightDecision {
  const readOnlyMode = decision.mode === 'ask' || decision.mode === 'chat' || decision.mode === 'plan';
  const readOnly = decision.readOnly || readOnlyMode;
  const answerOnly = decision.answerOnly || readOnlyMode;
  const next: PixflowWpAdminSemanticPreflightDecision = {
    ...decision,
    readOnly,
    answerOnly,
    capabilityIds: readOnly ? decision.capabilityIds.filter((id) => /(?:read|list|get|inspect|status|schema|context)/i.test(id)) : decision.capabilityIds,
    riskCeiling: readOnly ? 'read_only' : decision.riskCeiling,
  };
  if (readOnly) {
    delete next.proposedArguments;
    next.proposedActions = [];
  }
  return next;
}

// Keep the import visible to type-only consumers that build a shared
// preflight request from ChatSessionMode without allowing another surface to
// inherit the WP Admin profile at runtime.
export type PixflowWpAdminChatMode = ChatSessionMode;
export type PixflowWpAdminSurface = PixflowSurface;
