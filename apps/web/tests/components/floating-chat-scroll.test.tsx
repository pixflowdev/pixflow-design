// @vitest-environment jsdom
import { useRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useFloatingChatScroll } from '../../src/components/shared-chat/use-floating-chat-scroll';

type Row = { id: string; role: string };
function Panel({ rows, running }: { rows: Row[]; running: boolean }) {
  const log = useRef<HTMLDivElement>(null), spacer = useRef<HTMLDivElement>(null);
  const scroll = useFloatingChatScroll(log, spacer, 'fixture', rows, running);
  return <><div ref={log} data-testid="log">
    {rows.map(row => <div key={row.id} data-chat-user-id={row.role === 'user' ? row.id : undefined} />)}
    <div ref={spacer} data-testid="tail" />
  </div><button onClick={scroll.jump}>Latest</button></>;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each([false, true])('follows the bottom without reserved space and preserves scrollback (reduced motion: %s)', reduced => {
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++nextId, cb); return nextId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  const paint = () => act(() => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(cb => cb(0)); });
  const history = [{ id: 'old', role: 'user' }, { id: 'done', role: 'assistant' }];
  const view = render(<Panel rows={history} running={false} />);
  const el = view.getByTestId('log'), tail = view.getByTestId('tail');
  let height = 1000, offset = 0;
  Object.defineProperties(el, {
    clientHeight: { get: () => 400 },
    scrollHeight: { get: () => height + tail.offsetHeight },
    scrollTop: { get: () => offset, set: (y: number) => { offset = Math.max(0, Math.min(y, el.scrollHeight - 400)); } },
  });
  Object.defineProperty(tail, 'offsetHeight', { get: () => parseFloat(tail.style.height) || 0 });
  const move = vi.fn(({ top }: ScrollToOptions) => { el.scrollTop = top ?? 0; });
  Object.defineProperty(el, 'scrollTo', { value: move });
  paint();
  expect(offset).toBe(600);
  const turn = [...history, { id: 'fresh', role: 'user' }, { id: 'reply', role: 'assistant' }];
  view.rerender(<Panel rows={turn} running />);
  const row = el.querySelector<HTMLElement>('[data-chat-user-id="fresh"]')!;
  Object.defineProperty(row, 'getBoundingClientRect', { value: () => ({ top: 1000 - offset }) });
  height = 1050;
  paint();
  expect(offset).toBe(650);
  expect(tail.offsetHeight).toBe(0);
  height += 100;
  view.rerender(<Panel rows={[...turn]} running />);
  paint();
  expect(offset).toBe(750);
  expect(tail.offsetHeight).toBe(0);
  expect(move).not.toHaveBeenCalled();
  // Move away after the update has queued, before its animation frame runs.
  view.rerender(<Panel rows={[...turn]} running />);
  fireEvent.wheel(el, { deltaY: -120 });
  el.scrollTop = 500;
  fireEvent.scroll(el);
  paint();
  expect(offset).toBe(500);
  height += 400;
  view.rerender(<Panel rows={[...turn]} running={false} />);
  paint();
  expect(offset).toBe(500);
  expect(tail.offsetHeight).toBe(0);
  fireEvent.click(view.getByText('Latest'));
  expect(offset).toBe(height - 400);
});
