// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatForkOrigin } from '../../src/components/ChatForkOrigin';
const mocks = vi.hoisted(() => ({ get: vi.fn(), list: vi.fn(), navigate: vi.fn() }));
vi.mock('../../src/i18n', () => ({ useT: () => (key: string, args?: { title: string }) => key === 'chat.continuedFrom' ? `Continued from ${args?.title}` : 'Original unavailable' }));
vi.mock('../../src/state/projects', () => ({ getProject: mocks.get, listConversations: mocks.list }));
vi.mock('../../src/router', () => ({ navigate: mocks.navigate, buildPath: (r: any) => `/projects/${r.projectId}/conversations/${r.conversationId}` }));
vi.mock('../../src/pixflow/license', () => ({ isPixflowWordPressEmbed: () => true }));
const origin = { projectId: 'original', conversationId: 'original-chat', messageId: 'selected', title: 'Original title' };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('shows a persistent WordPress source link and navigates to the original saved chat', async () => {
  mocks.get.mockResolvedValue({ id: 'original' }); mocks.list.mockResolvedValue([{ id: 'original-chat' }]);
  const view = render(<ChatForkOrigin origin={origin} />);
  expect(screen.getByRole('link').getAttribute('href')).toBe('#pixflow=%2Fprojects%2Foriginal%2Fconversations%2Foriginal-chat');
  view.rerender(<ChatForkOrigin origin={{ ...origin }} />);
  fireEvent.click(screen.getByRole('link', { name: 'Continued from Original title' }));
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ kind: 'project', projectId: 'original', conversationId: 'original-chat', fileName: null }));
});
it('keeps the fork usable when the source is deleted or no longer accessible', async () => {
  mocks.get.mockResolvedValue(null); mocks.list.mockResolvedValue([]);
  render(<ChatForkOrigin origin={origin} />); fireEvent.click(screen.getByRole('link'));
  await screen.findByRole('status'); expect(mocks.navigate).not.toHaveBeenCalled();
  expect(screen.getByRole('status').textContent).toBe('Original unavailable');
});
