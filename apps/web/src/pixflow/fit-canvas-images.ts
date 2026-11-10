import type { EditorFit } from './editor-fit-controls';

type Variant = { srcset?: string; sizes?: string };
type NativeImage = { src: string; set: string | null; sizes: string | null; applied: string };
export function installCanvasFitImages(collect: () => EditorFit[], selector: string) {
  const requests = new Map<string,Promise<Variant>>();
  const applied = new Map<HTMLImageElement,NativeImage>();
  let generation = 0, timer = 0;
  let observed: Document | undefined;
  const schedule = () => { clearTimeout(timer); timer = window.setTimeout(refresh,100); };
  const observer = new MutationObserver(schedule);
  function restore(image: HTMLImageElement, original: NativeImage) {
    if (image.isConnected && image.src === original.src && image.srcset === original.applied) {
      for (const [name,value] of [['srcset',original.set],['sizes',original.sizes]] as const) {
        if (value === null) image.removeAttribute(name); else image.setAttribute(name,value);
      }
    }
    applied.delete(image);
  }
  async function refresh() {
    const frame=document.querySelector<HTMLIFrameElement>(selector);
    const doc=frame?.contentDocument;
    if (!doc?.body) return;
    if (observed !== doc) {
      observed=doc; observer.disconnect();
      observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['src','srcset','sizes','data-pixflow-fit']});
    }
    const api=(window as any).wp?.apiFetch;
    if (!api) return;
    const run=++generation;
    const retained=new Set<HTMLImageElement>();
    await Promise.all(collect().map(async placement=>{
      const profile=placement.read();
      if (!profile) return;
      const node=placement.node;
      const image=(node.tagName==='IMG'?node:node.querySelector('img.wp-block-cover__image-background')) as HTMLImageElement|null;
      if (!image?.src || !/^https?:/.test(image.src)) return;
      const source=image.src;
      const query=new URLSearchParams({attachment:String(placement.attachmentId),source,profile}).toString();
      let request=requests.get(query);
      if (!request) {
        request=api({path:'/pixflow-design/v1/media/fit-canvas',method:'POST',data:{attachment:placement.attachmentId,source,profile}}) as Promise<Variant>;
        requests.set(query,request);
      }
      let result:Variant;
      try {result=await request;} catch {requests.delete(query);return;}
      if (generation!==run || !image.isConnected || image.src!==source || !result.srcset || !result.sizes) return;
      retained.add(image);
      let original=applied.get(image);
      if (!original || original.src!==source) {
        original={src:source,set:image.getAttribute('srcset'),sizes:image.getAttribute('sizes'),applied:''};
        applied.set(image,original);
      }
      if (image.sizes!==result.sizes) image.sizes=result.sizes;
      if (image.srcset!==result.srcset) image.srcset=result.srcset;
      original.applied=result.srcset;
    }));
    if (generation===run) for (const [image,original] of applied) if (!retained.has(image)) restore(image,original);
  }
  document.addEventListener('load',event=>{if ((event.target as Element)?.matches?.(selector)) schedule();},true);
  window.addEventListener('pixflow:fit-preview-ready',()=>{requests.clear();schedule();});
  window.addEventListener('pixflow:before-editor-fit-save',schedule);
  window.addEventListener('pixflow:fit-reverted',schedule);
  schedule();
}
