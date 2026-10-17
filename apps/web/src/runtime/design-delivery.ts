import type { ChatSessionMode } from '@open-design/contracts';
import type { AgentEvent, ChatMessage } from '../types';
import type { ArtifactDeliveryFailure } from '../artifacts/delivery';
import { appendErrorStatusEvent } from './chat-events';
import { hasFileMutationToolUse } from './file-ops';
import { unfinishedTodosFromEvents } from './todos';
import { hasSuccessfulToolResult, hasUncertainSiteDelivery } from './site-delivery';

export type DesignDeliveryOutcome =
  | 'not_required'
  | 'awaiting_input'
  | 'delivered'
  | 'report_only'
  | 'no_result'
  | 'delivery_failed';

export interface DesignDeliveryInput {
  sessionMode: ChatSessionMode | null | undefined;
  runStatus: ChatMessage['runStatus'];
  content: string;
  events: AgentEvent[] | undefined;
  producedFileCount: number;
  persistenceSucceeded?: boolean;
  persistenceFailed?: boolean;
}

export function isRetryableAssistantTerminalFailure(
  message: Pick<ChatMessage, 'runStatus' | 'resultDeliveryState' | 'events'>,
): boolean {
  if (hasUncertainSiteDelivery(message)) return false;
  return (
    message.runStatus === 'failed' ||
    message.resultDeliveryState === 'no_result' ||
    message.resultDeliveryState === 'delivery_failed'
  );
}

function isIntermediateDesignTurn(content: string, events: AgentEvent[] | undefined): boolean {
  return /<(?:question-form|ask-question)\b/i.test(content) || unfinishedTodosFromEvents(events).length > 0;
}

function hasLiveArtifactDelivery(events: AgentEvent[] | undefined): boolean {
  return (events ?? []).some(
    (event) =>
      (event.kind === 'live_artifact' && event.action !== 'deleted') ||
      (event.kind === 'live_artifact_refresh' && event.phase === 'succeeded'),
  );
}

/**
 * A successful process is not a delivered design until usable output exists.
 * A substantive text-only turn that never attempted a file mutation is a
 * legitimate report, not a missing artifact. Failed mutation attempts remain
 * delivery failures.
 */
export function resolveDesignDeliveryOutcome(input: DesignDeliveryInput): DesignDeliveryOutcome {
  if (input.sessionMode !== 'design' || input.runStatus !== 'succeeded') return 'not_required';
  if (isIntermediateDesignTurn(input.content, input.events)) return 'awaiting_input';
  if (input.persistenceFailed) return 'delivery_failed';
  if (
    input.producedFileCount > 0 ||
    input.persistenceSucceeded ||
    hasLiveArtifactDelivery(input.events)
  ) {
    return 'delivered';
  }
  if (!hasFileMutationToolUse(input.events) && (input.content.trim().length > 0 || hasSuccessfulToolResult(input.events))) {
    return 'report_only';
  }
  return 'no_result';
}

const DESIGN_RESULT_MISSING_DETAIL =
  'The design run finished without producing a deliverable project file.';

export function applyDesignDeliveryOutcome(
  message: ChatMessage,
  outcome: DesignDeliveryOutcome,
  persistenceFailure?: ArtifactDeliveryFailure | null,
): ChatMessage {
  if (outcome === 'delivered') {
    return { ...message, resultDeliveryState: 'delivered' };
  }
  if (outcome !== 'no_result' && outcome !== 'delivery_failed') return message;
  if (outcome === 'delivery_failed' && persistenceFailure) {
    const withLifecycleMark = appendDeliveryLifecycleMark(message, persistenceFailure);
    return appendErrorStatusEvent(
      {
        ...withLifecycleMark,
        resultDeliveryState: outcome,
        resumable: false,
      },
      persistenceFailure.detail,
      persistenceFailure.code,
    );
  }
  return appendErrorStatusEvent(
    {
      ...message,
      resultDeliveryState: outcome,
      resumable: false,
    },
    DESIGN_RESULT_MISSING_DETAIL,
    'ARTIFACT_NOT_FOUND',
  );
}

function appendDeliveryLifecycleMark(
  message: ChatMessage,
  failure: ArtifactDeliveryFailure,
): ChatMessage {
  const events = message.events ?? [];
  if (events.some((event) => (
    event.kind === 'status'
    && event.label === failure.lifecycleMark
    && event.code === failure.code
  ))) {
    return message;
  }
  return {
    ...message,
    events: [...events, {
      kind: 'status',
      label: failure.lifecycleMark,
      detail: failure.validationReason,
      code: failure.code,
    }],
  };
}

/** Keep completion feedback quiet until the terminal file refresh finishes. */
export function designDeliveryVerificationPending(
  message: Pick<
    ChatMessage,
    'sessionMode' | 'runStatus' | 'resultDeliveryState' | 'content' | 'events' | 'producedFiles'
  >,
): boolean {
  if (message.sessionMode !== 'design' || message.runStatus !== 'succeeded') return false;
  if (message.resultDeliveryState) return false;
  if (isIntermediateDesignTurn(message.content, message.events)) return false;
  return message.producedFiles === undefined;
}
