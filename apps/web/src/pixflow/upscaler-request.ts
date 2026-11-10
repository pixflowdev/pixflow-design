import {pixflowWordPressRestFetch} from './runtime-fetch';
import {pixflowOptionalBridgeJson} from './optional-bridge';
export async function upscalerRequest<T>(action: string, signal: AbortSignal, model: string, png?: string, noise?: number): Promise<T> {
  const opened=await pixflowWordPressRestFetch('/wp-admin/direct/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'design'}),signal});
  if(!opened.ok)throw new Error('Reconnect to WordPress before using the upscaler.');
  return pixflowOptionalBridgeJson<T>('pixflow/upscaler/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:await opened.json(),model,png,noise}),signal},{timeoutMs:180000});
}
