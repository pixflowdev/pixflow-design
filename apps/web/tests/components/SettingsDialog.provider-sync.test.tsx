// @vitest-environment jsdom
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsDialog } from '../../src/components/SettingsDialog';
import { DEFAULT_CONFIG } from '../../src/state/config';
import type { AppConfig } from '../../src/types';

it.each(['codex', 'claude'])('labels the actual %s desktop runtime without changing provider selection', async (id) => {
 const persist=vi.fn();
 const agent = { id, name: id, bin: id, available: true, authStatus: 'ok' as const, modelsSource: 'live' as const, runtimeSource: 'desktop' as const, models: [{ id: 'default', label: 'Default' }] };
 const props = { initial: {...initial, agentId: id}, daemonLive: true, appVersionInfo: null, initialSection: 'execution' as const, onPersist: persist, onPersistComposioKey: vi.fn(), onClose: vi.fn(), onRefreshAgents: vi.fn() };
 const view=render(<SettingsDialog {...props} agents={[agent]} />);
 expect(screen.getAllByText('Live from Desktop app').length).toBeGreaterThan(0);
 expect(screen.queryByText('Live from CLI')).toBeNull();
 view.rerender(<SettingsDialog {...props} agents={[{...agent,runtimeSource:'cli'}]} />);
 expect(screen.getByText('Live from CLI')).toBeTruthy();
 expect(screen.queryByText('Live from Desktop app')).toBeNull();
 expect(persist).not.toHaveBeenCalled();
});
afterEach(cleanup);
const agents = [{ id: 'codex', name: 'Codex', bin: 'codex', available: true }];
const initial: AppConfig = { ...DEFAULT_CONFIG, mode: 'daemon', agentId: 'codex' };
const api: AppConfig = { ...initial, mode: 'api', apiTransport: 'direct', apiProtocol: 'openai', apiKey: 'test-only', model: 'test-model', baseUrl: 'https://api.openai.com/v1' };
function dialog(config: AppConfig, persist = vi.fn()) {
 return <SettingsDialog initial={config} agents={agents} daemonLive appVersionInfo={null} initialSection="execution" onPersist={persist} onPersistComposioKey={vi.fn()} onClose={vi.fn()} onRefreshAgents={vi.fn()} />;
}
it('reflects hydrated provider selection without persisting stale defaults', async () => {
 const persist=vi.fn(); const view=render(dialog(initial,persist));
 view.rerender(dialog(api,persist));
 await waitFor(()=>expect(screen.getByRole('tab',{name:/BYOK/}).getAttribute('aria-selected')).toBe('true'));
 expect(screen.getByRole('tab',{name:/Local CLI/}).getAttribute('aria-selected')).toBe('false');
 await act(async () => { await new Promise(resolve => setTimeout(resolve, 800)); });
 expect(persist).not.toHaveBeenCalled();
});
it('preserves an explicit local provider choice when an older parent snapshot arrives', async () => {
 const view=render(dialog(api));
 fireEvent.click(screen.getByRole('tab',{name:/Local CLI/}));
 view.rerender(dialog({...api, model:'new-server-model'}));
 expect(screen.getByRole('tab',{name:/Local CLI/}).getAttribute('aria-selected')).toBe('true');
});


it('adopts an external CLI choice after an API selection has hydrated', async () => {
 const persist=vi.fn(); const view=render(dialog(api,persist));
 view.rerender(dialog({...api,mode:'daemon'},persist));
 await waitFor(()=>expect(screen.getByRole('tab',{name:/Local CLI/}).getAttribute('aria-selected')).toBe('true'));
 await act(async () => { await new Promise(resolve => setTimeout(resolve,800)); });
 expect(persist).not.toHaveBeenCalled();
});
