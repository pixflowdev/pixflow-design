import express from 'express';
import http from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { setToken } from '../../src/mcp-tokens.js';
import { registerMcpRoutes } from '../../src/mcp-routes.js';
import { readDirectMcpConfiguration } from '../../src/pixflow/direct-site-mcp.js';
import { authorizeExternalMcp, watchExternalMcpAccess, hasMcpMentions } from '../../src/pixflow/external-mcp-authorization.js';

const oauth = vi.hoisted(()=>({exchange:vi.fn(async()=>({access_token:'fixture-token'}))}));
vi.mock('../../src/mcp-oauth.js',()=>({
  beginAuth:async()=>({state:'fixture-state',pending:{serverId:'docs'},authorizeUrl:'https://example.test/authorize'}),
  exchangeCodeForToken:oauth.exchange, refreshAccessToken:vi.fn(),
}));
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.clearAllMocks();});

it('gates management and OAuth on current site access, preserves saved config, and excludes it from Free runs',async()=>{
  let enabled=true;
  const wp=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({identity:{siteId:'qa',userId:1,blogId:1},writable:false,features:{'external-mcp':enabled}}));});
  await new Promise<void>(resolve=>wp.listen(0,'127.0.0.1',resolve));
  const session={endpoint:`http://127.0.0.1:${(wp.address() as any).port}/tools`,token:'pfdirect_'+'a'.repeat(64),writable:false,expiresAt:Date.now()/1000+300};
  const dir=await mkdtemp(join(tmpdir(),'pixflow-mcp-access-'));
  const pending=new Map();
  const app=express();app.use(express.json());
  registerMcpRoutes(app,{
    http:{isLocalSameOrigin:()=>true,resolvedPortRef:{current:0},sendApiError:vi.fn()},
    paths:{OD_BIN:'unused',RUNTIME_DATA_DIR:dir,PROJECTS_DIR:dir},
    mcp:{pendingAuth:{put:(k:any,v:any)=>pending.set(k,v),consume:(k:any)=>{const v=pending.get(k);pending.delete(k);return v;}},daemonUrlRef:{current:'http://localhost'}},
  } as any);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api/mcp`;
  const headers={'Content-Type':'application/json','X-Pixflow-Mcp-Session':JSON.stringify(session)};
  try {
    for (const path of ['/servers','/servers/','/SERVERS','/oauth/status/','/OAUTH/STATUS']) expect((await fetch(base+path)).status).toBe(403);
    const servers=[{id:'docs',label:'Docs',enabled:true,transport:'http',url:'https://example.test/mcp',authMode:'oauth'}];
    expect((await fetch(base+'/servers',{method:'PUT',headers,body:JSON.stringify({servers})})).status).toBe(200);
    const before=await readFile(join(dir,'mcp-config.json'),'utf8');
    await setToken(dir,'docs',{accessToken:'fixture-access-secret',refreshToken:'fixture-refresh-secret',tokenType:'Bearer',savedAt:Date.now()});
    const tokensBefore=await readFile(join(dir,'mcp-tokens.json'),'utf8');
    expect((await readDirectMcpConfiguration(dir,'codex',true)).codex.docs).toBeDefined();
    expect((await fetch(base+'/oauth/start',{method:'POST',headers,body:JSON.stringify({serverId:'docs'})})).status).toBe(200);
    enabled=false;
    for (const [path,method] of [['/servers','GET'],['/servers','PUT'],['/oauth/start','POST'],['/oauth/status?serverId=docs','GET'],['/oauth/disconnect','POST']] as const) {
      expect((await fetch(base+path,{method,headers,...(method==='POST'||method==='PUT'?{body:JSON.stringify({servers:[],serverId:'docs'})}:{})})).status).toBe(403);
    }
    expect((await fetch(base+'/oauth/callback?state=fixture-state&code=fixture-code')).status).toBe(502);
    expect(oauth.exchange).not.toHaveBeenCalled();
    expect(await readFile(join(dir,'mcp-config.json'),'utf8')).toBe(before);
    expect(await readFile(join(dir,'mcp-tokens.json'),'utf8')).toBe(tokensBefore);
    // Queue admission and resumed conversations build fresh native configuration.
    expect((await readDirectMcpConfiguration(dir,'codex',false)).codex).toEqual({});
    expect((await readDirectMcpConfiguration(dir,'opencode')).opencode).toBeNull();
    await expect(authorizeExternalMcp(session)).rejects.toThrow('requires Pixflow Design Pro');
    enabled=true;
    expect((await fetch(base+'/servers',{headers})).status).toBe(200);
    expect((await readDirectMcpConfiguration(dir,'codex',true)).codex.docs).toBeDefined();
    expect(await readFile(join(dir,'mcp-config.json'),'utf8')).toBe(before);
  } finally {
    server.closeAllConnections();wp.closeAllConnections();
    await Promise.all([new Promise<void>(r=>server.close(()=>r())),new Promise<void>(r=>wp.close(()=>r()))]);
    await rm(dir,{recursive:true,force:true});
  }
});

it('revokes an active external-tool process and denies stale steering when Pro disappears',async()=>{
  vi.useFakeTimers();let enabled=true;
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({identity:{siteId:'qa',userId:1,blogId:1},writable:false,features:{'external-mcp':enabled}})));
  const session={endpoint:'https://example.test/tools',token:'pfdirect_'+'a'.repeat(64),writable:false,expiresAt:1};
  const revoke=vi.fn();const stop=watchExternalMcpAccess(session,revoke);
  await vi.advanceTimersByTimeAsync(5000);expect(revoke).not.toHaveBeenCalled();
  enabled=false;await vi.advanceTimersByTimeAsync(5000);expect(revoke).toHaveBeenCalledOnce();
  await expect(authorizeExternalMcp(session)).rejects.toThrow();
  stop();await vi.advanceTimersByTimeAsync(10000);expect(revoke).toHaveBeenCalledOnce();
  expect(hasMcpMentions({mcpServerIds:['docs']})).toBe(true);
  expect(hasMcpMentions({mcpServerIds:[]})).toBe(false);
});

it('rechecks a transient verification failure without cancelling the admitted run, but still stops after sustained failure', async () => {
  vi.useFakeTimers();
  const healthy = () => Response.json({identity:{siteId:'qa',userId:1,blogId:1},writable:false,features:{'external-mcp':true}});
  const request = vi.fn().mockRejectedValueOnce(new DOMException('Slow WordPress', 'TimeoutError')).mockImplementation(async () => healthy());
  vi.stubGlobal('fetch', request);
  const session = {endpoint:'https://example.test/tools',token:'pfdirect_'+'a'.repeat(64),writable:false,expiresAt:9999999999};
  const revoke = vi.fn(), stop = watchExternalMcpAccess(session, revoke);
  await vi.advanceTimersByTimeAsync(5000);
  expect(request).toHaveBeenCalledTimes(2);
  expect(revoke).not.toHaveBeenCalled();
  request.mockImplementation(async () => { throw new TypeError('Offline'); });
  await vi.advanceTimersByTimeAsync(5000);
  expect(revoke).toHaveBeenCalledOnce();
  stop();
});

it('survives one real verification timeout, without overlapping checks, and rejects an explicit denial immediately', async () => {
  vi.useFakeTimers();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
    return controller.signal;
  });
  const request = vi.fn().mockImplementationOnce(async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  })).mockImplementation(async () => Response.json({identity:{siteId:'qa',userId:1,blogId:1},writable:false,features:{'external-mcp':true}}));
  vi.stubGlobal('fetch', request);
  const session = {endpoint:'https://example.test/tools',token:'pfdirect_'+'a'.repeat(64),writable:false,expiresAt:9999999999};
  const revoke = vi.fn(), stop = watchExternalMcpAccess(session, revoke);
  await vi.advanceTimersByTimeAsync(13_000);
  expect(request).toHaveBeenCalledTimes(2); expect(revoke).not.toHaveBeenCalled();
  request.mockResolvedValue(Response.json({}, { status: 403 }));
  await vi.advanceTimersByTimeAsync(2000);
  expect(request).toHaveBeenCalledTimes(3); expect(revoke).toHaveBeenCalledOnce();
  stop(); timeout.mockRestore();
});
