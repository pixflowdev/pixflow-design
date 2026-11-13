import { useEffect, useRef, useState } from 'react';
export type UploadStatus = 'queued'|'uploading'|'processing'|'rendering'|'saving'|'done'|'error';
export type UpscaleOperation = 'preview' | 'copy' | 'replace';
type MediaTaskPhase = 'rendering' | 'saving';
type RunMediaJob = (progress: (percent: number) => void, setPhase: (phase: MediaTaskPhase) => void) => Promise<void>;
export interface MediaUploadJob { id:number; file:File; progress:number; status:UploadStatus; error?:string; operation?:UpscaleOperation; run:RunMediaJob }
/** One upload at a time, including batches added while a transfer is active. */
export function useMediaUploads(onSettled:()=>void) {
 const [jobs,setJobs]=useState<MediaUploadJob[]>([]);
 const dismissTimers=useRef(new Map<number,ReturnType<typeof setTimeout>>());
 useEffect(()=>{
  for(const job of jobs){
   if(job.operation!=='preview'||job.status!=='done'||dismissTimers.current.has(job.id))continue;
   const timer=setTimeout(()=>{
    dismissTimers.current.delete(job.id);
    setJobs(current=>current.filter(item=>item.id!==job.id));
   },2500);
   dismissTimers.current.set(job.id,timer);
  }
 },[jobs]);
 useEffect(()=>{
  const timers=dismissTimers.current;
  return ()=>{
   for(const timer of timers.values())clearTimeout(timer);
   timers.clear();
  };
 },[]);
 const queue=useRef<MediaUploadJob[]>([]), active=useRef(false), sequence=useRef(0);
 const settled=useRef(onSettled);settled.current=onSettled;
 const update=(id:number,patch:Partial<MediaUploadJob>)=>setJobs(current=>current.map(job=>job.id===id?{...job,...patch}:job));
 async function drain(){
  if(active.current)return;active.current=true;
  try{while(queue.current.length){const job=queue.current.shift()!;
   update(job.id,{status:job.operation?'rendering':'uploading',progress:0,error:undefined});
   try{await job.run(percent=>update(job.id,{progress:percent,status:percent===100?'processing':'uploading'}),status=>update(job.id,{status}));update(job.id,{status:'done',progress:100});
   }
   catch(error){update(job.id,{status:'error',error:error instanceof Error?error.message:String(error)});}
  }}finally{active.current=false;settled.current();}
 }
 function add(files:File[],run:(file:File)=>RunMediaJob,operation?:UpscaleOperation){
  const added=files.map(file=>({id:++sequence.current,file,progress:0,status:'queued' as const,operation,run:run(file)}));
  queue.current.push(...added);setJobs(current=>[...current,...added]);void drain();
 }
 function retry(job:MediaUploadJob){if(queue.current.some(item=>item.id===job.id)||job.status!=='error')return;queue.current.push(job);update(job.id,{status:'queued',error:undefined,progress:0});void drain();}
 return {jobs,add,retry,clear:()=>setJobs(current=>current.filter(job=>job.status!=='done'))};
}
