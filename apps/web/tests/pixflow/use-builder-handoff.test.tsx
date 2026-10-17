// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBuilderHandoff } from '../../src/pixflow/use-builder-handoff';
import { readBuilderHandoff, mutateBuilderHandoff } from '../../src/pixflow/builder-handoff-client';
import { prepareBuilderDestination } from '../../src/pixflow/builder-destinations';
import type { PixflowBuilderHandoff } from '@open-design/contracts';
vi.mock('../../src/pixflow/builder-handoff-client',()=>({readBuilderHandoff:vi.fn(),mutateBuilderHandoff:vi.fn()}));
vi.mock('../../src/pixflow/builder-destinations',()=>({prepareBuilderDestination:vi.fn()}));
const destination={postId:1,title:'Bakery',status:'draft',builder:'gutenberg' as const,editorUrl:'http://localhost/editor'};
const receipt:PixflowBuilderHandoff={id:'handoff',projectId:'project',conversationId:'chat',destination,editorUrl:'http://localhost/editor?pixflow_handoff=handoff',targetTabId:'tab-request',brief:'Build a bakery page',assets:[],messageId:'message',status:'ready',createdAt:Date.now(),updatedAt:Date.now(),expiresAt:Date.now()+1800000};
const request={action:'create' as const,builder:'gutenberg' as const,title:'Bakery',requestId:'stable-request-123456'};
const assets:[]=[];
beforeEach(()=>{sessionStorage.clear();vi.mocked(readBuilderHandoff).mockResolvedValue(null);vi.mocked(prepareBuilderDestination).mockResolvedValue({destination,created:true,reused:false});vi.mocked(mutateBuilderHandoff).mockResolvedValue({handoff:receipt});});
afterEach(()=>vi.resetAllMocks());
describe('Workspace handoff coordination',()=>{
  it('discovers a server-created handoff for the submitted source turn without preparing a second page',async()=>{
    const view=renderHook(({requestId,running})=>useBuilderHandoff('project','chat',true,assets,{requestId,running}),{initialProps:{requestId:null as string|null,running:false}});
    await waitFor(()=>expect(readBuilderHandoff).toHaveBeenCalledTimes(1));
    vi.mocked(readBuilderHandoff).mockResolvedValue({...receipt,origin:'agent',sourceRequestId:'user-turn'});
    view.rerender({requestId:'user-turn',running:true});
    await waitFor(()=>expect(view.result.current.agentReceiptToOpen).toBe(receipt.id));
    expect(view.result.current.status).toBe('connecting');
    expect(prepareBuilderDestination).not.toHaveBeenCalled();
    expect(mutateBuilderHandoff).not.toHaveBeenCalled();
    view.unmount();
  });
  it.each([
    {origin:'agent' as const,sourceRequestId:'old-turn',status:'ready' as const},
    {origin:undefined,sourceRequestId:'user-turn',status:'ready' as const},
    {origin:'agent' as const,sourceRequestId:'user-turn',status:'accepted' as const},
    {origin:'agent' as const,sourceRequestId:'user-turn',status:'completed' as const},
  ])('never opens historical, manual or already-started receipts: %j',async fields=>{
    vi.mocked(readBuilderHandoff).mockResolvedValue({...receipt,...fields});
    const view=renderHook(()=>useBuilderHandoff('project','chat',true,assets,{requestId:'user-turn',running:true}));
    await waitFor(()=>expect(readBuilderHandoff).toHaveBeenCalledTimes(2));
    expect(view.result.current.agentReceiptToOpen).toBeNull();
    view.unmount();
  });
  it('checks the final server receipt after the source run finishes',async()=>{
    const view=renderHook(({running})=>useBuilderHandoff('project','chat',true,assets,{requestId:'user-turn',running}),{initialProps:{running:true}});
    await waitFor(()=>expect(readBuilderHandoff).toHaveBeenCalledTimes(2));
    vi.mocked(readBuilderHandoff).mockResolvedValue({...receipt,origin:'agent',sourceRequestId:'user-turn'});
    view.rerender({running:false});
    await waitFor(()=>expect(view.result.current.agentReceiptToOpen).toBe(receipt.id));
    view.unmount();
  });
  it('finds the preceding queued turn receipt when the next user turn starts first',async()=>{
    const view=renderHook(({requestId})=>useBuilderHandoff('project','chat',true,assets,{requestId,running:true}),{initialProps:{requestId:'first-user-turn'}});
    await waitFor(()=>expect(readBuilderHandoff).toHaveBeenCalledTimes(2));
    vi.mocked(readBuilderHandoff).mockResolvedValue({...receipt,origin:'agent',sourceRequestId:'first-user-turn'});
    view.rerender({requestId:'second-user-turn'});
    await waitFor(()=>expect(view.result.current.agentReceiptToOpen).toBe(receipt.id));
    expect(prepareBuilderDestination).not.toHaveBeenCalled();
    view.unmount();
  });
  it('forgets submitted source identities after switching to another chat',async()=>{
    const view=renderHook(({chat,requestId})=>useBuilderHandoff('project',chat,true,assets,{requestId,running:true}),{initialProps:{chat:'chat',requestId:'first-user-turn' as string|null}});
    await waitFor(()=>expect(readBuilderHandoff).toHaveBeenCalledTimes(2));
    view.rerender({chat:'different-chat',requestId:null});
    vi.mocked(readBuilderHandoff).mockResolvedValue({...receipt,origin:'agent',sourceRequestId:'first-user-turn'});
    view.rerender({chat:'chat',requestId:null});
    await waitFor(()=>expect(view.result.current.receipt?.id).toBe(receipt.id));
    expect(view.result.current.agentReceiptToOpen).toBeNull();
    view.unmount();
  });
  it('does not navigate historical handoffs when a chat is reopened',async()=>{
    vi.mocked(readBuilderHandoff).mockResolvedValue({...receipt,origin:'agent',sourceRequestId:'old-turn'});
    const view=renderHook(()=>useBuilderHandoff('project','chat',true,assets));
    await waitFor(()=>expect(view.result.current.receipt?.id).toBe(receipt.id));
    expect(view.result.current.agentReceiptToOpen).toBeNull();
    view.unmount();
  });
  it('keeps a delayed unclaimed receipt waiting and reconnects without preparing another build', async () => {
    const delayed = { ...receipt, updatedAt: Date.now() - 120_000 };
    vi.mocked(readBuilderHandoff).mockResolvedValue(delayed);
    const view = renderHook(() => useBuilderHandoff('project', 'chat', true, assets));
    await waitFor(() => expect(view.result.current.status).toBe('delayed'));
    expect(view.result.current.newBuild).toBeUndefined();
    await act(async () => { expect(await view.result.current.retry()).toEqual({ destination, editorUrl: delayed.editorUrl }); });
    expect(prepareBuilderDestination).not.toHaveBeenCalled();
    expect(mutateBuilderHandoff).not.toHaveBeenCalled();
    expect(view.result.current.status).toBe('delayed');
  });
  it('retains a real server failure as failed rather than waiting', async () => {
    vi.mocked(readBuilderHandoff).mockResolvedValue({ ...receipt, status: 'failed', error: 'The destination was removed.' });
    const view = renderHook(() => useBuilderHandoff('project', 'chat', true, assets));
    await waitFor(() => expect(view.result.current.status).toBe('failed'));
    expect(view.result.current.error).toBe('The destination was removed.');
    expect(view.result.current.newBuild).toBeTypeOf('function');
  });
  it('only creates after confirmation and persists the reviewed brief',async()=>{
    const {result}=renderHook(()=>useBuilderHandoff('project','chat',true,assets));
    await waitFor(()=>expect(readBuilderHandoff).toHaveBeenCalled());
    expect(prepareBuilderDestination).not.toHaveBeenCalled();
    await act(async()=>{await result.current.build(request,'Reviewed exact brief','stable-request-123456');});
    expect(mutateBuilderHandoff).toHaveBeenCalledWith(expect.objectContaining({action:'prepare',brief:'Reviewed exact brief',postId:1,targetTabId:'tab-stable-request-123456'}));
    expect(result.current.status).toBe('connecting');
  });
  it('reuses a known claimed receipt and never resends or creates another page',async()=>{
    vi.mocked(readBuilderHandoff).mockResolvedValue({...receipt,status:'claimed'});
    const {result}=renderHook(()=>useBuilderHandoff('project','chat',true,assets));
    await waitFor(()=>expect(result.current.receipt?.status).toBe('claimed'));
    await act(async()=>{await result.current.retry();await result.current.build(request,'another brief','another-request-1234');});
    expect(prepareBuilderDestination).not.toHaveBeenCalled();
    expect(mutateBuilderHandoff).not.toHaveBeenCalled();
  });
  it('retains the same page request and exact brief after an uncertain preparation response',async()=>{
    vi.mocked(mutateBuilderHandoff).mockRejectedValueOnce(new Error('Response lost'));
    const {result,unmount}=renderHook(()=>useBuilderHandoff('project','chat',true,assets));
    await act(async()=>{await expect(result.current.build(request,'Original brief','stable-request-123456')).rejects.toThrow('Response lost');});
    unmount();
    const second=renderHook(()=>useBuilderHandoff('project','chat',true,assets));
    await waitFor(()=>expect(readBuilderHandoff).toHaveBeenCalledTimes(3));
    await act(async()=>{await second.result.current.build({...request,title:'Changed title',requestId:'different-request-1'},'Changed brief','different-request-1');});
    expect(vi.mocked(prepareBuilderDestination).mock.calls[1]?.[0]).toEqual(request);
    expect(vi.mocked(mutateBuilderHandoff).mock.calls[1]?.[0]).toMatchObject({brief:'Original brief',requestId:'stable-request-123456'});
  });
  it('does not make requests outside the WordPress Workspace',()=>{
    renderHook(()=>useBuilderHandoff('project','chat',false,assets));
    expect(readBuilderHandoff).not.toHaveBeenCalled();
  });
  it('allows corrected context after a confirmed rejection while reusing the draft request',async()=>{
    vi.mocked(mutateBuilderHandoff).mockRejectedValueOnce(Object.assign(new Error('Missing old asset'),{status:404}));
    const view=renderHook(()=>useBuilderHandoff('project','chat',true,assets));
    await act(async()=>{await expect(view.result.current.build(request,'First brief','stable-request-123456')).rejects.toThrow('Missing old asset');});
    await act(async()=>{await view.result.current.build({...request,requestId:'new-request-123456'},'Corrected brief','new-request-123456');});
    expect(vi.mocked(prepareBuilderDestination).mock.calls[1]?.[0]).toEqual(request);
    expect(vi.mocked(mutateBuilderHandoff).mock.calls[1]?.[0]).toMatchObject({brief:'Corrected brief',requestId:'stable-request-123456'});
  });
  it('ignores a retry response after the user switches chats',async()=>{
    vi.mocked(readBuilderHandoff).mockResolvedValue(receipt);
    const view=renderHook(({chat})=>useBuilderHandoff('project',chat,true,assets),{initialProps:{chat:'chat'}});
    await waitFor(()=>expect(view.result.current.receipt).toEqual(receipt));
    let complete!:(value:PixflowBuilderHandoff)=>void;
    vi.mocked(readBuilderHandoff).mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
    const retry=view.result.current.retry().catch(error=>error);
    vi.mocked(readBuilderHandoff).mockResolvedValue(null);
    view.rerender({chat:'other-chat'});
    await act(async()=>{complete(receipt);expect((await retry).message).toContain('active chat changed');});
    expect(view.result.current.receipt).toBeNull();
    expect(prepareBuilderDestination).not.toHaveBeenCalled();
  });
});
