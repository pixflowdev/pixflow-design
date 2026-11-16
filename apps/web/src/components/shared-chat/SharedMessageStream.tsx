import { MessageScroller, MessageScrollerProvider, MessageScrollerViewport, MessageScrollerContent, MessageScrollerButton, ChatTranscriptItem } from '../chat/MessageScroller';
import type {
  MutableRefObject,
  ReactNode,
} from 'react';
import { Icon } from '../Icon';
import type { Dict } from '../../i18n/types';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

// Pixflow-owned: reusable message stream shell. It deliberately accepts the
// rendered rows as children so the existing workspace renderer remains the
// source of truth until the Bricks Agent has its own conversation state.
export function SharedMessageStream({
  scrollSessionKey,
  logRef,
  loading,
  historyLoading = false,
  emptyState,
  rows,
  historyControls,
  errorNode,
  guidanceNode,
  scrollToLatestLabel,
  jumpToLatestLabel,
  loadingLabel,
  t,
}: {
  scrollSessionKey?: string | null;
  logRef: MutableRefObject<HTMLDivElement | null>;
  loading: boolean;
  historyLoading?: boolean;
  emptyState?: ReactNode;
  rows: ReactNode;
  historyControls?: ReactNode;
  errorNode?: ReactNode;
  guidanceNode?: ReactNode;
  scrollToLatestLabel: string;
  jumpToLatestLabel: string;
  loadingLabel?: string;
  t: TranslateFn;
}) {
  if (historyLoading) return <SharedChatConversationLoading t={t} label={loadingLabel} />;
  return (
    <MessageScrollerProvider key={scrollSessionKey} autoScroll defaultScrollPosition="end">
      <MessageScroller className="chat-log-wrap">
        {historyControls}
        <MessageScrollerViewport ref={logRef} className={`chat-log${loading ? ' is-loading' : ''}`}
          aria-busy={loading} aria-label={jumpToLatestLabel}>
          <MessageScrollerContent>
            {emptyState && <ChatTranscriptItem messageId="empty">{emptyState}</ChatTranscriptItem>}{rows}
            {loading ? <ChatTranscriptItem messageId="preparing"><SharedChatConversationLoading t={t} label={loadingLabel} /></ChatTranscriptItem> : null}
            {errorNode && <ChatTranscriptItem messageId="error">{errorNode}</ChatTranscriptItem>}
            {guidanceNode && <ChatTranscriptItem messageId="guidance">{guidanceNode}</ChatTranscriptItem>}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton direction="end"
          title={scrollToLatestLabel} aria-label={jumpToLatestLabel}>
          <Icon name="arrow-up" size={12} style={{ transform: 'rotate(180deg)' }} />
          <span>{jumpToLatestLabel}</span>
        </MessageScrollerButton>
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

export function SharedChatConversationLoading({ t, label }: { t: TranslateFn; label?: string }) {
  return (
    <div className="chat-loading-state" role="status" aria-live="polite">
      <span className="chat-loading-mark" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      <span className="chat-loading-copy">{label || t('common.loading')}</span>
      <span className="chat-loading-lines" aria-hidden>
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}
