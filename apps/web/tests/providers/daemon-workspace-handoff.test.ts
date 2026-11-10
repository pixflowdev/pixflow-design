import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('../../src/pixflow/runtime-fetch', async importOriginal => ({ ...await importOriginal<object>(), pixflowWordPressRestFetch: state.session }));
vi.mock('../../src/pixflow/optional-bridge', async importOriginal => ({ ...await importOriginal<object>(), ensurePixflowOptionalBridgeSiteContext: vi.fn().mockResolvedValue(undefined) }));
import { streamViaDaemon } from '../../src/providers/daemon';

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('Workspace CLI source-bound session transport', () => {
  it('does not create a run when Stop cancels admission', async () => {
    const cancel = new AbortController();
    const workspaceSource = { projectId: 'project', conversationId: 'chat', requestId: 'user-message' };
    state.session.mockImplementation(async () => {
      cancel.abort();
      return Response.json({ endpoint: 'https://site.test/tools', token: 'test-token', workspaceSource });
    });
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => Response.json({}));
    vi.stubGlobal('fetch', fetcher);
    const onRunCreated = vi.fn();
    await streamViaDaemon({ agentId: 'codex', workspaceSource, history: [{ id: 'user-message', role: 'user', content: 'Say hello.' }], signal: new AbortController().signal, cancelSignal: cancel.signal, onRunCreated, handlers: { onDelta: vi.fn(), onDone: vi.fn(), onAgentEvent: vi.fn(), onError: vi.fn() } });
    expect(onRunCreated).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/api/runs'))).toBe(false);
  });

  it('keeps run admission alive when only the viewing chat detaches', async () => {
    const view = new AbortController();
    const cancel = new AbortController();
    const workspaceSource = { projectId: 'project', conversationId: 'chat', requestId: 'user-message' };
    state.session.mockImplementation(async (_path, init) => {
      view.abort();
      init.signal?.throwIfAborted();
      return Response.json({ endpoint: 'https://site.test/tools', token: 'test-token', workspaceSource });
    });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ runId: 'run-detached', status: 'succeeded', exitCode: 0 })));
    const onRunCreated = vi.fn();
    await streamViaDaemon({ agentId: 'codex', workspaceSource, projectId: 'project', conversationId: 'chat', history: [{ id: 'user-message', role: 'user', content: 'Say hello.' }], signal: view.signal, cancelSignal: cancel.signal, onRunCreated, handlers: { onDelta: vi.fn(), onDone: vi.fn(), onAgentEvent: vi.fn(), onError: vi.fn() } });
    expect(onRunCreated).toHaveBeenCalledWith('run-detached');
    expect(state.session.mock.calls[0]?.[1].signal).toBe(cancel.signal);
  });

  it.each(['Plain site', 'Café — 設計 👋'])('preserves session data for %s in an HTTP-safe header', async (siteLabel) => {
    const workspaceSource = { projectId: 'project', conversationId: 'chat', requestId: 'user-message' };
    const session = { siteLabel, endpoint: 'https://site.test/?rest_route=/pixflow-design/v1/wp-admin/direct/tools', token: 'pfdirect_' + 'a'.repeat(64), workspaceSource, expiresAt: 9999999999, writable: true };
    state.session.mockResolvedValue(Response.json(session));
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/runs') && init?.method === 'POST') return Response.json({ runId: 'run-1' });
      if (url.includes('/events')) return new Response('id: 1\nevent: end\ndata: {"status":"succeeded","code":0}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
      return Response.json({ status: 'succeeded', exitCode: 0 });
    });
    vi.stubGlobal('fetch', fetcher);
    const onError = vi.fn();
    await streamViaDaemon({ agentId: 'codex', projectId: 'project', conversationId: 'chat', workspaceSource, history: [{ id: 'user-message', role: 'user', content: 'Build a new page in Gutenberg.' }], signal: new AbortController().signal, handlers: { onDelta: vi.fn(), onDone: vi.fn(), onAgentEvent: vi.fn(), onError } });
    expect(onError).not.toHaveBeenCalled();
    expect(state.session).toHaveBeenCalledWith('/wp-admin/direct/sessions', expect.objectContaining({ body: JSON.stringify({ workspaceSource }) }));
    const call = fetcher.mock.calls.find(([url, init]) => String(url).endsWith('/api/runs') && init?.method === 'POST');
    expect(call).toBeDefined();
    expect(JSON.parse(new Headers(call![1]?.headers).get('X-Pixflow-Workspace-Session')!)).toEqual(session);
    expect(String(call![1]?.body)).not.toContain(session.token);
    expect(JSON.parse(String(call![1]?.body))).toMatchObject({ projectId: 'project', conversationId: 'chat', currentPrompt: 'Build a new page in Gutenberg.' });
  });
});
