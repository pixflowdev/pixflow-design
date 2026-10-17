import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('../../src/pixflow/runtime-fetch', async importOriginal => ({ ...await importOriginal<object>(), pixflowWordPressRestFetch: state.session }));
vi.mock('../../src/pixflow/optional-bridge', async importOriginal => ({ ...await importOriginal<object>(), ensurePixflowOptionalBridgeSiteContext: vi.fn().mockResolvedValue(undefined) }));
import { streamViaDaemon } from '../../src/providers/daemon';

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('Workspace CLI source-bound session transport', () => {
  it('sends credentials only in the transient header while retaining normal project run identity', async () => {
    const workspaceSource = { projectId: 'project', conversationId: 'chat', requestId: 'user-message' };
    const session = { endpoint: 'https://site.test/?rest_route=/pixflow-design/v1/wp-admin/direct/tools', token: 'pfdirect_' + 'a'.repeat(64), workspaceSource, expiresAt: 9999999999, writable: true };
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
    expect(new Headers(call![1]?.headers).get('X-Pixflow-Workspace-Session')).toBe(JSON.stringify(session));
    expect(String(call![1]?.body)).not.toContain(session.token);
    expect(JSON.parse(String(call![1]?.body))).toMatchObject({ projectId: 'project', conversationId: 'chat', currentPrompt: 'Build a new page in Gutenberg.' });
  });
});
