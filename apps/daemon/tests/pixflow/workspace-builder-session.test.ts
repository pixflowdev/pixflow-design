import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { authorizeWorkspaceBuilderSession, stageWorkspaceBuilderHelper } from '../../src/pixflow/workspace-builder-session.js';

const source = { projectId: 'project-1', conversationId: 'conversation-1', requestId: 'message-1' };
const session = { endpoint: 'https://site.test/?rest_route=/pixflow-design/v1/wp-admin/direct/tools', token: 'pfdirect_' + 'a'.repeat(64), expiresAt: 9999999999, writable: true, workspaceSource: source };
const authorization = { identity: { siteId: 'site', userId: 1, blogId: 1 }, writable: true, workspaceSource: source };
afterEach(() => vi.unstubAllGlobals());

describe('Workspace CLI builder connection', () => {
  it('takes the source binding from WordPress rather than client-supplied claims', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(authorization))));
    const result = await authorizeWorkspaceBuilderSession(JSON.stringify({ ...session, workspaceSource: { ...source, requestId: 'forged' } }), source, 'https://site.test');
    expect(result?.workspaceSource).toEqual(source);
    expect(fetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: 'error', headers: { Authorization: 'Bearer ' + session.token } }));
  });
  it('rejects cross-site transport before sending credentials and mismatched source ownership', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(authorization)));
    vi.stubGlobal('fetch', fetcher);
    await expect(authorizeWorkspaceBuilderSession(JSON.stringify(session), source, 'https://other.test')).rejects.toThrow('active WordPress site');
    expect(fetcher).not.toHaveBeenCalled();
    await expect(authorizeWorkspaceBuilderSession(JSON.stringify(session), { ...source, conversationId: 'other' }, 'https://site.test')).rejects.toThrow('different chat');
  });
  it('does not enable a helper for ordinary non-WordPress runs', async () => {
    expect(await authorizeWorkspaceBuilderSession(undefined, source, '')).toBeUndefined();
  });
  it('stages a working restricted helper outside project files and revokes/removes it', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'pixflow-workspace-helper-'));
    const calls: unknown[] = [];
    const server = createServer(async (request, response) => {
      let body = ''; for await (const chunk of request) body += chunk;
      calls.push({ method: request.method, authorization: request.headers.authorization, body: body && JSON.parse(body) });
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ ok: true, handoff: { id: 'receipt-1' } }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    try {
      const staged = await stageWorkspaceBuilderHelper(root, { ...session, endpoint: `http://127.0.0.1:${address.port}/tools` });
      expect(staged.prompt).not.toContain(session.token);
      expect(staged.prompt).toContain('Default page construction MUST happen visibly');
      const directory = path.join(root, 'workspace-builder-sessions', (await readdir(path.join(root, 'workspace-builder-sessions')))[0]!);
      const helper = path.join(directory, 'builder-tool.mjs');
      expect(await readFile(helper, 'utf8')).not.toContain(session.token);
      const result = await promisify(execFile)(process.execPath, [helper, 'builder.handoff', JSON.stringify({ action: 'open', builder: 'gutenberg', postId: 44, brief: 'Preserve content' })]);
      expect(JSON.parse(result.stdout)).toEqual({ ok: true, handoff: { id: 'receipt-1' } });
      expect(calls[0]).toMatchObject({ authorization: 'Bearer ' + session.token, body: { tool: 'builder.handoff', arguments: { postId: 44 } } });
      await expect(promisify(execFile)(process.execPath, [helper, 'wordpress.run', '{}'])).rejects.toThrow();
      expect(calls).toHaveLength(1);
      await staged.cleanup();
      expect(await readdir(path.join(root, 'workspace-builder-sessions'))).toEqual([]);
      expect(calls[1]).toMatchObject({ method: 'DELETE' });
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
  });
});
