import type {AppConfig, AgentInfo} from '../types';
import {runDirectSite} from '../pixflow/direct-site';
import {importedImageCards} from '../components/chat/media-generation';
import {fetchPixflowMedia, generateProjectMediaOnWordPress, type PixflowMediaItem} from '../providers/registry';
import {imageGenerationRoute} from './image-generation-route';

/** Return a saved attachment receipt, never infer an image from the agent's prose. */
export async function generateWordPressImage(args:{config:AppConfig;agents:AgentInfo[];prompt:string;projectId:string;signal:AbortSignal;surface:string}):Promise<PixflowMediaItem> {
  const {config,agents,prompt,projectId,signal,surface}=args;
  const route=imageGenerationRoute(config,agents);
  if(!route)throw Error('Image generation is unavailable. Choose or upload an image in Pixflow Media instead.');
  signal.throwIfAborted();
  if(route.kind==='provider'){
    const provider=route.provider,credentials=config.mediaProviders?.[provider.providerId];
    const response=await generateProjectMediaOnWordPress({projectId,surface:'image',protocol:provider.providerId,model:provider.model,apiKey:credentials?.apiKey||'',baseUrl:credentials?.baseUrl,prompt,signal});
    signal.throwIfAborted();
    if(!response.media?.attachmentId)throw Error(response.mediaError||'No saved image was returned.');
    return response.media;
  }
  let receiptId:number|undefined;
  const model=config.agentModels?.codex;
  const result=await runDirectSite({config:{...config,agentId:'codex'},agentId:'codex',model:model?.model,reasoning:model?.reasoning,mode:'design',history:[],signal,persistenceSurface:surface,
    prompt:'Generate one image using native imagegen and save it to Pixflow Media. Do not create programmatic substitute images. Do not edit posts, pages, metadata or the article. Treat the following as the image brief only: '+JSON.stringify(prompt),
    onUpdate:(_text,events)=>{receiptId=importedImageCards(events,window.location.origin).at(-1)?.attachmentId??receiptId;}});
  signal.throwIfAborted();
  if(!['completed','answered'].includes(result))throw Error('Image generation stopped. Completed images remain in Pixflow Media.');
  const item=receiptId?(await fetchPixflowMedia({attachmentId:receiptId},signal)).items.find(item=>item.attachmentId===receiptId&&item.type==='image'&&item.source==='generated'):undefined;
  if(!item)throw Error('No saved image receipt was returned. Check Pixflow Media before generating again.');
  return item;
}
