import { describe, expect, it } from 'vitest';

import {
  PIXFLOW_SETTINGS_PROFILES,
  PIXFLOW_SURFACE_FEATURES,
  PIXFLOW_WP_ADMIN_MEMORY_CAPS,
  PIXFLOW_WP_ADMIN_CONTEXT_IDENTITY_SCHEMA,
  PIXFLOW_WP_ADMIN_MESSAGE_ORIGIN_SCHEMA,
  PIXFLOW_WP_ADMIN_PENDING_CLARIFICATION_SCHEMA,
  PIXFLOW_WP_ADMIN_RISK_CLASSES,
  PIXFLOW_WP_ADMIN_WORKING_MEMORY_SCHEMA,
  applyPixflowSharedAppConfigPatch,
  consumePixflowApprovalToken,
  enforceWpAdminPreflightMode,
  evaluatePixflowWpAdminModePolicy,
  getPixflowSettingsSurfaceProfile,
  isPixflowFrameEnvelope,
  isPixflowSettingsSectionAllowed,
  resolvePixflowSettingsSection,
  resolvePixflowSurface,
  sanitizePixflowSharedAppConfigNotification,
  validatePixflowApprovalToken,
  validatePixflowCapabilityDefinition,
  validatePixflowWpAdminPreflightDecision,
  type PixflowCapabilityDefinition,
  type PixflowSharedAppConfigState,
} from '../src/index.js';

describe('Pixflow surface and settings contracts', () => {
  it('rejects an unknown or mismatched surface instead of inferring Bricks', () => {
    expect(resolvePixflowSurface('bricks_builder')).toBe('bricks_builder');
    expect(resolvePixflowSurface('wp_admin')).toBe('wp_admin');
    expect(resolvePixflowSurface('bricks')).toBeNull();
    expect(resolvePixflowSurface({ surface: 'bricks_builder' })).toBeNull();
    expect(isPixflowFrameEnvelope({
      schema: 'pixflow.surface.frame.v1',
      version: 1,
      surface: 'bricks_builder',
      messageId: 'm1',
      sessionId: 's1',
      type: 'hello',
      payload: {},
    })).toBe(true);
    expect(isPixflowFrameEnvelope({
      schema: 'pixflow.surface.frame.v1',
      version: 1,
      surface: 'unknown',
      messageId: 'm1',
      sessionId: 's1',
      type: 'hello',
      payload: {},
    })).toBe(false);
  });

  it('keeps Stage A features Bricks-only and exposes the WP Admin settings profile', () => {
    expect(PIXFLOW_SURFACE_FEATURES.bricks_builder.stageAHtmlCssJsPreview).toBe(true);
    expect(PIXFLOW_SURFACE_FEATURES.wp_admin.stageAHtmlCssJsPreview).toBe(false);

    const profile = getPixflowSettingsSurfaceProfile('wp_admin');
    expect(profile).toEqual(PIXFLOW_SETTINGS_PROFILES.wp_admin);
    expect(profile.allowedSections).toEqual(PIXFLOW_SETTINGS_PROFILES.bricks_builder.allowedSections);
    expect(isPixflowSettingsSectionAllowed(profile, 'execution')).toBe(true);
    expect(isPixflowSettingsSectionAllowed(profile, 'skills')).toBe(true);
    expect(isPixflowSettingsSectionAllowed(profile, 'bricksExtensions')).toBe(true);
    expect(isPixflowSettingsSectionAllowed(profile, 'resourcePacks')).toBe(true);
    expect(isPixflowSettingsSectionAllowed(profile, 'media')).toBe(true);
    expect(resolvePixflowSettingsSection(profile, 'skills')).toBe('skills');
    expect(resolvePixflowSettingsSection(profile, 'bricksExtensions')).toBe('bricksExtensions');
    expect(resolvePixflowSettingsSection(profile, 'instructions')).toBe('memory');
    expect(resolvePixflowSettingsSection(profile, 'language')).toBe('appearance');
    expect(resolvePixflowSettingsSection(profile, 'integrations')).toBe('execution');
    expect(resolvePixflowSettingsSection(profile, 'critiqueTheater')).toBe('execution');
    expect(resolvePixflowSettingsSection(profile, 'notifications')).toBe('execution');
    expect(resolvePixflowSettingsSection(profile, 'pet')).toBe('execution');
    expect(resolvePixflowSettingsSection(profile, 'media')).toBe('media');
    expect(resolvePixflowSettingsSection(profile, undefined)).toBe('execution');
  });
});

describe('Pixflow shared app-config contract', () => {
  it('merges revision-aware patches without allowing a stale write to revert newer keys', () => {
    const initial: PixflowSharedAppConfigState = {
      revision: 0,
      values: { theme: 'light', mode: 'daemon', agentId: 'opencode' },
      keyRevisions: {},
    };
    const themeChange = applyPixflowSharedAppConfigPatch(initial, {
      baseRevision: 0,
      source: 'bricks_builder',
      originId: 'bricks-1',
      patch: { theme: 'dark' },
    });
    const executionChange = applyPixflowSharedAppConfigPatch(themeChange.state, {
      baseRevision: themeChange.state.revision,
      source: 'wp_admin',
      originId: 'admin-1',
      patch: { mode: 'api', agentId: null },
    });
    const stale = applyPixflowSharedAppConfigPatch(executionChange.state, {
      baseRevision: 0,
      source: 'wp_admin',
      originId: 'admin-stale',
      patch: { theme: 'light', mode: 'daemon' },
    });

    expect(stale.conflictedKeys).toEqual(['theme', 'mode']);
    expect(stale.state.values).toMatchObject({ theme: 'dark', mode: 'api', agentId: null });
    expect(stale.appliedKeys).toEqual([]);
  });

  it('never forwards provider secrets in a change notification', () => {
    const notification = sanitizePixflowSharedAppConfigNotification({
      schema: 'pixflow.app-config.changed.v1',
      version: 1,
      revision: 4,
      source: 'wp_admin',
      originId: 'admin-1',
      patch: { theme: 'dark', mode: 'api' },
      // Simulates an untrusted bridge payload attempting to smuggle a key.
      apiKey: 'must-not-cross-surfaces',
    } as unknown as Record<string, unknown>);

    expect(notification).not.toBeNull();
    if (notification) {
      expect(notification).not.toHaveProperty('apiKey');
      expect(notification.patch).toEqual({ theme: 'dark', mode: 'api' });
    }
  });

  it('synchronizes the Codex Fast preference as a typed boolean across Pixflow surfaces', () => {
    const notification = sanitizePixflowSharedAppConfigNotification({
      schema: 'pixflow.app-config.changed.v1',
      version: 1,
      revision: 5,
      source: 'wp_admin',
      originId: 'admin-fast-mode',
      patch: {
        agentModels: {
          codex: {
            model: 'gpt-5.6-luna',
            reasoning: 'medium',
            fastMode: true,
          },
          invalid: {
            model: 'gpt-5.4-mini',
            fastMode: 'true',
          },
        },
      },
    });

    expect(notification?.patch.agentModels).toEqual({
      codex: {
        model: 'gpt-5.6-luna',
        reasoning: 'medium',
        fastMode: true,
      },
      invalid: {
        model: 'gpt-5.4-mini',
      },
    });
  });

  it('synchronizes sanitized Bricks extension policy without exposing unrelated fields', () => {
    const notification = sanitizePixflowSharedAppConfigNotification({
      schema: 'pixflow.app-config.changed.v1',
      version: 1,
      revision: 6,
      source: 'wp_admin',
      originId: 'bricks-extension-settings',
      patch: {
        bricksExtensions: {
          twoFactorAuthentication: {
            enabled: true,
            requireSetup: false,
            methods: { totp: true, email: false, passkey: true, invalid: true },
            roleScope: { allUsers: false, roles: { subscriber: true, 'bad role': true } },
            email: { companyName: 'Pixflow', secret: 'must-not-cross-surfaces' },
          },
          cookieConsent: {
            enabled: true,
            automaticBlocking: true,
            services: { googleMaps: true, invalid: true },
          },
          unknownModule: { enabled: true },
        },
      },
    });

    expect(notification?.patch.bricksExtensions).toEqual({
      cookieConsent: {
        enabled: true,
        automaticBlocking: true,
        services: { googleMaps: true },
      },
      twoFactorAuthentication: {
        enabled: true,
        requireSetup: false,
        methods: { totp: true, email: false, passkey: true },
        roleScope: { allUsers: false, roles: { subscriber: true } },
        email: { companyName: 'Pixflow' },
      },
    });
  });
});

describe('Pixflow WP Admin capability and policy contracts', () => {
  it('publishes typed object-context, message-origin, and clarification schemas', () => {
    expect(PIXFLOW_WP_ADMIN_CONTEXT_IDENTITY_SCHEMA).toBe('pixflow.wp-admin.context-identity.v1');
    expect(PIXFLOW_WP_ADMIN_MESSAGE_ORIGIN_SCHEMA).toBe('pixflow.wp-admin.message-origin.v1');
    expect(PIXFLOW_WP_ADMIN_PENDING_CLARIFICATION_SCHEMA).toBe('pixflow.wp-admin.pending-clarification.v1');
  });
  const validCapability: PixflowCapabilityDefinition = {
    id: 'wp.posts.read',
    familyId: 'wordpress-core',
    label: 'Read posts',
    description: 'Read one allowlisted post.',
    inputSchema: { type: 'object', properties: { postId: { type: 'integer' } }, required: ['postId'], additionalProperties: false },
    outputSchema: { type: 'object', properties: { postId: { type: 'integer' } }, additionalProperties: false },
    annotations: { risk: 'read_only', idempotency: 'idempotent', reversible: false, requiresApproval: false },
    integrationId: 'wordpress-core',
    linkedSkillIds: ['wordpress-content'],
    availability: 'available',
  };

  it('rejects unknown risk, missing annotations, malformed schemas, and unavailable families', () => {
    expect(PIXFLOW_WP_ADMIN_RISK_CLASSES).toEqual([
      'read_only',
      'reversible_write',
      'destructive',
      'privileged',
      'code_filesystem',
      'unknown',
    ]);
    expect(validatePixflowCapabilityDefinition(validCapability)).toEqual({ ok: true, issues: [] });
    expect(validatePixflowCapabilityDefinition({
      ...validCapability,
      annotations: { ...validCapability.annotations, risk: 'unknown' },
    } as PixflowCapabilityDefinition).ok).toBe(false);
    expect(validatePixflowCapabilityDefinition({
      ...validCapability,
      annotations: undefined,
    } as unknown as PixflowCapabilityDefinition).ok).toBe(false);
    expect(validatePixflowCapabilityDefinition({
      ...validCapability,
      inputSchema: { type: 'object', required: 'postId' },
    } as unknown as PixflowCapabilityDefinition).ok).toBe(false);
    expect(validatePixflowCapabilityDefinition({
      ...validCapability,
      availability: 'unavailable',
    }).ok).toBe(false);
  });

  it('keeps Ask and Plan read-only and requires approval for high-risk Design work', () => {
    expect(evaluatePixflowWpAdminModePolicy({ mode: 'ask', risk: 'reversible_write', approvalGranted: false })).toMatchObject({
      allowed: false,
      reason: 'mode_forbids_mutation',
    });
    expect(evaluatePixflowWpAdminModePolicy({ mode: 'plan', risk: 'destructive', approvalGranted: true })).toMatchObject({
      allowed: false,
      reason: 'mode_forbids_mutation',
    });
    expect(evaluatePixflowWpAdminModePolicy({ mode: 'design', risk: 'privileged', approvalGranted: false })).toMatchObject({
      allowed: false,
      reason: 'approval_required',
    });
    expect(evaluatePixflowWpAdminModePolicy({ mode: 'design', risk: 'privileged', approvalGranted: true })).toMatchObject({
      allowed: true,
      requiresApproval: true,
    });
    expect(evaluatePixflowWpAdminModePolicy({ mode: 'design', risk: 'unknown', approvalGranted: true })).toMatchObject({
      allowed: false,
      reason: 'unknown_risk',
    });
  });

  it('binds approval tokens to site, user, session, capability, arguments, expiry, and one-time use', () => {
    const expected = {
      siteId: 'site-1',
      userId: '42',
      sessionId: 'session-1',
      capabilityId: 'wp.posts.update',
      argumentsHash: 'sha256:args',
    } as const;
    const token = {
      tokenId: 'approval-1',
      ...expected,
      issuedAt: 100,
      expiresAt: 200,
      consumedAt: null,
    };

    expect(validatePixflowApprovalToken(token, expected, 150)).toEqual({ ok: true });
    expect(validatePixflowApprovalToken({ ...token, userId: '99' }, expected, 150).ok).toBe(false);
    expect(validatePixflowApprovalToken(token, expected, 201).ok).toBe(false);
    expect(validatePixflowApprovalToken({ ...token, consumedAt: 151 }, expected, 150).ok).toBe(false);
    const consumed = consumePixflowApprovalToken(token, expected, 150);
    expect(consumed.ok).toBe(true);
    if (consumed.ok) {
      expect(consumed.token.consumedAt).toBe(150);
      expect(validatePixflowApprovalToken(consumed.token, expected, 150).ok).toBe(false);
    }
  });

  it('publishes bounded WP Admin working-memory limits', () => {
    expect(PIXFLOW_WP_ADMIN_WORKING_MEMORY_SCHEMA).toBe('pixflow.wp-admin.working-memory.v1');
    expect(PIXFLOW_WP_ADMIN_MEMORY_CAPS.maxFacts).toBeGreaterThan(0);
    expect(PIXFLOW_WP_ADMIN_MEMORY_CAPS.maxStoredBytes).toBeLessThanOrEqual(256 * 1_024);
  });

  it('validates bounded ordered WP Admin action proposals and strips them from read-only modes', () => {
    const decision = {
      schema: 'pixflow.wp-admin.intelligence.v1' as const,
      version: 1 as const,
      surface: 'wp_admin' as const,
      state: 'ready' as const,
      intent: 'create_events_model',
      mode: 'design' as const,
      target: { kind: 'site' as const, id: null },
      integrationIds: ['acf'],
      skillIds: ['acf-content-model'],
      capabilityIds: [
        'pixflow/acf/create-post-type',
        'pixflow/acf/create-taxonomy',
        'pixflow/acf/create-field-group',
      ],
      riskCeiling: 'reversible_write' as const,
      readOnly: false,
      answerOnly: false,
      clarification: null,
      confidence: 0.98,
      rationale: 'One ordered content-model batch.',
      unresolvedChoices: [],
      contentMutationIntent: 'preserve' as const,
      proposedActions: [
        { capabilityId: 'pixflow/acf/create-post-type', arguments: { post_type: 'event', title: 'Events' } },
        { capabilityId: 'pixflow/acf/create-taxonomy', arguments: { taxonomy: 'event_category', title: 'Event Categories', object_type: ['event'] } },
        { capabilityId: 'pixflow/acf/create-taxonomy', arguments: { taxonomy: 'event_venue', title: 'Venues', object_type: ['event'] } },
      ],
      proposedReads: [
        { capabilityId: 'pixflow/wp-admin/list-media', arguments: { search: 'project', perPage: 12 } },
        { capabilityId: 'pixflow/wp-admin/plugin-source/search', arguments: { plugin: 'Example Plugin', query: 'shortcode render hook' } },
      ],
      proposedResearch: [
        { query: 'WordPress register_rest_route permission callback documentation', maxSources: 5, includeContent: true, domains: ['developer.wordpress.org'] },
      ],
    };

    expect(validatePixflowWpAdminPreflightDecision(decision)).toEqual({ ok: true });
    expect(validatePixflowWpAdminPreflightDecision({ ...decision, contentMutationIntent: 'empty' }).ok).toBe(false);
    expect(validatePixflowWpAdminPreflightDecision({
      ...decision,
      proposedActions: Array.from({ length: 13 }, (_, index) => ({
        capabilityId: 'pixflow/acf/create-field-group',
        arguments: { title: `Group ${index}` },
      })),
    }).ok).toBe(false);
    expect(validatePixflowWpAdminPreflightDecision({
      ...decision,
      proposedActions: [{ capabilityId: 'pixflow/acf/create-field-group', arguments: { apiKey: 'must-not-cross' } }],
    }).ok).toBe(false);
    expect(validatePixflowWpAdminPreflightDecision({
      ...decision,
      proposedReads: Array.from({ length: 7 }, () => ({ capabilityId: 'pixflow/wp-admin/list-media', arguments: {} })),
    }).ok).toBe(false);
    expect(validatePixflowWpAdminPreflightDecision({
      ...decision,
      proposedReads: [{ capabilityId: 'pixflow/wp-admin/plugin-source/search', arguments: { credential: 'must-not-cross' } }],
    }).ok).toBe(false);
    expect(validatePixflowWpAdminPreflightDecision({
      ...decision,
      proposedResearch: Array.from({ length: 7 }, (_, index) => ({ query: `query ${index}` })),
    }).ok).toBe(false);
    expect(validatePixflowWpAdminPreflightDecision({
      ...decision,
      proposedResearch: [{ query: 'safe query', domains: ['127.0.0.1'] }],
    }).ok).toBe(false);
    expect(validatePixflowWpAdminPreflightDecision({
      ...decision,
      proposedResearch: [{ query: 'apiKey=must-not-cross' }],
    }).ok).toBe(false);

    const nestedGutenbergBlocks = Array.from({ length: 8 }).reduceRight<unknown[]>((innerBlocks) => ([{
      name: 'core/group', attributes: {}, innerBlocks,
    }]), [{ name: 'core/paragraph', attributes: { content: 'Deep document' }, innerBlocks: [] }]);
    expect(validatePixflowWpAdminPreflightDecision({
      ...decision,
      integrationIds: ['wordpress-gutenberg'],
      skillIds: ['wordpress-gutenberg-authoring'],
      capabilityIds: ['pixflow/wp-admin/gutenberg/apply-document'],
      contentMutationIntent: 'replace',
      proposedActions: [{
        capabilityId: 'pixflow/wp-admin/gutenberg/apply-document',
        arguments: { postId: 7, expectedFingerprint: 'sha256:test', blocks: nestedGutenbergBlocks },
      }],
    })).toEqual({ ok: true });

    const planDecision = enforceWpAdminPreflightMode({ ...decision, mode: 'plan' });
    expect(planDecision.proposedActions).toEqual([]);
    expect(planDecision.proposedReads).toEqual(decision.proposedReads);
    expect(planDecision.capabilityIds).toEqual([]);
  });
});
