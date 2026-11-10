import { installCanvasFitImages } from './fit-canvas-images';
export type EditorFit = {
  node: Element;
  attachmentId: number;
  dynamic: boolean;
  sourceUrl?: string;
  cover?: boolean;
  read(): string;
  write(profile: string): void;
};

// Each editor owns selection, source resolution and its undoable write operation.
export function bindEditorFit(button: HTMLButtonElement, target: EditorFit, resolve:()=>EditorFit|undefined = ()=>target, isCurrent=()=>button.isConnected) {
  const label = (s:string)=>(window as any).wp.i18n.__(s,'pixflow-design');
  const container=button.parentElement!;
  let notice=container.querySelector<HTMLElement>('[data-pixflow-fit-notice]');
  if(!notice){notice=document.createElement('span');notice.dataset.pixflowFitNotice='';notice.setAttribute('role','status');button.before(notice);}
  const text=target.dynamic?'Optimise dynamic images':'Optimise image';
  const revert=document.createElement('button');
  revert.type='button';
  revert.className=button.className;
  revert.textContent=label('Revert to original');
  revert.hidden=!target.read();
  revert.onclick=()=>{
    const placement=resolve();
    if (!placement?.read()) return;
    placement.write('');
    revert.hidden=true;
    window.dispatchEvent(new Event('pixflow:fit-reverted'));
  };
  if (target.read()) button.after(revert);
  let importRequired=false;
  if (target.sourceUrl && !target.attachmentId && !target.dynamic) {
    window.dispatchEvent(new CustomEvent('pixflow:fit-source-label',{detail:{source:target.sourceUrl,button,apply:(missing:boolean)=>{importRequired=missing;updateLabel();}}}));
  }
  const updateLabel=()=>{
    const stale=container.hasAttribute('data-fit-stale');
    const title=label(importRequired?'Import & optimise':stale?(target.dynamic?'Reoptimise dynamic images':'Reoptimise image'):text);
    if(button.textContent!==title)button.textContent=title;
    notice.hidden=!stale;
  };
  updateLabel();
  const observer=new MutationObserver(updateLabel);
  observer.observe(container,{attributes:true,attributeFilter:['data-fit-stale']});
  button.onclick=()=>{
    const live=resolve();
    if(!live)return;
    const resolveNode=()=>{
      const latest=resolve();
      return latest?.attachmentId===live.attachmentId && latest.dynamic===live.dynamic && latest.sourceUrl===live.sourceUrl ? latest.node : null;
    };
    const current=()=>isCurrent() && !!resolveNode()?.isConnected;
    window.dispatchEvent(new CustomEvent('pixflow:fit-existing-image',{detail:{...live,current,button,resolveNode}}));
  };
  const lifecycle=new AbortController();
  window.dispatchEvent(new CustomEvent('pixflow:watch-fit',{detail:{...target,signal:lifecycle.signal,node:()=>resolve()?.node??null,controls:()=>container,profile:target.read()}}));
  return ()=>{observer.disconnect();lifecycle.abort();revert.remove();};
}

export function installEditorFitSave(collect:()=>EditorFit[], saveSelector:string, frameSelector:string, saveShortcut?:()=>void, matchesButton?:(button:HTMLElement)=>boolean) {
  installCanvasFitImages(collect,frameSelector);
  let replay=false,pending=false;
  function intercept(event:Event) {
    if(replay||event.defaultPrevented)return;
    const key=event as KeyboardEvent;
    const shortcut=event.type==='keydown'&&(key.ctrlKey||key.metaKey)&&key.key.toLowerCase()==='s';
    const button=event.type==='click'?(event.target as Element)?.closest?.<HTMLElement>(saveSelector):null;
    if(!shortcut&&(!button||(matchesButton&&!matchesButton(button))))return;
    const placements=collect().filter(t=>t.read()).map(t=>{
      const profile=t.read();
      return {...t,profile,apply(next:string){if(!t.node.isConnected||t.read()!==profile)return false;t.write(next);return true;}};
    });
    if(!placements.length)return;
    if(pending){event.preventDefault();event.stopImmediatePropagation();return;}
    let check: Promise<void>|undefined;
    const controller=new AbortController();
    window.dispatchEvent(new CustomEvent('pixflow:before-editor-fit-save',{detail:{placements,signal:controller.signal,wait:(p:Promise<void>)=>{check=p;}}}));
    if(!check)return;
    event.preventDefault();event.stopImmediatePropagation();pending=true;
    const timeout=window.setTimeout(()=>controller.abort(),5000);
    const expired=new Promise<void>(resolve=>controller.signal.addEventListener('abort',()=>resolve(),{once:true}));
    void Promise.race([check,expired]).catch(()=>{}).finally(()=>{
      clearTimeout(timeout);pending=false;replay=true;
      try{if(button?.isConnected)button.click();else if(saveShortcut)saveShortcut();else key.target?.dispatchEvent(new KeyboardEvent('keydown',key));}
      finally{replay=false;}
    });
  }
  const bindCanvas=()=>{
    const frame=document.querySelector<HTMLIFrameElement>(frameSelector);
    if(!frame)return false;
    const bind=()=>frame.contentWindow?.addEventListener('keydown',intercept,true);
    bind();frame.addEventListener('load',bind);
    return true;
  };
  if(!bindCanvas()){
    const observer=new MutationObserver(()=>{if(bindCanvas())observer.disconnect()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
    window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
  }
  window.addEventListener('keydown',intercept,true);
  window.addEventListener('click',intercept,true);
}
