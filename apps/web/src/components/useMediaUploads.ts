import { useRef, useState } from 'react';
export type UploadStatus = 'queued'|'uploading'|'processing'|'done'|'error';
export interface MediaUploadJob { id:number; file:File; progress:number; status:UploadStatus; error?:string; run:(progress:(percent:number)=>void)=>Promise<void> }
/** One upload at a time, including batches added while a transfer is active. */
export function useMediaUploads(onSettled:()=>void) {
 const [jobs,setJobs]=useState<MediaUploadJob[]>([]);
 const queue=useRef<MediaUploadJob[]>([]), active=useRef(false), sequence=useRef(0);
 const settled=useRef(onSettled);settled.current=onSettled;
 const update=(id:number,patch:Partial<MediaUploadJob>)=>setJobs(current=>current.map(job=>job.id===id?{...job,...patch}:job));
 async function drain(){
  if(active.current)return;active.current=true;
  try{while(queue.current.length){const job=queue.current.shift()!;
   update(job.id,{status:'uploading',progress:0,error:undefined});
   try{await job.run(percent=>update(job.id,{progress:percent,status:percent===100?'processing':'uploading'}));update(job.id,{status:'done',progress:100});}
   catch(error){update(job.id,{status:'error',error:error instanceof Error?error.message:String(error)});}
  }}finally{active.current=false;settled.current();}
 }
 function add(files:File[],run:(file:File)=>(progress:(percent:number)=>void)=>Promise<void>){
  const added=files.map(file=>({id:++sequence.current,file,progress:0,status:'queued' as const,run:run(file)}));
  queue.current.push(...added);setJobs(current=>[...current,...added]);void drain();
 }
 function retry(job:MediaUploadJob){if(queue.current.some(item=>item.id===job.id)||job.status!=='error')return;queue.current.push(job);update(job.id,{status:'queued',error:undefined,progress:0});void drain();}
 return {jobs,add,retry,clear:()=>setJobs(current=>current.filter(job=>job.status!=='done'))};
}
