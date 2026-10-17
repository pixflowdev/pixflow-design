import type { PixflowSettingsSectionId } from './pixflow-settings-profile.js';
import type { PixflowSurface } from './pixflow-surface.js';

export const PIXFLOW_WP_ADMIN_CONTRACT_SCHEMA = 'pixflow.wp-admin.contracts.v1' as const;

export type PixflowWpAdminSiteContext = {
  id: string;
  origin: string;
  isMultisite: boolean;
  networkId?: string | null;
  blogId?: string | null;
};

export type PixflowWpAdminUserContext = {
  id: string;
  locale?: string | null;
  roles?: string[];
};

export type PixflowWpAdminScreenContext = {
  id: string;
  base: string;
  path: string;
};

export type PixflowWpAdminResourceContext = {
  kind: 'site' | 'post' | 'term' | 'user' | 'option_page' | 'media' | 'unknown';
  id?: string | number | null;
  postType?: string | null;
  taxonomy?: string | null;
};

export type PixflowWpAdminIntegrationSummary = {
  id: string;
  label: string;
  status: 'active' | 'inactive' | 'missing' | 'incompatible' | 'unknown';
  version?: string | null;
  edition?: 'free' | 'pro' | 'premium' | 'unknown' | null;
  linkedSkillIds: string[];
};

export type PixflowWpAdminSurfaceConfig = {
  schema: typeof PIXFLOW_WP_ADMIN_CONTRACT_SCHEMA;
  version: 1;
  surface: 'wp_admin';
  restNamespace: string;
  settingsProfile: {
    id: 'wp_admin_slim';
    allowedSections: readonly PixflowSettingsSectionId[];
    defaultSection: PixflowSettingsSectionId;
  };
  features: {
    stageAHtmlCssJsPreview: false;
    selectedElementContext: false;
    builderMutationDispatch: false;
  };
};

export type PixflowWpAdminContext = {
  schema: typeof PIXFLOW_WP_ADMIN_CONTRACT_SCHEMA;
  version: 1;
  surface: 'wp_admin';
  site: PixflowWpAdminSiteContext;
  user: PixflowWpAdminUserContext;
  screen: PixflowWpAdminScreenContext;
  resource: PixflowWpAdminResourceContext;
  integrations: PixflowWpAdminIntegrationSummary[];
  uiHints?: {
    selectedSettingsSection?: PixflowSettingsSectionId;
    notices?: string[];
  };
};

export const PIXFLOW_WP_ADMIN_CONTEXT_IDENTITY_SCHEMA = 'pixflow.wp-admin.context-identity.v1' as const;
export const PIXFLOW_WP_ADMIN_MESSAGE_ORIGIN_SCHEMA = 'pixflow.wp-admin.message-origin.v1' as const;
export const PIXFLOW_WP_ADMIN_PENDING_CLARIFICATION_SCHEMA = 'pixflow.wp-admin.pending-clarification.v1' as const;
export const PIXFLOW_WP_ADMIN_GUTENBERG_READ_SCHEMA = 'pixflow.wp-admin.gutenberg-read.v2' as const;
export const PIXFLOW_WP_ADMIN_GUTENBERG_READ_CHUNK_SCHEMA = 'pixflow.wp-admin.gutenberg-read-chunk.v1' as const;

/** Server-verified object identity used to scope conversation and mutation authority. */
export type PixflowWpAdminContextIdentity = {
  schema: typeof PIXFLOW_WP_ADMIN_CONTEXT_IDENTITY_SCHEMA;
  version: 1;
  siteHash: string;
  userId: string;
  surface: 'wp_admin';
  objectKind: string;
  objectType: string;
  objectId: string | number | null;
  screenId: string;
  screenBase: string;
  adminArea: string;
  contextRevision: string;
  contentFingerprint: string | null;
  tabId: string;
};

export type PixflowWpAdminMessageOrigin = {
  schema: typeof PIXFLOW_WP_ADMIN_MESSAGE_ORIGIN_SCHEMA;
  version: 1;
  context: PixflowWpAdminContextIdentity;
  conversationId: string;
  sourceMessageId: string;
  messageId: string;
  createdAt: number;
  authority: 'authoritative' | 'display_only';
};

export type PixflowWpAdminPendingClarification = {
  schema: typeof PIXFLOW_WP_ADMIN_PENDING_CLARIFICATION_SCHEMA;
  version: 1;
  clarificationId: string;
  conversationId: string;
  sourceMessageId: string;
  targetContext: PixflowWpAdminContextIdentity;
  originalIntent: Record<string, unknown>;
  candidateTargets: string[];
  clarification: string;
  contextRevision: string;
  contentFingerprint: string | null;
  status: 'awaiting_user' | 'suspended' | 'resolved' | 'cancelled' | 'expired';
  createdAt: number;
  expiresAt: number;
};

export type PixflowWpAdminContextAuthorityBinding = {
  contextIdentity: PixflowWpAdminContextIdentity;
  contextAuthority: string;
  contextScope: string;
  conversationId: string;
  sourceMessageId: string;
  tabId: string;
  targetProvenance: 'active_context_target' | 'explicit_user_target';
};

export type PixflowWpAdminGutenbergBlock = {
  name: string;
  attributes: Record<string, unknown>;
  innerBlocks: PixflowWpAdminGutenbergBlock[];
};

export type PixflowWpAdminGutenbergRead = {
  schema: typeof PIXFLOW_WP_ADMIN_GUTENBERG_READ_SCHEMA;
  version: 2;
  post: {
    id: number;
    type: string;
    title: string;
    excerpt: string;
    status: string;
    slug: string;
    authorId: number;
    dateGmt: string;
    modifiedGmt: string;
    featuredMediaId: number;
    terms: Record<string, number[]>;
  };
  document: {
    source: 'persisted_wordpress' | 'live_editor';
    contentSha256: string;
    serializedBytes: number;
    topLevelBlockCount: number;
    totalBlockCount: number;
    namedBlockCount: number;
    editableTopLevelBlockCount: number;
    editableTotalBlockCount: number;
  };
  readMode: 'inline' | 'chunked';
  contentRaw: string | null;
  contentComplete: boolean;
  contentTruncated: boolean;
  blockTreeComplete: boolean;
  blocks: PixflowWpAdminGutenbergBlock[];
  inlineMedia: Array<{ attachmentId: number; blockPath: number[]; role: string; sizeSlug: string | null; alt: string | null; alsoFeatured: boolean }>;
  blockTypeInventory: Array<{ name: string; count: number }>;
  fingerprint: string;
  contentFingerprint: string;
  contextIdentity: PixflowWpAdminContextIdentity;
  contextRevision: string;
  readAuthority: {
    sessionId: string;
    conversationId: string;
    sourceMessageId: string;
    tabId: string;
  };
  readAt: string;
  snapshotId?: string;
  chunkCount?: number;
  chunkBoundaryType?: 'top_level_blocks' | 'utf8_bytes';
  nextCursor?: number | null;
  snapshotExpiresAt?: number;
  omitted?: string[];
};

export type PixflowWpAdminGutenbergReadChunk = {
  schema: typeof PIXFLOW_WP_ADMIN_GUTENBERG_READ_CHUNK_SCHEMA;
  version: 1;
  snapshotId: string;
  postId: number;
  postType: string;
  fingerprint: string;
  documentSha256: string;
  readAuthority: {
    sessionId: string;
    conversationId: string;
    sourceMessageId: string;
    tabId: string;
    contextRevision: string;
    contentFingerprint: string;
  };
  chunkBoundaryType: 'top_level_blocks' | 'utf8_bytes';
  chunkIndex: number;
  chunkCount: number;
  topLevelStart: number;
  topLevelEnd: number;
  contentFragment: string;
  blocks: PixflowWpAdminGutenbergBlock[];
  chunkSha256: string;
  contentComplete: boolean;
  contentTruncated: false;
  isFinalChunk: boolean;
  hasMore: boolean;
  nextCursor: number | null;
  expiresAt: number;
};

export const PIXFLOW_WP_ADMIN_RISK_CLASSES = [
  'read_only',
  'reversible_write',
  'destructive',
  'privileged',
  'code_filesystem',
  'unknown',
] as const;
export type PixflowWpAdminRiskClass = (typeof PIXFLOW_WP_ADMIN_RISK_CLASSES)[number];

export type PixflowJsonSchema =
  | { type: 'object'; properties?: Record<string, PixflowJsonSchema>; required?: string[]; additionalProperties?: boolean; description?: string }
  | { type: 'array'; items: PixflowJsonSchema; minItems?: number; maxItems?: number; description?: string }
  | { type: 'string'; enum?: string[]; minLength?: number; maxLength?: number; description?: string }
  | { type: 'integer' | 'number'; minimum?: number; maximum?: number; description?: string }
  | { type: 'boolean'; description?: string }
  | { type: 'null'; description?: string };

export type PixflowCapabilityAnnotations = {
  risk: PixflowWpAdminRiskClass;
  idempotency: 'idempotent' | 'non_idempotent' | 'unknown';
  reversible: boolean;
  requiresApproval: boolean;
};

export type PixflowCapabilityDefinition = {
  id: string;
  familyId: string;
  label: string;
  description: string;
  inputSchema: PixflowJsonSchema;
  outputSchema: PixflowJsonSchema;
  annotations: PixflowCapabilityAnnotations;
  integrationId: string;
  linkedSkillIds: string[];
  availability: 'available' | 'unavailable' | 'incompatible';
  /** Modes that may ask the capability to run; the server remains authoritative. */
  allowedModes?: PixflowWpAdminInteractionMode[];
  /** Target-aware permission hints; execution rechecks the live callback. */
  permission?: {
    required: string[];
    targetType: PixflowWpAdminResourceContext['kind'];
  };
  rollback?: {
    supported: boolean;
    policy: 'recorded_before_state' | 'revision' | 'none';
  };
};

export type PixflowCapabilityFamilySummary = {
  id: string;
  label: string;
  description: string;
  capabilityCount: number;
  available: boolean;
  integrationId: string;
  linkedSkillIds: string[];
  /** Compact progressive-discovery entries; detailed schemas stay behind the detail route. */
  capabilityIds?: string[];
  capabilities?: Array<{
    id: string;
    label: string;
    risk: PixflowWpAdminRiskClass;
    allowedModes?: PixflowWpAdminInteractionMode[];
  }>;
};

export type PixflowCapabilityDetail = PixflowCapabilityDefinition & {
  permission: {
    required: string[];
    targetType: PixflowWpAdminResourceContext['kind'];
  };
};

export type PixflowCapabilityValidation =
  | { ok: true; issues: [] }
  | { ok: false; issues: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isJsonSchema(value: unknown, depth = 0): value is PixflowJsonSchema {
  if (depth > 8 || !isRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'object': {
      if (value.properties !== undefined) {
        if (!isRecord(value.properties)) return false;
        if (!Object.values(value.properties).every((child) => isJsonSchema(child, depth + 1))) return false;
      }
      if (value.required !== undefined
        && (!Array.isArray(value.required) || !value.required.every((item) => typeof item === 'string'))) return false;
      return value.additionalProperties === undefined || typeof value.additionalProperties === 'boolean';
    }
    case 'array':
      return isJsonSchema(value.items, depth + 1)
        && (value.minItems === undefined || Number.isInteger(value.minItems))
        && (value.maxItems === undefined || Number.isInteger(value.maxItems));
    case 'string':
      return (value.enum === undefined || (Array.isArray(value.enum) && value.enum.every((item) => typeof item === 'string')))
        && (value.minLength === undefined || Number.isInteger(value.minLength))
        && (value.maxLength === undefined || Number.isInteger(value.maxLength));
    case 'integer':
    case 'number':
      return (value.minimum === undefined || typeof value.minimum === 'number')
        && (value.maximum === undefined || typeof value.maximum === 'number');
    case 'boolean':
    case 'null':
      return true;
    default:
      return false;
  }
}

export function validatePixflowCapabilityDefinition(value: unknown): PixflowCapabilityValidation {
  const issues: string[] = [];
  if (!isRecord(value)) return { ok: false, issues: ['capability_not_object'] };
  for (const key of ['id', 'familyId', 'label', 'description', 'integrationId'] as const) {
    if (typeof value[key] !== 'string' || value[key].length === 0) issues.push(`missing_${key}`);
  }
  if (!isJsonSchema(value.inputSchema)) issues.push('invalid_input_schema');
  if (!isJsonSchema(value.outputSchema)) issues.push('invalid_output_schema');
  if (!isRecord(value.annotations)) issues.push('missing_annotations');
  else {
    if (!(PIXFLOW_WP_ADMIN_RISK_CLASSES as readonly unknown[]).includes(value.annotations.risk)
      || value.annotations.risk === 'unknown') issues.push('invalid_risk');
    if (value.annotations.idempotency !== 'idempotent'
      && value.annotations.idempotency !== 'non_idempotent'
      && value.annotations.idempotency !== 'unknown') issues.push('invalid_idempotency');
    if (typeof value.annotations.reversible !== 'boolean') issues.push('invalid_reversible_annotation');
    if (typeof value.annotations.requiresApproval !== 'boolean') issues.push('invalid_approval_annotation');
  }
  if (value.availability !== 'available') issues.push('integration_unavailable');
  if (!Array.isArray(value.linkedSkillIds) || !value.linkedSkillIds.every((item) => typeof item === 'string')) {
    issues.push('invalid_linked_skills');
  }
  if (value.allowedModes !== undefined
    && (!Array.isArray(value.allowedModes)
      || !value.allowedModes.every((mode) => mode === 'ask' || mode === 'chat' || mode === 'plan' || mode === 'design'))) {
    issues.push('invalid_allowed_modes');
  }
  if (value.permission !== undefined) {
    if (!isRecord(value.permission)
      || !Array.isArray(value.permission.required)
      || !value.permission.required.every((item) => typeof item === 'string')
      || typeof value.permission.targetType !== 'string') {
      issues.push('invalid_permission');
    }
  }
  if (value.rollback !== undefined) {
    if (!isRecord(value.rollback)
      || typeof value.rollback.supported !== 'boolean'
      || !['recorded_before_state', 'revision', 'none'].includes(String(value.rollback.policy))) {
      issues.push('invalid_rollback');
    }
  }
  return issues.length === 0 ? { ok: true, issues: [] } : { ok: false, issues };
}

/** `chat` is retained as the wire compatibility alias for the Ask label. */
export type PixflowWpAdminInteractionMode = 'ask' | 'chat' | 'plan' | 'design';

export type PixflowWpAdminModePolicyInput = {
  mode: PixflowWpAdminInteractionMode;
  risk: PixflowWpAdminRiskClass;
  approvalGranted: boolean;
};

export type PixflowWpAdminModePolicyResult = {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: 'mode_forbids_mutation' | 'approval_required' | 'unknown_risk';
};

export function evaluatePixflowWpAdminModePolicy(
  input: PixflowWpAdminModePolicyInput,
): PixflowWpAdminModePolicyResult {
  if (input.risk === 'unknown') {
    return { allowed: false, requiresApproval: true, reason: 'unknown_risk' };
  }
  if (input.risk === 'read_only') {
    return { allowed: true, requiresApproval: false };
  }
  if (input.mode === 'ask' || input.mode === 'chat' || input.mode === 'plan') {
    return { allowed: false, requiresApproval: false, reason: 'mode_forbids_mutation' };
  }
  const requiresApproval = input.risk !== 'reversible_write';
  if (requiresApproval && !input.approvalGranted) {
    return { allowed: false, requiresApproval: true, reason: 'approval_required' };
  }
  return { allowed: true, requiresApproval };
}

export type PixflowApprovalBinding = {
  siteId: string;
  userId: string;
  sessionId: string;
  capabilityId: string;
  argumentsHash: string;
};

export type PixflowApprovalToken = PixflowApprovalBinding & {
  tokenId: string;
  issuedAt: number;
  expiresAt: number;
  consumedAt: number | null;
};

export type PixflowApprovalValidation =
  | { ok: true }
  | { ok: false; reason: 'binding_mismatch' | 'expired' | 'not_yet_valid' | 'already_consumed' };

function sameApprovalBinding(left: PixflowApprovalBinding, right: PixflowApprovalBinding): boolean {
  return left.siteId === right.siteId
    && left.userId === right.userId
    && left.sessionId === right.sessionId
    && left.capabilityId === right.capabilityId
    && left.argumentsHash === right.argumentsHash;
}

export function validatePixflowApprovalToken(
  token: PixflowApprovalToken,
  expected: PixflowApprovalBinding,
  now: number,
): PixflowApprovalValidation {
  if (!sameApprovalBinding(token, expected)) return { ok: false, reason: 'binding_mismatch' };
  if (token.consumedAt !== null) return { ok: false, reason: 'already_consumed' };
  if (now < token.issuedAt) return { ok: false, reason: 'not_yet_valid' };
  if (now >= token.expiresAt) return { ok: false, reason: 'expired' };
  return { ok: true };
}

export type PixflowApprovalConsumption =
  | { ok: true; token: PixflowApprovalToken }
  | { ok: false; reason: PixflowApprovalValidation extends infer T ? T extends { ok: false; reason: infer R } ? R : never : never };

export function consumePixflowApprovalToken(
  token: PixflowApprovalToken,
  expected: PixflowApprovalBinding,
  now: number,
): PixflowApprovalConsumption {
  const validation = validatePixflowApprovalToken(token, expected, now);
  if (!validation.ok) return validation;
  return { ok: true, token: { ...token, consumedAt: now } };
}

export type PixflowWpAdminPreflightDecision = {
  schema: typeof PIXFLOW_WP_ADMIN_CONTRACT_SCHEMA;
  version: 1;
  intent: string;
  mode: PixflowWpAdminInteractionMode;
  target: PixflowWpAdminResourceContext;
  integrationIds: string[];
  skillIds: string[];
  capabilityIds: string[];
  riskCeiling: PixflowWpAdminRiskClass;
  clarification: string | null;
  confidence: number;
  rationale: string;
};

export type PixflowWpAdminOperation = {
  operationId: string;
  siteId: string;
  userId: string;
  sessionId: string;
  capabilityId: string;
  status: 'proposed' | 'approved' | 'committed' | 'reconciled' | 'rolled_back' | 'failed' | 'conflicted';
  risk: Exclude<PixflowWpAdminRiskClass, 'unknown'>;
  normalisedArgumentsHash: string;
  targetFingerprint: string;
  beforeFingerprint?: string | null;
  afterFingerprint?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type PixflowWpAdminAuditEvent = {
  id: string;
  operationId?: string;
  siteId: string;
  userId: string;
  sessionId: string;
  capabilityId: string;
  event: 'discovered' | 'detailed' | 'preflighted' | 'approved' | 'started' | 'committed' | 'reconciled' | 'rolled_back' | 'failed' | 'rejected';
  risk: PixflowWpAdminRiskClass;
  createdAt: number;
  redactedArgumentsHash?: string;
  detail?: string;
};

export type PixflowWpAdminRollbackRequest = {
  operationId: string;
  expectedAfterFingerprint: string;
  reason: 'user_requested' | 'recovery' | 'conflict';
};

export type PixflowWpAdminRollbackResult = {
  operationId: string;
  status: 'rolled_back' | 'conflicted' | 'unavailable';
  observedFingerprint: string;
  message?: string;
};

export const PIXFLOW_WP_ADMIN_CAPABILITY_API_SCHEMA = 'pixflow.wp-admin.capability-api.v1' as const;

export type PixflowWpAdminCapabilitySummaryResponse = {
  schema: typeof PIXFLOW_WP_ADMIN_CAPABILITY_API_SCHEMA;
  version: 1;
  surface: 'wp_admin';
  families: PixflowCapabilityFamilySummary[];
  unavailable: Array<{
    id: string;
    label: string;
    reason: 'missing' | 'inactive' | 'incompatible' | 'wrong_edition' | 'disabled' | 'unknown';
    /** Display-only plan restriction; never grants execution access. */
    requiresPro?: boolean;
    version?: string | null;
    requiredVersion?: string | null;
  }>;
};

export type PixflowWpAdminCapabilityDetailResponse = {
  schema: typeof PIXFLOW_WP_ADMIN_CAPABILITY_API_SCHEMA;
  version: 1;
  surface: 'wp_admin';
  capability: PixflowCapabilityDetail;
};

export type PixflowWpAdminCapabilityRequest = {
  surface: 'wp_admin';
  sessionId: string;
  mode: PixflowWpAdminInteractionMode;
  capabilityId: string;
  arguments: Record<string, unknown>;
  approvalToken?: string | null;
  idempotencyKey?: string | null;
  operationId?: string | null;
  contextBinding?: PixflowWpAdminContextAuthorityBinding;
};

export type PixflowWpAdminApprovalRequest = Omit<PixflowWpAdminCapabilityRequest, 'approvalToken' | 'idempotencyKey'>;

export type PixflowWpAdminApprovalResponse = {
  schema: typeof PIXFLOW_WP_ADMIN_CAPABILITY_API_SCHEMA;
  version: 1;
  approval: PixflowApprovalToken;
  operation: PixflowWpAdminOperation;
};

export type PixflowWpAdminExecutionResponse = {
  schema: typeof PIXFLOW_WP_ADMIN_CAPABILITY_API_SCHEMA;
  version: 1;
  operation: PixflowWpAdminOperation;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
};

export type PixflowWpAdminPairingResponse = {
  schema: typeof PIXFLOW_WP_ADMIN_CAPABILITY_API_SCHEMA;
  version: 1;
  siteId: string;
  userId: string;
  token: string;
  expiresAt: number;
};

export const PIXFLOW_WP_ADMIN_WORKING_MEMORY_SCHEMA = 'pixflow.wp-admin.working-memory.v1' as const;
export const PIXFLOW_WP_ADMIN_MEMORY_CAPS = {
  maxFacts: 24,
  maxRecentChatMessages: 16,
  maxRecentMessageChars: 4_000,
  maxFactStringChars: 16_000,
  maxSkillIds: 12,
  maxStoredBytes: 128 * 1_024,
} as const;

export type PixflowWpAdminWorkingMemoryFact = {
  id: string;
  capabilityId: string;
  integrationId: string;
  target: PixflowWpAdminResourceContext;
  intent: string;
  status: 'proposed' | 'user_confirmed' | 'applied' | 'reverted';
  sourceMessageId: string;
  sourceMessageMode: PixflowWpAdminInteractionMode;
  skillIds: string[];
  targetFingerprint: string;
  createdAt: number;
};

export type PixflowWpAdminWorkingMemory = {
  schema: typeof PIXFLOW_WP_ADMIN_WORKING_MEMORY_SCHEMA;
  version: 1;
  scope: 'session' | 'user_site';
  siteId: string;
  userId: string;
  sessionId: string;
  restored: boolean;
  recentChat: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    mode: PixflowWpAdminInteractionMode;
    authority: 'conversation_only' | 'display_only';
    createdAt: number;
  }>;
  facts: PixflowWpAdminWorkingMemoryFact[];
};
