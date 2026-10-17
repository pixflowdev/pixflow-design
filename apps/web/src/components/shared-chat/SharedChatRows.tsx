import { PageAnnotationMessage } from '../PageAnnotationMessage';
import { questionAnswerDisplayText } from '../../artifacts/question-form';
// Pixflow-owned: canonical rows for the floating panels and WordPress Workspace.
// Host callbacks extend file actions without forking message/activity rendering.
import { memo, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import type { ChatAttachment, ChatCommentAttachment, ChatMessage, ProjectFile } from '../../types';
import type { Dict } from '../../i18n/types';
import type { ChatSessionMode } from '@open-design/contracts';
import { copyToClipboard } from '../../lib/copy-to-clipboard';
import { exactDateTime, messageTime, shortTime } from '../../utils/chatTime';
import { Icon } from '../Icon';
import { AssistantMessage, type QuestionFormOpenRequest } from '../AssistantMessage';
import { latestTodoWriteInputForPinnedCard, parseTodoWriteInput, type TodoItem } from '../../runtime/todos';
import { sanitizeAgentAssistantEvents } from '../../pixflow/agent-activity-lifecycle';
import styles from './SharedChatRows.module.css';
import { expandSteeringMessages } from '../../pixflow/steering-messages';
import { expandVoiceMessages } from '../../pixflow/voice-messages';
import { hasPixflowWordPressContext } from '../../pixflow/wordpress-context';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;
const EMPTY_PROJECT_FILES: ProjectFile[] = [];

export type SharedChatInputMessage = {
  historyOrigin?: ChatMessage['historyOrigin'];
  id?: string;
  role?: string;
  content?: string;
  status?: string;
  createdAt?: number;
  startedAt?: number;
  endedAt?: number;
  agentId?: string;
  agentName?: string;
  sessionMode?: ChatSessionMode;
  attachments?: ChatAttachment[];
  commentAttachments?: ChatCommentAttachment[];
  runStatus?: string;
  awaitingInput?: boolean;
  events?: unknown[];
  clarificationKind?: string;
};

export type SharedChatAgentIdentity = {
  agentId?: string;
  agentName?: string;
};

function hasSubstantiveAssistantResponse(message: ChatMessage): boolean {
  const content = String(message.content || '').trim();
  if (content && content !== 'Understanding what you want me to do…') return true;
  return (message.events || []).some((event) => (
    event?.kind === 'text'
    && String(event.text || '').trim()
    && String(event.text || '').trim() !== 'Understanding what you want me to do…'
  ));
}

export function SharedChatRows({
  messages,
  fallbackAgentIdentity,
  liveToolInput,
  paneStreaming = false,
  projectId = null,
  projectFiles = EMPTY_PROJECT_FILES,
  projectFileNames,
  onContinueRemainingTasks,
  onOpenQuestions,
  footerActionForMessage,
  assistantPropsForMessage,
  t,
}: {
  messages: SharedChatInputMessage[];
  fallbackAgentIdentity?: SharedChatAgentIdentity;
  liveToolInput?: Record<string, { name: string; text: string; seq?: number }>;
  // The host run lifecycle is authoritative while the panel is waiting for
  // the provider or for a media/mutation handoff to settle. This mirrors the
  // main workspace ChatPane's pane-level streaming flag and prevents a
  // transient empty transport error from becoming a stopped footer.
  paneStreaming?: boolean;
  projectId?: string | null;
  projectFiles?: ProjectFile[];
  projectFileNames?: Set<string>;
  onContinueRemainingTasks?: (message: SharedChatInputMessage, todos: TodoItem[]) => void;
  onOpenQuestions?: (request?: QuestionFormOpenRequest) => void;
  footerActionForMessage?: (message: SharedChatInputMessage) => ReactNode;
  assistantPropsForMessage?: (message: ChatMessage) => Partial<ComponentProps<typeof AssistantMessage>>;
  t: TranslateFn;
}) {
  // Message state is immutable across the shared hosts. Preserve row identities
  // while a different turn streams, so AssistantMessage's memo can skip old
  // markdown/tool rendering. Weak keys release unloaded history automatically.
  const normalizedCache = useRef(new WeakMap<SharedChatInputMessage, {
    index: number; agentId?: string; agentName?: string; rows: ChatMessage[];
  }>());
  const semanticPreflightPendingIds = new Set(messages
    .filter((message) => (
      message.clarificationKind === 'semantic_preflight_pending'
      || String(message.id || '').startsWith('semantic-preflight-assistant:')
      || String(message.id || '').startsWith('semantic-preflight-external:')
      || String(message.content || '').trim() === 'Understanding what you want me to do…'
    ))
    .map((message, index) => message.id || `shared-chat-assistant-${index}`));
  const normalized = messages.flatMap((message, index) => {
    const cached = normalizedCache.current.get(message);
    if (cached && (message.id || cached.index === index)
      && cached.agentId === fallbackAgentIdentity?.agentId
      && cached.agentName === fallbackAgentIdentity?.agentName) return cached.rows;
    const id = message.id || `shared-chat-assistant-${index}`;
    const isSemanticPreflight = semanticPreflightPendingIds.has(id);
    const safeMessage = isSemanticPreflight
      ? normalizeSharedSemanticPreflightMessage(message, id)
      : message;
    const rows = expandVoiceMessages(expandSteeringMessages([
      normalizeSharedChatMessage(safeMessage, index, fallbackAgentIdentity),
    ]));
    normalizedCache.current.set(message, { index, agentId: fallbackAgentIdentity?.agentId,
      agentName: fallbackAgentIdentity?.agentName, rows });
    return rows;
  });
  const nextUserContentByAssistantId = new Map<string, string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const message = normalized[index]!;
    const nextMessage = normalized[index + 1]!;
    if (message.role === 'assistant' && nextMessage.role === 'user') {
      nextUserContentByAssistantId.set(message.id, nextMessage.content);
    }
  }
  const lastAssistantId = [...normalized].reverse().find((message) => message.role === 'assistant')?.id;
  // Pixflow-owned: mirror ChatPane's canonical TodoWrite handling so the
  // Bricks Agent panel shows one task card instead of stripping all TODOs from
  // assistant rows.
  const conversationTodoInput = latestTodoWriteInputForPinnedCard(normalized);
  const todoOwnerAssistantId = firstTodoWriteAssistantMessageId(normalized);
  // Cancellation ends that work scope. Keep its historical task card, but do
  // not label a later answer unfinished unless the agent starts a new plan.
  let lastCanceledIndex = -1;
  normalized.forEach((message, index) => { if (message.runStatus === 'canceled') lastCanceledIndex = index; });
  const activeTodoInput = lastCanceledIndex >= 0
    ? latestTodoWriteInputForPinnedCard(normalized.slice(lastCanceledIndex + 1))
    : conversationTodoInput;
  const conversationUnfinishedTodos = parseTodoWriteInput(activeTodoInput)
    .filter((todo) => todo.status !== 'completed');

  return (
    <>
      {normalized.map((message) => {
        const isLastAssistant = message.role === 'assistant' && message.id === lastAssistantId;
        // The host owns the run lifecycle. A Bricks media/mutation handoff can
        // outlive the runner's last stream event, so its message may already
        // look terminal (including an empty transport error) while the host
        // is still preparing the provider result. Keep that active turn on the
        // same live clock/status path as the main workspace until the host
        // explicitly drops paneStreaming.
        const terminalWithoutDeliveredResponse = isLastAssistant
          && message.runStatus !== 'failed'
          && message.runStatus !== 'canceled'
          && Boolean(message.endedAt || message.runStatus === 'succeeded')
          // Voice can end successfully without any spoken or written answer.
          // Its terminal acknowledgement is authoritative, even for a quiet call.
          && !message.events?.some(event => event.kind === 'status' && event.code === 'voice_connection')
          && !hasSubstantiveAssistantResponse(message);
        const keepTransientTurnWorking = isLastAssistant && message.runStatus !== 'canceled' && (
          paneStreaming || terminalWithoutDeliveredResponse
        );
        const renderedMessage = keepTransientTurnWorking
          ? {
              ...message,
              runStatus: 'running' as ChatMessage['runStatus'],
              endedAt: undefined,
            }
          : message;
        const streaming = isLastAssistant && message.runStatus !== 'canceled' && (
          keepTransientTurnWorking
          || !renderedMessage.endedAt
        );
        if (message.role === 'user') {
          return (
            <SharedUserMessage
              key={message.id}
              message={message}
              t={t}
            />
          );
        }

        const semanticPreflightPending = semanticPreflightPendingIds.has(message.id) && streaming;
        return (
          <div
            key={semanticPreflightPending ? 'semantic-preflight-pending' : renderedMessage.id}
            className={semanticPreflightPending ? styles.semanticPreflightPending : undefined}
            data-semantic-preflight={semanticPreflightPending ? 'pending' : undefined}
          >
            <AssistantMessage
              message={renderedMessage}
              streaming={streaming}
              projectFiles={projectFiles}
              projectFileNames={projectFileNames}
              isLast={renderedMessage.id === lastAssistantId}
              liveToolInput={streaming ? liveToolInput : undefined}
              showConversationTodoCard={renderedMessage.id === todoOwnerAssistantId}
              conversationTodoInput={renderedMessage.id === todoOwnerAssistantId ? conversationTodoInput : null}
              conversationUnfinishedTodos={renderedMessage.id === lastAssistantId ? conversationUnfinishedTodos : null}
              onContinueRemainingTasks={(todos) => onContinueRemainingTasks?.(renderedMessage, todos)}
              onOpenQuestions={onOpenQuestions}
              footerAction={footerActionForMessage?.(message)}
              nextUserContent={nextUserContentByAssistantId.get(renderedMessage.id)}
              hasDesignSystemContext={false}
              {...assistantPropsForMessage?.(renderedMessage)}
              projectId={renderedMessage.historyOrigin?.projectId ?? projectId}
            />
          </div>
        );
      })}
    </>
  );
}

function normalizeSharedSemanticPreflightMessage(
  message: SharedChatInputMessage,
  id: string,
): SharedChatInputMessage {
  const content = String(message.content || '').trim();
  const placeholderOnly = content === 'Understanding what you want me to do…';
  const streaming = message.status === 'streaming'
    || message.runStatus === 'running'
    || message.runStatus === 'queued';
  let events = sanitizeAgentAssistantEvents(
    Array.isArray(message.events) ? message.events : [],
    placeholderOnly ? '' : content,
  );

  // Older Bricks-hosted sessions could persist the preflight placeholder
  // before the activity event reached the parent shell. Render that legacy
  // state through the same activity card as WP Admin instead of falling back
  // to an unstyled prose spinner.
  if (!events.some((event) => (
    event && typeof event === 'object' && !Array.isArray(event)
    && (event as { kind?: unknown }).kind === 'activity'
  ))) {
    const failed = message.status === 'error' || message.runStatus === 'failed';
    events = [{
      kind: 'activity',
      id: `${id}:preparing`,
      origin: 'pixflow',
      phase: 'preparing',
      status: streaming ? 'started' : failed ? 'failed' : 'succeeded',
      label: failed ? 'Request could not be prepared' : 'Request understood',
      startedAt: Number(message.startedAt || message.createdAt || Date.now()),
      ...(!streaming ? { endedAt: Number(message.endedAt || Date.now()) } : {}),
    }, ...events];
  }

  return {
    ...message,
    content: placeholderOnly ? '' : message.content,
    events,
  };
}

function firstTodoWriteAssistantMessageId(messages: ChatMessage[]): string | null {
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    if (!message.events?.some((event) => event.kind === 'tool_use' && (
      event.name === 'TodoWrite' ||
      event.name === 'todowrite' ||
      event.name === 'todo_write' ||
      event.name === 'update_plan'
    ))) continue;
    return message.id;
  }
  return null;
}

export function normalizeSharedChatMessage(
  message: SharedChatInputMessage,
  index: number,
  fallbackAgentIdentity?: SharedChatAgentIdentity,
): ChatMessage {
  const role = message.role === 'user' ? 'user' : 'assistant';
  const createdAt = Number(message.createdAt || Date.now());
  const explicitRunStatus = String(message.runStatus || '').toLowerCase();
  const terminal = ['succeeded', 'failed', 'canceled'].includes(explicitRunStatus);
  const streaming = !terminal && (message.status === 'streaming'
    || explicitRunStatus === 'queued'
    || explicitRunStatus === 'running');
  const runStatus = terminal ? explicitRunStatus : streaming
    ? 'running'
    : message.status === 'error'
      ? 'failed'
      : String(message.runStatus || 'succeeded');
  const canUseLiveFallback = role === 'assistant'
    && streaming
    && (!message.agentId || message.agentId === fallbackAgentIdentity?.agentId);

  return {
    ...message,
    id: message.id || `shared-chat-${role}-${index}`,
    role,
    content: message.content || '',
    createdAt,
    startedAt: Number(message.startedAt || createdAt),
    endedAt: streaming ? undefined : Number(message.endedAt || Date.now()),
    // A provider selection is live UI state, not historical message data.
    // Use it only for an actively streaming synthetic row that has not yet
    // received canonical metadata. Completed rows remain bound to their
    // stored identity (or neutral when legacy data has no identity), and a
    // stored agent id must never borrow another provider's current name.
    agentId: message.agentId || (canUseLiveFallback ? fallbackAgentIdentity?.agentId : undefined),
    agentName: message.agentName || (canUseLiveFallback ? fallbackAgentIdentity?.agentName : undefined),
    sessionMode: message.sessionMode,
    attachments: message.attachments,
    commentAttachments: message.commentAttachments,
    runStatus: runStatus as ChatMessage['runStatus'],
    events: [...(Array.isArray(message.events) && message.events.length > 0
      ? message.events as NonNullable<ChatMessage['events']>
      : role === 'assistant' && message.content
        ? [{ kind: 'text', text: message.content } as NonNullable<ChatMessage['events']>[number]]
        : []), ...(message.awaitingInput ? [{ kind: 'status' as const, label: 'awaiting_user' }] : [])],
  };
}

const SharedUserMessage = memo(function SharedUserMessage({
  message,
  t,
}: {
  message: ChatMessage;
  t: TranslateFn;
}) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  async function handleCopy() {
    if (!message.content) return;
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    const ok = await copyToClipboard(questionAnswerDisplayText(message.content));
    if (!ok) return;
    setCopied(true);
    copyTimerRef.current = setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = undefined;
    }, 2000);
  }

  const ts = messageTime(message);
  const attachments = message.attachments ?? [];

  return (
    <div className="msg user">
      {message.sessionMode && !hasPixflowWordPressContext() ? (
        <div className="msg-run-context-row" data-testid="msg-run-context-row">
          <div
            className={`msg-mode-chip msg-mode-chip--${message.sessionMode}`}
            data-testid="msg-session-mode-chip"
            title={sharedSessionModeLabel(message.sessionMode, t)}
          >
            <Icon
              name={message.sessionMode === 'chat' ? 'comment' : message.sessionMode === 'plan' ? 'file' : 'sparkles'}
              size={12}
            />
            <span>{sharedSessionModeLabel(message.sessionMode, t)}</span>
          </div>
        </div>
      ) : null}
      {attachments.length > 0 ? (
        <div className="user-attachments">
          {attachments.map((attachment, index) => (
            <span
              key={`${attachment.path}:${index}`}
              className={`user-attachment staged-${attachment.kind}`}
              title={attachment.path}
            >
              <span className="staged-order" aria-label={t("ui.chatComposer.attachment", { value1: index + 1 })}>
                {index + 1}
              </span>
              <Icon name={attachment.kind === 'image' ? 'image' : 'file'} size={14} />
              <span className="staged-name">{attachment.name}</span>
            </span>
          ))}
        </div>
      ) : null}
      {message.content ? (
        <div className="user-text-wrap">
          <div className="user-text user-bubble"><PageAnnotationMessage content={questionAnswerDisplayText(message.content)} /></div>
          <div className="user-actions">
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
          </div>
        </div>
      ) : null}
    </div>
  );
});

function sharedSessionModeLabel(mode: ChatSessionMode, t: TranslateFn): string {
  if (mode === 'chat') return t('chat.mode.chat.label');
  if (mode === 'plan') return t('chat.mode.plan.label');
  return t('chat.mode.design.label');
}
