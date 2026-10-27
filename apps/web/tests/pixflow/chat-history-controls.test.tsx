// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
vi.mock('../../src/i18n', () => ({ useT: () => (key: string) => ({
  'history.continuingConversation': 'Continuing your conversation…',
  'history.loadError': 'Could not load history',
  'history.retry': 'Retry',
}[key] || key) }));
import { ChatHistoryControls } from '../../src/pixflow/ChatHistoryControls';
afterEach(cleanup);
it('shows one accessible transition status, then removes it without an acceptance step', () => {
  const props = {hasMore:false,loading:true,error:null,loadEarlier:vi.fn(),retry:vi.fn()};
  const view = render(<ChatHistoryControls {...props} continuing />);
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByRole('status').textContent).toBe('Continuing your conversation…');
  expect(screen.queryByRole('button')).toBeNull();
  view.rerender(<ChatHistoryControls {...props} loading={false} continuing={false} />);
  expect(screen.queryByRole('status')).toBeNull();
});
it('replaces a stalled handoff spinner with the existing recovery action on failure', () => {
  render(<ChatHistoryControls hasMore={false} loading={false} error="load" continuing loadEarlier={vi.fn()} retry={vi.fn()} />);
  expect(screen.queryByText('Continuing your conversation…')).toBeNull();
  expect(screen.getByRole('button', {name:'Retry'})).toBeTruthy();
});
