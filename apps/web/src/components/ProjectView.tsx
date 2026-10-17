import { directRunStatus, runDirectSite } from '../pixflow/direct-site';
import { runByokSite } from '../pixflow/direct-site-byok';
import { hasSuccessfulToolResult, hasUncertainSiteDelivery, hasUnresolvedToolCall, SITE_DELIVERY_UNCERTAIN, SITE_DELIVERY_INSPECT_FIRST } from '../runtime/site-delivery';
import chatLayout from './ProjectChatLayout.module.css';
import { readWorkspaceFirstTurn, clearWorkspaceFirstTurn } from './workspace-first-turn';
import { mediaModelQuestionText } from '../media/wordpress-media-question';
import { useT as usePixflowUiTranslation } from '../i18n';
import { createFrameCheckpoint } from '../runtime/frame-checkpoint';
import { ChatForkOrigin } from './ChatForkOrigin';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence } from 'motion/react';
import { createHtmlArtifactManifest, inferLegacyManifest } from '../artifacts/manifest';
import {
  selectHtmlArtifactDeliverySource,
  type ArtifactDeliveryFailure,
} from '../artifacts/delivery';
import { resolveHtmlPointerArtifactTarget } from '../artifacts/pointer';
import { recoverHtmlDocumentFromMarkdownFence, recoverStandaloneHtmlDocument } from '../artifacts/recover';
import { createArtifactParser } from '../artifacts/parser';
import {
  findFirstQuestionForm,
  hasUnterminatedQuestionForm,
  parsePartialQuestionForm,
  type QuestionForm,
} from '../artifacts/question-form';
import { parseSubmittedAnswers } from './QuestionForm';
import { useI18n } from '../i18n';
import { streamMessage } from '../providers/anthropic';
import {
  fetchChatRunStatus,
  fetchVelaLoginStatus,
  listActiveChatRuns,
  listProjectRuns,
  reattachDaemonRun,
  reportChatRunFeedback,
  streamViaDaemon,
  steerChatRun,
} from '../providers/daemon';
import { isSpuriouslyFailedAssistantMessage } from '../runtime/run-reattach';
import { fetchElevenLabsVoiceOptions } from '../providers/elevenlabs-voices';
import { normalizeCustomReason } from '@open-design/contracts/analytics';
import {
  deletePreviewComment,
  fetchConnectorStatuses,
  fetchPreviewComments,
  fetchDesignSystem,
  fetchDesignTemplate,
  fetchProjectDesignSystemPackageAudit,
  fetchLiveArtifacts,
  fetchProjectFileText,
  fetchProjectFiles,
  fetchSkill,
  generateProjectMediaOnWordPress,
  patchPreviewCommentStatus,
  projectRawUrl,
  projectFileUrl,
  saveProjectFileToPixflowMedia,
  uploadProjectFiles,
  upsertPreviewComment,
  writeProjectTextFile,
} from '../providers/registry';
import { useProjectFileEvents, type ProjectEvent } from '../providers/project-events';
import { useCoalescedCallback } from '../hooks/useCoalescedCallback';
import {
  composeSystemPrompt,
  type AudioVoiceOption,
  type MemorySystemPromptResponse,
  type ResearchOptions,
} from '@open-design/contracts';
import {
  anonymizeArtifactId,
  artifactKindToTracking,
  projectKindToTracking,
} from '@open-design/contracts/analytics';
import type {
  TrackingArtifactKind,
  TrackingDesignSystemApplyTargetKind,
  TrackingDesignSystemOrigin,
  TrackingDesignSystemStatusValue,
} from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import {
  trackArtifactHeaderClick,
  trackComposerBarClick,
  trackDesignSystemApplyResult,
  trackPageView,
} from '../analytics/events';
import {
  clearOnboardingSessionId,
  peekOnboardingSessionId,
} from '../analytics/onboarding-session';
import { navigate } from '../router';
import { agentDisplayName, agentModelDisplayName } from '../utils/agentLabels';
import { isMacPlatform } from '../utils/platform';
import {
  canAutoRenameProjectFromPrompt,
  summarizeProjectNameFromPrompt,
} from '../utils/projectName';
import {
  apiExecutionAgentId,
  apiExecutionLabel,
  usesAnthropicProxy,
} from '../utils/apiProtocol';
import { playSound, showCompletionNotification } from '../utils/notifications';
import { randomUUID } from '../utils/uuid';
import { DEFAULT_NOTIFICATIONS } from '../state/config';
import type { TodoItem } from '../runtime/todos';
import { appendErrorStatusEvent } from '../runtime/chat-events';
import {
  applyDesignDeliveryOutcome,
  designDeliveryVerificationPending,
  resolveDesignDeliveryOutcome,
} from '../runtime/design-delivery';
import { RESUME_CONTINUE_PROMPT } from '../runtime/resume';
import { checkAmrBalanceGate } from '../runtime/amr-balance-gate';
import { AmrRunGateDialog, type AmrRunGateDecision } from './AmrRunGateDialog';
import {
  buildDesignSystemPackageAuditRepairPrompt,
  summarizeDesignSystemPackageAudit,
} from '../runtime/design-system-package-audit';
import { isLiveArtifactTabId, liveArtifactTabId } from '../types';
import {
  DESIGN_SYSTEM_WORKSPACE_DISPLAY_TITLE,
  isDesignSystemWorkspacePrompt,
} from '../design-system-auto-prompt';
import {
  createConversation,
  deleteConversation as deleteConversationApi,
  fetchAppliedPluginSnapshot,
  getTemplate,
  installGeneratedPluginFolder,
  listConversations,
  listMessages,
  loadTabs,
  patchConversation,
  patchProject,
  saveMessage,
  startGeneratedPluginShareTask,
  cacheTabsLocally,
  persistTabsToDaemonNow,
  listPlugins,
  type SaveMessageOptions,
  waitGeneratedPluginShareTask,
} from '../state/projects';
import type { AppliedPluginSnapshot, ChatAnalyticsEntryFrom, ChatSessionMode, InstalledPluginRecord, WorkspaceContextItem } from '@open-design/contracts';
import type {
  AgentEvent,
  AgentInfo,
  AppConfig,
  Artifact,
  ChatAttachment,
  ChatCommentAttachment,
  ChatMessage,
  ChatMessageFeedbackChange,
  Conversation,
  DesignSystemSummary,
  OpenTabsState,
  Project,
  ProjectMetadata,
  PreviewComment,
  PreviewCommentAttachment,
  PreviewCommentTarget,
  ProjectFile,
  ProjectTemplate,
  LiveArtifactEventItem,
  LiveArtifactSummary,
  SkillSummary,
} from '../types';
import { historyWithApiAttachmentContext } from '../api-attachment-context';
import {
  commentsToAttachments,
  historyWithCommentAttachmentContext,
  mergeAttachedComments,
  mergePreviewCommentAttachments,
  queuedSlideNavTarget,
  removeAttachedComment,
} from '../comments';
import { filterImplicitProducedFiles } from '../produced-files';
import { buildPptxExportPrompt } from '../lib/build-pptx-export-prompt';
import { AvatarMenu } from './AvatarMenu';
import { Icon } from './Icon';
import { PluginDetailsModal } from './PluginDetailsModal';
import { DesignSystemPreviewModal } from './DesignSystemPreviewModal';
import { ChatPane } from './ChatPane';
import { listMessagePage, prependHistoryPage } from '../state/chat-history';
import { retryWorkspaceHistoryWrites, subscribeWorkspaceHistoryWrites, workspaceHistoryPendingMessages, workspaceHistoryWriteFailed } from '../state/workspace-history-persistence';
import type { QuestionFormOpenRequest } from './AssistantMessage';
import type { ChatSendMeta } from './ChatComposer';
import { useIframeKeepAlivePool } from './IframeKeepAlivePool';
import {
  decideAutoOpenAfterWrite,
  selectAutoOpenProducedFileForSession,
} from './auto-open-file';
import { buildRepoImportPrompt, designSystemNeedsRepoConnect } from './design-system-github-evidence';
import { collectReferencedJsxNames } from '../runtime/jsx-module-refs';
import { BuilderDestinationControl } from './BuilderDestinationControl';
import { buildWorkspaceHandoffBrief } from '../pixflow/builder-handoff-brief';
import { useBuilderHandoff } from '../pixflow/use-builder-handoff';
import type { PixflowBuilderDestination } from '@open-design/contracts';
import { Button } from '@open-design/components';
import { WorkspaceSummary, WorkspaceSummaryToggle } from './WorkspaceSummary';
import { ChatExportButton } from '../pixflow/ChatExportButton';
import {
  type PluginFolderAgentAction,
} from './design-files/pluginFolderActions';
import { WorkspaceLoading } from './WorkspaceLoading';
import type { SettingsSection } from './SettingsDialog';
import { Toast } from './Toast';
import { useProjectDetail } from '../hooks/useProjectDetail';
import { effectiveMaxTokens } from '../state/maxTokens';
import { effectiveAgentModelChoice } from './agentModelSelection';
import { mediaExecutionPolicyForProjectMetadata } from '../media/execution-policy';
import { mediaModelProviderId } from '../media/models';
import { mediaProviderAgentIdentity } from '../media/mediaAgentIdentity';
import {
  fetchAIHubMixModels,
  useByokImageModelOptions,
  useByokVideoModelOptions,
  useByokSpeechModelOptions,
} from '../media/aihubmix-image-models';
import {
  configuredWordPressMediaModelChoices,
  findConfiguredWordPressMediaChoice,
  resolveWordPressImageSelection,
  shouldUseWordPressMediaRoute,
} from '../media/wordpress-media-selection';
import {
  buildFinalizeCredentialsMissingToast,
  buildFinalizeRequest,
} from '../lib/resolve-finalize-request';
import { PixflowProjectSyncControl } from './PixflowProjectSyncControl';
import { getPixflowWordPressConfig, hasPixflowWordPressContext } from '../pixflow/wordpress-context';
import {
  clearDirectSitemapPromptHandoff,
  readDirectSitemapPromptHandoff,
  type DirectSitemapPromptHandoff,
} from './sitemap/lib/sitemapPromptHandoff';


type ProjectChatSendMeta = ChatSendMeta & {
  queueOnly?: boolean;
  retryOfAssistantId?: string;
  sessionMode?: ChatSessionMode;
  /** Overrides the run_created / run_finished `entry_from` analytics prop for
   *  this send (e.g. 'resume_continue' from the resumable-failure Continue
   *  action). Behavior never depends on it; it only shapes PostHog props. */
  entryFrom?: ChatAnalyticsEntryFrom;
};

export function mergeSavedPreviewComment(current: PreviewComment[], saved: PreviewComment): PreviewComment[] {
  const existingIndex = current.findIndex((comment) => comment.id === saved.id);
  if (existingIndex < 0) return [...current, saved];
  return current.map((comment, index) => (index === existingIndex ? saved : comment));
}

function mergeServerMessageWithLocal(server: ChatMessage, local?: ChatMessage): ChatMessage {
  if (!local) return server;
  const merged: ChatMessage = { ...server };
  // WordPress message persistence is best effort and can lag behind the live
  // daemon stream. A completion refresh must never replace the longer local
  // assistant turn with an older "Working" snapshot.
  if (local.role === 'assistant' && server.role === 'assistant') {
    const localTerminalIsNewer =
      isTerminalRunStatus(local.runStatus) &&
      isActiveRunStatus(server.runStatus) &&
      (!server.runId || !local.runId || server.runId === local.runId);
    if ((local.content?.length ?? 0) > (server.content?.length ?? 0)) {
      merged.content = local.content;
    }
    if (
      localTerminalIsNewer ||
      (local.events?.length ?? 0) > (server.events?.length ?? 0)
    ) {
      merged.events = local.events;
    }
    if (localTerminalIsNewer) {
      merged.runStatus = local.runStatus;
    }
  }
  if (!server.producedFiles?.length && local.producedFiles?.length) {
    merged.producedFiles = local.producedFiles;
  }
  if (!server.preTurnFileNames?.length && local.preTurnFileNames?.length) {
    merged.preTurnFileNames = local.preTurnFileNames;
  }
  if (!server.lastRunEventId && local.lastRunEventId) {
    merged.lastRunEventId = local.lastRunEventId;
  }
  if (!server.startedAt && local.startedAt) {
    merged.startedAt = local.startedAt;
  }
  if (!server.endedAt && local.endedAt) {
    merged.endedAt = local.endedAt;
  }
  if (!server.runStatus && local.runStatus) {
    merged.runStatus = local.runStatus;
  }
  return merged;
}

export function mergeServerMessagesIntoConversation(
  current: ChatMessage[],
  serverMessages: ChatMessage[],
): ChatMessage[] {
  const currentById = new Map(current.map((message) => [message.id, message]));
  const serverIds = new Set(serverMessages.map((message) => message.id));
  const merged = serverMessages.map((message) =>
    mergeServerMessageWithLocal(message, currentById.get(message.id)),
  );
  for (const message of current) {
    if (!serverIds.has(message.id)) merged.push(message);
  }
  // A latest-page refresh must not append already-loaded older pages after the
  // new reply. Durable sequence numbers outrank client clocks; unsaved turns stay
  // at the tail until acknowledged. Daemon histories keep their existing order.
  if (serverMessages.some(message => (message.historySequence ?? 0) > 0)) {
    merged.sort((a, b) => {
      const first = a.historySequence ?? 0;
      const second = b.historySequence ?? 0;
      return first && second ? first - second : first ? -1 : second ? 1 : 0;
    });
  }
  return merged;
}

function projectPluginContextBlock(project: Project): string | null {
  const metadata = (project.metadata ?? {}) as ProjectMetadata & {
    pluginId?: string | null;
    pluginInputs?: Record<string, unknown> | null;
    pluginTitle?: string | null;
    examplePrompt?: boolean;
    examplePromptTitle?: string | null;
    examplePromptBrief?: Record<string, unknown> | null;
    contextPlugins?: Array<{ id?: string; title?: string; description?: string }> | null;
    pixflowPluginAssets?: Array<{ path?: string; sourcePath?: string; mime?: string }> | null;
  };
  const pluginId = typeof metadata.pluginId === 'string' ? metadata.pluginId.trim() : '';
  if (!pluginId) return null;

  const lines: string[] = [
    '## Active plugin context',
    '',
    `The user started this project from a Pixflow plugin modal. Treat this as a plugin replicate/use run, not a blank generic prototype.`,
    `Plugin ID: ${pluginId}`,
    `Plugin title: ${metadata.pluginTitle || project.name || pluginId}`,
  ];

  if (metadata.examplePromptTitle || metadata.examplePromptBrief) {
    lines.push('', '## Plugin example selected');
    if (metadata.examplePromptTitle) lines.push(`Title: ${metadata.examplePromptTitle}`);
    if (metadata.examplePromptBrief && typeof metadata.examplePromptBrief === 'object') {
      for (const [key, value] of Object.entries(metadata.examplePromptBrief)) {
        if (value === undefined || value === null || value === '') continue;
        lines.push(`- ${key}: ${String(value)}`);
      }
    }
  }

  const inputs = metadata.pluginInputs;
  if (inputs && typeof inputs === 'object' && !Array.isArray(inputs)) {
    const entries = Object.entries(inputs).filter(([, value]) => value !== undefined && value !== null && value !== '');
    if (entries.length > 0) {
      lines.push('', '## Plugin inputs');
      for (const [key, value] of entries) lines.push(`- ${key}: ${String(value)}`);
    }
  }

  const contextPlugins = Array.isArray(metadata.contextPlugins) ? metadata.contextPlugins : [];
  if (contextPlugins.length > 0) {
    lines.push('', '## Related plugin context');
    for (const item of contextPlugins) {
      const title = item.title || item.id || 'Plugin';
      lines.push(`- ${title}${item.description ? `: ${item.description}` : ''}`);
    }
  }

  const pluginAssets = Array.isArray(metadata.pixflowPluginAssets) ? metadata.pixflowPluginAssets : [];
  if (pluginAssets.length > 0) {
    lines.push('', '## Mirrored plugin files');
    lines.push(`The selected plugin assets are staged under plugin-assets/${pluginId}/ in this project before the run starts.`);
    for (const asset of pluginAssets.slice(0, 20)) {
      const source = asset.sourcePath || asset.path;
      if (source) lines.push(`- ${source}`);
    }
  }

  lines.push(
    '',
    'When producing the result, preserve the selected plugin/example intent and use any available project files or attached assets before inventing replacements.',
  );

  return lines.join('\n');
}

function historyWithInternalPluginContext(history: ChatMessage[], project: Project): ChatMessage[] {
  const block = projectPluginContextBlock(project);
  if (!block || history.length === 0) return history;
  const next = [...history];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const message = next[i];
    if (message?.role !== 'user') continue;
    next[i] = {
      ...message,
      content: `${block}\n\n## User request\n\n${message.content}`,
    };
    return next;
  }
  return history;
}

interface Props {
  /** WordPress Workspace keeps the shared chat primary; files open on demand. */
  project: Project;
  routeFileName: string | null;
  /**
   * Routed conversation id. When set (the URL is
   * `/projects/:id/conversations/:cid[/...]`), the project view picks
   * this conversation as active instead of defaulting to `list[0]`.
   * Falls through to the default picker if the conversation does not
   * exist (e.g. the run was deleted between the route landing and the
   * conversation list loading). Issue #1505. Optional so existing
   * test harnesses that mount ProjectView with a stub props bag do
   * not have to be updated; production callers in `App.tsx` always
   * pass the value from `useRoute()`.
   */
  routeConversationId?: string | null;
  config: AppConfig;
  agents: AgentInfo[];
  // Mentionable functional skills — already filtered by config.disabledSkills
  // upstream, so this drives only the chat composer's @-picker scope. For
  // resolving an existing project's `skillId` (which can also point at a
  // design template after the skills/design-templates split) use
  // `designTemplates` as a fallback in composedSystemPrompt() and in the
  // skill-name / skill-mode lookups below.
  skills: SkillSummary[];
  // All known design templates (unfiltered). Required so projects created
  // from the Templates surface keep composing the template body in API
  // mode even when the user later disables the template in Settings.
  designTemplates: SkillSummary[];
  designSystems: DesignSystemSummary[];
  daemonLive: boolean;
  daemonConfigLoaded?: boolean;
  onModeChange: (mode: AppConfig['mode']) => void;
  onExecutionChange?: (patch: Partial<AppConfig>) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: { model?: string; reasoning?: string; fastMode?: boolean },
  ) => void;
  onRefreshAgents: (options?: { useOptionalBridge?: boolean }) => void;
  onThemeChange?: (theme: AppConfig['theme']) => void;
  onOpenSettings: (section?: SettingsSection) => void;
  onOpenAmrSettings?: () => void;
  onOpenMcpSettings?: () => void;
  onBrowsePlugins?: () => void;
  onOpenConnectors?: () => void;
  // Pet wiring forwarded to the chat composer so users can adopt /
  // wake / tuck a pet without leaving the project view.
  onAdoptPetInline?: (petId: string) => void;
  onTogglePet?: () => void;
  onOpenPetSettings?: () => void;
  onBack: () => void;
  onClearPendingPrompt: () => void;
  onTouchProject: () => void;
  onProjectChange: (next: Project) => void;
  onProjectsRefresh: () => void;
  onChangeDefaultDesignSystem?: (designSystemId: string | null) => void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
}

interface QueuedChatSend {
  id: string;
  conversationId: string;
  prompt: string;
  attachments: ChatAttachment[];
  commentAttachments: ChatCommentAttachment[];
  meta?: ProjectChatSendMeta;
  createdAt: number;
  dispatchState?: 'sending' | 'unconfirmed' | 'paused';
}

type QueuedSendDelivery = { accepted: () => void; failed: () => void; isCurrent: () => boolean };

interface QueuedChatSendUpdate {
  prompt: string;
  attachments: ChatAttachment[];
  commentAttachments: ChatCommentAttachment[];
  meta?: ChatSendMeta;
}

let liveArtifactEventSequence = 0;
const DESIGN_SYSTEM_AUDIT_AUTO_REPAIR_ATTEMPTS = 2;
// Trailing-debounce window for the canonical (daemon + SQLite) tab-state write.
// Embedded-browser navigation bursts settle well within this; the local cache
// is written immediately so nothing is lost if the daemon write is coalesced.
const TAB_PERSIST_DEBOUNCE_MS = 400;
type DesignSystemReviewEntry = NonNullable<ProjectMetadata['designSystemReview']>[string];
type DesignSystemReviewAgentTask = NonNullable<DesignSystemReviewEntry['agentTask']>;
interface DesignSystemReviewDetails {
  feedback?: string;
  files?: string[];
  agentTask?: DesignSystemReviewAgentTask;
}

function designSystemFeedbackAttachments(
  projectFiles: ProjectFile[],
  sectionFiles: string[],
): ChatAttachment[] {
  const fileLookup = new Map(projectFiles.map((file) => [file.name, file]));
  return sectionFiles
    .map((name) => fileLookup.get(name))
    .filter((file): file is ProjectFile => Boolean(file))
    .slice(0, 8)
    .map((file) => ({
      path: file.name,
      name: file.name,
      kind: file.kind === 'image' ? 'image' : 'file',
      size: file.size,
    }));
}

function chatAttachmentsFromPreviewCommentImages(
  images: PreviewCommentAttachment[] | undefined,
): ChatAttachment[] {
  if (!Array.isArray(images)) return [];
  const seen = new Set<string>();
  const out: ChatAttachment[] = [];
  for (const image of images) {
    const path = image.path.trim();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    out.push({
      path,
      name: image.name.trim() || path.split('/').pop() || path,
      kind: 'image',
    });
  }
  return out;
}

function mergeChatAttachments(...groups: ChatAttachment[][]): ChatAttachment[] {
  const seen = new Set<string>();
  const out: ChatAttachment[] = [];
  for (const group of groups) {
    for (const attachment of group) {
      const path = attachment.path.trim();
      if (!path || seen.has(path)) continue;
      seen.add(path);
      out.push({ ...attachment, path });
    }
  }
  return out;
}

function historyWithWorkspaceContext(
  history: ChatMessage[],
  messageId: string,
  context: ChatSendMeta['context'] | undefined,
): ChatMessage[] {
  const items = context?.workspaceItems ?? [];
  if (items.length === 0) return history;
  const block = [
    '',
    '',
    '<active-workspace-context>',
    'Pixflow Design selected the currently focused workspace tab as the default context for this turn.',
    ...items.map((item, index) => {
      const details = [
        item.path ? `path: ${item.path}` : null,
        item.absolutePath ? `absolute: ${item.absolutePath}` : null,
        item.url ? `url: ${item.url}` : null,
        item.title ? `title: ${item.title}` : null,
        item.tabId ? `tab: ${item.tabId}` : null,
      ].filter(Boolean).join(' | ');
      return [
        `${index + 1}. ${item.kind}: ${item.label}${details ? ` | ${details}` : ''}`,
        item.content ? `content:\n${item.content}` : '',
      ].filter(Boolean).join('\n');
    }),
    '</active-workspace-context>',
  ].join('\n');
  return history.map((message) =>
    message.id === messageId && message.role === 'user'
      ? { ...message, content: `${message.content}${block}` }
      : message,
  );
}

function sitemapBriefWorkspaceContextFromHandoff(
  handoff: DirectSitemapPromptHandoff | null | undefined,
): WorkspaceContextItem | null {
  const content = (
    handoff?.sitemapBriefMarkdown ||
    handoff?.sitemapBrief?.briefMarkdown ||
    ''
  ).trim();
  if (!content) return null;
  return {
    id: `sitemap-brief:${handoff?.targetWpPostId ?? 'current'}`,
    kind: 'sitemap-brief',
    label: handoff?.stageChip?.label || 'Sitemap brief',
    title: handoff?.stageChip?.detail || handoff?.sitemapBrief?.websiteType || handoff?.pageTitle || 'Sitemap brief',
    content,
  };
}

function commentTaskQuery(attachment: ChatCommentAttachment): string {
  return (attachment.comment ?? '').trim();
}

function commentTaskContextAttachment(attachment: ChatCommentAttachment): ChatCommentAttachment {
  return {
    ...attachment,
    comment: '',
    commentContext: 'query',
  };
}

function designSystemNeedsWorkPrompt(
  sectionTitle: string,
  feedback: string,
  sectionFiles: string[],
): string {
  const fileList =
    sectionFiles.length > 0
      ? sectionFiles.map((name) => `- @${name}`).join('\n')
      : '- No generated files are registered for this section yet.';
  return (
    `Needs work on the design system section "${sectionTitle}".\n\n` +
    `User feedback:\n${feedback}\n\n` +
    `Relevant section files:\n${fileList}\n\n` +
    'Revise the design-system project files directly. Keep DESIGN.md, tokens, previews, UI kit examples, and assets consistent with the feedback. ' +
    'After editing, summarize what changed and which files should be reviewed again.'
  );
}


function autoSendFirstMessageKey(projectId: string): string {
  return `od:auto-send-first:${projectId}`;
}

function autoSendAttachmentsKey(projectId: string): string {
  return `od:auto-send-attachments:${projectId}`;
}

function generatedMediaSyncKey(projectId: string, file: ProjectFile): string {
  return `pixflow:wp-media-sync:${projectId}:${file.name}:${file.mtime}:${file.size}`;
}

function isGeneratedMediaProjectFile(file: ProjectFile): boolean {
  if (file.type === 'dir') return false;
  if (file.kind === 'image' || file.kind === 'video' || file.kind === 'audio') return true;
  return /^(image|video|audio)\//i.test(file.mime || '');
}

function mediaSurfaceForProjectFile(file: ProjectFile): 'image' | 'video' | 'audio' {
  if (file.kind === 'video' || /^video\//i.test(file.mime || '')) return 'video';
  if (file.kind === 'audio' || /^audio\//i.test(file.mime || '')) return 'audio';
  return 'image';
}

function designSystemAuditAutoRepairKey(projectId: string): string {
  return `od:design-system-audit-auto-repair:${projectId}`;
}

function readAutoSendAttachments(projectId: string): ChatAttachment[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(autoSendAttachmentsKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredChatAttachment);
  } catch {
    return [];
  }
}

function clearAutoSendSession(projectId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(autoSendFirstMessageKey(projectId));
    window.sessionStorage.removeItem(autoSendAttachmentsKey(projectId));
  } catch {
    /* ignore */
  }
}

function markDesignSystemAuditAutoRepairEligible(projectId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      designSystemAuditAutoRepairKey(projectId),
      String(DESIGN_SYSTEM_AUDIT_AUTO_REPAIR_ATTEMPTS),
    );
  } catch {
    /* ignore */
  }
}

function consumeDesignSystemAuditAutoRepair(projectId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const key = designSystemAuditAutoRepairKey(projectId);
    const raw = window.sessionStorage.getItem(key);
    const attemptsRemaining = raw ? Number.parseInt(raw, 10) : 0;
    if (!Number.isFinite(attemptsRemaining) || attemptsRemaining <= 0) {
      window.sessionStorage.removeItem(key);
      return false;
    }
    const nextAttemptsRemaining = attemptsRemaining - 1;
    if (nextAttemptsRemaining > 0) {
      window.sessionStorage.setItem(key, String(nextAttemptsRemaining));
    } else {
      window.sessionStorage.removeItem(key);
    }
    return true;
  } catch {
    return false;
  }
}

function clearDesignSystemAuditAutoRepair(projectId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(designSystemAuditAutoRepairKey(projectId));
  } catch {
    /* ignore */
  }
}

function isDesignSystemWorkspaceMetadata(metadata: ProjectMetadata | undefined): boolean {
  return metadata?.importedFrom === 'design-system';
}

function isStoredChatAttachment(value: unknown): value is ChatAttachment {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.path === 'string' &&
    record.path.length > 0 &&
    typeof record.name === 'string' &&
    record.name.length > 0 &&
    (record.kind === 'image' || record.kind === 'file') &&
    (record.size === undefined || typeof record.size === 'number') &&
    (record.order === undefined || typeof record.order === 'number')
  );
}

function workspaceContextItemEqual(
  a: WorkspaceContextItem | null,
  b: WorkspaceContextItem | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.kind === b.kind &&
    a.label === b.label &&
    (a.tabId ?? '') === (b.tabId ?? '') &&
    (a.path ?? '') === (b.path ?? '') &&
    (a.absolutePath ?? '') === (b.absolutePath ?? '') &&
    (a.url ?? '') === (b.url ?? '') &&
    (a.title ?? '') === (b.title ?? '')
  );
}

function workspaceContextItemsEqual(
  a: WorkspaceContextItem[],
  b: WorkspaceContextItem[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, index) => workspaceContextItemEqual(item, b[index] ?? null));
}

function appendLiveArtifactEventItem(
  prev: LiveArtifactEventItem[],
  event: LiveArtifactEventItem['event'],
): LiveArtifactEventItem[] {
  liveArtifactEventSequence += 1;
  const next = [...prev, { id: liveArtifactEventSequence, event }];
  return next.length > 50 ? next.slice(next.length - 50) : next;
}

// React key for the on-screen question form. Deliberately does NOT include the
// form's parsed `id`: there is at most one (first) form per assistant message,
// so `${conversation}:${message}` is already a stable, unique identity for the
// occurrence. Folding the parsed id in would remount the panel mid-stream — the
// preview shows the `discovery` fallback until the body `id` streams in, and a
// form that emits answerable questions before its `id` would flip identity
// while the user is mid-answer, dropping their selections. A distinct later
// form lives in a different assistant message, so it still gets its own key
// (and replays the reveal) without relying on the id.
export function buildQuestionFormKey(
  conversationId: string | null,
  assistantMessageId: string | null,
  hasForm: boolean,
): string | null {
  return conversationId && assistantMessageId && hasForm
    ? `${conversationId}:${assistantMessageId}`
    : null;
}

function shouldFetchElevenLabsVoiceOptions(project: Project): boolean {
  const metadata = project.metadata;
  return metadata?.kind === 'audio'
    && metadata.audioKind === 'speech'
    && metadata.audioModel === 'elevenlabs-v3'
    && !metadata.voice;
}

// The media model the user picked in the New Project → Media dialog, keyed by
// surface. For BYOK providers (AIHubMix) media is produced by the generate_*
// chat tools whose default model comes from the per-request byok*Model field —
// NOT the `od media generate` dispatcher — so without this seed the dialog pick
// is dropped and the conversation falls back to the Settings default. Returns
// undefined for non-media projects (and when the field is empty) so callers fall
// back to the Settings default exactly as before. The daemon re-validates the id
// against the active provider's registry, so a mismatched pick is safely ignored.
function projectMediaModelSeed(
  metadata: ProjectMetadata | null | undefined,
  surface: 'image' | 'video' | 'speech',
): string | undefined {
  if (!metadata) return undefined;
  if (surface === 'image' && metadata.kind === 'image') {
    return metadata.imageModel?.trim() || undefined;
  }
  if (surface === 'video' && metadata.kind === 'video') {
    return metadata.videoModel?.trim() || undefined;
  }
  if (surface === 'speech' && metadata.kind === 'audio' && metadata.audioKind === 'speech') {
    return metadata.audioModel?.trim() || undefined;
  }
  return undefined;
}

function projectMediaVoiceSeed(
  metadata: ProjectMetadata | null | undefined,
): string | undefined {
  if (metadata?.kind === 'audio' && metadata.audioKind === 'speech') {
    return metadata.voice?.trim() || undefined;
  }
  return undefined;
}

// Carry the creation-time model pick into the conversation ONLY when it belongs
// to the active BYOK provider. Guards against clobbering a user's Settings
// default with a model from a different provider — e.g. a SenseAudio user whose
// image project was created with the dialog's default `gpt-image-2` keeps their
// configured SenseAudio model instead of being forced to the registry default.
// AIHubMix's live (`aihubmix-` prefixed) ids resolve via mediaModelProviderId
// without waiting on the async catalogue, so the AIHubMix path still seeds.
function byokModelSeedForProtocol(
  metadata: ProjectMetadata | null | undefined,
  surface: 'image' | 'video' | 'speech',
  protocol: string | undefined,
): string | undefined {
  const picked = projectMediaModelSeed(metadata, surface);
  if (!picked) return undefined;
  const provider = mediaModelProviderId(picked);
  return provider === protocol
    || (provider === 'nanobanana' && protocol === 'google')
    ? picked
    : undefined;
}

function answeredMediaModelValue(
  history: ChatMessage[],
  userMessageContent: string,
): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    if (message?.role !== 'assistant') continue;
    const form = findFirstQuestionForm(message.content ?? '')?.form;
    if (!form || form.id !== 'media-model') continue;
    const answers = parseSubmittedAnswers(form, userMessageContent);
    const value = answers?.model;
    return typeof value === 'string' ? value.trim() || undefined : undefined;
  }
  return undefined;
}

function previousMediaPrompt(history: ChatMessage[]): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    if (message?.role !== 'user') continue;
    const text = (message.content ?? '').trim();
    if (!text || /^\[form answers\b/i.test(text)) continue;
    return text;
  }
  return undefined;
}

function projectEventToAgentEvent(evt: ProjectEvent): LiveArtifactEventItem['event'] | null {
  if (evt.type === 'file-changed') return null;
  if (evt.type === 'conversation-created') return null;
  if (evt.type === 'live_artifact') {
    return {
      kind: 'live_artifact',
      action: evt.action,
      projectId: evt.projectId,
      artifactId: evt.artifactId,
      title: evt.title,
      refreshStatus: evt.refreshStatus,
    };
  }
  return {
    kind: 'live_artifact_refresh',
    phase: evt.phase,
    projectId: evt.projectId,
    artifactId: evt.artifactId,
    refreshId: evt.refreshId,
    title: evt.title,
    refreshedSourceCount: evt.refreshedSourceCount,
    error: evt.error,
  };
}

export function ProjectView({
  project,
  routeFileName,
  routeConversationId = null,
  config,
  agents,
  skills,
  designTemplates,
  designSystems,
  daemonLive,
  daemonConfigLoaded = true,
  onModeChange,
  onExecutionChange,
  onAgentChange,
  onAgentModelChange,
  onRefreshAgents,
  onThemeChange,
  onOpenSettings,
  onOpenAmrSettings,
  onOpenMcpSettings,
  onBrowsePlugins,
  onOpenConnectors,
  onAdoptPetInline,
  onTogglePet,
  onOpenPetSettings,
  onBack,
  onClearPendingPrompt,
  onTouchProject,
  onProjectChange,
  onProjectsRefresh,
  onChangeDefaultDesignSystem,
  onDesignSystemsRefresh,
}: Props) {
  const translateUi = usePixflowUiTranslation();
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  const iframeKeepAlivePool = useIframeKeepAlivePool();
  const handleThemeChange = onThemeChange ?? (() => {});
  // P0 page_view page_name=chat_panel — fire once per project mount.
  // ProjectView outlives conversation switches (ChatPane is keyed by
  // activeConversationId so it remounts when the user switches chats,
  // but this component does not), so page_view stays a "chat-panel
  // entry" metric instead of becoming a "conversation switch" count.
  // Reviewer #2285 (mrcfps, 2026-05-20 04:08) flagged the previous
  // ChatComposer-level emit for skewing the funnel.
  const chatPanelPageViewFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (chatPanelPageViewFiredRef.current === project.id) return;
    chatPanelPageViewFiredRef.current = project.id;
    trackPageView(analytics.track, { page_name: 'chat_panel' });
    // Onboarding's 4th step ("生成进度页") fires here, not in
    // `DesignSystemDetailView`: the Generate path navigates
    // straight to the project's chat_panel, not to the design
    // system detail surface. If an onboarding session id is still
    // in sessionStorage we stamp the funnel's last row here and
    // clear so any later DS visit doesn't inherit the attribution.
    // E2E (2026-05-21) confirmed this is the only path users
    // actually take — observed: page_view chat_panel fires, but
    // page_view design_system_project never did because that
    // route isn't visited from the embedded onboarding generate.
    const onboardingSessionId = peekOnboardingSessionId();
    if (onboardingSessionId) {
      trackPageView(analytics.track, {
        page_name: 'onboarding',
        area: 'generation_progress',
        step_index: 'progress',
        step_name: 'generation',
        onboarding_session_id: onboardingSessionId,
      });
      clearOnboardingSessionId();
    }
  }, [analytics.track, project.id]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null,
  );
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );
  const activeSessionMode = activeConversation?.sessionMode ?? 'design';
  const [messagesConversationId, setMessagesConversationId] = useState<string | null>(null);
  const [failedMessagesConversationId, setFailedMessagesConversationId] = useState<string | null>(null);
  const [conversationLoadError, setConversationLoadError] = useState<string | null>(null);
  const [messageLoadRetryNonce, setMessageLoadRetryNonce] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [olderMessagesCursor, setOlderMessagesCursor] = useState<string | null>(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [olderMessagesError, setOlderMessagesError] = useState(false);
  const historyPageGeneration = useRef(0);
  const historyContextLoading = useRef(false);
  const [historyWriteError, setHistoryWriteError] = useState(false);
  useEffect(() => {
    const update = () => setHistoryWriteError(Boolean(activeConversationId && workspaceHistoryWriteFailed(project.id,activeConversationId)));
    update();
    return subscribeWorkspaceHistoryWrites(update);
  }, [project.id,activeConversationId]);
  const retryHistoryWrites = useCallback(async () => {
    if (activeConversationId) await retryWorkspaceHistoryWrites(project.id,activeConversationId);
  }, [project.id,activeConversationId]);
  useEffect(() => {
    if (!hasPixflowWordPressContext() || !activeConversationId) return;
    const retry = () => { void retryHistoryWrites(); };
    window.addEventListener('online',retry);
    const timer = window.setInterval(retry,15000);
    return () => { window.removeEventListener('online',retry); window.clearInterval(timer); };
  }, [activeConversationId,retryHistoryWrites]);
  const [forkingMessageId, setForkingMessageId] = useState<string | null>(null);
  const forkInFlight = useRef(false);
  const forkRequests = useRef(new Map<string, string>());
  const [activePluginActionPaths, setActivePluginActionPaths] = useState<Set<string>>(() => new Set());
  const [hiddenAssistantPluginActionPaths, setHiddenAssistantPluginActionPaths] = useState<Set<string>>(() => new Set());
  const [forceStreamingPluginMessageIds, setForceStreamingPluginMessageIds] = useState<Set<string>>(() => new Set());
  // Ephemeral, live-only accumulation of a tool call's streaming JSON input,
  // keyed by tool-use id (globally unique per run). Fed by `onToolInputDelta`
  // while the model is still emitting `input_json_delta`; dropped per-id once
  // the full `tool_use` lands and wiped when the run ends. Never persisted —
  // see daemon `daemonAgentPayloadToPersistedAgentEvent` (returns null).
  // `seq` records how many persisted events existed when the tool started
  // streaming, so the renderer can place the live card at the tool call's
  // position in the message (text before it = preamble, after it = hedging).
  const [liveToolInput, setLiveToolInput] = useState<Record<string, { name: string; text: string; seq: number }>>({});
  // True once the initial DB read for the active conversation has settled.
  // Auto-send gates on this so it can't fire before listMessages resolves and
  // race-clobber the freshly-pushed user + assistant placeholder. Without
  // this, the auto-send writes [user, assistant] into state, then the still
  // in-flight listMessages PUT response arrives, runs setMessages(list), and
  // wipes both — leaving the daemon's run with no client-side message to
  // attach the runId to.
  const [messagesInitialized, setMessagesInitialized] = useState(false);
  const [previewComments, setPreviewComments] = useState<PreviewComment[]>([]);
  // Mirror so the send-now interrupt path can read the current statuses
  // synchronously without re-creating its callback on every comment change.
  const previewCommentsRef = useRef<PreviewComment[]>([]);
  useEffect(() => {
    previewCommentsRef.current = previewComments;
  }, [previewComments]);
  const [attachedComments, setAttachedComments] = useState<PreviewComment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null);
  // Safety net: drop any live tool-input partials whose tool never produced a
  // full `tool_use` (run errored/canceled mid-call) once streaming settles.
  useEffect(() => {
    if (!streaming) setLiveToolInput((prev) => (Object.keys(prev).length ? {} : prev));
  }, [streaming]);
  const [error, setError] = useState<string | null>(null);
  const [audioVoiceOptionsError, setAudioVoiceOptionsError] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [filesRefresh, setFilesRefresh] = useState(0);
  // True while a working-dir replace is reindexing the new folder. Surfaced
  // to the Design Files panel so the file list shows a loading state instead
  // of silently sitting on the old tree for the few seconds the scan takes.
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const projectFilesRef = useRef<ProjectFile[]>([]);
  const [liveArtifacts, setLiveArtifacts] = useState<LiveArtifactSummary[]>([]);
  const [liveArtifactEvents, setLiveArtifactEvents] = useState<LiveArtifactEventItem[]>([]);
  const [summaryOpen, setSummaryOpen] = useState(Boolean(routeFileName));
  const [destinationDialogOpen, setDestinationDialogOpen] = useState(false);
  const [agentHandoffSource, setAgentHandoffSource] = useState<{conversationId:string;requestId:string}|null>(null);
  const [builderDestination, setBuilderDestination] = useState<{ chatId: string; value: PixflowBuilderDestination } | null>(null);
  const builderChatId = `${project.id}:${routeConversationId ?? ''}`;
  const builderBrief = useMemo(() => buildWorkspaceHandoffBrief(project.name, messages, projectFiles, project.id), [project.name, project.id, messages, projectFiles]);
  const builderHandoff = useBuilderHandoff(project.id, activeConversationId || routeConversationId || '', hasPixflowWordPressContext(), builderBrief.assets, {
    requestId: agentHandoffSource?.conversationId === activeConversationId ? agentHandoffSource.requestId : null,
    running: streaming && streamingConversationId === activeConversationId,
  });
  useEffect(() => { setDestinationDialogOpen(false); setAgentHandoffSource(null); }, [builderChatId]);

  const closeSummary = useCallback(() => {
    setSummaryOpen(false);
    document.querySelector<HTMLButtonElement>('[aria-controls="pixflow-chat-summary"]')?.focus();
  }, []);
  // Per-session override for the BYOK chat's generate_image tool. Seeded once
  // from the New Project → Media model pick (project.metadata.imageModel) — but
  // only when that pick belongs to the active BYOK provider (see
  // byokModelSeedForProtocol) — falling back to the Settings default
  // (config.byokImageModel) otherwise. Subsequent selections live only in this
  // component's state — page refresh / project switch resets to this seed.
  // Persistent defaults live in Settings → BYOK → Image generation model.
  const [byokImageModelOverride, setByokImageModelOverride] = useState<string>(
    () => byokModelSeedForProtocol(project.metadata, 'image', config.apiProtocol) ?? config.byokImageModel ?? '',
  );
  // Same per-session override for the BYOK chat's generate_video tool, seeded
  // from the project's videoModel pick (provider-gated), then Settings.
  const [byokVideoModelOverride, setByokVideoModelOverride] = useState<string>(
    () => byokModelSeedForProtocol(project.metadata, 'video', config.apiProtocol) ?? config.byokVideoModel ?? '',
  );
  // Same per-session overrides for the BYOK chat's generate_speech tool (model +
  // voice), seeded from the project's speech pick (provider-gated), then Settings.
  const [byokSpeechModelOverride, setByokSpeechModelOverride] = useState<string>(
    () => byokModelSeedForProtocol(project.metadata, 'speech', config.apiProtocol) ?? config.byokSpeechModel ?? '',
  );
  // Voice only carries when the speech model itself is carried (same provider),
  // so a cross-provider voice id never leaks into the request.
  const [byokSpeechVoiceOverride, setByokSpeechVoiceOverride] = useState<string>(
    () => (byokModelSeedForProtocol(project.metadata, 'speech', config.apiProtocol)
      ? projectMediaVoiceSeed(project.metadata)
      : undefined) ?? config.byokSpeechVoice ?? '',
  );
  // The creation-time model belongs to the project, while the composer
  // dropdown is a deliberate per-turn override. Track that distinction so a
  // cross-provider New Project pick is not silently replaced by the Settings
  // default, but a model the user explicitly changes in the chat composer is
  // still honored for the next media request.
  const byokImageModelUserSelectedRef = useRef(false);
  const byokVideoModelUserSelectedRef = useRef(false);
  const byokSpeechModelUserSelectedRef = useRef(false);
  const byokSpeechVoiceUserSelectedRef = useRef(false);
  const handleByokImageModelChange = useCallback((value: string) => {
    byokImageModelUserSelectedRef.current = true;
    setByokImageModelOverride(value);
  }, []);
  const handleByokVideoModelChange = useCallback((value: string) => {
    byokVideoModelUserSelectedRef.current = true;
    setByokVideoModelOverride(value);
  }, []);
  const handleByokSpeechModelChange = useCallback((value: string) => {
    byokSpeechModelUserSelectedRef.current = true;
    setByokSpeechModelOverride(value);
  }, []);
  const handleByokSpeechVoiceChange = useCallback((value: string) => {
    byokSpeechVoiceUserSelectedRef.current = true;
    setByokSpeechVoiceOverride(value);
  }, []);
  useEffect(() => {
    byokImageModelUserSelectedRef.current = false;
    byokVideoModelUserSelectedRef.current = false;
    byokSpeechModelUserSelectedRef.current = false;
    byokSpeechVoiceUserSelectedRef.current = false;
  }, [project.id]);
  // Live model option lists (same hooks the composer/Settings pickers use) so
  // the chat "default" (no explicit pick) resolves to the FIRST catalogue model
  // shown in the dropdown — not a hardcoded id. The daemon keeps its own
  // fallback for when the catalogue hasn't loaded.
  const byokImageModelOptionsPV = useByokImageModelOptions(config.apiProtocol);
  const byokVideoModelOptionsPV = useByokVideoModelOptions(config.apiProtocol);
  const byokSpeechModelOptionsPV = useByokSpeechModelOptions(config.apiProtocol);
  const projectDetail = useProjectDetail(project.id);
  const [projectActionsToast, setProjectActionsToast] = useState<{
    message: string;
    details: string | null;
    code?: string | null;
  } | null>(null);
  const [chatSeed, setChatSeed] = useState<{ id: string; value: string } | null>(null);
  const [amrRunGate, setAmrRunGate] = useState<{
    kind: 'hard' | 'soft';
    reason?: 'insufficient' | 'signed_out';
    snapshot: import('@open-design/contracts').AmrWalletSnapshot;
    resolve: (decision: AmrRunGateDecision) => void;
  } | null>(null);
  const amrGateInFlightRef = useRef(false);
  const [autoAuditRepairSeed, setAutoAuditRepairSeed] =
    useState<{ id: string; value: string } | null>(null);
  // The persisted set of open tabs + active tab. Persisted via PUT on every
  // change; loaded once when the project mounts.
  const [openTabsState, setOpenTabsState] = useState<OpenTabsState>({
    tabs: [],
    active: null,
  });
  const routeFileNameRef = useRef(routeFileName);
  routeFileNameRef.current = routeFileName;
  const [activeWorkspaceContext, setActiveWorkspaceContext] =
    useState<WorkspaceContextItem | null>(null);
  const [workspaceContexts, setWorkspaceContexts] = useState<WorkspaceContextItem[]>([]);
  const tabsLoadedRef = useRef(false);
  const tabsHydratedFromSavedStateRef = useRef(false);
  const hasAppliedInitialPrimaryOpenRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const cancelRef = useRef<AbortController | null>(null);
  // Runs explicitly superseded by a "send now" interrupt. Their abort
  // controller is recorded here synchronously — before handleStop() clears the
  // active refs — so the run's late terminal callbacks (which the daemon still
  // delivers for a canceled run) can be recognized as stale and skip every
  // current-run side effect, independent of abortRef churn. A WeakSet so a
  // finished run's controller is collected once nothing else references it.
  const supersededRunsRef = useRef<WeakSet<AbortController>>(new WeakSet());
  const streamingConversationIdRef = useRef<string | null>(null);
  const [queuedChatSends, setQueuedChatSends] = useState<QueuedChatSend[]>([]);
  const queuedChatSendsRef = useRef<QueuedChatSend[]>([]);
  const sendTextBufferRef = useRef<BufferedTextUpdates | null>(null);
  const reattachTextBuffersRef = useRef<Set<BufferedTextUpdates>>(new Set());
  const reattachControllersRef = useRef<Map<string, AbortController>>(new Map());
  const reattachCancelControllersRef = useRef<Map<string, AbortController>>(new Map());
  const completedReattachRunsRef = useRef<Set<string>>(new Set());
  const transientFailedReattachRetriesRef = useRef<Map<string, number>>(new Map());
  const [reattachRecoveryTick, setReattachRecoveryTick] = useState(0);
  const finalizingLocalRunIdsRef = useRef<Set<string>>(new Set());
  const startingQueuedChatSendIdRef = useRef<string | null>(null);
  const queuedDispatchGeneration = useRef(0);
  const sendAdmissionGeneration = useRef(0);
  const [queuedAutoStartTick, setQueuedAutoStartTick] = useState(0);
  const skillCache = useRef<Map<string, string>>(new Map());
  const designCache = useRef<Map<string, string>>(new Map());
  const templateCache = useRef<Map<string, ProjectTemplate>>(new Map());
  // We auto-save the most recent artifact to the project folder. Track the
  // last name we persisted so re-renders during streaming don't spawn
  // duplicate writes.
  const savedArtifactRef = useRef<string | null>(null);
  // Pending Write tool invocations: tool_use_id -> destination basename.
  // When the matching tool_result lands we refresh the file list and open
  // the file as a tab once. Keying off the tool_use_id (rather than
  // diffing the file list at end-of-turn) lets us auto-open the moment
  // the agent's Write actually completes, without the previous synthetic
  // "live" tab that was causing flicker against manual opens.
  const pendingWritesRef = useRef<Map<string, string>>(new Map());
  // Track which conversation the current messages belong to, so we can
  // correctly gate new-conversation creation even during async loads.
  const messagesConversationIdRef = useRef<string | null>(null);
  const creatingConversationRef = useRef(false);
  // Last conversation id this view pushed into the URL. Lets the
  // route -> active-conversation sync tell a genuine external navigation
  // apart from the URL merely lagging a local conversation switch.
  const lastSyncedConversationIdRef = useRef<string | null>(null);
  // Live mirror of the currently-viewed project id. Used to bail out of
  // the conversation-created async refresh (#1361) if the user switches
  // projects while the refetch is in flight — the existing project-load
  // effects use the same kind of cancellation guard.
  const projectIdRef = useRef(project.id);
  useEffect(() => {
    projectIdRef.current = project.id;
  }, [project.id]);
  useEffect(() => {
    setChatSeed(null);
    setAutoAuditRepairSeed(null);
    queuedDispatchGeneration.current++;
    startingQueuedChatSendIdRef.current = null;
    const restored = loadQueuedChatSends(project.id);
    queuedChatSendsRef.current = restored;
    setQueuedChatSends(restored);
    return () => { queuedDispatchGeneration.current++; startingQueuedChatSendIdRef.current = null; };
  }, [project.id]);
  // Monotonic token bumped on every `conversation-created` refresh dispatch.
  // Two rapid events (e.g. concurrent routine runs against the same reused
  // project, #1502) can start overlapping `listConversations` calls; if the
  // later request resolves first with N+1 conversations and the earlier
  // request resolves afterwards with only N, an unconditional
  // `setConversations(list)` would drop the newest conversation. Each
  // dispatch captures the token at start; only the dispatch whose token
  // still equals `conversationsRefreshTokenRef.current` at await-return is
  // allowed to apply its result.
  const conversationsRefreshTokenRef = useRef(0);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const currentConversationHasActiveRun = useMemo(
    () => messages.some((m) => m.role === 'assistant' && isActiveRunStatus(m.runStatus)),
    [messages],
  );
  const currentConversationLoading = Boolean(
    activeConversationId
      && messagesConversationId !== activeConversationId
      && failedMessagesConversationId !== activeConversationId,
  );
  const currentConversationStreaming = streaming && streamingConversationId === activeConversationId;
  const currentConversationBusy = currentConversationLoading
    || currentConversationStreaming
    || currentConversationHasActiveRun;
  const currentConversationAwaitingActiveRunAttach =
    currentConversationHasActiveRun && !currentConversationStreaming;
  const currentConversationSendDisabled = currentConversationLoading
    || failedMessagesConversationId === activeConversationId
    || currentConversationAwaitingActiveRunAttach;
  const currentConversationActionDisabled = currentConversationBusy || currentConversationSendDisabled;
  const currentConversationQueueDisabled = currentConversationLoading
    || failedMessagesConversationId === activeConversationId;

  // The discovery question form lives in the right-hand Questions tab. We
  // derive it from the latest assistant message: if that message embeds a
  // <question-form> block, the panel renders it. The form is interactive
  // only while it's the most recent turn and the user hasn't answered yet
  // (an answer arrives as a following "[form answers …]" user message).
  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') return i;
    }
    return -1;
  }, [messages]);
  const lastAssistantContent =
    lastAssistantIndex >= 0 ? messages[lastAssistantIndex]?.content ?? '' : '';
  const lastAssistantMessageId =
    lastAssistantIndex >= 0 ? messages[lastAssistantIndex]?.id ?? null : null;
  const questionForm: QuestionForm | null = useMemo(
    () => findFirstQuestionForm(lastAssistantContent)?.form ?? null,
    [lastAssistantContent],
  );
  const questionFormSubmittedAnswers = useMemo(() => {
    if (!questionForm) return undefined;
    for (let i = lastAssistantIndex + 1; i < messages.length; i++) {
      const m = messages[i];
      if (m?.role !== 'user') continue;
      const parsed = parseSubmittedAnswers(questionForm, m.content ?? '');
      if (parsed) return parsed;
    }
    return undefined;
  }, [questionForm, lastAssistantIndex, messages]);
  const questionsGenerating =
    currentConversationStreaming && hasUnterminatedQuestionForm(lastAssistantContent);
  // While the form is still streaming, parse it tolerantly so the Questions tab
  // can show a frame (title) immediately and fill questions in as they arrive.
  const questionFormPreview = useMemo(
    () => (questionsGenerating ? parsePartialQuestionForm(lastAssistantContent) : null),
    [questionsGenerating, lastAssistantContent],
  );
  // The active (latest, unanswered) form stays editable the whole time it's on
  // screen — while it streams in AND while the turn is still busy — so it never
  // flickers between the locked (grey) and interactive (accent) styles.
  // Submission is gated separately by the panel via `submitDisabled`/generating.
  const questionFormActive =
    (!!questionForm || questionsGenerating) && questionFormSubmittedAnswers === undefined;
  // Mirror `questionFormActive`'s unanswered gate: once the user answers, the
  // Questions tab closes, so the auto-focus nonce must not treat an answered
  // form as a freshly appeared one.
  const hasQuestions =
    Boolean(questionForm || questionsGenerating) && questionFormSubmittedAnswers === undefined;
  // Stable identity for the current form occurrence, used to remember that its
  // one-by-one reveal already played. Keyed on the conversation + the hosting
  // assistant message id (not the message index, and NOT the parsed form id —
  // see buildQuestionFormKey). The assistant message id is allocated once and
  // kept in place across the streaming→persisted swap (same `assistantId`
  // throughout), so it survives the brief unmount/re-focus of the Questions tab
  // without replaying the animation, yet differs for every distinct form
  // occurrence (each lives in its own assistant message).
  const questionFormKey = useMemo(
    () =>
      buildQuestionFormKey(
        activeConversationId,
        lastAssistantMessageId,
        Boolean(questionForm ?? questionFormPreview),
      ),
    [activeConversationId, lastAssistantMessageId, questionForm, questionFormPreview],
  );

  // Release #3661: let a past question form be manually re-opened in the
  // Questions panel. Layered on top of main's stable questionFormKey (#3644) —
  // the `displayed*` values fall back to the live form when nothing is manually
  // pinned, so both fixes coexist.
  const [manualQuestionFormRequest, setManualQuestionFormRequest] =
    useState<QuestionFormOpenRequest | null>(null);
  useEffect(() => {
    setManualQuestionFormRequest(null);
  }, [project.id, activeConversationId]);
  useEffect(() => {
    if (hasQuestions && questionFormKey) setManualQuestionFormRequest(null);
  }, [hasQuestions, questionFormKey]);
  const displayedQuestionForm = manualQuestionFormRequest?.form ?? questionForm;
  const displayedQuestionFormPreview = manualQuestionFormRequest ? null : questionFormPreview;
  const displayedQuestionFormSubmittedAnswers =
    manualQuestionFormRequest?.submittedAnswers ?? questionFormSubmittedAnswers;
  const displayedQuestionFormActive = manualQuestionFormRequest ? false : questionFormActive;
  const displayedQuestionsGenerating = manualQuestionFormRequest ? false : questionsGenerating;
  const displayedQuestionFormKey = manualQuestionFormRequest
    ? `${activeConversationId ?? 'conversation'}:${manualQuestionFormRequest.messageId}:${manualQuestionFormRequest.form.id}:manual`
    : questionFormKey;

  // Auto-switch the workspace to the Questions tab when a new discovery form
  // first appears, and let the chat banner re-focus it on click. The nonce
  // bump is what FileWorkspace listens to.
  const [questionsFocusNonce, setQuestionsFocusNonce] = useState(0);
  const prevHasQuestionsRef = useRef(false);
  useEffect(() => {
    if (hasQuestions && !prevHasQuestionsRef.current) {
      setQuestionsFocusNonce((n) => n + 1);
    }
    prevHasQuestionsRef.current = hasQuestions;
  }, [hasQuestions]);
  const focusQuestionsRequest = useMemo(
    () => (questionsFocusNonce > 0 ? { nonce: questionsFocusNonce } : null),
    [questionsFocusNonce],
  );
  const submittedAnswersForQuestionFormRequest = useCallback((request: QuestionFormOpenRequest) => {
    const assistantIndex = messages.findIndex((m) => m.id === request.messageId);
    if (assistantIndex < 0) return null;
    for (let i = assistantIndex + 1; i < messages.length; i++) {
      const m = messages[i];
      if (!m) continue;
      if (m.role === 'assistant') break;
      if (m.role !== 'user') continue;
      const parsed = parseSubmittedAnswers(request.form, m.content ?? '');
      if (parsed) return parsed;
    }
    return null;
  }, [messages]);
  const openQuestionsTab = useCallback((request?: QuestionFormOpenRequest) => {
    if (request) {
      const opensCurrentLiveForm =
        request.messageId === lastAssistantMessageId
        && questionForm?.id === request.form.id
        && questionFormSubmittedAnswers === undefined;
      if (opensCurrentLiveForm) {
        setManualQuestionFormRequest(null);
      } else {
        setManualQuestionFormRequest({
          ...request,
          submittedAnswers:
            request.submittedAnswers ?? submittedAnswersForQuestionFormRequest(request) ?? undefined,
        });
      }
    }
    setQuestionsFocusNonce((n) => n + 1);
  }, [
    lastAssistantMessageId,
    questionForm,
    questionFormSubmittedAnswers,
    submittedAnswersForQuestionFormRequest,
  ]);

  const currentConversationQueuedItems = activeConversationId
    ? queuedChatSends
        .filter((item) => item.conversationId === activeConversationId)
        .map((item) => {
          const queuedItem = {
            id: item.id,
            prompt: item.prompt,
            attachments: item.attachments,
            commentAttachments: item.commentAttachments,
            dispatchState: item.dispatchState,
          };
          if (item.meta === undefined) return queuedItem;
          return { ...queuedItem, meta: item.meta };
        })
    : [];
  const newConversationDisabled = creatingConversation;
  const activeCompletionNotificationRunsRef = useRef<Set<string>>(new Set());
  const completedNotificationRunsRef = useRef<Set<string>>(new Set());

  // Load conversations on project switch. If none exist (older projects
  // pre-conversations, or a freshly created one whose default seed got
  // dropped), create one on the fly.
  useEffect(() => {
    let cancelled = false;
    setConversations([]);
    setActiveConversationId(null);
    setMessagesConversationId(null);
    setFailedMessagesConversationId(null);
    setMessageLoadRetryNonce(0);
    setConversationLoadError(null);
    setMessages([]);
    setPreviewComments([]);
    setAttachedComments([]);
    setStreaming(false);
    streamingConversationIdRef.current = null;
    setStreamingConversationId(null);
    setError(null);
    setAudioVoiceOptionsError(null);
    setArtifact(null);
    savedArtifactRef.current = null;
    pendingWritesRef.current.clear();
    (async () => {
      try {
        const list = await listConversations(project.id);
        if (cancelled) return;
        if (list.length === 0) {
          const fresh = await createConversation(project.id);
          if (cancelled) return;
          if (fresh) {
            setConversations([fresh]);
            setActiveConversationId(fresh.id);
          } else {
            throw new Error(translateUi("ui.projectView.feedback72"));
          }
        } else {
          setConversations(list);
          // Issue #1505: when the URL deep-links to a specific
          // conversation, prefer that one. Falls through to list[0]
          // when the routed id is null or no longer present (the
          // routine row may have been deleted between the route
          // landing and the conversation list loading).
          const routedMatch = routeConversationId
            ? list.find((c) => c.id === routeConversationId) ?? null
            : null;
          setActiveConversationId(routedMatch ? routedMatch.id : list[0]!.id);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Could not load conversations for this project.';
        setConversations([]);
        setActiveConversationId(null);
        setConversationLoadError(message);
        setError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  // Issue #1505: when the URL changes the routed conversation id while
  // we are already inside the project (e.g. the user clicks "Open
  // project" on a different routine history row in the same project),
  // switch the active conversation without re-fetching the list.
  // Guards: only acts when the routed id is non-null AND present in
  // the already-loaded list, and only when it differs from the current
  // active id. Falls through to a no-op for stale / missing routes so
  // the default picker above keeps its result.
  useEffect(() => {
    if (!routeConversationId) {
      lastSeenRouteConversationIdRef.current = null;
      return;
    }
    if (conversations.length === 0) return;
    if (routeConversationId === activeConversationId) return;
    // When the route still points at the conversation this view last
    // pushed to the URL, the mismatch means a local switch (new
    // conversation, history pick) moved activeConversationId ahead and
    // the URL sync below has not caught up yet. Following the stale
    // route here would fight that sync and remount ChatPane in a loop,
    // so only react to a genuinely external navigation.
    if (routeConversationId === lastSyncedConversationIdRef.current) return;
    if (lastSeenRouteConversationIdRef.current === routeConversationId) return;
    lastSeenRouteConversationIdRef.current = routeConversationId;
    const match = conversations.find((c) => c.id === routeConversationId);
    if (!match) return;
    setActiveConversationId(routeConversationId);
  }, [routeConversationId, conversations, activeConversationId]);


  // Load messages whenever the active conversation changes. This happens
  // on project mount (after conversations load) and on user-triggered
  // conversation switches.
  useEffect(() => {
    ++historyPageGeneration.current;
    ++sendAdmissionGeneration.current;
    setOlderMessagesCursor(null);
    setLoadingOlderMessages(false);
    setOlderMessagesError(false);
    if (!activeConversationId) {
      setMessages([]);
      setMessagesInitialized(false);
      setPreviewComments([]);
      setAttachedComments([]);
      setMessagesConversationId(null);
      setFailedMessagesConversationId(null);
      messagesConversationIdRef.current = null;
      setStreaming(false);
      streamingConversationIdRef.current = null;
      setStreamingConversationId(null);
      return;
    }
    // Reset the initialized flag so auto-send waits for the new
    // conversation's DB read to settle before checking messages.length.
    setMessagesInitialized(false);
    let cancelled = false;
    setMessages([]);
    setPreviewComments([]);
    setAttachedComments([]);
    setArtifact(null);
    setMessagesConversationId(null);
    setFailedMessagesConversationId(null);
    setStreaming(false);
    streamingConversationIdRef.current = null;
    setStreamingConversationId(null);
    savedArtifactRef.current = null;
    pendingWritesRef.current.clear();
    if (messagesConversationIdRef.current !== activeConversationId) {
      messagesConversationIdRef.current = null;
    }
    (async () => {
      try {
        if (hasPixflowWordPressContext()) await retryWorkspaceHistoryWrites(project.id,activeConversationId);
        if (cancelled) return;
        const [page, comments] = await Promise.all([
          listMessagePage(project.id, activeConversationId),
          fetchPreviewComments(project.id, activeConversationId),
        ]);
        if (cancelled) return;
        const pending = hasPixflowWordPressContext() ? workspaceHistoryPendingMessages(project.id,activeConversationId) : [];
        setMessages(prependHistoryPage(pending,page.messages));
        setOlderMessagesCursor(page.nextCursor ?? null);
        setMessagesInitialized(true);
        setPreviewComments(comments);
        setAttachedComments([]);
        setArtifact(null);
        setError(null);
        savedArtifactRef.current = null;
        pendingWritesRef.current.clear();
        messagesConversationIdRef.current = activeConversationId;
        setMessagesConversationId(activeConversationId);
        setFailedMessagesConversationId(null);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Could not load messages for this conversation.';
        setMessages([]);
        setPreviewComments([]);
        setAttachedComments([]);
        setArtifact(null);
        setError(message);
        savedArtifactRef.current = null;
        pendingWritesRef.current.clear();
        messagesConversationIdRef.current = null;
        setMessagesConversationId(null);
        setFailedMessagesConversationId(activeConversationId);
      }
    })();
    return () => {
      cancelled = true;
      sendAdmissionGeneration.current++;
    };
  }, [project.id, activeConversationId, messageLoadRetryNonce]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeConversationId || !olderMessagesCursor || loadingOlderMessages) return;
    const generation = historyPageGeneration.current;
    setLoadingOlderMessages(true);
    setOlderMessagesError(false);
    try {
      const page = await listMessagePage(project.id, activeConversationId, olderMessagesCursor);
      if (generation !== historyPageGeneration.current) return;
      setMessages(current => prependHistoryPage(current, page.messages));
      setOlderMessagesCursor(page.nextCursor ?? null);
    } catch {
      if (generation === historyPageGeneration.current) setOlderMessagesError(true);
    } finally {
      if (generation === historyPageGeneration.current) setLoadingOlderMessages(false);
    }
  }, [project.id, activeConversationId, olderMessagesCursor, loadingOlderMessages]);

  useEffect(() => {
    return () => {
      sendTextBufferRef.current?.cancel();
      sendTextBufferRef.current = null;
      // Unmounts / conversation switches should only detach local stream
      // consumers. Aborting the daemon cancel controllers here turns routine
      // cleanup into an explicit POST /api/runs/:id/cancel, which can mark a
      // live run canceled even when the user never clicked Stop.
      abortRef.current?.abort();
      abortRef.current = null;
      cancelRef.current = null;
      for (const textBuffer of reattachTextBuffersRef.current) textBuffer.cancel();
      reattachTextBuffersRef.current.clear();
      for (const controller of reattachControllersRef.current.values()) {
        if (abortRef.current === controller) abortRef.current = null;
        controller.abort();
      }
      for (const controller of reattachCancelControllersRef.current.values()) {
        // Route changes should only detach the browser-side SSE listener.
        // Aborting this signal maps to POST /cancel, so leave the daemon run alive.
        if (cancelRef.current === controller) cancelRef.current = null;
      }
      reattachControllersRef.current.clear();
      reattachCancelControllersRef.current.clear();
    };
  }, [project.id, activeConversationId]);

  const cancelSendTextBuffer = useCallback((flushPending = false) => {
    if (flushPending) sendTextBufferRef.current?.flush();
    sendTextBufferRef.current?.cancel();
    sendTextBufferRef.current = null;
  }, []);

  const cancelReattachTextBuffers = useCallback((flushPending = false) => {
    for (const textBuffer of reattachTextBuffersRef.current) {
      if (flushPending) textBuffer.flush();
      textBuffer.cancel();
    }
    reattachTextBuffersRef.current.clear();
  }, []);

  const notifyCompletedRun = useCallback((last: ChatMessage) => {
    // Round 7 (mrcfps @ useDesignMdState.ts:131): a chat turn just
    // settled — conversation updatedAt almost certainly moved, so
    // recompute DESIGN.md staleness even when the turn produced no
    // file mutations or live artifacts.

    const status =
      last.resultDeliveryState === 'no_result' ||
      last.resultDeliveryState === 'delivery_failed'
        ? 'failed'
        : last.runStatus;
    if (status !== 'succeeded' && status !== 'failed') return;

    const cfg = config.notifications ?? DEFAULT_NOTIFICATIONS;
    if (cfg.soundEnabled) {
      playSound(status === 'succeeded' ? cfg.successSoundId : cfg.failureSoundId);
    }

    if (cfg.desktopEnabled) {
      // Successes only interrupt when the user is on another tab/window.
      // Failures alert regardless — losing a long agent run silently is
      // worse than a small interruption when the page is in focus.
      const isHidden = typeof document !== 'undefined' && document.hidden;
      const isFocused = typeof document === 'undefined' ? true : document.hasFocus();
      if (status === 'failed' || isHidden || !isFocused) {
        const title = status === 'succeeded'
          ? t('notify.successTitle')
          : t('notify.failureTitle');
        const fallbackBody = status === 'succeeded'
          ? t('notify.successBody')
          : t('notify.failureBody');
        const trimmed = (last.content ?? '').trim();
        const body = trimmed ? trimmed.slice(0, 80) : fallbackBody;
        void showCompletionNotification({
          status,
          title,
          body,
          onClick: () => {
            if (typeof window !== 'undefined') window.focus();
          },
        });
      }
    }
  }, [config.notifications, t]);

  // Fire completion feedback from assistant run-status transitions rather than
  // from the local SSE listener state. A run can finish while its conversation
  // is detached; when the user returns, the terminal status should still produce
  // the one completion notification for runs this view previously saw active.
  useEffect(() => {
    const completedMessages: ChatMessage[] = [];
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      const keys = message.runId ? [message.runId, message.id] : [message.id];
      if (isActiveRunStatus(message.runStatus)) {
        for (const key of keys) activeCompletionNotificationRunsRef.current.add(key);
        continue;
      }
      if (message.runStatus !== 'succeeded' && message.runStatus !== 'failed') continue;
      if (message.runStatus === 'succeeded' && designDeliveryVerificationPending(message)) continue;
      if (!keys.some((key) => activeCompletionNotificationRunsRef.current.has(key))) continue;
      if (keys.some((key) => completedNotificationRunsRef.current.has(key))) continue;
      for (const key of keys) completedNotificationRunsRef.current.add(key);
      completedMessages.push(message);
    }

    for (const message of completedMessages) notifyCompletedRun(message);
  }, [messages, notifyCompletedRun]);

  // Hydrate the open-tabs state once per project. After this initial
  // load, every mutation flows through saveTabsState() which keeps DB +
  // local state coherent.
  useEffect(() => {
    let cancelled = false;
    tabsLoadedRef.current = false;
    tabsHydratedFromSavedStateRef.current = false;
    hasAppliedInitialPrimaryOpenRef.current = false;
    setOpenTabsState({ tabs: [], active: null });
    (async () => {
      const state = await loadTabs(project.id);
      if (cancelled) return;
      const routeActive = routeFileNameRef.current;
      let nextState = routeActive
        ? {
            ...state,
            tabs: state.tabs.includes(routeActive)
              ? state.tabs
              : [...state.tabs, routeActive],
            active: routeActive,
          }
        : state;
      if (routeActive) {
        nextState = cacheTabsLocally(project.id, nextState);
        void persistTabsToDaemonNow(project.id, nextState);
      }
      tabsHydratedFromSavedStateRef.current = state.hasSavedState === true;
      setOpenTabsState(nextState);
      tabsLoadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  // Debounce the canonical (daemon + SQLite) tab-state write. The embedded
  // browser fans out url/title/favicon updates in bursts on a single page load
  // (did-navigate, did-navigate-in-page, page-title-updated, favicon), and each
  // used to be a localStorage write + HTTP PUT + SQLite UPDATE + re-render.
  // We keep React state and the local cache IMMEDIATE (so the UI and a reload
  // are never stale) and coalesce only the daemon PUT.
  const tabsDaemonSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDaemonTabsRef = useRef<OpenTabsState | null>(null);
  const flushTabsDaemonSave = useCallback(() => {
    if (tabsDaemonSaveTimerRef.current != null) {
      clearTimeout(tabsDaemonSaveTimerRef.current);
      tabsDaemonSaveTimerRef.current = null;
    }
    const pending = pendingDaemonTabsRef.current;
    pendingDaemonTabsRef.current = null;
    if (pending) void persistTabsToDaemonNow(project.id, pending);
  }, [project.id]);

  const persistTabsState = useCallback(
    (next: OpenTabsState) => {
      setOpenTabsState(next);
      if (!tabsLoadedRef.current) return;
      // Immediate, cheap, synchronous — keeps the cache canonical for reload.
      const stamped = cacheTabsLocally(project.id, next);
      pendingDaemonTabsRef.current = stamped;
      if (tabsDaemonSaveTimerRef.current != null) {
        clearTimeout(tabsDaemonSaveTimerRef.current);
      }
      tabsDaemonSaveTimerRef.current = setTimeout(() => {
        tabsDaemonSaveTimerRef.current = null;
        const pending = pendingDaemonTabsRef.current;
        pendingDaemonTabsRef.current = null;
        if (pending) void persistTabsToDaemonNow(project.id, pending);
      }, TAB_PERSIST_DEBOUNCE_MS);
    },
    [project.id],
  );

  // Flush any pending tab write when the project changes or the view unmounts,
  // so a fast project switch / close doesn't leave the daemon a debounce behind.
  useEffect(() => flushTabsDaemonSave, [flushTabsDaemonSave]);

  const handleActiveWorkspaceContextChange = useCallback((next: WorkspaceContextItem | null) => {
    setActiveWorkspaceContext((current) =>
      workspaceContextItemEqual(current, next) ? current : next,
    );
  }, []);

  const handleWorkspaceContextsChange = useCallback((next: WorkspaceContextItem[]) => {
    setWorkspaceContexts((current) =>
      workspaceContextItemsEqual(current, next) ? current : next,
    );
  }, []);

  const refreshProjectFiles = useCallback(async (): Promise<ProjectFile[]> => {
    const next = await fetchProjectFiles(project.id, { activeWorkspace: true });
    projectFilesRef.current = next;
    setProjectFiles(next);
    return next;
  }, [project.id]);

  useEffect(() => {
    projectFilesRef.current = projectFiles;
  }, [projectFiles]);

  const mediaSyncInFlightRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaFiles = projectFiles.filter(isGeneratedMediaProjectFile);
    if (mediaFiles.length === 0) return;

    for (const file of mediaFiles) {
      const key = generatedMediaSyncKey(project.id, file);
      if (mediaSyncInFlightRef.current.has(key)) continue;
      if (window.localStorage.getItem(key) === '1') continue;

      mediaSyncInFlightRef.current.add(key);
      const latestUserPrompt = [...messages]
        .reverse()
        .find((message) => message.role === 'user' && message.content.trim() !== '')
        ?.content.trim() ?? '';
      const generatedPrompt =
        project.pendingPrompt?.trim()
        || project.customInstructions?.trim()
        || latestUserPrompt;
      void saveProjectFileToPixflowMedia({
        projectId: project.id,
        filePath: file.name,
        mimeType: file.mime,
        prompt: generatedPrompt,
        surface: mediaSurfaceForProjectFile(file),
      })
        .then(() => {
          window.localStorage.setItem(key, '1');
        })
        .catch(() => {
          // Best effort: project files remain available even if WP Media sync
          // fails because the bridge is offline or the site rejects uploads.
        })
        .finally(() => {
          mediaSyncInFlightRef.current.delete(key);
        });
    }
  }, [messages, project.id, project.pendingPrompt, project.customInstructions, projectFiles]);

  // Cache HTML file contents so the auto-open module check (issue #2744) does
  // not re-fetch unchanged entries on every Write. Keyed by file name with the
  // mtime stored alongside, so a rewrite REPLACES the file's single entry
  // rather than accreting a new key. Bounded by the project's HTML file count.
  const htmlContentCacheRef = useRef<Map<string, { mtime: number; text: string | null }>>(
    new Map(),
  );
  const readProjectHtml = useCallback(
    async (name: string): Promise<string | null> => {
      const file = projectFilesRef.current.find((entry) => entry.name === name);
      const mtime = file?.mtime ?? 0;
      const cached = htmlContentCacheRef.current.get(name);
      if (cached && cached.mtime === mtime) return cached.text;
      try {
        const response = await fetch(projectRawUrl(project.id, name));
        const text = response.ok ? await response.text() : null;
        htmlContentCacheRef.current.set(name, { mtime, text });
        return text;
      } catch {
        htmlContentCacheRef.current.set(name, { mtime, text: null });
        return null;
      }
    },
    [project.id],
  );

  const refreshLiveArtifacts = useCallback(async (): Promise<LiveArtifactSummary[]> => {
    const next = await fetchLiveArtifacts(project.id);
    setLiveArtifacts(next);
    return next;
  }, [project.id]);

  const refreshWorkspaceItems = useCallback(async (): Promise<ProjectFile[]> => {
    const [nextFiles] = await Promise.all([refreshProjectFiles(), refreshLiveArtifacts()]);
    return nextFiles;
  }, [refreshLiveArtifacts, refreshProjectFiles]);

  useEffect(() => {
    if (!tabsLoadedRef.current) return;
    if (hasAppliedInitialPrimaryOpenRef.current) return;
    if (routeFileName) return;
    if (openTabsState.active || openTabsState.tabs.length > 0) {
      hasAppliedInitialPrimaryOpenRef.current = true;
      return;
    }
    if (tabsHydratedFromSavedStateRef.current) {
      hasAppliedInitialPrimaryOpenRef.current = true;
      return;
    }
    const primaryFile = selectPrimaryProjectFile(projectFiles);
    if (!primaryFile) return;
    hasAppliedInitialPrimaryOpenRef.current = true;
    persistTabsState({ tabs: [primaryFile.name], active: primaryFile.name });
  }, [openTabsState.active, openTabsState.tabs.length, persistTabsState, projectFiles, routeFileName]);

  const requestOpenFile = useCallback((name: string) => {
    if (!name) return;
    if (isLiveArtifactTabId(name)) return;
    setSummaryOpen(true);
    persistTabsState({ tabs: [name], active: name });
  }, [persistTabsState]);

  const persistArtifact = useCallback(
    async (
      art: Artifact,
      projectFilesSnapshot?: ProjectFile[],
      sourceText?: string,
      currentRunFilesSnapshot: ProjectFile[] = [],
    ): Promise<{ file: ProjectFile | null; failure: ArtifactDeliveryFailure | null }> => {
      let artifactToPersist = art;
      const baseName = artifactBaseNameFor(art);
      const ext = artifactExtensionFor(art);
      // Pick a name that doesn't collide with an existing project file.
      // The first run uses `<base>.<ext>`; subsequent runs append `-2`, `-3`…
      // so prior artifacts aren't silently overwritten.
      const currentProjectFiles = projectFilesSnapshot ?? projectFilesRef.current;
      const existing = new Set(currentProjectFiles.map((f) => f.name));
      let fileName = `${baseName}${ext}`;
      let n = 2;
      while (existing.has(fileName) && savedArtifactRef.current !== fileName) {
        fileName = `${baseName}-${n}${ext}`;
        n += 1;
      }
      if (ext === '.html') {
        const sourceDecision = await selectHtmlArtifactDeliverySource({
          artifact: art,
          candidateFileName: fileName,
          projectFiles: currentProjectFiles,
          currentRunFiles: currentRunFilesSnapshot,
          sourceText,
          readProjectFileText: (file) => fetchProjectFileText(
            project.id,
            file.path || file.name,
            { activeWorkspace: true, cache: 'no-store', cacheBustKey: file.mtime },
          ),
        });
        if (sourceDecision.kind === 'reuse_file') {
          const selectedPath = sourceDecision.file.path || sourceDecision.file.name;
          savedArtifactRef.current = sourceDecision.file.name;
          requestOpenFile(selectedPath);
          return { file: sourceDecision.file, failure: null };
        }
        if (sourceDecision.kind === 'invalid') {
          setError(sourceDecision.failure.detail);
          return { file: null, failure: sourceDecision.failure };
        }
        artifactToPersist = { ...art, html: sourceDecision.html };
      }
      if (savedArtifactRef.current === fileName) {
        const savedFile = currentProjectFiles.find((file) => file.name === fileName);
        if (savedFile) return { file: savedFile, failure: null };
        savedArtifactRef.current = '';
      }
      savedArtifactRef.current = fileName;
      const title = art.title || art.identifier || fileName;
      const metadata = {
        identifier: art.identifier,
        artifactType: art.artifactType,
        inferred: false,
      };
      const manifest =
        ext === '.html'
          ? createHtmlArtifactManifest({
              entry: fileName,
              title,
              sourceSkillId: project.skillId ?? undefined,
              designSystemId: project.designSystemId,
              metadata,
            })
          : inferLegacyManifest({
              entry: fileName,
              title,
              metadata: {
                ...metadata,
                sourceSkillId: project.skillId ?? undefined,
                designSystemId: project.designSystemId,
              },
            });
      const file = await writeProjectTextFile(project.id, fileName, artifactToPersist.html, {
        artifactManifest: manifest ?? undefined,
        activeWorkspace: true,
      });
      if (file) {
        setFilesRefresh((n) => n + 1);
        // Surface the daemon's stub-guard warning when it fires in `warn`
        // mode (the default). Without this the warning would land in the
        // file metadata silently and the user would never see that the
        // model shipped a placeholder.
        if (file.stubGuardWarning) {
          setError(
            `Saved "${file.name}", but the model may have shipped a placeholder: ` +
              `${file.stubGuardWarning.message}`,
          );
        }
        // Auto-open the freshly-persisted artifact as a tab so the user
        // sees it without an extra click. The Write-tool path already does
        // this for tool-emitted files; this handles the artifact-tag path.
        requestOpenFile(file.name);
        return { file, failure: null };
      } else {
        // writeProjectTextFile collapses all failure paths (non-OK HTTP
        // responses, network errors, and stub-guard 422s) to null — the
        // helper's return contract would need to be widened to distinguish
        // them, which is out of scope here.  Show a generic banner so the
        // failure is observable rather than silent; the daemon logs carry
        // the structured details for any specific error type.
        // Clear the saved-artifact ref so the user can retry.
        savedArtifactRef.current = '';
        const artifactIdentifier = art.identifier || art.title || fileName;
        const artifactLabel = ext === '.html' ? 'HTML source artifact' : 'artifact';
        const retryGuidance = ext === '.html'
          ? 'Retry source generation or check the daemon logs; conversion has not started.'
          : 'Retry generation or check the daemon logs; delivery did not complete.';
        const failure: ArtifactDeliveryFailure = {
          code: 'ARTIFACT_PERSISTENCE_FAILED',
          artifactIdentifier,
          validationReason: 'the selected artifact could not be written to project storage',
          detail: `The ${artifactLabel} "${artifactIdentifier}" could not be saved. ${retryGuidance}`,
          lifecycleMark: 'source_artifact_persist_failed',
        };
        setError(failure.detail);
        return { file: null, failure };
      }
    },
    [project.id, project.designSystemId, project.skillId, requestOpenFile],
  );

  const artifactFromStandaloneHtml = useCallback((sourceText: string): Artifact | null => {
    const html = recoverStandaloneHtmlDocument(sourceText)
      ?? recoverHtmlDocumentFromMarkdownFence(sourceText);
    if (!html) return null;
    return {
      identifier: 'response',
      artifactType: 'text/html',
      title: translateUi("ui.projectView.response"),
      html,
    };
  }, [translateUi]);

  // Set of project file names that the chat surface uses to decide whether
  // a tool card's path is openable as a tab. Recomputed on every file-list
  // change; tool cards just read from the set.
  const projectFileNames = useMemo(
    () => new Set(projectFiles.map((f) => f.name)),
    [projectFiles],
  );
  const activeProjectFileName = useMemo(
    () => (
      openTabsState.active && projectFileNames.has(openTabsState.active)
        ? openTabsState.active
        : null
    ),
    [openTabsState.active, projectFileNames],
  );
  const agentsById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  );
  // Keep the @-picker's source of truth fresh: every refreshSignal bump
  // (artifact saved, sketch saved, image uploaded) refetches; on first
  // mount we also do an initial pull so attachments staged before the
  // agent has written anything still see the user's pasted images.
  useEffect(() => {
    void refreshWorkspaceItems().catch(() => {
      // The daemon probe can briefly lag behind a just-started local
      // runtime. Retry when daemonLive flips or the explicit refresh key
      // changes instead of leaving the project view in its empty shell.
    });
  }, [daemonLive, refreshWorkspaceItems, filesRefresh]);

  // Live-reload: when the daemon's chokidar watcher reports a file change,
  // bump filesRefresh so the file list refetches with new mtimes — which
  // propagates through to FileViewer iframes via PR #384's ?v=${mtime}
  // cache-bust, triggering an automatic preview reload without a click.
  //
  // Coalesce the refresh: agent rewrites surface to chokidar as an
  // `unlink` + `add` (+ later `change`) burst within a single tick (#2195).
  // Refreshing the file list on the intermediate `unlink` makes the open
  // tab's active file vanish for one frame before the `add` restores it,
  // and FileWorkspace's "tab no longer on disk" path then drops the user
  // out of their preview. A short trailing wait absorbs the burst; the
  // maxWait cap stops a sustained edit storm from starving the UI.
  const refreshFilesAndDesignMd = useCallback(() => {
    setFilesRefresh((n) => n + 1);
    // Round 7 (mrcfps): file mutations are the dominant staleness signal
    // post-finalize — bump the refresh key so DESIGN.md staleness
    // recomputes against the new mtimes.
  }, []);
  const coalescedFileChangedRefresh = useCoalescedCallback(
    refreshFilesAndDesignMd,
    { wait: 80, maxWait: 250 },
  );
  const handleProjectEvent = useCallback((evt: ProjectEvent) => {
    if (evt.type === 'file-changed') {
      iframeKeepAlivePool.evictProject(project.id);
      coalescedFileChangedRefresh();
      return;
    }
    if (evt.type === 'conversation-created') {
      // A new conversation was inserted into this project by a path the
      // open project view can't observe through its own state (currently:
      // Routines "Run now" in reuse-an-existing-project mode, #1361).
      // Refetch the conversation list so the new entry becomes visible
      // without requiring the user to leave and re-enter the project.
      // Deliberately do NOT change the active conversation here — the
      // user keeps their current context. Auto-switch is a separate UX
      // decision tracked in #1361.
      if (evt.projectId !== project.id) return;
      const capturedProjectId = project.id;
      const myToken = ++conversationsRefreshTokenRef.current;
      void (async () => {
        try {
          const list = await listConversations(capturedProjectId);
          // Bail if the user switched projects while this request was in
          // flight (#1361 review, Codex P1). The captured project id is the
          // one we asked the daemon about; the live ref is the one the
          // user is looking at right now. If they don't match, applying
          // the list would overwrite the new project's sidebar with
          // stale data from the old one.
          if (projectIdRef.current !== capturedProjectId) return;
          // Bail if a newer conversation-created event already dispatched
          // its own refresh after us (#1361 review, lefarcen P2). With two
          // rapid events the later request may resolve first; if this
          // earlier request resolves afterwards it would drop the newer
          // conversation. Only the latest dispatch is allowed to apply.
          if (conversationsRefreshTokenRef.current !== myToken) return;
          setConversations(list);
        } catch {
          // Defensive: refresh failed (network blip, daemon gone). The
          // next project mount or another conversation-created event
          // will retry; no need to surface an error here.
        }
      })();
      return;
    }
    const agentEvent = projectEventToAgentEvent(evt);
    if (!agentEvent) return;
    setLiveArtifactEvents((prev) => appendLiveArtifactEventItem(prev, agentEvent));
    void refreshLiveArtifacts();
    onProjectsRefresh();
    // Live artifact events come from chat-turn-emitted artifacts; they
    // also imply the conversation transcript changed.
  }, [coalescedFileChangedRefresh, iframeKeepAlivePool, onProjectsRefresh, refreshLiveArtifacts, project.id]);
  useProjectFileEvents(project.id, daemonLive, handleProjectEvent);

  const activePromptContextSignature = useMemo(() => {
    const skill = project.skillId
      ? (skills.find((s) => s.id === project.skillId) ??
        designTemplates.find((s) => s.id === project.skillId))
      : null;
    const designSystem = project.designSystemId
      ? designSystems.find((d) => d.id === project.designSystemId)
      : null;
    return JSON.stringify({
      designSystem: designSystem
        ? {
            id: designSystem.id,
            title: designSystem.title,
            category: designSystem.category,
            summary: designSystem.summary,
            source: designSystem.source ?? null,
          }
        : null,
      skill: skill
        ? {
            id: skill.id,
            name: skill.name,
            description: skill.description,
            mode: skill.mode,
            source: skill.source ?? null,
            upstream: skill.upstream,
          }
        : null,
    });
  }, [designSystems, designTemplates, project.designSystemId, project.skillId, skills]);
  const previousPromptContextSignatureRef = useRef(activePromptContextSignature);
  useEffect(() => {
    if (previousPromptContextSignatureRef.current === activePromptContextSignature) return;
    previousPromptContextSignatureRef.current = activePromptContextSignature;
    iframeKeepAlivePool.evictProject(project.id, { includeActive: true });
  }, [activePromptContextSignature, iframeKeepAlivePool, project.id]);

  // When the URL points at a specific file, fire an open request so the
  // summary selects it without restoring the old file workspace. We watch routeFileName
  // (the parsed segment) so back/forward navigation triggers the same path.
  useEffect(() => {
    if (!routeFileName) return;
    setSummaryOpen(true);
    requestOpenFile(routeFileName);
  }, [routeFileName, requestOpenFile]);

  // Sync the URL when the active tab changes, so reload + share-link both
  // land back on the same view. Replace (not push) on tab activation so the
  // history stack doesn't fill with every tab click.
  // Composite sync key: tracks BOTH the active file target AND the active
  // conversation id, so a conversation-only change (e.g. `listConversations`
  // resolves after `loadTabs` hydrated the active tab, or the user picks a
  // different conversation under the same tab) still triggers the navigate
  // and pushes `/conversations/:cid` into the URL. Keying only on the file
  // target lost that update because the early-return saw `target` unchanged
  // and skipped the navigate (lefarcen P1 on PR #1508).
  const lastSyncedRouteKeyRef = useRef<string | null>(null);
  const lastSeenRouteConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    // Restored file tabs stay available without changing the chat-only route.
    const target = summaryOpen && openTabsState.active && (
      openTabsState.tabs.includes(openTabsState.active)
      || projectFileNames.has(openTabsState.active)
      || isLiveArtifactTabId(openTabsState.active)
    )
      ? openTabsState.active
      : null;
    const nextKey = `${activeConversationId ?? ''}:${target ?? ''}`;
    if (nextKey === lastSyncedRouteKeyRef.current) return;
    lastSyncedRouteKeyRef.current = nextKey;
    lastSyncedConversationIdRef.current = activeConversationId;
    // PerishCode + Codex P1 on PR #1508: the prior version of this
    // sync stripped any `/conversations/:cid` segment from the URL as
    // soon as a tab became active, which regressed the deep-link
    // behavior the parent commit was meant to add (reload / share
    // would fall back to `list[0]` instead of the routed run's
    // conversation). Thread the active conversation id so the URL
    // always reflects the conversation the project view is actually
    // showing, matching how `fileName` already tracks the active tab.
    navigate(
      {
        kind: 'project',
        projectId: project.id,
        conversationId: activeConversationId,
        fileName: target,
      },
      { replace: true },
    );
  }, [openTabsState.active, openTabsState.tabs, projectFileNames, project.id, activeConversationId, summaryOpen]);

  const handleEnsureProject = useCallback(async (): Promise<string | null> => {
    return project.id;
  }, [project.id]);

  const composedSystemPrompt = useCallback(async (
    sessionModeOverride: ChatSessionMode = activeSessionMode,
  ): Promise<string> => {
    let skillBody: string | undefined;
    let skillName: string | undefined;
    let skillMode: SkillSummary['mode'] | undefined;
    let designSystemBody: string | undefined;
    let designSystemTitle: string | undefined;

    if (project.skillId) {
      // project.skillId can resolve to either root after the
      // skills/design-templates split; check both lists so a template-backed
      // project keeps composing its template body when running in API mode.
      const summary =
        skills.find((s) => s.id === project.skillId) ??
        designTemplates.find((s) => s.id === project.skillId);
      skillName = summary?.name;
      skillMode = summary?.mode;
      const cached = skillCache.current.get(project.skillId);
      if (cached !== undefined) {
        skillBody = cached;
      } else {
        const detail =
          (await fetchSkill(project.skillId)) ??
          (await fetchDesignTemplate(project.skillId));
        if (detail) {
          skillBody = detail.body;
          skillCache.current.set(project.skillId, detail.body);
        }
      }
    }
    if (project.designSystemId) {
      const summary = designSystems.find((d) => d.id === project.designSystemId);
      designSystemTitle = summary?.title;
      const cached = designCache.current.get(project.designSystemId);
      if (cached !== undefined) {
        designSystemBody = cached;
      } else {
        const detail = await fetchDesignSystem(project.designSystemId);
        if (detail) {
          designSystemBody = detail.body;
          designCache.current.set(project.designSystemId, detail.body);
        }
      }
    }
    let template: ProjectTemplate | undefined;
    const tplId = project.metadata?.templateId;
    if (project.metadata?.kind === 'template' && tplId) {
      const cached = templateCache.current.get(tplId);
      if (cached) {
        template = cached;
      } else {
        const fetched = await getTemplate(tplId);
        if (fetched) {
          templateCache.current.set(tplId, fetched);
          template = fetched;
        }
      }
    }
    // Fold in the auto-memory block so BYOK / API-mode chats see the
    // same Personal-memory section a daemon-side CLI chat would. The
    // daemon does this by calling `composeMemoryBody()` directly; the
    // web side hits the equivalent HTTP surface so it can stay
    // ignorant of daemon internals. Failures are swallowed — memory is
    // best-effort, never a blocker for the chat round-trip.
    let memoryBody: string | undefined;
    try {
      const resp = await fetch('/api/memory/system-prompt');
      if (resp.ok) {
        const json = (await resp.json()) as MemorySystemPromptResponse;
        if (typeof json.body === 'string' && json.body.trim().length > 0) {
          memoryBody = json.body;
        }
      }
    } catch {
      // Ignore; memory injection is best-effort.
    }
    let audioVoiceOptions: AudioVoiceOption[] | undefined;
    let audioVoiceOptionsLookupError: string | undefined;
    if (shouldFetchElevenLabsVoiceOptions(project)) {
      try {
        audioVoiceOptions = await fetchElevenLabsVoiceOptions();
        setAudioVoiceOptionsError(null);
      } catch (err) {
        const message = err instanceof Error
          ? err.message
          : 'ElevenLabs voice list could not be loaded.';
        audioVoiceOptionsLookupError = message;
        setAudioVoiceOptionsError(message);
      }
    } else {
      setAudioVoiceOptionsError(null);
    }
    return composeSystemPrompt({
      wordpressWorkspace: hasPixflowWordPressContext(),
      skillBody,
      skillName,
      skillMode,
      designSystemBody,
      designSystemTitle,
      memoryBody,
      metadata: project.metadata,
      template,
      audioVoiceOptions,
      audioVoiceOptionsError: audioVoiceOptionsLookupError,
      streamFormat: config.mode === 'api' ? 'plain' : undefined,
      sessionMode: sessionModeOverride,
      locale,
      userInstructions: config.customInstructions,
    });
  }, [
    project.skillId,
    project.designSystemId,
    project.metadata,
    skills,
    designTemplates,
    designSystems,
    config.mode,
    config.customInstructions,
    activeSessionMode,
    locale,
  ]);

  const persistMessage = useCallback(
    (m: ChatMessage, options?: SaveMessageOptions) => {
      if (!activeConversationId) return;
      // Source-level guard against the "Working 24m+ / Waiting for first
      // output" UI: never write a daemon assistant row that is still
      // queued/running but has no runId. Until POST /api/runs returns the
      // runId, the message is purely in-flight on the client; persisting it
      // here creates a row that nothing can ever reattach to (daemon never
      // saw the runId, client lost the response). Once onRunCreated assigns
      // a runId — or the run finishes terminally — this guard lets the row
      // through normally.
      if (isPhantomDaemonRunMessage(m)) return;
      void saveMessage(project.id, activeConversationId, m, options);
    },
    [project.id, activeConversationId],
  );

  const persistMessageById = useCallback(
    (messageId: string, options?: SaveMessageOptions) => {
      if (!activeConversationId) return;
      setMessages((curr) => {
        const found = curr.find((m) => m.id === messageId);
        if (found && !isPhantomDaemonRunMessage(found)) {
          void saveMessage(project.id, activeConversationId, found, options);
        }
        return curr;
      });
    },
    [project.id, activeConversationId],
  );

  const updateMessageById = useCallback(
    (
      messageId: string,
      updater: (message: ChatMessage) => ChatMessage,
      persist = false,
      persistOptions?: SaveMessageOptions,
    ) => {
      setMessages((curr) => {
        let saved: ChatMessage | null = null;
        const next = curr.map((m) => {
          if (m.id !== messageId) return m;
          const updated = updater(m);
          saved = updated;
          return updated;
        });
        // Same phantom guard as persistMessage: skip writes for a daemon
        // assistant row that is still in-flight (active runStatus, no runId).
        // The runId-arriving update from onRunCreated passes through because
        // the updater sets runId before this check runs.
        if (persist && saved && activeConversationId && !isPhantomDaemonRunMessage(saved)) {
          void saveMessage(project.id, activeConversationId, saved, persistOptions);
        }
        return next;
      });
    },
    [project.id, activeConversationId],
  );

  const appendConversationMessage = useCallback(
    (
      conversationId: string,
      message: ChatMessage,
      options?: SaveMessageOptions,
      persist = true,
    ) => {
      if (
        activeConversationId === conversationId
        || messagesConversationIdRef.current === conversationId
      ) {
        setMessages((curr) => [...curr, message]);
      }
      if (persist) void saveMessage(project.id, conversationId, message, options);
    },
    [activeConversationId, project.id],
  );

  const replaceConversationMessage = useCallback(
    (
      conversationId: string,
      message: ChatMessage,
      options?: SaveMessageOptions,
      persist = true,
    ) => {
      if (
        activeConversationId === conversationId
        || messagesConversationIdRef.current === conversationId
      ) {
        setMessages((curr) => curr.map((item) => (item.id === message.id ? message : item)));
      }
      if (persist) void saveMessage(project.id, conversationId, message, options);
    },
    [activeConversationId, project.id],
  );

  const refreshConversationMessagesFromServer = useCallback(
    async (conversationId: string) => {
      if (messagesConversationIdRef.current !== conversationId) return;
      try {
        const page = await listMessagePage(project.id, conversationId);
        if (messagesConversationIdRef.current !== conversationId) return;
        setMessages((current) => mergeServerMessagesIntoConversation(current, page.messages));
        setMessagesInitialized(true);
        setMessagesConversationId(conversationId);
        setFailedMessagesConversationId(null);
      } catch (err) {
        console.warn('Failed to refresh conversation messages after run completion', err);
      }
    },
    [project.id],
  );

  const scheduleConversationMessageRefresh = useCallback(
    (conversationId: string) => {
      window.setTimeout(() => {
        void refreshConversationMessagesFromServer(conversationId);
      }, 150);
    },
    [refreshConversationMessagesFromServer],
  );

  const markStreamingConversation = useCallback((conversationId: string) => {
    streamingConversationIdRef.current = conversationId;
    setStreaming(true);
    setStreamingConversationId(conversationId);
  }, []);

  const clearStreamingMarker = useCallback((conversationId?: string | null) => {
    const next = clearStreamingConversationMarker(
      streamingConversationIdRef.current,
      conversationId,
    );
    if (next === streamingConversationIdRef.current) return;
    streamingConversationIdRef.current = next;
    setStreamingConversationId(next);
    setStreaming(next !== null);
  }, []);

  const clearActiveRunRefs = useCallback((
    conversationId: string,
    controller: AbortController,
    cancelController: AbortController,
  ) => {
    if (!shouldClearActiveRunRefs(streamingConversationIdRef.current, conversationId)) {
      return false;
    }
    if (abortRef.current !== controller || cancelRef.current !== cancelController) {
      return false;
    }
    abortRef.current = null;
    cancelRef.current = null;
    return true;
  }, []);

  const clearCurrentRunStreamingMarker = useCallback((
    conversationId: string,
    controller: AbortController,
    cancelController: AbortController,
  ) => {
    if (!clearActiveRunRefs(conversationId, controller, cancelController)) return false;
    clearStreamingMarker(conversationId);
    return true;
  }, [clearActiveRunRefs, clearStreamingMarker]);

  const handleAssistantFeedback = useCallback(
    (assistantMessage: ChatMessage, change: ChatMessageFeedbackChange) => {
      const now = Date.now();
      updateMessageById(
        assistantMessage.id,
        (prev) =>
          change
            ? {
                ...prev,
                feedback: {
                  rating: change.rating,
                  reasonCodes: change.reasonCodes,
                  customReason: change.customReason,
                  reasonsSubmittedAt: change.reasonsSubmittedAt,
                  createdAt:
                    prev.feedback?.rating === change.rating
                      ? prev.feedback.createdAt
                      : now,
                  updatedAt: now,
                },
              }
            : {
                ...prev,
                feedback: undefined,
              },
        true,
      );
      // Forward affirmative ratings to the daemon → Langfuse `score-create`.
      // Clears (change=null) are skipped — Langfuse scores are append-only,
      // and the rating is also captured by the PostHog event so a clear is
      // recoverable downstream if we ever need it.
      const runId = assistantMessage.runId;
      if (change && runId && activeConversationId) {
        void reportChatRunFeedback({
          runId,
          projectId: project.id,
          conversationId: activeConversationId,
          assistantMessageId: assistantMessage.id,
          rating: change.rating,
          reasonCodes: change.reasonCodes ?? [],
          hasCustomReason: !!change.customReason,
          customReason: normalizeCustomReason(change.customReason),
        });
      }
    },
    [updateMessageById, activeConversationId, project.id],
  );

  // `code` is the structured API error code (e.g. AGENT_AUTH_REQUIRED); it
  // rides along on the error status event so AssistantMessage can render the
  // hosted-AMR nudge for model/auth/quota failures on non-AMR agents.
  const appendAssistantErrorEvent = useCallback(
    (messageId: string, message: string, code?: string) => {
      if (!message) return;
      updateMessageById(
        messageId,
        (prev) => appendErrorStatusEvent(prev, message, code),
        true,
      );
    },
    [updateMessageById],
  );

  const auditDesignSystemWorkspaceAfterRun = useCallback(
    async (assistantMessageId: string) => {
      if (!isDesignSystemWorkspaceMetadata(project.metadata)) return;
      try {
        const audit = await fetchProjectDesignSystemPackageAudit(project.id);
        if (!audit) return;
        const auditSummary = summarizeDesignSystemPackageAudit(audit);
        updateMessageById(
          assistantMessageId,
          (prev) => ({
            ...prev,
            events: [...(prev.events ?? []), { kind: 'status', label: translateUi("ui.projectView.audit"), detail: auditSummary }],
          }),
          true,
          { telemetryFinalized: true },
        );
        const repairPrompt = buildDesignSystemPackageAuditRepairPrompt(audit);
        if (repairPrompt) {
          const seed = { id: `audit-${Date.now()}`, value: repairPrompt };
          setChatSeed(seed);
          if (consumeDesignSystemAuditAutoRepair(project.id)) {
            setAutoAuditRepairSeed(seed);
          }
        } else {
          clearDesignSystemAuditAutoRepair(project.id);
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        updateMessageById(
          assistantMessageId,
          (prev) => ({
            ...prev,
            events: [
              ...(prev.events ?? []),
              { kind: 'status', label: translateUi("ui.projectView.audit"), detail: `Package audit could not run: ${detail}` },
            ],
          }),
          true,
          { telemetryFinalized: true },
        );
      }
    },
    [translateUi, project.id, project.metadata, updateMessageById],
  );

  const refreshPreviewComments = useCallback(async () => {
    if (!activeConversationId) return;
    const next = await fetchPreviewComments(project.id, activeConversationId);
    setPreviewComments(next);
    setAttachedComments((current) =>
      current
        .map((attached) => next.find((comment) => comment.id === attached.id))
        .filter((comment): comment is PreviewComment => Boolean(comment)),
    );
  }, [project.id, activeConversationId]);

  const savePreviewComment = useCallback(
    async (target: PreviewCommentTarget, note: string, attachAfterSave: boolean, images: File[] = []) => {
      if (!activeConversationId) return null;
      // Upload any attached images first so the saved comment carries durable
      // file paths — this is what lets the comment list / re-opened popover
      // re-display the images instead of losing them on echo.
      let uploadedAttachments: PreviewCommentAttachment[] | undefined;
      if (images.length > 0) {
        const result = await uploadProjectFiles(project.id, images);
        if (result.uploaded.length !== images.length) return null;
        uploadedAttachments = result.uploaded.map((file) => ({ path: file.path, name: file.name }));
      }
      const existing = previewComments.find(
        (comment) => comment.filePath === target.filePath && comment.elementId === target.elementId,
      );
      const attachments = mergePreviewCommentAttachments(existing?.attachments, uploadedAttachments);
      const saved = await upsertPreviewComment(project.id, activeConversationId, {
        target,
        note,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      if (!saved) return null;
      setPreviewComments((current) => mergeSavedPreviewComment(current, saved));
      setAttachedComments((current) =>
        attachAfterSave ? mergeAttachedComments(current, saved) : current.map((comment) => comment.id === saved.id ? saved : comment),
      );
      return saved;
    },
    [project.id, activeConversationId, previewComments],
  );

  const removePreviewComment = useCallback(
    async (commentId: string) => {
      if (!activeConversationId) return;
      const ok = await deletePreviewComment(project.id, activeConversationId, commentId);
      if (!ok) return;
      setPreviewComments((current) => current.filter((comment) => comment.id !== commentId));
      setAttachedComments((current) => removeAttachedComment(current, commentId));
    },
    [project.id, activeConversationId],
  );

  const attachPreviewComment = useCallback((comment: PreviewComment) => {
    setAttachedComments((current) => mergeAttachedComments(current, comment));
  }, []);

  const detachPreviewComment = useCallback((commentId: string) => {
    setAttachedComments((current) => removeAttachedComment(current, commentId));
  }, []);

  const patchAttachedStatuses = useCallback(
    async (attachments: ChatCommentAttachment[], status: PreviewComment['status']) => {
      if (!activeConversationId || attachments.length === 0) return;
      const persistedAttachments = attachments.filter(
        (attachment) => attachment.source !== 'board-batch',
      );
      if (persistedAttachments.length === 0) return;
      setPreviewComments((current) =>
        current.map((comment) =>
          persistedAttachments.some((attachment) => attachment.id === comment.id)
            ? { ...comment, status }
            : comment,
        ),
      );
      await Promise.all(
        persistedAttachments.map((attachment) =>
          patchPreviewCommentStatus(project.id, activeConversationId, attachment.id, status),
        ),
      );
      void refreshPreviewComments();
    },
    [project.id, activeConversationId, refreshPreviewComments],
  );

  useEffect(() => {
    if (config.mode !== 'daemon' || !daemonLive || !activeConversationId || streaming) return;
    let cancelled = false;
    const retryTimers = new Set<ReturnType<typeof setTimeout>>();
    const reattachConversationId = activeConversationId;

    const attachRecoverableRuns = async () => {
      const missingRunIdMessages = messages.filter((m) => {
        if (m.role !== 'assistant' || m.runId) return false;
        return isActiveRunStatus(m.runStatus);
      });
      const activeRuns = missingRunIdMessages.length > 0
        ? await listActiveChatRuns(project.id, reattachConversationId)
        : [];
      const historicalRuns = missingRunIdMessages.length > 0
        ? (await listProjectRuns()).filter(
            (run) => run.projectId === project.id && run.conversationId === reattachConversationId,
          )
        : [];
      if (cancelled) return;
      const activeByMessage = new Map(
        activeRuns
          .filter((run) => run.assistantMessageId)
          .map((run) => [run.assistantMessageId!, run]),
      );
      const historicalByMessage = new Map(
        historicalRuns
          .filter((run) => run.assistantMessageId)
          .map((run) => [run.assistantMessageId!, run]),
      );

      for (const message of messages) {
        if (cancelled) return;
        if (message.role !== 'assistant') continue;
        const spuriouslyFailedPending = isSpuriouslyFailedAssistantMessage(message);
        const replayingTerminalRun = shouldReplayTerminalRunMessage(message);
        const needsFullReplay =
          isActiveRunStatus(message.runStatus) ||
          spuriouslyFailedPending ||
          replayingTerminalRun;
        // Artifact recovery belongs to a recorded daemon run. Completed API
        // and Composio replies have no daemon run ID; changing the selected
        // execution mode must never rewrite their saved terminal status.
        const needsDeliveryRecovery = Boolean(message.runId) && designDeliveryVerificationPending(message);
        if (!needsFullReplay && !needsDeliveryRecovery) continue;
        const fallbackRun = !message.runId
          ? activeByMessage.get(message.id) ?? historicalByMessage.get(message.id) ?? null
          : null;
        const runId = message.runId ?? fallbackRun?.id;
        // Self-heal phantom 'running' rows: when the message has no runId
        // and the daemon has no active run mapped to it, the original send
        // POST was lost (daemon restart mid-flight, the user navigated
        // away before /api/runs returned, or a network blip). Leaving the
        // message as 'running' is what produces the "Waiting for first
        // output — Working 24m+" UI the user reported. Mark it failed so
        // the composer is interactive again and the user can re-send.
        if (!runId) {
          updateMessageById(
            message.id,
            (prev) => ({
              ...prev,
              runStatus: 'failed',
              endedAt: prev.endedAt ?? Date.now(),
            }),
            true,
          );
          continue;
        }
        if (finalizingLocalRunIdsRef.current.has(runId)) continue;
        if (reattachControllersRef.current.has(runId)) continue;
        if (completedReattachRunsRef.current.has(runId)) continue;

        if (fallbackRun && !message.runId) {
          updateMessageById(
            message.id,
            (prev) => ({ ...prev, runId, runStatus: fallbackRun.status }),
            true,
          );
        }

        const status = fallbackRun ?? await fetchChatRunStatus(runId);
        if (cancelled) return;
        if (!status) {
          if (spuriouslyFailedPending) {
            const attempts = transientFailedReattachRetriesRef.current.get(runId) ?? 0;
            if (attempts < 2) {
              transientFailedReattachRetriesRef.current.set(runId, attempts + 1);
              const timer = setTimeout(() => {
                retryTimers.delete(timer);
                if (!cancelled) setReattachRecoveryTick((tick) => tick + 1);
              }, 3000);
              retryTimers.add(timer);
              continue;
            }
            transientFailedReattachRetriesRef.current.delete(runId);
          }
          updateMessageById(
            message.id,
            (prev) => ({ ...prev, runStatus: 'failed', endedAt: prev.endedAt ?? Date.now() }),
            true,
          );
          completedReattachRunsRef.current.add(runId);
          continue;
        }
        transientFailedReattachRetriesRef.current.delete(runId);
        if (spuriouslyFailedPending && (status.status === 'failed' || status.status === 'canceled')) {
          updateMessageById(
            message.id,
            (prev) => ({
              ...prev,
              runStatus: status.status,
              endedAt: status.updatedAt ?? prev.endedAt ?? Date.now(),
              ...(status.resumable !== undefined ? { resumable: status.resumable } : {}),
            }),
            true,
          );
          completedReattachRunsRef.current.add(runId);
          continue;
        }
        updateMessageById(
          message.id,
          (prev) => ({
            ...prev,
            runStatus: status.status,
            ...(status.resumable !== undefined ? { resumable: status.resumable } : {}),
          }),
          true,
        );

        const controller = new AbortController();
        const cancelController = new AbortController();
        reattachControllersRef.current.set(runId, controller);
        reattachCancelControllersRef.current.set(runId, cancelController);
        if (!isTerminalRunStatus(status.status)) {
          abortRef.current = controller;
          cancelRef.current = cancelController;
          markStreamingConversation(reattachConversationId);
        }
        if (needsFullReplay) {
          updateMessageById(
            message.id,
            (prev) => ({ ...prev, content: '', events: [], producedFiles: undefined }),
          );
        }

        let persistTimer: ReturnType<typeof setTimeout> | null = null;
        const persistSoon = () => {
          if (persistTimer) return;
          persistTimer = setTimeout(() => {
            persistTimer = null;
            persistMessageById(message.id);
          }, 500);
        };
        const persistNow = (options?: SaveMessageOptions) => {
          if (persistTimer) {
            clearTimeout(persistTimer);
            persistTimer = null;
          }
          textBuffer.flush();
          persistMessageById(message.id, options);
        };
        const parser = createArtifactParser();
        let parsedArtifact: Artifact | null = null;
        let liveHtml = '';
        let replayedContent = needsFullReplay ? '' : message.content;
        let replayedEvents: AgentEvent[] = needsFullReplay ? [] : [...(message.events ?? [])];
        const applyContentDelta = (delta: string) => {
          for (const ev of parser.feed(delta)) {
            if (ev.type === 'artifact:start') {
              liveHtml = '';
              parsedArtifact = {
                identifier: ev.identifier,
                artifactType: ev.artifactType,
                title: ev.title,
                html: '',
              };
              setArtifact(parsedArtifact);
            } else if (ev.type === 'artifact:chunk') {
              liveHtml += ev.delta;
              parsedArtifact = parsedArtifact
                ? { ...parsedArtifact, html: liveHtml }
                : {
                    identifier: ev.identifier,
                    title: '',
                    html: liveHtml,
                  };
              setArtifact((prev) =>
                prev
                  ? { ...prev, html: liveHtml }
                  : {
                      identifier: ev.identifier,
                      title: '',
                      html: liveHtml,
                    },
              );
            } else if (ev.type === 'artifact:end') {
              parsedArtifact = parsedArtifact
                ? { ...parsedArtifact, html: ev.fullContent }
                : {
                    identifier: ev.identifier,
                    title: '',
                    html: ev.fullContent,
                  };
              setArtifact((prev) => (prev ? { ...prev, html: ev.fullContent } : null));
            }
          }
        };
        if (!needsFullReplay && message.content) {
          applyContentDelta(message.content);
        }
        const textBuffer = createBufferedTextUpdates({
          updateMessage: (updater) => updateMessageById(message.id, updater),
          persistSoon,
          flushAndPersistNow: () => persistNow({ keepalive: true }),
          onContentDelta: applyContentDelta,
        });
        reattachTextBuffersRef.current.add(textBuffer);
        const unregisterTextBuffer = () => {
          reattachTextBuffersRef.current.delete(textBuffer);
        };

        void reattachDaemonRun({
          runId,
          signal: controller.signal,
          cancelSignal: cancelController.signal,
          initialLastEventId: needsFullReplay ? null : message.lastRunEventId ?? null,
          handlers: {
            onDelta: (delta) => {
              replayedContent += delta;
              textBuffer.appendContent(delta);
            },
            onAgentEvent: (ev) => {
              replayedEvents = [...replayedEvents, ev];
              textBuffer.appendEvent(ev);
            },
            onDone: () => {
              // A reattached run interrupted by a "send now" still receives a
              // late onDone from the daemon. Decide ownership first, then bail
              // BEFORE any current-run side effect (committing buffered text,
              // repainting the artifact preview via setArtifact, re-finalizing
              // the message) — only release this run's bookkeeping. See the
              // streamViaDaemon onDone for the ownership rationale.
              const runMayFinalize =
                !supersededRunsRef.current.has(controller);
              if (runMayFinalize) textBuffer.flush();
              textBuffer.cancel();
              unregisterTextBuffer();
              completedReattachRunsRef.current.add(runId);
              reattachControllersRef.current.delete(runId);
              reattachCancelControllersRef.current.delete(runId);
              clearCurrentRunStreamingMarker(reattachConversationId, controller, cancelController);
              if (!runMayFinalize) return;
              for (const ev of parser.flush()) {
                if (ev.type === 'artifact:end') {
                  parsedArtifact = parsedArtifact
                    ? { ...parsedArtifact, html: ev.fullContent }
                    : {
                        identifier: ev.identifier,
                        title: '',
                        html: ev.fullContent,
                      };
                  setArtifact((prev) => (prev ? { ...prev, html: ev.fullContent } : null));
                }
              }
              updateMessageById(
                message.id,
                (prev) => ({
                  ...prev,
                  content: needsFullReplay ? replayedContent : prev.content,
                  events: needsFullReplay ? replayedEvents : prev.events,
                  runStatus: resolveSucceededRunStatus(prev.runStatus),
                  endedAt: prev.endedAt ?? Date.now(),
                }),
                true,
                { telemetryFinalized: true },
              );
              void (async () => {
                const preTurn = message.preTurnFileNames;
                let nextFiles = await refreshProjectFiles();
                // Use the turn-start snapshot when available so reload
                // recovers files produced before the artifact write too;
                // fall back to the current list for legacy messages.
                const beforeFileNames = new Set(preTurn ?? nextFiles.map((f) => f.name));
                let recoveredExistingArtifact: ProjectFile | null = null;
                let artifactPersistenceFailure: ArtifactDeliveryFailure | null = null;
                const artifactToPersist = parsedArtifact?.html
                  ? parsedArtifact
                  : artifactFromStandaloneHtml(replayedContent);
                if (artifactToPersist?.html) {
                  const runStartedAt = status.createdAt || message.startedAt || message.createdAt || 0;
                  const currentRunFiles = preTurn
                    ? computeProducedFiles(beforeFileNames, nextFiles) ?? []
                    : nextFiles.filter((file) => file.mtime >= runStartedAt);
                  const persistence = await persistArtifact(
                    artifactToPersist,
                    nextFiles,
                    replayedContent,
                    currentRunFiles,
                  );
                  recoveredExistingArtifact = persistence.file;
                  artifactPersistenceFailure = persistence.failure;
                  nextFiles = await refreshProjectFiles();
                }
                const diff = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
                const produced = mergeRecoveredArtifact(diff, recoveredExistingArtifact);
                const producedFileToOpen = selectAutoOpenProducedFileForSession(
                  produced,
                  message.sessionMode,
                );
                if (producedFileToOpen) requestOpenFile(producedFileToOpen);
                const deliveryOutcome = resolveDesignDeliveryOutcome({
                  sessionMode: message.sessionMode,
                  runStatus: 'succeeded',
                  content: replayedContent,
                  events: replayedEvents,
                  producedFileCount: produced.length,
                  persistenceSucceeded: recoveredExistingArtifact !== null,
                  persistenceFailed: artifactPersistenceFailure !== null,
                });
                updateMessageById(
                  message.id,
                  (prev) => applyDesignDeliveryOutcome(
                    {
                      ...prev,
                      content: replayedContent,
                      events: replayedEvents,
                      producedFiles: produced,
                    },
                    deliveryOutcome,
                    artifactPersistenceFailure,
                  ),
                  true,
                  { telemetryFinalized: true },
                );
                await auditDesignSystemWorkspaceAfterRun(message.id);
              })();
              onProjectsRefresh();
            },
            onError: (err) => {
              const errorCode = (err as Error & { code?: string }).code;
              const resumable = (err as Error & { resumable?: boolean }).resumable === true;
              // A superseded reattached run must not paint a global failure
              // banner or re-finalize its message over the replacement run.
              const runMayFinalize =
                !supersededRunsRef.current.has(controller);
              textBuffer.flush();
              textBuffer.cancel();
              unregisterTextBuffer();
              if (runMayFinalize) {
                setError(err.message);
                appendAssistantErrorEvent(message.id, err.message, errorCode);
                updateMessageById(
                  message.id,
                  (prev) => ({
                    ...prev,
                    runStatus: 'failed',
                    endedAt: prev.endedAt ?? Date.now(),
                    resumable,
                  }),
                  true,
                );
              }
              completedReattachRunsRef.current.add(runId);
              reattachControllersRef.current.delete(runId);
              reattachCancelControllersRef.current.delete(runId);
              clearCurrentRunStreamingMarker(reattachConversationId, controller, cancelController);
              persistNow({ telemetryFinalized: true });
            },
          },
          onRunStatus: (runStatus) => {
            textBuffer.flush();
            updateMessageById(
              message.id,
              (prev) => ({
                ...prev,
                runStatus,
                endedAt: isTerminalRunStatus(runStatus) ? prev.endedAt ?? Date.now() : prev.endedAt,
              }),
              true,
            );
            if (runStatus === 'canceled') {
              textBuffer.cancel();
              unregisterTextBuffer();
              completedReattachRunsRef.current.add(runId);
              reattachControllersRef.current.delete(runId);
              reattachCancelControllersRef.current.delete(runId);
              clearCurrentRunStreamingMarker(reattachConversationId, controller, cancelController);
              persistNow({ telemetryFinalized: true });
            }
            if (isTerminalRunStatus(runStatus)) {
              scheduleConversationMessageRefresh(reattachConversationId);
            }
          },
          onRunEventId: (lastRunEventId) => {
            textBuffer.flush();
            updateMessageById(message.id, (prev) => ({ ...prev, lastRunEventId }));
            persistSoon();
          },
        })
          .catch((err) => {
            // Skip AbortError (expected on interrupt) and any error from a run
            // that was tagged superseded by a send-now interrupt — it must not
            // surface a global failure over the replacement.
            const runMayFinalize =
              !supersededRunsRef.current.has(controller);
            if ((err as Error).name !== 'AbortError' && runMayFinalize) {
              const msg = err instanceof Error ? err.message : String(err);
              setError(msg);
              appendAssistantErrorEvent(message.id, msg);
              updateMessageById(
                message.id,
                (prev) => ({ ...prev, runStatus: 'failed', endedAt: prev.endedAt ?? Date.now() }),
                true,
                { telemetryFinalized: true },
              );
            }
          })
          .finally(() => {
            textBuffer.flush();
            textBuffer.cancel();
            unregisterTextBuffer();
            if (persistTimer) clearTimeout(persistTimer);
            reattachControllersRef.current.delete(runId);
            reattachCancelControllersRef.current.delete(runId);
            clearActiveRunRefs(reattachConversationId, controller, cancelController);
          });
      }
    };

    void attachRecoverableRuns();
    return () => {
      cancelled = true;
      for (const timer of retryTimers) clearTimeout(timer);
    };
  }, [
    daemonLive,
    config.mode,
    activeConversationId,
    reattachRecoveryTick,
    streaming,
    messages,
    project.id,
    updateMessageById,
    persistMessageById,
    auditDesignSystemWorkspaceAfterRun,
    markStreamingConversation,
    clearStreamingMarker,
    clearActiveRunRefs,
    clearCurrentRunStreamingMarker,
    refreshProjectFiles,
    persistArtifact,
    requestOpenFile,
    onProjectsRefresh,
    scheduleConversationMessageRefresh,
  ]);

  const commitQueuedChatSends = useCallback((next: QueuedChatSend[]) => {
    queuedChatSendsRef.current = next;
    setQueuedChatSends(next);
    saveQueuedChatSends(project.id, next);
  }, [project.id]);

  const enqueueChatSend = useCallback((item: QueuedChatSend) => {
    const next = [...queuedChatSendsRef.current, item];
    commitQueuedChatSends(next);
  }, [commitQueuedChatSends]);

  const removeQueuedChatSend = useCallback((id: string) => {
    const next = queuedChatSendsRef.current.filter((item) => item.id !== id);
    commitQueuedChatSends(next);
  }, [commitQueuedChatSends]);

  const updateQueuedChatSend = useCallback((id: string, update: QueuedChatSendUpdate) => {
    const next = queuedChatSendsRef.current.map((item) => {
      if (item.id !== id) return item;
      const meta = stripQueueOnlyFromMeta(update.meta);
      const updated: QueuedChatSend = {
        ...item,
        prompt: update.prompt,
        attachments: update.attachments,
        commentAttachments: update.commentAttachments,
      };
      if (meta === undefined) delete updated.meta;
      else updated.meta = meta;
      return updated;
    });
    commitQueuedChatSends(next);
  }, [commitQueuedChatSends]);

  const prioritizeQueuedChatSend = useCallback((id: string) => {
    const item = queuedChatSendsRef.current.find((candidate) => candidate.id === id);
    if (!item) return;
    const next = [item, ...queuedChatSendsRef.current.filter((candidate) => candidate.id !== id)];
    commitQueuedChatSends(next);
  }, [commitQueuedChatSends]);

  const reorderCurrentConversationQueuedChatSends = useCallback((orderedIds: string[]) => {
    if (!activeConversationId || orderedIds.length === 0) return;
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    const current = queuedChatSendsRef.current;
    const originalConversationItems = current.filter(
      (item) => item.conversationId === activeConversationId,
    );
    const sortedConversationItems = [...originalConversationItems].sort((a, b) => {
      const aOrder = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder;
    });
    if (
      sortedConversationItems.every((item, index) => item.id === originalConversationItems[index]?.id)
    ) {
      return;
    }
    let cursor = 0;
    const next = current.map((item) => {
      if (item.conversationId !== activeConversationId) return item;
      return sortedConversationItems[cursor++] ?? item;
    });
    commitQueuedChatSends(next);
  }, [activeConversationId, commitQueuedChatSends]);

  const queueChatSendForCurrentConversation = useCallback((input: {
    attachments: ChatAttachment[];
    commentAttachments: ChatCommentAttachment[];
    conversationId: string;
    meta?: ProjectChatSendMeta;
    prompt: string;
  }) => {
    const queuedMeta = stripQueueOnlyFromMeta(input.meta);
    enqueueChatSend({
      id: randomUUID(),
      conversationId: input.conversationId,
      prompt: input.prompt,
      attachments: input.attachments,
      commentAttachments: input.commentAttachments,
      ...(queuedMeta === undefined ? {} : { meta: queuedMeta }),
      createdAt: Date.now(),
    });
    if (input.commentAttachments.length > 0) {
      const reservedCommentIds = new Set(
        input.commentAttachments
          .filter((attachment) => attachment.source !== 'board-batch')
          .map((attachment) => attachment.id),
      );
      setAttachedComments((current) =>
        current.filter((comment) => !reservedCommentIds.has(comment.id)),
      );
      if (reservedCommentIds.size > 0) {
        setPreviewComments((current) =>
          current.map((comment) =>
            reservedCommentIds.has(comment.id)
              ? { ...comment, status: 'applying' }
              : comment,
          ),
        );
        void Promise.all(
          Array.from(reservedCommentIds, (commentId) =>
            patchPreviewCommentStatus(project.id, input.conversationId, commentId, 'applying'),
          ),
        ).catch(() => {});
      }
    }
  }, [enqueueChatSend, project.id]);


  const handleSend = useCallback(
    async (
      prompt: string,
      attachments: ChatAttachment[],
      commentAttachments: ChatCommentAttachment[] = commentsToAttachments(attachedComments),
      meta?: ProjectChatSendMeta,
      baseMessages?: ChatMessage[],
      delivery?: QueuedSendDelivery,
    ) => {
      // A live microphone cannot be serialized or left waiting in the text queue.
      if (meta?.voice && (config.mode !== 'daemon' || config.agentId !== 'codex' || currentConversationBusy || meta.queueOnly)) {
        meta.voice.finish();
        return false;
      }
      if (!activeConversationId) return false;
      if (historyContextLoading.current) return false;
      if (messagesConversationIdRef.current !== activeConversationId) return false;
      const runSessionMode = meta?.sessionMode ?? activeSessionMode;
      const retryTarget = meta?.retryOfAssistantId
        ? resolveRetryTarget(messages, meta.retryOfAssistantId)
        : null;
      if (meta?.retryOfAssistantId && !retryTarget) return false;
      const runContext = meta?.context ?? retryTarget?.userMsg.runContext;
      let historyBase = retryTarget ? retryTarget.priorMessages : baseMessages ?? messages;
      if (
        !retryTarget &&
        !prompt.trim() &&
        attachments.length === 0 &&
        commentAttachments.length === 0
      ) return false;
      const effectiveAttachments = mergeChatAttachments(
        attachments,
        ...commentAttachments.map((attachment) =>
          chatAttachmentsFromPreviewCommentImages(attachment.imageAttachments),
        ),
      );
      if (!retryTarget && meta?.queueOnly) {
        queueChatSendForCurrentConversation({
          conversationId: activeConversationId,
          prompt,
          attachments: effectiveAttachments,
          commentAttachments,
          meta: { ...(meta ?? {}), sessionMode: runSessionMode },
        });
        return true;
      }
      if (currentConversationBusy) {
        queueChatSendForCurrentConversation({
          conversationId: activeConversationId,
          prompt,
          attachments: effectiveAttachments,
          commentAttachments,
          meta: { ...(meta ?? {}), sessionMode: runSessionMode },
        });
        // The queue now owns this draft; provider acceptance is tracked by its
        // separate dispatch callback. Returning false would restore it twice.
        return true;
      }
      // Stop or navigation must invalidate preparation before a provider owns
      // a run/controller. This applies to normal sends and queued dispatches.
      const admissionGeneration = sendAdmissionGeneration.current;
      const admissionCurrent = () => admissionGeneration === sendAdmissionGeneration.current
        && messagesConversationIdRef.current === activeConversationId
        && (!delivery || delivery.isCurrent());
      if (config.mode === 'daemon' && config.agentId === 'amr') {
        if (amrGateInFlightRef.current) return false;
        amrGateInFlightRef.current = true;
        try {
          let gate = await checkAmrBalanceGate();
          if (!admissionCurrent()) return false;
          while (gate.kind !== 'allow') {
            const blockedGate = gate;
            const decision = await new Promise<AmrRunGateDecision>((resolve) => {
              setAmrRunGate({
                kind: blockedGate.kind,
                ...(blockedGate.kind === 'hard' ? { reason: blockedGate.reason } : {}),
                snapshot: blockedGate.snapshot,
                resolve,
              });
            });
            setAmrRunGate(null);
            if (!admissionCurrent()) return false;
            if (decision === 'cancel') return false;
            if (decision === 'proceed' && blockedGate.kind === 'soft') break;
            gate = await checkAmrBalanceGate();
            if (!admissionCurrent()) return false;
          }
        } finally {
          amrGateInFlightRef.current = false;
        }
      }
      // UI pagination must not silently remove earlier context from an existing
      // agent conversation. Context compaction is a separate, later capability.
      const visibleHistoryBase = historyBase;
      if (olderMessagesCursor) {
        if (historyContextLoading.current) return false;
        historyContextLoading.current = true;
        const generation = historyPageGeneration.current;
        try {
          const complete = await listMessages(project.id, activeConversationId);
          if (generation !== historyPageGeneration.current || !admissionCurrent()) return false;
          const retryUserIndex = retryTarget ? complete.findIndex(message => message.id === retryTarget.userMsg.id) : -1;
          const earlier = retryTarget && retryUserIndex >= 0 ? complete.slice(0, retryUserIndex) : complete;
          if (retryTarget && retryUserIndex < 0) throw new Error('The original message is unavailable.');
          historyBase = prependHistoryPage(historyBase, earlier);
        } catch {
          setError(t('history.loadError'));
          return false;
        } finally {
          historyContextLoading.current = false;
        }
      }
      if (!admissionCurrent()) return false;
      setChatSeed(null);
      const runConversationId = activeConversationId;
      setError(null);
      const startedAt = Date.now();
      const userMsg: ChatMessage = retryTarget?.userMsg ?? {
        id: randomUUID(),
        role: 'user',
        content: prompt,
        createdAt: startedAt,
        sessionMode: runSessionMode,
        ...(meta?.appliedPluginSnapshot
          ? { appliedPluginSnapshot: meta.appliedPluginSnapshot }
          : {}),
        ...(runContext ? { runContext } : {}),
        attachments: effectiveAttachments.length > 0 ? effectiveAttachments : undefined,
        commentAttachments: commentAttachments.length > 0 ? commentAttachments : undefined,
      };
      const runCommentAttachments = userMsg.commentAttachments ?? [];
      setAgentHandoffSource({conversationId:runConversationId,requestId:userMsg.id});
      const runAttachments = mergeChatAttachments(
        userMsg.attachments ?? [],
        ...runCommentAttachments.map((attachment) =>
          chatAttachmentsFromPreviewCommentImages(attachment.imageAttachments),
        ),
      );
      const selectedAgent =
        config.mode === 'daemon' && config.agentId
          ? agentsById.get(config.agentId)
          : null;
      const selectedAgentChoice =
        config.mode === 'daemon' && config.agentId
          ? config.agentModels?.[config.agentId]
          : undefined;
      const effectiveSelectedAgentChoice = effectiveAgentModelChoice(
        selectedAgent,
        selectedAgentChoice,
      );
      const assistantAgentId =
        config.mode === 'daemon'
          ? config.agentId ?? undefined
          : apiExecutionAgentId(config);
      const assistantAgentName =
        config.mode === 'daemon'
          ? agentModelDisplayName(
              config.agentId,
              selectedAgent?.name,
              effectiveSelectedAgentChoice?.model,
            )
          : apiExecutionLabel(config);
      const preTurnFileNames = projectFiles.map((f) => f.name);
      const assistantId = randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        agentId: assistantAgentId,
        agentName: assistantAgentName,
        events: [],
        createdAt: startedAt,
        runStatus: config.mode === 'daemon' ? 'running' : undefined,
        startedAt,
        sessionMode: runSessionMode,
        preTurnFileNames,
      };
      let latestAssistantMsg: ChatMessage = assistantMsg;
      const updateConversationLatestRun = (
        status: NonNullable<ChatMessage['runStatus']>,
        endedAt?: number,
      ) => {
        setConversations((curr) =>
          curr.map((conversation) =>
            conversation.id === runConversationId
              ? {
                  ...conversation,
                  updatedAt: endedAt ?? startedAt,
                  latestRun: {
                    status,
                    startedAt,
                    ...(endedAt === undefined
                      ? {}
                      : {
                          endedAt,
                          durationMs: Math.max(0, endedAt - startedAt),
                        }),
                  },
                }
              : conversation,
          ),
        );
      };
      activeCompletionNotificationRunsRef.current.add(assistantId);
      const nextHistory = [...historyBase, userMsg];
      const nextVisibleMessages = retryTarget
        ? [...visibleHistoryBase, userMsg, ...retryTarget.preservedAttempts, assistantMsg]
        : [...visibleHistoryBase, userMsg, assistantMsg];
      setMessages(nextVisibleMessages);
      markStreamingConversation(runConversationId);
      updateConversationLatestRun(config.mode === 'daemon' ? 'running' : 'queued');
      setArtifact(null);
      savedArtifactRef.current = null;
      onTouchProject();
      if (!retryTarget) persistMessage(userMsg);
      // Intentionally do NOT persist `assistantMsg` here. In daemon mode it
      // starts as runStatus='running' with no runId, which the source-level
      // guard treats as a phantom — the first DB write happens inside
      // `onRunCreated` (below) once POST /api/runs returns a runId. In API
      // mode there is no runStatus, and the buffered text path will persist
      // as soon as the first delta lands.
      persistMessage(assistantMsg);
      if (runCommentAttachments.length > 0) {
        void patchAttachedStatuses(runCommentAttachments, 'applying');
        const consumedCommentIds = new Set(runCommentAttachments.map((attachment) => attachment.id));
        setAttachedComments((current) =>
          current.filter((comment) => !consumedCommentIds.has(comment.id)),
        );
      }
      // If this is the first turn, derive a working title from the prompt
      // so the conversation is identifiable in the dropdown without a
      // round-trip through the agent.
      if (!retryTarget && historyBase.length === 0) {
        const title = isDesignSystemWorkspacePrompt(prompt)
          ? DESIGN_SYSTEM_WORKSPACE_DISPLAY_TITLE
          : prompt.slice(0, 60).trim();
        if (title) {
          setConversations((curr) =>
            curr.map((c) =>
              c.id === runConversationId ? { ...c, title } : c,
            ),
          );
          void patchConversation(project.id, runConversationId, { title });
        }
        const projectName = summarizeProjectNameFromPrompt(prompt);
        if (
          projectName &&
          projectName !== project.name &&
          canAutoRenameProjectFromPrompt(project)
        ) {
          const metadata = project.metadata
            ? { ...project.metadata, nameSource: 'prompt' as const }
            : undefined;
          const updated: Project = {
            ...project,
            name: projectName,
            ...(metadata ? { metadata } : {}),
            updatedAt: Date.now(),
          };
          onProjectChange(updated);
          void patchProject(project.id, {
            name: projectName,
            ...(metadata ? { metadata } : {}),
          });
        }
      }

      // Snapshot the file list at turn-start so we can diff after the
      // agent finishes and surface anything new (e.g. a generated .pptx)
      // as download chips on the assistant message.
      const beforeFileNames = new Set(preTurnFileNames);

      const parser = createArtifactParser();
      let parsedArtifact: Artifact | null = null;
      let liveHtml = '';
      let streamedText = '';
      let successfulToolOutput = false;
      let activeRunId: string | null = null;

      const updateAssistant = (updater: (prev: ChatMessage) => ChatMessage) => {
        setMessages((curr) =>
          curr.map((m) => {
            if (m.id !== assistantId) return m;
            const updated = updater(m);
            latestAssistantMsg = updated;
            return updated;
          }),
        );
      };
      let persistTimer: ReturnType<typeof setTimeout> | null = null;
      let persistWorkspaceInterruption: (() => void) | undefined;
      const persistAssistantSoon = () => {
        if (persistTimer) return;
        persistTimer = setTimeout(() => {
          persistTimer = null;
          persistMessageById(assistantId);
        }, 500);
      };
      const persistAssistantNowKeepalive = () => {
        if (persistTimer) {
          clearTimeout(persistTimer);
          persistTimer = null;
        }
        if (persistWorkspaceInterruption) {
          persistWorkspaceInterruption();
          return;
        }
        persistMessageById(assistantId, { keepalive: true });
      };
      const pushEvent = (ev: AgentEvent) => {
        textBuffer.flush();
        updateAssistant((prev) => ({ ...prev, events: [...(prev.events ?? []), ev] }));
        if (ev.kind === 'live_artifact') {
          setLiveArtifactEvents((prev) => appendLiveArtifactEventItem(prev, ev));
          void refreshLiveArtifacts().then(() => {
            if (ev.action !== 'deleted') requestOpenFile(liveArtifactTabId(ev.artifactId));
          });
          onProjectsRefresh();
          return;
        }
        if (ev.kind === 'live_artifact_refresh') {
          setLiveArtifactEvents((prev) => appendLiveArtifactEventItem(prev, ev));
          void refreshLiveArtifacts();
          onProjectsRefresh();
          return;
        }
        persistAssistantSoon();
        persistAssistantSoon();
        // Track Write tool invocations so we can auto-open the destination
        // file the moment the agent finishes writing it. The file-creating
        // tools we care about: Write (new file), Edit (existing file —
        // surfacing the freshly-modified file is also useful).
        if (ev.kind === 'tool_use') {
          // The authoritative input has landed; drop the live partial so the
          // card renders from the parsed `tool_use.input` instead of the
          // mid-token JSON fragment.
          setLiveToolInput((prev) => {
            if (!(ev.id in prev)) return prev;
            const next = { ...prev };
            delete next[ev.id];
            return next;
          });
        }
        if (ev.kind === 'tool_use' && ((ev.name === 'Write' || ev.name === 'write') || ev.name === 'Edit')) {
          const input = ev.input as { file_path?: unknown; filePath?: unknown } | null;
          const filePath = input?.file_path ?? input?.filePath;
          if (typeof filePath === 'string' && filePath.length > 0) {
            // Preserve the full path so decideAutoOpenAfterWrite can do a
            // path-suffix match against the project's relative file paths.
            // Reducing to a basename here would lose the segment alignment
            // we need to disambiguate same-basename collisions across the
            // project tree and outside it.
            pendingWritesRef.current.set(ev.id, filePath);
          }
        }
        if (ev.kind === 'tool_result') {
          const filePath = pendingWritesRef.current.get(ev.toolUseId);
          if (filePath) {
            pendingWritesRef.current.delete(ev.toolUseId);
            if (!ev.isError) {
              // Refresh first so FileWorkspace's file list (and the tab
              // body) sees the new content before we ask it to focus.
              // Only auto-open if the file actually landed in the project's
              // file list — otherwise an out-of-project Write (e.g. an
              // upstream repo edit) would spawn a permanent placeholder tab.
              void refreshProjectFiles().then(async (nextFiles) => {
                // A .jsx/.tsx loaded by a sibling HTML entry is a module of a
                // multi-file React prototype, not a standalone page — don't
                // strand the user on a dead-end preview tab. Issue #2744.
                const moduleFileNames = /\.(jsx|tsx)$/i.test(filePath)
                  ? await collectReferencedJsxNames(nextFiles, readProjectHtml)
                  : undefined;
                const decision = decideAutoOpenAfterWrite(filePath, nextFiles, {
                  moduleFileNames,
                });
                if (decision.shouldOpen && decision.fileName) {
                  requestOpenFile(decision.fileName);
                }
              });
            }
          }
        }
      };

      const applyContentDelta = (delta: string) => {
        for (const ev of parser.feed(delta)) {
          if (ev.type === 'artifact:start') {
            liveHtml = '';
            parsedArtifact = {
              identifier: ev.identifier,
              artifactType: ev.artifactType,
              title: ev.title,
              html: '',
            };
            setArtifact(parsedArtifact);
          } else if (ev.type === 'artifact:chunk') {
            liveHtml += ev.delta;
            parsedArtifact = parsedArtifact
              ? { ...parsedArtifact, html: liveHtml }
              : {
                  identifier: ev.identifier,
                  title: '',
                  html: liveHtml,
                };
            setArtifact((prev) =>
              prev
                ? { ...prev, html: liveHtml }
                : {
                    identifier: ev.identifier,
                    title: '',
                    html: liveHtml,
                  },
            );
          } else if (ev.type === 'artifact:end') {
            parsedArtifact = parsedArtifact
              ? { ...parsedArtifact, html: ev.fullContent }
              : {
                  identifier: ev.identifier,
                  title: '',
                  html: ev.fullContent,
                };
            setArtifact((prev) => (prev ? { ...prev, html: ev.fullContent } : null));
          }
        }
      };

      const textBuffer = createBufferedTextUpdates({
        updateMessage: updateAssistant,
        persistSoon: persistAssistantSoon,
        flushAndPersistNow: persistAssistantNowKeepalive,
        onContentDelta: applyContentDelta,
      });
      sendTextBufferRef.current = textBuffer;

      const controller = new AbortController();
      const cancelController = new AbortController();
      abortRef.current = controller;
      cancelRef.current = cancelController;
      const handlers = {
        onDelta: (delta: string) => {
          if (delta && !controller.signal.aborted) delivery?.accepted();
          streamedText += delta;
          textBuffer.appendContent(delta);
        },
        onAgentEvent: (ev: AgentEvent) => {
          if ((ev.kind === 'tool_use' || ev.kind === 'tool_result') && !controller.signal.aborted) delivery?.accepted();
          if (hasSuccessfulToolResult([ev])) successfulToolOutput = true;
          if (ev.kind === 'text') textBuffer.appendTextEvent(ev.text);
          else pushEvent(ev);
        },
        onToolInputDelta: (id: string, name: string, delta: string) => {
          setLiveToolInput((prev) => ({
            ...prev,
            [id]: {
              name,
              text: (prev[id]?.text ?? '') + delta,
              // Pin the tool's stream position the first time we see it: the
              // count of events already on the message is everything the model
              // emitted before the tool call (its preamble). Buffered text
              // (appendTextEvent) isn't flushed into `events` until the next
              // frame, so add 1 for any still-pending preamble chunk — it will
              // commit as one text event just before this tool's position.
              seq:
                prev[id]?.seq ??
                ((latestAssistantMsg.events?.length ?? 0) + (textBuffer.hasPendingText() ? 1 : 0)),
            },
          }));
        },
        onDone: (fullText = '') => {
          if (controller.signal.aborted || supersededRunsRef.current.has(controller)) delivery?.failed();
          else delivery?.accepted();
          // The daemon delivers onDone even for a canceled run, so a run
          // superseded by a "send now" interrupt can still land here and must
          // not apply its completion side effects over the replacement. A run
          // may finalize unless it was tagged superseded at interrupt time
          // (recorded before handleStop cleared the refs), which is reliable
          // even before the replacement send attaches — unlike abortRef, whose
          // terminal onRunStatus / handleStop churn make it ambiguous here.
          const runMayFinalize =
            !supersededRunsRef.current.has(controller);
          if (!runMayFinalize) {
            textBuffer.cancel();
            cancelSendTextBuffer();
            return;
          }
          textBuffer.flush();
          textBuffer.cancel();
          cancelSendTextBuffer();
          if (controller.signal.aborted) {
            const endedAt = Date.now();
            updateMessageById(assistantId, previous => ({ ...previous, runStatus: 'canceled', endedAt }), true, { telemetryFinalized: true });
            const ownsCurrentRun = clearCurrentRunStreamingMarker(runConversationId, controller, cancelController);
            if (ownsCurrentRun) updateConversationLatestRun('canceled', endedAt);
            return;
          }
          for (const ev of parser.flush()) {
            if (ev.type === 'artifact:end') {
              parsedArtifact = parsedArtifact
                ? { ...parsedArtifact, html: ev.fullContent }
                : {
                    identifier: ev.identifier,
                    title: '',
                    html: ev.fullContent,
                  };
              setArtifact((prev) => (prev ? { ...prev, html: ev.fullContent } : null));
            }
          }
          const emptyApiResponse =
            config.mode === 'api' &&
            !fullText.trim() &&
            !streamedText.trim() &&
            !liveHtml.trim() &&
            !successfulToolOutput;
          if (emptyApiResponse) {
            const endedAt = Date.now();
            const diagnostic = t('assistant.emptyResponseMessage');
            updateMessageById(
              assistantId,
              (prev) => ({
                ...prev,
                endedAt,
                runStatus: 'failed',
                events: [
                  ...(prev.events ?? []),
                  { kind: 'status', label: translateUi("ui.projectView.emptyResponse"), detail: config.model },
                  { kind: 'text', text: diagnostic },
                ],
              }),
              true,
              { telemetryFinalized: true },
            );
            if (runCommentAttachments.length > 0) {
              void patchAttachedStatuses(runCommentAttachments, 'failed');
            }
            const ownsCurrentRun = clearCurrentRunStreamingMarker(
              runConversationId,
              controller,
              cancelController,
            );
            if (ownsCurrentRun) updateConversationLatestRun('failed', endedAt);
            void refreshProjectFiles();
            onProjectsRefresh();
            return;
          }
          const endedAt = Date.now();
          let finalRunStatus: ChatMessage['runStatus'] = 'succeeded';
          updateAssistant((prev) => {
            finalRunStatus = resolveSucceededRunStatus(prev.runStatus);
            return {
              ...prev,
              endedAt,
              runStatus: finalRunStatus,
            };
          });
          const finalizingRunId = activeRunId;
          if (finalizingRunId) finalizingLocalRunIdsRef.current.add(finalizingRunId);
          if (runCommentAttachments.length > 0) {
            void patchAttachedStatuses(runCommentAttachments, 'needs_review');
          }
          const ownsCurrentRun = clearCurrentRunStreamingMarker(
            runConversationId,
            controller,
            cancelController,
          );
          if (ownsCurrentRun) updateConversationLatestRun(finalRunStatus ?? 'succeeded', endedAt);
          // Refetch the file list directly (rather than just bumping the
          // refresh signal) so we can diff against the pre-turn snapshot
          // and attach the new files to the assistant message as download
          // chips.
          void (async () => {
            let nextFiles = await refreshProjectFiles();
            const finalText = streamedText || fullText;
            const artifactToPersist = parsedArtifact?.html
              ? parsedArtifact
              : artifactFromStandaloneHtml(finalText);
            let persistedArtifactFile: ProjectFile | null = null;
            let artifactPersistenceFailure: ArtifactDeliveryFailure | null = null;
            if (artifactToPersist?.html) {
              const currentRunFiles = computeProducedFiles(beforeFileNames, nextFiles) ?? [];
              const persistence = await persistArtifact(
                artifactToPersist,
                nextFiles,
                finalText,
                currentRunFiles,
              );
              persistedArtifactFile = persistence.file;
              artifactPersistenceFailure = persistence.failure;
              nextFiles = await refreshProjectFiles();
            }
            const produced = mergeRecoveredArtifact(
              computeProducedFiles(beforeFileNames, nextFiles) ?? [],
              persistedArtifactFile,
            );
            const producedFileToOpen = selectAutoOpenProducedFileForSession(produced, runSessionMode);
            if (producedFileToOpen) requestOpenFile(producedFileToOpen);
            const deliveryOutcome = resolveDesignDeliveryOutcome({
              sessionMode: runSessionMode,
              runStatus: finalRunStatus,
              content: latestAssistantMsg.content || finalText,
              events: latestAssistantMsg.events,
              producedFileCount: produced.length,
              persistenceSucceeded: persistedArtifactFile !== null,
              persistenceFailed: artifactPersistenceFailure !== null,
            });
            setMessages((curr) => {
              const updated = curr.map((m) =>
                m.id === assistantId
                  ? applyDesignDeliveryOutcome(
                      { ...m, producedFiles: produced },
                      deliveryOutcome,
                      artifactPersistenceFailure,
                    )
                  : m,
              );
              const finalized = updated.find((m) => m.id === assistantId);
              if (finalized) persistMessage(finalized, { telemetryFinalized: true });
              return updated;
            });
            if (deliveryOutcome === 'no_result' || deliveryOutcome === 'delivery_failed') {
              if (runCommentAttachments.length > 0) {
                void patchAttachedStatuses(runCommentAttachments, 'failed');
              }
            }
            await auditDesignSystemWorkspaceAfterRun(assistantId);
          })().finally(() => {
            if (finalizingRunId) finalizingLocalRunIdsRef.current.delete(finalizingRunId);
          });
          onProjectsRefresh();
        },
        onError: (err: Error) => {
          delivery?.failed();
          const endedAt = Date.now();
          const errorCode = (err as Error & { code?: string }).code;
          const resumable = (err as Error & { resumable?: boolean }).resumable === true;
          // A run superseded by a "send now" interrupt can still surface a
          // late disconnect error (e.g. a canceled stream that lost its
          // terminal SSE). It must not paint a global failure banner or
          // re-finalize its already-canceled assistant message once it was
          // tagged superseded. See the onDone above for the ownership rationale.
          const runMayFinalize =
            !supersededRunsRef.current.has(controller);
          textBuffer.flush();
          textBuffer.cancel();
          cancelSendTextBuffer();
          if (runMayFinalize) {
            setError(err.message);
            updateMessageById(
              assistantId,
              (prev) => {
                const finalized = appendErrorStatusEvent(
                  {
                    ...prev,
                    ...(errorCode === SITE_DELIVERY_UNCERTAIN && !hasUncertainSiteDelivery(prev) ? { content: [prev.content, SITE_DELIVERY_INSPECT_FIRST].filter(Boolean).join('\n\n') } : {}),
                    endedAt,
                    runStatus:
                      config.mode === 'api' || prev.runId || isActiveRunStatus(prev.runStatus)
                        ? 'failed'
                        : prev.runStatus,
                    resumable,
                  },
                  err.message,
                  errorCode,
                );
                latestAssistantMsg = finalized;
                return finalized;
              },
              false,
            );
            window.setTimeout(() => {
              void saveMessage(
                project.id,
                runConversationId,
                latestAssistantMsg,
                { telemetryFinalized: true },
              );
            }, 0);
            if (runCommentAttachments.length > 0) {
              void patchAttachedStatuses(runCommentAttachments, 'failed');
            }
          }
          const ownsCurrentRun = clearCurrentRunStreamingMarker(
            runConversationId,
            controller,
            cancelController,
          );
          if (ownsCurrentRun) updateConversationLatestRun('failed', endedAt);
          void refreshProjectFiles();
        },
      };

      if (meta?.voice) {
        const voice = meta.voice;
        // Reuse the floating panel's authenticated voice session and transcript
        // transport; Workspace continues to own its normal chat persistence.
        void runDirectSite({
          config, voiceConnection: voice, agentId: 'codex', prompt,
          onAccepted: async () => { delivery?.accepted(); },
          ...(hasPixflowWordPressContext() ? {workspaceSource:{projectId:project.id,conversationId:runConversationId,requestId:userMsg.id}} : {}),
          model: effectiveSelectedAgentChoice?.model || undefined,
          reasoning: effectiveSelectedAgentChoice?.reasoning || undefined,
          fastMode: effectiveSelectedAgentChoice?.fastMode === true,
          mode: runSessionMode,
          history: historyBase.map(message => ({ role: message.role, content: message.content })),
          context: { ...runContext, projectId: project.id, conversationId: runConversationId },
          persistenceSurface: `workspace:${project.id}:${runConversationId}`,
          signal: controller.signal,
          onUpdate: (content, events) => {
            if (supersededRunsRef.current.has(controller)) return;
            streamedText = content;
            updateAssistant(previous => ({ ...previous, content, events }));
            persistAssistantSoon();
          },
        }).then(outcome => {
          if (outcome === 'canceled') updateAssistant(previous => ({ ...previous, runStatus: 'canceled' }));
          handlers.onDone(streamedText);
        }).catch(error => {
          if (controller.signal.aborted || directRunStatus(error) === 'canceled' || (voice.signal.aborted && error instanceof Error && error.name === 'AbortError')) {
            updateAssistant(previous => ({ ...previous, runStatus: 'canceled' }));
            handlers.onDone(streamedText);
          } else {
            const failure = error instanceof Error ? error : new Error(String(error));
            voice.finish(failure.message);
            handlers.onError(failure);
          }
        }).finally(() => voice.finish());
        return true;
      }

      // WordPress-backed media projects use the browser-owned provider
      // credentials when they are available. In the embedded runtime the
      // media key is deliberately kept out of the daemon's persisted
      // media-config.json, so sending this project through the Local CLI
      // dispatcher would make a valid WordPress key look like a missing
      // daemon credential (and would also make the agent choose its default
      // OpenAI model without a chance to use the configured provider).
      // Ordinary projects, and media projects without a browser key, retain
      // the Local CLI/Bridge path below.
      const projectMediaSurface =
        project.metadata?.kind === 'image' ? 'image'
          : project.metadata?.kind === 'video' ? 'video'
            : project.metadata?.kind === 'audio' ? 'audio'
              : null;
      const useWordPressMediaRoute = shouldUseWordPressMediaRoute({
        wordpressRuntime: hasPixflowWordPressContext(),
        mode: config.mode,
        surface: projectMediaSurface,
        mediaProviders: config.mediaProviders,
      });

      if (config.mode === 'daemon' && !useWordPressMediaRoute) {
        if (!config.agentId) {
          handlers.onError(new Error(translateUi("ui.projectView.feedback75")));
          return true;
        }
        const choice = effectiveSelectedAgentChoice;
        // v2 analytics: when the active project is a DS workspace
        // (created by `prepareCreatedDesignSystemProject`, identifiable
        // by `metadata.importedFrom === 'design-system'`), every run
        // started from this composer is a DS-variant run. Pass
        // analyticsHints so the daemon emits run_created /
        // run_finished under `page_name=design_system_project`,
        // `area=design_system_generation`, `project_kind=design_system`.
        // The first-ever message into a DS workspace is the auto-sent
        // generation kickoff (entry_from=`onboarding_design_system` is
        // the doc's name for "DS create flow handed off to the agent");
        // subsequent messages are review-driven regenerations
        // (`regenerate_from_review`). Use `messages.length === 0` —
        // truer than autoSendFirstMessageRef which races StrictMode
        // remounts + sessionStorage clears.
        const isDesignSystemWorkspaceProject =
          project.metadata?.importedFrom === 'design-system';
        const dsEntryFrom: 'onboarding_design_system' | 'regenerate_from_review' =
          messages.length === 0
            ? 'onboarding_design_system'
            : 'regenerate_from_review';
        const dsAnalyticsHints = isDesignSystemWorkspaceProject
          ? {
              entryFrom: dsEntryFrom,
              projectKind: 'design_system' as const,
              designSystemRunContext: {
                origin: 'manual_create' as const,
              },
            }
          : undefined;
        // A caller-supplied entry_from (e.g. 'resume_continue' from the
        // resumable-failure Continue action) overrides the DS default so the
        // run is attributed to the affordance that started it.
        const runAnalyticsHints =
          meta?.entryFrom
            ? { ...(dsAnalyticsHints ?? {}), entryFrom: meta.entryFrom }
            : dsAnalyticsHints;
        const projectMetadata = (project.metadata ?? {}) as ProjectMetadata & {
          pluginId?: string | null;
          pluginInputs?: Record<string, unknown> | null;
        };
        const projectPluginId =
          typeof projectMetadata.pluginId === 'string' && projectMetadata.pluginId.trim().length > 0
            ? projectMetadata.pluginId.trim()
            : null;
        const projectPluginInputs =
          projectMetadata.pluginInputs &&
          typeof projectMetadata.pluginInputs === 'object' &&
          !Array.isArray(projectMetadata.pluginInputs)
            ? projectMetadata.pluginInputs
            : undefined;
        const projectUsesWordPressPluginAssets =
          Array.isArray(projectMetadata.pixflowPluginAssets) &&
          projectMetadata.pixflowPluginAssets.length > 0;
        const runAppliedPluginSnapshotId =
          meta?.appliedPluginSnapshotId ??
          meta?.appliedPluginSnapshot?.snapshotId ??
          project.appliedPluginSnapshotId ??
          null;
        void streamViaDaemon({
          agentId: config.agentId,
          history: historyWithInternalPluginContext(nextHistory, project),
          signal: controller.signal,
          cancelSignal: cancelController.signal,
          handlers,
          projectId: project.id,
          conversationId: runConversationId,
          assistantMessageId: assistantId,
          ...(hasPixflowWordPressContext() ? {workspaceSource:{projectId:project.id,conversationId:runConversationId,requestId:userMsg.id}} : {}),
          clientRequestId: randomUUID(),
          skillId: project.skillId ?? null,
          skillIds: Array.isArray(meta?.skillIds) ? meta.skillIds : [],
          context: runContext,
          designSystemId: project.designSystemId ?? null,
          attachments: runAttachments.map((a) => a.path),
          commentAttachments: runCommentAttachments,
          sessionMode: runSessionMode,
          appliedPluginSnapshotId: runAppliedPluginSnapshotId,
          pluginId: runAppliedPluginSnapshotId || projectUsesWordPressPluginAssets ? null : projectPluginId,
          pluginInputs: runAppliedPluginSnapshotId || projectUsesWordPressPluginAssets ? undefined : projectPluginInputs,
          wordpressPluginAssetSync: projectPluginId ? { pluginId: projectPluginId } : null,
          research: meta?.research,
           mediaExecution: mediaExecutionPolicyForProjectMetadata(project.metadata),
           // Carry the selected surface into the Bridge request as well as the
           // run policy. WordPress-backed projects may not exist in the
           // Bridge's SQLite database yet, so this prevents an image chip from
           // being composed as a generic Prototype/HTML run.
           projectMetadata: (project.metadata ?? null) as Record<string, unknown> | null,
           model: choice?.model ?? null,
          reasoning: choice?.reasoning ?? null,
          fastMode: choice?.fastMode === true,
          locale,
          ...(runAnalyticsHints ? { analyticsHints: runAnalyticsHints } : {}),
          onRunCreated: (runId) => {
            delivery?.accepted();
            activeRunId = runId;
            const pinnedAssistant = {
              ...latestAssistantMsg,
              runId,
              runStatus: 'queued' as const,
            };
            latestAssistantMsg = pinnedAssistant;
            // The view may already be on a different project/conversation;
            // pin the daemon run to the original row so returning can reattach.
            void saveMessage(project.id, runConversationId, pinnedAssistant);
            updateMessageById(assistantId, (prev) => ({ ...prev, runId, runStatus: 'queued' }));
          },
          onRunStatus: (runStatus) => {
            const endedAt = isTerminalRunStatus(runStatus) ? Date.now() : undefined;
            const runMayFinalize =
              !supersededRunsRef.current.has(controller);
            updateMessageById(
              assistantId,
              (prev) => ({
                ...prev,
                runStatus,
                endedAt: endedAt === undefined ? prev.endedAt : prev.endedAt ?? endedAt,
              }),
              true,
              runStatus === 'canceled' ? { telemetryFinalized: true } : undefined,
            );
            if (!runMayFinalize) return;
            updateConversationLatestRun(runStatus, endedAt);
            if (isTerminalRunStatus(runStatus)) {
              clearCurrentRunStreamingMarker(runConversationId, controller, cancelController);
              scheduleConversationMessageRefresh(runConversationId);
            }
          },
          onRunEventId: (lastRunEventId) => {
            updateMessageById(assistantId, (prev) => ({ ...prev, lastRunEventId }));
            persistAssistantSoon();
          },
          onProjectFilesSynced: () => {
            // A WordPress-backed Local CLI run writes through the optional
            // Bridge first, then copies the authoritative project tree back
            // to WordPress. Refresh only after that copy completes so the
            // file list/canvas can discover generated media immediately.
            void refreshProjectFiles();
          },
        });
        return true;
      } else {
        // Media projects must remain useful in a WordPress-backed install.
        // The normal API chat stream is already direct-to-provider, but media
        // generation historically asked the model to spawn `od media` via the
        // optional daemon. When a browser-owned provider key is available,
        // execute the provider request through the WP REST adapter instead.
        // This keeps the key request-scoped and still writes the result to the
        // durable WP project file tree, so the daemon/Bridge is not a hidden
        // credential requirement for Local CLI media projects either.
        const mediaKind = project.metadata?.kind;
        const directMediaSurface =
          mediaKind === 'image' ? 'image'
            : mediaKind === 'video' ? 'video'
              : mediaKind === 'audio' ? 'audio'
                : null;
        if (hasPixflowWordPressContext() && directMediaSurface) {
          const mediaMetadata = project.metadata;
          const metadataModel =
            directMediaSurface === 'image' ? mediaMetadata?.imageModel
              : directMediaSurface === 'video' ? mediaMetadata?.videoModel
                : mediaMetadata?.audioModel;
          if (directMediaSurface === 'video' && metadataModel === 'hyperframes-html') {
            handlers.onError(new Error(
              translateUi("ui.projectView.feedback76"),
            ));
            return true;
          }
          // AIHubMix keeps its video catalogue live rather than shipping a
          // static list in `VIDEO_MODELS`. Load that catalogue before asking
          // the user so a configured AIHubMix key is not misreported as having
          // no video provider simply because the local seed list is empty.
          let dynamicMediaModels: Awaited<ReturnType<typeof fetchAIHubMixModels>> = [];
          if (directMediaSurface === 'video' && config.mediaProviders?.aihubmix?.apiKey?.trim()) {
            try {
              dynamicMediaModels = await fetchAIHubMixModels('video');
            } catch {
              // The static provider list remains authoritative when the live
              // catalogue is temporarily unavailable.
            }
          }
          const mediaModelChoices = configuredWordPressMediaModelChoices({
            surface: directMediaSurface,
            mediaProviders: config.mediaProviders,
            apiProtocol: config.apiProtocol,
            apiKey: config.apiKey,
            dynamicModels: dynamicMediaModels,
          });
          const answeredModelValue = answeredMediaModelValue(historyBase, userMsg.content ?? '');
          const answeredModelChoice = findConfiguredWordPressMediaChoice(
            mediaModelChoices,
            answeredModelValue,
          );
          const explicitModel =
            metadataModel?.trim()
            || (directMediaSurface === 'image' && byokImageModelUserSelectedRef.current
              ? byokImageModelOverride.trim()
              : '')
            || (directMediaSurface === 'video' && byokVideoModelUserSelectedRef.current
              ? byokVideoModelOverride.trim()
              : '')
            || (directMediaSurface === 'audio' && byokSpeechModelUserSelectedRef.current
              ? byokSpeechModelOverride.trim()
              : '');

          // The media chip intentionally leaves provider/model selection to the
          // agent conversation. The WordPress adapter still owns the actual
          // request (so BYOK works without the daemon), but it must first ask a
          // real question-form instead of silently choosing OpenAI or the first
          // catalogue entry. The answer is validated against the browser's
          // request-scoped configured-provider list before any API call.
          if (!answeredModelChoice && !explicitModel) {
            if (mediaModelChoices.length === 0) {
              handlers.onError(new Error(
                translateUi("ui.projectView.feedback77", { value1: String(directMediaSurface), value2: String(directMediaSurface) }),
              ));
              return true;
            }
            const questionText = mediaModelQuestionText(directMediaSurface, mediaModelChoices, translateUi);
            const responseText = `${translateUi('ui.finalMediaPicker.beforeGeneration')}\n\n${questionText}`;
            pushEvent({ kind: 'status', label: translateUi("ui.projectView.awaitingInput"), detail: 'media-model' });
            handlers.onDelta(responseText);
            handlers.onAgentEvent({ kind: 'text', text: responseText });
            handlers.onDone(responseText);
            return true;
          }
          if (answeredModelValue && !answeredModelChoice) {
            const questionText = mediaModelQuestionText(directMediaSurface, mediaModelChoices, translateUi);
            const responseText = `${translateUi('ui.finalMediaPicker.invalidModel')}\n\n${questionText}`;
            pushEvent({ kind: 'status', label: translateUi("ui.projectView.awaitingInput"), detail: 'media-model-invalid' });
            handlers.onDelta(responseText);
            handlers.onAgentEvent({ kind: 'text', text: responseText });
            handlers.onDone(responseText);
            return true;
          }
          let selectedModel = '';
          let providerId: string | undefined;
          let providerConfig = undefined;
          if (answeredModelChoice) {
            selectedModel = answeredModelChoice.model;
            providerId = answeredModelChoice.providerId;
            providerConfig = config.mediaProviders?.[providerId];
          } else if (directMediaSurface === 'image') {
            const selection = resolveWordPressImageSelection({
              metadataModel,
              // The override state is initially seeded from Settings. Only a
              // deliberate composer selection is a per-turn choice; passing
              // the seed as explicit would let a stale `imagen-4` setting
              // override a configured Nano Banana provider.
              overrideModel: byokImageModelUserSelectedRef.current
                ? byokImageModelOverride
                : undefined,
              configuredModel: config.byokImageModel,
              apiProtocol: config.apiProtocol,
              mediaProviders: config.mediaProviders,
              fallbackModel: byokImageModelOptionsPV[0]?.id,
            });
            selectedModel = selection.model;
            providerId = selection.providerId;
            providerConfig = selection.providerConfig;
          } else {
            selectedModel = (
              directMediaSurface === 'video'
                ? (byokVideoModelUserSelectedRef.current
                  ? byokVideoModelOverride
                  : metadataModel || byokVideoModelOverride || config.byokVideoModel || byokVideoModelOptionsPV[0]?.id)
                : (byokSpeechModelUserSelectedRef.current
                  ? byokSpeechModelOverride
                  : metadataModel || byokSpeechModelOverride || config.byokSpeechModel || byokSpeechModelOptionsPV[0]?.id)
            )?.trim() || '';
            const configuredProvider = selectedModel
              ? Object.entries(config.mediaProviders ?? {}).find(([, entry]) => entry?.model?.trim() === selectedModel)?.[0]
              : undefined;
            providerId = mediaModelProviderId(selectedModel)
              ?? configuredProvider
              ?? config.apiProtocol
              ?? 'openai';
            providerConfig = config.mediaProviders?.[providerId];
          }
          providerId ??= config.apiProtocol ?? 'openai';
          // Nano Banana is a media catalogue alias for the Google Gemini
          // protocol. Reuse the normal Google BYOK key/base URL when the user
          // has not configured a separate media-provider entry; otherwise a
          // valid Google key is incorrectly reported as missing.
          const sharesChatProviderCredentials =
            providerId === config.apiProtocol
            || (providerId === 'nanobanana' && config.apiProtocol === 'google');
          const apiKey = providerConfig?.apiKey?.trim()
            || (sharesChatProviderCredentials ? config.apiKey.trim() : '');
          const baseUrl = providerConfig?.baseUrl?.trim()
            || (sharesChatProviderCredentials ? config.baseUrl : undefined);
          const mediaAgentIdentity = mediaProviderAgentIdentity(providerId, selectedModel);
          updateMessageById(
            assistantId,
            (prev) => {
              const updated = {
                ...prev,
                agentId: mediaAgentIdentity.agentId,
                agentName: mediaAgentIdentity.agentName,
              };
              latestAssistantMsg = updated;
              return updated;
            },
            true,
          );
          if (!selectedModel || !apiKey) {
            handlers.onError(new Error(
              translateUi("ui.projectView.feedback78", { value1: String(providerId), value2: String(directMediaSurface) }),
            ));
            return true;
          }
          const userText = (userMsg.content ?? '').trim();
          if (userText === '') {
            handlers.onError(new Error(translateUi("ui.projectView.feedback79")));
            return true;
          }
          const generationPrompt = answeredModelChoice
            ? previousMediaPrompt(historyBase) ?? userText
            : userText;
          pushEvent({ kind: 'status', label: translateUi("ui.projectView.requesting"), detail: selectedModel });
          try {
            const result = await generateProjectMediaOnWordPress({
              projectId: project.id,
              protocol: providerId,
              apiKey,
              baseUrl,
              surface: directMediaSurface,
              model: selectedModel,
              prompt: generationPrompt,
              aspect: directMediaSurface === 'image'
                ? mediaMetadata?.imageAspect
                : mediaMetadata?.videoAspect,
              duration: directMediaSurface === 'video'
                ? mediaMetadata?.videoLength
                : mediaMetadata?.audioDuration,
              length: mediaMetadata?.videoLength,
              voice: mediaMetadata?.voice
                || (byokSpeechVoiceUserSelectedRef.current ? byokSpeechVoiceOverride : undefined)
                || byokSpeechVoiceOverride
                || config.byokSpeechVoice,
              audioKind: mediaMetadata?.audioKind,
              onProgress: (detail) => pushEvent({ kind: 'status', label: translateUi("ui.projectView.polling"), detail }),
            });
            if (result.file) {
              // The WordPress generation route saves the attachment before
              // returning. Mark that exact project file as synced so the
              // normal best-effort file finalizer does not create a second
              // Media Library attachment. If attachment persistence returned
              // a warning, leave it unmarked and let the finalizer retry.
              if (result.media && typeof window !== 'undefined') {
                window.localStorage.setItem(
                  generatedMediaSyncKey(project.id, result.file),
                  '1',
                );
              }
              void refreshProjectFiles();
            }
            const fileName = result.file?.name ?? '';
            const responseText = fileName
              ? `Generated ${directMediaSurface} media: [${fileName}](${projectRawUrl(project.id, fileName)}).`
              : `Generated ${directMediaSurface} media.`;
            handlers.onDelta(responseText);
            handlers.onAgentEvent({ kind: 'text', text: responseText });
            handlers.onDone(responseText);
          } catch (error) {
            handlers.onError(error instanceof Error ? error : new Error(String(error)));
          }
          return true;
        }
        // Mirror the daemon chat-route memory hook for BYOK chats. The
        // CLI path runs `extractFromMessage` BEFORE composing the prompt
        // (so an explicit "remember: X" / "我是 X" marker in this turn's
        // user message lands in memory in time for this turn's system
        // prompt), then queues `extractWithLLM` on child close (so the
        // small-model pass picks up implicit facts from the full
        // user+assistant exchange). BYOK chats never hit that route, so
        // we replicate both phases here against `/api/memory/extract`.
        // Without this, the Memory tab / model picker is a no-op for
        // BYOK users even though the UI saves model + index + entries
        // for that mode.
        const userText = (userMsg.content ?? '').trim();
        // Snapshot the live BYOK chat config so the daemon can run
        // "Same as chat" memory extraction against the same vendor /
        // key / baseUrl / apiVersion the user is chatting with. The
        // daemon never persists BYOK creds itself, so this per-call
        // signal is the only way `pickProvider()` can avoid falling
        // through to env / media-config (which is wrong for BYOK)
        // when no explicit memory model override is set. The picker
        // re-syncs an *explicit* override when chat config drifts;
        // this snapshot covers the implicit "Same as chat" default.
        const byokChatProvider =
          config.apiProtocol && config.apiKey
            ? {
                provider: config.apiProtocol,
                apiKey: config.apiKey,
                baseUrl: config.baseUrl,
                apiVersion:
                  config.apiProtocol === 'azure'
                    ? config.apiVersion ?? ''
                    : '',
              }
            : undefined;
        if (userText.length > 0) {
          try {
            await fetch('/api/memory/extract', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userMessage: userText,
                projectId: project.id,
                conversationId: runConversationId,
                chatProvider: byokChatProvider,
              }),
            });
          } catch {
            // Best-effort: memory extraction must never block the
            // chat. The daemon's SSE bus will catch up the Memory tab
            // on the next event.
          }
        }
        const systemPrompt = await composedSystemPrompt(runSessionMode);
        const apiHistory = await historyWithApiAttachmentContext(
          historyWithCommentAttachmentContext(
            historyWithWorkspaceContext(nextHistory, userMsg.id, runContext),
            userMsg.id,
          ),
          userMsg.id,
          project.id,
          projectFiles,
          { omitNativeImageAttachments: usesAnthropicProxy(config) },
        );
        pushEvent({ kind: 'status', label: translateUi("ui.projectView.requesting"), detail: config.model });
        let accumulatedAssistantText = '';
        if (hasPixflowWordPressContext()) {
          // Workspace uses the same native tool loop as the floating panel.
          // Source identity is bound by WordPress; assistant text never triggers navigation.
          let deliveredEvents = 0;
          let siteEvents: AgentEvent[] = [];
          let interruptionSaved = false;
          persistWorkspaceInterruption = () => {
            if (interruptionSaved || supersededRunsRef.current.has(controller)) return;
            interruptionSaved = true;
            textBuffer.flush();
            const interrupted = appendErrorStatusEvent({ ...latestAssistantMsg,
              content: [accumulatedAssistantText, SITE_DELIVERY_INSPECT_FIRST].filter(Boolean).join('\n\n'), events: siteEvents,
              runStatus: 'failed', resumable: false, endedAt: Date.now(),
            }, SITE_DELIVERY_INSPECT_FIRST, SITE_DELIVERY_UNCERTAIN);
            latestAssistantMsg = interrupted;
            // Both pagehide listeners use one terminal write; a generic streaming
            // checkpoint must not race and overwrite the inspect-first warning.
            void saveMessage(project.id, runConversationId, interrupted, { keepalive: true, telemetryFinalized: true });
          };
          void runByokSite({
            config,
            onAccepted: async () => { delivery?.accepted(); },
            historySource: { binding: { projectId: project.id, conversationId: runConversationId }, messages: historyBase },
            workspaceSource: { projectId: project.id, conversationId: runConversationId, requestId: userMsg.id },
            systemPrompt,
            prompt: apiHistory.at(-1)?.content || prompt,
            history: apiHistory.slice(0, -1).map(message => ({ role: message.role, content: message.content })),
            context: { ...runContext, projectId: project.id, conversationId: runConversationId },
            attachments: runAttachments.map(attachment => ({
              projectId: attachment.projectId || project.id, path: attachment.path || attachment.name,
              name: attachment.name, kind: attachment.kind === 'image' ? 'image' : 'file',
            })),
            signal: controller.signal,
            onDeliveryUncertain: persistWorkspaceInterruption,
            onUpdate: (content, events) => {
              if (supersededRunsRef.current.has(controller)) return;
              siteEvents = events;
              const delta = content.slice(accumulatedAssistantText.length);
              accumulatedAssistantText = content;
              if (delta) handlers.onDelta(delta);
              for (const event of events.slice(deliveredEvents)) handlers.onAgentEvent(event);
              deliveredEvents = events.length;
            },
          }).then(() => {
            handlers.onDone(accumulatedAssistantText);
            if (userText && accumulatedAssistantText.trim()) {
              void fetch('/api/memory/extract', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userMessage: userText, assistantMessage: accumulatedAssistantText,
                  projectId: project.id, conversationId: runConversationId, chatProvider: byokChatProvider }),
              }).catch(() => {});
            }
          }).catch(error => {
            if ((error as { code?: string })?.code === SITE_DELIVERY_UNCERTAIN) {
              handlers.onError(error);
            } else if (controller.signal.aborted) {
              updateAssistant(previous => ({ ...previous, runStatus: 'canceled' }));
              handlers.onDone(accumulatedAssistantText);
            } else handlers.onError(error instanceof Error ? error : new Error(String(error)));
          }).finally(() => { persistWorkspaceInterruption = undefined; });
          return true;
        }
        void streamMessage(config, systemPrompt, apiHistory, controller.signal, {
          onDelta: (delta) => {
            accumulatedAssistantText += delta;
            handlers.onDelta(delta);
            handlers.onAgentEvent({ kind: 'text', text: delta });
          },
          onDone: () => {
            handlers.onDone();
            const assistantText = accumulatedAssistantText.trim();
            if (userText.length === 0 || assistantText.length === 0) return;
            void fetch('/api/memory/extract', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userMessage: userText,
                assistantMessage: accumulatedAssistantText,
                projectId: project.id,
                conversationId: runConversationId,
                chatProvider: byokChatProvider,
              }),
            }).catch(() => {
              // Best-effort: see comment above on the pre-turn call.
            });
          },
          onError: handlers.onError,
          onAgentEvent: handlers.onAgentEvent,
        }, {
          projectId: project.id,
          // SenseAudio BYOK chat reads this to pre-fill the tool param's
          // default model. Prefer the live composer override; fall back
          // to the Settings default when the composer dropdown is on
          // "use default". Other protocols ignore unknown body fields.
          byokImageModel:
            byokImageModelOverride || config.byokImageModel || byokImageModelOptionsPV[0]?.id,
          byokVideoModel:
            byokVideoModelOverride || config.byokVideoModel || byokVideoModelOptionsPV[0]?.id,
          byokSpeechModel:
            byokSpeechModelOverride || config.byokSpeechModel || byokSpeechModelOptionsPV[0]?.id,
          byokSpeechVoice: byokSpeechVoiceOverride || config.byokSpeechVoice,
        });
        return true;
      }
    },
    [translateUi,
      attachedComments,
      activeConversationId,
      activeSessionMode,
      currentConversationBusy,
      queueChatSendForCurrentConversation,
      messages,
      olderMessagesCursor,
      config,
      locale,
      agentsById,
      // Per-session BYOK image/video model overrides are read inside this
      // callback (see the streamMessage context below). Without them in the
      // deps, the dropdown updates its state + display but handleSend keeps a
      // stale closure and sends the previously selected model.
      byokImageModelOverride,
      byokVideoModelOverride,
      byokSpeechModelOverride,
      byokSpeechVoiceOverride,
      byokImageModelOptionsPV,
      byokVideoModelOptionsPV,
      byokSpeechModelOptionsPV,
      composedSystemPrompt,
      onTouchProject,
      project.appliedPluginSnapshotId,
      project.id,
      project.metadata,
      project.name,
      projectFiles,
      refreshProjectFiles,
      refreshLiveArtifacts,
      requestOpenFile,
      persistMessage,
      persistMessageById,
      auditDesignSystemWorkspaceAfterRun,
      patchAttachedStatuses,
      updateMessageById,
      markStreamingConversation,
      clearStreamingMarker,
      clearCurrentRunStreamingMarker,
      scheduleConversationMessageRefresh,
      onProjectsRefresh,
      onProjectChange,
    ],
  );

  // Cancel every in-flight run for the current conversation (the user's own
  // streaming turn plus any reattached runs), mark their assistant messages
  // canceled, and drop the streaming state. Defined here — ahead of the
  // queued-send handlers — because "send now" interrupts the active run to
  // make room for the prioritized send.
  const handleStop = useCallback(() => {
    const stoppedAt = Date.now();
    sendAdmissionGeneration.current++;
    queuedDispatchGeneration.current++;
    startingQueuedChatSendIdRef.current = null;
    commitQueuedChatSends(queuedChatSendsRef.current.map(item => item.conversationId === activeConversationId
      ? { ...item, dispatchState: item.dispatchState === 'sending' || item.dispatchState === 'unconfirmed' ? 'unconfirmed' : 'paused' }
      : item));
    cancelSendTextBuffer(true);
    cancelReattachTextBuffers(true);
    cancelRef.current?.abort();
    cancelRef.current = null;
    for (const controller of reattachCancelControllersRef.current.values()) {
      controller.abort();
    }
    reattachCancelControllersRef.current.clear();
    abortRef.current?.abort();
    abortRef.current = null;
    for (const controller of reattachControllersRef.current.values()) {
      controller.abort();
    }
    reattachControllersRef.current.clear();
    setStreaming(false);
    streamingConversationIdRef.current = null;
    setStreamingConversationId(null);
    setMessages((curr) => {
      const { messages: next, finalized } = finalizeActiveAssistantMessagesOnStop(curr, stoppedAt, config.mode === 'api' && hasPixflowWordPressContext());
      for (const message of finalized) persistMessage(message, { telemetryFinalized: true });
      return next;
    });
  }, [cancelSendTextBuffer, cancelReattachTextBuffers, persistMessage, config.mode, activeConversationId, commitQueuedChatSends]);

  // Flip the deck preview to the slide a queued send's marked element lives on
  // the moment that send starts processing. No-op for plain prompts or marks
  // without a slide index; FileWorkspace/FileViewer ignore it unless the named
  // file is the open deck.
  const armSlideNavForQueuedSend = useCallback((item: QueuedChatSend) => {
    const target = queuedSlideNavTarget(item.commentAttachments);
    if (!target) return;
    requestOpenFile(target.filePath);
  }, [requestOpenFile]);

  const dispatchQueuedChatSend = useCallback((item: QueuedChatSend) => {
    if (startingQueuedChatSendIdRef.current) return;
    const generation = ++queuedDispatchGeneration.current;
    const projectId = project.id;
    startingQueuedChatSendIdRef.current = item.id;
    commitQueuedChatSends(queuedChatSendsRef.current.map(row => row.id === item.id ? { ...row, dispatchState: 'sending' } : row));
    let settled = false;
    const owns = () => !settled && generation === queuedDispatchGeneration.current && projectIdRef.current === projectId;
    const accepted = () => {
      if (!owns()) return;
      settled = true;
      startingQueuedChatSendIdRef.current = null;
      removeQueuedChatSend(item.id);
      setQueuedAutoStartTick(tick => tick + 1);
    };
    const failed = () => {
      if (!owns()) return;
      settled = true;
      startingQueuedChatSendIdRef.current = null;
      commitQueuedChatSends(queuedChatSendsRef.current.map(row => row.id === item.id ? { ...row, dispatchState: 'unconfirmed' } : row));
      setError(t('ui.finalQueue.unconfirmed'));
    };
    armSlideNavForQueuedSend(item);
    void handleSend(item.prompt, item.attachments, item.commentAttachments, item.meta, undefined, {
      accepted, failed, isCurrent: () => owns() && messagesConversationIdRef.current === item.conversationId,
    })
      .then(started => { if (!started) failed(); }, failed);
  }, [project.id, commitQueuedChatSends, removeQueuedChatSend, armSlideNavForQueuedSend, handleSend, t]);

  const steerQueuedChatSend = useCallback(async (id: string) => {
    const item = queuedChatSendsRef.current.find(row => row.id === id && row.conversationId === activeConversationId);
    const assistant = [...messages].reverse().find(row => row.role === 'assistant' && isActiveRunStatus(row.runStatus));
    if (!item || item.dispatchState === 'sending' || item.dispatchState === 'unconfirmed' || !assistant?.runId || startingQueuedChatSendIdRef.current) return;
    startingQueuedChatSendIdRef.current = id;
    commitQueuedChatSends(queuedChatSendsRef.current.map(row => row.id === id ? { ...row, dispatchState: 'sending' } : row));
    const result = await steerChatRun(assistant.runId, { messageId: id, prompt: item.prompt,
      attachments: item.attachments, commentAttachments: item.commentAttachments });
    if (startingQueuedChatSendIdRef.current === id) startingQueuedChatSendIdRef.current = null;
    if (result.state === 'accepted') removeQueuedChatSend(id);
    else if (result.state === 'queued') commitQueuedChatSends(queuedChatSendsRef.current.map(row => row.id === id ? { ...row, dispatchState: undefined } : row));
    else {
      commitQueuedChatSends(queuedChatSendsRef.current.map(row => row.id === id ? { ...row, dispatchState: result.state === 'unconfirmed' ? 'unconfirmed' : 'paused' } : row));
      setError(result.message || t('ui.finalQueue.unconfirmed'));
    }
  }, [activeConversationId, messages, commitQueuedChatSends, removeQueuedChatSend, t]);
  const workspaceSteer = hasPixflowWordPressContext() && config.mode === 'daemon' && config.agentId === 'codex' ? steerQueuedChatSend : undefined;
  useEffect(() => {
    const accepted = new Set(messages.flatMap(message => (message.events ?? []).flatMap(event => event.kind === 'steering_message' ? [event.id] : [])));
    const rows = queuedChatSendsRef.current;
    const next = rows.filter(row => row.conversationId !== activeConversationId || !accepted.has(row.id));
    if (next.length !== rows.length) commitQueuedChatSends(next);
  }, [messages, activeConversationId, commitQueuedChatSends]);

  const sendQueuedChatSendNow = useCallback((id: string) => {
    const item = queuedChatSendsRef.current.find((candidate) => candidate.id === id);
    if (!item) return;
    if (currentConversationBusy) {
      // "Send now" while the agent is still working: the user has explicitly
      // chosen this turn over the in-flight one, so interrupt the running run
      // and move this item to the front. Stopping flips the conversation out
      // of its busy state, and the auto-start effect below then flushes the
      // now-first queued send — reusing the same path as a natural completion,
      // so runs never overlap.
      //
      // Record the runs we're superseding BEFORE handleStop() clears the active
      // refs. The daemon still delivers a late terminal callback for the
      // canceled run; tagging its controller here lets those callbacks be
      // recognized as stale and skip every current-run side effect, even if the
      // replacement send hasn't attached yet.
      if (abortRef.current) supersededRunsRef.current.add(abortRef.current);
      for (const controller of reattachControllersRef.current.values()) {
        supersededRunsRef.current.add(controller);
      }
      // The interrupted turn moved its preview-comment attachments to
      // 'applying' when it started; since we now suppress its terminal
      // callbacks, reset them to 'open' so they don't stay stuck mid-apply.
      // Reset ONLY the in-flight run's comments: queued sends (including the
      // one being prioritized) also hold their attachments in 'applying', and
      // those must stay reserved — the replacement run re-applies them. The
      // in-flight run's comments are exactly the 'applying' ones not owned by
      // any queued send.
      const queuedCommentIds = new Set(
        queuedChatSendsRef.current.flatMap((send) =>
          send.commentAttachments.map((attachment) => attachment.id),
        ),
      );
      const stuckApplying = previewCommentsRef.current.filter(
        (comment) => comment.status === 'applying' && !queuedCommentIds.has(comment.id),
      );
      if (stuckApplying.length > 0) {
        const resetIds = new Set(stuckApplying.map((comment) => comment.id));
        setPreviewComments((current) =>
          current.map((comment) =>
            resetIds.has(comment.id) ? { ...comment, status: 'open' } : comment,
          ),
        );
        void Promise.all(
          stuckApplying.map((comment) =>
            patchPreviewCommentStatus(project.id, comment.conversationId, comment.id, 'open'),
          ),
        ).catch(() => {});
      }
      prioritizeQueuedChatSend(id);
      handleStop();
      // This explicit action resumes only the selected item; Stop still leaves
      // the other waiting requests paused.
      commitQueuedChatSends(queuedChatSendsRef.current.map(row => row.id === id ? { ...row, dispatchState: undefined } : row));
      return;
    }
    dispatchQueuedChatSend(item);
  }, [currentConversationBusy, handleStop, prioritizeQueuedChatSend, commitQueuedChatSends, dispatchQueuedChatSend]);

  useEffect(() => {
    if (currentConversationBusy) {
      return;
    }
    if (startingQueuedChatSendIdRef.current) return;
    if (!activeConversationId) return;
    if (messagesConversationIdRef.current !== activeConversationId) return;
    const next = queuedChatSendsRef.current.find(
      (item) => item.conversationId === activeConversationId,
    );
    if (!next || next.dispatchState) return;
    dispatchQueuedChatSend(next);
  }, [
    activeConversationId,
    currentConversationBusy,
    queuedAutoStartTick,
    queuedChatSends,
    dispatchQueuedChatSend,
  ]);

  const handleRetry = useCallback(
    (assistantMessage: ChatMessage) => {
      if (currentConversationActionDisabled || hasUncertainSiteDelivery(assistantMessage)) return;
      void handleSend('', [], [], { retryOfAssistantId: assistantMessage.id });
    },
    [currentConversationActionDisabled, handleSend],
  );

  // "Continue" on a resumable failed run: send a fresh turn in the same
  // conversation. For a session-resuming runtime (Claude) the daemon persisted
  // the failed run's CLI session, so this turn resumes it (`--resume`) and the
  // agent continues from its committed work instead of restarting. Mirrors the
  // "Continue remaining tasks" affordance; unlike Retry it does not replay the
  // prior turn from scratch. Tagged `entryFrom: 'resume_continue'` so
  // run_created / run_finished can quantify how often resume fires and whether
  // it recovers (the whole point is to show the mechanism lowers failure rate).
  const handleResumeRun = useCallback(
    (_assistantMessage: ChatMessage) => {
      if (currentConversationActionDisabled) return;
      void handleSend(RESUME_CONTINUE_PROMPT, [], [], { entryFrom: 'resume_continue' });
    },
    [currentConversationActionDisabled, handleSend],
  );

  // "Switch to AMR & retry" from the failed-run card: switch the run to AMR,
  // open Settings on the AMR controls so the user can sign in / authorize /
  // top up, and arm an auto-retry that fires once AMR is selected AND signed
  // in (see the effect below).
  const [pendingAmrRetry, setPendingAmrRetry] = useState<ChatMessage | null>(null);
  const handleSwitchToAmrAndRetry = useCallback(
    (failedAssistant: ChatMessage) => {
      if (currentConversationActionDisabled) return;
      onModeChange('daemon');
      onAgentChange('amr');
      onOpenAmrSettings?.();
      setPendingAmrRetry(failedAssistant);
    },
    [currentConversationActionDisabled, onModeChange, onAgentChange, onOpenAmrSettings],
  );
  // PR #3157: Antigravity's `agy -p` cannot complete OAuth on its own,
  // so the auth banner offers a one-click "Sign in via terminal"
  // button that POSTs to the daemon. The daemon opens a system
  // Terminal running `agy` (osascript / x-terminal-emulator /
  // `cmd /c start`); the user finishes Google sign-in there and then
  // clicks Retry to redo the chat run. We don't auto-retry because
  // the OAuth completion happens externally with no reliable signal
  // back to the chat — the secondary Retry button on the same banner
  // covers the manual case.
  const handleLaunchAntigravityOauth = useCallback(async () => {
    try {
      const { launchAntigravityOauth } = await import('../providers/daemon');
      const result = await launchAntigravityOauth();
      if (!result.ok) {
        // Surface the daemon-side reason so the user knows whether
        // the spawn failed because of missing osascript / unsupported
        // platform / etc. instead of silently swallowing it.
        console.warn('[antigravity] oauth-launch failed:', result.error);
      }
    } catch (err) {
      console.warn('[antigravity] oauth-launch threw:', err);
    }
  }, []);
  // Poll the AMR login status while a retry is armed, rather than only reacting
  // to the AmrLoginPill's status event — the user may close Settings (which
  // unmounts the pill and stops its polling) before finishing sign-in in the
  // browser. Polling here keeps working regardless of the pill's lifecycle.
  // Fires once AMR is the selected agent AND the account is signed in.
  useEffect(() => {
    if (!pendingAmrRetry) return;
    let cancelled = false;
    const tryRetry = async () => {
      if (cancelled) return;
      if (!(config.mode === 'daemon' && config.agentId === 'amr')) return;
      const status = await fetchVelaLoginStatus().catch(() => null);
      if (cancelled || status?.loggedIn !== true) return;
      setPendingAmrRetry(null);
      handleRetry(pendingAmrRetry);
    };
    void tryRetry();
    const interval = setInterval(() => void tryRetry(), 2000);
    // Give up after a few minutes so we never poll forever.
    const stop = setTimeout(() => {
      if (!cancelled) setPendingAmrRetry(null);
    }, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [pendingAmrRetry, config.mode, config.agentId, handleRetry]);

  useEffect(() => {
    if (!autoAuditRepairSeed) return;
    if (!activeConversationId) return;
    if (!messagesInitialized) return;
    if (currentConversationBusy) return;
    const repairText = autoAuditRepairSeed.value.trim();
    setAutoAuditRepairSeed(null);
    if (!repairText) return;
    void handleSend(repairText, [], []);
  }, [
    activeConversationId,
    autoAuditRepairSeed,
    currentConversationBusy,
    handleSend,
    messagesInitialized,
  ]);

  const handleSendBoardCommentAttachments = useCallback(
    async (commentAttachments: ChatCommentAttachment[], images: File[] = []) => {
      if (currentConversationQueueDisabled) return false;
      if (commentAttachments.length === 0 && images.length === 0) return false;
        // Upload any attached images once, then queue. Each comment becomes its
      // own task (so multiple notes => multiple queued tasks); the images ride
      // along the first task rather than being duplicated across every note.
      let uploaded: ChatAttachment[] = [];
      if (images.length > 0) {
        const result = await uploadProjectFiles(project.id, images);
        uploaded = result.uploaded;
      }
      if (commentAttachments.length === 0) {
        if (uploaded.length > 0) await handleSend('', uploaded, [], { queueOnly: true });
        return true;
      }
      for (let i = 0; i < commentAttachments.length; i++) {
        const commentAttachment = commentAttachments[i]!;
        const savedImages = chatAttachmentsFromPreviewCommentImages(commentAttachment.imageAttachments);
        const prompt = commentTaskQuery(commentAttachment);
        await handleSend(
          prompt,
          mergeChatAttachments(i === 0 ? uploaded : [], savedImages),
          [commentTaskContextAttachment(commentAttachment)],
          { queueOnly: true },
        );
      }
      return true;
    },
    [handleSend, project.id, currentConversationQueueDisabled],
  );
  const commentQueueOnSend = currentConversationBusy && !currentConversationQueueDisabled;

  const handleContinueRemainingTasks = useCallback(
    (_assistantMessage: ChatMessage, todos: TodoItem[]) => {
      if (currentConversationActionDisabled || todos.length === 0) return;
      const remainingList = todos
        .map((todo, i) => {
          const label =
            todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content;
          return `${i + 1}. [${todo.status}] ${label}`;
        })
        .join('\n');
      const prompt =
        'Continue the remaining unfinished tasks from the previous run. ' +
        'Do not redo completed work. Focus only on these unfinished todos:\n\n' +
        `${remainingList}\n\n` +
        'Before making changes, inspect the current project files as needed. ' +
        'Update TodoWrite as you complete each remaining task.';
      void handleSend(prompt, [], []);
    },
    [currentConversationActionDisabled, handleSend],
  );

  const selectedPluginActionAgent =
    config.mode === 'daemon' && config.agentId
      ? agentsById.get(config.agentId)
      : null;
  const selectedPluginActionChoice =
    config.mode === 'daemon' && config.agentId
      ? config.agentModels?.[config.agentId]
      : undefined;
  const effectiveSelectedPluginActionChoice = effectiveAgentModelChoice(
    selectedPluginActionAgent,
    selectedPluginActionChoice,
  );
  const pluginWorkflowAgentName =
    config.mode === 'daemon'
      ? agentModelDisplayName(
          config.agentId,
          selectedPluginActionAgent?.name,
          effectiveSelectedPluginActionChoice?.model,
        )
      : apiExecutionLabel(config);

  const handlePluginFolderAgentAction = useCallback(
    async (relativePath: string, action: PluginFolderAgentAction) => {
      if (currentConversationActionDisabled || !activeConversationId) return;
      setHiddenAssistantPluginActionPaths((prev) => new Set(prev).add(relativePath));
      if (action === 'install') {
        setActivePluginActionPaths((prev) => new Set(prev).add(relativePath));
        let outcome;
        try {
          outcome = await installGeneratedPluginFolder(project.id, relativePath);
        } finally {
          setActivePluginActionPaths((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
          setHiddenAssistantPluginActionPaths((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
        }
        if (!outcome.ok) throw new Error(outcome.message);
        return { message: outcome.message };
      }
      const conversationId = activeConversationId;
      const shareAction = 'publish-github';
      setActivePluginActionPaths((prev) => new Set(prev).add(relativePath));
      let taskStart;
      try {
        taskStart = await startGeneratedPluginShareTask(project.id, relativePath, shareAction);
      } catch (error) {
        setActivePluginActionPaths((prev) => {
          const next = new Set(prev);
          next.delete(relativePath);
          return next;
        });
        setHiddenAssistantPluginActionPaths((prev) => {
          const next = new Set(prev);
          next.delete(relativePath);
          return next;
        });
        throw error;
      }
      const startedAt = taskStart.startedAt;
      const messageId = randomUUID();
      const updateConversationLatestRun = (
        status: NonNullable<ChatMessage['runStatus']>,
        endedAt?: number,
      ) => {
        setConversations((curr) =>
          curr.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  updatedAt: endedAt ?? startedAt,
                  latestRun: {
                    status,
                    startedAt,
                    ...(endedAt === undefined
                      ? {}
                      : {
                          endedAt,
                          durationMs: Math.max(0, endedAt - startedAt),
                        }),
                  },
                }
              : conversation,
          ),
        );
      };
      const progressMessage: ChatMessage = {
        id: messageId,
        role: 'assistant',
        content: pluginWorkflowStartContent(action, relativePath),
        agentName: pluginWorkflowAgentName,
        events: pluginWorkflowPlannedEvents(action, relativePath),
        createdAt: startedAt,
        startedAt,
        runStatus: 'running',
      };
      setForceStreamingPluginMessageIds((prev) => new Set(prev).add(messageId));
      appendConversationMessage(conversationId, progressMessage, undefined, false);
      updateConversationLatestRun('running');
      void (async () => {
        let since = 0;
        let liveEvents = [...pluginWorkflowPlannedEvents(action, relativePath)];
        let liveContent = pluginWorkflowStartContent(action, relativePath);
        while (true) {
          const snapshot = await waitGeneratedPluginShareTask(taskStart.taskId, since, 25_000);
          since = snapshot.nextSince;
          if (snapshot.progress.length > 0) {
            const newTextEvents = snapshot.progress
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => ({ kind: 'text' as const, text: `${line}\n` }));
            liveEvents = [
              ...liveEvents.filter((event, index) => !(index === liveEvents.length - 1 && event.kind === 'status' && event.label === 'working')),
              ...newTextEvents,
              { kind: 'status', label: translateUi("ui.projectView.working"), detail: pluginWorkflowTitle(action) },
            ];
            liveContent = `${liveContent}\n\n${snapshot.progress.map((line) => line.trim()).filter(Boolean).join('\n')}`.trim();
            replaceConversationMessage(
              conversationId,
              {
                ...progressMessage,
                content: liveContent,
                events: liveEvents,
                runStatus: 'running',
              },
              undefined,
              false,
            );
          }
          if (snapshot.status === 'running' || snapshot.status === 'queued') continue;
          const endedAt = snapshot.endedAt ?? Date.now();
          setActivePluginActionPaths((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
          setHiddenAssistantPluginActionPaths((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
          if (snapshot.status === 'done' && snapshot.result) {
            setForceStreamingPluginMessageIds((prev) => {
              const next = new Set(prev);
              next.delete(messageId);
              return next;
            });
            replaceConversationMessage(
              conversationId,
              {
                ...progressMessage,
                content: pluginWorkflowSuccessContent(
                  action,
                  relativePath,
                  snapshot.result.message,
                  snapshot.result.url,
                  snapshot.result.log,
                ),
                events: pluginWorkflowResultEvents(
                  action,
                  relativePath,
                  snapshot.result.message,
                  snapshot.result.url,
                  snapshot.result.log,
                  true,
                  liveEvents,
                ),
                endedAt,
                runStatus: 'succeeded',
              },
              { telemetryFinalized: true },
            );
            updateConversationLatestRun('succeeded', endedAt);
            return;
          }
          const errorMessage = snapshot.error?.message || `${pluginWorkflowTitle(action)} failed.`;
          setForceStreamingPluginMessageIds((prev) => {
            const next = new Set(prev);
            next.delete(messageId);
            return next;
          });
          replaceConversationMessage(
            conversationId,
            {
              ...progressMessage,
              content: pluginWorkflowFailureContent(
                action,
                relativePath,
                errorMessage,
                snapshot.error?.log,
              ),
              events: pluginWorkflowResultEvents(
                action,
                relativePath,
                errorMessage,
                undefined,
                snapshot.error?.log,
                false,
                liveEvents,
              ),
              endedAt,
              runStatus: 'failed',
            },
            { telemetryFinalized: true },
          );
          updateConversationLatestRun('failed', endedAt);
          return;
        }
      })().catch((err) => {
        const endedAt = Date.now();
        setForceStreamingPluginMessageIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
        setActivePluginActionPaths((prev) => {
          const next = new Set(prev);
          next.delete(relativePath);
          return next;
        });
        setHiddenAssistantPluginActionPaths((prev) => {
          const next = new Set(prev);
          next.delete(relativePath);
          return next;
        });
        replaceConversationMessage(
          conversationId,
          {
            ...progressMessage,
            content: pluginWorkflowFailureContent(
              action,
              relativePath,
              err instanceof Error ? err.message : String(err),
            ),
            events: pluginWorkflowResultEvents(
              action,
              relativePath,
              err instanceof Error ? err.message : String(err),
              undefined,
              [],
              false,
            ),
            endedAt,
            runStatus: 'failed',
          },
          { telemetryFinalized: true },
        );
        updateConversationLatestRun('failed', endedAt);
      });
      return;
    },
    [translateUi,
      activeConversationId,
      appendConversationMessage,
      currentConversationActionDisabled,
      pluginWorkflowAgentName,
      project.id,
      replaceConversationMessage,
    ],
  );

  const sentDesignSystemReviewTaskKeysRef = useRef<Set<string>>(new Set());
  const persistDesignSystemReviewEntry = useCallback((
    sectionTitle: string,
    entry: DesignSystemReviewEntry,
  ) => {
    const baseMetadata: ProjectMetadata = {
      kind: project.metadata?.kind ?? 'other',
      ...project.metadata,
    };
    const metadata: ProjectMetadata = {
      ...baseMetadata,
      designSystemReview: {
        ...(baseMetadata.designSystemReview ?? {}),
        [sectionTitle]: entry,
      },
    };
    onProjectChange({ ...project, metadata });
    void patchProject(project.id, { metadata });
  }, [onProjectChange, project]);

  const sendDesignSystemFeedback = useCallback((
    sectionTitle: string,
    feedback: string,
    sectionFiles: string[],
  ): DesignSystemReviewAgentTask | void => {
    const cleanFeedback = feedback.trim();
    if (!cleanFeedback) return;
    const prompt = designSystemNeedsWorkPrompt(sectionTitle, cleanFeedback, sectionFiles);
    const queuedAt = new Date().toISOString();
    if (!activeConversationId || !messagesInitialized || currentConversationActionDisabled) {
      return {
        status: 'queued',
        prompt,
        queuedAt,
      };
    }
    const task: DesignSystemReviewAgentTask = {
      status: 'sent',
      prompt,
      queuedAt,
      sentAt: queuedAt,
    };
    sentDesignSystemReviewTaskKeysRef.current.add(`${sectionTitle}:${queuedAt}`);
    void handleSend(prompt, designSystemFeedbackAttachments(projectFiles, sectionFiles), []);
    return task;
  }, [
    activeConversationId,
    currentConversationActionDisabled,
    handleSend,
    messagesInitialized,
    projectFiles,
  ]);
  const persistDesignSystemReviewDecision = useCallback((
    sectionTitle: string,
    decision: DesignSystemReviewEntry['decision'],
    details?: DesignSystemReviewDetails,
  ) => {
    const entry: DesignSystemReviewEntry = {
      decision,
      updatedAt: new Date().toISOString(),
    };
    if (details?.feedback) entry.feedback = details.feedback;
    if (details?.files) entry.files = details.files;
    if (details?.agentTask) entry.agentTask = details.agentTask;
    persistDesignSystemReviewEntry(sectionTitle, entry);
  }, [persistDesignSystemReviewEntry]);
  useEffect(() => {
    if (!activeConversationId || !messagesInitialized || currentConversationActionDisabled) return;
    const queued = Object.entries(project.metadata?.designSystemReview ?? {}).find(
      ([, entry]) =>
        entry.decision === 'needs-work'
        && Boolean(entry.feedback?.trim())
        && entry.agentTask?.status === 'queued',
    );
    if (!queued) return;
    const [sectionTitle, entry] = queued;
    const task = entry.agentTask;
    if (!task) return;
    const taskKey = `${sectionTitle}:${task.queuedAt}`;
    if (sentDesignSystemReviewTaskKeysRef.current.has(taskKey)) return;
    sentDesignSystemReviewTaskKeysRef.current.add(taskKey);
    const sectionFiles = entry.files ?? [];
    const prompt = task.prompt || designSystemNeedsWorkPrompt(
      sectionTitle,
      entry.feedback ?? '',
      sectionFiles,
    );
    const sentAt = new Date().toISOString();
    persistDesignSystemReviewEntry(sectionTitle, {
      ...entry,
      agentTask: {
        ...task,
        status: 'sent',
        prompt,
        sentAt,
      },
    });
    void handleSend(prompt, designSystemFeedbackAttachments(projectFiles, sectionFiles), []);
  }, [
    activeConversationId,
    currentConversationActionDisabled,
    handleSend,
    messagesInitialized,
    persistDesignSystemReviewEntry,
    project.metadata?.designSystemReview,
    projectFiles,
  ]);

  const handleExportAsPptx = useCallback(
    (fileName: string) => {
      if (currentConversationActionDisabled) return;
      const prompt = buildPptxExportPrompt(fileName);
      const attachment: ChatAttachment = {
        path: fileName,
        name: fileName,
        kind: 'file',
      };
      void handleSend(prompt, [attachment], []);
    },
    [currentConversationActionDisabled, handleSend],
  );

  const handleNewConversation = useCallback(async () => {
    if (creatingConversationRef.current) return;
    // Only block if we're sure the current conversation is empty:
    // messages must be loaded AND match the active conversation.
    if (
      messagesConversationIdRef.current === activeConversationId &&
      messages.length === 0
    ) {
      return;
    }
    creatingConversationRef.current = true;
    setCreatingConversation(true);
    setConversationLoadError(null);
    try {
      const fresh = await createConversation(project.id);
      if (!fresh) throw new Error(translateUi("ui.projectView.feedback72"));
      // Eagerly clear messages and update ref so rapid clicks don't create
      // duplicate empty conversations before the effect resolves.
      setMessages([]);
      setStreaming(false);
      streamingConversationIdRef.current = null;
      setStreamingConversationId(null);
      setMessagesConversationId(null);
      messagesConversationIdRef.current = fresh.id;
      setConversations((curr) => [fresh, ...curr]);
      setActiveConversationId(fresh.id);
      // Push the new conversation id into the URL synchronously so the
      // route-sync effect sees a matching `routeConversationId` before
      // it can revert `activeConversationId`. Without this, the route-sync
      // effect can fight the conversation switch, preventing users from
      // switching back to older conversations after creating a new one.
      navigate(
        {
          kind: 'project',
          projectId: project.id,
          conversationId: fresh.id,
          fileName: openTabsState.active ?? null,
        },
        { replace: true },
      );
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create a conversation for this project.';
      setConversationLoadError(message);
      setError(message);
    } finally {
      creatingConversationRef.current = false;
      setCreatingConversation(false);
    }
  }, [translateUi, project.id, activeConversationId, messages.length, navigate, openTabsState.active]);

  const handleSelectConversation = useCallback((id: string) => {
    if (id === activeConversationId && failedMessagesConversationId !== id) return;
    setMessages([]);
    setPreviewComments([]);
    setAttachedComments([]);
    setArtifact(null);
    setStreaming(false);
    streamingConversationIdRef.current = null;
    setStreamingConversationId(null);
    setMessagesConversationId(null);
    setFailedMessagesConversationId(null);
    setConversationLoadError(null);
    messagesConversationIdRef.current = null;
    setActiveConversationId(id);
    // Push the new conversation id into the URL synchronously so the
    // route-sync effect at L512 sees a matching `routeConversationId`
    // before it can find the previous conversation in the list and
    // revert `activeConversationId` to it. Without this, the same
    // effect that fights handleNewConversation also fights chat
    // switching, ping-ponging until React's nested-update guard fires.
    navigate(
      {
        kind: 'project',
        projectId: project.id,
        conversationId: id,
        fileName: openTabsState.active ?? null,
      },
      { replace: true },
    );
    setMessageLoadRetryNonce((nonce) => nonce + 1);
  }, [activeConversationId, failedMessagesConversationId, project.id, openTabsState.active]);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      const ok = await deleteConversationApi(project.id, id);
      if (!ok) return;
      // The deleted conversation may have owned an unanswered
      // `<question-form>`, which the daemon counts toward the project's
      // `needsInput` flag in `/api/projects`. Home cards render that
      // flag from the cached projects payload, so without refreshing
      // it here the `Needs input` badge survives the deletion until
      // the next manual reload.
      onProjectsRefresh();
      setConversations((curr) => {
        const next = curr.filter((c) => c.id !== id);
        if (next.length === 0) {
          // Re-seed so the project always has at least one conversation
          // to write into.
          void createConversation(project.id).then((fresh) => {
            if (fresh) {
              setConversations([fresh]);
              setActiveConversationId(fresh.id);
            }
          });
        } else if (id === activeConversationId) {
          setActiveConversationId(next[0]!.id);
        }
        return next;
      });
    },
    [project.id, activeConversationId, onProjectsRefresh],
  );

  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      const trimmed = title.trim() || null;
      setConversations((curr) =>
        curr.map((c) => (c.id === id ? { ...c, title: trimmed } : c)),
      );
      await patchConversation(project.id, id, { title: trimmed });
    },
    [project.id],
  );

  const handleConversationSessionModeChange = useCallback(
    async (id: string, sessionMode: ChatSessionMode) => {
      setConversations((curr) =>
        curr.map((conversation) =>
          conversation.id === id ? { ...conversation, sessionMode } : conversation,
        ),
      );
      const updated = await patchConversation(project.id, id, { sessionMode });
      if (updated) {
        setConversations((curr) =>
          curr.map((conversation) =>
            conversation.id === id ? { ...conversation, ...updated } : conversation,
          ),
        );
      }
    },
    [project.id],
  );

  const handleActiveConversationSessionModeChange = useCallback(
    (sessionMode: ChatSessionMode) => {
      if (!activeConversationId) return;
      void handleConversationSessionModeChange(activeConversationId, sessionMode);
    },
    [activeConversationId, handleConversationSessionModeChange],
  );

  const handleForkFromMessage = useCallback(
    async (assistantMessage: ChatMessage) => {
      if (!activeConversationId || forkingMessageId || forkInFlight.current) return;
      forkInFlight.current = true;
      setForkingMessageId(assistantMessage.id);
      setConversationLoadError(null);
      try {
        const sourceTitle = activeConversation?.title?.trim() && activeConversation.title !== 'New chat' ? activeConversation.title.trim() : project.name;
        if (hasPixflowWordPressContext()) {
          await retryWorkspaceHistoryWrites(project.id, activeConversationId);
          if (workspaceHistoryWriteFailed(project.id, activeConversationId) || workspaceHistoryPendingMessages(project.id, activeConversationId).length) throw new Error(t('chat.forkConversationFailed'));
        }
        const requestKey = `${project.id}:${activeConversationId}:${assistantMessage.id}`;
        const retryKey = `pixflow:pending-fork:${requestKey}`;
        let pendingRequest: string | null = null;
        try { pendingRequest = sessionStorage.getItem(retryKey); } catch { /* Private browsing can disable storage. */ }
        const requestId = forkRequests.current.get(requestKey) ?? pendingRequest ?? randomUUID();
        forkRequests.current.set(requestKey, requestId);
        try { sessionStorage.setItem(retryKey, requestId); } catch { /* In-memory retries remain available. */ }
        const forkTitle = sourceTitle
          ? t('chat.forkedConversationTitle', { title: sourceTitle })
          : undefined;
        // The server snapshots complete durable history, including unloaded pages.
        const fresh = await createConversation(project.id, forkTitle, {
          forkToNewChat: true,
          requestId,
          seedFromConversationId: activeConversationId,
          forkAfterMessageId: assistantMessage.id,
          sessionMode: activeSessionMode,
        });
        if (!fresh || fresh.projectId === project.id) throw new Error(t('chat.forkConversationFailed'));
        await onProjectsRefresh();
        navigate({ kind: 'project', projectId: fresh.projectId, conversationId: fresh.id, fileName: null });
        forkRequests.current.delete(requestKey);
        try { sessionStorage.removeItem(retryKey); } catch { /* Successful forks no longer need a retry token. */ }
      } catch (err) {
        const message = err instanceof Error ? err.message : t('chat.forkConversationFailed');
        setConversationLoadError(message);
        setError(message);
      } finally {
        forkInFlight.current = false;
        setForkingMessageId(null);
      }
    },
    [
      activeConversationId,
      activeConversation?.title,
      activeSessionMode,
      forkingMessageId,
      navigate,
      onProjectsRefresh,
      project.id,
      project.name,
      t,
    ],
  );

  const handleProjectRename = useCallback(
    (newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === project.name) return;
      const metadata = project.metadata
        ? { ...project.metadata, nameSource: 'user' as const }
        : undefined;
      const updated: Project = {
        ...project,
        name: trimmed,
        ...(metadata ? { metadata } : {}),
        updatedAt: Date.now(),
      };
      onProjectChange(updated);
      void patchProject(project.id, {
        name: trimmed,
        ...(metadata ? { metadata } : {}),
      });
    },
    [project, onProjectChange],
  );

  const activeConversationChatState = useMemo(
    () =>
      activeConversationId
        ? {
	            conversationId: activeConversationId,
	            messages,
	            streaming: currentConversationStreaming,
	            loading: currentConversationLoading,
	            sendDisabled: currentConversationSendDisabled,
            queuedItems: currentConversationQueuedItems,
            error: conversationLoadError ?? error ?? audioVoiceOptionsError,
            onSend: handleSend,
            onRetry: handleRetry,
            onStop: handleStop,
            onRemoveQueuedSend: removeQueuedChatSend,
            onUpdateQueuedSend: updateQueuedChatSend,
            onReorderQueuedSends: reorderCurrentConversationQueuedChatSends,
            onSendQueuedNow: sendQueuedChatSendNow,
            onSteerQueuedSend: workspaceSteer,
            onAssistantFeedback: handleAssistantFeedback,
          }
        : undefined,
    [
      activeConversationId,
      audioVoiceOptionsError,
      conversationLoadError,
      currentConversationActionDisabled,
	      currentConversationQueuedItems,
	      currentConversationSendDisabled,
	      currentConversationLoading,
	      currentConversationStreaming,
      error,
      handleAssistantFeedback,
      handleRetry,
      handleSend,
      handleStop,
      messages,
      removeQueuedChatSend,
      reorderCurrentConversationQueuedChatSends,
      sendQueuedChatSendNow,
      workspaceSteer,
      updateQueuedChatSend,
    ],
  );

  const handleChangeDesignSystemId = useCallback(
    (nextId: string | null) => {
      if ((project.designSystemId ?? null) === nextId) return;
      // `design_system_apply_result` studio variant. The existing
      // NewProjectPanel picker fires the same event under
      // `page_name=home`; this in-project header picker fires under
      // `page_name=studio` so the funnel sees applies from both
      // surfaces. `target_project_kind` derives from
      // `project.metadata.kind`.
      const target =
        (projectKindToTracking(project.metadata?.kind ?? null, project.metadata?.videoModel) ?? 'unknown') as TrackingDesignSystemApplyTargetKind;
      const picked = nextId
        ? designSystems.find((d) => d.id === nextId)
        : null;
      const origin: TrackingDesignSystemOrigin | undefined = picked
        ? picked.source === 'user'
          ? 'manual_create'
          : picked.source === 'built-in'
            ? 'official_preset'
            : picked.source === 'installed'
              ? 'template'
              : 'unknown'
        : undefined;
      const status: TrackingDesignSystemStatusValue | undefined = picked
        ? picked.status === 'draft' || picked.status === 'published'
          ? picked.status
          : 'unknown'
        : undefined;
      if (nextId === null) {
        trackDesignSystemApplyResult(analytics.track, {
          page_name: 'studio',
          area: 'design_system_picker',
          action: 'clear_selection',
          result: 'success',
          target_project_kind: target,
          design_system_applied: false,
          design_system_selection_mode: 'none',
          is_default: false,
          is_auto_selected: false,
          available_design_system_count: designSystems.length,
          duration_ms: 0,
        });
      } else {
        trackDesignSystemApplyResult(analytics.track, {
          page_name: 'studio',
          area: 'design_system_picker',
          action: 'select_design_system',
          result: 'success',
          target_project_kind: target,
          design_system_id: nextId,
          design_system_source: origin,
          design_system_status: status,
          design_system_applied: true,
          design_system_selection_mode: 'manual',
          is_default: false,
          is_auto_selected: false,
          available_design_system_count: designSystems.length,
          duration_ms: 0,
        });
      }
      const updated: Project = {
        ...project,
        designSystemId: nextId,
        updatedAt: Date.now(),
      };
      onProjectChange(updated);
      void patchProject(project.id, { designSystemId: nextId });
    },
    [project, onProjectChange, designSystems, analytics.track],
  );

  const projectMeta = useMemo(() => {
    // Design system is rendered by the adjacent picker chip — keep the
    // bare meta string focused on skill / mode so the two surfaces
    // don't show the same label twice.
    const summary =
      skills.find((s) => s.id === project.skillId) ??
      designTemplates.find((s) => s.id === project.skillId);
    const skill = summary?.name;
    return skill ?? t('project.metaFreeform');
  }, [skills, designTemplates, project.skillId, t]);

  const activeDesignSystemSummary = useMemo(() => {
    if (!project.designSystemId) return null;
    return designSystems.find((d) => d.id === project.designSystemId) ?? null;
  }, [designSystems, project.designSystemId]);

  const designSystemProject = useMemo(() => {
    if (project.metadata?.importedFrom !== 'design-system') return null;
    if (!project.designSystemId) return null;
    return designSystems.find((d) => d.id === project.designSystemId) ?? null;
  }, [designSystems, project.designSystemId, project.metadata?.importedFrom]);
  const designSystemActivityEvents = useMemo(
    () => designSystemProject ? latestDesignSystemActivityEvents(messages) : [],
    [designSystemProject, messages],
  );
  const connectRepoNeeded = useMemo(
    () => designSystemNeedsRepoConnect(designSystemProject, projectFiles.map((file) => file.name)),
    [designSystemProject, projectFiles],
  );
  // Only the connect-repo CTA copy depends on this (connect vs re-import), so
  // resolve it lazily and only while the CTA is actually showing. Tri-state:
  // `undefined` means the status fetch has not resolved yet, which keeps the
  // CTA neutral and disabled so a fast click can't fire the wrong action.
  const [githubConnected, setGithubConnected] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (!connectRepoNeeded) {
      setGithubConnected(undefined);
      return;
    }
    let aborted = false;
    const controller = new AbortController();
    const refresh = () => {
      void fetchConnectorStatuses({ signal: controller.signal }).then((statuses) => {
        if (!aborted) setGithubConnected(statuses.github?.status === 'connected');
      });
    };
    refresh();
    // Connecting GitHub happens in the Connectors dialog or an external OAuth
    // window, neither of which changes connectRepoNeeded. Re-check on focus so
    // the CTA flips from "Connect GitHub" to "Import repo" when the user returns.
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      aborted = true;
      controller.abort();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [connectRepoNeeded]);

  // Signal that pushes a draft into the chat composer (the "Import repo" CTA).
  const [composerDraftSignal, setComposerDraftSignal] = useState<{ text: string; nonce: number; attachments?: ChatAttachment[]; commentAttachments?: ChatCommentAttachment[]; meta?: ChatSendMeta }>();
  // One handler for both the review banner and the chat CTA. When GitHub is
  // not connected it opens Connectors; once connected it prefills the composer
  // with the import instruction so the user can review and send it.
  const handleConnectRepo = useCallback(() => {
    // Status not resolved yet; the CTA is disabled in this window, but guard
    // anyway so a stray call can't route a connected account to Connectors.
    if (githubConnected === undefined) return;
    if (githubConnected) {
      setComposerDraftSignal({
        text: buildRepoImportPrompt(designSystemProject, projectFiles.map((file) => file.name)),
        nonce: Date.now(),
      });
    } else {
      onOpenSettings('composio');
    }
  }, [githubConnected, onOpenSettings, designSystemProject, projectFiles]);

  // "Next step" affordance handlers (shown under the last assistant message
  // once it produced a previewable HTML artifact). Share reuses the preview
  // workspace's existing Share/Export menu. The featured design-toolbox rows are
  // driven by ChatPane's composer ref, so ProjectView no longer wires them here.
  const handleArtifactShare = useCallback((fileName: string) => {
    requestOpenFile(fileName);
  }, [requestOpenFile]);
  const handleArtifactDownload = useCallback((fileName: string) => {
    const link = document.createElement('a');
    link.href = projectFileUrl(project.id, fileName);
    link.download = fileName;
    link.click();
  }, [project.id]);

  const handleBrowserUsePrompt = useCallback((text: string) => {
    setComposerDraftSignal({
      text,
      nonce: Date.now(),
    });
  }, []);

  const isDeck = useMemo(
    () =>
      (skills.find((s) => s.id === project.skillId) ??
        designTemplates.find((s) => s.id === project.skillId))?.mode === 'deck',
    [skills, designTemplates, project.skillId],
  );
  // Hand the pending prompt to ChatPane exactly once per project. The local
  // project-scoped snapshot survives the conversation-id remount, while the
  // persisted pendingPrompt is cleared so refreshes and later entries do not
  // re-seed the composer.
  //
  // PluginLoopHome auto-send case: when the project was created with
  // `autoSendFirstMessage`, app.tsx left a sessionStorage flag telling us
  // to fire the prompt as a real user message immediately. We must NOT
  // seed initialDraft in that case — otherwise the textarea echoes the
  // prompt while it is also streaming as the first user message. The ref
  // captures the prompt independently so downstream effects can still
  // dispatch the auto-send without going through initialDraft.
  const workspaceFirstTurnRef = useRef(readWorkspaceFirstTurn(project.id));
  const [codexVoiceStartRequested, setCodexVoiceStartRequested] = useState(false);
  const autoSendSeedRef = useRef<string | null>(null);
  const autoSendAttachmentsRef = useRef<ChatAttachment[] | null>(null);
  const directSitemapPromptHandoffRef = useRef<DirectSitemapPromptHandoff | null | undefined>(undefined);
  if (directSitemapPromptHandoffRef.current === undefined) {
    directSitemapPromptHandoffRef.current = readDirectSitemapPromptHandoff((value) => Number(value || 0));
  }
  const sitemapBriefWorkspaceContext = useMemo(
    () => sitemapBriefWorkspaceContextFromHandoff(directSitemapPromptHandoffRef.current),
    [],
  );
  const autoSendFirstMessageRef = useRef(false);
  if (autoSendSeedRef.current === null) {
    let isAutoSend = false;
    try {
      isAutoSend = Boolean(
        window.sessionStorage.getItem(autoSendFirstMessageKey(project.id)),
      );
    } catch {
      /* sessionStorage may be unavailable; treat as manual flow. */
    }
    isAutoSend = isAutoSend || (!!workspaceFirstTurnRef.current && workspaceFirstTurnRef.current.autoSend !== false);
    autoSendFirstMessageRef.current = isAutoSend;
    autoSendSeedRef.current = isAutoSend ? (workspaceFirstTurnRef.current?.prompt ?? project.pendingPrompt ?? '') : '';
    autoSendAttachmentsRef.current = isAutoSend ? (workspaceFirstTurnRef.current?.attachments ?? readAutoSendAttachments(project.id)) : [];
  }
  const [initialDraft, setInitialDraft] = useState<
    { projectId: string; value: string } | undefined
  >(
    autoSendSeedRef.current || !project.pendingPrompt
      ? undefined
      : { projectId: project.id, value: project.pendingPrompt },
  );
  useEffect(() => {
    const pendingPrompt = project.pendingPrompt;
    if (!pendingPrompt) return;
    if (autoSendFirstMessageRef.current) {
      onClearPendingPrompt();
      return;
    }
    setInitialDraft((current) =>
      current?.projectId === project.id
        ? current
        : { projectId: project.id, value: pendingPrompt },
    );
    onClearPendingPrompt();
  }, [project.id, project.pendingPrompt, onClearPendingPrompt]);
  const chatInitialDraft =
    chatSeed?.value ?? (initialDraft?.projectId === project.id ? initialDraft.value : undefined);

  // Defensive: if the conversation already has messages once they
  // hydrate, the pendingPrompt that seeded the composer is stale (the
  // user sent it earlier but onClearPendingPrompt did not get a chance
  // to patch the server before the page reloaded). Drop the seed so the
  // textarea does not echo a prompt the user already submitted.
  useEffect(() => {
    if (initialDraft && messages.length > 0) {
      setInitialDraft(undefined);
    }
  }, [initialDraft, messages.length]);

  // §8.4 — when the project was created with a plugin pinned (the
  // PluginLoopHome → POST /api/projects path), fetch the immutable
  // snapshot once so ChatPane can render the active plugin as a
  // context chip on user messages instead of re-rendering the inline
  // plugin rail. Re-fetches when the pinned id changes; cancelled if
  // the project switches away mid-flight to avoid setState-on-unmount.
  const [activePluginSnapshot, setActivePluginSnapshot] =
    useState<AppliedPluginSnapshot | null>(null);
  const [contextPluginDetails, setContextPluginDetails] =
    useState<InstalledPluginRecord | null>(null);
  const [contextDesignSystemDetails, setContextDesignSystemDetails] =
    useState<DesignSystemSummary | null>(null);
  useEffect(() => {
    const snapshotId = project.appliedPluginSnapshotId;
    if (!snapshotId) {
      setActivePluginSnapshot(null);
      return;
    }
    let cancelled = false;
    void fetchAppliedPluginSnapshot(snapshotId).then((snap) => {
      if (cancelled) return;
      setActivePluginSnapshot(snap);
    });
    return () => {
      cancelled = true;
    };
  }, [project.appliedPluginSnapshotId]);
  const handleOpenContextPluginDetails = useCallback(async (pluginId: string) => {
    const normalizedId = pluginId.trim();
    if (!normalizedId) return;
    const plugins = await listPlugins({ includeHidden: true });
    const record = plugins.find((plugin) => plugin.id === normalizedId);
    if (record) setContextPluginDetails(record);
  }, []);
  const chatDesignSystemSummary = useMemo(() => {
    if (activeDesignSystemSummary) return activeDesignSystemSummary;
    const designSystemName = activePluginSnapshot?.inputs?.designSystem;
    if (typeof designSystemName !== 'string') return null;
    const normalized = designSystemName.trim();
    if (!normalized || normalized === 'the active project design system') return null;
    return designSystems.find((d) => d.title === normalized) ?? null;
  }, [activeDesignSystemSummary, activePluginSnapshot?.inputs, designSystems]);

  // PluginLoopHome auto-send: when the user submits on Home, app.tsx
  // sets `sessionStorage['od:auto-send-first:<projectId>']` and routes
  // through createProject. Once the conversation id resolves and the
  // composer is mounted, fire handleSend(pendingPrompt) exactly once so
  // the user lands inside a running pipeline without an extra click.
  // We gate on `messages.length === 0` so a refresh after the run is
  // mid-flight never double-fires; the sessionStorage flag is cleared
  // immediately after the first dispatch.
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (autoSentRef.current) return;
    if (!activeConversationId) return;
    // Wait for the initial listMessages DB read to land. Without this gate
    // the auto-send fires before the in-flight DB response, which then
    // arrives with `setMessages([])` and wipes the freshly-pushed user +
    // assistant placeholder out of React state — leaving the daemon's run
    // with no in-memory message to attach the runId to.
    if (!messagesInitialized) return;
    // Home-created Prototype projects auto-send immediately after ProjectView
    // mounts. In the WordPress runtime, persisted app-config arrives
    // asynchronously from WP/bridge and must win over old browser localStorage
    // before the first Local CLI run starts, otherwise a stale agent choice can
    // route the run to the wrong CLI.
    if (!daemonConfigLoaded) return;
    if (streaming) return;
    if (messages.length > 0) return;
    let flag: string | null = null;
    try {
      flag = window.sessionStorage.getItem(autoSendFirstMessageKey(project.id));
    } catch {
      flag = null;
    }
    if (!flag && !workspaceFirstTurnRef.current) return;
    if (workspaceFirstTurnRef.current?.startVoice) {
      // Start in the destination composer so hiding Home cannot tear down audio.
      workspaceFirstTurnRef.current = null;
      clearWorkspaceFirstTurn(project.id);
      clearAutoSendSession(project.id);
      autoSentRef.current = true;
      setCodexVoiceStartRequested(true);
      return;
    }
    if (workspaceFirstTurnRef.current?.autoSend === false) {
      const turn = workspaceFirstTurnRef.current;
      setComposerDraftSignal({ text: turn.prompt, nonce: Date.now(), attachments: turn.attachments, commentAttachments: turn.comments, meta: turn.meta });
      workspaceFirstTurnRef.current = null;
      clearWorkspaceFirstTurn(project.id);
      autoSentRef.current = true;
      return;
    }
    // Prefer the seed captured at mount (autoSendSeedRef) — it survives
    // even after onClearPendingPrompt wipes project.pendingPrompt on the
    // server. Fall back to the live values for any edge case where the
    // ref was not populated (e.g. sessionStorage error path).
    const seed = (
      autoSendSeedRef.current ||
      (initialDraft?.projectId === project.id ? initialDraft.value : '') ||
      project.pendingPrompt ||
      ''
    ).trim();
    const attachments = autoSendAttachmentsRef.current ?? [];
    const homeTurn = workspaceFirstTurnRef.current;
    if (!seed && attachments.length === 0 && !homeTurn?.comments.length) {
      autoSentRef.current = true;
      clearAutoSendSession(project.id);
      return;
    }
    autoSentRef.current = true;
    if (isDesignSystemWorkspaceMetadata(project.metadata)) {
      markDesignSystemAuditAutoRepairEligible(project.id);
    }
    clearAutoSendSession(project.id);
    autoSendAttachmentsRef.current = [];
    const sitemapBriefContext = sitemapBriefWorkspaceContext;
    if (sitemapBriefContext) {
      clearDirectSitemapPromptHandoff();
      directSitemapPromptHandoffRef.current = null;
    }
    clearWorkspaceFirstTurn(project.id);
    workspaceFirstTurnRef.current = null;
    if (homeTurn && activeSessionMode !== homeTurn.sessionMode) {
      void handleConversationSessionModeChange(activeConversationId, homeTurn.sessionMode);
    }
    void handleSend(seed, attachments, homeTurn?.comments ?? [], {
      ...homeTurn?.meta,
      ...(homeTurn ? { sessionMode: homeTurn.sessionMode } : {}),
      ...(project.appliedPluginSnapshotId
        ? { appliedPluginSnapshotId: project.appliedPluginSnapshotId }
        : {}),
      ...(sitemapBriefContext
        ? { context: { ...homeTurn?.meta?.context, workspaceItems: [...(homeTurn?.meta?.context?.workspaceItems ?? []), sitemapBriefContext] } }
        : {}),
    }).then(accepted => {
      if (accepted !== false || !homeTurn) return;
      setComposerDraftSignal({ text: seed, nonce: Date.now(), attachments, commentAttachments: homeTurn.comments, meta: homeTurn.meta });
    }).catch(() => {
      if (!homeTurn) return;
      setComposerDraftSignal({ text: seed, nonce: Date.now(), attachments, commentAttachments: homeTurn.comments, meta: homeTurn.meta });
    });
  }, [
    activeConversationId,
    messagesInitialized,
    activeSessionMode,
    handleConversationSessionModeChange,
    streaming,
    messages.length,
    project.id,
    project.metadata,
    project.appliedPluginSnapshotId,
    initialDraft,
    project.pendingPrompt,
    daemonConfigLoaded,
    handleSend,
    sitemapBriefWorkspaceContext,
  ]);

  // Wire the Critique Theater drop-in mount into the project workspace.
  // The hook reads the M1 Settings toggle out of the existing
  // `open-design:config` localStorage blob and stays in sync with the
  // platform `storage` event (cross-tab) plus the same-tab
  // `open-design:critique-theater-toggle` CustomEvent. The mount itself
  // returns `null` until the daemon emits a `critique.run_started` for
  // the active project, so the visual surface is unchanged for users
  // who have not opted in. The daemon-side gate
  // (`isCritiqueEnabled(...)` in `apps/daemon/src/server.ts`) is the
  // authority for whether a run is actually wired through the critique
  // pipeline; this hook only governs whether the web layer renders the
  // resulting SSE stream.

  // CLI / agent selector lives below the chat conversation (composer footer),
  // not in the top-right header.
  const executionControls = (
    <AvatarMenu
      composerLabel
      config={config}
      agents={agents}
      daemonLive={daemonLive}
      onModeChange={onModeChange}
      onExecutionChange={onExecutionChange}
      onOpen={() => {
        trackComposerBarClick(analytics.track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          element: 'agent_selector_open',
          ...(project?.id ? { project_id: project.id } : {}),
        });
      }}
      onAgentChange={(id) => {
        trackComposerBarClick(analytics.track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          element: 'agent_select',
          agent_id: id,
          ...(project?.id ? { project_id: project.id } : {}),
        });
        onAgentChange(id);
      }}
      onAgentModelChange={(agentId, choice) => {
        trackComposerBarClick(analytics.track, {
          page_name: 'chat_panel',
          area: 'chat_composer',
          element: 'agent_model_select',
          agent_id: agentId,
          ...(choice?.model ? { model_id: choice.model } : {}),
          ...(project?.id ? { project_id: project.id } : {}),
        });
        onAgentModelChange(agentId, choice);
      }}
      onOpenSettings={onOpenSettings}
      onRefreshAgents={onRefreshAgents}
      onBack={onBack}
      placement="up"
    />
  );

  return (
    <div className={`app ${chatLayout.root}`} data-chat-first>
      <div
        className={chatLayout.layout}
        data-summary-open={summaryOpen}
      >
        <div className="split-chat-slot">
          {!currentConversationLoading && (activeConversationId || conversationLoadError) ? (
            <ChatPane
              compactComposer
              // The conversation id is part of the key so switching conversations
              // resets internal scroll/draft state inside ChatPane and ChatComposer.
              key={`${project.id}:${activeConversationId ?? 'conversation-unavailable'}:${chatSeed?.id ?? 'ready'}`}
              messages={messages}
              olderHistory={olderMessagesCursor ? { loading: loadingOlderMessages, error: olderMessagesError, load: loadOlderMessages } : undefined}
              historyPersistence={historyWriteError ? { retry: retryHistoryWrites } : undefined}
              streaming={currentConversationStreaming}
              liveToolInput={liveToolInput}
              loading={currentConversationLoading}
              sendDisabled={currentConversationSendDisabled}
              queuedItems={currentConversationQueuedItems}
              error={conversationLoadError ?? error ?? audioVoiceOptionsError}
              projectId={project.id}
              sessionMode={activeSessionMode}
              onSessionModeChange={handleActiveConversationSessionModeChange}
              projectKindForTracking={projectKindToTracking(project.metadata?.kind, project.metadata?.videoModel)}
              projectFiles={projectFiles}
              activeProjectFileName={activeProjectFileName}
              hasActiveDesignSystem={!!project.designSystemId}
              activeDesignSystem={chatDesignSystemSummary}
              projectFileNames={projectFileNames}
              projectResolvedDir={projectDetail.resolvedDir}
              skills={skills}
              onEnsureProject={handleEnsureProject}
              previewComments={previewComments}
              attachedComments={attachedComments}
              onAttachComment={attachPreviewComment}
              onDetachComment={detachPreviewComment}
              onDeleteComment={(commentId) => void removePreviewComment(commentId)}
              bottomAligned
              codexVoiceEnabled={hasPixflowWordPressContext() && daemonLive && config.mode === 'daemon' && config.agentId === 'codex'}
              codexVoiceStartRequested={codexVoiceStartRequested}
              onSend={handleSend}
              onRetry={handleRetry}
              onResumeRun={handleResumeRun}
              onStop={handleStop}
              onRemoveQueuedSend={removeQueuedChatSend}
              onUpdateQueuedSend={updateQueuedChatSend}
              onReorderQueuedSends={reorderCurrentConversationQueuedChatSends}
              onSendQueuedNow={sendQueuedChatSendNow}
              onSteerQueuedSend={workspaceSteer}
              onRequestOpenFile={(fileName) => { setSummaryOpen(true); requestOpenFile(fileName); }}
              onRequestPluginDetails={handleOpenContextPluginDetails}
              onRequestDesignSystemDetails={setContextDesignSystemDetails}
              onRequestPluginFolderAgentAction={handlePluginFolderAgentAction}
              activePluginActionPaths={activePluginActionPaths}
              hiddenPluginActionPaths={hiddenAssistantPluginActionPaths}
              forceStreamingMessageIds={forceStreamingPluginMessageIds}
              initialDraft={chatInitialDraft}
              onOpenQuestions={openQuestionsTab}
              onContinueRemainingTasks={handleContinueRemainingTasks}
              onAssistantFeedback={handleAssistantFeedback}
              onArtifactDownload={handleArtifactDownload}
              onForkFromMessage={handleForkFromMessage}
              forkingMessageId={forkingMessageId}
              onNewConversation={handleNewConversation}
              newConversationDisabled={newConversationDisabled}
              conversations={conversations}
              activeConversationId={activeConversationId}
              messagesConversationId={messagesConversationId}
              onSelectConversation={handleSelectConversation}
              onDeleteConversation={handleDeleteConversation}
              config={config}
              onOpenSettings={onOpenSettings}
              showByokRecoveryAction={
                config.mode === 'api' &&
                config.apiTransport !== 'composio' &&
                daemonLive &&
                (
                  !config.apiKey.trim() ||
                  !config.baseUrl.trim() ||
                  !config.model.trim()
                )
              }
              onSwitchToLocalCli={() => {
                setError(null);
                onModeChange('daemon');
              }}
              onOpenAmrSettings={onOpenAmrSettings}
              onSwitchToAmrAndRetry={handleSwitchToAmrAndRetry}
              onLaunchAntigravityOauth={handleLaunchAntigravityOauth}
              onOpenMcpSettings={onOpenMcpSettings}
              onOpenBuilderHandoff={hasPixflowWordPressContext() ? () => setDestinationDialogOpen(true) : undefined}
              onBrowsePlugins={onBrowsePlugins}
              onOpenConnectors={onOpenConnectors}
              connectRepoNeeded={connectRepoNeeded}
              githubConnected={githubConnected}
              onConnectRepo={handleConnectRepo}
              composerDraftSignal={composerDraftSignal}
              petConfig={config.pet}
              onAdoptPet={onAdoptPetInline}
              onTogglePet={onTogglePet}
              onOpenPetSettings={onOpenPetSettings}
              researchAvailable={config.mode === 'daemon'}
              byokApiProtocol={config.apiProtocol}
              byokImageModel={byokImageModelOverride}
              onChangeByokImageModel={handleByokImageModelChange}
              byokVideoModel={byokVideoModelOverride}
              onChangeByokVideoModel={handleByokVideoModelChange}
              byokSpeechModel={byokSpeechModelOverride}
              onChangeByokSpeechModel={handleByokSpeechModelChange}
              byokSpeechVoice={byokSpeechVoiceOverride}
              onChangeByokSpeechVoice={handleByokSpeechVoiceChange}
              projectMetadata={project.metadata}
              onProjectMetadataChange={(metadata) => {
                onProjectChange({ ...project, metadata });
              }}
              activeWorkspaceContext={sitemapBriefWorkspaceContext ?? activeWorkspaceContext}
              workspaceContexts={sitemapBriefWorkspaceContext
                ? [
                    sitemapBriefWorkspaceContext,
                    ...workspaceContexts.filter((item) => item.id !== sitemapBriefWorkspaceContext.id),
                  ]
                : workspaceContexts}
              currentSkillId={project.skillId}
              onProjectSkillChange={(skillId) => {
                onProjectChange({ ...project, skillId });
              }}
              activePluginSnapshot={activePluginSnapshot}
              currentDesignSystemId={project.designSystemId}
              onActiveDesignSystemChange={(updatedProject) => {
                onProjectChange(updatedProject);
              }}
              onShowToast={(message) => {
                setProjectActionsToast({ message, details: null });
              }}
              headerActions={<>
                {hasPixflowWordPressContext() && activeConversationId && <ChatExportButton key={activeConversationId} binding={{ projectId: project.id, conversationId: activeConversationId }} />}
                {hasPixflowWordPressContext() && <BuilderDestinationControl key={builderChatId} chatId={builderChatId}
                  disabled={currentConversationBusy} open={destinationDialogOpen} onOpenChange={setDestinationDialogOpen}
                  destination={builderHandoff.receipt?.destination || (builderDestination?.chatId === builderChatId ? builderDestination.value : undefined)}
                  buildBrief={builderBrief.brief} defaultPageTitle={project.name} onBuild={builderHandoff.build} onRetryBuild={builderHandoff.retry}
                  onNewBuild={builderHandoff.newBuild}
                  buildStatus={builderHandoff.status} buildError={builderHandoff.error}
                  buildEditorUrl={builderHandoff.receipt?.editorUrl} buildReceiptBrief={builderHandoff.brief}
                  autoOpenReceiptId={builderHandoff.agentReceiptToOpen}
                  onDestination={value => setBuilderDestination({ chatId: builderChatId, value })} />}
                <WorkspaceSummaryToggle open={summaryOpen} onToggle={() => summaryOpen ? closeSummary() : setSummaryOpen(true)} />
              </>}
              backLabel={t('project.backToProjects')}
              composerFooterAccessory={executionControls}
              projectHeader={(
                <span className={chatLayout.headerIdentity}><span className="chat-project-title-line">
                  <span
                    className="title editable"
                    data-testid="project-title"
                    title={project.name}
                    tabIndex={0}
                    role="textbox"
                    suppressContentEditableWarning
                    contentEditable
                    onBlur={(e) => handleProjectRename(e.currentTarget.textContent ?? '')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).blur();
                      }
                    }}
                  >
                    {project.name}
                  </span>
                  {projectMeta !== t('project.metaFreeform') ? (
                    <span className="meta" data-testid="project-meta">{projectMeta}</span>
                  ) : null}
                  <PixflowProjectSyncControl
                    projectId={project.id}
                    projectName={project.name}
                    onToast={(message) => setProjectActionsToast({ message, details: null })}
                  />
                </span>{project.metadata?.forkedFrom && <ChatForkOrigin origin={project.metadata.forkedFrom} />}</span>
              )}
            />
          ) : (
            <div className="pane" data-testid="chat-pane-loading">
              <WorkspaceLoading />
            </div>
          )}
        </div>
        <WorkspaceSummary
          open={summaryOpen}
          projectId={project.id}
          files={projectFiles}
          selectedName={activeProjectFileName}
          onSelect={requestOpenFile}
          onClose={closeSummary}
          destinationAction={hasPixflowWordPressContext() ? <Button variant="subtle" disabled={currentConversationBusy} onClick={() => setDestinationDialogOpen(true)}>{t('builderDestination.choose')}</Button> : undefined}
        />
      </div>
      {contextPluginDetails ? (
        <PluginDetailsModal
          record={contextPluginDetails}
          onClose={() => setContextPluginDetails(null)}
          onUse={() => setContextPluginDetails(null)}
          isApplying={false}
          hideUseAction
        />
      ) : null}
      {contextDesignSystemDetails ? (
        <DesignSystemPreviewModal
          system={contextDesignSystemDetails}
          onClose={() => setContextDesignSystemDetails(null)}
        />
      ) : null}
      {amrRunGate ? (
        <AmrRunGateDialog
          kind={amrRunGate.kind}
          reason={amrRunGate.reason}
          snapshot={amrRunGate.snapshot}
          onDecision={amrRunGate.resolve}
        />
      ) : null}
      <AnimatePresence>
        {projectActionsToast ? (
          <Toast
            message={projectActionsToast.message}
            details={projectActionsToast.details}
            code={projectActionsToast.code}
            onDismiss={() => setProjectActionsToast(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function artifactExtensionFor(art: Artifact): '.html' | '.jsx' | '.tsx' {
  const type = (art.artifactType || '').toLowerCase();
  const identifier = (art.identifier || '').toLowerCase();
  if (type.includes('tsx') || identifier.endsWith('.tsx')) return '.tsx';
  if (type.includes('jsx') || type.includes('react') || identifier.endsWith('.jsx')) {
    return '.jsx';
  }
  return '.html';
}

function artifactBaseNameFor(art: Artifact): string {
  return (
    (art.identifier || art.title || 'artifact')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'artifact'
  );
}

export function findExistingArtifactProjectFile(
  art: Artifact,
  projectFiles: ProjectFile[],
  options: { minMtime?: number } = {},
): ProjectFile | null {
  const ext = artifactExtensionFor(art);
  const baseName = artifactBaseNameFor(art);
  const candidateFileName = `${baseName}${ext}`;
  const minMtime = options.minMtime;
  const currentRunFiles = typeof minMtime === 'number' && Number.isFinite(minMtime)
    ? projectFiles.filter((file) => file.mtime >= minMtime)
    : projectFiles;

  if (ext === '.html') {
    const pointerTarget = resolveHtmlPointerArtifactTarget({
      content: art.html,
      candidateFileName,
      projectFiles: currentRunFiles,
    });
    const pointerFile = pointerTarget
      ? currentRunFiles.find((file) => file.name === pointerTarget || file.path === pointerTarget)
      : null;
    if (pointerFile) return pointerFile;
  }

  const identifier = art.identifier || '';
  if (identifier) {
    const manifestMatches = currentRunFiles
      .filter((file) => file.artifactManifest?.metadata?.identifier === identifier)
      .sort((a, b) => b.mtime - a.mtime);
    if (manifestMatches[0]) return manifestMatches[0];
  }

  return currentRunFiles.find((file) => file.name === candidateFileName) ?? null;
}

export function selectPrimaryProjectFile(files: ProjectFile[]): ProjectFile | null {
  const candidates = files
    .filter((file) => !isProcessArtifactFile(file.name))
    .map((file) => ({ file, rank: primaryProjectFileRank(file) }))
    .filter((candidate) => Number.isFinite(candidate.rank));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.rank - b.rank || b.file.mtime - a.file.mtime);
  return candidates[0]?.file ?? null;
}

function isProcessArtifactFile(name: string): boolean {
  const base = name.split('/').pop()?.toLowerCase() ?? name.toLowerCase();
  return (
    base === 'critique.json'
    || base.endsWith('.log')
    || base.endsWith('.meta.json')
    || base.endsWith('.artifact.json')
    || base.endsWith('.map')
  );
}

function primaryProjectFileRank(file: ProjectFile): number {
  if (manifestDeclaresPrimary(file)) return 0;
  if (file.artifactManifest && file.artifactManifest.metadata?.inferred !== true) return 1;
  if (file.kind === 'html') return 2;
  if (file.kind === 'image') return 3;
  if (file.kind === 'video') return 4;
  if (file.kind === 'sketch') return 5;
  if (file.kind === 'pdf') return 6;
  if (file.kind === 'presentation') return 7;
  if (file.kind === 'document') return 8;
  if (file.kind === 'spreadsheet') return 9;
  // Audio projects do not have an HTML artifact, but the generated audio
  // file is still the primary deliverable and must be restored into the
  // viewer when the project is reopened.
  if (file.kind === 'audio') return 10;
  return Number.POSITIVE_INFINITY;
}

function manifestDeclaresPrimary(file: ProjectFile): boolean {
  const manifest = file.artifactManifest;
  if (!manifest) return false;
  if (primaryValueTargetsFile(manifest.primary, file.name)) return true;
  const metadata = manifest.metadata;
  if (!metadata || typeof metadata !== 'object') return false;
  if (primaryValueTargetsFile(metadata.primary, file.name)) return true;
  const outputs = metadata.outputs;
  if (outputs && typeof outputs === 'object' && !Array.isArray(outputs)) {
    return primaryValueTargetsFile(
      (outputs as { primary?: unknown }).primary,
      file.name,
    );
  }
  return false;
}

function primaryValueTargetsFile(value: unknown, fileName: string): boolean {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  return normalizeProjectFileName(value) === normalizeProjectFileName(fileName);
}

function normalizeProjectFileName(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
}

function assistantAgentDisplayName(
  agentId: string | null,
  fallbackName?: string,
): string | undefined {
  return agentDisplayName(agentId, fallbackName) ?? undefined;
}

function isTerminalRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

function isActiveRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'queued' || status === 'running';
}

const QUEUED_CHAT_SENDS_STORAGE_VERSION = 1;

function queuedChatSendsStorageKey(projectId: string): string {
  return `od:chat-queued-sends:${projectId}:v${QUEUED_CHAT_SENDS_STORAGE_VERSION}`;
}

function loadQueuedChatSends(projectId: string): QueuedChatSend[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(queuedChatSendsStorageKey(projectId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedChatSend).slice(0, 100).map(item => item.dispatchState === 'sending'
      ? { ...item, dispatchState: 'unconfirmed' } : item);
  } catch {
    return [];
  }
}

function saveQueuedChatSends(projectId: string, items: QueuedChatSend[]): void {
  if (typeof window === 'undefined') return;
  try {
    const key = queuedChatSendsStorageKey(projectId);
    if (items.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(items.slice(0, 100)));
  } catch {
    // Ignore private-mode/quota failures. The in-memory queue still works.
  }
}

function isQueuedChatSend(value: unknown): value is QueuedChatSend {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) return false;
  const record = value as Partial<QueuedChatSend>;
  return (
    typeof record.id === 'string' &&
    typeof record.conversationId === 'string' &&
    typeof record.prompt === 'string' &&
    Array.isArray(record.attachments) &&
    Array.isArray(record.commentAttachments) &&
    typeof record.createdAt === 'number'
  );
}

function stripQueueOnlyFromMeta(meta: ChatSendMeta | undefined): ProjectChatSendMeta | undefined {
  if (!meta) return undefined;
  const { queueOnly: _queueOnly, ...rest } = meta;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

export interface RetryTarget {
  failedAssistant: ChatMessage;
  userMsg: ChatMessage;
  priorMessages: ChatMessage[];
  preservedAttempts: ChatMessage[];
}

export function resolveRetryTarget(
  messages: ChatMessage[],
  failedAssistantId: string,
): RetryTarget | null {
  const failedIndex = messages.findIndex(
    (message) =>
      message.id === failedAssistantId &&
      message.role === 'assistant' &&
      message.runStatus === 'failed',
  );
  if (failedIndex <= 0 || failedIndex !== messages.length - 1) return null;

  let userIndex = failedIndex - 1;
  while (
    userIndex >= 0 &&
    messages[userIndex]?.role === 'assistant' &&
    messages[userIndex]?.runStatus === 'failed'
  ) {
    userIndex -= 1;
  }

  const userMsg = messages[userIndex];
  const failedAssistant = messages[failedIndex];
  if (!userMsg || userMsg.role !== 'user' || !failedAssistant) return null;
  if (hasUncertainSiteDelivery(failedAssistant)) return null;

  return {
    failedAssistant,
    userMsg,
    priorMessages: messages.slice(0, userIndex),
    preservedAttempts: messages.slice(userIndex + 1, failedIndex + 1),
  };
}

function latestDesignSystemActivityEvents(messages: ChatMessage[]): AgentEvent[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== 'assistant') continue;
    if ((message.events?.length ?? 0) > 0) return message.events ?? [];
    if (isActiveRunStatus(message.runStatus)) return [];
  }
  return [];
}

function pluginWorkflowTitle(_action: PluginFolderAgentAction): string {
  return 'Publish repo';
}

function pluginWorkflowCliCommand(_action: PluginFolderAgentAction, relativePath: string): string {
  return `od plugin publish-repo ${relativePath}`;
}

function pluginWorkflowPlannedSteps(_action: PluginFolderAgentAction): string[] {
  return [
    'Resolve GitHub owner and validate plugin metadata',
    'Create or update the GitHub repository',
    'Push plugin files and tags',
    'Return the repository URL',
  ];
}

function pluginWorkflowPlannedEvents(action: PluginFolderAgentAction, relativePath: string): AgentEvent[] {
  return [
    { kind: 'text', text: `${pluginWorkflowStartContent(action, relativePath)}\n\n` },
    { kind: 'status', label: 'working', detail: pluginWorkflowTitle(action) },
  ];
}

function pluginWorkflowResultEvents(
  action: PluginFolderAgentAction,
  relativePath: string,
  message: string,
  url: string | undefined,
  log: string[] | undefined,
  ok: boolean,
  existingEvents?: AgentEvent[],
): AgentEvent[] {
  const summary = ok
    ? pluginWorkflowSuccessContent(action, relativePath, message, url, log)
    : pluginWorkflowFailureContent(action, relativePath, message, log);
  const baseEvents = (existingEvents ?? []).filter(
    (event) => !(event.kind === 'status' && event.label === 'working'),
  );
  return [
    ...baseEvents,
    { kind: 'text', text: `${summary}\n\n` },
    {
      kind: 'status',
      label: ok ? 'done' : 'failed',
      detail: ok ? 'CLI command finished' : 'CLI command failed',
    },
  ];
}

function pluginWorkflowStartContent(action: PluginFolderAgentAction, relativePath: string): string {
  const title = pluginWorkflowTitle(action);
  const command = pluginWorkflowCliCommand(action, relativePath);
  const steps = pluginWorkflowPlannedSteps(action).map((step) => `- ${step}`).join('\n');
  return `${title} started.\n\n\`\`\`bash\n${command}\n\`\`\`\n\nPlanned steps:\n${steps}`;
}

function pluginWorkflowSuccessContent(
  action: PluginFolderAgentAction,
  relativePath: string,
  message: string,
  url?: string,
  log?: string[],
): string {
  const summary = stripTrailingUrl(message, url) || `${pluginWorkflowTitle(action)} completed for \`${relativePath}\`.`;
  const lines = (log ?? []).map((line) => line.trim()).filter(Boolean).slice(0, 5);
  const command = pluginWorkflowCliCommand(action, relativePath);
  const details = lines.length > 0
    ? `\n\nCLI output:\n${lines.map((line) => `- \`${truncatePluginWorkflowLine(line)}\``).join('\n')}`
    : '';
  const link = url ? `\n\nLink: [${url}](${url})` : '';
  return `${summary}\n\n\`\`\`bash\n${command}\n\`\`\`${link}${details}`;
}

function pluginWorkflowFailureContent(
  action: PluginFolderAgentAction,
  relativePath: string,
  message: string,
  log?: string[],
): string {
  const lines = (log ?? []).map((line) => line.trim()).filter(Boolean).slice(0, 5);
  const command = pluginWorkflowCliCommand(action, relativePath);
  const details = lines.length > 0
    ? `\n\nCLI output:\n${lines.map((line) => `- \`${truncatePluginWorkflowLine(line)}\``).join('\n')}`
    : '';
  return `${pluginWorkflowTitle(action)} failed.\n\n\`\`\`bash\n${command}\n\`\`\`\n\n${message}${details}`;
}

function truncatePluginWorkflowLine(line: string): string {
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

function stripTrailingUrl(message: string, url?: string): string {
  const text = message.trim();
  const link = url?.trim();
  if (!link) return text;
  return text.replace(new RegExp(`\\s*${escapeRegExp(link)}\\s*$`), '').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A daemon assistant message that is "queued/running" but has no runId yet
// is in-flight on the client: POST /api/runs has not returned. Persisting it
// in this state creates a phantom DB row that the reattach loop can never
// recover (the daemon either never saw the request or the response was lost),
// which is what produced the "Working 24m+" stuck UI. Treat the in-flight
// window as ephemeral and only write to DB once a runId pins the row to a
// real daemon run — or once the run reaches a terminal state.
function isPhantomDaemonRunMessage(m: ChatMessage): boolean {
  return (
    m.role === 'assistant' &&
    isActiveRunStatus(m.runStatus) &&
    !m.runId
  );
}

function isStoppableAssistantMessage(message: ChatMessage): boolean {
  if (message.role !== 'assistant') return false;
  if (isActiveRunStatus(message.runStatus)) return true;
  return message.runStatus === undefined && message.endedAt === undefined && message.startedAt !== undefined;
}

export function resolveSucceededRunStatus(status: ChatMessage['runStatus']): ChatMessage['runStatus'] {
  return status === 'failed' || status === 'canceled' ? status : 'succeeded';
}

export function computeProducedFiles(
  beforeNames: ReadonlySet<string> | readonly string[] | undefined,
  next: readonly ProjectFile[],
): ProjectFile[] | undefined {
  if (!beforeNames) return undefined;
  const set = beforeNames instanceof Set ? beforeNames : new Set(beforeNames);
  return filterImplicitProducedFiles(next.filter((f) => !set.has(f.name)));
}

// Reattach with a recovered (on-disk) artifact must still include any
// other files the turn produced before the artifact write — replacing
// the diff with a single file was the regression noted on PR #2383.
export function mergeRecoveredArtifact(
  diff: readonly ProjectFile[],
  recovered: ProjectFile | null,
): ProjectFile[] {
  if (!recovered) return [...diff];
  if (diff.some((f) => f.name === recovered.name)) return [...diff];
  return [...diff, recovered];
}

export function clearStreamingConversationMarker(
  currentConversationId: string | null,
  completedConversationId?: string | null,
): string | null {
  if (
    completedConversationId !== undefined
    && completedConversationId !== null
    && currentConversationId !== completedConversationId
  ) {
    return currentConversationId;
  }
  return null;
}

export function shouldClearActiveRunRefs(
  currentConversationId: string | null,
  completedConversationId: string,
): boolean {
  return currentConversationId === completedConversationId;
}

export function finalizeActiveAssistantMessagesOnStop(
  messages: ChatMessage[],
  stoppedAt: number,
  inspectPendingSiteOperations = false,
): { messages: ChatMessage[]; finalized: ChatMessage[] } {
  const finalized: ChatMessage[] = [];
  const next = messages.map((message) => {
    if (!isStoppableAssistantMessage(message)) {
      return message;
    }
    let updated: ChatMessage = {
      ...message,
      runStatus: 'canceled' as const,
      endedAt: message.endedAt ?? stoppedAt,
    };
    if (inspectPendingSiteOperations && hasUnresolvedToolCall(message.events) && !hasUncertainSiteDelivery(message)) {
      updated = appendErrorStatusEvent({ ...updated,
        content: [updated.content, SITE_DELIVERY_INSPECT_FIRST].filter(Boolean).join('\n\n'),
        resumable: false,
      }, SITE_DELIVERY_INSPECT_FIRST, SITE_DELIVERY_UNCERTAIN);
    }
    finalized.push(updated);
    return updated;
  });
  return { messages: next, finalized };
}

/**
 * A daemon run may reach terminal success before the browser's final
 * keepalive message write or artifact refresh lands. Replaying that run from
 * event zero restores the complete assistant turn and lets the normal
 * artifact finalizer persist/open the generated result after a reload.
 */
export function shouldReplayTerminalRunMessage(message: ChatMessage): boolean {
  if (message.role !== 'assistant') return false;
  if (!message.runId || message.runStatus !== 'succeeded') return false;
  if (designDeliveryVerificationPending(message)) return true;
  if (message.content.trim().length > 0) return false;
  if (
    message.startedAt == null &&
    !message.preTurnFileNames?.length &&
    textContentFromAgentEvents(message.events).trim().length === 0
  ) {
    return false;
  }
  return !(message.producedFiles?.length);
}

function textContentFromAgentEvents(events?: AgentEvent[]): string {
  return (events ?? [])
    .filter((event): event is Extract<AgentEvent, { kind: 'text' }> => event.kind === 'text')
    .map((event) => event.text)
    .join('');
}

type BufferedTextUpdates = ReturnType<typeof createBufferedTextUpdates>;

export function createBufferedTextUpdates({
  updateMessage,
  persistSoon,
  flushAndPersistNow,
  onContentDelta,
}: {
  updateMessage: (updater: (prev: ChatMessage) => ChatMessage) => void;
  persistSoon: () => void;
  // Synchronous flush + persist with a transport that survives page
  // unload (PUT with keepalive). Invoked by the pagehide handler so the
  // last buffered chunk isn't lost when the user reloads mid-stream.
  flushAndPersistNow?: () => void;
  onContentDelta?: (delta: string) => void;
}) {
  let pendingContentDelta = '';
  let pendingTextEventDelta = '';
  let disposed = false;
  let flushing = false;
  let needsFlush = false;
  const hasDocument = typeof document !== 'undefined';
  const hasWindow = typeof window !== 'undefined';


  const flush = () => {
    if (disposed) return;
    if (flushing) {
      needsFlush = true;
      return;
    }
    if (!pendingContentDelta && !pendingTextEventDelta && !needsFlush) return;
    flushing = true;
    needsFlush = false;
    const contentDelta = pendingContentDelta;
    const textEventDelta = pendingTextEventDelta;
    pendingContentDelta = '';
    pendingTextEventDelta = '';
    try {
      updateMessage((prev) => ({
        ...prev,
        content: prev.content + contentDelta,
        events: textEventDelta
          ? [...(prev.events ?? []), { kind: 'text', text: textEventDelta }]
          : prev.events,
      }));
      persistSoon();
      if (contentDelta) onContentDelta?.(contentDelta);
    } finally {
      flushing = false;
    }
    if (pendingContentDelta || pendingTextEventDelta || needsFlush) {
      needsFlush = false;
      scheduleFlush();
    }
  };

  const scheduler = createFrameCheckpoint(flush);
  const scheduleFlush = () => { if (!disposed) scheduler.schedule(); };

  const appendContent = (delta: string) => {
    if (disposed) return;
    pendingContentDelta += delta;
    needsFlush = true;
    scheduleFlush();
  };

  const appendTextEvent = (delta: string) => {
    if (disposed) return;
    pendingTextEventDelta += delta;
    needsFlush = true;
    scheduleFlush();
  };

  const appendEvent = (ev: AgentEvent) => {
    if (disposed) return;
    if (ev.kind === 'text') {
      appendTextEvent(ev.text);
      return;
    }
    flush();
    updateMessage((prev) => ({ ...prev, events: [...(prev.events ?? []), ev] }));
    persistSoon();
  };

  const cancel = () => {
    disposed = true;
    scheduler.dispose();
    pendingContentDelta = '';
    pendingTextEventDelta = '';
    needsFlush = false;
    if (hasDocument) {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
    if (hasWindow) {
      window.removeEventListener('pagehide', onPageHide);
    }
  };

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      flush();
    }
  }

  function onPageHide() {
    flush();
    // persistSoon's 500ms debounce never fires once the document tears
    // down, so synchronously PUT with keepalive instead.
    flushAndPersistNow?.();
  }

  if (hasDocument) {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  if (hasWindow) {
    window.addEventListener('pagehide', onPageHide);
  }

  // True when text has been appended but not yet flushed into a `text` event.
  // Callers that need the soon-to-be-committed event count (e.g. pinning a live
  // tool's stream position) add 1 for this still-buffered preamble.
  const hasPendingText = () => pendingTextEventDelta.length > 0;

  return { appendContent, appendTextEvent, appendEvent, flush, cancel, hasPendingText };
}
