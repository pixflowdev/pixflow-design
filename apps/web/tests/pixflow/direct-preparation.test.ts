// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import * as direct from '../../src/pixflow/direct-site';
import { floatingRunStorageKey } from '../../src/pixflow/floating-conversation';

afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });

it.each(['admin', 'bricks'])('records %s preparation synchronously and never launches it on recovery', async surface => {
  const controller = new AbortController();
  const finish = direct.beginDirectPreparation(surface, 'bricks:conversation', {id:'reply',agentId:'codex',initial:[{id:'reply',role:'assistant',content:'',runStatus:'running'}]}, controller);
  const saved = direct.pendingDirectSiteRun(surface)!;
  expect(saved).toMatchObject({preparing:true,metadata:{sessionKey:'bricks:conversation'}});
  window.dispatchEvent(new Event('pagehide'));
  expect(controller.signal.aborted).toBe(true);
  finish();
  expect(direct.pendingDirectSiteRun(surface)).toEqual(saved);
  const fetch = vi.spyOn(globalThis, 'fetch');
  await expect(direct.runDirectSite({resume:saved,persistenceSurface:surface,agentId:'codex',prompt:'',history:[],mode:'design',signal:new AbortController().signal,onUpdate:vi.fn()})).rejects.toMatchObject({outcome:'interrupted',message:expect.stringContaining('before')});
  expect(fetch).not.toHaveBeenCalled();
  expect(direct.pendingDirectSiteRun(surface)).toBeNull();
});

it('does not abort or erase a run whose real checkpoint replaced preparation', () => {
  const controller = new AbortController();
  const finish = direct.beginDirectPreparation('admin','chat',{id:'reply'},controller);
  const accepted = {...direct.pendingDirectSiteRun('admin')!,preparing:undefined};
  sessionStorage.setItem(floatingRunStorageKey('admin'),JSON.stringify(accepted));
  window.dispatchEvent(new Event('pagehide'));
  expect(controller.signal.aborted).toBe(false);
  finish();
  expect(direct.pendingDirectSiteRun('admin')).toEqual(accepted);
});

it('cleans up ordinary preparation failure without removing a later request', () => {
  const first = direct.beginDirectPreparation('admin','chat',{id:'first'},new AbortController());
  const second = direct.beginDirectPreparation('admin','chat',{id:'second'},new AbortController());
  first();
  expect(direct.pendingDirectSiteRun('admin')?.metadata).toMatchObject({id:'second'});
  second();
  expect(direct.pendingDirectSiteRun('admin')).toBeNull();
});

it('retains recovery evidence when navigation rejects fetch before pagehide', async () => {
  const finish = direct.beginDirectPreparation('admin','chat',{id:'reply'},new AbortController());
  finish();
  expect(direct.pendingDirectSiteRun('admin')).toBeNull();
  const key = floatingRunStorageKey('admin');
  const saved = JSON.parse(sessionStorage.getItem(key)!);
  expect(saved.preparationEnded).toBe(true);
  sessionStorage.setItem(key,JSON.stringify({...saved,preparationDocument:'previous-document'}));
  const recovered = direct.pendingDirectSiteRun('admin');
  expect(recovered).not.toBeNull();
  await expect(direct.runDirectSite({resume:recovered!,persistenceSurface:'admin',agentId:'codex',prompt:'',history:[],mode:'design',signal:new AbortController().signal,onUpdate:vi.fn()})).rejects.toMatchObject({outcome:'interrupted'});
});

it('keeps steering queued while preparation has no accepted run', async () => {
  const finish = direct.beginDirectPreparation('admin','chat',{id:'reply'},new AbortController());
  const fetch = vi.spyOn(globalThis,'fetch');
  expect(await direct.steerDirectSite('admin',{id:'steer',prompt:'Make it blue',attachments:[],comments:[],state:'queued'})).toMatchObject({state:'rejected'});
  expect(fetch).not.toHaveBeenCalled();
  finish();
});
