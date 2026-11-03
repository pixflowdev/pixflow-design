import {useEffect,useState} from 'react';
import {pixflowWordPressRestFetch} from './runtime-fetch';
import {pixflowOptionalBridgeJson} from './optional-bridge';
import type {UpscalerStatus} from '@open-design/contracts';
export async function upscalerRequest<T>(action: string, signal: AbortSignal, model: string, png?: string, noise?: number): Promise<T> {
  const opened=await pixflowWordPressRestFetch('/wp-admin/direct/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'design'}),signal});
  if(!opened.ok)throw new Error('Reconnect to WordPress before using the upscaler.');
  return pixflowOptionalBridgeJson<T>('pixflow/upscaler/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:await opened.json(),model,png,noise}),signal},{timeoutMs:180000});
}


export const UPSCALER_CHANGE='pixflow-upscaler-settings-changed';
export function notifyUpscalerChange(){
  window.dispatchEvent(new Event(UPSCALER_CHANGE));
  try {localStorage.setItem(UPSCALER_CHANGE,String(Date.now()));}catch{}
}
export function useUpscalerInventory(){
  const [status,setStatus]=useState<UpscalerStatus>();
  const [error,setError]=useState('');
  useEffect(()=>{
    let current:AbortController|undefined;
    function refresh(){
      current?.abort();
      const task=new AbortController();current=task;
      void upscalerRequest<UpscalerStatus>('status',task.signal,'photo2').then(result=>{
        if(!task.signal.aborted){setStatus(result);setError('');}
      }).catch(err=>{if(!task.signal.aborted){setStatus(undefined);setError(String(err.message||err));}});
    }
    function storage(event:StorageEvent){if(event.key===UPSCALER_CHANGE)refresh();}
    refresh();window.addEventListener(UPSCALER_CHANGE,refresh);window.addEventListener('focus',refresh);window.addEventListener('storage',storage);
    return ()=>{current?.abort();window.removeEventListener(UPSCALER_CHANGE,refresh);window.removeEventListener('focus',refresh);window.removeEventListener('storage',storage);};
  },[]);
  return {status,error};
}
