import { afterEach, describe, expect, it, vi } from 'vitest';
import { authenticateDirectOwner, redactDirectEvent, directSessionUrl } from '../../src/pixflow/direct-site-session.js';

const session={endpoint:'https://site.example/?rest_route=/pixflow-design/v1/wp-admin/direct/tools',token:'pfdirect_'+'a'.repeat(64),writable:false,expiresAt:9999999999};
afterEach(()=>vi.unstubAllGlobals());
describe('Direct recovery authorization',()=>{
  it('reports unavailable verification separately from rejected credentials and never leaks transport diagnostics', async () => {
    const request = vi.fn().mockRejectedValueOnce(new DOMException('private-network-details', 'TimeoutError'))
      .mockRejectedValueOnce(new DOMException('private-network-details', 'TimeoutError'))
      .mockResolvedValueOnce(new Response('<html>upstream error</html>', { status: 503 }))
      .mockResolvedValueOnce(new Response('<html>upstream error</html>', { status: 503 }))
      .mockResolvedValueOnce(new Response('<html>not JSON</html>', { status: 200 }));
    vi.stubGlobal('fetch', request);
    for (let i = 0; i < 3; i++) {
      await expect(authenticateDirectOwner(session, true)).rejects.toMatchObject({ status: 503, code: 'DIRECT_AUTH_UNAVAILABLE' });
    }
    expect(request).toHaveBeenCalledTimes(5);
  });
  it('never retries a real denial or a caller-aborted verification', async () => {
    const denied = vi.fn().mockResolvedValue(Response.json({}, { status: 403 }));
    vi.stubGlobal('fetch', denied);
    await expect(authenticateDirectOwner(session, true)).rejects.toMatchObject({ status: 403 });
    expect(denied).toHaveBeenCalledOnce();
    const aborted = vi.fn(async () => { throw new DOMException('Stopped', 'AbortError'); });
    vi.stubGlobal('fetch', aborted);
    await expect(authenticateDirectOwner(session, true, AbortSignal.abort())).rejects.toMatchObject({ status: 503 });
    expect(aborted).toHaveBeenCalledOnce();
  });
  it('uses and clears the WordPress-owned Workspace source binding', async () => {
    const workspaceSource = { projectId: 'project', conversationId: 'chat', requestId: 'message' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ identity: { siteId: 'site', userId: 1, blogId: 1 }, writable: false, workspaceSource })).mockResolvedValueOnce(Response.json({ identity: { siteId: 'site', userId: 1, blogId: 1 }, writable: false })));
    const input = { ...session, workspaceSource: { ...workspaceSource, requestId: 'forged' } };
    await authenticateDirectOwner(input, true);
    expect(input.workspaceSource).toEqual(workspaceSource);
    await authenticateDirectOwner(input, true);
    expect(input.workspaceSource).toBeUndefined();
  });
  it('uses the WordPress editor binding rather than a client-supplied tab', async () => {
    const editorTarget = { builder: 'etch' as const, canvasId: 'origin', postId: 42 };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ identity: { siteId: 'site', userId: 1, blogId: 1 }, writable: false, editorTarget })));
    const input = { ...session, editorTarget: { ...editorTarget, canvasId: 'other' } };
    await authenticateDirectOwner(input, true);
    expect(input.editorTarget).toEqual(editorTarget);
  });
  it('uses current WordPress ownership rather than a caller-supplied user and survives token rotation',async()=>{
    let userId=1;
    const request=vi.fn(async(_input:unknown)=>Response.json({identity:{siteId:'actual-site',userId,blogId:1},writable:false}));vi.stubGlobal('fetch',request);
    const first=await authenticateDirectOwner({...session,identity:{siteId:'forged-site',userId:99,blogId:99}},true);
    expect(await authenticateDirectOwner({...session,token:'pfdirect_'+'b'.repeat(64)},true)).toBe(first);
    userId=2;expect(await authenticateDirectOwner(session,true)).not.toBe(first);
    expect(String(request.mock.calls[0]?.[0])).toContain('direct%2Fsession');
  });
  it('refreshes integration availability per site and per request without an extra probe', async () => {
    let active = true;
    const request = vi.fn(async () => Response.json({ identity: { siteId: 'site', userId: 1, blogId: 1 }, writable: false, integrations: { bricks: active } }));
    vi.stubGlobal('fetch', request);
    const received: unknown[] = [];
    await authenticateDirectOwner(session, true, undefined, value => received.push(value));
    active = false;
    await authenticateDirectOwner(session, true, undefined, value => received.push(value));
    expect(received).toEqual([{ bricks: true }, { bricks: false }]);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('rejects revoked sessions, permission changes and outdated recovery contracts',async()=>{
    const request=vi.fn().mockResolvedValueOnce(Response.json({message:'Expired'},{status:403}))
      .mockResolvedValueOnce(Response.json({identity:{siteId:'site',userId:1,blogId:1},writable:true}))
      .mockResolvedValueOnce(Response.json({closed:false}));vi.stubGlobal('fetch',request);
    await expect(authenticateDirectOwner(session,true)).rejects.toThrow('authorize');
    await expect(authenticateDirectOwner(session,true)).rejects.toThrow('permission changed');
    await expect(authenticateDirectOwner(session,true)).rejects.toThrow('Update the Pixflow plugin');
  });
  it('redacts credentials inside fields and diagnostic strings before persistence',()=>{
    expect(redactDirectEvent({type:'error',token:'secret',nested:{authorization:'Bearer private'},message:'failed using private'},['private'])).toEqual({type:'error',token:'[redacted]',nested:{authorization:'[redacted]'},message:'failed using [redacted]'});
    expect(directSessionUrl('https://site.example/wp-json/pixflow-design/v1/wp-admin/direct/tools').pathname).toContain('/direct/session');
  });
  it('redacts license and provider credentials inside serialized tool output', () => {
    const result = redactDirectEvent({ output: 'Result: {"license_key":"license-private","refresh_token":"refresh-private","tokenCount":7}', nested: { client_secret: 'provider-private' } }, []);
    expect(JSON.stringify(result)).not.toMatch(/license-private|refresh-private|provider-private/);
    expect(String(result.output)).toContain('"tokenCount":7');
  });
});
