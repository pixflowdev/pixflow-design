// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StreamingMarkdown } from '../../src/components/chat/StreamingMarkdown';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('progresses across frames, catches up to appended chunks and immediately shows the final text', () => {
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const paint = (time: number) => act(() => {
    const batch = [...frames.values()];
    frames.clear();
    batch.forEach(callback => callback(time));
  });
  const text = 'A new answer arriving in a single burst.';
  const view = render(<StreamingMarkdown text={text} live />);
  paint(32);
  const first = view.container.textContent!;
  expect(first.length).toBeGreaterThan(0);
  expect(first.length).toBeLessThan(text.length);
  expect(text.startsWith(first)).toBe(true);
  view.rerender(<StreamingMarkdown text={text + ' More content.'} live />);
  paint(64);
  expect(view.container.textContent!.length).toBeGreaterThan(first.length);
  const burst = 'x'.repeat(200);
  view.rerender(<StreamingMarkdown text={text + ' More content.' + burst} live />);
  for (const now of [80, 96, 112]) paint(now);
  expect(view.container.textContent).toBe(text + ' More content.' + burst);
  view.rerender(<StreamingMarkdown text={text + ' More content.' + burst + ' Done.'} live />);
  expect(view.container.textContent?.endsWith(' Done.')).toBe(true);
  view.rerender(<StreamingMarkdown text="Final **answer**." live={false} />);
  expect(view.container.textContent).toBe('Final answer.');
  expect(frames.size).toBe(0);
});

it('renders saved replies and reduced-motion streams immediately', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const view = render(<StreamingMarkdown text="Read **now**." live />);
  expect(view.container.textContent).toBe('Read now.');
  view.rerender(<StreamingMarkdown text="Saved text." live={false} />);
  expect(view.container.textContent).toBe('Saved text.');
});
