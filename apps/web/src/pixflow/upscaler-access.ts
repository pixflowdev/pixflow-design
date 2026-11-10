import {useEffect,useState} from 'react';
import type {UpscalerStatus} from '@open-design/contracts';
import {upscalerRequest} from './upscaler-request';
export {upscalerRequest} from './upscaler-request';
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
