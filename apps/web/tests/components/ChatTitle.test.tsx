// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatTitle } from '../../src/components/ChatTitle';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('reveals overflowing titles and removes motion when the panel becomes wide enough', () => {
  let resize = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  let width = 100;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(220);
  const view = render(<ChatTitle>A complete title that remains available to assistive technology</ChatTitle>);
  const title = view.container.querySelector('[data-chat-title]') as HTMLElement;
  expect(title.dataset.overflow).toBe('true');
  expect(title.style.getPropertyValue('--title-distance')).toBe('120px');
  expect(title.textContent).toBe('A complete title that remains available to assistive technology');
  width = 250;
  act(() => resize());
  expect(title.dataset.overflow).toBe('false');
  expect(title.style.getPropertyValue('--title-distance')).toBe('');
  view.unmount();
  expect(disconnect).toHaveBeenCalled();
});
