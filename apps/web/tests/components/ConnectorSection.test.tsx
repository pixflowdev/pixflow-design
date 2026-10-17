// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorSection } from '../../src/components/SettingsDialog';
import { DEFAULT_CONFIG, fetchComposioConfigFromDaemon } from '../../src/state/config';
import type { AppConfig } from '../../src/types';
vi.mock('../../src/state/config', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/state/config')>(),
  fetchComposioConfigFromDaemon: vi.fn(),
}));
vi.mock('../../src/pixflow/wordpress-context', async original => ({...await original<typeof import('../../src/pixflow/wordpress-context')>(), hasPixflowWordPressContext: vi.fn(() => false)}));
vi.mock('../../src/components/ComposioSiteConnectors', () => ({ComposioSiteConnectors: () => <div>WordPress app catalogue</div>}));
import { hasPixflowWordPressContext } from '../../src/pixflow/wordpress-context';
vi.mock('../../src/components/ConnectorsBrowser', () => ({ ConnectorsBrowser: () => <div>Connector catalogue</div> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function Harness({ save = async () => {} }: { save?: () => Promise<void> }) {
  const [cfg, setCfg] = useState<AppConfig>({ ...DEFAULT_CONFIG, composio: { apiKeyConfigured: true, apiKeyTail: 'old!' } });
  return <ConnectorSection cfg={cfg} setCfg={setCfg} onPersistComposioKey={save} />;
}
describe('connector credentials', () => {
  it('replaces a stale browser saved marker with the Bridge state', async () => {
    vi.mocked(fetchComposioConfigFromDaemon).mockResolvedValue({ apiKeyConfigured: false, apiKey: '', apiKeyTail: '' });
    render(<Harness />);
    await waitFor(() => expect((screen.getByLabelText('Composio API Key') as HTMLInputElement).disabled).toBe(false));
    expect(screen.queryByText(/old!/)).toBeNull();
    expect((screen.getByRole('button', { name: /^Clear$/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('reports an offline Bridge and retries without persisting credentials', async () => {
    vi.mocked(fetchComposioConfigFromDaemon).mockResolvedValueOnce(null).mockResolvedValueOnce({ apiKeyConfigured: true, apiKey: '', apiKeyTail: 'last' });
    const save = vi.fn();
    render(<Harness save={save} />);
    await screen.findByText('Could not check the saved key');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByText('Could not check the saved key')).toBeNull());
    await screen.findByText(/last/);
    expect(save).not.toHaveBeenCalled();
  });
  it('does not show a successful save when persistence rejects', async () => {
    vi.mocked(fetchComposioConfigFromDaemon).mockResolvedValue({ apiKeyConfigured: false, apiKey: '' });
    render(<Harness save={async () => { throw new Error('offline'); }} />);
    const input = screen.getByLabelText('Composio API Key');
    await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(input, { target: { value: 'test-pending-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    await waitFor(() => expect((screen.getByRole('button', { name: /^Clear$/ }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText(/Saved ·/)).toBeNull();
    expect((input as HTMLInputElement).value).toBe('test-pending-key');
  });
});

it('keeps CLI-mode settings on the WordPress-owned catalogue without a Bridge key lookup', async () => {
 vi.mocked(hasPixflowWordPressContext).mockReturnValueOnce(true);
 render(<Harness/>);
 expect(screen.getByText('WordPress app catalogue')).toBeTruthy();
 expect(fetchComposioConfigFromDaemon).not.toHaveBeenCalled();
});
