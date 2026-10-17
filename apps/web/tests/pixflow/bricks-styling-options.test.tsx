// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionModeToggle } from '../../src/components/SessionModeToggle';
import { BricksStylingOptions } from '../../src/pixflow/BricksStylingOptions';
afterEach(cleanup);

it('offers site styles by default inside the session mode menu without changing session mode', () => {
  const onMode = vi.fn(); const onStyle = vi.fn();
  render(<SessionModeToggle mode="design" onChange={onMode} menuExtra={<BricksStylingOptions onChange={onStyle} />} />);
  fireEvent.click(screen.getByTestId('session-mode-trigger'));
  expect(screen.getByRole('menuitemradio', { name: 'Use site styles' }).getAttribute('aria-checked')).toBe('true');
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Custom styling' }));
  expect(onStyle).toHaveBeenCalledWith(false);
  expect(onMode).not.toHaveBeenCalled();
  expect(screen.getByText('Both options use global classes.')).toBeTruthy();
});

it('reflects a saved custom preference and disables changes during a run', () => {
  const onChange = vi.fn();
  render(<BricksStylingOptions useSiteStyles={false} disabled onChange={onChange} />);
  expect(screen.getByRole('menuitemradio', { name: 'Custom styling' }).getAttribute('aria-checked')).toBe('true');
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Use site styles' }));
  expect(onChange).not.toHaveBeenCalled();
});
