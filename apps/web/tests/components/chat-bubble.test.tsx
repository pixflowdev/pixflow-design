// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Bubble, BubbleContent, BubbleGroup, BubbleReactions } from '../../src/components/chat/Bubble';
afterEach(cleanup);
it('preserves shadcn slots, alignment and interactive content composition', () => {
  const click = vi.fn();
  const view = render(<BubbleGroup><Bubble align="end"><BubbleContent render={<button type="button" />} onClick={click}>Saved image</BubbleContent><BubbleReactions side="top">Like</BubbleReactions></Bubble></BubbleGroup>);
  expect(view.container.querySelector('[data-slot="bubble"][data-align="end"]')).not.toBeNull();
  const button = view.getByRole('button', { name: 'Saved image' });
  expect(button.dataset.slot).toBe('bubble-content');
  fireEvent.click(button);
  expect(click).toHaveBeenCalledOnce();
  expect(view.container.querySelector('[data-slot="bubble-reactions"][data-side="top"]')).not.toBeNull();
});
