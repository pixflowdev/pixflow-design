import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { authorizeWorkspaceBuilderSession, stageWorkspaceBuilderHelper } from '../../src/pixflow/workspace-builder-session.js';

const source = { projectId: 'project-1', conversationId: 'conversation-1', requestId: 'message-1' };
const session = { endpoint: 'https://site.test/?rest_route=/pixflow-design/v1/wp-admin/direct/tools', token: 'pfdirect_' + 'a'.repeat(64), expiresAt: 9999999999, writable: true, workspaceSource: source };
const authorization = { identity: { siteId: 'site', userId: 1, blogId: 1 }, writable: true, workspaceSource: source, siteTitle: 'Authorized site' };
afterEach(() => vi.unstubAllGlobals());

describe('Workspace CLI builder connection', () => {
  it('takes the source binding from WordPress rather than client-supplied claims', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(authorization))));
    const result = await authorizeWorkspaceBuilderSession(JSON.stringify({ ...session, siteTitle: 'Forged', workspaceSource: { ...source, requestId: 'forged' } }), source, 'https://site.test');
    expect(result?.workspaceSource).toEqual(source);
    expect(result?.siteTitle).toBe('Authorized site');
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
    let responseStatus = 200;
    let rejection: { contentType: string; body: string } | undefined;
    const server = createServer(async (request, response) => {
      let body = ''; for await (const chunk of request) body += chunk;
      calls.push({ method: request.method, authorization: request.headers.authorization, body: body && JSON.parse(body) });
      // Some hosts reject tool POSTs before WordPress unless their bound site
      // origin is supplied. Authorization is still required independently.
      if (request.method === 'POST' && request.headers.origin !== `http://${request.headers.host}`) {
        response.writeHead(403, { 'Content-Type': 'text/html' });
        response.end('<html>Forbidden</html>');
        return;
      }
      response.statusCode = responseStatus;
      if (rejection) {
        response.setHeader('Content-Type', rejection.contentType);
        response.end(rejection.body);
        return;
      }
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
      const context = await promisify(execFile)(process.execPath, [helper, 'context']);
      expect(JSON.parse(context.stdout)).toMatchObject({ scope: 'workspace', helper, siteTitle: null });
      expect(context.stdout).not.toContain(session.token);
      expect(calls).toHaveLength(0);
      const discoveryResult = await promisify(execFile)(process.execPath, [helper, 'builder.destinations', '--builder', 'bricks']);
      expect(JSON.parse(discoveryResult.stdout).ok).toBe(true);
      expect(calls.pop()).toMatchObject({ body: { tool: 'builder.destinations', arguments: { builder: 'bricks' } } });
      const invalid = await promisify(execFile)(process.execPath, [helper, 'builder.destinations', '{broken']).catch(error => error);
      expect(JSON.parse(invalid.stdout)).toMatchObject({ ok: false, code: 'INVALID_ARGUMENTS' });
      expect(invalid.stdout).not.toContain(session.token);
      const argumentFile = path.join(root, 'arguments with spaces.json');
      await writeFile(argumentFile, '\uFEFF' + JSON.stringify({ builder: 'bricks' }));
      await promisify(execFile)(process.execPath, [helper, 'builder.destinations', '@' + argumentFile]);
      expect(calls.pop()).toMatchObject({ body: { arguments: { builder: 'bricks' } } });
      responseStatus = 403;
      const denied = await promisify(execFile)(process.execPath, [helper, 'builder.destinations']).catch(error => error);
      expect(JSON.parse(denied.stdout)).toMatchObject({ code: 'HTTP_REJECTED', status: 403 });
      expect(denied.stdout).not.toContain(session.token);
      rejection = { contentType: 'application/json', body: JSON.stringify({ code: 'pixflow_builder_handoff', message: session.token, data: { status: 403 } }) };
      const wordpressDenied = await promisify(execFile)(process.execPath, [helper, 'builder.destinations']).catch(error => error);
      expect(JSON.parse(wordpressDenied.stdout)).toMatchObject({ code: 'HTTP_REJECTED', status: 403, wordpressCode: 'pixflow_builder_handoff' });
      expect(wordpressDenied.stdout).not.toContain(session.token);
      rejection = { contentType: 'text/html; charset=utf-8', body: '<html>' + session.token + '</html>' };
      const htmlDenied = await promisify(execFile)(process.execPath, [helper, 'builder.destinations']).catch(error => error);
      expect(JSON.parse(htmlDenied.stdout)).toMatchObject({ code: 'HTTP_REJECTED', status: 403, responseFormat: 'html' });
      expect(htmlDenied.stdout).not.toContain(session.token);
      calls.length = 0;
      responseStatus = 200;
      rejection = undefined;
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
