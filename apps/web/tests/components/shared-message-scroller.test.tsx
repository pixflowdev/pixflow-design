// @vitest-environment jsdom
import { useRef } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SharedMessageStream } from '../../src/components/shared-chat/SharedMessageStream';
import { ChatTranscriptItem } from '../../src/components/chat/MessageScroller';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function Transcript({ session = 'a', earlier = false, historyLoading = false }) {
  const log = useRef<HTMLDivElement>(null);
  return <SharedMessageStream scrollSessionKey={session}
    logRef={log} loading={false} historyLoading={historyLoading}
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
  expect(view.getByText('Question').getAttribute('data-scroll-anchor')).toBe('true');
  // Conversation changes reset the controller, not the saved message data.
  const viewport = view.container.querySelector('[data-slot="message-scroller-viewport"]');
  view.rerender(<Transcript session="b" />);
  expect(view.container.querySelector('[data-slot="message-scroller-viewport"]')).not.toBe(viewport);
  expect(view.getByText('Answer with preserved history')).toBeTruthy();
});

it('initialises saved history only when it has arrived, with no legacy spacer', () => {
  const view = render(<Transcript historyLoading />);
  expect(view.container.querySelector('[data-slot="message-scroller-viewport"]')).toBeNull();
  view.rerender(<Transcript />);
  expect(view.container.querySelector('[data-slot="message-scroller-viewport"]')).not.toBeNull();
  expect(view.container.querySelector('.chat-log-tail-spacer')).toBeNull();
});
