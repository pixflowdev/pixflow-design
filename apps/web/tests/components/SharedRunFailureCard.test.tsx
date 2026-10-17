// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SharedRunFailureCard } from '../../src/components/shared-chat/SharedRunFailureCard';
const copy = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../../src/lib/copy-to-clipboard', () => ({ copyToClipboard: copy }));
afterEach(() => { cleanup(); copy.mockClear(); });
it('keeps recovery actions visible and uses an accessible custom diagnostic disclosure', async () => {
  const retry = vi.fn();
  const { container } = render(<SharedRunFailureCard title="Connection interrupted" message="Your saved reply is preserved."
    diagnostic="run-id: test" actions={<button onClick={retry}>Retry</button>} />);
  expect(screen.getByRole('alert').textContent).toContain('Your saved reply is preserved.');
  expect(container.querySelector('details, summary')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Copy details' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(retry).toHaveBeenCalledOnce();
  const disclosure = screen.getByRole('button', { name: 'Technical details' });
  fireEvent.click(disclosure); expect(disclosure.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Copy details' }));
  await waitFor(() => expect(copy).toHaveBeenCalledWith('run-id: test'));
  expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
  fireEvent.click(disclosure); expect(disclosure.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull();
});
