import { Bubble, BubbleContent } from './chat/Bubble';
import { conversationDraftKey } from '../pixflow/conversation-address';
import { useT as usePixflowUiTranslation } from '../i18n';
import { ChatHistoryControls } from '../pixflow/ChatHistoryControls';
import { PageAnnotationMessage } from './PageAnnotationMessage';
import { expandVoiceMessages } from '../pixflow/voice-messages';
import { ChatTranscriptItem } from './chat/MessageScroller';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { useAnalytics } from '../analytics/provider';
import { trackChatPanelClick, trackMessageQueueClick, trackRunFailedToastSurfaceView } from '../analytics/events';
import { attributedAmrUrl, recordAmrEntry } from '../analytics/amr-attribution';
import { useT } from '../i18n';
import {
  FEATURED_DESIGN_TOOLBOX_ACTION_IDS,
  findDesignToolboxSkill,
  getDesignToolboxAction,
  type DesignToolboxActionId,
} from '../runtime/design-toolbox';
import { isRetryableAssistantTerminalFailure } from '../runtime/design-delivery';
import { hasPixflowWordPressContext } from '../pixflow/wordpress-context';
import type { Dict } from '../i18n/types';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { appendProjectFileQuery, projectRawUrl } from '../providers/registry';
import type { TodoItem } from '../runtime/todos';
import type { AppliedPluginSnapshot, ChatSessionMode, WorkspaceContextItem } from '@open-design/contracts';
import type { TrackingProjectKind } from '@open-design/contracts/analytics';
import {
  DESIGN_SYSTEM_WORKSPACE_DISPLAY_DESCRIPTION,
  DESIGN_SYSTEM_WORKSPACE_DISPLAY_TITLE,
  isDesignSystemWorkspacePrompt,
} from '../design-system-auto-prompt';
import { isTodoWriteToolName, latestTodoWriteInputForPinnedCard } from '../runtime/todos';
import type { AppConfig, ChatAttachment, ChatCommentAttachment, ChatMessage, ChatMessageFeedbackChange, Conversation, DesignSystemSummary, PreviewComment, Project, ProjectFile, ProjectMetadata, SkillSummary } from '../types';
import { exactDateTime, messageTime, shortTime } from '../utils/chatTime';
import { commentTargetDisplayName, commentsToAttachments, simplePositionLabel } from '../comments';
import { AssistantMessage, type QuestionFormOpenRequest } from './AssistantMessage';
import { AmrGuidance } from './AmrGuidance';
import { amrRechargeUrlForProfile, resolveRunFailureUi } from '../runtime/amr-guidance';
import { RESUME_CONTINUE_PROMPT } from '../runtime/resume';
import {
  SharedChatComposer,
  type SharedChatComposerHandle,
  type SharedChatSendOutcome,
  type SharedChatSendMeta,
  SharedComposerDock,
  SharedMessageStream,
  SharedRunFailureCard,
} from './shared-chat';
import { listDesignArtifactCandidates } from './design-files/designArtifacts';
import type { PluginFolderAgentAction } from './design-files/pluginFolderActions';
import { Icon, type IconName } from './Icon';
import { repoConnectCopy } from './design-system-github-evidence';
import { isRenderableSketchJson, SketchPreview } from './SketchPreview';
import type { SettingsSection } from './SettingsDialog';
import { SharedChatRows } from './shared-chat/SharedChatRows';
import { Message, MessageContent, MessageHeader, MessageFooter } from './chat/Message';
import { QuestionRequestCard, latestQuestionRequest } from './QuestionRequestCard';
import { ComposerQueue } from './ComposerQueue';
import queueLayout from './ChatPaneQueue.module.css';
import { workspacePortalTarget } from './workspacePortalTarget';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

// Featured starter prompts shown on the empty chat. Clicking one fills
// the composer (does not auto-send) so users can tweak before sending.
// Each prompt is intentionally dense — it should showcase ambitious
// layout, typographic, and information-design moves rather than a
// generic landing page.
//
// Starter sets are picked per project kind (and per video model) so a
// fresh seedance video, a hyperframes html-in-canvas video, an image
// project and an audio project each see relevant prompts instead of the
// generic prototype trio. The default (prototype/deck/template/other/
// live-artifact) set stays i18n-translated via existing chat.example*
// keys. Media starter titles, tags, and prompts are localized as well;
// user-authored content and executable identifiers remain unchanged.
type StarterPrompt = {
  icon: string;
  title: string;
  tag: string;
  prompt: string;
};

type StarterPromptKeys = {
  icon: string;
  titleKey: keyof Dict;
  tagKey: keyof Dict;
  promptKey: keyof Dict;
};

const DEFAULT_STARTER_KEYS: StarterPromptKeys[] = [
  {
    icon: '▤',
    titleKey: 'chat.example1Title',
    tagKey: 'chat.example1Tag',
    promptKey: 'chat.example1Prompt',
  },
  {
    icon: '▦',
    titleKey: 'chat.example2Title',
    tagKey: 'chat.example2Tag',
    promptKey: 'chat.example2Prompt',
  },
  {
    icon: '◈',
    titleKey: 'chat.example3Title',
    tagKey: 'chat.example3Tag',
    promptKey: 'chat.example3Prompt',
  },
];

const IMPORTED_ARTIFACTS_INITIAL_VISIBLE_COUNT = 5;
const IMPORTED_ARTIFACTS_REVEAL_COUNT = 5;

const IMAGE_STARTERS: StarterPromptKeys[] = [
  {
    icon: '◯',
    titleKey: 'ui.mediaStarter.image1.title',
    tagKey: 'ui.mediaStarter.image1.tag',
    promptKey: 'ui.mediaStarter.image1.prompt',
  },
  {
    icon: '▭',
    titleKey: 'ui.mediaStarter.image2.title',
    tagKey: 'ui.mediaStarter.image2.tag',
    promptKey: 'ui.mediaStarter.image2.prompt',
  },
  {
    icon: '◐',
    titleKey: 'ui.mediaStarter.image3.title',
    tagKey: 'ui.mediaStarter.image3.tag',
    promptKey: 'ui.mediaStarter.image3.prompt',
  },
];

// Pure-video / cinematic-shot starters for seedance, sora, kling, veo,
// grok-imagine and similar text-to-video models. Each prompt is one
// shot, restrained motion, and a clear visual concept the model can
// nail in 5-10 seconds.
const VIDEO_SEEDANCE_STARTERS: StarterPromptKeys[] = [
  {
    icon: '◉',
    titleKey: 'ui.mediaStarter.video1.title',
    tagKey: 'ui.mediaStarter.video1.tag',
    promptKey: 'ui.mediaStarter.video1.prompt',
  },
  {
    icon: '▣',
    titleKey: 'ui.mediaStarter.video2.title',
    tagKey: 'ui.mediaStarter.video2.tag',
    promptKey: 'ui.mediaStarter.video2.prompt',
  },
  {
    icon: '⌘',
    titleKey: 'ui.mediaStarter.video3.title',
    tagKey: 'ui.mediaStarter.video3.tag',
    promptKey: 'ui.mediaStarter.video3.prompt',
  },
];

// HyperFrames HTML-in-canvas starters — these target the
// hyperframes-html video model where the renderer captures live DOM
// into a WebGL texture and runs shader effects on top. References:
// https://www.remotion.dev/docs/html-in-canvas (concept), the seven
// vfx-* catalog blocks shipped via `npx hyperframes add vfx-*`, and
// skills/hyperframes/references/html-in-canvas.md.
const VIDEO_HYPERFRAMES_STARTERS: StarterPromptKeys[] = [
  {
    icon: '◉',
    titleKey: 'ui.mediaStarter.hyperframes1.title',
    tagKey: 'ui.mediaStarter.hyperframes1.tag',
    promptKey: 'ui.mediaStarter.hyperframes1.prompt',
  },
  {
    icon: '▦',
    titleKey: 'ui.mediaStarter.hyperframes2.title',
    tagKey: 'ui.mediaStarter.hyperframes2.tag',
    promptKey: 'ui.mediaStarter.hyperframes2.prompt',
  },
  {
    icon: '◈',
    titleKey: 'ui.mediaStarter.hyperframes3.title',
    tagKey: 'ui.mediaStarter.hyperframes3.tag',
    promptKey: 'ui.mediaStarter.hyperframes3.prompt',
  },
];

// Speech-focused audio starters — the New Project audio panel only
// surfaces the `speech` kind today (see MediaProjectOptions), so we
// match that. If/when the music + sfx tabs come back, broaden this set.
const AUDIO_STARTERS: StarterPromptKeys[] = [
  {
    icon: '♪',
    titleKey: 'ui.mediaStarter.audio1.title',
    tagKey: 'ui.mediaStarter.audio1.tag',
    promptKey: 'ui.mediaStarter.audio1.prompt',
  },
  {
    icon: '♫',
    titleKey: 'ui.mediaStarter.audio2.title',
    tagKey: 'ui.mediaStarter.audio2.tag',
    promptKey: 'ui.mediaStarter.audio2.prompt',
  },
  {
    icon: '♬',
    titleKey: 'ui.mediaStarter.audio3.title',
    tagKey: 'ui.mediaStarter.audio3.tag',
    promptKey: 'ui.mediaStarter.audio3.prompt',
  },
];

function pickStarters(
  metadata: ProjectMetadata | undefined,
  t: TranslateFn,
): StarterPrompt[] {
  const kind = metadata?.kind;
  const translate = (entries: StarterPromptKeys[]): StarterPrompt[] => entries.map((entry) => ({
    icon: entry.icon,
    title: t(entry.titleKey),
    tag: t(entry.tagKey),
    prompt: t(entry.promptKey),
  }));
  if (kind === 'image') return translate(IMAGE_STARTERS);
  if (kind === 'video') {
    return translate(metadata?.videoModel === 'hyperframes-html'
      ? VIDEO_HYPERFRAMES_STARTERS
      : VIDEO_SEEDANCE_STARTERS);
  }
  if (kind === 'audio') return translate(AUDIO_STARTERS);
  return translate(DEFAULT_STARTER_KEYS);
}

function sortArtifactsByModified(files: ProjectFile[]): ProjectFile[] {
  return [...files].sort(
    (a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name),
  );
}

function ImportedFolderArtifacts({
  projectId,
  files,
  onOpenFile,
  t,
}: {
  projectId: string | null;
  files: ProjectFile[];
  onOpenFile?: (name: string) => void;
  t: TranslateFn;
}) {
  const [visibleCount, setVisibleCount] = useState(IMPORTED_ARTIFACTS_INITIAL_VISIBLE_COUNT);

  useEffect(() => {
    setVisibleCount(IMPORTED_ARTIFACTS_INITIAL_VISIBLE_COUNT);
  }, [files]);

  if (files.length === 0) {
    return (
      <div className="chat-design-artifacts-empty" data-testid="chat-design-artifacts-empty">
        {t('designFiles.empty')}
      </div>
    );
  }

  const visibleFiles = files.slice(0, visibleCount);
  const hiddenCount = Math.max(0, files.length - visibleFiles.length);
  const revealCount = Math.min(IMPORTED_ARTIFACTS_REVEAL_COUNT, hiddenCount);
  const revealLabel = t('chat.designArtifactsShowMore', { count: revealCount });

  return (
    <div className="chat-design-artifacts" data-testid="chat-design-artifacts">
      {visibleFiles.map((file, index) => {
        const openable = Boolean(onOpenFile);
        const openLabel = `${t('designFiles.previewOpen')} ${file.name}`;
        const openFile = () => {
          onOpenFile?.(file.name);
        };
        return (
          <div
            key={file.name}
            className="chat-design-artifact"
            data-kind={file.kind}
            data-file-name={file.name}
            data-testid={`chat-design-artifact-${index}`}
            role={openable ? 'button' : 'listitem'}
            tabIndex={openable ? 0 : undefined}
            title={openLabel}
            aria-label={openLabel}
            onDoubleClick={openable ? openFile : undefined}
            onKeyDown={
              openable
                ? (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    openFile();
                  }
                : undefined
            }
          >
            <div className="chat-design-artifact-preview" aria-hidden>
              <ChatArtifactPreview projectId={projectId} file={file} />
            </div>
            <div className="chat-design-artifact-meta">
              <span className="chat-design-artifact-name" title={file.name}>
                {file.name}
              </span>
              <span className="chat-design-artifact-kind">
                {chatArtifactKindLabel(file.kind, t)}
              </span>
            </div>
          </div>
        );
      })}
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="chat-design-artifact chat-design-artifact-more"
          data-testid="chat-design-artifacts-more"
          aria-label={revealLabel}
          title={revealLabel}
          onClick={() => {
            setVisibleCount((current) =>
              Math.min(files.length, current + IMPORTED_ARTIFACTS_REVEAL_COUNT),
            );
          }}
        >
          <span className="chat-design-artifact-more-icon" aria-hidden>
            +
          </span>
          <span className="chat-design-artifact-more-count">
            {revealLabel}
          </span>
        </button>
      ) : null}
    </div>
  );
}

function ChatArtifactPreview({
  projectId,
  file,
}: {
  projectId: string | null;
  file: ProjectFile;
}) {
  if (!projectId) {
    return <ChatArtifactFallback kind={file.kind} />;
  }

  const url = appendProjectFileQuery(projectRawUrl(projectId, file.name), `v=${Math.round(file.mtime)}`);
  if (isRenderableSketchJson(file)) {
    return <SketchPreview projectId={projectId} file={file} />;
  }
  if (file.kind === 'image' || file.kind === 'sketch') {
    return <img src={url} alt="" loading="lazy" />;
  }
  if (file.kind === 'html') {
    return (
      <iframe
        title={file.name}
        src={url}
        sandbox="allow-scripts allow-downloads"
        loading="lazy"
      />
    );
  }
  if (file.kind === 'video') {
    return <video src={url} muted playsInline preload="metadata" />;
  }
  return <ChatArtifactFallback kind={file.kind} />;
}

function ChatArtifactFallback({ kind }: { kind: ProjectFile['kind'] }) {
  return (
    <span className="chat-design-artifact-fallback">
      <Icon name={chatArtifactIcon(kind)} size={28} />
      <span>{chatArtifactShortKind(kind)}</span>
    </span>
  );
}

function chatArtifactIcon(kind: ProjectFile['kind']): IconName {
  if (kind === 'html' || kind === 'code') return 'file-code';
  if (kind === 'image' || kind === 'sketch') return 'image';
  if (kind === 'video' || kind === 'audio') return 'play';
  if (kind === 'presentation') return 'present';
  return 'file';
}

function chatArtifactShortKind(kind: ProjectFile['kind']): string {
  if (kind === 'html') return 'HTML';
  if (kind === 'image') return 'IMG';
  if (kind === 'sketch') return 'SKETCH';
  if (kind === 'video') return 'VIDEO';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'presentation') return 'PPT';
  if (kind === 'document') return 'DOC';
  return 'FILE';
}

function chatArtifactKindLabel(kind: ProjectFile['kind'], t: TranslateFn): string {
  if (kind === 'html') return t('designFiles.kindHtml');
  if (kind === 'image') return t('designFiles.kindImage');
  if (kind === 'sketch') return t('designFiles.kindSketch');
  if (kind === 'video') return 'Video';
  if (kind === 'audio') return 'Audio';
  if (kind === 'pdf') return t('designFiles.kindPdf');
  if (kind === 'document') return t('designFiles.kindDocument');
  if (kind === 'presentation') return t('designFiles.kindPresentation');
  if (kind === 'spreadsheet') return t('designFiles.kindSpreadsheet');
  return t('designFiles.kindBinary');
}

interface Props {
  messages: ChatMessage[];
  olderHistory?: { loading: boolean; error: boolean; load: () => Promise<void> };
  historyPersistence?: { conflict?: boolean; retry: () => Promise<void>; recover?: (title: string) => Promise<void>; recovering?: boolean };
  streaming: boolean;
  loading?: boolean;
  error: string | null;
  projectId: string | null;
  sessionMode?: ChatSessionMode;
  onSessionModeChange?: (mode: ChatSessionMode) => void;
  // Analytics-only — forwarded to AssistantMessage so the feedback
  // events know which project surface the rating applies to. Optional
  // (defaults to null/'prototype') so unit tests can mount ChatPane
  // without project context.
  projectKindForTracking?: TrackingProjectKind | null;
  projectFiles: ProjectFile[];
  activeProjectFileName?: string | null;
  hasActiveDesignSystem?: boolean;
  activeDesignSystem?: DesignSystemSummary | null;
  sendDisabled?: boolean;
  queuedItems?: QueuedSendItem[];
  onRemoveQueuedSend?: (id: string) => void;
  onUpdateQueuedSend?: (id: string, update: QueuedSendUpdate) => void;
  onReorderQueuedSends?: (orderedIds: string[]) => void;
  onSendQueuedNow?: (id: string) => void;
  onSteerQueuedSend?: (id: string) => void;
  // Names that exist in the project folder. Tool cards and chips use this
  // set to decide whether a path can be opened as a tab.
  projectFileNames?: Set<string>;
  projectResolvedDir?: string | null;
  onEnsureProject: () => Promise<string | null>;
  previewComments?: PreviewComment[];
  attachedComments?: PreviewComment[];
  onAttachComment?: (comment: PreviewComment) => void;
  onDetachComment?: (commentId: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onSend: (
    prompt: string,
    attachments: ChatAttachment[],
    commentAttachments: ChatCommentAttachment[],
    meta?: SharedChatSendMeta,
  ) => void | boolean | Promise<void | boolean>;
  onRetry?: (assistantMessage: ChatMessage) => void;
  onResumeRun?: (assistantMessage: ChatMessage) => void;
  onStop: () => void;
  // Skills available for @-mention assembly. ProjectView filters out the
  // user's disabled set before passing them in here.
  skills?: SkillSummary[];
  // Click-to-open chain: passes a basename up to ProjectView, which sets
  // FileWorkspace's openRequest. Tool cards, attachment chips, and
  // produced-file chips all call this.
  onRequestOpenFile?: (name: string) => void;
  onRequestPluginDetails?: (pluginId: string) => void;
  onRequestDesignSystemDetails?: (system: DesignSystemSummary) => void;
  onRequestPluginFolderAgentAction?: (
    relativePath: string,
    action: PluginFolderAgentAction,
  ) => Promise<{ message?: string; url?: string } | void> | { message?: string; url?: string } | void;
  activePluginActionPaths?: Set<string>;
  hiddenPluginActionPaths?: Set<string>;
  forceStreamingMessageIds?: Set<string>;
  // Live-only streaming tool-input partials keyed by tool-use id. Threaded to
  // AssistantMessage so an in-flight Write/Edit can render its code in real
  // time before the full `tool_use` arrives. Never persisted.
  liveToolInput?: Record<string, { name: string; text: string; seq?: number }>;
  initialDraft?: string;
  // Focus the right-hand Questions tab from the chat banner.
  onOpenQuestions?: (request?: QuestionFormOpenRequest) => void;
  onContinueRemainingTasks?: (assistantMessage: ChatMessage, todos: TodoItem[]) => void;
  onAssistantFeedback?: (assistantMessage: ChatMessage, change: ChatMessageFeedbackChange) => void;
  // "Next step" affordance handlers forwarded to the last assistant message.
  // The featured design-toolbox rows are driven directly off the composer ref
  // owned here, so they need no handler from ProjectView (unlike onArtifactShare).
  onArtifactShare?: (fileName: string) => void;
  onArtifactDownload?: (fileName: string) => void;
  onForkFromMessage?: (assistantMessage: ChatMessage) => void;
  forkingMessageId?: string | null;
  // Header "+" button — kicks off ProjectView's create-conversation flow.
  onNewConversation?: () => void;
  newConversationDisabled?: boolean;
  // Conversation list that used to live in the topbar. The chat tab now
  // owns the list so users can browse + switch conversations without
  // leaving the pane.
  conversations: Conversation[];
  activeConversationId: string | null;
  // The conversation whose history the live `messages` array currently
  // reflects. Null while a switch is mid-flight (or after a load failure),
  // which is exactly when `messages.length` must NOT be trusted as the active
  // conversation's count — see `conversationMessageCount`. Callers that do not
  // track this (mounts whose loader resets/retags `messages` asynchronously)
  // leave it undefined and fall back to the persisted `conversation.messageCount`
  // for a stable list count.
  messagesConversationId?: string | null;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  // Composer settings/CLI button forwards to here. The dialog lives in App
  // (it owns the AppConfig lifecycle) so we just pass the open trigger.
  onOpenSettings?: (section?: SettingsSection) => void;
  showByokRecoveryAction?: boolean;
  onSwitchToLocalCli?: () => void;
  onOpenAmrSettings?: () => void;
  onSwitchToAmrAndRetry?: (failedAssistant: ChatMessage) => void;
  // PR #3157: Antigravity's `agy -p` can't complete OAuth on its own,
  // so the auth banner offers a "Sign in via terminal" button that
  // POSTs to /api/agents/antigravity/oauth-launch. Handler resolves
  // after the daemon kicks off `osascript`/`x-terminal-emulator`/
  // `cmd /c start` so the UI can disable the button while in flight.
  onLaunchAntigravityOauth?: () => Promise<void>;
  // Same dialog, but landing on the External MCP tab. Forwarded to the
  // composer's `/mcp` slash and MCP picker button.
  onOpenMcpSettings?: () => void;
  onOpenBuilderHandoff?: () => void;
  // The composer "+" menu's "add plugin" / "add connector" rows route to the
  // home plugin-registry / connector-integration surfaces.
  onBrowsePlugins?: () => void;
  onOpenConnectors?: () => void;
  // True when this project is a GitHub-backed design system whose repository
  // evidence has not fully landed. Surfaces a "Connect your repo" CTA in the
  // empty chat state alongside the starter examples.
  connectRepoNeeded?: boolean;
  // Live GitHub connector status, used only to pick the connect-repo CTA copy
  // (connect vs re-import). Undefined until the status fetch resolves.
  githubConnected?: boolean;
  // Fires when the connect-repo CTA button is clicked. The parent decides what
  // it does based on connector status (open Connectors, or prefill the composer
  // with the import instruction).
  onConnectRepo?: () => void;
  // Bumped by the parent to push a draft into the composer (used by the
  // "Import repo" CTA). The nonce lets the same text fire more than once.
  composerDraftSignal?: { text: string; nonce: number; attachments?: ChatAttachment[]; commentAttachments?: ChatCommentAttachment[]; meta?: SharedChatSendMeta };
  // Optional pet wiring forwarded straight through to ChatComposer's
  // /pet button. When omitted the composer hides the button entirely.
  petConfig?: AppConfig['pet'];
  onAdoptPet?: (petId: string) => void;
  onTogglePet?: () => void;
  onOpenPetSettings?: () => void;
  projectMetadata?: ProjectMetadata;
  onProjectMetadataChange?: (metadata: ProjectMetadata) => void;
  activeWorkspaceContext?: WorkspaceContextItem | null;
  workspaceContexts?: WorkspaceContextItem[];
  currentSkillId?: string | null;
  onProjectSkillChange?: (skillId: string | null) => void;
  researchAvailable?: boolean;
  // Immutable snapshot of the plugin pinned to this project. When set
  // we suppress the in-composer plugin rail (the user already picked a
  // plugin on Home) and render the active plugin as a context chip on
  // each user message — that satisfies §8 "show context inside the run
  // message" without forcing a separate side widget.
  activePluginSnapshot?: AppliedPluginSnapshot | null;
  // SenseAudio BYOK only — wired straight through to ChatComposer for the
  // in-composer image-model picker. Active protocol is read so the picker
  // hides when the user is on any other BYOK tab (azure / openai / …).
  byokApiProtocol?: AppConfig['apiProtocol'];
  byokImageModel?: string;
  onChangeByokImageModel?: (model: string) => void;
  byokVideoModel?: string;
  onChangeByokVideoModel?: (model: string) => void;
  byokSpeechModel?: string;
  onChangeByokSpeechModel?: (model: string) => void;
  byokSpeechVoice?: string;
  onChangeByokSpeechVoice?: (voice: string) => void;
  composerFooterAccessory?: ReactNode;
  // Slot rendered next to the composer's "+" menu (e.g. the working-dir pill).
  composerLeadingAccessory?: ReactNode;
  // Forwarded straight to the chat composer's mid-chat design-system
  // switcher. ProjectView owns the project record so the parent is the
  // natural place to mirror the patched project after a PATCH lands.
  currentDesignSystemId?: string | null;
  onActiveDesignSystemChange?: (project: Project) => void;
  onShowToast?: (message: string) => void;
  // Project header slot. The former standalone chrome header row was removed;
  // its back button, project title (editable) and design-system picker moved
  // into the top of the chat pane. ProjectView owns the project record so it
  // renders these as slots rather than ChatPane re-deriving the data.
  onBack?: () => void;
  backLabel?: string;
  projectHeader?: ReactNode;
  headerActions?: ReactNode;
  compactComposer?: boolean;
  codexVoiceEnabled?: boolean;
  codexVoiceStartRequested?: boolean;
  designSystemPicker?: ReactNode;
  config?: AppConfig;
}

const AMR_PROFILE_ENV_KEY = 'OPEN_DESIGN_AMR_PROFILE';

type Tab = 'chat' | 'comments';

const CONVERSATION_ROW_HEIGHT_PX = 34;
const CONVERSATION_VIRTUALIZE_THRESHOLD = 36;
const CONVERSATION_OVERSCAN_ROWS = 8;

interface RunErrorDiagnosticInput {
  message: string;
  rawMessage?: string | null;
  errorCode?: string;
  traceId?: string;
  projectId?: string | null;
  conversationId?: string | null;
  assistantMessageId?: string;
  agentId?: string;
}

interface QueuedSendItem {
  id: string;
  prompt: string;
  attachments?: ChatAttachment[];
  commentAttachments?: ChatCommentAttachment[];
  meta?: SharedChatSendMeta;
  dispatchState?: 'sending' | 'unconfirmed' | 'paused';
}

interface QueuedSendUpdate {
  prompt: string;
  attachments: ChatAttachment[];
  commentAttachments: ChatCommentAttachment[];
  meta?: SharedChatSendMeta;
}

// Gap left above the anchored user message when it is pinned to the top.

export function ChatPane({
  messages: persistedMessages,
  olderHistory,
  historyPersistence,
  streaming,
  loading = false,
  sendDisabled = false,
  queuedItems = [],
  error,
  projectId,
  sessionMode = 'design',
  onSessionModeChange,
  projectKindForTracking = null,
  projectFiles,
  activeProjectFileName = null,
  hasActiveDesignSystem = false,
  activeDesignSystem = null,
  projectFileNames,
  onEnsureProject,
  previewComments = [],
  attachedComments = [],
  onAttachComment,
  onDetachComment,
  onDeleteComment,
  onSend,
  onRetry,
  onResumeRun,
  onStop,
  onRemoveQueuedSend,
  onUpdateQueuedSend,
  onReorderQueuedSends,
  onSendQueuedNow,
  onSteerQueuedSend,
  onRequestOpenFile,
  onRequestPluginDetails,
  onRequestDesignSystemDetails,
  onRequestPluginFolderAgentAction,
  activePluginActionPaths,
  hiddenPluginActionPaths,
  forceStreamingMessageIds,
  liveToolInput,
  initialDraft,
  onOpenQuestions,
  onContinueRemainingTasks,
  onAssistantFeedback,
  onArtifactShare,
  onArtifactDownload,
  onForkFromMessage,
  forkingMessageId = null,
  onNewConversation,
  newConversationDisabled = false,
  conversations,
  activeConversationId,
  messagesConversationId = null,
  onSelectConversation,
  onDeleteConversation,
  onOpenSettings,
  showByokRecoveryAction = false,
  onSwitchToLocalCli,
  onOpenAmrSettings,
  onSwitchToAmrAndRetry,
  onLaunchAntigravityOauth,
  onOpenMcpSettings,
  onOpenBuilderHandoff,
  onBrowsePlugins,
  onOpenConnectors,
  connectRepoNeeded,
  githubConnected,
  onConnectRepo,
  composerDraftSignal,
  petConfig,
  onAdoptPet,
  onTogglePet,
  onOpenPetSettings,
  projectMetadata,
  onProjectMetadataChange,
  activeWorkspaceContext,
  workspaceContexts = [],
  currentSkillId = null,
  onProjectSkillChange,
  researchAvailable,
  activePluginSnapshot,
  skills = [],
  byokApiProtocol,
  byokImageModel,
  onChangeByokImageModel,
  byokVideoModel,
  onChangeByokVideoModel,
  byokSpeechModel,
  onChangeByokSpeechModel,
  byokSpeechVoice,
  onChangeByokSpeechVoice,
  composerLeadingAccessory,
  composerFooterAccessory,
  currentDesignSystemId,
  onActiveDesignSystemChange,
  onShowToast,
  onBack,
  backLabel,
  projectHeader,
  headerActions,
  compactComposer = false,
  codexVoiceEnabled = false,
  codexVoiceStartRequested,
  designSystemPicker,
  config,
  projectResolvedDir,
}: Props) {
  const translateUi = usePixflowUiTranslation();
  const messages = useMemo(() => expandVoiceMessages(persistedMessages), [persistedMessages]);
  const t = useT();
  const sharedPanelChat = hasPixflowWordPressContext();
  const [directQuestion, setDirectQuestion] = useState<QuestionFormOpenRequest | null>(null);
  const pendingQuestion = sharedPanelChat ? latestQuestionRequest(persistedMessages) : null;
  const activeQuestion = pendingQuestion && (directQuestion?.messageId === pendingQuestion.messageId ? directQuestion : pendingQuestion);
  const analytics = useAnalytics();
  const amrProfile = config?.agentCliEnv?.amr?.[AMR_PROFILE_ENV_KEY] ?? null;
  const logRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<SharedChatComposerHandle | null>(null);
  const composerSlotRef = useRef<HTMLDivElement | null>(null);
  const composerLayerRef = useRef<HTMLDivElement | null>(null);
  const queuedSendStripRef = useRef<HTMLDivElement | null>(null);
  const runFailedToastSurfaceKeysRef = useRef<Set<string>>(new Set());
  // AssistantMessage's interaction callbacks are re-created per render and
  // excluded from its memo comparison (so streaming doesn't re-render every
  // message). Route them through this ref so a memoized message still calls the
  // LATEST handler. See areAssistantMessagePropsEqual in AssistantMessage.tsx.
  const assistantCallbacksRef = useRef({
    onContinueRemainingTasks,
    onAssistantFeedback,
    onArtifactShare,
    onForkFromMessage,
  });
  assistantCallbacksRef.current = {
    onContinueRemainingTasks,
    onAssistantFeedback,
    onArtifactShare,
    onForkFromMessage,
  };
  // Featured design-toolbox follow-up rows on the assistant "next step" card.
  // The toolbox left the "+" menu, so these route straight into the composer
  // we own here: seeding an action's prompt+skill, or opening the full panel.
  // Both stay stable (composer ref + no deps) so AssistantMessage stays memoized.
  const handleToolboxAction = useCallback((
    id: DesignToolboxActionId,
  ) => {
    composerRef.current?.applyDesignToolboxAction(id);
  }, []);
  const handlePickSkill = useCallback((skillId: string) => {
    composerRef.current?.applyDesignToolboxSkill(skillId);
  }, []);
  // The `@skill` shown in each featured row's hover detail — matched the same
  // way the composer matches it, using the raw skill name (what gets inlined
  // into the draft). Recomputed only when the skill list changes.
  const featuredToolboxSkillNames = useMemo<Partial<Record<DesignToolboxActionId, string | null>>>(() => {
    const map: Partial<Record<DesignToolboxActionId, string | null>> = {};
    for (const id of FEATURED_DESIGN_TOOLBOX_ACTION_IDS) {
      const action = getDesignToolboxAction(id);
      map[id] = action ? (findDesignToolboxSkill(action, skills)?.name ?? null) : null;
    }
    return map;
  }, [skills]);
  const [tab, setTab] = useState<Tab>('chat');

  const [composerPortalTarget, setComposerPortalTarget] = useState<HTMLElement | null>(null);
  const [composerPortalRect, setComposerPortalRect] = useState<{
    left: number;
    width: number;
    bottom: number;
  } | null>(null);
  const [composerSlotHeight, setComposerSlotHeight] = useState(0);
  const [editingQueuedSendId, setEditingQueuedSendId] = useState<string | null>(null);
  // Reverse scan (no array copy) + memo so this and the maps below don't
  // recompute on every non-`messages` render (scroll, hover, toggles).
  const { lastUser, lastAssistantMsg } = useMemo(() => {
    let lastUser: ChatMessage | undefined;
    let lastAssistantMsg: ChatMessage | undefined;
    for (let i = messages.length - 1; i >= 0 && !(lastUser && lastAssistantMsg); i--) {
      const message = messages[i]!;
      if (message.role === 'assistant') lastAssistantMsg ??= message;
      if (message.role === 'user') lastUser ??= message;
    }
    return { lastUser, lastAssistantMsg };
  }, [messages]);
  const lastAssistantId = lastAssistantMsg?.id;
  const hasActiveRunMessage = messages.some(
    (m) => m.role === 'assistant' && isActiveRunStatus(m.runStatus),
  );
  const retryAssistant = retryableAssistantMessage(messages, lastAssistantId, streaming);
  // The failed run's error event lives on the (persisted) assistant message, so
  // the error card + AMR card survive a reload — unlike the ephemeral global
  // `error` state. Drive both off this event.
  const failedRunErrorEvent = (() => {
    const evs = retryAssistant?.events ?? [];
    for (let i = evs.length - 1; i >= 0; i--) {
      const ev = evs[i];
      if (ev?.kind === 'status' && ev.label === 'error') return ev;
    }
    return null;
  })();
  // Per-case failure UI (button + copy + whether to promote AMR). Only
  // meaningful for a failed run (retryAssistant present).
  const runFailureUi = retryAssistant
    ? resolveRunFailureUi(failedRunErrorEvent?.code, retryAssistant.agentId)
    : null;
  // Offer Continue (resume) when the failed run is resumable AND the active
  // agent still matches the agent that produced it. The daemon stores a
  // resumable session per (conversation, agent); after an agent switch the new
  // agent has no id for that session, so a resume would silently start fresh —
  // fall back to the from-scratch Retry instead. We do NOT require `onResumeRun`
  // here: because the daemon persists the resumable session, the plain Retry
  // path (which re-sends the original prompt) would itself silently resume that
  // session and double the work. So every ChatPane surface must offer Continue
  // for a resumable failure — `onResumeRun` when wired (primary chat, carries
  // the resume_continue analytics), otherwise a plain `onSend` of the canonical
  // continue prompt (resumes the session without re-sending the original turn).
  const canResumeFailedRun =
    !!retryAssistant?.resumable &&
    !!retryAssistant?.agentId &&
    retryAssistant.agentId === config?.agentId;
  // Prefer a case-specific message (AMR auth / balance) over the raw upstream
  // string; fall back to the live global error (also covers conversation-load
  // / audio errors) then the persisted run error so a reload still shows it.
  const rawError = error ?? failedRunErrorEvent?.detail ?? null;
  const displayError = runFailureUi?.messageKey ? t(runFailureUi.messageKey) : rawError;
  const errorDiagnosticText = displayError
    ? buildRunErrorDiagnosticText({
        message: displayError,
        rawMessage: rawError,
        errorCode: failedRunErrorEvent?.code,
        traceId: retryAssistant?.runId,
        projectId,
        conversationId: activeConversationId,
        assistantMessageId: retryAssistant?.id,
        agentId: retryAssistant?.agentId,
      })
    : null;
  // The failed run whose error this top-level card represents. AssistantMessage
  // suppresses only THIS message's per-message error pill (to avoid the
  // duplicate); other failed turns — older history, or once a follow-up makes
  // this no longer the last assistant — keep their pill so the error survives.
  const errorCardOwnerId =
    retryAssistant && failedRunErrorEvent ? retryAssistant.id : null;
  // AMR promotion card payload (only the non-AMR model/auth/quota case).
  const amrSwitchPayload =
    runFailureUi?.showSwitchCard
    && failedRunErrorEvent?.code !== 'UPSTREAM_UNAVAILABLE'
    && retryAssistant
    && failedRunErrorEvent?.code
      ? {
          errorCode: failedRunErrorEvent.code,
          projectId: projectId ?? '',
          projectKind: projectKindForTracking,
          conversationId: activeConversationId,
          assistantMessageId: retryAssistant.id,
          runId: retryAssistant.runId ?? null,
        }
      : null;
  const showByokRecoveryCta = showByokRecoveryAction && Boolean(onSwitchToLocalCli);
  const showErrorActions =
    showByokRecoveryCta || Boolean(retryAssistant && onRetry && runFailureUi);
  useEffect(() => {
    if (!displayError || !failedRunErrorEvent?.code || !retryAssistant) return;
    // The hosted-AMR nudge owns this same surface_view when it renders below
    // the error card. For all other failed-run guidance (AMR auth/balance,
    // Antigravity auth/quota, upstream outage, generic retry), the chat error
    // card itself is the visible run_failed_toast surface.
    if (amrSwitchPayload) return;

    const key = [
      projectId ?? '',
      activeConversationId ?? '',
      retryAssistant.id,
      retryAssistant.runId ?? '',
      failedRunErrorEvent.code,
    ].join(':');
    if (runFailedToastSurfaceKeysRef.current.has(key)) return;
    runFailedToastSurfaceKeysRef.current.add(key);

    trackRunFailedToastSurfaceView(analytics.track, {
      page_name: 'chat_panel',
      area: 'chat_panel',
      element: 'run_failed_toast',
      error_code: failedRunErrorEvent.code,
      project_id: projectId ?? '',
      project_kind: projectKindForTracking,
      conversation_id: activeConversationId,
      assistant_message_id: retryAssistant.id,
      run_id: retryAssistant.runId ?? null,
    });
  }, [
    activeConversationId,
    analytics.track,
    amrSwitchPayload,
    displayError,
    failedRunErrorEvent?.code,
    projectId,
    projectKindForTracking,
    retryAssistant,
  ]);
  const importedFolderArtifacts = useMemo(
    () =>
      projectMetadata?.importedFrom === 'folder'
        ? sortArtifactsByModified(
            listDesignArtifactCandidates(projectFiles, projectMetadata.entryFile),
          )
        : [],
    [projectFiles, projectMetadata?.entryFile, projectMetadata?.importedFrom],
  );
  const showImportedFolderArtifacts = projectMetadata?.importedFrom === 'folder';
  const composerDraftStorageKey = projectId && activeConversationId
    ? hasPixflowWordPressContext() ? conversationDraftKey({projectId, conversationId: activeConversationId}) : `od:chat-composer:draft:${projectId}:${activeConversationId}`
    : undefined;
  // Only the first user message gets the active-plugin chip — the
  // plugin is project-scoped so re-stamping it on every reply would be
  // noise. Subsequent messages still run under the same snapshot.
  const firstUserMessageId = useMemo(
    () => messages.find((m) => m.role === 'user')?.id,
    [messages],
  );
  // Map each assistant message id to the user message that follows it (if any)
  // so the chat-side Questions banner can reopen that exact answered form in
  // the right-hand panel later.
  const nextUserContentByAssistantId = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = 0; i < messages.length - 1; i++) {
      const m = messages[i]!;
      const next = messages[i + 1]!;
      if (m.role === 'assistant' && next.role === 'user') {
        map.set(m.id, next.content);
      }
    }
    return map;
  }, [messages]);

  // ChatComposer's internal `seededRef` latches after the first
  // non-empty `initialDraft`, so a parent setting `initialDraft` back
  // to `undefined` will not flow into the composer's draft state. When
  // the parent does that transition (because the seed is now stale —
  // e.g. ProjectView discovered the conversation already has a sent
  // user message after a reload), reach into the composer and clear
  // the textarea so the user does not see the prompt they already
  // submitted.
  const lastSeenInitialDraftRef = useRef<string | undefined>(initialDraft);
  useEffect(() => {
    const previous = lastSeenInitialDraftRef.current;
    lastSeenInitialDraftRef.current = initialDraft;
    if (previous && initialDraft === undefined) {
      composerRef.current?.setDraft('');
    }
  }, [initialDraft]);

  // Parent-driven composer prefill (the "Import repo" CTA). Reuse the same
  // imperative setDraft the starter cards use; the nonce guards against
  // re-applying the same signal on unrelated re-renders.
  const lastDraftSignalNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!composerDraftSignal) return;
    if (lastDraftSignalNonceRef.current === composerDraftSignal.nonce) return;
    lastDraftSignalNonceRef.current = composerDraftSignal.nonce;
    if (composerDraftSignal.attachments || composerDraftSignal.commentAttachments || composerDraftSignal.meta) {
      composerRef.current?.restoreDraft(composerDraftSignal);
    } else composerRef.current?.setDraft(composerDraftSignal.text);
  }, [composerDraftSignal]);

  useEffect(() => {
    if (!editingQueuedSendId) return;
    if (queuedItems.some((item) => item.id === editingQueuedSendId)) return;
    setEditingQueuedSendId(null);
  }, [editingQueuedSendId, queuedItems]);

  const restoreQueuedSendToComposer = (item: QueuedSendItem) => {
    setEditingQueuedSendId(item.id);
    composerRef.current?.restoreDraft({
      text: item.prompt,
      attachments: item.attachments ?? [],
      commentAttachments: item.commentAttachments ?? [],
      meta: item.meta,
    });
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;
    setComposerPortalTarget(workspacePortalTarget() ?? document.body);
  }, []);

  useLayoutEffect(() => {
    if (tab !== 'chat') {
      setComposerPortalRect(null);
      return;
    }
    const slot = composerSlotRef.current;
    if (!slot || typeof window === 'undefined') return;

    let frame: number | null = null;
    const updateRect = () => {
      frame = null;
      const rect = slot.getBoundingClientRect();
      setComposerPortalRect((prev) => {
        const next = {
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          bottom: Math.max(0, Math.round(window.innerHeight - rect.bottom)),
        };
        if (
          prev
          && prev.left === next.left
          && prev.width === next.width
          && prev.bottom === next.bottom
        ) {
          return prev;
        }
        return next;
      });
    };
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(updateRect);
    };

    updateRect();
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(scheduleUpdate)
        : null;
    resizeObserver?.observe(slot);
    const pane = slot.closest('.pane');
    if (pane) resizeObserver?.observe(pane);
    window.addEventListener('resize', scheduleUpdate);
    window.visualViewport?.addEventListener('resize', scheduleUpdate);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      window.visualViewport?.removeEventListener('resize', scheduleUpdate);
    };
  }, [tab]);

  useLayoutEffect(() => {
    if (tab !== 'chat' || !composerPortalTarget || !composerPortalRect) return;
    const layer = composerLayerRef.current;
    if (!layer || typeof window === 'undefined') return;

    let frame: number | null = null;
    const updateHeight = () => {
      frame = null;
      const nextHeight = Math.ceil(layer.getBoundingClientRect().height);
      setComposerSlotHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(updateHeight);
    };

    updateHeight();
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(scheduleUpdate)
        : null;
    resizeObserver?.observe(layer);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
    };
  }, [composerPortalRect, composerPortalTarget, tab]);

  const composerNode = (
    <SharedChatComposer
      appearance="floating"
      codexVoiceEnabled={codexVoiceEnabled}
      codexVoiceStartRequested={codexVoiceStartRequested}
      compactPlusMenu={compactComposer}
      ref={composerRef}
      designSystemPicker={designSystemPicker}
      projectId={projectId}
      projectFiles={projectFiles}
      activeProjectFileName={activeProjectFileName}
      sessionMode={sessionMode}
      onSessionModeChange={onSessionModeChange}
      skills={skills}
      streaming={streaming}
      sendDisabled={sendDisabled}
      initialDraft={initialDraft}
      draftStorageKey={composerDraftStorageKey}
      draftStorageFallbackKey={projectId && activeConversationId ? `od:chat-composer:draft:${projectId}:${activeConversationId}` : undefined}
      onEnsureProject={onEnsureProject}
      commentAttachments={commentsToAttachments(attachedComments)}
      onRemoveCommentAttachment={onDetachComment}
      onSend={async (prompt, attachments, commentAttachments, meta): Promise<SharedChatSendOutcome> => {
        if (editingQueuedSendId && onUpdateQueuedSend) {
          const original = queuedItems.find((item) => item.id === editingQueuedSendId);
          const update: QueuedSendUpdate = {
            prompt,
            attachments,
            commentAttachments,
          };
          const nextMeta = meta ?? original?.meta;
          if (nextMeta !== undefined) update.meta = nextMeta;
          onUpdateQueuedSend(editingQueuedSendId, update);
          setEditingQueuedSendId(null);
          return;
        }
        const started = await onSend(prompt, attachments, commentAttachments, meta);
        return started === false && !meta?.queueOnly ? 'restore-draft' : undefined;
      }}
      onStop={onStop}
      onOpenSettings={onOpenSettings}
      onOpenMcpSettings={onOpenMcpSettings}
      onOpenBuilderHandoff={onOpenBuilderHandoff}
      onBrowsePlugins={onBrowsePlugins}
      onOpenConnectors={onOpenConnectors}
      petConfig={petConfig}
      onAdoptPet={onAdoptPet}
      onTogglePet={onTogglePet}
      onOpenPetSettings={onOpenPetSettings}
      researchAvailable={researchAvailable}
      projectMetadata={projectMetadata}
      onProjectMetadataChange={onProjectMetadataChange}
      activeWorkspaceContext={activeWorkspaceContext}
      workspaceContexts={workspaceContexts}
      byokApiProtocol={byokApiProtocol}
      byokImageModel={byokImageModel}
      onChangeByokImageModel={onChangeByokImageModel}
      byokVideoModel={byokVideoModel}
      onChangeByokVideoModel={onChangeByokVideoModel}
      byokSpeechModel={byokSpeechModel}
      onChangeByokSpeechModel={onChangeByokSpeechModel}
      byokSpeechVoice={byokSpeechVoice}
      onChangeByokSpeechVoice={onChangeByokSpeechVoice}
      currentSkillId={currentSkillId}
      onProjectSkillChange={onProjectSkillChange}
      mcpProvider={config?.mode === 'daemon' ? config.agentId ?? null : null}
      pinnedPluginId={activePluginSnapshot?.pluginId ?? null}
      footerAccessory={composerFooterAccessory}
      leadingAccessory={composerLeadingAccessory}
      currentDesignSystemId={currentDesignSystemId}
      onActiveDesignSystemChange={onActiveDesignSystemChange}
      onShowToast={onShowToast}
    />
  );
  // Pixflow-owned: keep the project workspace composer inside its slot so
  // layout, styling, and DOM inspection remain scoped to the ChatPane. The
  // body-level fixed portal is still available through SharedComposerDock for
  // floating surfaces, but the main project workspace should not leave an
  // empty `.chat-composer-slot` with the real composer mounted under <body>.
  const shouldPortalComposer = false;
  const composerSlotStyle: CSSProperties | undefined = shouldPortalComposer
    ? { minHeight: composerSlotHeight > 0 ? composerSlotHeight : undefined }
    : undefined;


  const emptyChatState = messages.length === 0 && !loading ? (
    <div className="chat-empty-wrap">
      {showImportedFolderArtifacts ? (
        <ImportedFolderArtifacts
          projectId={projectId}
          files={importedFolderArtifacts}
          onOpenFile={onRequestOpenFile}
          t={t}
        />
      ) : (
        <>
          <div className="chat-empty">
            <span className="chat-empty-title">
              {t('chat.startTitle')}
            </span>
          </div>
          {!compactComposer && <div className="chat-examples" role="list">
            {pickStarters(projectMetadata, t).map((ex, i) => (
              <button
                key={`${ex.title}-${i}`}
                type="button"
                role="listitem"
                className="chat-example"
                style={{ animationDelay: `${i * 70}ms` }}
                onClick={() => {
                  trackChatPanelClick(analytics.track, {
                    page_name: 'chat_panel',
                    area: 'chat_panel',
                    element: 'template_card',
                  });
                  composerRef.current?.setDraft(ex.prompt);
                }}
                title={t('chat.fillInputTitle')}
              >
                <span className="chat-example-icon" aria-hidden>
                  {ex.icon}
                </span>
                <span className="chat-example-body">
                  <span className="chat-example-head">
                    <span className="chat-example-title">{ex.title}</span>
                    <span className="chat-example-tag">{ex.tag}</span>
                  </span>
                  <span className="chat-example-prompt">{ex.prompt}</span>
                </span>
                <span className="chat-example-cta" aria-hidden>
                  ↵
                </span>
              </button>
            ))}
          </div>}
          {connectRepoNeeded ? (
            <div className="chat-connect-repo" role="note">
              <span className="chat-connect-repo-icon" aria-hidden>
                <Icon name="github" size={18} />
              </span>
              <span className="chat-connect-repo-body">
                <span className="chat-connect-repo-title">
                  {repoConnectCopy(githubConnected).cardTitle}
                </span>
                <span className="chat-connect-repo-text">
                  {repoConnectCopy(githubConnected).cardBody}
                </span>
              </span>
              <button
                type="button"
                className="primary-ghost"
                disabled={githubConnected === undefined}
                onClick={() => onConnectRepo?.()}
              >
                <Icon name="github" size={13} />
                {repoConnectCopy(githubConnected).buttonLabel}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  ) : null;

  const chatRowsNode = sharedPanelChat ? (
    <SharedChatRows
      messages={persistedMessages}
      paneStreaming={streaming}
      liveToolInput={liveToolInput}
      projectId={projectId}
      projectFiles={projectFiles}
      projectFileNames={projectFileNames}
      onOpenQuestions={request => setDirectQuestion(request?.form ? request : null)}
      assistantPropsForMessage={message => ({
        projectKind: projectKindForTracking,
        conversationId: activeConversationId,
        projectResolvedDir,
        onRequestOpenFile,
        onRequestPluginFolderAgentAction,
        activePluginActionPaths,
        hiddenPluginActionPaths,
        errorCardOwnerId,
        suppressDirectionForms: hasActiveDesignSystem,
        hasDesignSystemContext: hasActiveDesignSystem || !!activeDesignSystem,
        onContinueRemainingTasks: onContinueRemainingTasks ? todos => onContinueRemainingTasks(message, todos) : undefined,
        onForkFromMessage: onForkFromMessage ? () => onForkFromMessage(message) : undefined,
        forking: forkingMessageId === message.id,
        onFeedback: onAssistantFeedback ? change => onAssistantFeedback(message, change) : undefined,
        onArtifactShare,
        onToolboxAction: handleToolboxAction,
        onPickSkill: handlePickSkill,
        onArtifactDownload,
        nextStepSkills: skills,
        toolboxSkillNames: featuredToolboxSkillNames,
      })}
      t={t}
    />
  ) : (
    <ChatRows
      messages={messages}
      streaming={streaming}
      liveToolInput={liveToolInput}
      projectId={projectId}
      projectKindForTracking={projectKindForTracking}
      activeConversationId={activeConversationId}
      activeConversationKey={activeConversationId ?? 'no-conversation'}
      projectFiles={projectFiles}
      projectFileNames={projectFileNames}
      projectResolvedDir={projectResolvedDir}
      onRequestOpenFile={onRequestOpenFile}
      onRequestPluginDetails={onRequestPluginDetails}
      onRequestDesignSystemDetails={onRequestDesignSystemDetails}
      onRequestPluginFolderAgentAction={onRequestPluginFolderAgentAction}
      activePluginActionPaths={activePluginActionPaths}
      hiddenPluginActionPaths={hiddenPluginActionPaths}
      forceStreamingMessageIds={forceStreamingMessageIds}
      lastAssistantId={lastAssistantId}
      firstUserMessageId={firstUserMessageId}
      activePluginSnapshot={activePluginSnapshot}
      activeDesignSystem={activeDesignSystem}
      hasActiveDesignSystem={hasActiveDesignSystem}
      errorCardOwnerId={errorCardOwnerId}
      nextUserContentByAssistantId={nextUserContentByAssistantId}
      assistantCallbacksRef={assistantCallbacksRef}
      onContinueRemainingTasks={onContinueRemainingTasks}
      onArtifactShare={onArtifactShare}
      onToolboxAction={handleToolboxAction}
      onPickSkill={handlePickSkill}
      onArtifactDownload={onArtifactDownload}
      nextStepSkills={skills}
      toolboxSkillNames={featuredToolboxSkillNames}
      onForkFromMessage={onForkFromMessage}
      onAssistantFeedback={onAssistantFeedback}
      forkingMessageId={forkingMessageId}
      t={t}
      onOpenQuestions={onOpenQuestions}
    />
  );

  const chatErrorNode = displayError ? (
    <SharedRunFailureCard
      compact
      title={retryAssistant?.agentName
        ? translateUi("ui.chatPane.couldNotCompleteTheRequest", { value1: retryAssistant.agentName })
        : translateUi("ui.chatPane.theRequestCouldNotBeCompleted")}
      message={displayError}
      diagnostic={errorDiagnosticText}
      detailsLabel="Technical details"
      copyLabel={t('chat.copyErrorDiagnostic')}
      copiedLabel={t('chat.copyDone')}
      actions={showErrorActions || (retryAssistant && onRetry && runFailureUi) ? (
        <>
          {showByokRecoveryCta ? (
            <button
              type="button"
              className="chat-error-action"
              onClick={onSwitchToLocalCli}
            >
              {t('avatar.useLocal')}
            </button>
          ) : null}
          {retryAssistant && onRetry && runFailureUi ? (
            <>
              {runFailureUi.primaryAction === 'authorize' ? (
                <button
                  type="button"
                  className="chat-error-action"
                  onClick={() => {
                    recordAmrEntry(analytics.track, 'chat_error_authorize_retry');
                    if (onSwitchToAmrAndRetry) {
                      onSwitchToAmrAndRetry(retryAssistant);
                    } else {
                      onOpenAmrSettings?.();
                    }
                  }}
                >
                  {t('chat.amrError.authorizeCta')}
                </button>
              ) : runFailureUi.primaryAction === 'launch-terminal-auth' ? (
                <button
                  type="button"
                  className="chat-error-action"
                  onClick={() => {
                    onLaunchAntigravityOauth?.();
                  }}
                >
                  {t('chat.antigravityError.launchTerminalCta')}
                </button>
              ) : runFailureUi.primaryAction === 'launch-terminal-switch-model' ? (
                <button
                  type="button"
                  className="chat-error-action"
                  onClick={() => {
                    onLaunchAntigravityOauth?.();
                  }}
                >
                  {t('chat.antigravityError.launchSwitchModelCta')}
                </button>
              ) : runFailureUi.primaryAction === 'recharge' ? (
                <button
                  type="button"
                  className="chat-error-action"
                  onClick={() => {
                    const attribution = recordAmrEntry(
                      analytics.track,
                      'chat_error_recharge',
                    );
                    window.open(
                      attributedAmrUrl(amrRechargeUrlForProfile(amrProfile), attribution),
                      '_blank',
                      'noopener,noreferrer',
                    );
                  }}
                >
                  {t('chat.amrError.rechargeCta')}
                </button>
              ) : null}
              {canResumeFailedRun ? (
                <button
                  type="button"
                  className="ghost chat-error-retry"
                  onClick={() =>
                    onResumeRun
                      ? onResumeRun(retryAssistant)
                      : onSend(RESUME_CONTINUE_PROMPT, [], [])
                  }
                >
                  {t('chat.resumeRunCta')}
                </button>
              ) : runFailureUi.primaryAction === 'retry' || runFailureUi.secondaryRetry ? (
                <button
                  type="button"
                  className="ghost chat-error-retry"
                  onClick={() => onRetry(retryAssistant)}
                >
                  {t('promptTemplates.retry')}
                </button>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    />
  ) : null;

  const amrGuidanceNode = amrSwitchPayload ? (
    <AmrGuidance
      {...amrSwitchPayload}
      sourceDetail="chat_error_switch_retry_card"
      onActivate={() => {
        if (retryAssistant && onSwitchToAmrAndRetry) {
          onSwitchToAmrAndRetry(retryAssistant);
        } else {
          onOpenAmrSettings?.();
        }
      }}
    />
  ) : null;

  return (
    <div className="pane">
      <div className="chat-project-header">
        {onBack ? (
          <button
            type="button"
            className="chat-project-back"
            onClick={onBack}
            title={backLabel}
            aria-label={backLabel}
          >
            <Icon name="arrow-left" size={16} />
          </button>
        ) : null}
        {projectHeader ? (
          <span className="chat-project-header-title">{projectHeader}</span>
        ) : null}
        {headerActions}
      </div>
      {tab === 'chat' ? (
        <>
          <SharedMessageStream
            scrollSessionKey={activeConversationId}
            logRef={logRef}
            loading={loading}
            historyLoading={loading && messages.length === 0}
            emptyState={emptyChatState}
            historyControls={olderHistory ? <ChatHistoryControls hasMore loading={olderHistory.loading} error={olderHistory.error ? 'load' : null} retry={() => { void olderHistory.load(); }} loadEarlier={() => {
                  void olderHistory.load();
                }} /> : null}
            rows={<>
              {chatRowsNode}
              {historyPersistence ? <ChatTranscriptItem messageId="history-saving"><ChatHistoryControls hasMore={false} loading={false} error="save" loadEarlier={() => {}} retry={() => { void historyPersistence.retry(); }} conflict={historyPersistence.conflict} recover={historyPersistence.recover} recovering={historyPersistence.recovering} /></ChatTranscriptItem> : null}
            </>}
            errorNode={chatErrorNode}
            guidanceNode={amrGuidanceNode}
            scrollToLatestLabel={t('chat.scrollToLatest')}
            jumpToLatestLabel={t('chat.jumpToLatest')}
            t={t}
          />
          <QueuedSendStrip
            containerRef={queuedSendStripRef}
            items={queuedItems}
            editingId={editingQueuedSendId}
            onEdit={(item) => {
              trackMessageQueueClick(analytics.track, {
                page_name: 'chat_panel',
                area: 'message_queue',
                element: 'edit',
                project_id: projectId ?? '',
                queue_length: queuedItems.length,
              });
              restoreQueuedSendToComposer(item);
            }}
            onRemove={onRemoveQueuedSend
              ? (id) => {
                  trackMessageQueueClick(analytics.track, {
                    page_name: 'chat_panel',
                    area: 'message_queue',
                    element: 'delete',
                    project_id: projectId ?? '',
                    queue_length: queuedItems.length,
                  });
                  onRemoveQueuedSend(id);
                }
              : undefined}
            onReorder={onReorderQueuedSends}
            onSteer={streaming ? onSteerQueuedSend : undefined}
            onSendNow={!streaming && onSendQueuedNow
              ? (id) => {
                  trackMessageQueueClick(analytics.track, {
                    page_name: 'chat_panel',
                    area: 'message_queue',
                    element: 'send_now',
                    project_id: projectId ?? '',
                    queue_length: queuedItems.length,
                  });
                  onSendQueuedNow(id);
                }
              : undefined}
          />
          <SharedComposerDock
            composerNode={<>
              {activeQuestion ? <QuestionRequestCard
                form={activeQuestion.form}
                reopenToken={directQuestion}
                occurrenceKey={`${projectId}:${activeConversationId}:${activeQuestion.messageId}:${activeQuestion.form.id}`}
                disabled={streaming || sendDisabled}
                onSubmit={async text => {
                  if (streaming || sendDisabled) return false;
                  const outcome = await onSend(text, [], []);
                  return outcome !== false;
                }}
              /> : null}
              {composerNode}
            </>}
            shouldPortal={shouldPortalComposer}
            slotRef={composerSlotRef}
            slotStyle={composerSlotStyle}
            portalTarget={composerPortalTarget}
            portalRect={composerPortalRect}
            layerRef={composerLayerRef}
          />
        </>
      ) : null}
    </div>
  );
}

interface AssistantCallbacks {
  onContinueRemainingTasks:
    | ((assistantMessage: ChatMessage, todos: TodoItem[]) => void)
    | undefined;
  onAssistantFeedback:
    | ((message: ChatMessage, change: ChatMessageFeedbackChange) => void)
    | undefined;
  onArtifactShare: ((fileName: string) => void) | undefined;
  onForkFromMessage: ((message: ChatMessage) => void) | undefined;
}

type ChatRenderItem = {
  kind: 'message';
  key: string;
  message: ChatMessage;
};

function ChatRows({
  messages,
  streaming,
  liveToolInput,
  projectId,
  projectKindForTracking,
  activeConversationId,
  activeConversationKey,
  projectFiles,
  projectFileNames,
  projectResolvedDir,
  onRequestOpenFile,
  onRequestPluginDetails,
  onRequestDesignSystemDetails,
  onRequestPluginFolderAgentAction,
  activePluginActionPaths,
  hiddenPluginActionPaths,
  forceStreamingMessageIds,
  lastAssistantId,
  firstUserMessageId,
  activePluginSnapshot,
  activeDesignSystem,
  hasActiveDesignSystem,
  errorCardOwnerId,
  nextUserContentByAssistantId,
  assistantCallbacksRef,
  onContinueRemainingTasks,
  onArtifactShare,
  onToolboxAction,
  onPickSkill,
  onArtifactDownload,
  nextStepSkills,
  toolboxSkillNames,
  onForkFromMessage,
  onAssistantFeedback,
  forkingMessageId,
  t,
  onOpenQuestions,
}: {
  messages: ChatMessage[];
  streaming: boolean;
  liveToolInput?: Record<string, { name: string; text: string; seq?: number }>;
  projectId: string | null;
  projectKindForTracking: TrackingProjectKind | null;
  activeConversationId: string | null;
  activeConversationKey: string;
  projectFiles: ProjectFile[];
  projectFileNames?: Set<string>;
  projectResolvedDir?: string | null;
  onRequestOpenFile?: (name: string) => void;
  onRequestPluginDetails?: (pluginId: string) => void;
  onRequestDesignSystemDetails?: (system: DesignSystemSummary) => void;
  onRequestPluginFolderAgentAction?: (relativePath: string, action: PluginFolderAgentAction) => void;
  activePluginActionPaths?: Set<string>;
  hiddenPluginActionPaths?: Set<string>;
  forceStreamingMessageIds?: Set<string>;
  lastAssistantId: string | undefined;
  firstUserMessageId: string | undefined;
  activePluginSnapshot?: AppliedPluginSnapshot | null;
  activeDesignSystem?: DesignSystemSummary | null;
  hasActiveDesignSystem: boolean;
  errorCardOwnerId: string | null;
  nextUserContentByAssistantId: Map<string, string>;
  assistantCallbacksRef: MutableRefObject<AssistantCallbacks>;
  onContinueRemainingTasks?: (assistantMessage: ChatMessage, todos: TodoItem[]) => void;
  onArtifactShare?: (fileName: string) => void;
  onToolboxAction?: (
    id: DesignToolboxActionId,
  ) => void;
  onPickSkill?: (skillId: string) => void;
  onArtifactDownload?: (fileName: string) => void;
  nextStepSkills?: SkillSummary[];
  toolboxSkillNames?: Partial<Record<DesignToolboxActionId, string | null>>;
  onForkFromMessage?: (message: ChatMessage) => void;
  onAssistantFeedback?: (message: ChatMessage, change: ChatMessageFeedbackChange) => void;
  forkingMessageId?: string | null;
  t: TranslateFn;
  onOpenQuestions?: (request?: QuestionFormOpenRequest) => void;
}) {
  const conversationTodoInput = useMemo(
    () => latestTodoWriteInputForPinnedCard(messages),
    [messages],
  );
  const conversationTodoAnchorMessageId = useMemo(
    () => firstTodoWriteAssistantMessageId(messages),
    [messages],
  );
  const items = useMemo(
    () => buildChatRenderItems(messages),
    [messages],
  );
  const renderItem = (item: ChatRenderItem) => {
    const m = item.message;
    const messageStreaming = isAssistantMessageStreaming(
      m,
      streaming,
      lastAssistantId,
      forceStreamingMessageIds,
    );
    if (m.role === 'user') {
      return (
        <UserMessage
          message={m}
          projectId={m.historyOrigin?.projectId ?? projectId}
          projectFileNames={projectFileNames}
          onRequestOpenFile={onRequestOpenFile}
          onRequestPluginDetails={onRequestPluginDetails}
          onRequestDesignSystemDetails={onRequestDesignSystemDetails}
          t={t}
          activePluginSnapshot={
            m.id === firstUserMessageId
              ? activePluginSnapshot ?? null
              : null
          }
          activeDesignSystem={
            m.id === firstUserMessageId
              ? activeDesignSystem ?? null
              : null
          }
        />
      );
    }
    return (
      <AssistantMessage
        message={m}
        streaming={messageStreaming}
        // Only the streaming row consumes live tool input. Non-streaming rows
        // get a stable `undefined`, so adding `liveToolInput` to the memo
        // comparator re-renders just this row per `tool_input_delta`, not all N.
        liveToolInput={messageStreaming ? liveToolInput : undefined}
        showConversationTodoCard={m.id === conversationTodoAnchorMessageId}
        conversationTodoInput={conversationTodoInput}
        projectId={m.historyOrigin?.projectId ?? projectId}
        projectKind={projectKindForTracking}
        conversationId={activeConversationId}
        projectFiles={projectFiles}
        projectFileNames={projectFileNames}
        projectResolvedDir={projectResolvedDir}
        onRequestOpenFile={onRequestOpenFile}
        onRequestPluginFolderAgentAction={onRequestPluginFolderAgentAction}
        activePluginActionPaths={activePluginActionPaths}
        hiddenPluginActionPaths={hiddenPluginActionPaths}
        isLast={m.id === lastAssistantId}
        errorCardOwnerId={errorCardOwnerId}
        nextUserContent={nextUserContentByAssistantId.get(m.id)}
        suppressDirectionForms={hasActiveDesignSystem}
        hasDesignSystemContext={hasActiveDesignSystem || !!activeDesignSystem}
        onOpenQuestions={onOpenQuestions}
        onContinueRemainingTasks={
          m.id === lastAssistantId && onContinueRemainingTasks
            ? (todos) => assistantCallbacksRef.current.onContinueRemainingTasks?.(m, todos)
            : undefined
        }
        onForkFromMessage={
          onForkFromMessage
            ? () => assistantCallbacksRef.current.onForkFromMessage?.(m)
            : undefined
        }
        forking={forkingMessageId === m.id}
        onFeedback={
          onAssistantFeedback
            ? (rating) => assistantCallbacksRef.current.onAssistantFeedback?.(m, rating)
            : undefined
        }
        onArtifactShare={
          onArtifactShare
            ? (fileName) => assistantCallbacksRef.current.onArtifactShare?.(fileName)
            : undefined
        }
        onToolboxAction={onToolboxAction}
        onPickSkill={onPickSkill}
        onArtifactDownload={onArtifactDownload}
        nextStepSkills={nextStepSkills}
        toolboxSkillNames={toolboxSkillNames}
      />
    );
  };

  if (items.length === 0) return null;

  const lastUserId = [...messages].reverse().find(message => message.role === 'user')?.id;
  return <>{items.map(item => <ChatTranscriptItem key={item.key} messageId={item.message.id} data-message-role={item.message.role}
    scrollAnchor={item.message.role === 'user'} animateNew={item.message.id === lastUserId}>
    {renderItem(item)}
  </ChatTranscriptItem>)}</>;
}

function buildChatRenderItems(messages: ChatMessage[]): ChatRenderItem[] {
  const items: ChatRenderItem[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i]!;
    items.push({
      kind: 'message',
      key: `message:${message.id}`,
      message,
    });
  }
  return items;
}

function firstTodoWriteAssistantMessageId(messages: ChatMessage[]): string | null {
  const message = messages.find(
    (candidate) =>
      candidate.role === 'assistant' &&
      candidate.events?.some(
        (event) => event.kind === 'tool_use' && isTodoWriteToolName(event.name),
      ),
  );
  return message?.id ?? null;
}

function QueuedSendStrip({
  containerRef,
  editingId,
  items,
  onEdit,
  onRemove,
  onReorder,
  onSendNow,
  onSteer,
}: {
  containerRef?: MutableRefObject<HTMLDivElement | null>;
  editingId?: string | null;
  items: QueuedSendItem[];
  onEdit?: (item: QueuedSendItem) => void;
  onRemove?: (id: string) => void;
  onReorder?: (orderedIds: string[]) => void;
  onSendNow?: (id: string) => void;
  onSteer?: (id: string) => void;
}) {
  const t = useT();
  if (!items.length) return null;
  return <div ref={containerRef} className={queueLayout.slot} data-testid="chat-queued-send-strip">
    <ComposerQueue
      queue={{
        items: items.map(item => ({
          id: item.id,
          prompt: item.prompt.trim() || t('chat.queuedFollowUpFallback'),
          attachments: item.attachments ?? [],
          comments: item.commentAttachments ?? [],
          meta: item.meta,
          state: item.id === editingId ? 'editing' : item.dispatchState === 'sending' ? 'sending' : 'queued',
          ...(item.dispatchState === 'unconfirmed' ? { message: t('ui.finalQueue.unconfirmed') }
            : item.dispatchState === 'paused' ? { message: t('ui.finalQueue.startFailed') } : {}),
        })),
        error: '',
        paused: false,
        reorder: (id, targetId) => {
          const ids = items.map(item => item.id);
          const from = ids.indexOf(id), to = ids.indexOf(targetId);
          if (from < 0 || to < 0 || from === to) return;
          ids.splice(from, 1);
          ids.splice(to, 0, id);
          onReorder?.(ids);
        },
        remove: id => onRemove?.(id),
        resume: () => {},
        steer: item => onSteer?.(item.id),
      }}
      canSteer={!!onSteer}
      canReorder={Boolean(onReorder)}
      canRemove={Boolean(onRemove)}
      canEdit={Boolean(onEdit)}
      onSendNow={onSendNow}
      onEdit={row => { const original = items.find(item => item.id === row.id); if (original) onEdit?.(original); }}
    />
  </div>;
}

function CommentsPanel({
  comments,
  attachedComments,
  onAttach,
  onDetach,
  onDelete,
  t,
}: {
  comments: PreviewComment[];
  attachedComments: PreviewComment[];
  onAttach?: (comment: PreviewComment) => void;
  onDetach?: (commentId: string) => void;
  onDelete?: (commentId: string) => void;
  t: TranslateFn;
}) {
  const attachedIds = new Set(attachedComments.map((comment) => comment.id));
  const saved = comments.filter((comment) => !attachedIds.has(comment.id));
  return (
    <div className="comments-panel" data-testid="comments-panel">
      <CommentSection
        title={t('chat.comments.attached')}
        empty={t('chat.comments.emptyAttached')}
        comments={attachedComments}
        actionLabel={t('chat.comments.remove')}
        onAction={(comment) => onDetach?.(comment.id)}
        attached
      />
      <CommentSection
        title={t('chat.comments.saved')}
        empty={t('chat.comments.emptySaved')}
        comments={saved}
        actionLabel={t('chat.comments.add')}
        onAction={(comment) => onAttach?.(comment)}
        secondaryActionLabel={t('chat.comments.remove')}
        onSecondaryAction={(comment) => onDelete?.(comment.id)}
      />
      {saved.length > 0 ? (
        <div className="comments-footer">
          <button
            type="button"
            className="primary"
            onClick={() => saved.forEach((comment) => onAttach?.(comment))}
          >
            {t('chat.comments.addAll')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CommentSection({
  title,
  empty,
  comments,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  attached,
}: {
  title: string;
  empty: string;
  comments: PreviewComment[];
  actionLabel: string;
  onAction: (comment: PreviewComment) => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: (comment: PreviewComment) => void;
  attached?: boolean;
}) {
  return (
    <section className="comments-section">
      <h3>{title}</h3>
      {comments.length === 0 ? (
        <p className="comments-empty">{empty}</p>
      ) : (
        comments.map((comment) => (
          <article
            key={comment.id}
            className={`comment-card${attached ? ' attached' : ''}`}
            data-testid={`comment-card-${comment.elementId}`}
          >
            <div className="comment-card-top">
              <strong>{commentTargetDisplayName(comment)}</strong>
              <div className="comment-card-actions">
                {secondaryActionLabel && onSecondaryAction ? (
                  <button
                    type="button"
                    className="comment-card-action danger"
                    onClick={() => onSecondaryAction(comment)}
                  >
                    {secondaryActionLabel}
                  </button>
                ) : null}
                <button type="button" className="comment-card-action" onClick={() => onAction(comment)}>
                  {actionLabel}
                </button>
              </div>
            </div>
            <p>{comment.note}</p>
            <div className="comment-card-meta">
              <span>{comment.id}</span>
              <span>{comment.filePath}</span>
              <span>{commentTargetDisplayName(comment)}</span>
              <span>{simplePositionLabel(comment.position)}</span>
            </div>
          </article>
        ))
      )}
    </section>
  );
}

function isActiveRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'queued' || status === 'running';
}

function isTerminalRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

export function retryableAssistantMessage(
  messages: ChatMessage[],
  lastAssistantId: string | null | undefined,
  paneStreaming: boolean,
): ChatMessage | null {
  if (paneStreaming) return null;
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return null;
  if (last.id !== lastAssistantId) return null;
  return isRetryableAssistantTerminalFailure(last) ? last : null;
}

export function isAssistantMessageStreaming(
  message: ChatMessage,
  paneStreaming: boolean,
  lastAssistantId: string | null | undefined,
  forceStreamingMessageIds?: Set<string>,
): boolean {
  if (message.role !== 'assistant') return false;
  if (forceStreamingMessageIds?.has(message.id)) return true;
  if (isActiveRunStatus(message.runStatus)) return true;
  if (message.id !== lastAssistantId) return false;
  if (!paneStreaming) return false;
  if (message.endedAt !== undefined) return false;
  if (isTerminalRunStatus(message.runStatus)) return false;
  return true;
}

export function buildRunErrorDiagnosticText(input: RunErrorDiagnosticInput): string {
  const lines = [
    'Pixflow Design run error diagnostics',
    `trace_id: ${input.traceId ?? 'n/a'}`,
    `run_id: ${input.traceId ?? 'n/a'}`,
    `error_code: ${input.errorCode ?? 'n/a'}`,
    `project_id: ${input.projectId ?? 'n/a'}`,
    `conversation_id: ${input.conversationId ?? 'n/a'}`,
    `assistant_message_id: ${input.assistantMessageId ?? 'n/a'}`,
    `agent_id: ${input.agentId ?? 'n/a'}`,
    '',
    'error:',
    input.message.trim(),
  ];

  const raw = input.rawMessage?.trim();
  if (raw && raw !== input.message.trim()) {
    lines.push('', 'raw_error:', raw);
  }

  return lines.join('\n');
}

// Memoized (hoisted impl referenced below): a static user message has stable
// props, so it skips re-render while a later turn streams.
const UserMessage = memo(UserMessageImpl);

function UserMessageImpl({
  message,
  projectId,
  projectFileNames,
  onRequestOpenFile,
  onRequestPluginDetails,
  onRequestDesignSystemDetails,
  t,
  activePluginSnapshot,
  activeDesignSystem,
}: {
  message: ChatMessage;
  projectId: string | null;
  projectFileNames?: Set<string>;
  onRequestOpenFile?: (name: string) => void;
  onRequestPluginDetails?: (pluginId: string) => void;
  onRequestDesignSystemDetails?: (system: DesignSystemSummary) => void;
  t: TranslateFn;
  activePluginSnapshot?: AppliedPluginSnapshot | null;
  activeDesignSystem?: DesignSystemSummary | null;
}) {
  const translateUi = usePixflowUiTranslation();
  const attachments = sortChatAttachmentsForDisplay(message.attachments ?? []);
  const commentAttachments = message.commentAttachments ?? [];
  const workspaceItems = message.runContext?.workspaceItems ?? [];
  const messagePluginSnapshot = message.appliedPluginSnapshot ?? activePluginSnapshot ?? null;
  const hasRunContext = Boolean(
    message.sessionMode ||
      workspaceItems.length > 0 ||
      messagePluginSnapshot ||
      activeDesignSystem,
  );
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  async function handleCopy() {
    if (!message.content) return;
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    const ok = await copyToClipboard(message.content);
    if (!ok) return;
    setCopied(true);
    copyTimerRef.current = setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = undefined;
    }, 2000);
  }

  const isDesignSystemWorkspaceRequest = isDesignSystemWorkspacePrompt(message.content);
  const ts = messageTime(message);

  return (
    <Message className="msg user" align="end">
      <MessageHeader className="role">
        <span>{t('chat.you')}</span>
      </MessageHeader>
      {hasRunContext ? (
        <div className="msg-run-context-row" data-testid="msg-run-context-row">
          {message.sessionMode ? (
            <MessageSessionModeChip mode={message.sessionMode} t={t} />
          ) : null}
          {workspaceItems.map((item) => (
            <ActiveWorkspaceContextChip
              key={`${item.kind}:${item.id}`}
              item={item}
              onOpen={onRequestOpenFile}
            />
          ))}
          {messagePluginSnapshot ? (
            <ActivePluginChip
              snapshot={messagePluginSnapshot}
              t={t}
              onOpenDetails={onRequestPluginDetails}
            />
          ) : null}
          {activeDesignSystem ? (
            <ActiveDesignSystemChip
              system={activeDesignSystem}
              onOpenDetails={onRequestDesignSystemDetails}
            />
          ) : null}
        </div>
      ) : null}
      {attachments.length > 0 ? (
        <div className="user-attachments">
          {attachments.map((a, index) => {
            const baseName = a.path.split('/').pop() || a.path;
            const openable =
              !!onRequestOpenFile &&
              (projectFileNames ? projectFileNames.has(baseName) : true);
            const handleOpen = openable
              ? () => onRequestOpenFile?.(baseName)
              : undefined;
            return (
              <button
                type="button"
                key={a.path}
                className={`user-attachment staged-${a.kind}${openable ? ' openable' : ''}`}
                onClick={handleOpen}
                disabled={!openable}
                title={openable ? t('chat.openFile', { name: baseName }) : a.path}
              >
                <span className="staged-order" aria-label={translateUi("ui.chatComposer.attachment", { value1: index + 1 })}>
                  {index + 1}
                </span>
                {a.kind === 'image' && projectId ? (
                  <img src={projectRawUrl(projectId, a.path)} alt={a.name} />
                ) : (
                  <Icon name="file" size={14} />
                )}
                <span className="staged-name">{a.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {commentAttachments.some((attachment) => attachment.selectionKind !== 'visual') ? (
        <div className="user-attachments comment-history-attachments">
          {commentAttachments.filter((attachment) => attachment.selectionKind !== 'visual').map((a) => (
            <span key={a.id} className="user-attachment staged-comment">
              <span className="staged-name" title={a.comment ? `${commentTargetDisplayName(a)}: ${a.comment}` : commentTargetDisplayName(a)}>
                <strong>{commentTargetDisplayName(a)}</strong>
                {a.comment ? <span>{a.comment}</span> : null}
              </span>
            </span>
          ))}
        </div>
      ) : null}
      {message.content && isDesignSystemWorkspaceRequest ? (
        <MessageContent className="user-text-wrap user-status-wrap">
          <div className="user-status-card design-system-generation-status">
            <span className="user-status-card__icon">
              <Icon name="blocks" size={15} />
            </span>
            <span className="user-status-card__copy">
              <strong>{DESIGN_SYSTEM_WORKSPACE_DISPLAY_TITLE}</strong>
              <span>{DESIGN_SYSTEM_WORKSPACE_DISPLAY_DESCRIPTION}</span>
            </span>
          </div>
        </MessageContent>
      ) : message.content ? (
        <MessageContent className="user-text-wrap">
          <Bubble align="end"><BubbleContent className="user-text user-bubble"><PageAnnotationMessage content={message.content} skillMentions={message.runContext?.skillMentions} /></BubbleContent></Bubble>
          <MessageFooter className="user-actions">
            {ts ? (
              <time
                className="user-actions-time"
                dateTime={new Date(ts).toISOString()}
                title={exactDateTime(ts)}
              >
                {shortTime(ts)}
              </time>
            ) : null}
            <button
              type="button"
              className="ghost user-copy-btn"
              onClick={handleCopy}
              aria-label={copied ? t('chat.copyDone') : t('chat.copyPrompt')}
              title={copied ? t('chat.copyDone') : t('chat.copyPrompt')}
            >
              <Icon name={copied ? 'check' : 'copy'} size={13} />
            </button>
          </MessageFooter>
        </MessageContent>
      ) : null}
    </Message>
  );
}

// Context chip rendered above a user message when the project pinned a
// plugin at create time (PluginLoopHome on Home). Replaces the noisy
// in-composer plugin rail so the user is not re-prompted to pick
// something they already chose; instead the active plugin lives inside
// the run message it kicked off.
function ActivePluginChip({
  snapshot,
  t: _t,
  onOpenDetails,
}: {
  snapshot: AppliedPluginSnapshot;
  t: TranslateFn;
  onOpenDetails?: (pluginId: string) => void;
}) {
  const translateUi = usePixflowUiTranslation();
  const title = snapshot.pluginTitle ?? snapshot.pluginId;
  const version = snapshot.pluginVersion;
  const taskKind = snapshot.taskKind;
  const content = (
    <>
      <span className="msg-plugin-chip__dot" aria-hidden />
      <span className="msg-plugin-chip__label">
        <span className="msg-plugin-chip__kind">{translateUi("chat.designToolbox.kind.plugin")}</span>
        <span className="msg-plugin-chip__title">{title}</span>
        {version ? (
          <span className="msg-plugin-chip__version">@{version}</span>
        ) : null}
      </span>
      {taskKind ? (
        <span className="msg-plugin-chip__task">{taskKind}</span>
      ) : null}
    </>
  );
  // One clean chip per message — the plugin's full resolved context still
  // rides the run via the persisted snapshot; we no longer fan it out into
  // per-category (design-system / asset / skill) chips here.
  return (
    <div className="msg-plugin-context" data-testid="msg-plugin-context">
      {onOpenDetails ? (
        <button
          type="button"
          className="msg-plugin-chip msg-plugin-chip--action"
          data-testid="msg-plugin-chip"
          title={title}
          onClick={() => onOpenDetails(snapshot.pluginId)}
        >
          {content}
        </button>
      ) : (
        <div className="msg-plugin-chip" data-testid="msg-plugin-chip">
          {content}
        </div>
      )}
    </div>
  );
}

function MessageSessionModeChip({
  mode,
  t,
}: {
  mode: ChatSessionMode;
  t: TranslateFn;
}) {
  const label = mode === 'chat'
    ? t('chat.mode.chat.label')
    : mode === 'plan'
      ? t('chat.mode.plan.label')
      : t('chat.mode.design.label');
  return (
    <div
      className={`msg-mode-chip msg-mode-chip--${mode}`}
      data-testid="msg-session-mode-chip"
      title={label}
    >
      <Icon name={mode === 'chat' ? 'comment' : mode === 'plan' ? 'file' : 'sparkles'} size={12} />
      <span>{label}</span>
    </div>
  );
}

function ActiveDesignSystemChip({
  system,
  onOpenDetails,
}: {
  system: DesignSystemSummary;
  onOpenDetails?: (system: DesignSystemSummary) => void;
}) {
  const translateUi = usePixflowUiTranslation();
  const content = (
    <>
      <span className="msg-plugin-chip__dot" aria-hidden />
      <span className="msg-plugin-chip__label">
        <span className="msg-plugin-chip__kind">{translateUi("ui.chatPane.designSystem")}</span>
        <span className="msg-plugin-chip__title">{system.title}</span>
      </span>
      {system.category ? (
        <span className="msg-plugin-chip__task">{system.category}</span>
      ) : null}
    </>
  );
  if (!onOpenDetails) {
    return (
      <div className="msg-plugin-chip msg-plugin-chip--design-system" data-testid="msg-design-system-chip">
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="msg-plugin-chip msg-plugin-chip--design-system msg-plugin-chip--action"
      data-testid="msg-design-system-chip"
      title={system.title}
      onClick={() => onOpenDetails(system)}
    >
      {content}
    </button>
  );
}

const WORKSPACE_DESIGN_FILES_TAB = '__design_files__';
const WORKSPACE_DESIGN_SYSTEM_TAB = '__design_system__';

function ActiveWorkspaceContextChip({
  item,
  onOpen,
}: {
  item: WorkspaceContextItem;
  onOpen?: (name: string) => void;
}) {
  const translateUi = usePixflowUiTranslation();
  const target = workspaceContextOpenTarget(item);
  const content = (
    <>
      <span className="msg-plugin-chip__icon" aria-hidden>
        <Icon name={workspaceContextIcon(item)} size={12} />
      </span>
      <span className="msg-plugin-chip__label">
        <span className="msg-plugin-chip__kind">{translateUi("ui.chatPane.current")}</span>
        <span className="msg-plugin-chip__title">{item.label}</span>
      </span>
    </>
  );
  if (!target || !onOpen) {
    return (
      <div
        className={`msg-plugin-chip msg-plugin-chip--workspace msg-plugin-chip--workspace-${item.kind}`}
        data-testid="msg-workspace-context-chip"
        title={workspaceContextTitle(item)}
      >
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`msg-plugin-chip msg-plugin-chip--workspace msg-plugin-chip--workspace-${item.kind} msg-plugin-chip--action`}
      data-testid="msg-workspace-context-chip"
      title={workspaceContextTitle(item)}
      onClick={() => onOpen(target)}
    >
      {content}
    </button>
  );
}

function workspaceContextOpenTarget(item: WorkspaceContextItem): string | null {
  if (item.tabId) return item.tabId;
  if (item.kind === 'design-files') return WORKSPACE_DESIGN_FILES_TAB;
  if (item.kind === 'design-system') return WORKSPACE_DESIGN_SYSTEM_TAB;
  if (item.kind === 'file' || item.kind === 'live-artifact') {
    return item.path ?? item.label;
  }
  return null;
}

function workspaceContextIcon(item: WorkspaceContextItem): IconName {
  if (item.kind === 'browser') return 'globe';
  if (item.kind === 'folder' || item.kind === 'design-files') return 'folder';
  if (item.kind === 'terminal') return 'terminal';
  if (item.kind === 'side-chat') return 'comment';
  if (item.kind === 'design-system') return 'blocks';
  if (item.kind === 'sitemap-brief') return 'sparkles';
  if (item.kind === 'sitemap-page') return 'file';
  return 'file';
}

function workspaceContextTitle(item: WorkspaceContextItem): string {
  return [
    workspaceContextKindLabel(item.kind),
    item.path ? `path: ${item.path}` : null,
    item.absolutePath ? `absolute: ${item.absolutePath}` : null,
    item.url ? `url: ${item.url}` : null,
    item.title ? `title: ${item.title}` : null,
  ].filter(Boolean).join(' | ');
}

function workspaceContextKindLabel(kind: WorkspaceContextItem['kind']): string {
  switch (kind) {
    case 'browser':
      return 'Browser';
    case 'design-files':
      return 'Design files';
    case 'design-system':
      return 'Design system';
    case 'folder':
      return 'Folder';
    case 'terminal':
      return 'Terminal';
    case 'side-chat':
      return 'Side chat';
    case 'live-artifact':
      return 'Live artifact';
    case 'sitemap-brief':
      return 'Brief';
    case 'sitemap-page':
      return 'Page';
    case 'file':
    default:
      return 'File';
  }
}

function sortChatAttachmentsForDisplay(attachments: ChatAttachment[]): ChatAttachment[] {
  return attachments
    .map((attachment, index) => ({ attachment, index }))
    .sort((a, b) => {
      const aOrder = typeof a.attachment.order === 'number' && Number.isFinite(a.attachment.order)
        ? a.attachment.order
        : a.index;
      const bOrder = typeof b.attachment.order === 'number' && Number.isFinite(b.attachment.order)
        ? b.attachment.order
        : b.index;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map((entry) => entry.attachment);
}

function relTime(ts: number, t: TranslateFn): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return t('common.now');
  if (diff < hr) return t('common.minutesShort', { n: Math.floor(diff / min) });
  if (diff < day) return t('common.hoursShort', { n: Math.floor(diff / hr) });
  if (diff < 7 * day) return t('common.daysShort', { n: Math.floor(diff / day) });
  return new Date(ts).toLocaleDateString();
}

export function conversationMetaLabel(
  conversation: Conversation,
  t: TranslateFn,
): string {
  const latestRun = conversation.latestRun;
  if (
    latestRun &&
    (latestRun.status === 'succeeded' ||
      latestRun.status === 'failed' ||
      latestRun.status === 'canceled') &&
    typeof conversation.totalDurationMs === 'number' &&
    Number.isFinite(conversation.totalDurationMs)
  ) {
    return formatDurationShort(conversation.totalDurationMs);
  }
  if (
    latestRun &&
    (latestRun.status === 'succeeded' ||
      latestRun.status === 'failed' ||
      latestRun.status === 'canceled') &&
    typeof latestRun.durationMs === 'number' &&
    Number.isFinite(latestRun.durationMs)
  ) {
    return formatDurationShort(latestRun.durationMs);
  }
  return relTime(conversation.updatedAt, t);
}

function formatDurationShort(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s - m * 60);
  return `${m}m ${rem.toString().padStart(2, '0')}s`;
}
