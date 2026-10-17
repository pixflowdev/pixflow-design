import { useCallback, useEffect, useRef, useState } from 'react';
import type { PixflowBuilderDestinationRequest, PixflowBuilderHandoff } from '@open-design/contracts';
import { prepareBuilderDestination } from './builder-destinations';
import { mutateBuilderHandoff, readBuilderHandoff } from './builder-handoff-client';

type Asset = {projectId:string;path:string;name:string;mime?:string};
type Pending = {request:PixflowBuilderDestinationRequest;brief:string;requestId:string;assets:Asset[];preparationRejected?:boolean};
type AgentObservation = { requestId: string | null; running: boolean };
export type BuilderHandoffProgress = 'opening'|'connecting'|'delayed'|'building'|'awaiting_input'|'completed'|'failed'|'uncertain';
const terminal = (receipt:PixflowBuilderHandoff) => ['completed','failed','cancelled','awaiting_input'].includes(receipt.status);

/** Owns preparation and observation only. The destination editor exclusively claims and starts the run. */
export function useBuilderHandoff(projectId:string, conversationId:string, enabled:boolean, assets:Asset[], agent?:AgentObservation) {
  const key = `${projectId}:${conversationId}`;
  const owner = useRef(key); owner.current = key;
  const [receipt, setReceipt] = useState<PixflowBuilderHandoff|null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [agentReceiptToOpen, setAgentReceiptToOpen] = useState<string|null>(null);
  const observedAgentReceipts = useRef(new Set<string>());
  const agentRequestId = agent?.requestId;
  const agentRunning = agent?.running ?? false;
  const submittedAgentRequests = useRef({key, ids:new Set<string>()});
  if(submittedAgentRequests.current.key!==key)submittedAgentRequests.current={key,ids:new Set()};
  if(agentRequestId){
    submittedAgentRequests.current.ids.add(agentRequestId);
    // Keep recent queued turns long enough for their final status lookup, while
    // bounding this session-only set. Never reconstruct it from chat history.
    while(submittedAgentRequests.current.ids.size>100)submittedAgentRequests.current.ids.delete(submittedAgentRequests.current.ids.values().next().value!);
  }
  const pending = useRef<Pending|null>(null);
  const storageKey = `pixflow:builder-handoff:${key}`;
  const storePending = (value:Pending|null) => {
    pending.current = value;
    try { if(value) sessionStorage.setItem(storageKey,JSON.stringify(value)); else sessionStorage.removeItem(storageKey); } catch { /* Server receipt remains authoritative. */ }
  };
  useEffect(() => {
    const controller = new AbortController();
    setReceipt(null); setError(''); setOpening(false); pending.current=null;
    setAgentReceiptToOpen(null); observedAgentReceipts.current.clear();
    if(!enabled || !conversationId) return () => controller.abort();
    try { pending.current=JSON.parse(sessionStorage.getItem(storageKey)||'null'); } catch { /* Optional preparation recovery. */ }
    void readBuilderHandoff({projectId,conversationId},controller.signal).then(value=>{
      if(controller.signal.aborted)return;
      if(observedAgentReceipts.current.size>0)return;
      setReceipt(value);
      if(value) { pending.current=null; try {sessionStorage.removeItem(storageKey);}catch{/* Optional cache. */} }
    }).catch(cause=>{if(!controller.signal.aborted)setError(String(cause instanceof Error?cause.message:cause));});
    return ()=>controller.abort();
  },[key,enabled,storageKey,projectId,conversationId]);

  useEffect(()=>{
    // The site tool creates the receipt independently of this browser. Observe
    // the source chat during its run, then reconcile once more at completion.
    // Only the exact newly submitted source request may open an editor; history
    // loading and unrelated/manual handoffs never imply a navigation request.
    if(!enabled || !conversationId || (!agentRequestId && (!receipt || terminal(receipt))))return;
    const controller=new AbortController(); let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      let next:PixflowBuilderHandoff|null=null;
      try {
        next=await readBuilderHandoff(agentRequestId ? {projectId,conversationId} : {id:receipt!.id},controller.signal);
        if(!controller.signal.aborted && next && next.projectId===projectId && next.conversationId===conversationId){
          setReceipt(next);setError('');setNow(Date.now());
          if(next.origin==='agent' && next.sourceRequestId && submittedAgentRequests.current.ids.has(next.sourceRequestId) && next.status==='ready' && !observedAgentReceipts.current.has(next.id)){
            observedAgentReceipts.current.add(next.id);setAgentReceiptToOpen(next.id);
          }
        }
      }
      catch(cause){if(!controller.signal.aborted){setError(cause instanceof Error?cause.message:String(cause));setNow(Date.now());}}
      if(!controller.signal.aborted && (agentRunning || (next ? !terminal(next) : !!receipt && !terminal(receipt))))timer=setTimeout(()=>void poll(),2500);
    };
    timer=setTimeout(()=>void poll(),agentRequestId?0:1500);
    return()=>{controller.abort();clearTimeout(timer);};
  },[enabled,projectId,conversationId,receipt?.id,receipt?.status,agentRequestId,agentRunning]);

  const build=useCallback(async(request:PixflowBuilderDestinationRequest,brief:string,requestId:string)=>{
    const own=key;
    // Reconcile with the server before any page creation, including after a lost preparation response.
    const existing=await readBuilderHandoff({projectId,conversationId});
    if(existing && !terminal(existing)){if(owner.current===own)setReceipt(existing);return {destination:existing.destination,editorUrl:existing.editorUrl};}
    if(owner.current!==own)throw new Error('The active chat changed. No new build was started.');
    setOpening(true);setError('');
    const intent=pending.current
      ? pending.current.preparationRejected ? {...pending.current,brief,assets,preparationRejected:false} : pending.current
      : {request,brief,requestId,assets};
    storePending(intent);
    try {
      const destination=await prepareBuilderDestination(intent.request);
      const {handoff}=await mutateBuilderHandoff({action:'prepare',requestId:intent.requestId,projectId,conversationId,
        builder:destination.destination.builder,postId:destination.destination.postId,targetTabId:`tab-${intent.requestId}`,brief:intent.brief,assets:intent.assets});
      if(owner.current===own){setReceipt(handoff);setNow(Date.now());storePending(null);}
      return {destination:handoff.destination,editorUrl:handoff.editorUrl};
    } catch(cause){if(owner.current===own){
      const status=(cause as {status?:number})?.status;
      // A confirmed rejection permits corrected context on the next explicit
      // attempt, while keeping the same draft identity. Uncertain delivery
      // retains the original immutable request for reconciliation.
      if(status && status>=400 && status<500 && status!==409)storePending({...intent,preparationRejected:true});
      setError(cause instanceof Error?cause.message:String(cause));
    }throw cause;}
    finally {if(owner.current===own)setOpening(false);}
  },[key,projectId,conversationId,assets,storageKey]);

  const retry=useCallback(async()=>{
    const own=key;
    if(!receipt){const intent=pending.current;if(!intent)throw new Error('Choose an editor and page first.');return build(intent.request,intent.brief,intent.requestId);}
    const latest=await readBuilderHandoff({id:receipt.id});
    if(owner.current!==own)throw new Error('The active chat changed. No build was restarted.');
    if(!latest)throw new Error('This handoff is no longer available.');
    setReceipt(latest);setNow(Date.now());setError('');
    // Never re-prepare or resend a claimed run. The existing editor owns recovery.
    return {destination:latest.destination,editorUrl:latest.editorUrl};
  },[receipt,build,key]);
  let status:BuilderHandoffProgress|undefined=opening?'opening':undefined;
  if(receipt && !opening){
    const age=now-Number(receipt.updatedAt);
    status=receipt.status==='ready'?(age>90000?'delayed':'connecting'):receipt.status==='claimed'?(age>90000?'uncertain':'connecting'):receipt.status==='accepted'?'building':receipt.status==='awaiting_input'?'awaiting_input':receipt.status==='completed'?'completed':'failed';
  }
  const newBuild = receipt && terminal(receipt) ? () => {setReceipt(null);setError('');storePending(null);} : undefined;
  const visibleReceipt=receipt?.projectId===projectId && receipt.conversationId===conversationId?receipt:null;
  return {receipt:visibleReceipt,build,retry,newBuild,status,error:error || visibleReceipt?.error || '',brief:visibleReceipt?.brief,
    agentReceiptToOpen:visibleReceipt?.id===agentReceiptToOpen && visibleReceipt.sourceRequestId && submittedAgentRequests.current.ids.has(visibleReceipt.sourceRequestId)?agentReceiptToOpen:null};
}
