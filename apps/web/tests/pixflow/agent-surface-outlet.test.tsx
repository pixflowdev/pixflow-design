// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PixflowAgentSurfaceShell } from '../../src/pixflow/PixflowAgentSurfaceShell';
vi.mock('../../src/pixflow/FloatingChatMenu', () => ({ FloatingChatMenu: () => null }));
afterEach(() => { cleanup(); document.body.innerHTML = ''; });
it('moves the shared conversation into the Sitemap panel and restores its host on close', () => {
  const view = render(<PixflowAgentSurfaceShell surface="bricks_builder"><button>Existing conversation</button><input aria-label="Draft" defaultValue="Unsent page reference" /></PixflowAgentSurfaceShell>);
  const original = screen.getByText('Existing conversation');
  const outlet = document.createElement('div'); outlet.id = 'pixflow-sitemap-conversation-outlet'; document.body.append(outlet);
  act(() => window.dispatchEvent(new Event('pixflow-design:conversation-outlet')));
  expect(outlet.contains(screen.getByText('Existing conversation'))).toBe(true);
  expect(screen.getByText('Existing conversation')).toBe(original);
  expect(screen.getAllByText('Existing conversation')).toHaveLength(1);
  act(() => window.dispatchEvent(new CustomEvent('pixflow-design:conversation-outlet', {detail:{active:false}})));
  expect(view.container.contains(screen.getByText('Existing conversation'))).toBe(true);
  expect(outlet.childElementCount).toBe(0);
  expect((screen.getByLabelText('Draft') as HTMLInputElement).value).toBe('Unsent page reference');
  act(() => window.dispatchEvent(new Event('pixflow-design:conversation-outlet')));
  expect(outlet.contains(original)).toBe(true);
  expect(screen.getAllByLabelText('Draft')).toHaveLength(1);
  expect((screen.getByLabelText('Draft') as HTMLInputElement).value).toBe('Unsent page reference');
});

it('does not revive a conversation whose builder host was removed', () => {
  const view = render(<PixflowAgentSurfaceShell surface="bricks_builder"><button>Closed host conversation</button></PixflowAgentSurfaceShell>);
  const outlet = document.createElement('div'); outlet.id = 'pixflow-sitemap-conversation-outlet'; document.body.append(outlet);
  view.container.remove();
  act(() => window.dispatchEvent(new Event('pixflow-design:conversation-outlet')));
  expect(outlet.childElementCount).toBe(0);
});
