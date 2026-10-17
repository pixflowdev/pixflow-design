// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WpAdminOnboardingHost } from '../../src/pixflow/WpAdminOnboardingHost';

vi.mock('../../src/App', () => ({ App: () => <div>Workspace</div> }));
const savedConfig = vi.hoisted(() => ({ mode: 'api', apiProtocol: 'openai', model: 'gpt-4o', apiKey: 'local-test-key' }));
vi.mock('../../src/state/config', () => ({ loadConfig: () => savedConfig }));
vi.mock('../../src/pixflow/WpAdminAgentFrameApp', () => ({ WpAdminAgentFrameApp: ({ initialConfig }: { initialConfig?: typeof savedConfig }) => <div>Agent {initialConfig?.apiProtocol} {initialConfig?.model}</div> }));
afterEach(cleanup);

it('hands the just-saved provider to the composer without requiring a page reload', () => {
  render(<WpAdminOnboardingHost completed={false} />);
  act(() => window.dispatchEvent(new MessageEvent('message', {
    source: window, origin: window.location.origin,
    data: { source: 'pixflow-design', type: 'pixflow-design:onboarding-completed', completed: true, route: 'byok' },
  })));
  expect(screen.getByText('Agent openai gpt-4o')).toBeTruthy();
});

it('keeps the agent panel open after a resource handoff, but closes it for an ordinary workspace dismissal', () => {
  render(<WpAdminOnboardingHost completed route="local-cli" />);
  const close = vi.fn();
  window.addEventListener('pixflow-design:wp-admin-close', close);
  const send = (preserveAgentPanel: boolean) => act(() => {
    window.dispatchEvent(new MessageEvent('message', { source: window, origin: window.location.origin,
      data: { source: 'pixflow-design', type: 'pixflow-design:close-workspace', preserveAgentPanel } }));
  });
  send(true);
  expect(close).not.toHaveBeenCalled();
  send(false);
  expect(close).toHaveBeenCalledOnce();
  window.removeEventListener('pixflow-design:wp-admin-close', close);
});

it('opens setup for a retired no-AI profile instead of the workspace', () => {
  render(<WpAdminOnboardingHost completed route="none" />);
  expect(screen.getByRole('dialog', { name: 'Set up Pixflow Design' })).toBeTruthy();
  expect(screen.queryByText(/Templates, design systems/)).toBeNull();
});
