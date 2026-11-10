import { MessageScroller, MessageScrollerProvider, MessageScrollerViewport, MessageScrollerContent, MessageScrollerButton, supportsMessageScroller } from '../chat/MessageScroller';
import type {
  MouseEventHandler,
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
  modernScroller = true,
  logRef,
  loading,
  chatLogScrollable,
  chatLogScrolling,
  onLogClickCapture,
  emptyState,
  rows,
  errorNode,
  guidanceNode,
  tailSpacerRef,
  scrolledFromBottom,
  onJumpToBottom,
  scrollToLatestLabel,
  jumpToLatestLabel,
  loadingLabel,
  t,
}: {
  scrollSessionKey?: string | null;
  modernScroller?: boolean;
  logRef: MutableRefObject<HTMLDivElement | null>;
  loading: boolean;
  chatLogScrollable: boolean;
  chatLogScrolling: boolean;
  onLogClickCapture?: MouseEventHandler<HTMLDivElement>;
  emptyState?: ReactNode;
  rows: ReactNode;
  errorNode?: ReactNode;
  guidanceNode?: ReactNode;
  tailSpacerRef: MutableRefObject<HTMLDivElement | null>;
  scrolledFromBottom: boolean;
  onJumpToBottom: () => void;
  scrollToLatestLabel: string;
  jumpToLatestLabel: string;
  loadingLabel?: string;
  t: TranslateFn;
}) {
  if (modernScroller && supportsMessageScroller) return (
    <MessageScrollerProvider key={scrollSessionKey} autoScroll defaultScrollPosition="end">
      <MessageScroller className="chat-log-wrap">
        <MessageScrollerViewport ref={logRef} className={`chat-log${loading ? ' is-loading' : ''}`}
          aria-busy={loading} aria-label={jumpToLatestLabel} onClickCapture={onLogClickCapture}>
          <MessageScrollerContent>
            {loading ? <SharedChatConversationLoading t={t} label={loadingLabel} /> : null}
            {emptyState}{rows}{errorNode}{guidanceNode}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton direction="end" className="chat-jump-btn chat-jump-btn-active"
          title={scrollToLatestLabel} aria-label={jumpToLatestLabel}>
          <Icon name="arrow-up" size={12} style={{ transform: 'rotate(180deg)' }} />
          <span>{jumpToLatestLabel}</span>
        </MessageScrollerButton>
      </MessageScroller>
    </MessageScrollerProvider>
  );
  return (
    <div className="chat-log-wrap">
      <div
        className={[
          'chat-log',
          loading ? 'is-loading' : '',
          chatLogScrollable ? 'is-scrollable' : '',
          chatLogScrolling ? 'is-scrolling' : '',
        ].filter(Boolean).join(' ')}
        ref={logRef}
        aria-busy={loading}
        onClickCapture={onLogClickCapture}
      >
        {loading ? <SharedChatConversationLoading t={t} label={loadingLabel} /> : null}
        {emptyState}
        {rows}
        {errorNode}
        {guidanceNode}
        <div className="chat-log-tail-spacer" ref={tailSpacerRef} aria-hidden />
      </div>
      <button
        type="button"
        className={`chat-jump-btn${scrolledFromBottom ? ' chat-jump-btn-active' : ''}`}
        onClick={onJumpToBottom}
        title={scrollToLatestLabel}
        aria-hidden={!scrolledFromBottom}
        tabIndex={scrolledFromBottom ? 0 : -1}
      >
        <Icon name="arrow-up" size={12} style={{ transform: 'rotate(180deg)' }} />
        <span>{jumpToLatestLabel}</span>
      </button>
    </div>
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
