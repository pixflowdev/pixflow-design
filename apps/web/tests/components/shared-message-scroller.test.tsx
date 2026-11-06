// @vitest-environment jsdom
import { useRef } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SharedMessageStream } from '../../src/components/shared-chat/SharedMessageStream';
import { ChatTranscriptItem } from '../../src/components/chat/MessageScroller';
import { useFloatingChatScroll } from '../../src/components/shared-chat/use-floating-chat-scroll';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function Transcript({ session = 'a', modern = true, earlier = false }) {
  const log = useRef<HTMLDivElement>(null), spacer = useRef<HTMLDivElement>(null);
  const legacy = useFloatingChatScroll(log, spacer, session, [], false);
  return <SharedMessageStream scrollSessionKey={session} modernScroller={modern}
    logRef={log} tailSpacerRef={spacer} loading={false} chatLogScrollable={legacy.scrollable}
    chatLogScrolling={legacy.scrolling} scrolledFromBottom={legacy.away} onJumpToBottom={legacy.jump}
    scrollToLatestLabel="Latest message" jumpToLatestLabel="Latest" t={key => key}
    rows={<>{earlier && <ChatTranscriptItem messageId="old">Earlier response</ChatTranscriptItem>}
      <ChatTranscriptItem messageId="question" scrollAnchor>Question</ChatTranscriptItem>
      <ChatTranscriptItem messageId="answer">Answer with preserved history</ChatTranscriptItem></>} />;
}

it('uses one upstream controller and keeps persisted rows while loading earlier history', async () => {
  const view = render(<Transcript />);
  await waitFor(() => expect(view.container.querySelector('[data-slot="message-scroller-viewport"]')).not.toBeNull());
  expect(view.container.querySelector('.chat-log-tail-spacer')).toBeNull();
  const answer = view.getByText('Answer with preserved history');
  view.rerender(<Transcript earlier />);
  expect(view.getByText('Answer with preserved history')).toBe(answer);
  expect(view.getByText('Earlier response')).toBeTruthy();
  expect(view.getByText('Question').getAttribute('data-scroll-anchor')).toBe('false');
  // Conversation changes reset the controller, not the saved message data.
  const viewport = view.container.querySelector('[data-slot="message-scroller-viewport"]');
  view.rerender(<Transcript session="b" />);
  expect(view.container.querySelector('[data-slot="message-scroller-viewport"]')).not.toBe(viewport);
  expect(view.getByText('Answer with preserved history')).toBeTruthy();
});

it('keeps the existing controller available to hosts that supply React 18', () => {
  const view = render(<Transcript modern={false} />);
  expect(view.container.querySelector('[data-slot="message-scroller-viewport"]')).toBeNull();
  expect(view.container.querySelector('.chat-log-tail-spacer')).not.toBeNull();
  expect(view.getByText('Answer with preserved history')).toBeTruthy();
});
