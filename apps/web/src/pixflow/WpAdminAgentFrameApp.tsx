import { usePixflowFeatureRuntime } from './feature-runtime';
import { usePixflowLicenseRefresh } from './use-license-refresh';
import { useBuilderHandoffReceiver, builderHandoffPersistenceSurface, builderHandoffConversationKey, builderHandoffAttachments, assertBuilderHandoffTarget, finishBuilderHandoffReceipt, type BuilderHandoffExecution } from './builder-handoff-receiver';
import { useDurableChatHistory } from './use-durable-chat-history';
import { recoverDirectRunMessages } from './direct-run-history';
import { ChatHistoryControls } from './ChatHistoryControls';
import { mergeChatHistory } from './chat-history-client';
import { resolveEditorRunTarget } from './editor-run-target';
import { wpAdminBootstrapContextStatus } from './wp-admin-bootstrap-context';
import { useT as usePixflowUiTranslation } from '../i18n';
import { acceptedSteeringMessageIds, steeringPromptHistory, steeringTranscriptEvents } from './steering-messages';
import { memoryIndexOf } from './saved-memory';
import { withGutenbergTarget } from './gutenberg-native-tools';
import { readLockedSkills } from './locked-skills';
import type { LockedSkillSummary } from '@open-design/contracts';
import { DesignSystemSwitch } from './DesignSystemSwitch';
import { clearCompletedToolEvents, onToolHistoryCleared } from './tool-history';
import { annotationImageInput, routeAnnotationScreenshots } from './annotation-image-input';
import { getPixflowWordPressConfig } from './wordpress-context';
import { buildPixflowWordPressAppConfigPrefs } from './wordpress-settings-prefs';
import { applyBuilderContext } from './builder-client-extensions';
import { steerDirectSite } from './direct-site';
import { directTabStorageKey as composerStorageKey } from './direct-tab-storage';
import { randomUUID } from '../utils/uuid';
import { EnhancedDesignGuidance } from './EnhancedDesignGuidance';
import { directSkillMentions, isDiscoverableSkillMention } from './direct-skill-mentions';
import { directMcpMentionContext } from './mcp-mentions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SiteAccessNotice, runDirectSite, pendingDirectSiteRun, directRunStatus, useSiteAccess, useDirectAttachmentProject } from './direct-site';
import { directRunFailurePresentation } from './direct-run-presentation';
import type { MutableRefObject } from 'react';
import {
  getPixflowSettingsSurfaceProfile,
  type ChatSessionMode,
  type ChatRunStatus,
  type PixflowCapabilityDetail,
  type PixflowCapabilityFamilySummary,
  type PixflowWpAdminInteractionMode,
  type PixflowWpAdminContextAuthorityBinding,
  type PixflowWpAdminContextIdentity,
  type PixflowWpAdminMessageOrigin,
  type PixflowWpAdminMention,
  type PixflowWpAdminPendingClarification,
  type PixflowWpAdminSemanticPreflightDecision,
  type PixflowWpAdminSkillSummary,
  type WorkspaceContextItem,
} from '@open-design/contracts';
import { useT } from '../i18n';
import { AvatarMenu } from '../components/AvatarMenu';
import { SettingsDialog, type SettingsSection } from '../components/SettingsDialog';
import { Icon } from '../components/Icon';
import {
  SharedChatComposer,
  type SharedChatComposerHandle,
  type SharedChatSendMeta,
} from '../components/shared-chat/SharedChatComposer';
import { SharedComposerDock } from '../components/shared-chat/SharedComposerDock';
import { SharedChatRows, type SharedChatAgentIdentity, type SharedChatInputMessage } from '../components/shared-chat/SharedChatRows';
import { SharedMessageStream } from '../components/shared-chat/SharedMessageStream';
import { QuestionRequestCard, latestQuestionRequest } from '../components/QuestionRequestCard';
import type { QuestionFormOpenRequest } from '../components/AssistantMessage';
import { loadConfig, saveConfig, syncComposioConfigToDaemon } from '../state/config';
import { useAppearance } from '../state/useAppearance';
import { useResourceDraft } from './resource-draft';
import { pixflowRuntimeFetch, pixflowWordPressRestFetch } from './runtime-fetch';
import { hashSourceText } from './source-hash';
import { canonicalizeGutenbergReadBlocks, discoverGutenbergBlockTypes, gutenbergActionUnavailableMessage, isGutenbergActionUnavailable, prepareGutenbergAction, type GutenbergActionUnavailable } from './gutenberg-serializer-host';
import {
  fetchPixflowOptionalBridgeAgents,
  persistPixflowOptionalBridgeConfig,
  readCachedPixflowOptionalBridgeAgents,
} from './optional-bridge';
import { fetchResearchStatusViaDaemon, searchResearchViaDaemon, streamViaDaemon } from '../providers/daemon';
import { streamMessage } from '../providers/anthropic';
import {
  agentReadinessBridgeStatusSignature,
  bridgeStatusCanWarmAgentReadiness,
  warmSelectedAgentReadiness,
} from '../providers/agent-readiness';
import type { AgentEvent, ApiProtocol, ApiProtocolConfig, ChatMessage, SkillSummary } from '../types';
import { buildWpAdminMentions, filterWpAdminSkills } from './wp-admin-mentions';
import { runWpAdminGutenbergRepair, runWpAdminSemanticPreflight, buildWpAdminSystemPrompt, wpAdminPreparedActionNotice, wpAdminUnpreparedWriteNotice } from './wp-admin-semantic-preflight';
import {
  activateWpAdminSkillsFromDecision,
  mergeWpAdminSkillCatalogues,
  wpAdminGutenbergPreparationFailurePolicy,
} from './wp-admin-gutenberg-skill-router';
import { normalizePixflowBricksAgentFailureNotice } from './BricksAgentFailureBanner';
import {
  validateWpAdminExactGutenbergRead,
  wpAdminContextPostId,
  wpAdminDirtyEditorState,
} from './wp-admin-gutenberg-grounding';
import {
  appendWpAdminWorkingMemoryTurn,
  loadWpAdminWorkingMemory,
  workingMemoryContext,
  type WpAdminWorkingMemoryInput,
} from './wp-admin-working-memory';
import {
  authoritativeWpAdminMessages,
  buildWpAdminContextIdentity,
  buildWpAdminMessageOrigin,
  buildWpAdminPendingClarification,
  canContinueWpAdminClarification,
  sanitizeUnsupportedReviewClaim,
  sameWpAdminContext,
  wpAdminContextScopeKey,
  wpAdminTabContextKey,
} from './wp-admin-context-isolation';
import {
  appendWpAdminResearchSources,
  runWpAdminResearchBatch,
  wpAdminResearchActivitySources,
  wpAdminResearchProposals,
} from './wp-admin-research';
import {
  completeWpAdminActivity,
  mergeWpAdminProviderEvent,
  sanitizeWpAdminProviderEvents,
  settleActiveWpAdminActivities,
  startWpAdminActivity,
  updateWpAdminResearchActivity,
} from './wp-admin-agent-activity';
import {
  createPixflowSharedAppConfigNotification,
  publishPixflowSharedAppConfigNotification,
  subscribePixflowSharedAppConfigNotifications,
} from './shared-app-config-notification';
import { PixflowAgentSurfaceShell } from './PixflowAgentSurfaceShell';
import {
  PixflowBridgeUpdateNotice,
  usePixflowBridgeUpdateState,
} from './bridge-update-gate';
import { resetPixflowOnboardingProfile } from './onboarding-profile';
import { agentModelDisplayName } from '../utils/agentLabels';
import { apiExecutionAgentId, apiProtocolModelLabel, apiExecutionLabel, apiExecutionModel } from '../utils/apiProtocol';
import type {
  AgentInfo,
  AppConfig,
  AppVersionInfo,
  ChatAttachment,
  ChatCommentAttachment,
} from '../types';

type WpAdminContext = Record<string, unknown>;

type WpAdminRuntimeConfig = {
  surface?: string;
  appConfig?: Record<string, unknown>;
  context?: WpAdminContext;
  contextUrl?: string;
  restNonce?: string;
  sessionStorageKey?: string;
  siteHash?: string;
  version?: string;
  bridgeRequiredVersion?: string;
  bridge?: { requiredVersion?: string };
};

function hasUsableWpAdminContext(value: WpAdminContext | undefined): boolean {
  if (!value || typeof value !== 'object') return false;
  const screen = value.screen && typeof value.screen === 'object'
    ? value.screen as Record<string, unknown>
    : {};
  return Boolean(String(screen.id || '').trim() || String(screen.base || '').trim());
}

export type WpAdminMessage = SharedChatInputMessage & {
  sessionMode?: ChatSessionMode;
  awaitingInput?: boolean;
  originContext?: PixflowWpAdminMessageOrigin;
  rollbackReceipt?: WpAdminRunRollbackReceipt;
};

type WpAdminActionOperation = {
  operationId?: string;
  status?: string;
  afterFingerprint?: string | null;
  sessionId?: string;
  conversationId?: string;
  sourceMessageId?: string;
  tabId?: string;
};

export type WpAdminRunRollbackReceipt = {
  schema: 'pixflow.wp-admin.run-rollback.v1';
  status: 'available' | 'rolled_back' | 'failed' | 'unavailable';
  contextScope: string;
  conversationId: string;
  sourceMessageId: string;
  tabId: string;
  createdAt: number;
  operations: Array<{
    operationId: string;
    afterFingerprint: string;
    sessionId: string;
    capabilityId: string;
    label: string;
  }>;
};

export type WpAdminActionState = {
  id: string;
  capability: PixflowCapabilityDetail;
  initialArguments: Record<string, unknown>;
  error?: string;
  operation?: WpAdminActionOperation;
  result?: unknown;
  contextBinding?: PixflowWpAdminContextAuthorityBinding;
};

function runtimeConfig(): WpAdminRuntimeConfig {
  if (typeof window === 'undefined') return {};
  const candidate = (window as typeof window & { pixflowDesignWpAdmin?: WpAdminRuntimeConfig }).pixflowDesignWpAdmin;
  if (candidate && typeof candidate === 'object') return candidate;
  const wordpress = (window as typeof window & { __PIXFLOW_DESIGN_WORDPRESS__?: WpAdminRuntimeConfig }).__PIXFLOW_DESIGN_WORDPRESS__;
  return wordpress && typeof wordpress === 'object' ? wordpress : {};
}

export function mergeWpAdminRuntimeConfig(
  seed: Omit<Partial<AppConfig>, 'apiProtocolConfigs'> & {
    apiProtocolConfigs?: Partial<Record<ApiProtocol, Partial<ApiProtocolConfig>>>;
  },
  local: Partial<AppConfig>,
  hasPersistedExecutionPreference: boolean,
): Partial<AppConfig> {
  const merged: Partial<AppConfig> = {
    ...local,
    ...seed,
    apiProtocolConfigs: { ...(local.apiProtocolConfigs ?? {}) },
  };
  // Cross-surface preferences omit credentials. Merge each protocol rather
  // than replacing its local credentials with the public preference record.
  for (const protocol of Object.keys(seed.apiProtocolConfigs ?? {}) as ApiProtocol[]) {
    merged.apiProtocolConfigs![protocol] = {
      apiKey: '', baseUrl: '', model: '',
      ...local.apiProtocolConfigs?.[protocol],
      ...seed.apiProtocolConfigs?.[protocol],
    };
  }
  if (hasPersistedExecutionPreference) {
    if (local.mode !== undefined) merged.mode = local.mode;
    if (local.agentId !== undefined) merged.agentId = local.agentId;
    merged.agentModels = {
      ...(seed.agentModels ?? {}),
      ...(local.agentModels ?? {}),
    };
  }
  return merged;
}

function hasPersistedWpAdminExecutionPreference(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const parsed = JSON.parse(localStorage.getItem('open-design:config') || 'null') as Record<string, unknown> | null;
    return Boolean(parsed && (Object.prototype.hasOwnProperty.call(parsed, 'agentId')
      || Object.prototype.hasOwnProperty.call(parsed, 'agentModels')));
  } catch {
    return false;
  }
}

export function safeConfig(seed: Record<string, unknown> | undefined): AppConfig {
  const local = loadConfig();
  if (!seed) return local;
  return {
    // WordPress seeds a fresh document from the signed-in user's saved provider.
    // The origin-wide browser cache may belong to an older mounted surface.
    ...mergeWpAdminRuntimeConfig(seed as Partial<AppConfig>, local,
      seed.mode !== 'api' && seed.mode !== 'daemon' && hasPersistedWpAdminExecutionPreference()),
    apiKey: local.apiKey,
  } as AppConfig;
}

function contextStorageKey(runtime: WpAdminRuntimeConfig, identity: PixflowWpAdminContextIdentity | null): string {
  const base = runtime.sessionStorageKey || 'pixflowDesign.wpAdminAgentSession.v1';
  const site = runtime.siteHash || 'site';
  const user = typeof runtime.context?.user === 'object' && runtime.context?.user !== null
    ? String((runtime.context.user as Record<string, unknown>).id || 'user')
    : 'user';
  return identity ? `${base}:${wpAdminContextScopeKey(identity)}` : `${base}:${site}:${user}:unverified`;
}

function pendingActionStorageKey(runtime: WpAdminRuntimeConfig, identity: PixflowWpAdminContextIdentity | null): string {
  return `${contextStorageKey(runtime, identity)}:${identity ? wpAdminTabContextKey(identity) : 'unverified'}:pending-action`;
}

function isWpAdminPendingAction(value: unknown): value is WpAdminActionState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as WpAdminActionState;
  return typeof candidate.id === 'string'
    && Boolean(candidate.capability)
    && typeof candidate.capability.id === 'string'
    && Boolean(candidate.initialArguments)
    && typeof candidate.initialArguments === 'object'
    && !Array.isArray(candidate.initialArguments)
    && Boolean(candidate.contextBinding)
    && typeof candidate.contextBinding === 'object';
}

export function normalizeWpAdminPendingActions(value: unknown): WpAdminActionState[] {
  const candidates = Array.isArray(value) ? value : value ? [value] : [];
  return candidates.filter(isWpAdminPendingAction).slice(0, 12).map((action) => ({
    ...action,
    initialArguments: normaliseReviewArguments(action.capability.id, action.initialArguments),
  }));
}

function restorePendingActions(key: string): WpAdminActionState[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null') as unknown;
    return normalizeWpAdminPendingActions(parsed);
  } catch {
    return [];
  }
}

function persistPendingActions(key: string, actions: WpAdminActionState[]): void {
  try {
    if (actions.length) localStorage.setItem(key, JSON.stringify(actions.slice(0, 12)));
    else localStorage.removeItem(key);
  } catch {
    // Locked-down storage is non-fatal; automatic execution never relies on
    // persisted client-side action authority.
  }
}

/**
 * Some models echo a self-closing or paired question-form/function payload.
 * Keep this internal transport markup out of chat history, memory, and the
 * visible transcript. The tag scanner is quote-aware because PHP/HTML source
 * can contain `>` inside the encoded fields attribute.
 */
export function sanitizeWpAdminAssistantText(input: unknown): string {
  const candidate = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const source = typeof input === 'string'
    ? input
    : typeof candidate.text === 'string'
      ? candidate.text
      : typeof candidate.content === 'string'
        ? candidate.content
        : typeof candidate.message === 'string'
          ? candidate.message
          : '';
  if (!source || source.trim() === '[object Object]') return '';
  const lower = source.toLowerCase();
  let cursor = 0;
  let output = '';
  while (cursor < source.length) {
    const questionStart = lower.indexOf('<question-form', cursor);
    const askStart = lower.indexOf('<ask-question', cursor);
    const functionStart = lower.indexOf('<function', cursor);
    const toolCallStart = lower.indexOf('<tool_call', cursor);
    const starts = [questionStart, askStart, functionStart, toolCallStart].filter((value) => value >= 0);
    if (starts.length === 0) {
      output += source.slice(cursor);
      break;
    }
    const start = Math.min(...starts);
    output += source.slice(cursor, start);
    const tagName = lower.startsWith('<tool_call', start)
      ? 'tool_call'
      : lower.startsWith('<ask-question', start)
      ? 'ask-question'
      : lower.startsWith('<function', start)
        ? 'function'
        : 'question-form';
    let quote = '';
    let escaped = false;
    let openEnd = -1;
    for (let index = start + tagName.length + 1; index < source.length; index += 1) {
      const char = source[index] || '';
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = '';
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '>') {
        openEnd = index;
        break;
      }
    }
    if (openEnd < 0) break;
    const openTag = source.slice(start, openEnd + 1);
    if (/\/\s*>$/.test(openTag)) {
      cursor = openEnd + 1;
      continue;
    }
    const closeTag = `</${tagName}>`;
    const closeStart = lower.indexOf(closeTag, openEnd + 1);
    if (closeStart < 0) break;
    cursor = closeStart + closeTag.length;
  }
  return output.replace(/\n{3,}/g, '\n\n').trim();
}

export function wpAdminStreamFailureMessage(error: unknown, runnerLabel = 'selected AI provider'): string {
  const message = error instanceof Error ? error.message.trim() : String(error || '').trim();
  if (!message) return `${runnerLabel} ended the run without returning an error message. Please retry the request.`;
  const notice = normalizePixflowBricksAgentFailureNotice(
    null,
    message,
    runnerLabel,
    'WordPress Admin agent',
  );
  if (!notice) return message;
  const resetHint = notice.kind === 'rate_limit'
    ? message.match(/\b(?:resets?|try again) in\s+[^.]+\.?/iu)?.[0]?.trim()
    : '';
  return `${notice.title}. ${notice.message}${resetHint ? ` ${resetHint}` : ''}`;
}

export function wpAdminCompletionResult(text: string, preparedActionCount: number): {
  text: string;
  runStatus: 'succeeded' | 'failed';
} {
  const visible = String(text || '').trim();
  if (visible) return { text: visible, runStatus: 'succeeded' };
  if (preparedActionCount > 0) return {
    text: wpAdminPreparedActionNotice(preparedActionCount),
    runStatus: 'succeeded',
  };
  return {
    text: 'Pixflow could not produce a valid response for this request. No review was prepared and nothing changed.',
    runStatus: 'failed',
  };
}

function pendingClarificationStorageKey(runtime: WpAdminRuntimeConfig, identity: PixflowWpAdminContextIdentity | null): string {
  return `${contextStorageKey(runtime, identity)}:pending-clarification`;
}

function restorePendingClarification(key: string): PixflowWpAdminPendingClarification | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null') as PixflowWpAdminPendingClarification | null;
    return value?.schema === 'pixflow.wp-admin.pending-clarification.v1' && value.status === 'awaiting_user' ? value : null;
  } catch {
    return null;
  }
}

export function wpAdminClarificationContinuationPrompt(
  pending: PixflowWpAdminPendingClarification | null,
  answer: string,
): string {
  const original = String(pending?.originalIntent?.userPrompt || '').trim();
  const reply = String(answer || '').trim();
  if (!original || !reply) return reply || original;
  return `${original}\n\nClarification answer: ${reply}`.slice(0, 16_000);
}

/**
 * Keeps an active, context-bound clarification in the conversation. The
 * selected agent—not a vocabulary matcher—decides whether the next user turn
 * answers it or begins a new request.
 */
export function shouldContinueWpAdminClarification(
  pending: PixflowWpAdminPendingClarification | null,
  answer: string,
): boolean {
  return Boolean(
    pending
    && pending.status === 'awaiting_user'
    && String(answer || '').trim(),
  );
}

export function wpAdminClarificationConversationMessages<T>(
  messages: T[],
  pending: PixflowWpAdminPendingClarification | null,
  answer: string,
): T[] {
  return shouldContinueWpAdminClarification(pending, answer) ? messages : [];
}

export function wpAdminTurnConversationId(
  conversationId: string,
  lane: 'preflight' | 'response' | 'gutenberg-repair',
  sourceMessageId: string,
): string {
  const source = String(sourceMessageId || '').replace(/[^a-z0-9:._-]+/giu, '-').slice(0, 160);
  return `${conversationId}:${lane}:${source || 'turn'}`;
}

function persistPendingClarification(key: string, pending: PixflowWpAdminPendingClarification | null): void {
  try {
    if (pending?.status === 'awaiting_user') localStorage.setItem(key, JSON.stringify(pending));
    else localStorage.removeItem(key);
  } catch {
    // Storage is optional; the live clarification remains authoritative.
  }
}

function wpAdminTabId(): string {
  const key = 'pixflowDesign.wpAdminAgentTab.v1';
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const value = `tab:${randomUUID()}`;
    sessionStorage.setItem(key, value);
    return value;
  } catch {
    return `tab:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
  }
}

export function wpAdminSessionModeStorageKey(runtime: WpAdminRuntimeConfig): string {
  const site = runtime.siteHash || 'site';
  const user = typeof runtime.context?.user === 'object' && runtime.context?.user !== null
    ? String((runtime.context.user as Record<string, unknown>).id || 'user')
    : 'user';
  return `pixflowDesign.wpAdminAgentMode.v1:${site}:${user}`;
}

export function restoreWpAdminSessionMode(runtime: WpAdminRuntimeConfig): ChatSessionMode {
  try {
    localStorage.removeItem(wpAdminSessionModeStorageKey(runtime));
    return 'design';
  } catch {
    return 'design';
  }
}

export function persistWpAdminSessionMode(runtime: WpAdminRuntimeConfig, _mode: ChatSessionMode): void {
  try {
    localStorage.removeItem(wpAdminSessionModeStorageKey(runtime));
  } catch {
    // Storage is optional; the selected mode remains live for this page.
  }
}

export function sanitizeWpAdminAssistantEvents(events: unknown[], visibleText: string): unknown[] {
  return sanitizeWpAdminProviderEvents(events, visibleText);
}

export function readRawWpAdminHistory(key: string): WpAdminMessage[] {
  const read = (storage: Storage, name: string) => {
    try {
      const value = JSON.parse(storage.getItem(name) || '[]');
      return Array.isArray(value) ? value.filter((item): item is WpAdminMessage => Boolean(item?.id && item?.role)) : [];
    } catch { return []; }
  };
  const shared = typeof localStorage === 'undefined' ? [] : read(localStorage, key);
  const tab = typeof sessionStorage === 'undefined' ? [] : read(sessionStorage, `pixflow:admin-transcript:${key}`);
  return mergeChatHistory(shared, tab);
}

export function restoreMessages(key: string, persistenceSurface = 'admin'): WpAdminMessage[] {
  try {
    const direct = key.startsWith('pixflow-direct:');
    const pending = direct ? pendingDirectSiteRun(persistenceSurface) : null;
    const recovery = pending?.metadata as { sessionKey?: string; messageId?: string; messages?: unknown[] } | undefined;
    let raw: string | null = null;
    if (direct && typeof sessionStorage !== 'undefined') {
      try { raw = sessionStorage.getItem(`pixflow:admin-transcript:${key}`); } catch { /* Shared storage remains available. */ }
    }
    if (!raw) raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    return Array.isArray(parsed)
      ? parsed
          .filter((item): item is WpAdminMessage => Boolean(item) && typeof item === 'object' && typeof (item as WpAdminMessage).role === 'string')
          .map((item) => {
            if (item.role !== 'assistant') return item;
            // A transcript copy (including an observer tab's session cache) is
            // not run ownership. Reconcile only this tab's matching receipt.
            if (direct && (recovery?.sessionKey !== key || recovery.messageId !== item.id)) return item;
            const interrupted = item.status === 'streaming' || ['queued', 'running'].includes(String(item.runStatus || '').toLowerCase());
            // A matching resumable run is not terminal while its owner reconnects.
            const reconnecting = interrupted && Boolean(pending && !pending.checkpoint?.outcome
              && recovery?.sessionKey === key && recovery.messageId === item.id && Array.isArray(recovery.messages));
            const restoredStatus = reconnecting ? 'running' : direct ? 'interrupted' : 'canceled';
            const restoredLabel = reconnecting ? 'Reconnecting…' : restoredStatus;
            const content = (direct ? String(item.content || '') : sanitizeWpAdminAssistantText(String(item.content || ''))) || (interrupted ? direct ? 'Reconnecting to the previous run…' : 'Stopped.' : '');
            const rollbackReceipt = sanitizeWpAdminRunRollbackReceipt(item.rollbackReceipt);
            return {
              ...item,
              content,
              rollbackReceipt,
              ...(interrupted ? { status: reconnecting ? 'streaming' : undefined, runStatus: restoredStatus, endedAt: reconnecting ? undefined : Date.now() } : {}),
              events: direct ? [
                ...(Array.isArray(item.events) ? item.events : []),
                ...(interrupted ? [{ kind: 'status', label: restoredLabel }] : []),
              ] : sanitizeWpAdminAssistantEvents([
                ...(Array.isArray(item.events) ? item.events : []),
                ...(interrupted ? [{ kind: 'status', label: restoredStatus }] : []),
              ], content),
            };
          })
      : [];
  } catch {
    return [];
  }
}

export function persistMessages(key: string, messages: WpAdminMessage[], mode?: string, acknowledged = false): void {
  const retained = acknowledged ? messages.slice(-50) : messages;
  // Final text and lifecycle state must replace an older running snapshot even
  // when verbose tool diagnostics no longer fit in the browser's shared quota.
  const compact = () => JSON.stringify(retained.map(({ events, ...message }) => ({ ...message, events: steeringTranscriptEvents(events) })));
  const raw = mode === 'daemon' && acknowledged ? compact() : JSON.stringify(retained);
  if (key.startsWith('pixflow-direct:') && typeof sessionStorage !== 'undefined') {
    try { sessionStorage.setItem(`pixflow:admin-transcript:${key}`, raw); }
    catch {
      // The Bridge retains complete events; a full tab store can keep text
      // without duplicating verbose tool diagnostics in browser storage.
      try { if (acknowledged) sessionStorage.setItem(`pixflow:admin-transcript:${key}`, compact()); }
      catch { /* Both stores can be unavailable; the live transcript remains visible. */ }
    }
  }
  try {
    localStorage.setItem(key, raw);
  } catch {
    // Other tabs have no access to this tab's sessionStorage recovery record.
    // Preserve the complete text and metadata there too, without deleting any
    // unrelated site storage to make room.
    try { if (acknowledged) localStorage.setItem(key, compact()); }
    catch { /* Private/locked-down storage is non-fatal; the live conversation remains available. */ }
  }
}

function appVersion(runtime: WpAdminRuntimeConfig): AppVersionInfo {
  return {
    version: runtime.version || '1.1.5',
    runtimeVersion: runtime.version || '1.1.5',
    product: 'pixflow-design-wordpress',
    channel: 'wordpress-local',
    packaged: false,
    platform: 'wordpress',
    arch: 'site',
  };
}

function selectedAdminAgent(config: AppConfig, agents: AgentInfo[]): AgentInfo | null {
  const preferred = config.agentId ? agents.find((agent) => agent.id === config.agentId) : null;
  if (preferred?.available) return preferred;
  return agents.find((agent) => agent.available && /opencode/i.test(`${agent.id} ${agent.name}`))
    || agents.find((agent) => agent.available)
    || null;
}

/** A prompt can arrive before the panel's shared discovery promise settles. */
export async function resolveWpAdminDirectAgent(
  config: AppConfig,
  agents: AgentInfo[],
  discover: () => Promise<AgentInfo[]>,
): Promise<AgentInfo | null> {
  return selectedAdminAgent(config, agents) || selectedAdminAgent(config, await discover());
}

function filterWpAdminAgents(agents: AgentInfo[]): AgentInfo[] {
  return agents.filter((agent) => agent.id.toLowerCase() !== 'amr');
}

function selectedModel(config: AppConfig, agent: AgentInfo | null): { model: string | null; reasoning: string | null; fastMode: boolean } {
  if (!agent) return { model: null, reasoning: null, fastMode: false };
  const choice = config.agentModels?.[agent.id];
  return {
    model: choice?.model || null,
    reasoning: choice?.reasoning || null,
    fastMode: choice?.fastMode === true,
  };
}

function composerSkill(skill: PixflowWpAdminSkillSummary): SkillSummary {
  return {
    id: skill.id,
    name: skill.label,
    description: skill.description,
    triggers: [],
    mode: 'prototype',
    surface: 'web',
    platform: null,
    scenario: null,
    category: 'wordpress-admin',
    source: skill.source === 'official-library' ? 'official-library' : skill.source === 'user' ? 'user' : 'built-in',
    previewType: 'none',
    designSystemRequired: false,
    defaultFor: [],
    upstream: null,
    featured: null,
    fidelity: null,
    speakerNotes: null,
    animations: null,
    craftRequires: [],
    hasBody: false,
    examplePrompt: '',
    aggregatesExamples: false,
  };
}

function contextUserId(context: WpAdminContext): string {
  const user = context.user && typeof context.user === 'object' ? context.user as Record<string, unknown> : {};
  return String(user.id || 'user');
}

function contextSiteHash(runtime: WpAdminRuntimeConfig): string { return String(runtime.siteHash || 'site'); }


async function persistWpAdminConfig(next: AppConfig, changed?: Partial<AppConfig>): Promise<void> {
  const prefs = buildPixflowWordPressAppConfigPrefs(next, changed);
  const notification = createPixflowSharedAppConfigNotification(prefs, 'wp_admin', 'wp-admin-settings');
  if (!notification) return;
  publishPixflowSharedAppConfigNotification(notification);
  saveConfig(next);
  const response = await pixflowRuntimeFetch('/api/app-config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...prefs, ...notification.patch }),
  });
  if (!response.ok) throw new Error(`Could not save shared settings (${response.status}).`);
  // WordPress owns these preferences. An offline optional Bridge must not
  // delay or prevent saving the full admin settings modal.
  if (next.mode === 'daemon' && typeof next.codexImagegenOverride === 'boolean') {
    void persistPixflowOptionalBridgeConfig({ codexImagegenOverride: next.codexImagegenOverride }).catch(() => undefined);
  }
  window.dispatchEvent(new CustomEvent('pixflow-design:app-config-changed', {
    detail: notification.patch,
  }));
  window.dispatchEvent(new CustomEvent('open-design:app-config-changed', {
    detail: notification.patch,
  }));
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({
      source: 'pixflow-design',
      type: 'pixflow-design:app-config-changed',
      config: notification.patch,
      notification,
    }, window.location.origin);
  }
}

function contextLabel(context: WpAdminContext): string {
  const screen = context.screen && typeof context.screen === 'object'
    ? context.screen as Record<string, unknown>
    : {};
  const object = context.object && typeof context.object === 'object'
    ? context.object as Record<string, unknown>
    : {};
  const title = String(object.title || object.name || '').trim();
  const screenId = String(screen.id || screen.base || 'WordPress Admin').trim();
  return title ? `${screenId} · ${title}` : screenId;
}

function buildWpAdminWorkspaceContexts(
  context: WpAdminContext,
  status: 'loading' | 'ready' | 'unavailable' = 'ready',
): WorkspaceContextItem[] {
  const screen = context.screen && typeof context.screen === 'object'
    ? context.screen as Record<string, unknown>
    : {};
  const object = context.object && typeof context.object === 'object'
    ? context.object as Record<string, unknown>
    : {};
  const resource = context.resource && typeof context.resource === 'object'
    ? context.resource as Record<string, unknown>
    : {};
  const id = String(resource.id ?? object.id ?? 'current').trim() || 'current';
  const label = contextLabel(context);
  const title = String(object.title || object.name || label).trim() || label;
  return [{
    id: `wp-admin:${String(screen.id || screen.base || 'screen')}:${id}`,
    kind: 'browser',
    label,
    title,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    content: `Server-verified WordPress Admin context (${status}) for the current screen and object.`,
  }];
}

function WpAdminSettingsController({
  config,
  initialSection,
  onClose,
  onConfig,
}: {
  config: AppConfig;
  initialSection: SettingsSection;
  onClose: () => void;
  onConfig: (next: AppConfig) => void;
}) {
  const translateUi = usePixflowUiTranslation();
  const [agents, setAgents] = useState<AgentInfo[]>(() => (
    filterWpAdminAgents(readCachedPixflowOptionalBridgeAgents())
  ));
  const [agentsLoading, setAgentsLoading] = useState(false);
  const runtime = runtimeConfig();
  const refreshAgents = useCallback(async () => {
    setAgentsLoading(true);
    try {
      const next = filterWpAdminAgents(await fetchPixflowOptionalBridgeAgents());
      setAgents(next);
      return next;
    } catch {
      setAgents([]);
      return [];
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (config.mode === 'daemon') void refreshAgents();
  }, [config.mode, refreshAgents]);

  const persist = useCallback(async (next: AppConfig) => {
    onConfig(next);
    await persistWpAdminConfig(next);
  }, [onConfig]);

  return (
    <SettingsDialog
      initial={config}
      agents={agents}
      agentsLoading={agentsLoading}
      daemonLive={agents.length > 0}
      appVersionInfo={appVersion(runtime)}
      initialSection={initialSection}
      surface="wp_admin"
      settingsProfile={getPixflowSettingsSurfaceProfile('wp_admin')}
      onPersist={persist}
      onPersistComposioKey={async (composio) => {
        if (!await syncComposioConfigToDaemon(composio)) {
          throw new Error(translateUi("ui.wpAdminAgentFrameApp.feedback99"));
        }
        onConfig({ ...config, composio: {
          apiKey: '',
          apiKeyConfigured: Boolean(composio?.apiKey?.trim() || composio?.apiKeyConfigured),
          apiKeyTail: composio?.apiKey?.trim().slice(-4) || composio?.apiKeyTail || '',
        } });
      }}
      onClose={onClose}
      onResetOnboarding={async () => {
        await resetPixflowOnboardingProfile();
        const next = { ...config, onboardingCompleted: false };
        saveConfig(next);
        onConfig(next);
        onClose();
      }}
      onRefreshAgents={refreshAgents}
      onSkillsRefresh={() => undefined}
      onResourcePacksChanged={() => undefined}
    />
  );
}

function actionContext(context: WpAdminContext): Record<string, unknown> {
  const resource = context.resource && typeof context.resource === 'object'
    ? context.resource as Record<string, unknown>
    : {};
  const object = context.object && typeof context.object === 'object'
    ? context.object as Record<string, unknown>
    : {};
  const id = Number(resource.id ?? object.id ?? 0);
  const modified = String(object.modifiedGmt ?? object.modified ?? resource.modifiedGmt ?? '');
  return {
    postId: Number.isInteger(id) && id > 0 ? id : undefined,
    postType: typeof resource.postType === 'string' && resource.postType ? resource.postType : 'post',
    expectedModifiedGmt: modified || undefined,
  };
}

export function normaliseReviewArguments(capabilityId: string, proposedArguments: Record<string, unknown>): Record<string, unknown> {
  const isCodeProject = capabilityId.startsWith('pixflow/wp-admin/code/');
  const isWpCodeBox2 = capabilityId.startsWith('pixflow/wp-admin/wpcodebox2/');
  const isJetEngine = capabilityId.startsWith('pixflow/wp-admin/jetengine/');
  const aliases: Record<string, string> = capabilityId === 'pixflow/wp-admin/create-post' || capabilityId === 'pixflow/wp-admin/update-post'
    ? { postTitle: 'title', postContent: 'content', postStatus: 'status', type: 'postType', post_type: 'postType', post_title: 'title', post_content: 'content', post_status: 'status', taxInput: 'terms', taxonomyInput: 'terms', featuredImageId: 'featuredMediaId', featured_media_id: 'featuredMediaId' }
    : capabilityId === 'pixflow/wp-admin/gutenberg/apply-document'
      ? { postID: 'postId', post_id: 'postId', fingerprint: 'expectedFingerprint', expectedHash: 'expectedFingerprint', featuredImageId: 'featuredMediaId', featured_media_id: 'featuredMediaId', blockTree: 'blocks', document: 'blocks' }
      : capabilityId === 'pixflow/acf/get-field-group-schema'
        ? { fieldGroupKey: 'key', groupKey: 'key' }
      : capabilityId === 'pixflow/acf/create-post-type'
      ? { postType: 'post_type', postTypeKey: 'key', showInRest: 'show_in_rest', showInMenu: 'show_in_menu', restEnabled: 'show_in_rest', label: 'title', name: 'title' }
      : capabilityId === 'pixflow/acf/create-taxonomy'
        ? { taxonomyKey: 'key', objectType: 'object_type', objectTypes: 'object_type', attachedTo: 'object_type', showInRest: 'show_in_rest' }
      : capabilityId === 'pixflow/acf/create-field-group'
          ? { fieldGroupKey: 'key', groupKey: 'key', fieldGroupTitle: 'title', fieldDefinitions: 'fields' }
          : isCodeProject
            ? {
                pluginName: 'name', themeName: 'name', childThemeName: 'name',
                pluginSlug: 'slug', themeSlug: 'slug', childThemeSlug: 'slug', projectSlug: 'slug',
                pluginDescription: 'description', themeDescription: 'description',
                parentTheme: 'parentSlug', parentThemeSlug: 'parentSlug', template: 'parentSlug',
                filePath: 'file', path: 'file', source: 'content', code: 'content', php: 'content', pluginContent: 'content',
                fingerprint: 'expectedFingerprint', expectedHash: 'expectedFingerprint',
              }
            : isWpCodeBox2
              ? {
                  id: 'snippetId', snippetID: 'snippetId', snippet_id: 'snippetId',
                  snippetTitle: 'title', snippetName: 'title', snippetDescription: 'description',
                  snippetType: 'codeType', type: 'codeType', snippetCode: 'code', content: 'code', source: 'code',
                  run_type: 'runType', render_type: 'renderType', folder: 'folderId',
                  snippetConditions: 'conditions', conditionGroups: 'conditions', fingerprint: 'expectedFingerprint', expectedHash: 'expectedFingerprint',
                }
              : isJetEngine
                ? {
                    modelId: 'id', modelID: 'id', model_id: 'id', fingerprint: 'expectedFingerprint', expectedHash: 'expectedFingerprint',
                    pluralName: 'name', pluralLabel: 'name', label: 'name', singularLabel: 'singularName',
                    restEnabled: 'showInRest', show_in_rest: 'showInRest', has_archive: 'hasArchive',
                    publicly_queryable: 'publiclyQueryable', show_ui: 'showUi', menu_icon: 'menuIcon',
                    menuLabel: 'menuName', menu_label: 'menuName',
                    attachedTo: 'objectTypes', object_type: 'objectTypes', postTypes: 'objectTypes',
                    targetType: 'objectType', allowed_post_type: 'allowedPostTypes', allowed_tax: 'allowedTaxonomies',
                    fields: 'metaFields', fieldDefinitions: 'metaFields', meta_fields: 'metaFields',
                    cctSlug: 'slug', cct_slug: 'slug', cct: 'slug', contentType: 'slug', contentTypeSlug: 'slug', content_type: 'slug',
                    recordValues: 'values', recordData: 'values', data: 'values',
                  }
              : {};
  const next = { ...proposedArguments };
  for (const [from, to] of Object.entries(aliases)) {
    if (next[to] === undefined && next[from] !== undefined) next[to] = next[from];
    if (from !== to) delete next[from];
  }
  // This belongs to the agent's ordered document plan, not any executable
  // capability schema. The Gutenberg preparation service derives the signed
  // `contentIntent` after canonical serialization; generic post actions must
  // never receive this orchestration-only marker either.
  delete next.contentMutationIntent;
  if (isJetEngine) {
    const isCctDefinition = /\/(?:create|update)-cct$/.test(capabilityId);
    if (isCctDefinition && next.fields === undefined && Array.isArray(next.metaFields)) {
      next.fields = next.metaFields;
      delete next.metaFields;
    }
    if (isCctDefinition) {
      delete next.singularName;
      delete next.menuName;
    }
    if (/\/(?:update|delete)-cct-record$/.test(capabilityId)) {
      if (next.recordId === undefined && next.id !== undefined) next.recordId = next.id;
      delete next.id;
      if (next.recordId === undefined) {
        for (const key of ['recordID', 'record_id', 'itemId', 'itemID', 'item_id']) {
          if (next[key] !== undefined) {
            next.recordId = next[key];
            break;
          }
        }
      }
      for (const key of ['recordID', 'record_id', 'itemId', 'itemID', 'item_id']) delete next[key];
    }
    if (next.moduleSlug !== undefined && next.module === undefined) next.module = next.moduleSlug;
    delete next.moduleSlug;
    if (next.active !== undefined && next.enabled === undefined) next.enabled = next.active;
    delete next.active;
    if (capabilityId === 'pixflow/wp-admin/jetengine/set-module-state') {
      if (next.enabled === undefined && typeof next.state === 'string') {
        const state = next.state.trim().toLowerCase();
        if (['on', 'active', 'activated', 'enabled', 'enable'].includes(state)) next.enabled = true;
        if (['off', 'inactive', 'deactivated', 'disabled', 'disable'].includes(state)) next.enabled = false;
      }
      delete next.state;
      if (typeof next.module === 'string' && ['cct', 'custom-content-type', 'custom-content-types'].includes(next.module.trim().toLowerCase())) {
        next.module = 'custom-content-types';
      }
    }
    if (typeof next.objectTypes === 'string') next.objectTypes = [next.objectTypes];
    if (typeof next.allowedPostTypes === 'string') next.allowedPostTypes = [next.allowedPostTypes];
    if (typeof next.allowedTaxonomies === 'string') next.allowedTaxonomies = [next.allowedTaxonomies];
    if (capabilityId.endsWith('-post-type')) {
      delete next.archiveSlug;
      delete next.rewriteSlug;
      delete next.objectTypes;
      delete next.excludeFromSearch;
      if (next.public === true && next.hasArchive === true && next.publiclyQueryable === false) next.publiclyQueryable = true;
    }
    if (capabilityId.endsWith('-meta-box')) {
      const postTypeTarget = typeof next.postType === 'string' ? next.postType.trim() : '';
      const taxonomyTarget = typeof next.taxonomy === 'string' ? next.taxonomy.trim() : '';
      const objectName = typeof next.objectName === 'string' ? next.objectName.trim() : '';
      if (postTypeTarget) {
        if (next.objectType === undefined) next.objectType = 'post';
        if (next.allowedPostTypes === undefined) next.allowedPostTypes = [postTypeTarget];
      }
      if (taxonomyTarget) {
        if (next.objectType === undefined) next.objectType = 'taxonomy';
        if (next.allowedTaxonomies === undefined) next.allowedTaxonomies = [taxonomyTarget];
      }
      if (next.objectType === 'post_type') next.objectType = 'post';
      if (next.objectType === 'term') next.objectType = 'taxonomy';
      if (objectName && next.objectType === 'post' && next.allowedPostTypes === undefined) next.allowedPostTypes = [objectName];
      if (objectName && next.objectType === 'taxonomy' && next.allowedTaxonomies === undefined) next.allowedTaxonomies = [objectName];
      if (typeof next.title === 'string' && next.title.trim()) next.name = next.title;
      delete next.objectName;
      delete next.title;
      delete next.postType;
      delete next.taxonomy;
    }
    if (Array.isArray(next.metaFields)) {
      next.metaFields = next.metaFields.flatMap((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
        const field = { ...(value as Record<string, unknown>) };
        const fieldAliases: Record<string, string> = {
          fieldName: 'name', field_name: 'name', key: 'name', fieldLabel: 'title', label: 'title',
          fieldType: 'type', field_type: 'type', isRequired: 'required', is_required: 'required',
          allow_null: 'allowNull', load_terms: 'loadTerms', save_terms: 'saveTerms', choices: 'options',
        };
        for (const [from, to] of Object.entries(fieldAliases)) {
          if (field[to] === undefined && field[from] !== undefined) field[to] = field[from];
          if (from !== to) delete field[from];
        }
        const fieldTypeAliases: Record<string, string> = {
          date_time: 'datetime', datetime_local: 'datetime-local', color: 'colorpicker', colour: 'colorpicker', boolean: 'switcher', bool: 'switcher', toggle: 'switcher', url_input: 'url', email_input: 'email', telephone: 'tel', phone: 'tel',
        };
        if (typeof field.type === 'string' && fieldTypeAliases[field.type]) field.type = fieldTypeAliases[field.type];
        const semanticName = `${String(field.name || '')} ${String(field.title || '')}`.toLowerCase();
        if (!field.type) {
          if (/\bemail\b/.test(semanticName)) field.type = 'email';
          else if (/\b(?:url|website)\b/.test(semanticName)) field.type = 'url';
          else if (/\b(?:phone|telephone|tel)\b/.test(semanticName)) field.type = 'tel';
          else if (/\bcolou?r\b/.test(semanticName)) field.type = 'colorpicker';
        }
        return [field];
      });
    }
    if (Array.isArray(next.fields) && /(?:create|update)-cct$/.test(capabilityId)) {
      next.fields = next.fields.flatMap((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
        const field = { ...(value as Record<string, unknown>) };
        const aliases: Record<string, string> = { fieldName: 'name', field_name: 'name', fieldLabel: 'title', label: 'title', fieldType: 'type', field_type: 'type', isRequired: 'required', is_required: 'required', save_as_timestamp: 'saveAsTimestamp', value_format: 'valueFormat', choices: 'options' };
        for (const [from, to] of Object.entries(aliases)) {
          if (field[to] === undefined && field[from] !== undefined) field[to] = field[from];
          if (from !== to) delete field[from];
        }
        const fieldTypeAliases: Record<string, string> = { date_time: 'datetime', datetime_local: 'datetime-local', color: 'colorpicker', colour: 'colorpicker', boolean: 'switcher', bool: 'switcher', toggle: 'switcher', telephone: 'tel', phone: 'tel' };
        if (typeof field.type === 'string' && fieldTypeAliases[field.type]) field.type = fieldTypeAliases[field.type];
        const semanticName = `${String(field.name || '')} ${String(field.title || '')}`.toLowerCase();
        if (!field.type) {
          if (/\bemail\b/.test(semanticName)) field.type = 'email';
          else if (/\b(?:url|website)\b/.test(semanticName)) field.type = 'url';
          else if (/\b(?:phone|telephone|tel)\b/.test(semanticName)) field.type = 'tel';
          else if (/\bcolou?r\b/.test(semanticName)) field.type = 'colorpicker';
        }
        return [field];
      });
    }
  }
  if (capabilityId === 'pixflow/bricks/apply-settings') {
    if (next.key === undefined && next.abilitiesApiEnabled !== undefined) {
      next.key = 'abilitiesApiEnabled';
      next.value = Boolean(next.abilitiesApiEnabled);
    }
    if (next.key === 'abilitiesApi') next.key = 'abilitiesApiEnabled';
    if (next.value === undefined && next.enabled !== undefined) next.value = Boolean(next.enabled);
    delete next.abilitiesApiEnabled;
    delete next.enabled;
  }
  if (capabilityId === 'pixflow/acf/create-taxonomy' || capabilityId === 'pixflow/acf/update-taxonomy') {
    // ACF owns taxonomy fields through field groups, not the taxonomy model
    // record. Complex preflight requires the corresponding field-group steps;
    // remove the model's descriptive duplicate before strict schema review.
    delete next.metaFields;
    delete next.fields;
  }
  if (capabilityId === 'pixflow/wp-admin/update-post') {
    if (next.postId === undefined) {
      for (const key of ['id', 'postID', 'post_id']) {
        if (next[key] !== undefined) {
          next.postId = next[key];
          break;
        }
      }
    }
    delete next.id;
    delete next.postID;
    delete next.post_id;

    const nestedPost = next.post && typeof next.post === 'object' && !Array.isArray(next.post)
      ? next.post as Record<string, unknown>
      : null;
    const fields = next.fields && typeof next.fields === 'object' && !Array.isArray(next.fields)
      ? { ...(next.fields as Record<string, unknown>) }
      : {};
    for (const key of ['title', 'slug', 'excerpt', 'status', 'parent']) {
      if (fields[key] === undefined && next[key] !== undefined) fields[key] = next[key];
      if (fields[key] === undefined && nestedPost?.[key] !== undefined) fields[key] = nestedPost[key];
      delete next[key];
    }
    if (fields.terms === undefined && next.terms !== undefined && typeof next.taxonomy !== 'string') {
      fields.terms = next.terms;
      delete next.terms;
    }
    if (Object.keys(fields).length > 0) next.fields = fields;
    if (nestedPost && !Object.prototype.hasOwnProperty.call(nestedPost, 'content')) delete next.post;

    // update-post uses the live WordPress modified time, not a model-supplied
    // content fingerprint. defaultActionArguments binds the verified value.
    delete next.expectedFingerprint;
    delete next.fingerprint;
    delete next.expectedHash;
  }
  if (capabilityId === 'pixflow/wp-admin/update-post' && next.fields === undefined
    && typeof next.taxonomy === 'string') {
    const terms = Array.isArray(next.terms)
      ? next.terms
      : (next.term !== undefined ? [next.term] : (next.termSlug !== undefined ? [next.termSlug] : (next.termName !== undefined ? [next.termName] : null)));
    if (terms) {
      const termValues = terms.map((term) => {
        if (!term || typeof term !== 'object' || Array.isArray(term)) return term;
        const item = term as Record<string, unknown>;
        return item.id ?? item.slug ?? item.name ?? term;
      });
      next.fields = { terms: { [next.taxonomy]: termValues } };
      delete next.taxonomy;
      delete next.terms;
      delete next.term;
      delete next.termSlug;
      delete next.termName;
    }
  }
  if (capabilityId === 'pixflow/wp-admin/update-post') {
    if (next.fields && typeof next.fields === 'object' && !Array.isArray(next.fields)) {
      const fields = { ...(next.fields as Record<string, unknown>) };
      const meansPreserve = (value: unknown): boolean => typeof value === 'string'
        && /^(?:preserve|preserved|keep|kept|unchanged|no[ _-]?change|existing|current|same)$/i.test(value.trim());
      for (const key of ['title', 'slug', 'content', 'excerpt', 'status', 'parent', 'terms']) {
        if (meansPreserve(fields[key])) delete fields[key];
      }
      // A bare list cannot identify which taxonomy it belongs to. Models
      // commonly emit [] to mean "keep terms unchanged"; an intentional
      // taxonomy clear remains explicit as { terms: { category: [] } }.
      if (Array.isArray(fields.terms)) delete fields.terms;
      next.fields = fields;
    }
    delete next.action;
  }
  if (isCodeProject) {
    const normaliseFiles = (value: unknown): Array<Record<string, unknown>> => {
      const entries: Array<[string, unknown]> = Array.isArray(value)
        ? value.map((item, index) => [String(index), item])
        : value && typeof value === 'object'
          ? Object.entries(value as Record<string, unknown>)
          : [];
      return entries.flatMap(([fallbackFile, item]) => {
        if (typeof item === 'string' && !/^\d+$/.test(fallbackFile)) {
          return [{ file: fallbackFile, content: item }];
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const candidate = item as Record<string, unknown>;
        const file = String(candidate.file || candidate.path || candidate.name || (/^\d+$/.test(fallbackFile) ? '' : fallbackFile)).trim();
        if (!file || typeof candidate.content !== 'string') return [];
        const expectedFingerprint = candidate.expectedFingerprint ?? candidate.fingerprint ?? candidate.expectedHash;
        return [{
          file,
          content: candidate.content,
          ...(typeof expectedFingerprint === 'string' ? { expectedFingerprint } : {}),
        }];
      });
    };
    let files = normaliseFiles(next.files);
    const slug = String(next.slug || '').trim();
    const stripProjectPrefix = (file: string) => slug && file.startsWith(`${slug}/`) ? file.slice(slug.length + 1) : file;
    files = files.map((file) => ({ ...file, file: stripProjectPrefix(String(file.file || '')) }));
    const isCreatePlugin = capabilityId === 'pixflow/wp-admin/code/create-plugin' || capabilityId === 'pixflow/wp-admin/code/create-mu-plugin';
    if (isCreatePlugin) {
      const mainIndex = files.findIndex((file) => String(file.file || '') === `${slug}.php`)
        ?? -1;
      const fallbackMainIndex = files.findIndex((file) => !String(file.file || '').includes('/') && String(file.file || '').endsWith('.php'));
      const selectedMainIndex = mainIndex >= 0 ? mainIndex : fallbackMainIndex;
      if (next.content === undefined && selectedMainIndex >= 0 && typeof files[selectedMainIndex]?.content === 'string') {
        next.content = files[selectedMainIndex]?.content;
      }
      if (selectedMainIndex >= 0) files = files.filter((_file, index) => index !== selectedMainIndex);
    } else if (capabilityId !== 'pixflow/wp-admin/code/create-child-theme' && !capabilityId.endsWith('-files')) {
      const firstFile = files[0];
      if (next.file === undefined && typeof firstFile?.file === 'string') next.file = firstFile.file;
      if (next.content === undefined && typeof firstFile?.content === 'string') next.content = firstFile.content;
      if (next.expectedFingerprint === undefined && typeof firstFile?.expectedFingerprint === 'string') next.expectedFingerprint = firstFile.expectedFingerprint;
      files = [];
    }
    if (files.length > 0) next.files = files;
    else delete next.files;
    if (capabilityId.endsWith('-files')) {
      delete next.file;
      delete next.content;
      delete next.expectedFingerprint;
    }
    const notice = next.adminNotice && typeof next.adminNotice === 'object' && !Array.isArray(next.adminNotice)
      ? next.adminNotice as Record<string, unknown>
      : null;
    if (next.content === undefined && notice && typeof notice.message === 'string' && notice.message.trim()) {
      const message = notice.message.trim().slice(0, 500).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
      const capability = typeof notice.capability === 'string' && /^[a-z0-9_]+$/.test(notice.capability) ? notice.capability : 'manage_options';
      const noticeType = typeof notice.noticeType === 'string' && ['success', 'warning', 'error', 'info'].includes(notice.noticeType) ? notice.noticeType : 'info';
      next.content = [
        "add_action('admin_notices', static function (): void {",
        `    if (!current_user_can('${capability}')) return;`,
        `    echo '<div class="notice notice-${noticeType} is-dismissible"><p>' . esc_html('${message}') . '</p></div>';`,
        '});',
      ].join('\n');
    }
    delete next.adminNotice;
    delete next.initialState;
    delete next.initialStatus;
    delete next.initial_status;
    delete next.state;
    delete next.active;
    delete next.activate;
    if (['pixflow/wp-admin/code/create-plugin', 'pixflow/wp-admin/code/create-mu-plugin', 'pixflow/wp-admin/code/create-child-theme'].includes(capabilityId)) {
      delete next.expectedFingerprint;
    }
  }
  if (isWpCodeBox2) {
    delete next.active;
    delete next.activate;
    delete next.initialState;
    delete next.initialStatus;
    if (capabilityId === 'pixflow/wp-admin/wpcodebox2/create-snippet') {
      delete next.enabled;
      delete next.status;
    }
    if (capabilityId === 'pixflow/wp-admin/wpcodebox2/set-snippet-status' && next.enabled === undefined && typeof next.status === 'string') {
      const status = next.status.trim().toLowerCase();
      if (['on', 'active', 'enabled', 'enable'].includes(status)) next.enabled = true;
      if (['off', 'inactive', 'disabled', 'disable'].includes(status)) next.enabled = false;
      delete next.status;
    }
    if (next.conditions && typeof next.conditions === 'object' && !Array.isArray(next.conditions)) {
      const conditionGroup = next.conditions as Record<string, unknown>;
      const nested = Array.isArray(conditionGroup.conditions) ? conditionGroup.conditions : Array.isArray(conditionGroup.and) ? conditionGroup.and : Array.isArray(conditionGroup.all) ? conditionGroup.all : null;
      if (nested) next.conditions = [{ conditions: nested }];
    }
    if (Array.isArray(next.conditions) && next.conditions.length > 0) {
      const conditionItems = next.conditions.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
      if (conditionItems.length > 0 && conditionItems.every((item) => typeof item.type === 'string')) {
        next.conditions = [{ conditions: conditionItems }];
      } else {
        next.conditions = conditionItems.map((group) => {
          const nested = Array.isArray(group.conditions) ? group.conditions : Array.isArray(group.and) ? group.and : Array.isArray(group.all) ? group.all : null;
          return nested ? { conditions: nested } : group;
        });
      }
    }
  }
  if (capabilityId === 'pixflow/wp-admin/update-settings') {
    if (next.settings === undefined && typeof next.optionName === 'string' && next.optionValue !== undefined) {
      next.settings = { [next.optionName]: next.optionValue };
    }
    if (next.settings === undefined && typeof next.option === 'string' && next.value !== undefined) {
      next.settings = { [next.option]: next.value };
    }
    if (next.settings === undefined && typeof next.setting === 'string') {
      const settingValue = next.newValue !== undefined ? next.newValue : next.value;
      if (settingValue !== undefined) next.settings = { [next.setting]: settingValue };
    }
    delete next.optionName;
    delete next.optionValue;
    delete next.option;
    delete next.setting;
    delete next.newValue;
    delete next.value;
  }
  if (capabilityId === 'pixflow/acf/create-post-type' || capabilityId === 'pixflow/acf/update-post-type') {
    const nestedSources = [next.args, next.config].filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value));
    for (const nestedArgs of nestedSources) {
      for (const key of ['key', 'post_type', 'slug', 'title', 'labels', 'public', 'publicly_queryable', 'exclude_from_search', 'hierarchical', 'show_ui', 'show_in_menu', 'show_in_rest', 'has_archive', 'rewrite', 'supports', 'taxonomies', 'menu_position', 'menu_icon', 'description', 'active']) {
        if (next[key] === undefined && nestedArgs[key] !== undefined) next[key] = nestedArgs[key];
      }
    }
    delete next.args;
    delete next.config;
    const pluralLabel = typeof next.pluralLabel === 'string'
      ? next.pluralLabel
      : typeof next.pluralName === 'string'
        ? next.pluralName
        : typeof next.plural === 'string' ? next.plural : '';
    const singularLabel = typeof next.singularLabel === 'string'
      ? next.singularLabel
      : typeof next.singularName === 'string'
        ? next.singularName
        : typeof next.singular === 'string' ? next.singular : '';
    if (next.labels === undefined && (pluralLabel || singularLabel)) {
      next.labels = {
        name: pluralLabel || next.title || '',
        singular_name: singularLabel || next.title || pluralLabel || '',
      };
    }
    delete next.pluralLabel;
    delete next.singularLabel;
    delete next.pluralName;
    delete next.singularName;
    delete next.plural;
    delete next.singular;
    delete next.status;
    delete next.rest_base;
    delete next.capability_type;
    delete next.show_in_nav_menus;
    if (next.post_type && typeof next.post_type === 'object' && !Array.isArray(next.post_type)) {
      const nested = next.post_type as Record<string, unknown>;
      delete next.post_type;
      Object.assign(next, nested);
    }
    if (typeof next.has_archive === 'string') next.has_archive = Boolean(next.has_archive);
    const camelAliases: Record<string, string> = {
      publiclyQueryable: 'publicly_queryable',
      excludeFromSearch: 'exclude_from_search',
      hasArchive: 'has_archive',
      showInMenu: 'show_in_menu',
      showInRest: 'show_in_rest',
      showUi: 'show_ui',
      menuIcon: 'menu_icon',
      menuPosition: 'menu_position',
      advancedConfiguration: 'advanced_configuration',
    };
    for (const [from, to] of Object.entries(camelAliases)) {
      if (next[to] === undefined && next[from] !== undefined) next[to] = next[from];
      if (from !== to) delete next[from];
    }
    if (typeof next.has_archive === 'string') next.has_archive = Boolean(next.has_archive);
    if (next.slug === undefined && typeof next.key === 'string') next.slug = next.key;
    if (next.post_type === undefined && typeof next.slug === 'string') next.post_type = next.slug;
    if (next.slug === undefined && typeof next.post_type === 'string') next.slug = next.post_type;
    if (next.title === undefined && next.labels && typeof next.labels === 'object' && !Array.isArray(next.labels)) {
      const name = (next.labels as Record<string, unknown>).name;
      if (typeof name === 'string' && name.trim()) next.title = name;
    }
    if (typeof next.rewriteSlug === 'string' && next.rewrite === undefined) next.rewrite = { slug: next.rewriteSlug };
    delete next.rewriteSlug;
    delete next.archiveSlug;
    delete next.capabilityType;
    if (next.labels && typeof next.labels === 'object' && !Array.isArray(next.labels)) {
      const labels: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(next.labels as Record<string, unknown>)) {
        const snake = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
        labels[snake] = value;
      }
      if ((!labels.name || typeof labels.name !== 'string') && typeof next.title === 'string') labels.name = next.title;
      if ((!labels.singular_name || typeof labels.singular_name !== 'string') && typeof next.title === 'string') labels.singular_name = next.title;
      next.labels = labels;
    }
  }
  if (capabilityId === 'pixflow/acf/create-taxonomy' || capabilityId === 'pixflow/acf/update-taxonomy') {
    const taxonomySources = [next.args, next.config].filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value));
    for (const taxonomyArgs of taxonomySources) {
      for (const key of ['key', 'taxonomy', 'slug', 'title', 'labels', 'object_type', 'public', 'show_in_rest', 'hierarchical', 'active']) {
        if (next[key] === undefined && taxonomyArgs[key] !== undefined) next[key] = taxonomyArgs[key];
      }
    }
    delete next.args;
    delete next.config;
    if (next.title === undefined) {
      for (const candidate of [next.taxonomyTitle, next.name, next.label, next.pluralName, next.plural]) {
        if (typeof candidate === 'string' && candidate.trim()) { next.title = candidate; break; }
      }
    }
    if (next.object_type === undefined) {
      if (Array.isArray(next.attachedPostTypes)) next.object_type = next.attachedPostTypes;
      else if (Array.isArray(next.postTypes)) next.object_type = next.postTypes;
    }
    delete next.taxonomyTitle;
    delete next.taxonomySingular;
    delete next.name;
    delete next.label;
    delete next.pluralName;
    delete next.singularName;
    delete next.plural;
    delete next.singular;
    delete next.attachedPostTypes;
    delete next.postTypes;
    delete next.publiclyQueryable;
    delete next.showAdminColumn;
    delete next.hasArchive;
    // ACF's DB-backed taxonomy record exposed by this capability does not
    // accept rewrite configuration. Models commonly add this convenience
    // hint, so remove it before strict schema validation instead of letting a
    // correct multi-step batch fail at execution time.
    delete next.rewriteSlug;
    delete next.archiveSlug;
    // Natural-language taxonomy intents sometimes carry a convenience flag
    // for seeding terms. Pixflow keeps taxonomy creation empty and treats
    // terms as a separate typed capability, so never forward that flag.
    delete next.createTerms;
    delete next.create_terms;
    const taxonomyAliases: Record<string, string> = {
      objectType: 'object_type', attachedTo: 'object_type', attached_to: 'object_type',
      showInRest: 'show_in_rest', showInREST: 'show_in_rest', restEnabled: 'show_in_rest',
    };
    for (const [from, to] of Object.entries(taxonomyAliases)) {
      if (next[to] === undefined && next[from] !== undefined) next[to] = next[from];
      if (from !== to) delete next[from];
    }
    if (typeof next.object_type === 'string' && next.object_type.trim()) next.object_type = [next.object_type];
    if (next.slug === undefined && typeof next.key === 'string') next.slug = next.key;
    if (next.taxonomy === undefined && typeof next.slug === 'string') next.taxonomy = next.slug;
    if (next.title === undefined && next.labels && typeof next.labels === 'object' && !Array.isArray(next.labels)) {
      const name = (next.labels as Record<string, unknown>).name;
      if (typeof name === 'string' && name.trim()) next.title = name;
    }
    if (next.labels && typeof next.labels === 'object' && !Array.isArray(next.labels)) {
      const labels: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(next.labels as Record<string, unknown>)) {
        labels[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = value;
      }
      next.labels = labels;
    }
  }
  if (capabilityId === 'pixflow/acf/create-field-group' || capabilityId === 'pixflow/acf/update-field-group') {
    const groupSources = [next.fieldGroup, next.config].filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value));
    for (const nestedGroup of groupSources) {
      for (const key of ['key', 'title', 'name', 'label', 'location', 'fields', 'active', 'position', 'style', 'label_placement', 'instruction_placement', 'hide_on_screen', 'description', 'menu_order']) {
        if (next[key] === undefined && nestedGroup[key] !== undefined) next[key] = nestedGroup[key];
      }
    }
    delete next.fieldGroup;
    delete next.config;
    if (next.title === undefined) {
      for (const candidate of [next.fieldGroupTitle, next.fieldGroupName, next.name, next.label]) {
        if (typeof candidate === 'string' && candidate.trim()) { next.title = candidate; break; }
      }
    }
    if (next.fields === undefined && Array.isArray(next.fieldDefinitions)) next.fields = next.fieldDefinitions;
    if (next.location === undefined && Array.isArray(next.locationRules)) next.location = next.locationRules;
    delete next.fieldGroupTitle;
    delete next.fieldGroupName;
    delete next.name;
    delete next.label;
    delete next.fieldDefinitions;
    delete next.locationRules;
    delete next.status;
    if (Array.isArray(next.location) && next.location.length === 1 && Array.isArray(next.location[0])) {
      next.location = next.location[0];
    }
    if (Array.isArray(next.fields)) {
      next.fields = next.fields.map((field) => {
        if (!field || typeof field !== 'object' || Array.isArray(field)) return field;
        const copy = { ...(field as Record<string, unknown>) };
        const fieldAliases: Record<string, string> = {
          fieldKey: 'key', fieldName: 'name', fieldLabel: 'label', fieldType: 'type',
          isRequired: 'required', defaultValue: 'default_value', subFields: 'sub_fields',
          allowNull: 'allow_null', returnFormat: 'return_format', postType: 'post_type',
          conditionalLogic: 'conditional_logic', buttonLabel: 'button_label',
          prefixName: 'prefix_name', prefixLabel: 'prefix_label', saveCustom: 'save_custom',
        };
        for (const [from, to] of Object.entries(fieldAliases)) {
          if (copy[to] === undefined && copy[from] !== undefined) copy[to] = copy[from];
          if (from !== to) delete copy[from];
        }
        return copy;
      });
    }
  }
  if (capabilityId === 'pixflow/acf/write-values') {
    if (next.target === undefined && (typeof next.postId === 'number' || typeof next.postId === 'string')) {
      next.target = { type: 'post', id: next.postId };
    } else if (typeof next.target === 'number' || typeof next.target === 'string') {
      next.target = { type: 'post', id: next.target };
    }
    if (next.values === undefined && next.fields && typeof next.fields === 'object' && !Array.isArray(next.fields)) {
      next.values = next.fields;
    }
    if (Array.isArray(next.values)) {
      const mapped: Record<string, unknown> = {};
      for (const entry of next.values) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const item = entry as Record<string, unknown>;
        const selector = item.selector ?? item.fieldName ?? item.name;
        if (typeof selector === 'string' && selector.trim() && Object.prototype.hasOwnProperty.call(item, 'value')) {
          mapped[selector] = item.value;
        }
      }
      next.values = mapped;
    }
    if (typeof next.fieldGroup === 'string') {
      if (/^group_[a-zA-Z0-9]+$/.test(next.fieldGroup)) next.fieldGroupKey = next.fieldGroup;
      delete next.fieldGroup;
    }
    delete next.postType;
    delete next.postId;
    delete next.fields;
    delete next.fieldValues;
  }
  const stripNulls = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stripNulls);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== null)
        .map(([key, child]) => [key, stripNulls(child)]));
    }
    return value;
  };
  return stripNulls(next) as Record<string, unknown>;
}

export function mergeWpAdminBatchFileFingerprints(
  proposedArguments: Record<string, unknown>,
  liveFiles: Array<{ file: string; fingerprint: string }>,
): Record<string, unknown> {
  if (!Array.isArray(proposedArguments.files)) return proposedArguments;
  const fingerprints = new Map(liveFiles
    .filter((entry) => entry.file && /^(?:absent|[a-f0-9]{64})$/.test(entry.fingerprint))
    .map((entry) => [entry.file, entry.fingerprint]));
  return {
    ...proposedArguments,
    files: proposedArguments.files.map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
      const file = entry as Record<string, unknown>;
      const path = String(file.file || '');
      const fingerprint = fingerprints.get(path);
      return fingerprint ? { ...file, expectedFingerprint: fingerprint } : file;
    }),
  };
}

export function mergeWpAdminJetEngineModelIdentity(
  capabilityId: string,
  proposedArguments: Record<string, unknown>,
  readOnlyResults: Array<{ capabilityId: string; result: unknown }>,
): Record<string, unknown> {
  if (!/^pixflow\/wp-admin\/jetengine\/update-(?:post-type|taxonomy|meta-box|options-page)$/.test(capabilityId)) return proposedArguments;
  const read = readOnlyResults.find((entry) => entry.capabilityId === 'pixflow/wp-admin/jetengine/list-models');
  const result = read?.result && typeof read.result === 'object' ? read.result as Record<string, unknown> : null;
  const models = Array.isArray(result?.models)
    ? result.models.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    : [];
  const normalizeReference = (value: unknown): string => String(value || '').trim().toLowerCase().replace(/[_\s-]+/g, '-');
  const requested = normalizeReference(proposedArguments.slug ?? proposedArguments.name ?? '');
  const live = models.find((item) => String(item.id || '') === String(proposedArguments.id || ''))
    || models.find((item) => requested && [item.slug, item.name].some((value) => normalizeReference(value) === requested))
    || (models.length === 1 ? models[0] : undefined);
  if (!live) return proposedArguments;
  const proposedFields = Array.isArray(proposedArguments.metaFields)
    ? proposedArguments.metaFields.filter((field): field is Record<string, unknown> => Boolean(field && typeof field === 'object' && !Array.isArray(field)))
    : null;
  const liveFields = Array.isArray(live.fields)
    ? live.fields.filter((field): field is Record<string, unknown> => Boolean(field && typeof field === 'object' && !Array.isArray(field)))
    : [];
  const hydratedFields = proposedFields === null ? undefined : (() => {
    const changes = new Map(proposedFields.map((field) => [normalizeReference(field.name), field]));
    const merged = liveFields.map((field) => {
      const change = changes.get(normalizeReference(field.name));
      if (!change) return field;
      changes.delete(normalizeReference(field.name));
      return { ...field, ...change };
    });
    return [...merged, ...changes.values()];
  })();
  return {
    ...proposedArguments,
    ...(typeof live.slug === 'string' && live.slug && !capabilityId.endsWith('/update-meta-box') ? { slug: live.slug } : {}),
    ...(proposedArguments.id === undefined && String(live.id || '') ? { id: String(live.id) } : {}),
    ...(hydratedFields ? { metaFields: hydratedFields } : {}),
    ...(proposedArguments.expectedFingerprint === undefined && typeof live.fingerprint === 'string' && live.fingerprint
      ? { expectedFingerprint: live.fingerprint }
      : {}),
  };
}

function defaultActionArguments(
  capability: PixflowCapabilityDetail,
  context: WpAdminContext,
  proposedArguments?: Record<string, unknown>,
  readOnlyResults: Array<{ capabilityId: string; result: unknown }> = [],
): Record<string, unknown> {
  if (proposedArguments && Object.keys(proposedArguments).length > 0) {
    let normalized = normaliseReviewArguments(capability.id, proposedArguments);
    if (['pixflow/wp-admin/update-post', 'pixflow/wp-admin/trash-post', 'pixflow/wp-admin/restore-post'].includes(capability.id)) {
      normalized = bindWpAdminPostRevisionFromReads(normalized, readOnlyResults);
      const current = actionContext(context);
      if (normalized.postId === undefined && current.postId) normalized.postId = current.postId;
      if (normalized.expectedModifiedGmt === undefined && current.expectedModifiedGmt) normalized.expectedModifiedGmt = current.expectedModifiedGmt;
    }
    if (capability.id === 'pixflow/wp-admin/update-settings' && normalized.expectedFingerprint === undefined) {
      const read = readOnlyResults.find((entry) => entry.capabilityId === 'pixflow/wp-admin/read-settings');
      const result = read?.result && typeof read.result === 'object' ? read.result as Record<string, unknown> : null;
      if (typeof result?.fingerprint === 'string' && result.fingerprint) normalized.expectedFingerprint = result.fingerprint;
    }
    if (capability.id === 'pixflow/wp-admin/gutenberg/apply-document') {
      Object.assign(normalized, bindWpAdminGutenbergProposalToExactRead(normalized, readOnlyResults));
    }
    if (/^pixflow\/wp-admin\/code\/(?:write|delete)-/.test(capability.id)
      && !capability.id.endsWith('-files')
      && normalized.expectedFingerprint === undefined) {
      const fileRead = readOnlyResults.find((entry) => entry.capabilityId === 'pixflow/wp-admin/code/read-file');
      const fileResult = fileRead?.result && typeof fileRead.result === 'object' ? fileRead.result as Record<string, unknown> : null;
      if (typeof fileResult?.fingerprint === 'string') normalized.expectedFingerprint = fileResult.fingerprint;
      if (normalized.expectedFingerprint === undefined && (capability.id === 'pixflow/wp-admin/code/delete-plugin' || /(?:write|delete)-mu-plugin$/.test(capability.id))) {
        const projectsRead = readOnlyResults.find((entry) => entry.capabilityId === 'pixflow/wp-admin/code/list-projects');
        const projectsResult = projectsRead?.result && typeof projectsRead.result === 'object' ? projectsRead.result as Record<string, unknown> : null;
        const project = Array.isArray(projectsResult?.projects)
          ? projectsResult.projects.find((item) => item && typeof item === 'object' && (item as Record<string, unknown>).slug === normalized.slug) as Record<string, unknown> | undefined
          : undefined;
        if (typeof project?.fingerprint === 'string') normalized.expectedFingerprint = project.fingerprint;
      }
    }
    if (capability.id.startsWith('pixflow/wp-admin/wpcodebox2/')) {
      const getRead = readOnlyResults.find((entry) => entry.capabilityId === 'pixflow/wp-admin/wpcodebox2/get-snippet');
      const getResult = getRead?.result && typeof getRead.result === 'object' ? getRead.result as Record<string, unknown> : null;
      const getSnippet = getResult?.snippet && typeof getResult.snippet === 'object' ? getResult.snippet as Record<string, unknown> : null;
      const listRead = readOnlyResults.find((entry) => entry.capabilityId === 'pixflow/wp-admin/wpcodebox2/list-snippets');
      const listResult = listRead?.result && typeof listRead.result === 'object' ? listRead.result as Record<string, unknown> : null;
      const candidates = Array.isArray(listResult?.snippets) ? listResult.snippets.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')) : [];
      const requestedTitle = String(normalized.title || '').trim().toLowerCase();
      const listed = candidates.find((item) => Number(item.id) === Number(normalized.snippetId))
        || candidates.find((item) => requestedTitle && String(item.title || '').trim().toLowerCase() === requestedTitle)
        || (candidates.length === 1 ? candidates[0] : undefined);
      const live = getSnippet || listed;
      if (normalized.snippetId === undefined && Number(live?.id) > 0) normalized.snippetId = Number(live?.id);
      if (capability.id === 'pixflow/wp-admin/wpcodebox2/update-snippet') {
        if (normalized.title === undefined && typeof live?.title === 'string' && live.title) normalized.title = live.title;
        if (normalized.codeType === undefined && typeof live?.codeType === 'string' && live.codeType) normalized.codeType = live.codeType;
      }
      const fingerprint = typeof getResult?.fingerprint === 'string' ? getResult.fingerprint : live?.fingerprint;
      if (capability.id !== 'pixflow/wp-admin/wpcodebox2/create-snippet' && typeof fingerprint === 'string' && fingerprint && fingerprint !== 'absent') normalized.expectedFingerprint = fingerprint;
    }
    if (capability.id.startsWith('pixflow/wp-admin/jetengine/')) {
      Object.assign(normalized, mergeWpAdminJetEngineModelIdentity(capability.id, normalized, readOnlyResults));
      const modulesRead = readOnlyResults.find((entry) => entry.capabilityId === 'pixflow/wp-admin/jetengine/list-modules');
      const modulesResult = modulesRead?.result && typeof modulesRead.result === 'object' ? modulesRead.result as Record<string, unknown> : null;
      if (capability.id === 'pixflow/wp-admin/jetengine/set-module-state' && normalized.expectedFingerprint === undefined
        && typeof modulesResult?.fingerprint === 'string') normalized.expectedFingerprint = modulesResult.fingerprint;
      const cctsRead = readOnlyResults.find((entry) => entry.capabilityId === 'pixflow/wp-admin/jetengine/list-ccts');
      const cctsResult = cctsRead?.result && typeof cctsRead.result === 'object' ? cctsRead.result as Record<string, unknown> : null;
      const ccts = Array.isArray(cctsResult?.ccts) ? cctsResult.ccts.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')) : [];
      const requested = String(normalized.slug ?? normalized.name ?? '').trim().toLowerCase();
      const cct = ccts.find((item) => Number(item.id) === Number(normalized.id))
        || ccts.find((item) => requested && [item.slug, item.name].some((value) => String(value || '').trim().toLowerCase() === requested))
        || (ccts.length === 1 ? ccts[0] : undefined);
      if (/\/(?:update|delete)-cct$/.test(capability.id) || capability.id.endsWith('/remove-cct-fields')) {
        if (normalized.id === undefined && Number(cct?.id) > 0) normalized.id = Number(cct?.id);
        if (normalized.expectedFingerprint === undefined && typeof cct?.fingerprint === 'string') normalized.expectedFingerprint = cct.fingerprint;
      }
    }
    if (capability.id === 'pixflow/bricks/delete-template') {
      const listRead = readOnlyResults.find((entry) => entry.capabilityId === 'pixflow/bricks/list-templates');
      const listResult = listRead?.result && typeof listRead.result === 'object' ? listRead.result as Record<string, unknown> : null;
      const templates = Array.isArray(listResult?.templates) ? listResult.templates.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')) : [];
      const requested = String(normalized.title ?? normalized.templateTitle ?? '').trim().toLowerCase();
      const template = templates.find((item) => Number(item.id) === Number(normalized.templateId))
        || templates.find((item) => requested && String(item.title || '').trim().toLowerCase() === requested)
        || (templates.length === 1 ? templates[0] : undefined);
      if (normalized.templateId === undefined && Number(template?.id) > 0) normalized.templateId = Number(template?.id);
      if (normalized.expectedFingerprint === undefined && typeof template?.fingerprint === 'string') normalized.expectedFingerprint = template.fingerprint;
      delete normalized.title;
      delete normalized.templateTitle;
    }
    return normalized;
  }
  const id = capability.id.toLowerCase();
  const current = actionContext(context);
  if (id === 'pixflow/wp-admin/create-post') {
    return { postType: current.postType, title: '', status: 'draft', content: '' };
  }
  if (id === 'pixflow/wp-admin/update-post') {
    return { postId: current.postId || 0, expectedModifiedGmt: current.expectedModifiedGmt || '', fields: {} };
  }
  if (id === 'pixflow/acf/write-values') {
    return { target: current.postId ? { postId: current.postId } : {}, values: {} };
  }
  if (id === 'pixflow/bricks/create-template') {
    return { title: '', templateType: 'section' };
  }
  if (id === 'pixflow/bricks/update-template') {
    return { templateId: current.postId || 0, expectedModifiedGmt: current.expectedModifiedGmt || '', elements: [] };
  }
  if (id === 'pixflow/bricks/delete-template') {
    return { templateId: current.postId || 0, expectedFingerprint: '' };
  }
  if (id === 'pixflow/bricks/apply-settings') {
    return { key: 'abilitiesApiEnabled', value: true, expectedFingerprint: '' };
  }
  return {};
}

export function firstWpAdminWritableCapabilityId(
  decision: { mode: PixflowWpAdminInteractionMode; readOnly: boolean; capabilityIds: string[]; proposedActions?: Array<{ capabilityId: string; arguments: Record<string, unknown> }>; proposedArguments?: Record<string, unknown> },
  families: PixflowCapabilityFamilySummary[],
): string | undefined {
  return wpAdminWritableActionProposals(decision, families)[0]?.capabilityId;
}

export function wpAdminWritableActionProposals(
  decision: { mode: PixflowWpAdminInteractionMode; readOnly: boolean; capabilityIds: string[]; proposedActions?: Array<{ capabilityId: string; arguments: Record<string, unknown> }>; proposedArguments?: Record<string, unknown> },
  families: PixflowCapabilityFamilySummary[],
): Array<{ capabilityId: string; arguments: Record<string, unknown> }> {
  if (decision.mode !== 'design' || decision.readOnly) return [];
  const capabilities = families.flatMap((family) => family.capabilities || []);
  const writableIds = new Set(capabilities
    .filter((capability) => capability.risk !== 'read_only' && (!capability.allowedModes || capability.allowedModes.includes('design')))
    .map((capability) => capability.id));
  const selectedIds = new Set(decision.capabilityIds);
  const ordered = Array.isArray(decision.proposedActions)
    ? decision.proposedActions.filter((proposal) => writableIds.has(proposal.capabilityId) && selectedIds.has(proposal.capabilityId)).slice(0, 12)
    : [];
  if (ordered.length) {
    const normalizedOrdered = ordered.map((proposal, index) => {
      if (!proposal.capabilityId.startsWith('pixflow/wp-admin/jetengine/')) return proposal;
      let argumentsValue = { ...proposal.arguments };
      if (proposal.capabilityId === 'pixflow/wp-admin/jetengine/create-meta-box') {
        const rawTargets = Array.isArray(argumentsValue.objectTypes)
          ? argumentsValue.objectTypes
          : (typeof argumentsValue.objectTypes === 'string' ? [argumentsValue.objectTypes] : (typeof argumentsValue.objectName === 'string' ? [argumentsValue.objectName] : []));
        const target = String(rawTargets[0] || '');
        const owner = ordered.slice(0, index).find((candidate) => {
          if (!['pixflow/wp-admin/jetengine/create-post-type', 'pixflow/wp-admin/jetengine/create-taxonomy'].includes(candidate.capabilityId)) return false;
          return String(normaliseReviewArguments(candidate.capabilityId, candidate.arguments).slug || '') === target;
        });
        if (owner?.capabilityId === 'pixflow/wp-admin/jetengine/create-post-type') {
          argumentsValue = { ...argumentsValue, objectType: 'post', allowedPostTypes: [target] };
        } else if (owner?.capabilityId === 'pixflow/wp-admin/jetengine/create-taxonomy') {
          argumentsValue = { ...argumentsValue, objectType: 'taxonomy', allowedTaxonomies: [target] };
        }
        delete argumentsValue.objectTypes;
      }
      if (/pixflow\/wp-admin\/jetengine\/(?:create|update|delete)-cct-record$/.test(proposal.capabilityId)) {
        const normalizedRecord = normaliseReviewArguments(proposal.capabilityId, argumentsValue);
        if (!normalizedRecord.slug) {
          const owner = [...ordered.slice(0, index)].reverse().find((candidate) => candidate.capabilityId === 'pixflow/wp-admin/jetengine/create-cct');
          if (owner) {
            const ownerSlug = normaliseReviewArguments(owner.capabilityId, owner.arguments).slug;
            if (typeof ownerSlug === 'string' && ownerSlug) argumentsValue.slug = ownerSlug;
          }
        }
      }
      return { ...proposal, arguments: normaliseReviewArguments(proposal.capabilityId, argumentsValue) };
    });
    return normalizedOrdered.filter((proposal, index, proposals) => {
      if (proposal.capabilityId !== 'pixflow/wp-admin/jetengine/create-meta-box') return true;
      const metaBox = normaliseReviewArguments(proposal.capabilityId, proposal.arguments);
      const objectType = String(metaBox.objectType || '');
      const targets = objectType === 'post'
        ? (Array.isArray(metaBox.allowedPostTypes) ? metaBox.allowedPostTypes : [])
        : (Array.isArray(metaBox.allowedTaxonomies) ? metaBox.allowedTaxonomies : []);
      const target = String(targets[0] || '');
      const fieldNames = (Array.isArray(metaBox.metaFields) ? metaBox.metaFields : [])
        .map((field) => field && typeof field === 'object' && !Array.isArray(field) ? String((field as Record<string, unknown>).name || '') : '')
        .filter(Boolean)
        .sort();
      if (!target || !fieldNames.length) return true;
      return !proposals.slice(0, index).some((owner) => {
        const matchesOwner = objectType === 'post'
          ? owner.capabilityId === 'pixflow/wp-admin/jetengine/create-post-type'
          : owner.capabilityId === 'pixflow/wp-admin/jetengine/create-taxonomy';
        if (!matchesOwner) return false;
        const normalizedOwner = normaliseReviewArguments(owner.capabilityId, owner.arguments);
        if (String(normalizedOwner.slug || '') !== target) return false;
        const ownerFields = (Array.isArray(normalizedOwner.metaFields) ? normalizedOwner.metaFields : [])
          .map((field) => field && typeof field === 'object' && !Array.isArray(field) ? String((field as Record<string, unknown>).name || '') : '')
          .filter(Boolean)
          .sort();
        return ownerFields.length === fieldNames.length && ownerFields.every((name, fieldIndex) => name === fieldNames[fieldIndex]);
      });
    });
  }
  const capabilityId = decision.capabilityIds.find((id) => writableIds.has(id));
  return capabilityId ? [{ capabilityId, arguments: decision.proposedArguments || {} }] : [];
}

export function wpAdminAgentIdentity(
  config: AppConfig,
  agents: AgentInfo[],
): SharedChatAgentIdentity | undefined {
  if (config.mode === 'api') {
    return {
      agentId: apiExecutionAgentId(config),
      agentName: apiExecutionLabel(config),
    };
  }
  const agent = selectedAdminAgent(config, agents);
  if (!agent) return undefined;
  const prefs = selectedModel(config, agent);
  return {
    agentId: agent.id,
    agentName: agentModelDisplayName(agent.id, agent.name, prefs.model),
  };
}

/**
 * Bind the optimistic revision token only from an exact server-returned post
 * inventory record. The agent owns target selection; this helper contributes
 * the live machine fact required to execute that already-selected target.
 */
export function bindWpAdminPostRevisionFromReads(
  proposedArguments: Record<string, unknown>,
  readOnlyResults: Array<{ capabilityId: string; result: unknown }>,
): Record<string, unknown> {
  if (String(proposedArguments.expectedModifiedGmt || '').trim()) return proposedArguments;
  const postId = Number(proposedArguments.postId || 0);
  if (!Number.isInteger(postId) || postId < 1) return proposedArguments;
  const candidates = readOnlyResults
    .filter((entry) => entry.capabilityId === 'pixflow/wp-admin/list-posts' && Array.isArray(entry.result))
    .flatMap((entry) => entry.result as unknown[])
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
  const match = candidates.find((item) => Number(item.id || 0) === postId);
  const modifiedGmt = String(match?.modifiedGmt || '').trim();
  return modifiedGmt ? { ...proposedArguments, expectedModifiedGmt: modifiedGmt } : proposedArguments;
}

export function wpAdminPostContextBindingTarget(
  decision: { targetProvenance?: string; target?: { kind?: string; id?: number | string | null } },
  argumentsValue: Record<string, unknown>,
  activePostId: number,
): { kind: 'active' | 'explicit' | 'rejected'; postId: number } {
  const nestedTarget = argumentsValue.target && typeof argumentsValue.target === 'object' && !Array.isArray(argumentsValue.target)
    ? argumentsValue.target as Record<string, unknown>
    : null;
  const postId = Number(argumentsValue.postId || argumentsValue.templateId
    || (String(nestedTarget?.type || '') === 'post' ? nestedTarget?.id : 0) || 0);
  if (!Number.isInteger(postId) || postId < 1 || (activePostId > 0 && postId === activePostId)) {
    return { kind: 'active', postId: Number.isInteger(postId) && postId > 0 ? postId : 0 };
  }
  // A site-level WP Admin screen has no active post to inherit. Any exact post
  // ID in the agent's typed read/action decision is therefore an explicit
  // target, but it gains authority only after the server performs a fresh
  // authorised context read. Object-level screens remain stricter for every
  // cross-post target.
  if (activePostId < 1) return { kind: 'explicit', postId };
  const selectedExactPost = decision.target?.kind === 'post' && Number(decision.target.id || 0) === postId;
  return selectedExactPost && decision.targetProvenance === 'explicit_user_target'
    ? { kind: 'explicit', postId }
    : { kind: 'rejected', postId };
}

export function wpAdminResearchReadProposals(
  decision: { capabilityIds: string[]; target?: { id?: number | string | null }; proposedReads?: Array<{ capabilityId: string; arguments: Record<string, unknown> }>; proposedActions?: Array<{ capabilityId: string; arguments: Record<string, unknown> }> },
  families: PixflowCapabilityFamilySummary[],
  context: unknown = null,
  priorGroundingResults: Array<{ capabilityId: string; arguments: Record<string, unknown>; result: unknown }> = [],
): Array<{ capabilityId: string; arguments: Record<string, unknown> }> {
  const capabilities = families.flatMap((family) => family.available ? family.capabilities || [] : []);
  const readableIds = new Set(capabilities.filter((capability) => capability.risk === 'read_only').map((capability) => capability.id));
  const capabilityById = new Map(capabilities.map((capability) => [capability.id, capability]));
  const writableCapabilityId = [
    ...(Array.isArray(decision.proposedActions) ? decision.proposedActions.map((action) => action.capabilityId) : []),
    ...decision.capabilityIds,
  ].find((id) => capabilityById.has(id) && capabilityById.get(id)?.risk !== 'read_only');
  const currentPostId = wpAdminContextPostId(context);
  const declaredTargetId = Number(decision.target?.id || 0);
  const bindsCurrentPost = currentPostId > 0 && (declaredTargetId < 1 || declaredTargetId === currentPostId);
  const proposed = (Array.isArray(decision.proposedReads) ? decision.proposedReads : [])
    .filter((proposal) => readableIds.has(proposal.capabilityId))
    .slice(0, 6)
    .map((proposal) => {
      const argumentsValue = normaliseReviewArguments(proposal.capabilityId, proposal.arguments);
      if (/^pixflow\/wp-admin\/integrations\/[a-z0-9-]+\/status$/.test(proposal.capabilityId)) {
        return {
          capabilityId: proposal.capabilityId,
          arguments: wpAdminReadOnlyCapabilityArguments(proposal.capabilityId, writableCapabilityId, argumentsValue, context),
        };
      }
      if (proposal.capabilityId === 'pixflow/wp-admin/code/read-file') {
        let boundArguments = wpAdminReadOnlyCapabilityArguments(proposal.capabilityId, writableCapabilityId, argumentsValue, context);
        if (!Object.keys(boundArguments).length) {
          const slug = String(argumentsValue.slug || '').trim();
          const priorProjects = priorGroundingResults
            .filter((entry) => entry.capabilityId === 'pixflow/wp-admin/code/list-projects')
            .flatMap((entry) => {
              const result = entry.result && typeof entry.result === 'object' && !Array.isArray(entry.result)
                ? entry.result as Record<string, unknown>
                : null;
              return Array.isArray(result?.projects) ? result.projects : [];
            })
            .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
          const matchingProject = priorProjects.find((project) => slug && String(project.slug || '') === slug);
          const projectType = String(matchingProject?.projectType || '');
          if (matchingProject && ['child_theme', 'mu_plugin', 'plugin'].includes(projectType)) {
            boundArguments = wpAdminReadOnlyCapabilityArguments(
              proposal.capabilityId,
              writableCapabilityId,
              { ...argumentsValue, projectType },
              context,
            );
          }
        }
        const projectType = String(boundArguments.projectType || '');
        const slug = String(boundArguments.slug || '').trim();
        if (projectType === 'mu_plugin' && slug) {
          const bootstrapFile = `${slug}.php`;
          const bootstrapAlreadyGrounded = priorGroundingResults.some((entry) => (
            entry.capabilityId === 'pixflow/wp-admin/code/read-file'
            && String(entry.arguments.projectType || '') === 'mu_plugin'
            && String(entry.arguments.slug || '') === slug
            && String(entry.arguments.file || '') === bootstrapFile
            && Boolean(entry.result && typeof entry.result === 'object')
          ));
          // A managed MU plugin's root bootstrap is the authoritative existing
          // source. Ground it before following a proposed read into a companion
          // path which may not exist yet; the later batch-write projector can
          // safely bind new files to the explicit `absent` fingerprint.
          if (!bootstrapAlreadyGrounded) boundArguments = { ...boundArguments, file: bootstrapFile };
        }
        if (Object.keys(boundArguments).length) return { capabilityId: proposal.capabilityId, arguments: boundArguments };
      }
      if (/^pixflow\/wp-admin\/(?:jetengine|wpcodebox2)\//.test(proposal.capabilityId)) {
        const boundArguments = wpAdminReadOnlyCapabilityArguments(proposal.capabilityId, writableCapabilityId, argumentsValue, context);
        if (Object.keys(boundArguments).length) return { capabilityId: proposal.capabilityId, arguments: boundArguments };
      }
      if (proposal.capabilityId === 'pixflow/wp-admin/get-post') {
        const postId = Number(argumentsValue.postId || argumentsValue.id || (bindsCurrentPost ? currentPostId : 0));
        return {
          capabilityId: proposal.capabilityId,
          arguments: Number.isInteger(postId) && postId > 0 ? { postId } : {},
        };
      }
      if (proposal.capabilityId === 'pixflow/acf/get-field-group-schema') {
        const key = String(argumentsValue.key || '').trim();
        if (!/^group_[a-zA-Z0-9_]+$/.test(key) && readableIds.has('pixflow/acf/list-field-groups')) {
          return { capabilityId: 'pixflow/acf/list-field-groups', arguments: {} };
        }
        if (/^group_[a-zA-Z0-9_]+$/.test(key)) return { capabilityId: proposal.capabilityId, arguments: { key } };
      }
      if (proposal.capabilityId === 'pixflow/acf/read-values') {
        const suppliedTarget = argumentsValue.target;
        if (suppliedTarget && typeof suppliedTarget === 'object' && !Array.isArray(suppliedTarget)) {
          const target = { ...(suppliedTarget as Record<string, unknown>) };
          if (target.id === undefined && target.postId !== undefined) target.id = target.postId;
          if (target.type === undefined && Number(target.id || 0) > 0) target.type = 'post';
          delete target.postId;
          argumentsValue.target = target;
        } else {
          const targetId = Number(argumentsValue.postId || decision.target?.id || (bindsCurrentPost ? currentPostId : 0));
          if (Number.isInteger(targetId) && targetId > 0) argumentsValue.target = { type: 'post', id: targetId };
        }
        delete argumentsValue.postId;
        delete argumentsValue.postType;
      }
      if (proposal.capabilityId === 'pixflow/wp-admin/list-taxonomies'
        || proposal.capabilityId === 'pixflow/acf/list-field-groups') {
        return { capabilityId: proposal.capabilityId, arguments: {} };
      }
      if (proposal.capabilityId === 'pixflow/wp-admin/list-terms') {
        const taxonomy = String(argumentsValue.taxonomy || '').trim();
        const search = String(argumentsValue.search || '').trim();
        const perPage = Number(argumentsValue.perPage || 0);
        return {
          capabilityId: proposal.capabilityId,
          arguments: {
            ...(taxonomy ? { taxonomy } : {}),
            ...(search ? { search } : {}),
            ...(Number.isInteger(perPage) && perPage > 0 ? { perPage } : {}),
          },
        };
      }
      if (proposal.capabilityId === 'pixflow/wp-admin/list-media' && readableIds.has('pixflow/wp-admin/get-media')) {
        const proposedIds = Array.isArray(argumentsValue.ids)
          ? argumentsValue.ids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
          : [];
        const attachmentId = proposedIds.length === 1 ? proposedIds[0]! : 0;
        if (attachmentId > 0) {
          return { capabilityId: 'pixflow/wp-admin/get-media', arguments: { attachmentId } };
        }
      }
      if (bindsCurrentPost && [
        'pixflow/wp-admin/get-post',
        'pixflow/wp-admin/gutenberg/status',
        'pixflow/wp-admin/gutenberg/read-document',
        'pixflow/wp-admin/gutenberg/list-block-types',
      ].includes(proposal.capabilityId)) {
        argumentsValue.postId = currentPostId;
      }
      if (proposal.capabilityId === 'pixflow/wp-admin/plugin-source/search') {
        if (!String(argumentsValue.plugin || '').trim()) {
          argumentsValue.plugin = String(argumentsValue.pluginName || '').trim();
        }
        if (!String(argumentsValue.query || '').trim()) {
          const apiTerms = Array.isArray(argumentsValue.apiTerms)
            ? argumentsValue.apiTerms.map((term) => String(term || '').trim()).filter(Boolean).slice(0, 8)
            : [];
          const terms = Array.isArray(argumentsValue.terms)
            ? argumentsValue.terms.map((term) => String(term || '').trim()).filter(Boolean).slice(0, 8)
            : [];
          argumentsValue.query = apiTerms.join(' ') || terms.join(' ');
        }
        if (Number(argumentsValue.maxResults) <= 0) delete argumentsValue.maxResults;
        delete argumentsValue.searchTerm;
        delete argumentsValue.apiTerms;
        delete argumentsValue.pluginName;
        delete argumentsValue.terms;
      }
      return { capabilityId: proposal.capabilityId, arguments: argumentsValue };
    })
    .filter((proposal) => {
      const requiresPostId = [
        'pixflow/wp-admin/get-post',
        'pixflow/wp-admin/gutenberg/status',
        'pixflow/wp-admin/gutenberg/read-document',
        'pixflow/wp-admin/gutenberg/list-block-types',
        'pixflow/wp-admin/gutenberg/get-block-type',
      ].includes(proposal.capabilityId);
      if (requiresPostId && (!Number.isInteger(Number(proposal.arguments.postId)) || Number(proposal.arguments.postId) < 1)) {
        return false;
      }
      if (proposal.capabilityId === 'pixflow/wp-admin/jetengine/get-model') {
        return Boolean(String(proposal.arguments.id || '').trim())
          && Boolean(String(proposal.arguments.modelType || '').trim());
      }
      if (proposal.capabilityId === 'pixflow/wp-admin/code/read-file') {
        return ['child_theme', 'mu_plugin', 'plugin'].includes(String(proposal.arguments.projectType || ''))
          && Boolean(String(proposal.arguments.slug || '').trim())
          && Boolean(String(proposal.arguments.file || '').trim());
      }
      if (proposal.capabilityId === 'pixflow/acf/get-field-group-schema') {
        return /^group_[a-zA-Z0-9_]+$/.test(String(proposal.arguments.key || '').trim());
      }
      if (proposal.capabilityId === 'pixflow/acf/read-values') {
        const target = proposal.arguments.target;
        return Boolean(target && typeof target === 'object' && !Array.isArray(target)
          && String((target as Record<string, unknown>).type || '').trim()
          && Number((target as Record<string, unknown>).id || 0) > 0);
      }
      if (proposal.capabilityId === 'pixflow/wp-admin/list-terms') {
        return Boolean(String(proposal.arguments.taxonomy || '').trim());
      }
      return proposal.capabilityId !== 'pixflow/wp-admin/plugin-source/search'
        || (Boolean(String(proposal.arguments.plugin || '').trim()) && Boolean(String(proposal.arguments.query || '').trim()));
    });
  return proposed.slice(0, 6);
}

export function bindWpAdminGutenbergProposalToExactRead(
  proposedArguments: Record<string, unknown>,
  readOnlyResults: Array<{ capabilityId: string; result: unknown }>,
): Record<string, unknown> {
  // A duplicate/create workflow can read one post as source evidence while
  // targeting the ID returned by an earlier create step. The source read must
  // never replace that unresolved destination reference or donate its source
  // fingerprint to the new post.
  if (wpAdminActionHasResultReferences({ postId: proposedArguments.postId })) {
    const dependent = { ...proposedArguments };
    delete dependent.expectedFingerprint;
    return dependent;
  }
  const proposedPostId = Number(proposedArguments.postId || 0);
  const documentReads = readOnlyResults.filter((entry) => entry.capabilityId === 'pixflow/wp-admin/gutenberg/read-document');
  const documentRead = documentReads.find((entry) => {
    if (proposedPostId < 1 || !entry.result || typeof entry.result !== 'object') return false;
    const candidatePost = (entry.result as Record<string, unknown>).post;
    return Boolean(candidatePost && typeof candidatePost === 'object'
      && Number((candidatePost as Record<string, unknown>).id || 0) === proposedPostId);
  }) || documentReads[0];
  const result = documentRead?.result && typeof documentRead.result === 'object'
    ? documentRead.result as Record<string, unknown>
    : null;
  const post = result?.post && typeof result.post === 'object' ? result.post as Record<string, unknown> : null;
  const postId = Number(post?.id || 0);
  const fingerprint = typeof result?.fingerprint === 'string' ? result.fingerprint : '';
  return {
    ...proposedArguments,
    ...(postId > 0 ? { postId } : {}),
    ...(fingerprint ? { expectedFingerprint: fingerprint } : {}),
  };
}

/**
 * A provider may not turn an already verified, complete current-post read into
 * a redundant target/action clarification. Ask and Plan remain read-only and
 * proceed to the answer stage using the host-selected exact read.
 */
export function enforceGroundedWpAdminContentReadDecision(
  decision: PixflowWpAdminSemanticPreflightDecision,
  mode: PixflowWpAdminInteractionMode,
  currentPostId: number,
  exactReadResult: unknown,
  authority?: PixflowWpAdminContextAuthorityBinding,
): PixflowWpAdminSemanticPreflightDecision {
  const selectedCurrentDocumentRead = decision.capabilityIds.includes('pixflow/wp-admin/gutenberg/read-document')
    || (decision.proposedReads || []).some((read) => read.capabilityId === 'pixflow/wp-admin/gutenberg/read-document');
  if (mode === 'design' || currentPostId < 1 || !selectedCurrentDocumentRead) return decision;
  const exact = validateWpAdminExactGutenbergRead(exactReadResult, currentPostId, authority);
  if (!exact.ok || !exact.complete) return decision;
  return {
    ...decision,
    state: 'ready',
    intent: decision.intent || 'read_current_post',
    target: { kind: 'post', id: currentPostId, postType: null, taxonomy: null },
    capabilityIds: ['pixflow/wp-admin/gutenberg/read-document'],
    riskCeiling: 'read_only',
    readOnly: true,
    answerOnly: true,
    clarification: null,
    unresolvedChoices: [],
    proposedReads: [],
    proposedActions: [],
    proposedArguments: {},
  };
}

export function wpAdminPluginSourceFollowupRead(
  searchArguments: Record<string, unknown>,
  searchResult: unknown,
): { capabilityId: string; arguments: Record<string, unknown> } | null {
  if (!searchResult || typeof searchResult !== 'object' || Array.isArray(searchResult)) return null;
  const matches = Array.isArray((searchResult as Record<string, unknown>).matches)
    ? (searchResult as Record<string, unknown>).matches as unknown[]
    : [];
  const match = matches.find((item) => item && typeof item === 'object' && !Array.isArray(item)
    && typeof (item as Record<string, unknown>).file === 'string'
    && Number((item as Record<string, unknown>).line) > 0) as Record<string, unknown> | undefined;
  const plugin = String(searchArguments.plugin || '').trim();
  const file = String(match?.file || '').trim();
  const line = Number(match?.line || 0);
  if (!plugin || !file || !Number.isInteger(line) || line < 1) return null;
  return {
    capabilityId: 'pixflow/wp-admin/plugin-source/read-file',
    arguments: { plugin, file, startLine: Math.max(1, line - 20), endLine: line + 40 },
  };
}

const SAFE_ACTION_RESULT_PATH = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*){0,4}$/;
const SENSITIVE_ACTION_RESULT_SEGMENT = /^(?:token|secret|password|nonce|apiKey|credential|content|code|beforeValues)$/i;

export function resolveWpAdminActionReferences(
  value: Record<string, unknown>,
  actions: WpAdminActionState[],
  currentIndex: number,
): Record<string, unknown> {
  const resolve = (candidate: unknown, depth = 0): unknown => {
    if (depth > 8) throw new Error('The action result reference is too deeply nested.');
    if (Array.isArray(candidate)) return candidate.map((item) => resolve(item, depth + 1));
    if (!candidate || typeof candidate !== 'object') return candidate;
    const recordValue = candidate as Record<string, unknown>;
    if (Object.keys(recordValue).length === 1 && recordValue.$pixflowRef && typeof recordValue.$pixflowRef === 'object' && !Array.isArray(recordValue.$pixflowRef)) {
      const reference = recordValue.$pixflowRef as Record<string, unknown>;
      const step = Number(reference.step);
      const path = String(reference.path || '');
      if (!Number.isInteger(step) || step < 1 || step > currentIndex) throw new Error('An action result reference must point to an earlier step.');
      if (!SAFE_ACTION_RESULT_PATH.test(path) || path.split('.').some((segment) => SENSITIVE_ACTION_RESULT_SEGMENT.test(segment))) {
        throw new Error('The action result reference does not use a safe result path.');
      }
      const source = actions[step - 1];
      if (!source || source.operation?.status !== 'committed') throw new Error(`Step ${step} must be committed before its result can be used.`);
      let resolved: unknown = source.result;
      for (const segment of path.split('.')) {
        if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved) || !Object.prototype.hasOwnProperty.call(resolved, segment)) {
          throw new Error(`The referenced result ${path} is not available from step ${step}.`);
        }
        resolved = (resolved as Record<string, unknown>)[segment];
      }
      if (!['string', 'number', 'boolean'].includes(typeof resolved)) throw new Error('Action result references must resolve to a scalar value.');
      return resolved;
    }
    return Object.fromEntries(Object.entries(recordValue).map(([key, child]) => [key, resolve(child, depth + 1)]));
  };
  return resolve(value) as Record<string, unknown>;
}

export function wpAdminActionReferenceOperationIds(
  value: Record<string, unknown>,
  actions: WpAdminActionState[],
  currentIndex: number,
): string[] {
  const steps = new Set<number>();
  const visit = (candidate: unknown, depth = 0): void => {
    if (depth > 8) throw new Error('The action result reference is too deeply nested.');
    if (Array.isArray(candidate)) {
      candidate.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    const recordValue = candidate as Record<string, unknown>;
    if (Object.keys(recordValue).length === 1 && recordValue.$pixflowRef && typeof recordValue.$pixflowRef === 'object' && !Array.isArray(recordValue.$pixflowRef)) {
      const step = Number((recordValue.$pixflowRef as Record<string, unknown>).step);
      if (!Number.isInteger(step) || step < 1 || step > currentIndex) throw new Error('An action result reference must point to an earlier step.');
      steps.add(step);
      return;
    }
    Object.values(recordValue).forEach((child) => visit(child, depth + 1));
  };
  visit(value);
  return [...steps].map((step) => {
    const operationId = actions[step - 1]?.operation?.operationId;
    if (!operationId || actions[step - 1]?.operation?.status !== 'committed') throw new Error(`Step ${step} must be committed before its result can be used.`);
    return operationId;
  });
}

export function wpAdminActionExecutionLocked(actions: WpAdminActionState[], index: number): boolean {
  if (index <= 0) return false;
  return actions.slice(0, index).some((action) => action.operation?.status !== 'committed');
}

export function wpAdminActionRollbackLocked(actions: WpAdminActionState[], index: number): boolean {
  return actions.slice(index + 1).some((action) => action.operation?.status === 'committed');
}

/**
 * Selects host-owned read leaves for a turn. A model may omit a read leaf
 * while answering a readiness question, so the host adds the narrow,
 * integration-specific read required to ground the answer. This never adds a
 * write capability and remains bounded to the active server catalogue.
 */
export function hostWpAdminReadOnlyCapabilityIds(
  decision: { capabilityIds: string[] },
  families: PixflowCapabilityFamilySummary[],
): string[] {
  const capabilities = families.flatMap((family) => family.capabilities || []);
  const byId = new Map(capabilities.map((capability) => [capability.id, capability]));
  return [...new Set(decision.capabilityIds)]
    .filter((id) => byId.get(id)?.risk === 'read_only')
    .slice(0, 2);
}

export function wpAdminActionHasResultReferences(value: Record<string, unknown>): boolean {
  let found = false;
  const visit = (candidate: unknown, depth = 0): void => {
    if (found || depth > 8 || !candidate || typeof candidate !== 'object') return;
    if (Array.isArray(candidate)) {
      candidate.forEach((item) => visit(item, depth + 1));
      return;
    }
    const recordValue = candidate as Record<string, unknown>;
    if (Object.keys(recordValue).length === 1
      && recordValue.$pixflowRef
      && typeof recordValue.$pixflowRef === 'object'
      && !Array.isArray(recordValue.$pixflowRef)) {
      found = true;
      return;
    }
    Object.values(recordValue).forEach((child) => visit(child, depth + 1));
  };
  visit(value);
  return found;
}

export function wpAdminReadOnlyCapabilityArguments(
  capabilityId: string,
  writableCapabilityId: string | undefined,
  proposedArguments: Record<string, unknown> | undefined,
  context: unknown = null,
): Record<string, unknown> {
  const integrationStatusMatch = capabilityId.match(/^pixflow\/wp-admin\/integrations\/([a-z0-9-]+)\/status$/);
  if (integrationStatusMatch) return { integration: integrationStatusMatch[1] };
  if (capabilityId === 'pixflow/wp-admin/gutenberg/status' || capabilityId === 'pixflow/wp-admin/gutenberg/read-document') {
    const postId = Number(proposedArguments?.postId ?? proposedArguments?.postID ?? proposedArguments?.post_id ?? wpAdminContextPostId(context));
    return Number.isInteger(postId) && postId > 0 ? { postId } : {};
  }
  if (capabilityId === 'pixflow/wp-admin/wpcodebox2/get-snippet') {
    const id = Number(proposedArguments?.snippetId ?? proposedArguments?.id ?? 0);
    return Number.isInteger(id) && id > 0 ? { snippetId: id } : {};
  }
  if (capabilityId === 'pixflow/wp-admin/wpcodebox2/list-snippets') {
    const title = String(proposedArguments?.snippetTitle ?? proposedArguments?.title ?? '').trim();
    return title ? { search: title, perPage: 20 } : { perPage: 50 };
  }
  if (capabilityId === 'pixflow/wp-admin/jetengine/setup') return {};
  if (capabilityId === 'pixflow/wp-admin/jetengine/list-modules') return {};
  if (capabilityId === 'pixflow/wp-admin/jetengine/list-ccts') {
    const search = String(proposedArguments?.name ?? proposedArguments?.slug ?? '').trim();
    return { ...(search ? { search } : {}), perPage: 50 };
  }
  if (capabilityId === 'pixflow/wp-admin/jetengine/list-models') {
    const leaf = String(writableCapabilityId || '');
    const modelType = leaf.includes('post-type') ? 'post_type'
      : leaf.includes('taxonomy') ? 'taxonomy'
        : leaf.includes('meta-box') ? 'meta_box'
          : leaf.includes('options-page') ? 'options_page'
            : String(proposedArguments?.modelType || 'post_type');
    // Fetch the bounded model-type list without a guessed search term. Agents
    // frequently vary separators (studio_details vs studio-details) or use the
    // display label. Identity hydration below resolves those forms locally and
    // avoids hiding the live model needed for its numeric ID/fingerprint.
    return { modelType, perPage: 50 };
  }
  if (capabilityId === 'pixflow/wp-admin/jetengine/get-model') {
    const id = String(proposedArguments?.id ?? '').trim();
    const modelType = String(proposedArguments?.modelType ?? '').trim();
    return id && modelType ? { id, modelType } : {};
  }
  if (capabilityId === 'pixflow/bricks/status' || capabilityId === 'pixflow/bricks/read-settings') return {};
  if (capabilityId === 'pixflow/bricks/list-templates') {
    const title = String(proposedArguments?.title ?? '').trim();
    return { ...(title ? { search: title } : {}), perPage: 20 };
  }
  if (capabilityId !== 'pixflow/wp-admin/code/read-file') return {};
  const proposal = proposedArguments || {};
  const slug = typeof proposal.slug === 'string' ? proposal.slug : '';
  const proposalFile = typeof proposal.file === 'string' ? proposal.file : '';
  const explicitProjectType = String(proposal.projectType || '').trim();
  const projectType = ['child_theme', 'mu_plugin', 'plugin'].includes(explicitProjectType)
    ? explicitProjectType
    : writableCapabilityId?.includes('child-theme')
    ? 'child_theme'
    : writableCapabilityId?.includes('mu-plugin')
      ? 'mu_plugin'
      : writableCapabilityId?.includes('plugin')
        ? 'plugin'
        : '';
  const file = proposalFile || (projectType === 'mu_plugin' && slug ? `${slug}.php` : '');
  return projectType && slug && file ? { projectType, slug, file } : {};
}

function safeActionJson(value: unknown): string {
  try {
    const encoded = JSON.stringify(value, null, 2);
    return encoded.length <= 16_000 ? encoded : '{\n  \"error\": \"Arguments are too large.\"\n}';
  } catch {
    return '{}';
  }
}

async function loadWpAdminCapabilityDetail(capabilityId: string): Promise<PixflowCapabilityDetail | null> {
  // Keep capability family separators as REST path separators. Encoding the
  // whole id turns `pixflow/wp-admin/create-post` into one segment, which does
  // not match WordPress' typed capability route regex.
  try {
    const capabilityPath = capabilityId.split('/').map((segment) => encodeURIComponent(segment)).join('/');
    const response = await pixflowWordPressRestFetch(`/wp-admin/capabilities/${capabilityPath}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    const payload = await response.json().catch(() => null) as { capability?: PixflowCapabilityDetail } | null;
    if (!response.ok || !payload?.capability || typeof payload.capability.id !== 'string') return null;
    return payload.capability;
  } catch {
    return null;
  }
}

/**
 * Progressive detail is preferred, but a local front controller can reject a
 * nested capability URL even while the compact catalogue and typed execute
 * route are available. Keep the review UI usable with a bounded summary-only
 * detail; the WordPress safety plane still validates the real schema at
 * approval and execution time.
 */
export function fallbackWpAdminCapabilityDetail(
  capabilityId: string,
  families: PixflowCapabilityFamilySummary[],
): PixflowCapabilityDetail | null {
  for (const family of families) {
    const summary = (family.capabilities || []).find((capability) => capability.id === capabilityId);
    if (!summary || summary.risk === 'read_only') continue;
    return {
      id: summary.id,
      familyId: family.id,
      label: summary.label,
      description: 'The server will validate the exact typed arguments, permissions, internal action authority, audit, readback, and rollback policy before execution.',
      inputSchema: { type: 'object', additionalProperties: true },
      outputSchema: { type: 'object', additionalProperties: true },
      annotations: { risk: summary.risk, idempotency: 'idempotent', reversible: summary.risk === 'reversible_write' || summary.risk === 'code_filesystem', requiresApproval: summary.risk === 'privileged' || summary.risk === 'destructive' || summary.risk === 'code_filesystem' },
      integrationId: family.integrationId,
      linkedSkillIds: family.linkedSkillIds || [],
      availability: family.available ? 'available' : 'unavailable',
      allowedModes: summary.allowedModes || ['design'],
      permission: { required: [], targetType: 'site' },
      rollback: { supported: summary.risk === 'reversible_write' || summary.risk === 'code_filesystem', policy: summary.risk === 'reversible_write' || summary.risk === 'code_filesystem' ? 'recorded_before_state' : 'none' },
    };
  }
  return null;
}

function actionErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const nested = record.error && typeof record.error === 'object' ? record.error as Record<string, unknown> : null;
    const message = nested?.message ?? record.message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return `WordPress Admin action failed (${status}).`;
}

type WpAdminActionFetcher = (path: string, init?: RequestInit) => Promise<Response>;

type WpAdminResolvedActionPreparation = (input: {
  action: WpAdminActionState;
  arguments: Record<string, unknown>;
  index: number;
  actions: WpAdminActionState[];
}) => Promise<{ arguments: Record<string, unknown>; contextBinding?: PixflowWpAdminContextAuthorityBinding }>;

export type WpAdminAutomaticExecutionResult = {
  actions: WpAdminActionState[];
  reloadPostId: number;
  unavailable?: GutenbergActionUnavailable;
};

/**
 * Rebind active-post mutations to the verified object identity at the final
 * client boundary. The model may omit trusted machine identifiers, but the
 * automatic execution request must never depend on that omission or infer a
 * different target from conversation text.
 */
export function bindWpAdminAutomaticActionTarget(
  action: WpAdminActionState,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (!['pixflow/wp-admin/update-post', 'pixflow/wp-admin/gutenberg/apply-document'].includes(action.capability.id)) return args;
  const identity = action.contextBinding?.contextIdentity;
  const boundPostId = identity?.objectKind === 'post' ? Number(identity.objectId || 0) : 0;
  if (!Number.isInteger(boundPostId) || boundPostId < 1) return args;
  const suppliedPostId = Number(args.postId || 0);
  if (suppliedPostId > 0 && suppliedPostId !== boundPostId) {
    throw new Error(`The prepared action target ${suppliedPostId} no longer matches the verified current post ${boundPostId}. Nothing changed.`);
  }
  return { ...args, postId: boundPostId };
}

/** Return the exact post target carried by a typed action argument shape. */
export function wpAdminActionTargetPostId(args: Record<string, unknown>): number {
  const nestedTarget = args.target && typeof args.target === 'object' && !Array.isArray(args.target)
    ? args.target as Record<string, unknown>
    : null;
  const postId = Number(args.postId || args.templateId
    || (String(nestedTarget?.type || '') === 'post' ? nestedTarget?.id : 0) || 0);
  return Number.isInteger(postId) && postId > 0 ? postId : 0;
}

/**
 * A post resolved from a preceding batch result is a freshly read, explicit
 * object target. It must never inherit the dashboard action's active-context
 * provenance because that token was issued for a different identity.
 */
export function wpAdminDependentPostTargetProvenance(): 'explicit_user_target' {
  return 'explicit_user_target';
}

/**
 * Execute a prepared Design-mode action batch without exposing a second
 * user-facing approval step. The server approval token remains an internal,
 * short-lived authority boundary; every action still passes through the same
 * context, permission, idempotency, audit, readback, and rollback plane.
 */
export async function autoExecuteWpAdminActions(
  sourceActions: WpAdminActionState[],
  sessionId: string,
  signal?: AbortSignal,
  fetcher: WpAdminActionFetcher = pixflowWordPressRestFetch,
  prepareResolvedAction?: WpAdminResolvedActionPreparation,
): Promise<WpAdminAutomaticExecutionResult> {
  const actions = sourceActions.map((action) => ({ ...action }));
  let reloadPostId = 0;
  let failure: Error | null = null;
  let unavailable: GutenbergActionUnavailable | undefined;

  try {
    for (let index = 0; index < actions.length; index += 1) {
      if (signal?.aborted) throw new DOMException('Stopped.', 'AbortError');
      let action = actions[index]!;
      if (!action.contextBinding) throw new Error('The prepared action is missing verified WordPress object-context binding. Nothing changed.');
      const dependsOnOperationIds = wpAdminActionReferenceOperationIds(action.initialArguments, actions, index);
      let resolvedArguments = resolveWpAdminActionReferences(action.initialArguments, actions, index);
      if (prepareResolvedAction) {
        const prepared = await prepareResolvedAction({ action, arguments: resolvedArguments, index, actions });
        resolvedArguments = prepared.arguments;
        if (prepared.contextBinding) {
          action = { ...action, contextBinding: prepared.contextBinding };
          actions[index] = action;
        }
      }
      if (isGutenbergActionUnavailable(resolvedArguments)) {
        unavailable = resolvedArguments;
        break;
      }
      const args = bindWpAdminAutomaticActionTarget(action, resolvedArguments);
      const executionSessionId = wpAdminActionExecutionSessionId(action.capability.id, args, `${sessionId}:step:${index + 1}`);
      const request = {
        surface: 'wp_admin',
        sessionId: executionSessionId,
        mode: 'design',
        capabilityId: action.capability.id,
        arguments: args,
        dependsOnOperationIds,
        contextBinding: action.contextBinding,
      };
      const approvalResponse = await fetcher('/wp-admin/approvals', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(request),
        signal,
      });
      const approvalPayload = await approvalResponse.json().catch(() => null) as Record<string, unknown> | null;
      if (!approvalResponse.ok) throw new Error(actionErrorMessage(approvalPayload, approvalResponse.status));
      if (isGutenbergActionUnavailable(approvalPayload)) {
        unavailable = approvalPayload;
        break;
      }
      const approval = approvalPayload?.approval && typeof approvalPayload.approval === 'object'
        ? approvalPayload.approval as Record<string, unknown>
        : {};
      const token = typeof approval.token === 'string' ? approval.token : '';
      if (!token) throw new Error('The server did not return an internal action-authority token. Nothing changed.');
      const executionResponse = await fetcher('/wp-admin/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          ...request,
          approvalToken: token,
          idempotencyKey: `wp-admin-auto:${action.id}`.slice(0, 190),
        }),
        signal,
      });
      const executionPayload = await executionResponse.json().catch(() => null) as Record<string, unknown> | null;
      if (!executionResponse.ok) throw new Error(actionErrorMessage(executionPayload, executionResponse.status));
      const availability = isGutenbergActionUnavailable(executionPayload) ? executionPayload : executionPayload?.result;
      if (isGutenbergActionUnavailable(availability)) {
        unavailable = availability;
        break;
      }
      const operation = executionPayload?.operation && typeof executionPayload.operation === 'object'
        ? executionPayload.operation as WpAdminActionOperation
        : undefined;
      if (operation?.status !== 'committed') throw new Error('WordPress did not commit the prepared action. Nothing was reported as completed.');
      const result = executionPayload?.result;
      actions[index] = { ...action, initialArguments: args, operation, result, error: undefined };
      const resultRecord = result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : null;
      const resultPost = resultRecord?.post && typeof resultRecord.post === 'object' ? resultRecord.post as Record<string, unknown> : null;
      if (resultRecord?.reloadEditor === true) reloadPostId = Number(resultPost?.id || 0);
    }
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  }

  if (failure || unavailable) {
    const rollbackFailures: string[] = [];
    for (let index = actions.length - 1; index >= 0; index -= 1) {
      const action = actions[index]!;
      if (action.operation?.status !== 'committed' || !action.operation.operationId || !action.operation.afterFingerprint) continue;
      if (action.capability.rollback?.supported !== true) {
        rollbackFailures.push(`${action.capability.label}: automatic rollback is unavailable`);
        continue;
      }
      try {
        const response = await fetcher('/wp-admin/rollback', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            operationId: action.operation.operationId,
            expectedAfterFingerprint: action.operation.afterFingerprint,
            reason: unavailable ? 'automatic_batch_unavailable' : 'automatic_batch_failure',
          }),
        });
        const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
        if (!response.ok) throw new Error(actionErrorMessage(payload, response.status));
        actions[index] = { ...action, operation: { ...action.operation, status: 'rolled_back' } };
      } catch (rollbackError) {
        rollbackFailures.push(`${action.capability.label}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
    }
    if (rollbackFailures.length) {
      throw new Error(`${failure?.message || unavailable?.message} Automatic rollback could not restore every earlier action: ${rollbackFailures.join('; ')}.`);
    }
    if (unavailable) return { actions, reloadPostId: 0, unavailable };
    const committed = actions.some((action) => action.operation?.status === 'rolled_back');
    throw new Error(`${failure!.message}${committed ? ' Earlier actions in this batch were rolled back.' : ''}`);
  }

  return { actions, reloadPostId };
}

/**
 * Convert committed server operations into the minimal persisted authority
 * needed for one user-visible undo. A non-reversible or incomplete batch still
 * supersedes the previous receipt, but deliberately exposes no Undo control.
 */
export function buildWpAdminRunRollbackReceipt(
  actions: WpAdminActionState[],
  binding: { contextScope: string; conversationId: string; sourceMessageId: string; tabId: string },
  createdAt = Date.now(),
): WpAdminRunRollbackReceipt {
  const operations = actions.map((action) => ({
    operationId: String(action.operation?.operationId || ''),
    afterFingerprint: String(action.operation?.afterFingerprint || ''),
    sessionId: String(action.operation?.sessionId || ''),
    capabilityId: action.capability.id,
    label: action.capability.label,
  }));
  const available = actions.length > 0 && actions.every((action, index) => (
    action.capability.rollback?.supported === true
    && action.operation?.status === 'committed'
    && Boolean(operations[index]?.operationId)
    && Boolean(operations[index]?.afterFingerprint)
    && Boolean(operations[index]?.sessionId)
  ));
  return {
    schema: 'pixflow.wp-admin.run-rollback.v1',
    status: available ? 'available' : 'unavailable',
    contextScope: binding.contextScope,
    conversationId: binding.conversationId,
    sourceMessageId: binding.sourceMessageId,
    tabId: binding.tabId,
    createdAt,
    operations,
  };
}

export function sanitizeWpAdminRunRollbackReceipt(value: unknown): WpAdminRunRollbackReceipt | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const receipt = value as Partial<WpAdminRunRollbackReceipt>;
  const status = String(receipt.status || '') as WpAdminRunRollbackReceipt['status'];
  if (receipt.schema !== 'pixflow.wp-admin.run-rollback.v1'
    || !['available', 'rolled_back', 'failed', 'unavailable'].includes(status)
    || !Array.isArray(receipt.operations)
    || receipt.operations.length > 12) return undefined;
  const operations = receipt.operations.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const operation = entry as Record<string, unknown>;
    const sanitized = {
      operationId: String(operation.operationId || '').slice(0, 191),
      afterFingerprint: String(operation.afterFingerprint || '').slice(0, 191),
      sessionId: String(operation.sessionId || '').slice(0, 191),
      capabilityId: String(operation.capabilityId || '').slice(0, 191),
      label: String(operation.label || '').slice(0, 191),
    };
    return sanitized.operationId && sanitized.afterFingerprint && sanitized.sessionId ? sanitized : null;
  });
  if (status === 'available' && (operations.length === 0 || operations.some((operation) => operation === null))) return undefined;
  return {
    schema: receipt.schema,
    status,
    contextScope: String(receipt.contextScope || '').slice(0, 512),
    conversationId: String(receipt.conversationId || '').slice(0, 191),
    sourceMessageId: String(receipt.sourceMessageId || '').slice(0, 191),
    tabId: String(receipt.tabId || '').slice(0, 191),
    createdAt: Number(receipt.createdAt || 0),
    operations: operations.filter((operation): operation is WpAdminRunRollbackReceipt['operations'][number] => operation !== null),
  };
}

/** Only the newest mutation receipt may own Undo, and only in its bound tab. */
export function latestWpAdminUndoMessageId(
  messages: WpAdminMessage[],
  binding: { contextScope: string; conversationId: string; tabId: string },
): string | null {
  const latestMutation = [...messages].reverse().find((message) => message.role === 'assistant' && message.rollbackReceipt);
  const receipt = sanitizeWpAdminRunRollbackReceipt(latestMutation?.rollbackReceipt);
  if (!latestMutation?.id || !receipt || receipt.status !== 'available') return null;
  if (receipt.operations.length === 0) return null;
  if (receipt.contextScope !== binding.contextScope
    || receipt.conversationId !== binding.conversationId
    || receipt.tabId !== binding.tabId) return null;
  return latestMutation.id;
}

/** Roll a multi-action run back in dependency-safe reverse commit order. */
export async function rollbackWpAdminActionRun(
  receipt: WpAdminRunRollbackReceipt,
  fetcher: WpAdminActionFetcher = pixflowWordPressRestFetch,
): Promise<void> {
  const safeReceipt = sanitizeWpAdminRunRollbackReceipt(receipt);
  if (!safeReceipt || safeReceipt.status !== 'available' || safeReceipt.operations.length === 0) {
    throw new Error('This WordPress run no longer has an available rollback snapshot.');
  }
  for (let index = safeReceipt.operations.length - 1; index >= 0; index -= 1) {
    const operation = safeReceipt.operations[index]!;
    const response = await fetcher('/wp-admin/rollback', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        operationId: operation.operationId,
        expectedAfterFingerprint: operation.afterFingerprint,
        reason: 'manual_user_undo',
        sessionId: operation.sessionId,
        conversationId: safeReceipt.conversationId,
        sourceMessageId: safeReceipt.sourceMessageId,
        tabId: safeReceipt.tabId,
      }),
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || payload?.status !== 'rolled_back') {
      throw new Error(actionErrorMessage(payload, response.status));
    }
  }
}

export function wpAdminAutomaticActionSuccessMessage(actions: WpAdminActionState[]): string {
  const details = actions.map(wpAdminAutomaticActionSuccessDetail);
  if (details.length === 1) return details[0]!;
  return `Completed and verified ${details.length} WordPress changes:\n${details.map((detail) => `- ${detail}`).join('\n')}`;
}

function wpAdminSuccessRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function wpAdminSuccessText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function wpAdminSuccessInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function wpAdminSuccessQuoted(value: unknown): string {
  const text = wpAdminSuccessText(value);
  return text ? `“${text}”` : '';
}

function wpAdminAutomaticActionSuccessDetail(action: WpAdminActionState): string {
  const id = action.capability.id;
  const args = action.initialArguments || {};
  const result = wpAdminSuccessRecord(action.result) || {};
  const snippet = wpAdminSuccessRecord(result.snippet);
  const post = wpAdminSuccessRecord(result.post);
  const beforePost = wpAdminSuccessRecord(result.before);
  const model = wpAdminSuccessRecord(result.model);
  const fieldGroup = wpAdminSuccessRecord(result.fieldGroup);

  if (id === 'pixflow/wp-admin/wpcodebox2/create-snippet' && snippet) {
    const enabled = snippet.enabled === true ? 'enabled' : 'disabled';
    const type = wpAdminSuccessText(snippet.codeTypeLabel) || wpAdminSuccessText(snippet.codeType) || wpAdminSuccessText(args.codeType) || 'code';
    const title = wpAdminSuccessQuoted(snippet.title || args.title) || 'the requested snippet';
    const conditions = Array.isArray(snippet.conditions) ? snippet.conditions.length : 0;
    return `Created the ${enabled} ${type} snippet ${title} in WPCodeBox 2${conditions ? ` with ${conditions} ${conditions === 1 ? 'condition' : 'conditions'}` : ''}. Its saved configuration was read back and verified.`;
  }
  if (id === 'pixflow/wp-admin/wpcodebox2/update-snippet' && snippet) {
    const title = wpAdminSuccessQuoted(snippet.title) || `snippet ${wpAdminSuccessInteger(snippet.id) || wpAdminSuccessInteger(args.snippetId)}`;
    const state = snippet.enabled === true ? 'enabled' : snippet.enabled === false ? 'disabled' : 'unchanged';
    return `Updated the WPCodeBox 2 snippet ${title}; its activation state remains ${state}. The saved code and configuration were read back and verified.`;
  }
  if (id === 'pixflow/wp-admin/wpcodebox2/set-snippet-status' && snippet) {
    const title = wpAdminSuccessQuoted(snippet.title) || `snippet ${wpAdminSuccessInteger(snippet.id) || wpAdminSuccessInteger(args.snippetId)}`;
    return `${snippet.enabled === true ? 'Enabled' : 'Disabled'} the WPCodeBox 2 snippet ${title}. The saved activation state was read back and verified.`;
  }
  if (id === 'pixflow/wp-admin/wpcodebox2/set-snippet-conditions' && snippet) {
    const title = wpAdminSuccessQuoted(snippet.title) || `snippet ${wpAdminSuccessInteger(snippet.id) || wpAdminSuccessInteger(args.snippetId)}`;
    const conditions = Array.isArray(snippet.conditions) ? snippet.conditions.length : 0;
    return `Updated the conditions for the WPCodeBox 2 snippet ${title} to ${conditions} ${conditions === 1 ? 'condition' : 'conditions'}. The saved rules were read back and verified.`;
  }
  if (id === 'pixflow/wp-admin/wpcodebox2/delete-snippet') {
    return `Deleted WPCodeBox 2 snippet ${wpAdminSuccessInteger(args.snippetId) || ''}. The deletion was verified and recorded for audit.`.replace(/snippet \./u, 'snippet.');
  }

  if (id === 'pixflow/wp-admin/gutenberg/apply-document') {
    const postId = wpAdminSuccessInteger(post?.id) || wpAdminSuccessInteger(args.postId);
    const title = wpAdminSuccessQuoted(post?.title || wpAdminSuccessRecord(args.post)?.title);
    return `Updated ${title || (postId ? `post ${postId}` : 'the target post')} in the Block Editor. The saved Gutenberg document and post fields were read back and verified.`;
  }

  if (id === 'pixflow/wp-admin/create-post') {
    const title = wpAdminSuccessQuoted(post?.title || args.title) || 'the requested item';
    const postType = wpAdminSuccessText(post?.postType || post?.type || args.postType) || 'post';
    const status = wpAdminSuccessText(post?.status || args.status) || 'draft';
    return `Created ${title} as a ${status} ${postType}. WordPress returned post ${wpAdminSuccessInteger(post?.id) || 'ID'} and the saved record was verified.`;
  }
  if (id === 'pixflow/wp-admin/update-post') {
    const title = wpAdminSuccessQuoted(post?.title) || `post ${wpAdminSuccessInteger(post?.id) || wpAdminSuccessInteger(args.postId)}`;
    return `Updated ${title} and preserved fields that were not part of the request. The saved WordPress record was read back and verified.`;
  }
  if (id === 'pixflow/wp-admin/trash-post') {
    const postId = wpAdminSuccessInteger(post?.id) || wpAdminSuccessInteger(args.postId);
    const title = wpAdminSuccessQuoted(post?.title || beforePost?.title) || (postId ? `post ${postId}` : 'the requested item');
    const postType = wpAdminSuccessText(post?.postType || post?.type || beforePost?.postType || beforePost?.type) || 'content';
    return `Moved the ${postType} entry ${title}${postId && title !== `post ${postId}` ? ` (post ${postId})` : ''} to Trash. Its final status was read back and verified; attached Media Library items were not deleted.`;
  }
  if (id === 'pixflow/wp-admin/restore-post') {
    const postId = wpAdminSuccessInteger(post?.id) || wpAdminSuccessInteger(result.postId) || wpAdminSuccessInteger(args.postId);
    const title = wpAdminSuccessQuoted(post?.title) || (postId ? `post ${postId}` : 'the requested item');
    const postType = wpAdminSuccessText(post?.postType || post?.type) || 'content';
    const status = wpAdminSuccessText(post?.status) || 'its previous status';
    return `Restored the ${postType} entry ${title}${postId && title !== `post ${postId}` ? ` (post ${postId})` : ''} from Trash as ${status}. Its content and final status were read back and verified.`;
  }

  if (id === 'pixflow/acf/write-values') {
    const target = wpAdminSuccessRecord(result.target);
    const values = wpAdminSuccessRecord(wpAdminSuccessRecord(result.readback)?.values);
    const fields = values ? Object.keys(values) : [];
    const targetId = wpAdminSuccessInteger(target?.id);
    return `Updated ${fields.length ? fields.map((field) => `“${field}”`).join(', ') : 'the requested ACF fields'}${targetId ? ` on post ${targetId}` : ''}. The saved values were read back and verified without changing unrelated fields.`;
  }
  if (id === 'pixflow/acf/create-post-type' || id === 'pixflow/acf/create-taxonomy') {
    const kind = id.endsWith('create-post-type') ? 'post type' : 'taxonomy';
    const title = wpAdminSuccessQuoted(model?.title || model?.name || args.title || args.name) || 'the requested model';
    const slug = wpAdminSuccessText(model?.slug || model?.key || args.slug);
    return `Created the ${title} ${kind}${slug ? ` with slug “${slug}”` : ''}. Its registered model and saved configuration were verified.`;
  }
  if (id === 'pixflow/acf/create-field-group' && fieldGroup) {
    const title = wpAdminSuccessQuoted(fieldGroup.title || args.title) || 'the requested field group';
    const fields = Array.isArray(fieldGroup.fields) ? fieldGroup.fields.length : Array.isArray(args.fields) ? args.fields.length : 0;
    return `Created the ACF field group ${title}${fields ? ` with ${fields} ${fields === 1 ? 'field' : 'fields'}` : ''}. Its location rules and saved schema were verified.`;
  }

  if (id === 'pixflow/wp-admin/code/create-plugin' || id === 'pixflow/wp-admin/code/create-mu-plugin' || id === 'pixflow/wp-admin/code/create-child-theme') {
    const projectType = id.endsWith('create-plugin') ? 'plugin' : id.endsWith('create-mu-plugin') ? 'MU plugin' : 'child theme';
    const name = wpAdminSuccessQuoted(result.name || args.name) || 'the requested project';
    const slug = wpAdminSuccessText(result.slug || args.slug);
    const files = Array.isArray(args.files) ? args.files.length + 1 : 1;
    const state = projectType === 'MU plugin' ? 'loaded as an always-on MU plugin' : 'left inactive';
    return `Created the ${projectType} ${name}${slug ? ` (“${slug}”)` : ''} with ${files} ${files === 1 ? 'file' : 'files'} and ${state}. The generated project was validated and read back from WordPress.`;
  }
  if (id === 'pixflow/wp-admin/code/write-plugin-file' || id === 'pixflow/wp-admin/code/write-child-theme-file' || id === 'pixflow/wp-admin/code/write-mu-plugin-file') {
    const file = wpAdminSuccessQuoted(result.file || args.file) || 'the requested file';
    const slug = wpAdminSuccessQuoted(result.slug || args.slug);
    return `Updated ${file}${slug ? ` in ${slug}` : ''}. The file passed validation and its saved fingerprint was verified.`;
  }
  if (id === 'pixflow/wp-admin/code/write-child-theme-files' || id === 'pixflow/wp-admin/code/write-mu-plugin-files') {
    const files = Array.isArray(args.files) ? args.files.length : 0;
    const slug = wpAdminSuccessQuoted(result.slug || args.slug);
    const project = id.endsWith('write-mu-plugin-files') ? 'MU plugin' : 'child theme';
    return `Updated ${files || 'the requested'} ${files === 1 ? 'file' : 'files'}${slug ? ` in ${project} ${slug}` : ` in the ${project}`}. Every saved file passed validation and fingerprint verification.`;
  }

  const target = wpAdminSuccessQuoted(post?.title || model?.title || fieldGroup?.title || result.title || args.title || args.name);
  return `${action.capability.label} completed${target ? ` for ${target}` : ''}. The saved result was read back and verified.`;
}

function canonicalWpAdminIdempotencyValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalWpAdminIdempotencyValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonicalWpAdminIdempotencyValue(item)]));
}

/**
 * Preserve the complete read identity inside a bounded server key. Truncating
 * long site/session scopes can remove the per-turn suffix and alias unrelated
 * dependent reads, so the bounded key carries a digest of the full identity.
 */
export async function wpAdminReadIdempotencyKey(
  sessionId: string,
  capabilityId: string,
  argumentsValue: Record<string, unknown>,
): Promise<string> {
  const digest = await hashSourceText(JSON.stringify(canonicalWpAdminIdempotencyValue({
    sessionId,
    capabilityId,
    arguments: argumentsValue,
  })));
  return `wp-admin-read:${digest}`;
}

async function executeWpAdminReadOnlyCapability(
  capabilityId: string,
  sessionId: string,
  argumentsValue: Record<string, unknown> = {},
  contextBinding?: PixflowWpAdminContextAuthorityBinding,
): Promise<unknown | null> {
  const response = await pixflowWordPressRestFetch('/wp-admin/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      surface: 'wp_admin',
      sessionId,
      mode: 'ask',
      capabilityId,
      arguments: argumentsValue,
      ...(contextBinding ? { contextBinding } : {}),
      idempotencyKey: await wpAdminReadIdempotencyKey(sessionId, capabilityId, argumentsValue),
    }),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(actionErrorMessage(payload, response.status));
  }
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'result')) return null;
  const result = payload.result;
  if (capabilityId === 'pixflow/wp-admin/gutenberg/read-document') {
    const document = result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : {};
    const postId = Number(argumentsValue.postId || 0);
    if (document.readMode === 'inline' && document.contentComplete === true && document.blockTreeComplete === true
      && Number((document.post as Record<string, unknown> | undefined)?.id || 0) === postId
      && typeof document.contentRaw === 'string' && document.contentRaw.trim()) {
      try {
        const blocks = await canonicalizeGutenbergReadBlocks(postId, `canonical-read:${sessionId}`.slice(0, 160), document.contentRaw);
        return { ...document, blocks, blockTreeSource: 'target_editor', browserCanonicalized: true };
      } catch {
        return { ...document, browserCanonicalized: false };
      }
    }
    return document;
  }
  if (!['pixflow/wp-admin/gutenberg/list-block-types', 'pixflow/wp-admin/gutenberg/get-block-type'].includes(capabilityId)) return result;
  const postId = Number(argumentsValue.postId || 0);
  if (!Number.isInteger(postId) || postId < 1) return result;
  try {
    const discovered = await discoverGutenbergBlockTypes(postId, `discover:${sessionId}`.slice(0, 160));
    const serverResult = result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : {};
    const serverItems = Array.isArray(serverResult.items)
      ? serverResult.items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      : serverResult.block && typeof serverResult.block === 'object'
        ? [serverResult.block as Record<string, unknown>]
        : [];
    const serverByName = new Map(serverItems.map((item) => [String(item.name || ''), item]));
    const merged: Array<Record<string, unknown>> = discovered.map((item): Record<string, unknown> => {
      const server = serverByName.get(String(item.name || ''));
      return {
        ...item,
        ...(server || {}),
        browserRegistered: true,
        serverRegistered: Boolean(server),
        support: server?.support || { level: 'runtime_validation_required', adapter: null, certified: false },
      };
    });
    if (capabilityId.endsWith('/get-block-type')) {
      const name = String(argumentsValue.name || '');
      return { ...serverResult, block: merged.find((item) => item.name === name) || null, requestedName: name, serverRegistryOnly: false, browserDiscoveryRequired: false };
    }
    const search = String(argumentsValue.search || '').trim().toLowerCase();
    const perPage = Math.max(1, Math.min(Number(argumentsValue.perPage || 200), 500));
    const items = merged.filter((item) => !search || `${String(item.name || '')} ${String(item.title || '')}`.toLowerCase().includes(search)).slice(0, perPage);
    return { ...serverResult, items, serverRegistryOnly: false, browserDiscoveryRequired: false, browserRegisteredBlockCount: discovered.length };
  } catch {
    return result;
  }
}

async function hydrateWpAdminBatchFileFingerprints(
  capabilityId: string,
  proposedArguments: Record<string, unknown> | undefined,
  sessionId: string,
): Promise<Record<string, unknown> | undefined> {
  if (!proposedArguments || ![
    'pixflow/wp-admin/code/write-child-theme-files',
    'pixflow/wp-admin/code/write-mu-plugin-files',
  ].includes(capabilityId)) return proposedArguments;
  const normalized = normaliseReviewArguments(capabilityId, proposedArguments);
  if (!Array.isArray(normalized.files)) return normalized;
  const slug = String(normalized.slug || '');
  const projectType = capabilityId.endsWith('write-mu-plugin-files') ? 'mu_plugin' : 'child_theme';
  const liveFiles: Array<{ file: string; fingerprint: string }> = [];
  for (let index = 0; index < normalized.files.length; index += 1) {
    const entry = normalized.files[index];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const file = String((entry as Record<string, unknown>).file || '');
    if (!slug || !file) continue;
    try {
      const result = await executeWpAdminReadOnlyCapability(
        'pixflow/wp-admin/code/read-file',
        `${sessionId}:${index}`,
        { projectType, slug, file },
      );
      const record = result && typeof result === 'object' && !Array.isArray(result)
        ? result as Record<string, unknown>
        : null;
      if (record?.file === file && typeof record.fingerprint === 'string') {
        liveFiles.push({ file, fingerprint: record.fingerprint });
      }
    } catch {
      // Leave the model-supplied value untouched; the safety plane will reject
      // any stale or missing fingerprint rather than guessing.
    }
  }
  return mergeWpAdminBatchFileFingerprints(normalized, liveFiles);
}

async function hydrateWpAdminJetEngineModelProposal(
  capabilityId: string,
  proposedArguments: Record<string, unknown> | undefined,
  sessionId: string,
): Promise<Record<string, unknown> | undefined> {
  if (!proposedArguments || !/^pixflow\/wp-admin\/jetengine\/update-(?:post-type|taxonomy|meta-box|options-page)$/.test(capabilityId)) {
    return proposedArguments;
  }
  const modelType = capabilityId.endsWith('/update-post-type') ? 'post_type'
    : capabilityId.endsWith('/update-taxonomy') ? 'taxonomy'
      : capabilityId.endsWith('/update-meta-box') ? 'meta_box'
        : 'options_page';
  try {
    const result = await executeWpAdminReadOnlyCapability(
      'pixflow/wp-admin/jetengine/list-models',
      `${sessionId}:jetengine-model`,
      { modelType, perPage: 50 },
    );
    if (result === null) return proposedArguments;
    return mergeWpAdminJetEngineModelIdentity(capabilityId, proposedArguments, [{
      capabilityId: 'pixflow/wp-admin/jetengine/list-models',
      result,
    }]);
  } catch {
    return proposedArguments;
  }
}

async function hydrateWpAdminJetEngineCctRecordProposal(
  capabilityId: string,
  proposedArguments: Record<string, unknown> | undefined,
  sessionId: string,
): Promise<Record<string, unknown> | undefined> {
  if (!proposedArguments || !/^pixflow\/wp-admin\/jetengine\/(?:update|delete)-cct-record$/.test(capabilityId)) return proposedArguments;
  const normalized = normaliseReviewArguments(capabilityId, proposedArguments);
  const slug = String(normalized.slug || '');
  if (!slug) return normalized;
  try {
    const result = await executeWpAdminReadOnlyCapability(
      'pixflow/wp-admin/jetengine/list-cct-records',
      `${sessionId}:jetengine-cct-record`,
      { slug, page: 1, perPage: 50 },
    );
    const recordResult = result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : null;
    const records = Array.isArray(recordResult?.records)
      ? recordResult.records.filter((record): record is Record<string, unknown> => Boolean(record && typeof record === 'object' && !Array.isArray(record)))
      : [];
    const record = records.find((item) => Number(item.id) === Number(normalized.recordId)) || (records.length === 1 ? records[0] : undefined);
    if (!record) return normalized;
    return {
      ...normalized,
      ...(normalized.recordId === undefined && Number(record.id) > 0 ? { recordId: Number(record.id) } : {}),
      ...(normalized.expectedFingerprint === undefined && typeof record.fingerprint === 'string' ? { expectedFingerprint: record.fingerprint } : {}),
    };
  } catch {
    return normalized;
  }
}

const ACTION_ARGUMENT_LABELS: Record<string, string> = {
  name: 'Name',
  slug: 'Slug',
  description: 'Description',
  parentSlug: 'Parent theme',
  file: 'File',
  projectType: 'Project type',
  postId: 'Post',
  postType: 'Content type',
  status: 'Status',
  title: 'Title',
  settings: 'Settings',
};

function actionArgumentLabel(key: string): string {
  return ACTION_ARGUMENT_LABELS[key]
    || key.replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
}

export function actionArgumentValue(value: unknown, key = ''): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (key === 'conditions' && Array.isArray(value)) {
    const conditionCount = value.reduce((total, group) => total + (group && typeof group === 'object' && !Array.isArray(group) && Array.isArray((group as Record<string, unknown>).conditions) ? ((group as Record<string, unknown>).conditions as unknown[]).length : 0), 0);
    return `${value.length} ${value.length === 1 ? 'group' : 'groups'}, ${conditionCount} ${conditionCount === 1 ? 'condition' : 'conditions'}`;
  }
  if (Array.isArray(value)) return value.map((item) => actionArgumentValue(item)).join(', ');
  if (value && typeof value === 'object') return safeActionJson(value);
  return String(value ?? '');
}

export function wpAdminActionExecutionSessionId(
  capabilityId: string,
  argumentsValue: Record<string, unknown>,
  fallbackSessionId: string,
): string {
  if (capabilityId !== 'pixflow/wp-admin/gutenberg/apply-document') return fallbackSessionId;
  const preparedSessionId = String(argumentsValue.preparedSessionId || '').trim();
  return preparedSessionId && preparedSessionId.length <= 160
    ? preparedSessionId
    : fallbackSessionId;
}

type WpAdminActionFilePreview = {
  name: string;
  content: string;
};

function wpAdminPluginPreviewSource(argumentsValue: Record<string, unknown>, mustUse: boolean): string {
  const name = String(argumentsValue.name || 'Pixflow Plugin').trim();
  const description = String(argumentsValue.description || 'Managed by Pixflow Design.').trim() || 'Managed by Pixflow Design.';
  const body = String(argumentsValue.content || '').trim()
    .replace(/^<\?php\s*/, '')
    .replace(/^\s*\/\*\*[\s\S]*?Plugin Name\s*:[\s\S]*?\*\/\s*/i, '');
  const owner = mustUse ? 'MU Plugin' : 'Plugin';
  return `<?php\n/**\n * Plugin Name: ${name}\n * Description: ${description}\n * Version: 1.0.0\n * ${owner} Owner: Pixflow Design\n * Pixflow Managed: true\n */\n\ndeclare(strict_types=1);\n${body ? `\n${body}\n` : ''}`;
}

function wpAdminMuPluginPreviewArguments(
  argumentsValue: Record<string, unknown>,
  slug: string,
  companionFiles: WpAdminActionFilePreview[],
): Record<string, unknown> {
  if (!slug || companionFiles.length === 0) return argumentsValue;
  const companionPaths = new Set(companionFiles.map((file) => file.name));
  const content = String(argumentsValue.content || '').replace(
    /(__DIR__\s*\.\s*)(['"])\/([A-Za-z0-9][A-Za-z0-9._/-]*\.php)\2/gi,
    (match, prefix: string, quote: string, relative: string) => {
      if (relative.startsWith(`${slug}/`) || !companionPaths.has(relative)) return match;
      return `${prefix}${quote}/${slug}/${relative}${quote}`;
    },
  );
  return { ...argumentsValue, content };
}

export function wpAdminActionFilePreviews(capabilityId: string, argumentsValue: Record<string, unknown>): WpAdminActionFilePreview[] {
  const slug = String(argumentsValue.slug || '').trim();
  const explicitFiles = argumentsValue.files;
  let companionFiles: WpAdminActionFilePreview[] = [];
  if (explicitFiles && typeof explicitFiles === 'object' && !Array.isArray(explicitFiles)) {
    companionFiles = Object.entries(explicitFiles as Record<string, unknown>)
      .flatMap(([name, value]) => {
        if (typeof value === 'string') return [{ name, content: value }];
        if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
        const candidate = value as Record<string, unknown>;
        const file = String(candidate.file || candidate.path || candidate.name || name).trim();
        return file && typeof candidate.content === 'string' ? [{ name: file, content: candidate.content }] : [];
      });
  }
  if (Array.isArray(explicitFiles)) {
    companionFiles = explicitFiles.flatMap((file) => {
      if (!file || typeof file !== 'object') return [];
      const candidate = file as Record<string, unknown>;
      const name = String(candidate.file || candidate.path || candidate.name || '').trim();
      return name && typeof candidate.content === 'string' ? [{ name, content: candidate.content }] : [];
    });
  }

  const content = String(argumentsValue.content || '');
  if (capabilityId.startsWith('pixflow/wp-admin/wpcodebox2/') && typeof argumentsValue.code === 'string') {
    const title = String(argumentsValue.title || `snippet-${argumentsValue.snippetId || 'draft'}`).trim() || 'snippet';
    const extensions: Record<string, string> = { php: 'php', css: 'css', scss: 'scss', less: 'less', scssp: 'scss', js: 'js', html: 'html', ex_css: 'url', ex_js: 'url', txt: 'txt', md: 'md', json: 'json' };
    const extension = extensions[String(argumentsValue.codeType || '')] || 'txt';
    return [{ name: `${title}.${extension}`, content: String(argumentsValue.code) }];
  }
  if (capabilityId === 'pixflow/wp-admin/code/create-child-theme') {
    const name = String(argumentsValue.name || slug || 'Pixflow Child Theme').trim();
    const parentSlug = String(argumentsValue.parentSlug || '').trim();
    const description = String(argumentsValue.description || 'Managed by Pixflow Design.').trim();
    const companionByName = new Map(companionFiles.map((file) => [file.name, file.content]));
    const baseFiles = [
      {
        name: `${slug || 'child-theme'}/style.css`,
        content: `/*\nTheme Name: ${name}\nTemplate: ${parentSlug}\nDescription: ${description}\nPixflow Managed: true\nVersion: 1.0.0\n*/\n`,
      },
      {
        name: `${slug || 'child-theme'}/functions.php`,
        content: companionByName.get('functions.php') || `<?php\n/**\n * ${name} child-theme functions.\n * Pixflow Managed: true\n */\n\ndeclare(strict_types=1);\n`,
      },
    ];
    return [...baseFiles, ...companionFiles
      .filter((file) => !['style.css', 'functions.php'].includes(file.name))
      .map((file) => ({ ...file, name: `${slug || 'child-theme'}/${file.name}` }))];
  }
  if (capabilityId === 'pixflow/wp-admin/code/create-plugin') {
    return [
      { name: `${slug || 'plugin'}/${slug || 'plugin'}.php`, content: wpAdminPluginPreviewSource(argumentsValue, false) },
      ...companionFiles.map((file) => ({ ...file, name: `${slug || 'plugin'}/${file.name}` })),
    ];
  }
  if (capabilityId === 'pixflow/wp-admin/code/create-mu-plugin') {
    const previewArguments = wpAdminMuPluginPreviewArguments(argumentsValue, slug, companionFiles);
    return [
      { name: `${slug || 'mu-plugin'}.php`, content: wpAdminPluginPreviewSource(previewArguments, true) },
      ...companionFiles.map((file) => ({ ...file, name: `${slug || 'mu-plugin'}/${file.name}` })),
    ];
  }
  if (capabilityId.endsWith('-files')) return companionFiles;
  if (capabilityId.startsWith('pixflow/wp-admin/code/write-') && typeof argumentsValue.file === 'string') {
    return [{ name: argumentsValue.file, content }];
  }
  return [];
}

export function WpAdminAgentFrameApp({ initialConfig }: { initialConfig?: AppConfig } = {}) {
  usePixflowFeatureRuntime();
  usePixflowLicenseRefresh();
  const translateUi = usePixflowUiTranslation();
  const runtime = useMemo(runtimeConfig, []);
  const handoffBuilder = runtime.context?.editor === 'etch' ? 'etch' : runtime.context?.editor === 'elementor' ? 'elementor' : 'gutenberg';
  const [persistenceSurface] = useState(() => builderHandoffPersistenceSurface(handoffBuilder));
  const t = useT();
  const [tabId] = useState(wpAdminTabId);
  const [config, setConfig] = useState<AppConfig>(() => initialConfig ?? safeConfig(runtime.appConfig));
  const bridgeUpdateState = usePixflowBridgeUpdateState({
    active: true,
    enabled: true,
    mode: config.mode,
    requiredVersion: runtime.bridgeRequiredVersion ?? runtime.bridge?.requiredVersion,
  });
  const [context, setContext] = useState<WpAdminContext>(runtime.context || {});
  const contextRef = useRef<WpAdminContext>(runtime.context || {});
  const contextIdentity = useMemo(() => buildWpAdminContextIdentity(context, tabId), [context, tabId]);
  const [contextAuthority, setContextAuthority] = useState<string>('');
  const [families, setFamilies] = useState<PixflowCapabilityFamilySummary[]>([]);
  const [skills, setSkills] = useState<PixflowWpAdminSkillSummary[]>([]);
  const [lockedSkills, setLockedSkills] = useState<LockedSkillSummary[]>([]);
  const [skillBranches, setSkillBranches] = useState<PixflowWpAdminSkillSummary[]>([]);
  const [mentions, setMentions] = useState<PixflowWpAdminMention[]>([]);
  const [memoryIndex, setMemoryIndex] = useState<Array<{ id: string; type: string; name: string; description: string }>>([]);
  const [agents, setAgents] = useState<AgentInfo[]>(() => (
    filterWpAdminAgents(readCachedPixflowOptionalBridgeAgents())
  ));
  const [streaming, setStreaming] = useState(false);
  const siteAccess = useSiteAccess(streaming);
  const [contextStatus, setContextStatus] = useState<'loading' | 'ready' | 'unavailable'>(
    runtime.context && Object.keys(runtime.context).length > 0 ? 'ready' : 'loading',
  );
  const [mode, setMode] = useState<ChatSessionMode>(() => restoreWpAdminSessionMode(runtime));
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('execution');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const composerRef = useRef<SharedChatComposerHandle | null>(null);
  useResourceDraft(composerRef);
  const ensureDirectAttachmentProject = useDirectAttachmentProject();
  const logRef = useRef<HTMLDivElement | null>(null);
  const tailSpacerRef = useRef<HTMLDivElement | null>(null);
  const sessionKey = siteAccess.guarded ? contextStorageKey(runtime, contextIdentity) : builderHandoffConversationKey(`pixflow-direct:${contextSiteHash(runtime)}:${contextUserId(context)}`, persistenceSurface, handoffBuilder);
  const pendingActionKey = siteAccess.guarded ? pendingActionStorageKey(runtime, contextIdentity) : `${sessionKey}:actions`;
  const pendingClarificationKey = siteAccess.guarded ? pendingClarificationStorageKey(runtime, contextIdentity) : `${sessionKey}:clarification`;
  const [messages, setMessages] = useState<WpAdminMessage[]>(() => restoreMessages(sessionKey, persistenceSurface));
  const [directQuestion, setDirectQuestion] = useState<QuestionFormOpenRequest | null>(null);
  useEffect(() => { setDirectQuestion(null); }, [sessionKey]);
  const [hydratedSessionKey, setHydratedSessionKey] = useState(sessionKey);
  const legacyHistory = useMemo(() => readRawWpAdminHistory(sessionKey), [sessionKey]);
  const durableHistory = useDurableChatHistory({ sessionKey, messages, legacyMessages: legacyHistory, onHydrate: setMessages, enabled: hydratedSessionKey === sessionKey, scrollRef: logRef });
  const directSessionKeyRef = useRef(sessionKey);
  directSessionKeyRef.current = sessionKey;
  const reattachedDirectRunRef = useRef('');
  const lastHydratedSessionKeyRef = useRef<string | null>(null);
  const [scrolledFromBottom, setScrolledFromBottom] = useState(false);
  const [chatLogScrollable, setChatLogScrollable] = useState(false);
  const contextUrl = runtime.contextUrl || '';
  const abortRef = useRef<AbortController | null>(null);
  const stopRunRef = useRef<(() => void) | null>(null);
  const memoryInput = useMemo<WpAdminWorkingMemoryInput>(() => ({
    siteHash: contextSiteHash(runtime), userId: contextUserId(context), conversationId: sessionKey, context,
  // Working-memory storage is object-scoped. A revision refresh for the same
  // object must not replace the live transcript while a run is streaming.
  // Mutation state is invalidated separately below when the revision changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [runtime, sessionKey]);
  const [workingMemory, setWorkingMemory] = useState(() => loadWpAdminWorkingMemory(memoryInput));
  const [, setPendingActions] = useState<WpAdminActionState[]>([]);
  const [undoingMessageId, setUndoingMessageId] = useState<string | null>(null);
  const [pendingClarification, setPendingClarification] = useState<PixflowWpAdminPendingClarification | null>(() => restorePendingClarification(pendingClarificationKey));
  const composerSlotRef = useRef<HTMLDivElement | null>(null);
  const composerLayerRef = useRef<HTMLDivElement | null>(null);
  const workspaceContexts = useMemo(() => buildWpAdminWorkspaceContexts(context, contextStatus), [context, contextStatus]);
  const activeWorkspaceContext = workspaceContexts[0] || null;
  const selectedAgent = useMemo(() => selectedAdminAgent(config, agents), [agents, config]);
  const selectedReadinessModel = selectedAgent ? selectedModel(config, selectedAgent).model : undefined;
  const readinessBridgeStatusSignatureRef = useRef('');
  const fallbackAgentIdentity = useMemo(
    () => wpAdminAgentIdentity(config, agents),
    [agents, config],
  );

  const selectSessionMode = useCallback((nextMode: ChatSessionMode) => {
    setMode(nextMode);
    persistWpAdminSessionMode(runtime, nextMode);
  }, [runtime]);

  useEffect(() => { contextRef.current = context; }, [context]);
  const authorityRevisionRef = useRef<string>('');

  useEffect(() => {
    const revision = contextIdentity?.contextRevision || '';
    const previous = authorityRevisionRef.current;
    authorityRevisionRef.current = revision;
    if (siteAccess.guarded && previous && revision && previous !== revision) {
      abortRef.current?.abort();
      setPendingActions([]);
      setPendingClarification(null);
    }
  }, [siteAccess.guarded, contextIdentity?.contextRevision]);

  useAppearance(config.theme, config.accentColor);

  useEffect(() => {
    const applyPatch = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      if (!detail || typeof detail !== 'object') return;
      // Live settings changes are authoritative. Startup's local-preference
      // fallback can be stale (or unwritable when storage is full).
      setConfig((current) => mergeWpAdminRuntimeConfig(detail, current, false) as AppConfig);
    };
    window.addEventListener('pixflow-design:app-config-changed', applyPatch);
    window.addEventListener('open-design:app-config-changed', applyPatch);
    return () => {
      window.removeEventListener('pixflow-design:app-config-changed', applyPatch);
      window.removeEventListener('open-design:app-config-changed', applyPatch);
    };
  }, []);

  useEffect(() => subscribePixflowSharedAppConfigNotifications((notification) => {
    setConfig((current) => mergeWpAdminRuntimeConfig(notification.patch, current, false) as AppConfig);
  }), []);

  useEffect(() => {
    if (config.mode !== 'daemon') return;
    const warm = (force = false) => {
      if (!selectedAgent?.id) return;
      void warmSelectedAgentReadiness({
        mode: config.mode,
        agentId: selectedAgent.id,
        model: selectedReadinessModel,
        force,
      }).then((readiness) => {
        if (!readiness) return;
        setAgents((current) => [
          ...current.filter((agent) => agent.id !== readiness.agent.id),
          readiness.agent,
        ]);
      });
    };
    const onFocus = () => warm();
    const onBridgeStatus = (event: Event) => {
      const status = (event as CustomEvent<unknown>).detail;
      const signature = agentReadinessBridgeStatusSignature(status);
      if (readinessBridgeStatusSignatureRef.current === signature) return;
      readinessBridgeStatusSignatureRef.current = signature;
      if (!bridgeStatusCanWarmAgentReadiness(status)) return;
      void fetchPixflowOptionalBridgeAgents({ force: true }).then((next) => {
        setAgents(filterWpAdminAgents(next));
      }).catch(() => { /* Discovery status displays the failed refresh; retain saved providers. */ });
    };
    warm();
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onFocus);
    window.addEventListener('pixflow-design:bridge-status', onBridgeStatus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onFocus);
      window.removeEventListener('pixflow-design:bridge-status', onBridgeStatus);
    };
  }, [config.mode, selectedAgent?.id, selectedReadinessModel]);

  useEffect(() => {
    const onContext = (event: Event) => {
      const detail = (event as CustomEvent<WpAdminContext>).detail;
      if (!detail || typeof detail !== 'object') return;
      setContext((current) => (hasUsableWpAdminContext(detail) || !hasUsableWpAdminContext(current)) ? detail : current);
      setContextStatus('ready');
    };
    window.addEventListener('pixflow-design:wp-admin-context', onContext);
    return () => window.removeEventListener('pixflow-design:wp-admin-context', onContext);
  }, []);

  useEffect(() => {
    // Runtime/context props can refresh while the same conversation is streaming.
    // Only an ownership change replaces its transcript or stops its process.
    if (lastHydratedSessionKeyRef.current === sessionKey) return;
    lastHydratedSessionKeyRef.current = sessionKey;
    abortRef.current?.abort();
    setMessages(restoreMessages(sessionKey, persistenceSurface));
    setWorkingMemory(loadWpAdminWorkingMemory(memoryInput));
    setPendingActions([]);
    setPendingClarification(restorePendingClarification(pendingClarificationKey));
    setHydratedSessionKey(sessionKey);
  }, [memoryInput, pendingActionKey, pendingClarificationKey, sessionKey]);

  useEffect(() => {
    if (hydratedSessionKey !== sessionKey) return;
    persistMessages(sessionKey, messages, config.mode, durableHistory.acknowledged);
    if (!logRef.current || scrolledFromBottom) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [hydratedSessionKey, messages, sessionKey, config.mode, durableHistory.acknowledged]);

  useEffect(() => onToolHistoryCleared(() => setMessages(clearCompletedToolEvents)), []);

  useEffect(() => {
    // Manual review cards were retired. Clear any legacy persisted review so
    // it can never become hidden mutation authority after an upgrade.
    persistPendingActions(pendingActionKey, []);
  }, [pendingActionKey]);

  useEffect(() => {
    persistPendingClarification(pendingClarificationKey, pendingClarification);
  }, [pendingClarification, pendingClarificationKey]);

  const refreshContext = useCallback(async (): Promise<{ context: WpAdminContext; authority: string } | null> => {
    if (!contextUrl) {
      // Native editor modules deliberately retain their document bootstrap.
      // Readiness is UI state only; receipt claims and live canvas checks still
      // authorize every handoff, and no admin action authority is fabricated.
      setContextStatus(wpAdminBootstrapContextStatus(contextRef.current));
      return null;
    }
    setContextStatus('loading');
    try {
      const url = new URL(contextUrl, window.location.href);
      const currentContext = contextRef.current;
      const screen = currentContext.screen && typeof currentContext.screen === 'object' ? currentContext.screen as Record<string, unknown> : {};
      const object = currentContext.object && typeof currentContext.object === 'object' ? currentContext.object as Record<string, unknown> : {};
      const browserPostId = Number(new URL(window.location.href).searchParams.get('post') || 0);
      url.searchParams.set('tabId', tabId);
      if (browserPostId > 0) url.searchParams.set('postId', String(browserPostId));
      else if (Number(object.id || 0) > 0 && object.kind === 'post') url.searchParams.set('postId', String(object.id));
      if (String(object.type || screen.postType || '')) url.searchParams.set('postType', String(object.type || screen.postType));
      if (String(screen.id || '')) url.searchParams.set('screenId', String(screen.id));
      if (String(screen.base || '')) url.searchParams.set('base', String(screen.base));
      const response = await fetch(url.toString(), {
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'X-WP-Nonce': String(runtime.restNonce || '') },
        cache: 'no-store',
      });
      if (!response.ok) {
        setContextStatus('unavailable');
        return null;
      }
      const payload = await response.json().catch(() => null) as {
        context?: WpAdminContext;
        contextAuthority?: { token?: string } | null;
      } | null;
      if (payload?.context) {
        const authority = String(payload.contextAuthority?.token || '');
        setContext(payload.context);
        setContextAuthority(authority);
        setContextStatus('ready');
        return { context: payload.context, authority };
      } else {
        setContextStatus('unavailable');
      }
    } catch {
      setContextStatus('unavailable');
    }
    return null;
  }, [contextUrl, runtime.restNonce, tabId]);

  useEffect(() => {
    void refreshContext();
  }, [refreshContext]);

  useEffect(() => {
    if(!siteAccess.ready || !!siteAccess.error || siteAccess.guarded || abortRef.current || hydratedSessionKey!==sessionKey || !durableHistory.ready)return;
    const pending=pendingDirectSiteRun(persistenceSurface);
    const metadata=pending?.metadata as {messages?:WpAdminMessage[];messageId?:string;sessionKey?:string;mode?:string;handoff?:BuilderHandoffExecution['receipt']}|undefined;
    if(!pending || !metadata?.messages || !metadata.messageId || metadata.sessionKey!==sessionKey || reattachedDirectRunRef.current===pending.connection.id)return;
    reattachedDirectRunRef.current=pending.connection.id;
    const controller=new AbortController();abortRef.current=controller;stopRunRef.current=()=>controller.abort();
    const owner=sessionKey;
    let content='';let events:AgentEvent[]=[];
    let terminalAt: number | undefined;
    setMessages(current=>recoverDirectRunMessages(current,metadata.messages!,metadata.messageId!));setStreaming(true);
    void runDirectSite({config,agentId:'',prompt:'',history:[],mode:metadata.mode||'design',resume:pending,persistenceSurface,signal:controller.signal,
      onOutcome: (_outcome, endedAt) => { terminalAt=endedAt; },
      onUpdate:(next,nextEvents)=>{
        content=next;events=nextEvents;
        if(directSessionKeyRef.current===owner)setMessages(current=>current.map(message=>message.id===metadata.messageId?{...message,content,events,status:'streaming',runStatus:'running'}:message));
      },
    }).then(async outcome=>{
      if(directSessionKeyRef.current===owner)setMessages(current=>current.map(message=>message.id===metadata.messageId?{...message,status:'complete',runStatus:'succeeded',awaitingInput:outcome==='awaiting_input',endedAt:terminalAt ?? Date.now()}:message));
      if (metadata.handoff) await finishBuilderHandoffReceipt(metadata.handoff, undefined, outcome === 'awaiting_input').catch(error => setMessages(current => [...current, { id: `handoff-status:${Date.now()}`, role: 'assistant', content: error instanceof Error ? error.message : String(error), createdAt: Date.now() }]));
    }).catch(async error=>{
      if(directSessionKeyRef.current!==owner)return;
      const status=controller.signal.aborted?'canceled':directRunStatus(error);
      const message=controller.signal.aborted?'Stopped. Changes already applied are retained.':error instanceof Error?error.message:String(error);
      setMessages(current=>current.map(item=>item.id===metadata.messageId?{...item,content:[content,message].filter(Boolean).join('\n\n'),events:[...events,{kind:'text',text:'\n\n'+message}],status:status==='failed'?'error':'complete',runStatus:status,endedAt:terminalAt ?? Date.now()}:item));
      if (metadata.handoff && status !== 'interrupted') await finishBuilderHandoffReceipt(metadata.handoff, message).catch(() => undefined);
    }).finally(()=>{
      if(abortRef.current===controller){abortRef.current=null;stopRunRef.current=null;setStreaming(false);}
      void refreshContext();
    });
  },[siteAccess.ready,siteAccess.error,siteAccess.guarded,hydratedSessionKey,sessionKey,durableHistory.ready,refreshContext]);

  const readExplicitTargetContext = useCallback(async (postId: number, postType: string) => {
    if (!contextUrl || postId <= 0) return null;
    try {
      const url = new URL(contextUrl, window.location.href);
      url.searchParams.set('tabId', tabId);
      url.searchParams.set('postId', String(postId));
      url.searchParams.set('postType', postType || 'post');
      url.searchParams.set('screenId', postType || 'post');
      url.searchParams.set('base', 'post');
      url.searchParams.set('targetProvenance', 'explicit_user_target');
      const response = await fetch(url.toString(), {
        credentials: 'same-origin', cache: 'no-store',
        headers: { Accept: 'application/json', 'X-WP-Nonce': String(runtime.restNonce || '') },
      });
      const payload = response.ok ? await response.json().catch(() => null) as {
        context?: WpAdminContext;
        contextAuthority?: { token?: string } | null;
      } | null : null;
      const targetContext = payload?.context || null;
      const identity = buildWpAdminContextIdentity(targetContext, tabId);
      const authority = String(payload?.contextAuthority?.token || '');
      return targetContext && identity && authority ? { context: targetContext, identity, authority } : null;
    } catch {
      return null;
    }
  }, [contextUrl, runtime.restNonce, tabId]);

  useEffect(() => {
    let cancelled = false;
    const loadSurfaceCatalogues = async () => {
      void fetchPixflowOptionalBridgeAgents()
        .then((next) => {
          if (!cancelled) setAgents(filterWpAdminAgents(next));
        })
        .catch(() => undefined);
      const [capabilityResult, skillResult, promptSkillResult, memoryResult] = await Promise.allSettled([
        pixflowWordPressRestFetch('/wp-admin/capabilities', { cache: 'no-store' })
          .then((response) => response.ok ? response.json() : null),
        pixflowRuntimeFetch('/api/skills', { cache: 'no-store' })
          .then((response) => response.ok ? response.json() : null),
        pixflowWordPressRestFetch('/pixflow-mcp/prompt-skills', { cache: 'no-store' })
          .then((response) => response.ok ? response.json() : null),
        pixflowRuntimeFetch('/api/memory', { cache: 'no-store' })
          .then((response) => response.ok ? response.json() : null),
      ]);
      if (cancelled) return;
      const capabilityPayload = capabilityResult.status === 'fulfilled'
        ? capabilityResult.value as { families?: PixflowCapabilityFamilySummary[] } | null
        : null;
      const skillPayload = skillResult.status === 'fulfilled' ? skillResult.value : null;
      const promptSkillPayload = promptSkillResult.status === 'fulfilled' ? promptSkillResult.value : null;
      const memoryPayload = memoryResult.status === 'fulfilled' ? memoryResult.value : null;
      const nextFamilies = Array.isArray(capabilityPayload?.families) ? capabilityPayload.families : [];
      const mergedSkills = mergeWpAdminSkillCatalogues(promptSkillPayload, skillPayload);
      const nextSkills = mergedSkills.skills.length ? mergedSkills.skills : filterWpAdminSkills(skillPayload);
      setFamilies(nextFamilies);
      setSkills(nextSkills);
      setLockedSkills(readLockedSkills(skillPayload));
      setSkillBranches(mergedSkills.branches);
      setMentions(buildWpAdminMentions(context, nextFamilies, nextSkills));
      setMemoryIndex(memoryIndexOf(memoryPayload));
    };
    void loadSurfaceCatalogues();
    const refreshSkills = () => { void loadSurfaceCatalogues(); };
    window.addEventListener('pixflow-design:personal-skills-changed', refreshSkills);
    window.addEventListener('pixflow-design:saved-memory-changed', refreshSkills);
    return () => { cancelled = true; window.removeEventListener('pixflow-design:personal-skills-changed', refreshSkills); window.removeEventListener('pixflow-design:saved-memory-changed', refreshSkills); };
  }, [context]);

  useEffect(() => {
    setMentions(buildWpAdminMentions(context, families, skills));
  }, [context, families, skills]);

  useEffect(() => {
    setWorkingMemory(loadWpAdminWorkingMemory(memoryInput));
  }, [memoryInput]);

  const persistExecutionConfig = useCallback((patch: Partial<AppConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    void persistWpAdminConfig(next, patch).catch(() => undefined);
  }, [config]);

  const refreshExecutionAgents = useCallback(async (_options?: { useOptionalBridge?: boolean }) => {
    try {
      const next = filterWpAdminAgents(await fetchPixflowOptionalBridgeAgents({ force: true }));
      setAgents(next);
      return next;
    } catch {
      setAgents([]);
      return [];
    }
  }, []);

  const updateAgentModel = useCallback((id: string, choice: { model?: string; reasoning?: string; fastMode?: boolean }) => {
    persistExecutionConfig({
      agentModels: {
        ...(config.agentModels || {}),
        [id]: { ...(config.agentModels?.[id] || {}), ...choice },
      },
    });
  }, [config.agentModels, persistExecutionConfig]);

  const updateScrollState = useCallback(() => {
    const node = logRef.current;
    if (!node) return;
    setChatLogScrollable(node.scrollHeight > node.clientHeight + 2);
    setScrolledFromBottom(node.scrollHeight - node.scrollTop - node.clientHeight > 80);
  }, []);

  useEffect(() => {
    const node = logRef.current;
    if (!node) return;
    node.addEventListener('scroll', updateScrollState, { passive: true });
    updateScrollState();
    return () => node.removeEventListener('scroll', updateScrollState);
  }, [updateScrollState, durableHistory.messages.length]);

  const runWpAdminModel = useCallback(async (
    history: ChatMessage[],
    systemPrompt: string,
    signal: AbortSignal,
    handlers: {
      onDelta: (delta: string) => void;
      onDone: (text: string) => void;
      onError: (error: Error) => void;
      onAgentEvent?: (event: AgentEvent) => void;
      onRunStatus?: (status: ChatRunStatus) => void;
    },
    options?: { skillIds?: string[]; sessionMode?: ChatSessionMode; assistantMessageId?: string; conversationId?: string },
  ): Promise<void> => {
    const agent = selectedAdminAgent(config, agents);
    const prefs = selectedModel(config, agent);
    if (config.mode === 'api') {
      await streamMessage(config, systemPrompt, history, signal, {
        onDelta: handlers.onDelta,
        onDone: handlers.onDone,
        onError: handlers.onError,
        onAgentEvent: handlers.onAgentEvent,
      });
      return;
    }
    if (!agent) {
      handlers.onError(new Error(translateUi("ui.wpAdminAgentFrameApp.feedback100")));
      return;
    }
    await streamViaDaemon({
      agentId: agent.id,
      history,
      systemPrompt,
      signal,
      cancelSignal: signal,
      projectId: null,
      conversationId: options?.conversationId || sessionKey,
      // WP Admin Ask/Plan/Design semantics are owned by this surface's
      // preflight and typed safety plane. Keep the daemon's generic Plan and
      // Design overrides out of the run: those modes are project-file
      // oriented and could otherwise ask OpenCode to write plan.md or an
      // HTML artifact into the Bridge workspace.
      sessionMode: 'chat',
      assistantMessageId: options?.assistantMessageId || null,
      clientRequestId: `wp-admin:${Date.now().toString(36)}`,
      skillIds: options?.skillIds || [],
      model: prefs.model,
      reasoning: prefs.reasoning,
      fastMode: prefs.fastMode,
      projectMetadata: {
        kind: 'pixflow-wp-admin-agent',
        surface: 'wp_admin',
        skipDiscoveryBrief: true,
        toolPolicy: 'typed-wp-admin-only',
      },
      handlers: {
        onDelta: handlers.onDelta,
        onDone: handlers.onDone,
        onError: handlers.onError,
        onAgentEvent: handlers.onAgentEvent || (() => undefined),
      },
      onRunStatus: handlers.onRunStatus,
    });
  }, [translateUi, agents, config, mode, sessionKey]);

  const sendPrompt = useCallback(async (prompt: string, attachments: ChatAttachment[], _comments: ChatCommentAttachment[], meta?: SharedChatSendMeta, handoff?: BuilderHandoffExecution, onAccepted?: () => void) => {
    const annotationAgent = selectedAdminAgent(config, agents);
    const annotationImages = config.mode !== 'api' && annotationImageInput(annotationAgent, selectedModel(config, annotationAgent).model);
    attachments = routeAnnotationScreenshots(attachments, annotationImages);
    setDirectQuestion(null);
    if (!siteAccess.ready || siteAccess.error) return 'restore-draft' as const;
    if (!siteAccess.guarded) {
      const turnMode = handoff ? 'design' : mode;
      if (abortRef.current) return 'restore-draft' as const;
      const controller = new AbortController();
      abortRef.current = controller;
      stopRunRef.current = () => controller.abort();
      const id = handoff?.receipt.messageId || `direct:${Date.now()}`;
      let agent = selectedAdminAgent(config, agents);
      const initial: WpAdminMessage[] = [...messages, { id: `${id}:user`, role: 'user', content: prompt, createdAt: Date.now(), attachments, sessionMode: turnMode }, {
        id, role: 'assistant', content: '', status: 'streaming', runStatus: 'running', createdAt: Date.now(), agentId: config.mode === 'api' ? apiExecutionAgentId(config) : agent?.id, agentName: config.mode === 'api' ? apiExecutionLabel(config) : agent?.name, sessionMode: turnMode,
        events: meta?.voice ? [{ kind: 'status', code: 'voice_connection', label: translateUi("ui.wpAdminAgentFrameApp.connecting") }] : [],
      }];
      setMessages(initial); setStreaming(true); setPendingActions([]); setPendingClarification(null);
      let finalContent = '';
      let finalEvents: AgentEvent[] = meta?.voice ? [{ kind: 'status', code: 'voice_connection', label: translateUi("ui.wpAdminAgentFrameApp.connecting") }] : [];
      let failure = '';
      let failureStatus = 'failed';
      let awaitingInput = false;
      let terminalAt: number | undefined;
      const directOwner = sessionKey;
      try {
        if (config.mode !== 'api' && !agent) {
          agent = await resolveWpAdminDirectAgent(config, agents, async () => {
            const discovered = filterWpAdminAgents(await fetchPixflowOptionalBridgeAgents({ force: true }));
            setAgents(discovered);
            return discovered;
          });
          controller.signal.throwIfAborted();
          if (directSessionKeyRef.current !== directOwner) return;
          setMessages(current => current.map(message => message.id === id ? {
            ...message, agentId: agent?.id, agentName: agent?.name,
          } : message));
        }
        if (config.mode !== 'api' && !agent) throw new Error(translateUi("ui.wpAdminAgentFrameApp.feedback101"));
        const resolvedAgent = config.mode === 'api' ? { id: apiExecutionAgentId(config), name: apiExecutionLabel(config) } : agent!;
        const prefs = selectedModel(config, agent);
        if (handoff) {
          assertBuilderHandoffTarget(handoff, await resolveEditorRunTarget({ context: withGutenbergTarget(applyBuilderContext(context || {})) }, controller.signal));
        }
        const outcome = await runDirectSite({ config, voiceConnection: meta?.voice,
          ...(handoff ? { conversationId: `builder-handoff:${handoff.receipt.id}` } : { historySource: { sessionKey: directOwner, messages } }),
          onAccepted: async () => { onAccepted?.(); await handoff?.accepted(); },
          onOutcome: (_outcome, endedAt) => { terminalAt=endedAt; },
          agentId: resolvedAgent.id, model: prefs.model || undefined, reasoning: prefs.reasoning || undefined, fastMode: prefs.fastMode,
          attachments: routeAnnotationScreenshots([...(handoff ? [] : messages.flatMap(message => message.attachments || [])), ...attachments], annotationImages).map(item => {
            if (!item.projectId) throw new Error(translateUi("ui.wpAdminAgentFrameApp.feedback102", { value1: String(item.name) }));
            return { ...item, projectId: item.projectId };
          }),
          mode: turnMode, prompt, context: { ...withGutenbergTarget(applyBuilderContext(context || {})), attachments, commentAttachments: _comments, workspaceItems: meta?.context?.workspaceItems, selectedSkills: directSkillMentions(meta), ...directMcpMentionContext(meta) },
          persistenceSurface,persistenceMetadata:{messages:initial.map(message => message.id === id ? { ...message, agentId: resolvedAgent.id, agentName: resolvedAgent.name } : message),messageId:id,sessionKey:directOwner,mode:turnMode,...(handoff ? {handoff:handoff.receipt} : {})},
          history: handoff ? [] : steeringPromptHistory(messages), signal: controller.signal,
          onUpdate: (content, events) => {
            finalContent = content; finalEvents = events;
            if(directSessionKeyRef.current===directOwner)setMessages(current => current.map(message => message.id === id ? { ...message, content, events } : message));
          },
        });
        awaitingInput = outcome === 'awaiting_input';
      } catch (error) {
        const presentation = directRunFailurePresentation(error, controller.signal.aborted, directRunStatus(error));
        failureStatus = presentation.failureStatus;
        failure = presentation.failure;
        if (presentation.stopped && !finalContent) {
          finalContent = 'Stopped.';
          finalEvents = [...finalEvents, { kind: 'text', text: finalContent }];
        }
      }
      finally {
        meta?.voice?.finish();
        if(directSessionKeyRef.current===directOwner)setMessages(current => current.map(message => message.id === id ? {
          ...message, content: failure ? `${finalContent}\n\n${failure}`.trim() : finalContent,
          events: failure ? [...finalEvents, { kind: 'text', text: `\n\n${failure}` }] : finalEvents,
          status: failure && failureStatus==='failed' ? 'error' : 'complete', runStatus: controller.signal.aborted || failureStatus === 'canceled' ? 'canceled' : failure ? failureStatus : 'succeeded', awaitingInput, endedAt: terminalAt ?? Date.now(),
        } : message));
        setStreaming(false); abortRef.current = null; stopRunRef.current = null;
        void refreshContext();
        if (handoff && failureStatus !== 'interrupted') await handoff.finished(failure || (controller.signal.aborted ? 'The request was stopped.' : undefined), awaitingInput);
      }
      return;
    }
    // The disabled button covers normal interaction, but queued keyboard or
    // programmatic submissions can still arrive during a Bridge status
    // transition. Stop those at the action boundary; BYOK remains available.
    if (bridgeUpdateState.required && config.mode !== 'api') return;
    const turnAgentIdentity = wpAdminAgentIdentity(config, agents);
    const live = await refreshContext();
    const turnContext = live?.context || context;
    const turnIdentity = buildWpAdminContextIdentity(turnContext, tabId);
    const turnAuthority = live?.authority || contextAuthority;
    if (!turnIdentity || !turnAuthority) {
      const now = Date.now();
      setMessages((current) => [...current, {
        id: `wp-admin-user:${now.toString(36)}`, role: 'user', content: prompt, createdAt: now, endedAt: now, sessionMode: mode, attachments,
      }, {
        id: `wp-admin-assistant:${(now + 1).toString(36)}`, role: 'assistant',
        content: 'Pixflow could not verify the current WordPress Admin object, so it did not continue the request or prepare a review.',
        createdAt: now + 1, endedAt: now + 1, runStatus: 'failed', sessionMode: mode,
        agentId: turnAgentIdentity?.agentId,
        agentName: turnAgentIdentity?.agentName,
        events: [{ kind: 'text', text: 'Pixflow could not verify the current WordPress Admin object, so it did not continue the request or prepare a review.' }],
      }]);
      return;
    }
    const turnSessionKey = contextStorageKey(runtime, turnIdentity);
    const turnMemoryInput: WpAdminWorkingMemoryInput = {
      siteHash: contextSiteHash(runtime), userId: turnIdentity.userId, conversationId: turnSessionKey, context: turnContext,
    };
    let currentTurnMessages = authoritativeWpAdminMessages(messages, turnIdentity, turnSessionKey);
    let requestPrompt = prompt;
    let turnPendingClarification: PixflowWpAdminPendingClarification | null = null;
    if (contextIdentity && !sameWpAdminContext(contextIdentity, turnIdentity)) {
      abortRef.current?.abort();
      setPendingActions([]);
      setPendingClarification(null);
    }
    if (pendingClarification) {
      const continuation = canContinueWpAdminClarification(pendingClarification, turnIdentity, turnSessionKey);
      if (!continuation.ok && continuation.reason !== 'missing') {
        const now = Date.now();
        const userId = `wp-admin-user:${now.toString(36)}`;
        const assistantId = `wp-admin-assistant:${(now + 1).toString(36)}`;
        const notice = 'That clarification belongs to a different or older WordPress object. Return to its original post or start a new request here. No review was prepared and nothing changed.';
        setPendingClarification(null);
        setPendingActions([]);
        setMessages((current) => [...authoritativeWpAdminMessages(current, turnIdentity, turnSessionKey), {
          id: userId, role: 'user', content: prompt, createdAt: now, endedAt: now, sessionMode: mode, attachments,
          originContext: buildWpAdminMessageOrigin(turnIdentity, turnSessionKey, userId, userId, now),
        }, {
          id: assistantId, role: 'assistant', content: notice, createdAt: now + 1, endedAt: now + 1, runStatus: 'failed', sessionMode: mode,
          agentId: turnAgentIdentity?.agentId,
          agentName: turnAgentIdentity?.agentName,
          originContext: buildWpAdminMessageOrigin(turnIdentity, turnSessionKey, userId, assistantId, now + 1),
          events: [{ kind: 'text', text: notice }],
        }]);
        return;
      }
      if (continuation.ok) turnPendingClarification = pendingClarification;
    }
    const now = Date.now();
    const assistantId = `wp-admin-assistant:${(now + 1).toString(36)}`;
    const userId = `wp-admin-user:${now.toString(36)}`;
    const preflightConversationId = wpAdminTurnConversationId(turnSessionKey, 'preflight', userId);
    const turnContextBinding: PixflowWpAdminContextAuthorityBinding = {
      contextIdentity: turnIdentity,
      contextAuthority: turnAuthority,
      contextScope: wpAdminTabContextKey(turnIdentity),
      conversationId: turnSessionKey,
      sourceMessageId: userId,
      tabId,
      targetProvenance: 'active_context_target',
    };
    const user: WpAdminMessage = {
      id: userId,
      role: 'user',
      content: prompt,
      createdAt: now,
      endedAt: now,
      sessionMode: mode,
      attachments,
      originContext: buildWpAdminMessageOrigin(turnIdentity, turnSessionKey, userId, userId, now),
    };
    const assistant: WpAdminMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: now + 1,
      startedAt: now + 1,
      status: 'streaming',
      runStatus: 'running',
      sessionMode: mode,
      agentId: turnAgentIdentity?.agentId,
      agentName: turnAgentIdentity?.agentName,
      originContext: buildWpAdminMessageOrigin(turnIdentity, turnSessionKey, userId, assistantId, now + 1),
      events: [{ kind: 'context', mode, metadata: { source: 'wp_admin', context: contextLabel(turnContext) } }],
    };
    setMessages((current) => [...authoritativeWpAdminMessages(current, turnIdentity, turnSessionKey), user, assistant]);
    const scopedMemory = memoryInput.conversationId === turnSessionKey ? workingMemory : loadWpAdminWorkingMemory(turnMemoryInput);
    stopRunRef.current?.();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);

    const updateAssistant = (patch: Partial<WpAdminMessage>) => {
      setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, ...patch } : message));
    };
    let finalAssistantText = '';
    let turnEvents: AgentEvent[] = startWpAdminActivity([], {
      id: `${assistantId}:preparing`,
      phase: 'preparing',
      label: translateUi("ui.wpAdminAgentFrameApp.understandingTheWordpressRequest"),
    }, now + 1);
    updateAssistant({ events: sanitizeWpAdminAssistantEvents(turnEvents, '') });
    const stopCurrentRun = () => {
      window.dispatchEvent(new Event('pixflow-design:agent-stop'));
      if (!controller.signal.aborted) controller.abort();
      finalAssistantText = finalAssistantText || 'Stopped.';
      setPendingActions([]);
      updateAssistant({
        content: finalAssistantText,
        endedAt: Date.now(),
        status: undefined,
        runStatus: 'canceled',
        events: sanitizeWpAdminAssistantEvents([
          ...settleActiveWpAdminActivities(turnEvents, 'canceled', finalAssistantText),
          { kind: 'status', label: translateUi("routines.status.canceled") },
        ], finalAssistantText),
      });
      setStreaming(false);
    };
    stopRunRef.current = stopCurrentRun;
    const priorMessages = currentTurnMessages.slice(-12).map((message) => ({ role: message.role, content: message.content }));
    const agent = selectedAdminAgent(config, agents);
    const prefs = selectedModel(config, agent);
    const runnerLabel = agent?.name || (config.mode === 'api' ? 'BYOK provider' : 'Local CLI runner');
    const selectedSkills = meta?.skillIds || [];
    setPendingActions([]);
    let preparedActions: WpAdminActionState[] = [];
    let preflightFailureMessage = '';
    let commitWorkingMemory = false;
    const turnGroundingResults: Array<{ capabilityId: string; arguments: Record<string, unknown>; result: unknown }> = [];
    try {
      // The composer can become interactive before the initial capability
      // request completes on a freshly loaded admin page. Re-read the live
      // catalogue at submission time so a fast Design request never routes
      // through a transient empty family list.
      let activeFamilies = families;
      if (activeFamilies.length === 0) {
        try {
          const response = await pixflowWordPressRestFetch('/wp-admin/capabilities', { cache: 'no-store' });
          const payload = response.ok
            ? await response.json() as { families?: PixflowCapabilityFamilySummary[] }
            : null;
          if (Array.isArray(payload?.families)) {
            activeFamilies = payload.families;
            setFamilies(activeFamilies);
            setMentions(buildWpAdminMentions(turnContext, activeFamilies, skills));
          }
        } catch {
          // The semantic preflight remains fail-closed if WordPress really is
          // unavailable; no capability is invented here.
        }
      }
      const currentPostId = wpAdminContextPostId(turnContext);
      const researchStatus = await fetchResearchStatusViaDaemon(controller.signal).catch(() => ({ available: false, providers: [] }));
      const researchAvailability = {
        available: Boolean(researchStatus.available),
        providers: researchStatus.providers.filter((provider) => provider.available).map((provider) => provider.id),
      };
      const preflightSkills = [...new Map([...skills, ...skillBranches].map((skill) => [skill.id, {
        ...skill,
        instruction: undefined,
      }])).values()];
      let preflight = await runWpAdminSemanticPreflight({
        prompt: requestPrompt,
        mode,
        context: turnContext,
        families: activeFamilies,
        mentions,
        skills: preflightSkills,
        activatedSkills: [],
        explicitSkillIds: selectedSkills,
        explicitMentionIds: [],
        priorMessages,
        attachments,
        memoryIndex,
        pendingClarification: turnPendingClarification,
        research: researchAvailability,
        groundingRound: 0,
        agentId: agent?.id || 'byok',
        projectId: null,
        conversationId: preflightConversationId,
        model: config.mode === 'api' ? apiExecutionModel(config) : prefs.model,
        reasoning: config.mode === 'api' ? null : prefs.reasoning,
        signal: controller.signal,
        onFailure: (error) => {
          preflightFailureMessage = wpAdminStreamFailureMessage(error, runnerLabel);
        },
        stream: (preflightPrompt, signal, handlers) => runWpAdminModel(
          [{ id: `wp-admin-preflight-user:${Date.now().toString(36)}`, role: 'user', content: preflightPrompt, createdAt: Date.now() } as ChatMessage],
          '', signal, handlers, { sessionMode: 'chat', conversationId: preflightConversationId },
        ),
      });
      if (preflight.failure) preflightFailureMessage = wpAdminStreamFailureMessage(preflight.failure, runnerLabel);
      let activatedGutenbergSkills = activateWpAdminSkillsFromDecision({
        selectedSkillIds: preflight.decision.skillIds,
        skills,
        branches: skillBranches,
      });
      for (let groundingRound = 0; groundingRound < 2 && !controller.signal.aborted; groundingRound += 1) {
        const remaining = 6 - turnGroundingResults.length;
        if (remaining <= 0) break;
        const wordpressReads = wpAdminResearchReadProposals(preflight.decision, activeFamilies, turnContext, turnGroundingResults).slice(0, remaining);
        const onlineReads = wpAdminResearchProposals(preflight.decision).slice(0, Math.max(0, remaining - wordpressReads.length));
        if (!wordpressReads.length && !onlineReads.length) break;
        const researchActivityId = `${assistantId}:research:${groundingRound}`;
        const readingActivityId = `${assistantId}:reading:${groundingRound}`;
        if (wordpressReads.length) {
          turnEvents = startWpAdminActivity(turnEvents, {
            id: readingActivityId,
            phase: 'reading',
            label: translateUi("ui.wpAdminAgentFrameApp.readingLiveWordpressAndPluginEvidence"),
          });
        }
        if (onlineReads.length) {
          turnEvents = startWpAdminActivity(turnEvents, {
            id: researchActivityId,
            phase: 'researching',
            label: translateUi("ui.wpAdminAgentFrameApp.researchingCurrentPublicSources"),
          });
        }
        updateAssistant({ events: sanitizeWpAdminAssistantEvents(turnEvents, finalAssistantText) });
        for (let index = 0; index < wordpressReads.length && turnGroundingResults.length < 6; index += 1) {
          const read = wordpressReads[index]!;
          let readContextBinding = turnContextBinding;
          const readTarget = wpAdminPostContextBindingTarget(preflight.decision, read.arguments, currentPostId);
          if (readTarget.kind === 'rejected') {
            throw new Error(translateUi("ui.wpAdminAgentFrameApp.feedback103", { value1: String(readTarget.postId) }));
          }
          if (readTarget.kind === 'explicit') {
            const explicit = await readExplicitTargetContext(
              readTarget.postId,
              String(preflight.decision.target.postType || ''),
            );
            if (!explicit || explicit.identity.objectKind !== 'post' || Number(explicit.identity.objectId || 0) !== readTarget.postId) {
              throw new Error(translateUi("ui.wpAdminAgentFrameApp.feedback104", { value1: String(readTarget.postId) }));
            }
            readContextBinding = {
              contextIdentity: explicit.identity,
              contextAuthority: explicit.authority,
              contextScope: wpAdminTabContextKey(explicit.identity),
              conversationId: turnSessionKey,
              sourceMessageId: userId,
              tabId,
              targetProvenance: 'explicit_user_target',
            };
          }
          const result = await executeWpAdminReadOnlyCapability(read.capabilityId, `${turnSessionKey}:grounding:${assistantId}:${groundingRound}:${index}`, read.arguments, readContextBinding);
          if (result !== null) turnGroundingResults.push({ capabilityId: read.capabilityId, arguments: read.arguments, result });
          if (read.capabilityId === 'pixflow/wp-admin/plugin-source/search' && turnGroundingResults.length < 6 && result !== null) {
            const followup = wpAdminPluginSourceFollowupRead(read.arguments, result);
            if (followup) {
              const followupResult = await executeWpAdminReadOnlyCapability(followup.capabilityId, `${turnSessionKey}:grounding:${assistantId}:${groundingRound}:${index}:source-file`, followup.arguments, turnContextBinding);
              if (followupResult !== null) turnGroundingResults.push({ ...followup, result: followupResult });
            }
          }
        }
        await runWpAdminResearchBatch(
          onlineReads.slice(0, Math.max(0, 6 - turnGroundingResults.length)),
          researchAvailability.providers,
          controller.signal,
          searchResearchViaDaemon,
          (groundingResult) => {
          turnGroundingResults.push(groundingResult);
          const sources = wpAdminResearchActivitySources(turnGroundingResults);
          turnEvents = updateWpAdminResearchActivity(turnEvents, researchActivityId, {
            sourceCount: sources.length,
            detail: sources.length === 1 ? '1 source found' : `${sources.length} sources found`,
            sources,
          });
          updateAssistant({ events: sanitizeWpAdminAssistantEvents(turnEvents, finalAssistantText) });
          },
        );
        if (wordpressReads.length) {
          turnEvents = completeWpAdminActivity(turnEvents, readingActivityId, {
            label: translateUi("ui.wpAdminAgentFrameApp.wordpressEvidenceLoaded"),
            detail: `${wordpressReads.length} ${wordpressReads.length === 1 ? 'read' : 'reads'} completed`,
          });
        }
        if (onlineReads.length) {
          const sources = wpAdminResearchActivitySources(turnGroundingResults);
          turnEvents = completeWpAdminActivity(turnEvents, researchActivityId, {
            label: sources.length === 1 ? 'Researched 1 source' : `Researched ${sources.length} sources`,
            sourceCount: sources.length,
            sources,
          });
        }
        updateAssistant({ events: sanitizeWpAdminAssistantEvents(turnEvents, finalAssistantText) });
        preflight = await runWpAdminSemanticPreflight({
          prompt: requestPrompt, mode, context: turnContext, families: activeFamilies, mentions,
          skills: preflightSkills, activatedSkills: activatedGutenbergSkills,
          explicitSkillIds: selectedSkills, explicitMentionIds: [], priorMessages, attachments, memoryIndex,
          pendingClarification: turnPendingClarification, groundingResults: turnGroundingResults,
          research: researchAvailability, groundingRound: groundingRound + 1,
          agentId: agent?.id || 'byok', projectId: null, conversationId: preflightConversationId,
          model: config.mode === 'api' ? apiExecutionModel(config) : prefs.model,
          reasoning: config.mode === 'api' ? null : prefs.reasoning, signal: controller.signal,
          onFailure: (error) => { preflightFailureMessage = wpAdminStreamFailureMessage(error, runnerLabel); },
          stream: (preflightPrompt, signal, handlers) => runWpAdminModel(
            [{ id: `wp-admin-preflight-user:${Date.now().toString(36)}`, role: 'user', content: preflightPrompt, createdAt: Date.now() } as ChatMessage],
            '', signal, handlers, { sessionMode: 'chat', conversationId: preflightConversationId },
          ),
        });
        if (preflight.failure) preflightFailureMessage = wpAdminStreamFailureMessage(preflight.failure, runnerLabel);
        activatedGutenbergSkills = activateWpAdminSkillsFromDecision({ selectedSkillIds: preflight.decision.skillIds, skills, branches: skillBranches });
        if (wordpressReads.some((item) => item.capabilityId === 'pixflow/wp-admin/gutenberg/read-document') && currentPostId > 0) {
          const exact = turnGroundingResults.find((item) => item.capabilityId === 'pixflow/wp-admin/gutenberg/read-document');
          const check = validateWpAdminExactGutenbergRead(exact?.result, currentPostId, turnContextBinding);
          if (!check.ok) throw new Error(translateUi("ui.wpAdminAgentFrameApp.feedback105", { value1: String(check.reason) }));
          if (!check.complete && mode === 'design') throw new Error(translateUi("ui.wpAdminAgentFrameApp.feedback106"));
        }
      }
      if (!turnGroundingResults.length && activatedGutenbergSkills.length && !controller.signal.aborted) {
        preflight = await runWpAdminSemanticPreflight({
          prompt: requestPrompt, mode, context: turnContext, families: activeFamilies, mentions,
          skills: preflightSkills, activatedSkills: activatedGutenbergSkills,
          explicitSkillIds: selectedSkills, explicitMentionIds: [], priorMessages, attachments, memoryIndex,
          pendingClarification: turnPendingClarification,
          research: researchAvailability,
          groundingRound: 0,
          agentId: agent?.id || 'byok', projectId: null, conversationId: preflightConversationId,
          model: config.mode === 'api' ? apiExecutionModel(config) : prefs.model,
          reasoning: config.mode === 'api' ? null : prefs.reasoning, signal: controller.signal,
          onFailure: (error) => { preflightFailureMessage = wpAdminStreamFailureMessage(error, runnerLabel); },
          stream: (preflightPrompt, signal, handlers) => runWpAdminModel(
            [{ id: `wp-admin-preflight-user:${Date.now().toString(36)}`, role: 'user', content: preflightPrompt, createdAt: Date.now() } as ChatMessage],
            '', signal, handlers, { sessionMode: 'chat', conversationId: preflightConversationId },
          ),
        });
      }
      const usesGutenbergDocument = preflight.decision.capabilityIds.some((id) => id.startsWith('pixflow/wp-admin/gutenberg/'));
      if (currentPostId > 0 && usesGutenbergDocument && wpAdminDirtyEditorState(currentPostId).dirty) {
        throw new Error(translateUi("ui.wpAdminAgentFrameApp.feedback107"));
      }
      if (mode === 'design' && preflight.decision.contentMutationIntent === 'clear') {
        throw new Error(translateUi("ui.wpAdminAgentFrameApp.feedback108"));
      }
      if (turnPendingClarification) {
        const disposition = preflight.decision.clarificationDisposition;
        if (!disposition || disposition.clarificationId !== turnPendingClarification.clarificationId
          || !['answer', 'supersede'].includes(disposition.kind)) {
          throw new Error(translateUi("ui.wpAdminAgentFrameApp.feedback109"));
        }
        setPendingClarification(null);
        if (disposition.kind === 'supersede') setPendingActions([]);
      }
      if (controller.signal.aborted) throw new DOMException('Stopped.', 'AbortError');
      turnEvents = completeWpAdminActivity(turnEvents, `${assistantId}:preparing`, {
        label: translateUi("ui.wpAdminAgentFrameApp.requestUnderstood"),
      });
      if (preflight.decision.state === 'needs_clarification') {
        commitWorkingMemory = true;
        finalAssistantText = preflight.decision.clarification || 'What specific WordPress Admin target should I use?';
        setPendingClarification(buildWpAdminPendingClarification({
          conversationId: turnSessionKey,
          sourceMessageId: userId,
          target: turnIdentity,
          intent: { intent: preflight.decision.intent, target: preflight.decision.target, userPrompt: requestPrompt },
          candidates: preflight.decision.unresolvedChoices,
          clarification: finalAssistantText,
        }));
        updateAssistant({
          content: finalAssistantText,
          endedAt: Date.now(),
          status: undefined,
          runStatus: 'succeeded',
          awaitingInput: true,
          clarificationKind: 'semantic_preflight',
          events: sanitizeWpAdminAssistantEvents([
            ...turnEvents,
            { kind: 'preflight', mode, source: preflight.source },
            { kind: 'status', label: translateUi("ui.wpAdminAgentFrameApp.awaitingUser") },
          ], finalAssistantText),
        });
      } else if (preflight.source === 'fallback') {
        finalAssistantText = preflightFailureMessage
          || `I couldn't complete the WordPress Admin semantic preflight, so I selected no capabilities and made no changes. You can retry this read-only request, or check the selected ${config.mode === 'api' ? 'BYOK provider' : 'Local CLI runner'} in Settings → Execution.`;
        updateAssistant({
          content: finalAssistantText,
          endedAt: Date.now(),
          status: undefined,
          runStatus: 'failed',
          events: sanitizeWpAdminAssistantEvents([...turnEvents, { kind: 'preflight', mode, source: 'fallback' }], finalAssistantText),
        });
      } else {
        const writableProposals = wpAdminWritableActionProposals(preflight.decision, activeFamilies);
        const hydratedProposals: Array<{ capabilityId: string; arguments: Record<string, unknown> }> = [];
        for (let index = 0; index < writableProposals.length; index += 1) {
          const proposal = writableProposals[index]!;
          const hydrated = await hydrateWpAdminBatchFileFingerprints(
            proposal.capabilityId,
            proposal.arguments,
            `${turnSessionKey}:batch-read:${assistantId}:${index}`,
          );
          const jetEngineHydrated = await hydrateWpAdminJetEngineModelProposal(
            proposal.capabilityId,
            hydrated || proposal.arguments,
            `${turnSessionKey}:batch-read:${assistantId}:${index}`,
          );
          const cctRecordHydrated = await hydrateWpAdminJetEngineCctRecordProposal(
            proposal.capabilityId,
            jetEngineHydrated || hydrated || proposal.arguments,
            `${turnSessionKey}:batch-read:${assistantId}:${index}`,
          );
          hydratedProposals.push({ capabilityId: proposal.capabilityId, arguments: cctRecordHydrated || jetEngineHydrated || hydrated || proposal.arguments });
        }
        const writableCapabilityId = hydratedProposals[0]?.capabilityId;
        const hydratedProposedArguments = hydratedProposals[0]?.arguments;
        if (controller.signal.aborted) throw new DOMException('Stopped.', 'AbortError');
        const selectedCapabilityDetails: PixflowCapabilityDetail[] = [];
        const readOnlyResults: Array<{ capabilityId: string; result: unknown }> = [];
        const readOnlyCapabilityIds = hostWpAdminReadOnlyCapabilityIds(preflight.decision, activeFamilies);
        for (const readOnlyCapabilityId of readOnlyCapabilityIds) {
          if (controller.signal.aborted) throw new DOMException('Stopped.', 'AbortError');
          try {
            const result = await executeWpAdminReadOnlyCapability(
              readOnlyCapabilityId,
              `${turnSessionKey}:read:${assistantId}:${readOnlyResults.length}`,
              wpAdminReadOnlyCapabilityArguments(readOnlyCapabilityId, writableCapabilityId, hydratedProposedArguments, turnContext),
              turnContextBinding,
            );
            if (controller.signal.aborted) throw new DOMException('Stopped.', 'AbortError');
            if (result !== null) readOnlyResults.push({ capabilityId: readOnlyCapabilityId, result });
          } catch {
            // The final model response must remain conservative when a typed
            // read cannot be completed; no guessed value is supplied.
          }
        }
        if (readOnlyCapabilityIds.includes('pixflow/wp-admin/gutenberg/read-document') && currentPostId > 0) {
          const exact = readOnlyResults.find((item) => item.capabilityId === 'pixflow/wp-admin/gutenberg/read-document');
          const check = validateWpAdminExactGutenbergRead(exact?.result, currentPostId, turnContextBinding);
          if (!check.ok) throw new Error(translateUi("ui.wpAdminAgentFrameApp.feedback105", { value1: String(check.reason) }));
          if (!check.complete && writableCapabilityId) throw new Error(translateUi("ui.wpAdminAgentFrameApp.feedback110"));
        }
        const detailCache = new Map<string, PixflowCapabilityDetail | null>();
        for (let index = 0; index < hydratedProposals.length; index += 1) {
          const proposal = hydratedProposals[index]!;
          let capability = detailCache.get(proposal.capabilityId);
          if (capability === undefined) {
            capability = await loadWpAdminCapabilityDetail(proposal.capabilityId)
              || fallbackWpAdminCapabilityDetail(proposal.capabilityId, activeFamilies);
            detailCache.set(proposal.capabilityId, capability);
          }
          if (controller.signal.aborted) throw new DOMException('Stopped.', 'AbortError');
          if (capability && capability.annotations.risk !== 'read_only' && (!capability.allowedModes || capability.allowedModes.includes('design'))) {
            let actionContextValue = turnContext;
            let actionContextBinding = turnContextBinding;
            const activePostId = turnIdentity.objectKind === 'post' ? Number(turnIdentity.objectId || 0) : 0;
            const proposalTarget = wpAdminPostContextBindingTarget(preflight.decision, proposal.arguments, activePostId);
            if (capability.permission?.targetType === 'post' && proposalTarget.kind === 'rejected') continue;
            if (capability.permission?.targetType === 'post' && proposalTarget.kind === 'explicit') {
              const explicit = await readExplicitTargetContext(
                proposalTarget.postId,
                String(preflight.decision.target.postType || proposal.arguments.postType || ''),
              );
              if (!explicit || explicit.identity.objectKind !== 'post' || Number(explicit.identity.objectId || 0) !== proposalTarget.postId) continue;
              actionContextValue = explicit.context;
              actionContextBinding = {
                contextIdentity: explicit.identity,
                contextAuthority: explicit.authority,
                contextScope: wpAdminTabContextKey(explicit.identity),
                conversationId: turnSessionKey,
                sourceMessageId: userId,
                tabId,
                targetProvenance: 'explicit_user_target',
              };
            }
            let actionArguments = defaultActionArguments(
              capability,
              actionContextValue,
              proposal.arguments,
              [...readOnlyResults, ...turnGroundingResults],
            );
            if (capability.id === 'pixflow/wp-admin/gutenberg/apply-document'
              && preflight.decision.contentMutationIntent !== 'replace') {
              throw new Error(translateUi("ui.wpAdminAgentFrameApp.feedback111"));
            }
            const deferGutenbergPreparation = capability.id === 'pixflow/wp-admin/gutenberg/apply-document'
              && wpAdminActionHasResultReferences(actionArguments);
            if (deferGutenbergPreparation && wpAdminActionHasResultReferences({ expectedFingerprint: actionArguments.expectedFingerprint })) {
              // A new post's Gutenberg fingerprint does not exist until its
              // prerequisite create action commits. Never resolve a guessed
              // result path; the deferred preparation reads the authoritative
              // fingerprint from WordPress instead.
              delete actionArguments.expectedFingerprint;
            }
            if (!deferGutenbergPreparation) {
              try {
                actionArguments = await prepareGutenbergAction(
                  capability.id,
                  actionArguments,
                  `gutenberg:${assistantId}:${index}`.slice(0, 160),
                  controller.signal,
                  actionContextBinding,
                );
              } catch (preparationError) {
                if (capability.id !== 'pixflow/wp-admin/gutenberg/apply-document'
                  || wpAdminGutenbergPreparationFailurePolicy(preparationError) !== 'repair_once') {
                  throw preparationError;
                }
                turnEvents = startWpAdminActivity(turnEvents, {
                  id: `${assistantId}:repair`, phase: 'planning', label: translateUi("ui.wpAdminAgentFrameApp.repairingOneGutenbergBlockSchemaIssue"),
                });
                updateAssistant({ events: sanitizeWpAdminAssistantEvents(turnEvents, finalAssistantText) });
                const exactRead = readOnlyResults.find((item) => item.capabilityId === 'pixflow/wp-admin/gutenberg/read-document')?.result;
                let blockRegistry: unknown = null;
                try {
                  blockRegistry = await executeWpAdminReadOnlyCapability(
                    'pixflow/wp-admin/gutenberg/list-block-types',
                    `${turnSessionKey}:repair-registry:${assistantId}:${index}`,
                    { postId: Number(actionArguments.postId || 0), perPage: 500 },
                    actionContextBinding,
                  );
                } catch {
                  // The single repair can still use the exact server diagnostic;
                  // missing registry evidence never becomes guessed authority.
                }
                const repairedArguments = await runWpAdminGutenbergRepair({
                  userPrompt: requestPrompt,
                  originalArguments: actionArguments,
                  failure: preparationError,
                  exactRead,
                  blockRegistry,
                  activatedSkills: activatedGutenbergSkills,
                  signal: controller.signal,
                  stream: (repairPrompt, signal, handlers) => runWpAdminModel(
                    [{ id: `wp-admin-gutenberg-repair:${Date.now().toString(36)}`, role: 'user', content: repairPrompt, createdAt: Date.now() } as ChatMessage],
                    '', signal, handlers, { sessionMode: 'chat', conversationId: wpAdminTurnConversationId(turnSessionKey, 'gutenberg-repair', userId) },
                  ),
                });
                actionArguments = await prepareGutenbergAction(
                  capability.id,
                  repairedArguments,
                  `gutenberg-repair:${assistantId}:${index}`.slice(0, 160),
                  controller.signal,
                  actionContextBinding,
                );
                turnEvents = completeWpAdminActivity(turnEvents, `${assistantId}:repair`, {
                  label: translateUi("ui.wpAdminAgentFrameApp.gutenbergRepairPrepared"),
                });
              }
            }
            if (isGutenbergActionUnavailable(actionArguments)) {
              finalAssistantText = gutenbergActionUnavailableMessage(actionArguments);
              setPendingActions([]);
              setPendingClarification(null);
              updateAssistant({
                content: finalAssistantText, endedAt: Date.now(), status: undefined, runStatus: 'succeeded',
                events: sanitizeWpAdminAssistantEvents(turnEvents, finalAssistantText),
              });
              return;
            }
            if (!selectedCapabilityDetails.some((item) => item.id === capability.id)) selectedCapabilityDetails.push(capability);
            preparedActions.push({
              id: `${assistantId}:${index + 1}`,
              capability,
              initialArguments: actionArguments,
              contextBinding: actionContextBinding,
            });
          }
        }
        const unpreparedWriteNotice = wpAdminUnpreparedWriteNotice(preflight.decision, preparedActions.length);
        if (unpreparedWriteNotice) {
          finalAssistantText = unpreparedWriteNotice;
          updateAssistant({
            content: finalAssistantText,
            endedAt: Date.now(),
            status: undefined,
            runStatus: 'failed',
            clarificationKind: 'semantic_preflight',
            events: sanitizeWpAdminAssistantEvents([
              ...turnEvents,
              { kind: 'preflight', mode, source: preflight.source },
              { kind: 'text', text: finalAssistantText },
            ], finalAssistantText),
          });
          return;
        }
        if (preparedActions.length) {
          turnEvents = startWpAdminActivity(turnEvents, {
            id: `${assistantId}:execute`, phase: 'executing', label: translateUi("ui.wpAdminAgentFrameApp.applyingVerifiedWordpressChanges"),
            detail: `${preparedActions.length} ${preparedActions.length === 1 ? 'action' : 'actions'}`,
          });
          updateAssistant({
            content: 'Applying the verified WordPress changes…',
            status: 'streaming',
            runStatus: 'running',
            endedAt: undefined,
            events: sanitizeWpAdminAssistantEvents(turnEvents, 'Applying the verified WordPress changes…'),
          });
          const executed = await autoExecuteWpAdminActions(
            preparedActions,
            turnSessionKey,
            controller.signal,
            pixflowWordPressRestFetch,
            async ({ action, arguments: resolvedArguments, index }) => {
              let binding = action.contextBinding;
              const batchPostId = index > 0 ? wpAdminActionTargetPostId(resolvedArguments) : 0;
              if (batchPostId > 0) {
                const target = await readExplicitTargetContext(
                  batchPostId,
                  String(binding?.contextIdentity.objectType || resolvedArguments.postType || 'post'),
                );
                if (!target || target.identity.objectKind !== 'post' || Number(target.identity.objectId || 0) !== batchPostId) {
                  throw new Error(translateUi("ui.wpAdminAgentFrameApp.feedback112"));
                }
                binding = {
                  contextIdentity: target.identity,
                  contextAuthority: target.authority,
                  contextScope: wpAdminTabContextKey(target.identity),
                  conversationId: turnSessionKey,
                  sourceMessageId: userId,
                  tabId,
                  targetProvenance: wpAdminDependentPostTargetProvenance(),
                };
              }
              if (action.capability.id !== 'pixflow/wp-admin/gutenberg/apply-document'
                || Object.prototype.hasOwnProperty.call(resolvedArguments, 'preparedReceiptId')) {
                return { arguments: resolvedArguments, ...(binding ? { contextBinding: binding } : {}) };
              }
              const postId = Number(resolvedArguments.postId || 0);
              if (!Number.isInteger(postId) || postId < 1) {
                throw new Error(translateUi("ui.wpAdminAgentFrameApp.feedback113"));
              }
              if (Number(binding?.contextIdentity.objectId || 0) !== postId) {
                const target = await readExplicitTargetContext(postId, String(resolvedArguments.postType || 'post'));
                if (!target || target.identity.objectKind !== 'post' || Number(target.identity.objectId || 0) !== postId) {
                  throw new Error(translateUi("ui.wpAdminAgentFrameApp.feedback114"));
                }
                binding = {
                  contextIdentity: target.identity,
                  contextAuthority: target.authority,
                  contextScope: wpAdminTabContextKey(target.identity),
                  conversationId: turnSessionKey,
                  sourceMessageId: userId,
                  tabId,
                  targetProvenance: 'explicit_user_target',
                };
              }
              const statusResult = await executeWpAdminReadOnlyCapability(
                'pixflow/wp-admin/gutenberg/status',
                `${turnSessionKey}:dependent-gutenberg-status:${assistantId}:${index}`,
                { postId },
                binding,
              );
              const status = statusResult && typeof statusResult === 'object' && !Array.isArray(statusResult)
                ? statusResult as Record<string, unknown>
                : {};
              const expectedFingerprint = String(status.fingerprint || '');
              if (status.usesBlockEditor !== true || status.editable !== true || !expectedFingerprint) {
                throw new Error(translateUi("ui.wpAdminAgentFrameApp.feedback115"));
              }
              resolvedArguments = { ...resolvedArguments, postId, expectedFingerprint };
              try {
                const prepared = await prepareGutenbergAction(
                  action.capability.id,
                  resolvedArguments,
                  `gutenberg:${assistantId}:${index}`.slice(0, 160),
                  controller.signal,
                  binding,
                );
                return { arguments: prepared, contextBinding: binding };
              } catch (preparationError) {
                if (wpAdminGutenbergPreparationFailurePolicy(preparationError) !== 'repair_once') throw preparationError;
                turnEvents = startWpAdminActivity(turnEvents, {
                  id: `${assistantId}:repair`, phase: 'planning', label: translateUi("ui.wpAdminAgentFrameApp.repairingOneGutenbergBlockSchemaIssue"),
                });
                updateAssistant({ events: sanitizeWpAdminAssistantEvents(turnEvents, finalAssistantText) });
                let blockRegistry: unknown = null;
                try {
                  blockRegistry = await executeWpAdminReadOnlyCapability(
                    'pixflow/wp-admin/gutenberg/list-block-types',
                    `${turnSessionKey}:repair-registry:${assistantId}:${index}`,
                    { postId, perPage: 500 },
                    binding,
                  );
                } catch {
                  // The preparation diagnostic is still authoritative when
                  // the optional registry read is unavailable.
                }
                const repairedArguments = await runWpAdminGutenbergRepair({
                  userPrompt: requestPrompt,
                  originalArguments: resolvedArguments,
                  failure: preparationError,
                  exactRead: null,
                  blockRegistry,
                  activatedSkills: activatedGutenbergSkills,
                  signal: controller.signal,
                  stream: (repairPrompt, signal, handlers) => runWpAdminModel(
                    [{ id: `wp-admin-gutenberg-repair:${Date.now().toString(36)}`, role: 'user', content: repairPrompt, createdAt: Date.now() } as ChatMessage],
                    '', signal, handlers, { sessionMode: 'chat', conversationId: wpAdminTurnConversationId(turnSessionKey, 'gutenberg-repair', userId) },
                  ),
                });
                const prepared = await prepareGutenbergAction(
                  action.capability.id,
                  repairedArguments,
                  `gutenberg-repair:${assistantId}:${index}`.slice(0, 160),
                  controller.signal,
                  binding,
                );
                turnEvents = completeWpAdminActivity(turnEvents, `${assistantId}:repair`, { label: translateUi("ui.wpAdminAgentFrameApp.gutenbergRepairPrepared") });
                return { arguments: prepared, contextBinding: binding };
              }
            },
          );
          if (executed.unavailable) {
            finalAssistantText = gutenbergActionUnavailableMessage(executed.unavailable);
            turnEvents = completeWpAdminActivity(turnEvents, `${assistantId}:execute`, { label: executed.unavailable.message });
            setPendingActions([]);
            setPendingClarification(null);
            updateAssistant({
              content: finalAssistantText, endedAt: Date.now(), status: undefined, runStatus: 'succeeded',
              events: sanitizeWpAdminAssistantEvents(turnEvents, finalAssistantText),
            });
            return;
          }
          turnEvents = completeWpAdminActivity(turnEvents, `${assistantId}:execute`, {
            label: translateUi("ui.wpAdminAgentFrameApp.wordpressChangesAppliedAndVerified"),
          });
          finalAssistantText = appendWpAdminResearchSources(wpAdminAutomaticActionSuccessMessage(executed.actions), turnGroundingResults);
          const rollbackReceipt = buildWpAdminRunRollbackReceipt(executed.actions, {
            contextScope: wpAdminTabContextKey(turnIdentity),
            conversationId: turnSessionKey,
            sourceMessageId: userId,
            tabId,
          });
          commitWorkingMemory = true;
          setPendingClarification(null);
          setPendingActions([]);
          updateAssistant({
            content: finalAssistantText,
            endedAt: Date.now(),
            status: undefined,
            runStatus: 'succeeded',
            rollbackReceipt,
            events: [
              ...turnEvents,
              { kind: 'status', label: translateUi("ui.wpAdminAgentFrameApp.committed") },
              { kind: 'text', text: finalAssistantText },
            ],
          });
          const activePostId = Number(new URL(window.location.href).searchParams.get('post') || 0);
          if (executed.reloadPostId > 0 && activePostId === executed.reloadPostId) {
            window.setTimeout(() => window.location.reload(), 700);
          }
          return;
        }
        const reviewActions = preparedActions.map((action) => ({ capabilityId: action.capability.id, arguments: action.initialArguments }));
        const systemPrompt = buildWpAdminSystemPrompt({ mode, context: turnContext, decision: preflight.decision, selectedSkillIds: preflight.decision.skillIds, memoryIndex, families: activeFamilies, skills: preflightSkills, activatedSkills: activatedGutenbergSkills, capabilityDetails: selectedCapabilityDetails, readOnlyResults, groundingResults: turnGroundingResults, reviewActions });
        const history: ChatMessage[] = [...currentTurnMessages, user].map((message) => ({
          id: message.id || `wp-admin-message:${Math.random().toString(36).slice(2)}`,
          role: message.role === 'user' ? 'user' : 'assistant',
          content: String(message.content || ''),
          createdAt: Number(message.createdAt || Date.now()),
          attachments: message.attachments,
        } as ChatMessage));
        let streamFailureMessage = '';
        let streamedAssistantText = '';
        await runWpAdminModel(history, systemPrompt, controller.signal, {
          onDelta: (delta) => {
            if (controller.signal.aborted) return;
            streamedAssistantText += delta;
            finalAssistantText = sanitizeWpAdminAssistantText(streamedAssistantText);
            updateAssistant({ content: finalAssistantText, events: sanitizeWpAdminAssistantEvents(turnEvents, finalAssistantText), status: 'streaming', runStatus: 'running', endedAt: undefined });
          },
          onDone: (fullText) => {
            if (controller.signal.aborted) return;
            streamedAssistantText = fullText || streamedAssistantText;
            const completion = wpAdminCompletionResult(
              sanitizeUnsupportedReviewClaim(sanitizeWpAdminAssistantText(streamedAssistantText), preparedActions.length > 0),
              preparedActions.length,
            );
            finalAssistantText = appendWpAdminResearchSources(completion.text, turnGroundingResults);
            commitWorkingMemory = completion.runStatus === 'succeeded';
            updateAssistant({ content: finalAssistantText, endedAt: Date.now(), status: undefined, runStatus: completion.runStatus, events: sanitizeWpAdminAssistantEvents(turnEvents, finalAssistantText) });
          },
          onError: (error) => {
            if (controller.signal.aborted) return;
            streamFailureMessage = wpAdminStreamFailureMessage(error, runnerLabel);
            finalAssistantText = streamFailureMessage;
            updateAssistant({
              content: streamFailureMessage,
              endedAt: Date.now(),
              status: undefined,
              runStatus: 'failed',
              events: sanitizeWpAdminAssistantEvents(settleActiveWpAdminActivities(turnEvents, 'failed', streamFailureMessage), streamFailureMessage),
            });
          },
          onAgentEvent: (event) => {
            if (controller.signal.aborted) return;
            turnEvents = mergeWpAdminProviderEvent(turnEvents, event);
            updateAssistant({ events: sanitizeWpAdminAssistantEvents(turnEvents, finalAssistantText) });
          },
        }, {
          skillIds: [...new Set([...preflight.decision.skillIds, ...activatedGutenbergSkills.map((skill) => skill.id)])],
          sessionMode: mode,
          assistantMessageId: assistantId,
          conversationId: wpAdminTurnConversationId(turnSessionKey, 'response', userId),
        });
        if (streamFailureMessage && !finalAssistantText) finalAssistantText = streamFailureMessage;
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        finalAssistantText = finalAssistantText || 'Stopped.';
        setPendingActions([]);
        updateAssistant({
          content: finalAssistantText,
          endedAt: Date.now(),
          status: undefined,
          runStatus: 'canceled',
        events: sanitizeWpAdminAssistantEvents([
          ...settleActiveWpAdminActivities(turnEvents, 'canceled', finalAssistantText),
          { kind: 'status', label: translateUi("routines.status.canceled") },
        ], finalAssistantText),
        });
      } else {
        finalAssistantText = wpAdminStreamFailureMessage(error, runnerLabel);
        updateAssistant({
          content: finalAssistantText,
          endedAt: Date.now(),
          status: undefined,
          runStatus: 'failed',
          events: sanitizeWpAdminAssistantEvents(settleActiveWpAdminActivities(turnEvents, 'failed', finalAssistantText), finalAssistantText),
        });
      }
    } finally {
      if (commitWorkingMemory && finalAssistantText) {
        const withUser = appendWpAdminWorkingMemoryTurn(turnMemoryInput, scopedMemory, { id: user.id || `user:${now}`, role: 'user', content: prompt, mode, createdAt: now });
        setWorkingMemory(appendWpAdminWorkingMemoryTurn(turnMemoryInput, withUser, { id: assistantId, role: 'assistant', content: finalAssistantText, mode, createdAt: Date.now() }));
      }
      setStreaming(false);
      if (abortRef.current === controller) abortRef.current = null;
      if (stopRunRef.current === stopCurrentRun) stopRunRef.current = null;
    }
  }, [translateUi, siteAccess.ready, siteAccess.error, siteAccess.guarded, agents, bridgeUpdateState.required, config, context, contextAuthority, contextIdentity, families, memoryIndex, memoryInput, mentions, messages, mode, pendingClarification, readExplicitTargetContext, refreshContext, runWpAdminModel, runtime, skillBranches, skills, tabId, workingMemory]);

  const currentUndoContextScope = contextIdentity ? wpAdminTabContextKey(contextIdentity) : '';
  const undoMessageId = useMemo(() => latestWpAdminUndoMessageId(messages, {
    contextScope: currentUndoContextScope,
    conversationId: sessionKey,
    tabId,
  }), [currentUndoContextScope, messages, sessionKey, tabId]);

  const undoWpAdminRun = useCallback(async (messageId: string) => {
    if (streaming || undoingMessageId) return;
    const message = messages.find((candidate) => candidate.id === messageId);
    const receipt = message?.rollbackReceipt;
    if (!receipt || messageId !== undoMessageId) return;
    setUndoingMessageId(messageId);
    try {
      await rollbackWpAdminActionRun(receipt);
      setMessages((current) => current.map((candidate) => candidate.id === messageId ? {
        ...candidate,
        content: `${String(candidate.content || '').trim()}\n\nUndo completed. Pixflow restored the WordPress state from before this run and verified the rollback.`.trim(),
        rollbackReceipt: { ...receipt, status: 'rolled_back' },
        events: [
          ...(Array.isArray(candidate.events) ? candidate.events : []),
          { kind: 'status', label: translateUi("ui.wpAdminAgentFrameApp.rolledBack") },
          { kind: 'text', text: 'Undo completed. Pixflow restored the WordPress state from before this run and verified the rollback.' },
        ],
      } : candidate));
      await refreshContext().catch(() => null);
      const reloadEditor = contextIdentity?.objectKind === 'post' && receipt.operations.some((operation) => (
        operation.capabilityId === 'pixflow/wp-admin/update-post'
        || operation.capabilityId === 'pixflow/wp-admin/gutenberg/apply-document'
      ));
      if (reloadEditor) window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessages((current) => current.map((candidate) => candidate.id === messageId ? {
        ...candidate,
        content: `${String(candidate.content || '').trim()}\n\nUndo could not be completed safely: ${detail}`.trim(),
        rollbackReceipt: { ...receipt, status: 'failed' },
        events: [
          ...(Array.isArray(candidate.events) ? candidate.events : []),
          { kind: 'error', code: 'wp_admin_undo_failed', message: detail },
          { kind: 'text', text: `Undo could not be completed safely: ${detail}` },
        ],
      } : candidate));
    } finally {
      setUndoingMessageId(null);
    }
  }, [translateUi, contextIdentity?.objectKind, messages, refreshContext, streaming, undoMessageId, undoingMessageId]);

  const openSettings = useCallback((section: SettingsSection = 'execution') => {
    setSettingsSection(section);
    setSettingsOpen(true);
  }, []);

  useBuilderHandoffReceiver({
    builder: handoffBuilder, enabled: siteAccess.ready && !siteAccess.error && !siteAccess.guarded && hydratedSessionKey === sessionKey && contextStatus === 'ready',
    busy: streaming || Boolean(abortRef.current) || Boolean(pendingDirectSiteRun(persistenceSurface)),
    target: () => resolveEditorRunTarget({ context: withGutenbergTarget(applyBuilderContext(context || {})) }, new AbortController().signal),
    start: async handoff => {
      if (abortRef.current || !siteAccess.ready || siteAccess.error || siteAccess.guarded) return false;
      await sendPrompt(handoff.receipt.brief, builderHandoffAttachments(handoff.receipt), [], undefined, handoff);
      return true;
    },
    notice: content => setMessages(current => [...current, { id: `handoff-notice:${Date.now()}`, role: 'assistant', content, createdAt: Date.now(), status: 'error', runStatus: 'failed' }]),
  });

  const pendingQuestion = latestQuestionRequest(messages);
  const activeQuestion = pendingQuestion && (directQuestion?.messageId === pendingQuestion.messageId ? directQuestion : pendingQuestion);
  const streamLoading = streaming && !messages.some((message) => message.role === 'assistant');

  return (
    <PixflowAgentSurfaceShell
      surface="wp_admin"
      className="pixflow-bricks-agent-react pixflow-design-token-scope app"
    >
      <SharedMessageStream
        logRef={logRef as MutableRefObject<HTMLDivElement | null>}
        loading={streamLoading}
        chatLogScrollable={chatLogScrollable}
        chatLogScrolling={false}
        emptyState={null}
        rows={(
          <>
          <ChatHistoryControls {...durableHistory} />
          <SharedChatRows
            messages={durableHistory.messages}
            fallbackAgentIdentity={fallbackAgentIdentity}
            paneStreaming={streaming}
            onOpenQuestions={siteAccess.guarded ? undefined : request => setDirectQuestion(request?.form ? request : null)}
            footerActionForMessage={(message) => message.id === undoMessageId && !streaming ? (
              <button
                type="button"
                className="assistant-copy-button od-tooltip"
                disabled={undoingMessageId === message.id}
                data-tooltip={undoingMessageId === message.id ? 'Undoing WordPress changes…' : 'Undo this WordPress run'}
                data-tooltip-placement="top"
                aria-label={undoingMessageId === message.id ? translateUi("ui.wpAdminAgentFrameApp.undoingWordpressChanges") : translateUi("ui.wpAdminAgentFrameApp.undoThisWordpressRun")}
                onClick={() => { void undoWpAdminRun(String(message.id || '')); }}
              >
                <Icon name={undoingMessageId === message.id ? 'spinner' : 'undo'} size={13} />
              </button>
            ) : null}
            t={t}
          />
          </>
        )}
        tailSpacerRef={tailSpacerRef as MutableRefObject<HTMLDivElement | null>}
        scrolledFromBottom={scrolledFromBottom}
        onJumpToBottom={() => {
          if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
          updateScrollState();
        }}
        scrollToLatestLabel={t('chat.scrollToLatest')}
        jumpToLatestLabel={t('chat.jumpToLatest')}
        loadingLabel="Thinking..."
        guidanceNode={bridgeUpdateState.required ? (
          <PixflowBridgeUpdateNotice compact className="pixflow-bricks-agent-react__bridge-update-chat-blocker" />
        ) : null}
        t={t}
      />

      <div className="pixflow-bricks-agent-react__composer-dock">
        <SiteAccessNotice access={siteAccess} />
        {activeQuestion && !siteAccess.guarded ? <QuestionRequestCard
          form={activeQuestion.form}
          reopenToken={directQuestion}
          onOpenDictationSettings={() => openSettings('dictation')}
          occurrenceKey={sessionKey + ':' + activeQuestion.messageId + ':' + activeQuestion.form.id}
          disabled={streaming || !siteAccess.ready || !!siteAccess.error}
          onSubmit={async text => {
            if (abortRef.current || !siteAccess.ready || siteAccess.error) return false;
            await sendPrompt(text, [], []);
          }}
        /> : null}
        <SharedComposerDock
          composerNode={(
            <SharedChatComposer
                    mcpProvider={config.mode !== 'api' ? selectedAdminAgent(config, agents)?.id ?? null : null}
                    queueStorageKey={composerStorageKey('pixflow:composer-queue:admin:' + sessionKey)}
                    queueOutcome={[...messages].reverse().find(message => message.role === 'assistant')?.runStatus}
                    acceptedSteeringIds={acceptedSteeringMessageIds(durableHistory.messages)}
                    onSteer={config.mode !== 'api' && ['codex', 'opencode'].includes(selectedAdminAgent(config, agents)?.id ?? '') ? item => steerDirectSite(persistenceSurface, item) : undefined}
                  codexVoiceEnabled={siteAccess.ready && !siteAccess.error && config.mode !== 'api' && selectedAdminAgent(config, agents)?.id === 'codex'}
                  annotationSupportsImages={config.mode !== 'api' && annotationImageInput(selectedAgent, selectedReadinessModel)}
              ref={composerRef}
              projectId={null}
              projectFiles={[]}
              streaming={streaming}
              sendDisabled={Boolean(!siteAccess.ready || !!siteAccess.error || (config.mode === 'daemon' && (agents.length === 0 || bridgeUpdateState.required)))}
              sessionMode={mode}
              sessionModeMenuExtra={<><EnhancedDesignGuidance surface="wp_admin" enabled={config.enhancedDesignGuidance} />{<DesignSystemSwitch />}</>}
              onSessionModeChange={selectSessionMode}
              draftStorageKey="pixflow-design:wp-admin-agent:draft"
              onEnsureProject={ensureDirectAttachmentProject}
              skills={skills.filter((skill) => isDiscoverableSkillMention(skill.id)).map(composerSkill)}
              lockedSkills={lockedSkills}
              footerAccessory={(
                <AvatarMenu
                  composerLabel
                  config={config}
                  agents={agents}
                  daemonLive={agents.length > 0}
                  onModeChange={(next) => persistExecutionConfig({ mode: next })}
                  onAgentChange={(id) => persistExecutionConfig({ agentId: id })}
                  onAgentModelChange={updateAgentModel}
                  onApiModelChange={(model) => persistExecutionConfig({ model })}
                  onExecutionChange={persistExecutionConfig}
                  onOpenSettings={openSettings}
                  onRefreshAgents={refreshExecutionAgents}
                  placement="up"
                  popoverZIndex={2000001}
                  popoverClassName="avatar-popover--bricks-agent"
                />
              )}
              workspaceContexts={workspaceContexts}
              activeWorkspaceContext={activeWorkspaceContext}
              requireQueueAcceptance={!siteAccess.guarded}
              onSend={(prompt, attachments, comments, meta, onAccepted) => {
                const sent = sendPrompt(prompt, attachments, comments, meta, undefined, onAccepted);
                if (onAccepted) return sent;
                void sent;
              }}
              onStop={() => {
                stopRunRef.current?.();
              }}
              onOpenSettings={openSettings}
              onOpenMcpSettings={() => openSettings('mcpClient')}
              researchAvailable={true}
              compactPlusMenu
              disableMentionPicker={false}
            />
          )}
          shouldPortal={false}
          slotRef={composerSlotRef}
          slotStyle={{}}
          portalTarget={null}
          portalRect={null}
          layerRef={composerLayerRef}
        />
      </div>

      {settingsOpen ? (
        <WpAdminSettingsController
          config={config}
          initialSection={settingsSection}
          onConfig={setConfig}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </PixflowAgentSurfaceShell>
  );
}
