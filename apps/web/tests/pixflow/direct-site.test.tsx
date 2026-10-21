// @vitest-environment jsdom
import { builderHandoffPersistenceSurface } from '../../src/pixflow/builder-handoff-receiver';
import { directTabStorageKey } from '../../src/pixflow/direct-tab-storage';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';

const requests = vi.hoisted(() => ({ wordpress: vi.fn(), daemon: vi.fn(), entitlement: vi.fn(), config: vi.fn() }));
vi.mock('../../src/pixflow/optional-bridge', () => ({ fetchPixflowOptionalBridgeConfig: requests.config }));
vi.mock('../../src/pixflow/license', () => ({ ensurePixflowLicenseEntitlement: requests.entitlement }));
vi.mock('../../src/pixflow/runtime-fetch', () => ({ pixflowWordPressRestFetch: requests.wordpress, pixflowRuntimeFetch: requests.daemon }));
vi.mock('../../src/i18n', async (original) => { const actual = await original<typeof import('../../src/i18n')>(); return { ...actual, useT: () => (key: Parameters<typeof actual.translateLocale>[1]) => actual.translateLocale('en', key) }; });
import { runDirectSite, steerDirectSite, pendingDirectSiteRun, DirectSiteRunError, directConversationId, DIRECT_BRICKS_RUN_STORAGE, SiteAccessNotice, useSiteAccess, useDirectAttachmentProject } from '../../src/pixflow/direct-site';

afterEach(() => { cleanup(); window.sessionStorage.clear(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe('direct site panel', () => {
  it.each(['gutenberg', 'bricks'] as const)('does not resume, replace or clear an inherited %s checkpoint during a new handoff', async builder => {
    const regularSurface = builder === 'gutenberg' ? 'admin' : 'bricks';
    const input = {agentId:'codex',prompt:'Old page',history:[],mode:'design',persistenceMetadata:{id:'old-message'},signal:new AbortController().signal,onUpdate:vi.fn()};
    requests.wordpress.mockImplementation(async () => Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:true}));
    requests.daemon.mockResolvedValueOnce(new Response('malformed\n'));
    await expect(runDirectSite({...input,persistenceSurface:regularSurface})).rejects.toMatchObject({outcome:'interrupted'});
    const inherited = pendingDirectSiteRun(regularSurface);
    expect(inherited).not.toBeNull();
    const id = 'b'.repeat(64), tabId = 'tab-9876543210123456';
    window.history.replaceState({}, '', `/wp-admin/post.php?post=88&action=edit&pixflow_handoff=${id}&pixflow_handoff_tab=${tabId}`);
    const surface = builderHandoffPersistenceSurface(builder);
    expect(pendingDirectSiteRun(surface)).toBeNull();
    requests.daemon.mockResolvedValueOnce(new Response('malformed\n'));
    await expect(runDirectSite({...input,prompt:'New page',persistenceSurface:surface,persistenceMetadata:{id:'handoff-message'}})).rejects.toMatchObject({outcome:'interrupted'});
    const own = pendingDirectSiteRun(surface)!;
    expect(own.metadata).toEqual({id:'handoff-message'});
    expect(own.connection.id).not.toBe(inherited!.connection.id);
    requests.daemon.mockResolvedValueOnce(new Response('{"type":"done","sequence":1,"ok":true,"outcome":"completed"}\n'));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({closed:true})));
    await runDirectSite({...input,persistenceSurface:surface,resume:own});
    expect(JSON.parse(requests.daemon.mock.calls.at(-1)![1].body).id).toBe(own.connection.id);
    expect(pendingDirectSiteRun(surface)).toBeNull();
    expect(pendingDirectSiteRun(regularSurface)).toEqual(inherited);
    window.history.replaceState({}, '', '/');
  });

  it.each([200, 409])('acknowledges builder admission only after a successful Bridge response (%s)', async status => {
    requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:true}));
    requests.daemon.mockResolvedValue(new Response(status === 200 ? '{"type":"done","sequence":1,"ok":true,"outcome":"completed"}\n' : 'Busy', {status}));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({closed:true})));
    const onAccepted=vi.fn(async()=>undefined);
    const run=runDirectSite({agentId:'codex',prompt:'Build',history:[],mode:'design',signal:new AbortController().signal,onUpdate:vi.fn(),onAccepted});
    if(status===200) await expect(run).resolves.toBe('completed'); else await expect(run).rejects.toThrow();
    expect(onAccepted).toHaveBeenCalledTimes(status===200?1:0);
    expect(JSON.parse(requests.daemon.mock.calls[0]![1].body)).not.toHaveProperty('onAccepted');
  });

  it('replays oversized checkpoints from Bridge without duplicating historical tool logs in storage', async()=>{
    requests.wordpress.mockImplementation(async()=>Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:true}));
    requests.daemon.mockResolvedValueOnce(new Response(JSON.stringify({type:'text_delta',sequence:1,delta:'x'.repeat(300_000)})+'\nmalformed\n'));
    const warning=vi.spyOn(console,'warn').mockImplementation(()=>undefined);
    const input={agentId:'codex',prompt:'Inspect',history:[],mode:'design',persistenceMetadata:{messages:[{id:'previous',content:'Answer',attachments:[{path:'keep.png'}],events:[{kind:'tool_result',content:'x'.repeat(2_000_000)}]}]},signal:new AbortController().signal,onUpdate:vi.fn()};
    await expect(runDirectSite(input)).rejects.toMatchObject({outcome:'interrupted'});
    const saved=pendingDirectSiteRun()!;
    expect(saved.checkpoint).toBeUndefined();
    expect(saved.metadata).toEqual({messages:[{id:'previous',content:'Answer',attachments:[{path:'keep.png'}]}]});
    requests.daemon.mockResolvedValueOnce(new Response('{"type":"text_delta","sequence":1,"delta":"Replayed"}\n{"type":"done","sequence":2,"ok":true,"outcome":"completed"}\n'));
    await runDirectSite({...input,resume:saved});
    expect(JSON.parse(requests.daemon.mock.calls[1]![1].body)).toMatchObject({afterSequence:0});
    expect(input.onUpdate.mock.calls.at(-1)?.[0]).toBe('Replayed');
    warning.mockRestore();
  });
  it.each(['bricks', 'admin'])('keeps %s steering and Stop ownership when recovery storage is full', async (surface) => {
    const original = Storage.prototype.setItem;
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key, value) {
      if (key.includes(DIRECT_BRICKS_RUN_STORAGE)) throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    });
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    requests.wordpress.mockImplementation(async () => Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:true}));
    requests.daemon.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/run-stream')) return new Response(new ReadableStream({start(controller) { stream = controller; }}));
      if (url.endsWith('/steer')) return Response.json({messageId:JSON.parse(String(init.body)).messageId,state:'accepted'});
      return Response.json({canceled:true});
    });
    const stop = new AbortController();
    const running = runDirectSite({agentId:'codex',prompt:'Inspect',history:[],mode:'design',persistenceSurface:surface,persistenceMetadata:{messages:[]},signal:stop.signal,onUpdate:vi.fn()});
    const finished = expect(running).rejects.toMatchObject({name:'AbortError'});
    try {
      await vi.waitFor(() => expect(stream).toBeDefined());
      const item = {id:'steer-storage-test',prompt:'Also inspect the heading',attachments:[],comments:[],state:'queued' as const};
      expect(await steerDirectSite(surface, item)).toMatchObject({state:'accepted'});
      requests.daemon.mockResolvedValueOnce(Response.json({state:'rejected',code:'DIRECT_AUTH_UNAVAILABLE',message:'WordPress could not verify access right now.'},{status:503}));
      expect(await steerDirectSite(surface, {...item,id:'temporarily-unavailable'})).toMatchObject({state:'rejected',message:'WordPress could not verify access right now.'});
      const start = JSON.parse(requests.daemon.mock.calls.find(call=>call[0].endsWith('/run-stream'))![1].body);
      expect(start.continuation).toMatchObject({id:expect.stringMatching(/^[a-f0-9]{32}$/),token:expect.stringMatching(/^[a-f0-9]{64}$/)});
      expect(JSON.parse(requests.daemon.mock.calls.find(call=>call[0].endsWith('/steer'))![1].body)).toMatchObject(start.continuation);
      stop.abort(); stream.close();
      await finished;
      expect(JSON.parse(requests.daemon.mock.calls.find(call=>call[0].endsWith('/cancel'))![1].body)).toMatchObject(start.continuation);
      expect(await steerDirectSite(surface,item)).toMatchObject({state:'rejected'});
    } finally { stop.abort(); try { stream?.close(); } catch {} storage.mockRestore(); await finished; }
  });
  it('survives a temporary network failure during reconnect without resubmitting work', async () => {
    requests.wordpress.mockImplementation(async () => Response.json({endpoint:'https://site.example/tools',token:'recovery-session',writable:true}));
    requests.daemon.mockResolvedValueOnce(new Response('{"type":"text_delta","sequence":1,"delta":"Before. "}\n'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('{"type":"text_delta","sequence":1,"delta":"Before. "}\n{"type":"text_delta","sequence":2,"delta":"After."}\n{"type":"done","sequence":3,"ok":true,"outcome":"completed"}\n'));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({closed:true})));
    const onUpdate=vi.fn();
    await expect(runDirectSite({agentId:'codex',prompt:'Build',history:[],mode:'design',persistenceMetadata:{id:'temporary-disconnect'},signal:new AbortController().signal,onUpdate})).resolves.toBe('completed');
    expect(requests.daemon.mock.calls.map(call=>call[0])).toEqual(['/api/pixflow/direct-site/run-stream','/api/pixflow/direct-site/resume-stream','/api/pixflow/direct-site/resume-stream']);
    const initial=JSON.parse(requests.daemon.mock.calls[0]![1].body);
    for(const call of requests.daemon.mock.calls.slice(1)) {
      expect(JSON.parse(call[1].body)).toMatchObject({...initial.continuation,afterSequence:1});
      expect(JSON.parse(call[1].body)).not.toHaveProperty('prompt');
    }
    expect(onUpdate.mock.calls.at(-1)?.[0]).toBe('Before. After.');
  });

  it('recovers from unavailable WordPress verification by reattaching the same run without resubmitting work', async () => {
    requests.wordpress.mockImplementation(async () => Response.json({endpoint:'https://site.example/tools',token:'recovery-session',writable:true}));
    requests.daemon.mockResolvedValueOnce(new Response('{"type":"text_delta","sequence":1,"delta":"Before. "}\n'))
      .mockResolvedValueOnce(Response.json({code:'DIRECT_AUTH_UNAVAILABLE',message:'WordPress could not verify access right now.'},{status:503}))
      .mockResolvedValueOnce(new Response('{"type":"text_delta","sequence":1,"delta":"Before. "}\n{"type":"text_delta","sequence":2,"delta":"After."}\n{"type":"done","sequence":3,"ok":true,"outcome":"completed"}\n'));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({closed:true})));
    const onUpdate=vi.fn();
    await expect(runDirectSite({agentId:'codex',prompt:'Build',history:[],mode:'design',persistenceMetadata:{id:'temporary-verification-outage'},signal:new AbortController().signal,onUpdate})).resolves.toBe('completed');
    expect(requests.daemon.mock.calls.map(call=>call[0])).toEqual(['/api/pixflow/direct-site/run-stream','/api/pixflow/direct-site/resume-stream','/api/pixflow/direct-site/resume-stream']);
    expect(onUpdate.mock.calls.at(-1)?.[0]).toBe('Before. After.');
  });
  it.each(['', '{"type":'])('recovers a connection closed before its first event %j', async (tail) => {
    requests.wordpress.mockImplementation(async()=>Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:true}));
    requests.daemon.mockResolvedValueOnce(new Response(tail)).mockResolvedValueOnce(new Response('{"type":"done","sequence":1,"ok":true,"outcome":"completed"}\n'));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({closed:true})));
    await expect(runDirectSite({agentId:'codex',prompt:'Inspect',history:[],mode:'design',persistenceMetadata:{id:'early'},signal:new AbortController().signal,onUpdate:vi.fn()})).resolves.toBe('completed');
    expect(JSON.parse(requests.daemon.mock.calls[1]![1].body).afterSequence).toBe(0);
    expect(requests.daemon.mock.calls[1]![0]).toBe('/api/pixflow/direct-site/resume-stream');
  });
  it('honors Stop during reconnect backoff and cancels the owned run once', async () => {
    requests.wordpress.mockImplementation(async()=>Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:true}));
    const stop=new AbortController();
    requests.daemon.mockImplementation(async(path:string)=>{
      if(path.endsWith('/run-stream'))return new Response('{"type":"text_delta","sequence":1,"delta":"Retained."}\n');
      if(path.endsWith('/resume-stream')){setTimeout(()=>stop.abort(),0);throw new TypeError('Failed to fetch');}
      return Response.json({canceled:true});
    });
    await expect(runDirectSite({agentId:'codex',prompt:'Build',history:[],mode:'design',persistenceMetadata:{id:'stop-recovery'},signal:stop.signal,onUpdate:vi.fn()})).rejects.toMatchObject({name:'AbortError'});
    expect(requests.daemon.mock.calls.map(call=>call[0])).toEqual(['/api/pixflow/direct-site/run-stream','/api/pixflow/direct-site/resume-stream','/api/pixflow/direct-site/cancel']);
    expect(pendingDirectSiteRun()).toBeNull();
  });
  it('gives separate outages a fresh recovery budget only after new sequenced activity', async () => {
    requests.wordpress.mockImplementation(async()=>Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:true}));
    for(let sequence=1;sequence<=4;sequence++) requests.daemon.mockResolvedValueOnce(new Response(JSON.stringify({type:'text_delta',sequence,delta:String(sequence)})+'\n'));
    requests.daemon.mockResolvedValueOnce(new Response('{"type":"done","sequence":5,"ok":true,"outcome":"completed"}\n'));
    const onUpdate=vi.fn();
    await expect(runDirectSite({agentId:'codex',prompt:'Inspect',history:[],mode:'design',persistenceMetadata:{id:'separate-outages'},signal:new AbortController().signal,onUpdate})).resolves.toBe('completed');
    expect(requests.daemon.mock.calls.filter(call=>call[0].endsWith('/run-stream'))).toHaveLength(1);
    expect(requests.daemon.mock.calls.slice(1).map(call=>JSON.parse(call[1].body).afterSequence)).toEqual([1,2,3,4]);
    expect(onUpdate.mock.calls.at(-1)?.[0]).toBe('1234');
  });
  it('retries temporary WordPress recovery authorization failure, not the run', async () => {
    requests.wordpress.mockResolvedValueOnce(Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:true}))
      .mockResolvedValueOnce(Response.json({message:'Unavailable'},{status:503}))
      .mockResolvedValueOnce(Response.json({endpoint:'https://site.example/tools',token:'recovery-token',writable:true}));
    requests.daemon.mockResolvedValueOnce(new Response('{"type":"text_delta","sequence":1,"delta":"Kept."}\n'))
      .mockResolvedValueOnce(new Response('{"type":"done","sequence":2,"ok":true,"outcome":"completed"}\n'));
    await expect(runDirectSite({agentId:'codex',prompt:'Inspect',history:[],mode:'design',persistenceMetadata:{id:'authorization-outage'},signal:new AbortController().signal,onUpdate:vi.fn()})).resolves.toBe('completed');
    expect(requests.daemon.mock.calls.map(call=>call[0])).toEqual(['/api/pixflow/direct-site/run-stream','/api/pixflow/direct-site/resume-stream']);
    expect(JSON.parse(requests.daemon.mock.calls[1]![1].body).session.token).toBe('recovery-token');
  });
  it.each(['', '{"type":"text_delta","sequence":2,"delta":"truncated'])('recovers a quiet EOF with an incomplete tail %j without repeating work', async (tail) => {
    requests.wordpress.mockImplementation(async () => Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:true}));
    requests.daemon.mockResolvedValueOnce(new Response('{"type":"text_delta","sequence":1,"delta":"First. "}\n' + tail))
      .mockResolvedValueOnce(new Response('{"type":"text_delta","sequence":1,"delta":"First. "}\n{"type":"text_delta","sequence":2,"delta":"Second."}\n{"type":"done","sequence":3,"ok":true,"outcome":"completed"}'));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({closed:true})));
    const onUpdate=vi.fn();
    await expect(runDirectSite({agentId:'codex',prompt:'Inspect',history:[],mode:'design',persistenceMetadata:{id:'eof'},signal:new AbortController().signal,onUpdate})).resolves.toBe('completed');
    expect(requests.daemon.mock.calls.map(call=>call[0])).toEqual(['/api/pixflow/direct-site/run-stream','/api/pixflow/direct-site/resume-stream']);
    expect(JSON.parse(requests.daemon.mock.calls[1]![1].body)).toMatchObject({afterSequence:1});
    expect(JSON.parse(requests.daemon.mock.calls[1]![1].body)).not.toHaveProperty('prompt');
    expect(onUpdate.mock.calls.at(-1)?.[0]).toBe('First. Second.');
  });

  it('distinguishes malformed activity from a disconnected Bridge without exposing the payload', async () => {
    requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:true}));
    requests.daemon.mockResolvedValue(new Response('private malformed payload\n'));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({closed:true})));
    const warning=vi.spyOn(console,'warn').mockImplementation(()=>undefined);
    try {
      await expect(runDirectSite({agentId:'codex',prompt:'Inspect',history:[],mode:'design',signal:new AbortController().signal,onUpdate:vi.fn()})).rejects.toMatchObject({outcome:'interrupted',message:expect.stringContaining('activity data'),cause:expect.any(SyntaxError)});
      expect(JSON.stringify(warning.mock.calls)).not.toContain('private malformed payload');
      expect(warning).toHaveBeenCalledWith('[Pixflow] Direct run interrupted',expect.objectContaining({stage:'activity',sequence:0,errorName:'SyntaxError'}));
    } finally { warning.mockRestore(); }
  });
  it('bounds quiet-close recovery and retains the last confirmed checkpoint', async () => {
    requests.wordpress.mockImplementation(async()=>Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:true}));
    requests.daemon.mockImplementation(async()=>new Response('{"type":"text_delta","sequence":1,"delta":"Retained."}\n'));
    const onUpdate=vi.fn();
    await expect(runDirectSite({agentId:'codex',prompt:'Inspect',history:[],mode:'design',persistenceMetadata:{id:'bounded'},signal:new AbortController().signal,onUpdate})).rejects.toMatchObject({outcome:'interrupted'});
    expect(requests.daemon.mock.calls.map(call=>call[0])).toEqual(['/api/pixflow/direct-site/run-stream','/api/pixflow/direct-site/resume-stream','/api/pixflow/direct-site/resume-stream']);
    expect(pendingDirectSiteRun()?.checkpoint).toMatchObject({sequence:1,content:'Retained.'});
    expect(onUpdate.mock.calls.at(-1)?.[0]).toBe('Retained.');
  });
  it('preserves the cause of a reader failure for diagnosis', async () => {
    requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:true}));
    const cause=new TypeError('private transport details');
    requests.daemon.mockResolvedValue(new Response(new ReadableStream({start(controller){controller.error(cause);}})));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({closed:true})));
    const warning=vi.spyOn(console,'warn').mockImplementation(()=>undefined);
    try {
      await expect(runDirectSite({agentId:'codex',prompt:'Inspect',history:[],mode:'design',signal:new AbortController().signal,onUpdate:vi.fn()})).rejects.toMatchObject({outcome:'interrupted',cause});
      expect(warning).toHaveBeenCalledWith('[Pixflow] Direct run interrupted',expect.objectContaining({stage:'connection',sequence:0,errorName:'TypeError'}));
      expect(JSON.stringify(warning.mock.calls)).not.toContain('private transport details');
    } finally { warning.mockRestore(); }
  });
  it('keeps a confirmed completion when the transport closes with an error afterwards', async () => {
    requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:true}));
    let reads=0;
    requests.daemon.mockResolvedValue(new Response(new ReadableStream({pull(controller){
      if(reads++===0)controller.enqueue(new TextEncoder().encode('{"type":"text_delta","sequence":1,"delta":"Saved."}\n{"type":"done","sequence":2,"ok":true,"outcome":"completed"}\n'));
      else controller.error(new TypeError('connection closed'));
    }})));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({closed:true})));
    const onUpdate=vi.fn();
    await expect(runDirectSite({agentId:'codex',prompt:'Inspect',history:[],mode:'design',persistenceMetadata:{id:'terminal'},signal:new AbortController().signal,onUpdate})).resolves.toBe('completed');
    expect(requests.daemon).toHaveBeenCalledOnce();
    expect(onUpdate.mock.calls.at(-1)?.[0]).toBe('Saved.');
  });
  it('reattaches a dropped reader to the same run without repeating a prompt or streamed text', async () => {
    requests.wordpress.mockResolvedValueOnce(Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:true}))
      .mockResolvedValueOnce(Response.json({endpoint:'https://site.example/tools',token:'recovery-token',writable:true}));
    let reads=0;
    requests.daemon.mockResolvedValueOnce(new Response(new ReadableStream({pull(controller){
      if(reads++===0)controller.enqueue(new TextEncoder().encode('{"type":"text_delta","sequence":1,"delta":"First. "}\n'));
      else controller.error(new TypeError('network connection lost'));
    }}))).mockResolvedValueOnce(new Response('{"type":"text_delta","sequence":1,"delta":"First. "}\n{"type":"text_delta","sequence":2,"delta":"Second."}\n{"type":"done","sequence":3,"ok":true,"outcome":"completed"}\n'));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({closed:true})));
    const onUpdate=vi.fn();
    await expect(runDirectSite({agentId:'codex',prompt:'Inspect',history:[],mode:'design',persistenceMetadata:{id:'retry'},signal:new AbortController().signal,onUpdate})).resolves.toBe('completed');
    expect(requests.daemon.mock.calls.map(call=>call[0])).toEqual(['/api/pixflow/direct-site/run-stream','/api/pixflow/direct-site/resume-stream']);
    const initial=JSON.parse(requests.daemon.mock.calls[0]![1].body);
    const resumed=JSON.parse(requests.daemon.mock.calls[1]![1].body);
    expect(resumed).toMatchObject({...initial.continuation,afterSequence:1});
    expect(resumed.session.token).toBe('recovery-token');
    expect(initial.session.token).toBe('session-token');
    expect(resumed).not.toHaveProperty('prompt');
    expect(onUpdate.mock.calls.at(-1)?.[0]).toBe('First. Second.');
  });
  it('does not forward API credentials or provider configuration to CLI runs', async () => {
    requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:true}));
    requests.daemon.mockResolvedValue(new Response('{"type":"done","ok":true,"outcome":"answered"}\n'));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({closed:true})));
    await runDirectSite({config:{mode:'daemon',apiKey:'private-api-key'} as any,agentId:'codex',prompt:'Hello',history:[],mode:'design',signal:new AbortController().signal,onUpdate:vi.fn()});
    const body=JSON.parse(requests.daemon.mock.calls[0]![1].body);
    expect(body).not.toHaveProperty('config');
    expect(JSON.stringify(body)).not.toContain('private-api-key');
  });
  it('captures design guidance for each new request without rereading it during resume', async () => {
    requests.config.mockResolvedValueOnce({ enhancedDesignGuidance: true }).mockResolvedValueOnce({ enhancedDesignGuidance: false });
    requests.wordpress.mockImplementation(async () => Response.json({ endpoint: 'https://site.example/tools', token: 'session-token', writable: false }));
    requests.daemon.mockResolvedValueOnce(new Response('{"type":"text_delta","delta":"Before"}\n'))
      .mockResolvedValueOnce(new Response('{"type":"done","ok":true,"outcome":"answered"}\n'))
      .mockResolvedValueOnce(new Response('{"type":"done","ok":true,"outcome":"answered"}\n'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ closed: true })));
    const input = { agentId: 'codex', prompt: 'Inspect this page', history: [], mode: 'ask', signal: new AbortController().signal, onUpdate: vi.fn() };
    await expect(runDirectSite({ ...input, persistenceMetadata: { id: 'guidance' } })).rejects.toThrow('before completion');
    expect(JSON.parse(requests.daemon.mock.calls[0]?.[1].body).enhancedDesignGuidance).toBe(true);
    await runDirectSite({ ...input, resume: pendingDirectSiteRun()! });
    expect(requests.entitlement).toHaveBeenNthCalledWith(1,{allowSiteSwitch:true});
    expect(requests.entitlement).toHaveBeenNthCalledWith(2,{allowSiteSwitch:false});
    expect(requests.config).toHaveBeenCalledTimes(1);
    await runDirectSite(input);
    expect(JSON.parse(requests.daemon.mock.calls[2]?.[1].body).enhancedDesignGuidance).toBe(false);
  });
  it('flushes pending text on cancel and ignores buffered terminal events after cancellation', async () => {
    requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:false}));
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    requests.daemon.mockResolvedValue(new Response(new ReadableStream({start(controller){stream=controller;}})));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({closed:true})));
    const controller=new AbortController();const onUpdate=vi.fn();const onOutcome=vi.fn();
    const run=runDirectSite({agentId:'codex',prompt:'Inspect',history:[],mode:'ask',signal:controller.signal,onUpdate,onOutcome});
    const rejected=expect(run).rejects.toMatchObject({name:'AbortError'});
    await waitFor(()=>expect(requests.daemon).toHaveBeenCalled());
    stream.enqueue(new TextEncoder().encode('{"type":"text_delta","delta":"Retained"}\n'));
    await new Promise(resolve=>setTimeout(resolve,0));
    controller.abort();
    expect(onUpdate.mock.calls.at(-1)?.[0]).toBe('Retained');
    const updates=onUpdate.mock.calls.length;
    stream.enqueue(new TextEncoder().encode('{"type":"text_delta","delta":"late"}\n{"type":"done","ok":true}\n'));stream.close();
    await rejected;
    expect(onUpdate).toHaveBeenCalledTimes(updates);expect(onOutcome).not.toHaveBeenCalled();
  });
  it('coalesces a burst without dropping ordered events and flushes before the outcome', async () => {
    requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:false}));
    const lines=Array.from({length:4000},(_,i)=>JSON.stringify({type:'text_delta',delta:String(i%10),sequence:i+1}));
    requests.daemon.mockResolvedValue(new Response([...lines,JSON.stringify({type:'done',ok:true,outcome:'answered',sequence:4001})].join('\n')));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({closed:true})));
    const onUpdate=vi.fn();
    const onOutcome=vi.fn(()=>expect(onUpdate.mock.calls.at(-1)?.[0]).toBe('0123456789'.repeat(400)));
    await runDirectSite({agentId:'codex',prompt:'Inspect',history:[],mode:'ask',signal:new AbortController().signal,onUpdate,onOutcome});
    expect(onUpdate.mock.calls.length).toBeLessThan(5);
    expect(onUpdate.mock.calls.at(-1)?.[1]).toHaveLength(4000);
    expect(onUpdate.mock.calls.at(-1)?.[1].map((event:{text:string})=>event.text).join('')).toBe('0123456789'.repeat(400));
    expect(onOutcome).toHaveBeenCalledOnce();
  });
  it('retains the recorded finish time when an interrupted run is recovered later',async()=>{
    requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:false}));
    requests.daemon.mockResolvedValue(new Response('{"type":"done","ok":false,"outcome":"interrupted","message":"Bridge restarted","timestamp":1791134611964}\n'));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({closed:true})));
    const onOutcome=vi.fn();
    await expect(runDirectSite({agentId:'codex',prompt:'',history:[],mode:'ask',signal:new AbortController().signal,onUpdate:vi.fn(),onOutcome})).rejects.toMatchObject({outcome:'interrupted'});
    expect(onOutcome).toHaveBeenCalledWith('interrupted',1791134611964);
  });
  it('preserves an owned checkpoint when reconnect setup cannot reach the Bridge',async()=>{
    requests.entitlement.mockRejectedValue(new Error('Network unavailable'));
    const checkpoint={content:'Retained partial answer',events:[{kind:'text' as const,text:'Retained partial answer'}],sequence:2};
    const pending={connection:{id:'a'.repeat(32),token:'b'.repeat(64)},metadata:{id:'message'},checkpoint};
    window.sessionStorage.setItem(directTabStorageKey(DIRECT_BRICKS_RUN_STORAGE),JSON.stringify(pending));
    const onUpdate=vi.fn();
    await expect(runDirectSite({agentId:'codex',prompt:'',history:[],mode:'ask',resume:pending,signal:new AbortController().signal,onUpdate})).rejects.toMatchObject({outcome:'interrupted'});
    expect(onUpdate).toHaveBeenCalledWith(checkpoint.content,checkpoint.events);
    expect(pendingDirectSiteRun()?.checkpoint).toEqual(checkpoint);
    expect(requests.daemon).not.toHaveBeenCalled();
  });
  it('uses the page conversation rather than a replaceable canvas connection', async () => {
    requests.wordpress.mockImplementation(async()=>Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:false}));
    requests.daemon.mockImplementation(async()=>new Response('{"type":"text_delta","delta":"Answer"}\n{"type":"done","ok":true,"outcome":"answered"}\n'));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({closed:true})));
    const base={agentId:'codex',prompt:'Inspect',history:[],mode:'ask',canvasPostId:12,signal:new AbortController().signal,onUpdate:vi.fn()};
    await runDirectSite({...base,canvasId:'old-mailbox'});
    await runDirectSite({...base,canvasId:'new-mailbox',history:[{role:'user',content:'Inspect'},{role:'assistant',content:'Answer'}]});
    const bodies=requests.daemon.mock.calls.map(([,init])=>JSON.parse(init.body));
    expect(bodies[1].conversationId).toBe(bodies[0].conversationId);
    expect(bodies[1].canvasId).toBe('new-mailbox');
    await runDirectSite({...base,canvasPostId:34,canvasId:'new-mailbox',history:[{role:'user',content:'Inspect'}]});
    expect(JSON.parse(requests.daemon.mock.calls[2]?.[1].body).conversationId).not.toBe(bodies[0].conversationId);
  });
  it('keeps a connected canvas enabled while refreshing settings between turns', async () => {
    let finishRefresh!: (response: Response) => void;
    requests.wordpress.mockResolvedValueOnce(Response.json({ guarded: false }))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { finishRefresh = resolve; }));
    const hook = renderHook(({ busy }) => useSiteAccess(busy), { initialProps: { busy: false } });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    hook.rerender({ busy: true });
    hook.rerender({ busy: false });
    expect(requests.wordpress).toHaveBeenCalledTimes(2);
    expect(hook.result.current.ready && !hook.result.current.guarded).toBe(true);
    await act(async () => { finishRefresh(Response.json({ guarded: false })); });
    expect(hook.result.current.ready && !hook.result.current.guarded).toBe(true);
  });
  it('keeps sitemap and Bricks continuation records independent', () => {
    const record = { connection: { id: 'a'.repeat(32), token: 'b'.repeat(64) }, metadata: { surface: 'sitemap' } };
    window.sessionStorage.setItem(directTabStorageKey(`${DIRECT_BRICKS_RUN_STORAGE}:sitemap`), JSON.stringify(record));
    expect(pendingDirectSiteRun()).toBeNull();
    expect(pendingDirectSiteRun('sitemap')?.metadata).toEqual({ surface: 'sitemap' });
  });
  it('does not restore another WordPress installation on the same browser origin', () => {
    const target=window as unknown as {__PIXFLOW_DESIGN_WORDPRESS__?:{restBaseUrl:string}};
    try {
      target.__PIXFLOW_DESIGN_WORDPRESS__={restBaseUrl:'https://host.test/site-a/wp-json/pixflow-design/v1'};
      window.sessionStorage.setItem(directTabStorageKey(DIRECT_BRICKS_RUN_STORAGE),JSON.stringify({connection:{id:'a'.repeat(32),token:'b'.repeat(64)},metadata:{id:'first'}}));
      expect(pendingDirectSiteRun()?.metadata).toEqual({id:'first'});
      target.__PIXFLOW_DESIGN_WORDPRESS__={restBaseUrl:'https://host.test/site-b/wp-json/pixflow-design/v1'};
      expect(pendingDirectSiteRun()).toBeNull();
    } finally {delete target.__PIXFLOW_DESIGN_WORDPRESS__;}
  });
  it('reauthorizes a disconnected run without launching again or duplicating text', async () => {
    requests.wordpress.mockImplementation(async()=>Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:true,expiresAt:9999999999}));
    requests.daemon.mockResolvedValueOnce(new Response('{"type":"text_delta","delta":"Before."}\n'))
      .mockResolvedValueOnce(new Response('{"type":"text_delta","delta":"Before."}\n{"type":"text_delta","delta":"After."}\n{"type":"done","ok":true}\n'));
    const revoke=vi.fn().mockResolvedValue(Response.json({closed:true}));vi.stubGlobal('fetch',revoke);
    const base={agentId:'codex',prompt:'Build',history:[],mode:'design',signal:new AbortController().signal,onUpdate:vi.fn()};
    await expect(runDirectSite({...base,persistenceMetadata:{id:'message'}})).rejects.toThrow('before completion');
    const pending=pendingDirectSiteRun();expect(pending?.metadata).toEqual({id:'message'});
    expect(window.sessionStorage.getItem(directTabStorageKey(DIRECT_BRICKS_RUN_STORAGE))).not.toContain('session-token');
    const onUpdate=vi.fn();await runDirectSite({...base,resume:pending!,onUpdate});
    expect(requests.wordpress).toHaveBeenCalledTimes(2);
    expect(requests.daemon.mock.calls[1]?.[0]).toBe('/api/pixflow/direct-site/resume-stream');
    expect(onUpdate.mock.calls.at(-1)?.[0]).toBe('Before.After.');
    expect(pendingDirectSiteRun()).toBeNull();expect(revoke).toHaveBeenCalledOnce();
  });

  it('hydrates a sequenced checkpoint and ignores repeated events after reconnecting', async () => {
    requests.wordpress.mockImplementation(async()=>Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:false,expiresAt:9999999999}));
    requests.daemon.mockResolvedValueOnce(new Response('{"type":"text_delta","delta":"Before.","sequence":1}\n'))
      .mockResolvedValueOnce(Response.json({message:'Temporarily unavailable'},{status:503}))
      .mockResolvedValueOnce(Response.json({message:'Temporarily unavailable'},{status:503}))
      .mockResolvedValueOnce(Response.json({message:'Temporarily unavailable'},{status:503}))
      .mockResolvedValueOnce(new Response('{"type":"text_delta","delta":"Before.","sequence":1}\n{"type":"text_delta","delta":"After.","sequence":2}\n{"type":"done","ok":true,"outcome":"answered","sequence":3}\n'));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({closed:true})));
    const base={agentId:'codex',prompt:'Inspect',history:[],mode:'ask',signal:new AbortController().signal,onUpdate:vi.fn()};
    await expect(runDirectSite({...base,persistenceMetadata:{id:'message'}})).rejects.toBeInstanceOf(DirectSiteRunError);
    const pending=pendingDirectSiteRun()!;
    expect(pending.checkpoint?.sequence).toBe(1);
    const onUpdate=vi.fn();
    expect(await runDirectSite({...base,mode:'design',resume:pending,onUpdate})).toBe('answered');
    expect(onUpdate.mock.calls.at(-1)?.[0]).toBe('Before.After.');
    expect(JSON.parse(requests.daemon.mock.calls[4]?.[1].body).afterSequence).toBe(1);
    expect(JSON.parse(requests.wordpress.mock.calls[1]?.[1].body).mode).toBe('design');
  });

  it('uses terminal success after an earlier diagnostic error and distinguishes interruption', async () => {
    requests.wordpress.mockImplementation(async()=>Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:false,expiresAt:9999999999}));
    requests.daemon.mockResolvedValueOnce(new Response('{"type":"error","message":"Temporary"}\n{"type":"text_delta","delta":"Repaired"}\n{"type":"done","ok":true,"outcome":"answered"}\n'))
      .mockResolvedValueOnce(new Response('{"type":"text_delta","delta":"Partial"}\n{"type":"done","ok":false,"outcome":"interrupted","message":"Bridge restarted"}\n'));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({closed:true})));
    const base={agentId:'codex',prompt:'Inspect',history:[],mode:'ask',signal:new AbortController().signal,onUpdate:vi.fn()};
    expect(await runDirectSite(base)).toBe('answered');
    await expect(runDirectSite(base)).rejects.toMatchObject({outcome:'interrupted',message:'Bridge restarted'});
  });

  it('starts new conversation identities for fresh/forked histories and retains compatible follow-ups', () => {
    const first=directConversationId('admin',[]);
    const history=[{role:'user',content:'First'},{role:'assistant',content:'Answer'}];
    expect(directConversationId('admin',history)).toBe(first);
    const fork=directConversationId('admin',[]);
    expect(fork).not.toBe(first);
    expect(directConversationId('admin',history)).toBe(fork);
    const greetingOnly=directConversationId('admin',[{role:'system',content:'Agent ready'}]);
    expect(greetingOnly).not.toBe(fork);
    expect(directConversationId('admin',history)).toBe(greetingOnly);
    expect(directConversationId('sitemap',history)).not.toBe(fork);
  });

  it('sends explicit Stop for a continued run instead of relying on stream disconnection', async () => {
    requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:true,expiresAt:9999999999}));
    const controller=new AbortController();
    requests.daemon.mockImplementation(async(url:string)=>{
      if(url.endsWith('/cancel'))return Response.json({canceled:true});
      return new Response(new ReadableStream({start(stream){
        stream.enqueue(new TextEncoder().encode('{"type":"text_delta","delta":"Started"}\n'));
        controller.signal.addEventListener('abort',()=>stream.error(new DOMException('Stopped','AbortError')));
      }}));
    });
    await expect(runDirectSite({agentId:'codex',prompt:'Build',history:[],mode:'design',signal:controller.signal,persistenceMetadata:{id:'message'},onUpdate:()=>controller.abort()})).rejects.toThrow('Stopped');
    expect(requests.daemon.mock.calls.some(([url])=>url==='/api/pixflow/direct-site/cancel')).toBe(true);
    expect(pendingDirectSiteRun()).toBeNull();
  });
  it('creates one upload project for concurrent attachment selections', async () => {
    requests.daemon.mockResolvedValue(Response.json({ project: { id: 'test-project' } }));
    const { result } = renderHook(() => useDirectAttachmentProject());
    expect(await Promise.all([result.current(), result.current()])).toEqual(['test-project', 'test-project']);
    expect(requests.daemon).toHaveBeenCalledOnce();
  });
  it('ignores retired Guarded preferences from cached servers', async () => {
    requests.wordpress.mockResolvedValue(Response.json({ guarded: true }));
    const { result } = renderHook(() => useSiteAccess());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.guarded).toBe(false);
    expect(result.current.error).toBe('');
    expect('change' in result.current).toBe(false);
  });
  it('reports access failures without switching execution paths', async () => {
    requests.wordpress.mockResolvedValue(Response.json({ message: 'Forbidden' }, { status: 403 }));
    const { result } = renderHook(() => useSiteAccess());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.guarded).toBe(false);
    expect(result.current.error).toContain('WordPress refused');
    expect(result.current.details).toContain('HTTP 403');
  });

  it('explains license rejection and clears the styled notice after a successful retry', async () => {
    requests.wordpress.mockResolvedValueOnce(Response.json({ code: 'pixflow_entitlement_required', message: 'A current installation entitlement is required.' }, { status: 403 }))
      .mockResolvedValue(Response.json({ guarded: false }));
    function Notice() { const access = useSiteAccess(); return <SiteAccessNotice access={access} />; }
    render(<Notice />);
    await screen.findByText('Site connection needs attention');
    expect(screen.getByRole('status').textContent).toContain('license needs attention');
    const details = screen.getByText('Technical details').closest('details');
    expect(details?.open).toBe(false);
    expect(details?.textContent).toContain('pixflow_entitlement_required');
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    await waitFor(() => expect(screen.queryByText('Site connection needs attention')).toBeNull());
    expect(requests.wordpress).toHaveBeenCalledTimes(2);
  });

  it('streams split events and revokes its credential after completion', async () => {
    requests.wordpress.mockResolvedValue(Response.json({ endpoint: 'https://site.example/?rest_route=/pixflow-design/v1/wp-admin/direct/tools', token: 'session-token', writable: true, expiresAt: 9999999999 }));
    const encoder = new TextEncoder();
    requests.daemon.mockResolvedValue(new Response(new ReadableStream({ start(controller) {
      controller.enqueue(encoder.encode('{"type":"text_delta","delta":"Up'));
      controller.enqueue(encoder.encode('dated"}\n{"type":"done","ok":true}\n')); controller.close();
    } })));
    const revoke = vi.fn().mockResolvedValue(Response.json({ closed: true })); vi.stubGlobal('fetch', revoke);
    const onUpdate = vi.fn();
    const attachments = [{ projectId: 'project', name: 'brief.txt', path: 'brief.txt', kind: 'file' as const }];
    await runDirectSite({ agentId: 'codex', prompt: 'Edit site', attachments, history: [], mode: 'design', signal: new AbortController().signal, onUpdate });
    expect(JSON.parse(requests.daemon.mock.calls[0]?.[1].body).attachments).toEqual(attachments);
    expect(onUpdate).toHaveBeenLastCalledWith('Updated', [{ kind: 'text', text: 'Updated' }]);
    expect(revoke.mock.calls[0]?.[1].method).toBe('DELETE');
    expect(requests.daemon.mock.calls[0]?.[0]).toBe('/api/pixflow/direct-site/run-stream');
    expect(requests.entitlement).toHaveBeenCalledOnce();
    expect(requests.entitlement.mock.invocationCallOrder[0]).toBeLessThan(requests.wordpress.mock.invocationCallOrder[0]!);
  });

  it('reports a broken stream and still revokes the site connection', async () => {
    requests.wordpress.mockResolvedValue(Response.json({ endpoint: 'https://site.example/?rest_route=/pixflow-design/v1/wp-admin/direct/tools', token: 'session-token', writable: true }));
    requests.daemon.mockResolvedValue(new Response('{"type":"text_delta","delta":"Working"}\n'));
    const revoke = vi.fn().mockResolvedValue(Response.json({ closed: true })); vi.stubGlobal('fetch', revoke);
    await expect(runDirectSite({ agentId: 'codex', prompt: 'Edit site', history: [], mode: 'design', signal: new AbortController().signal, onUpdate: vi.fn() })).rejects.toThrow('before completion');
    expect(revoke).toHaveBeenCalledOnce();
  });

  it('does not issue a site credential if bridge connection setup fails', async () => {
    requests.entitlement.mockRejectedValue(new Error('Bridge connection setup failed'));
    await expect(runDirectSite({ agentId: 'codex', prompt: 'Edit site', history: [], mode: 'design', signal: new AbortController().signal, onUpdate: vi.fn() })).rejects.toThrow('Bridge connection setup failed');
    expect(requests.wordpress).not.toHaveBeenCalled();
    expect(requests.daemon).not.toHaveBeenCalled();
  });
});

it.each(['admin','workspace','bricks','etch','elementor','gutenberg'])('passes server guidance to the CLI on %s without changing explicit references',async surface=>{
 const guidance={revision:3,source:'existing',product:'Confirmed product',instructions:'Preserve existing styles.'};
 requests.wordpress.mockResolvedValue(Response.json({endpoint:'https://site.example/tools',token:'session-token',writable:true,designGuidance:guidance}));
 requests.daemon.mockResolvedValue(new Response('{"type":"done","sequence":1,"ok":true,"outcome":"completed"}\n'));
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({closed:true})));
 const context={siteDesignGuidance:'stale',workspaceItems:[{label:'Explicit reference'}]};
 await runDirectSite({agentId:'codex',prompt:'Review this',history:[],mode:'design',persistenceSurface:surface,context,signal:new AbortController().signal,onUpdate:vi.fn()});
 const body=JSON.parse(requests.daemon.mock.calls.at(-1)![1].body);
 expect(body.context).toEqual({siteDesignGuidance:guidance,workspaceItems:context.workspaceItems});expect(context.siteDesignGuidance).toBe('stale');
});
