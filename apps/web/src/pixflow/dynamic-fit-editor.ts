import {bindEditorFit,installEditorFitSave,type EditorFit} from './editor-fit-controls';
/** Configure only the placement. The editor's own change handler owns Undo and Save. */
type RowTarget = { node: Element; cover?: boolean; staticImage?: boolean; read(): string; write(value: string): void };
const host = window as any;
const translate = (text: string) => host.wp.i18n.__(text,'pixflow-design');

export function measure({node,cover}: Pick<RowTarget,"node"|"cover">): string[] {
  const frame = node.ownerDocument.defaultView?.frameElement as HTMLElement | null;
  const original=frame?.getAttribute('style');
  try {
    if (frame) frame.style.setProperty('transition-property','none','important');
    return [[360,390,600],[601,768,1024],[1025,1440,1920]].map(widths=>{
      let w=0,h=0;
      for(const width of widths) {
        if(frame) for(const name of ['width','min-width','max-width']) frame.style.setProperty(name,width+'px','important');
        frame?.getBoundingClientRect();
        const box=node as HTMLElement;
        w=Math.max(w,box.offsetWidth); h=Math.max(h,box.offsetHeight);
      }
      return w ? String(Math.min(4096,w))+(cover&&h?'x'+Math.min(4096,h):'') : '';
    });
  } finally {
    if(frame){if(original===null)frame.removeAttribute('style');else if(original!==undefined)frame.setAttribute('style',original);}
  }
}

function configure(target: RowTarget) {
  if (document.querySelector('[data-pixflow-fit-config]')) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'pixflow-design-portal-scope';
  dialog.dataset.pixflowFitConfig = '';
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const root = document.documentElement;
  const scope = document.querySelector<HTMLElement>('.pixflow-design-token-scope[data-theme], .pixflow-bricks-agent-shell[data-theme]');
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  function syncTheme() {
    let preference: string | undefined;
    try { preference = JSON.parse(localStorage.getItem('open-design:config') || '{}').theme; } catch { /* Storage is optional. */ }
    const resolved = root.dataset.pixflowTheme || scope?.dataset.theme || preference;
    dialog.dataset.theme = resolved === 'dark' || resolved === 'light' ? resolved : system.matches ? 'dark' : 'light';
    if (scope && scope.dataset.theme === dialog.dataset.theme) {
      for (const name of ['--accent-solid','--accent-solid-hover','--accent-solid-contrast']) {
        const value = getComputedStyle(scope).getPropertyValue(name);
        if (value) dialog.style.setProperty(name,value);
      }
    }
  }
  syncTheme();
  const observer = new MutationObserver(syncTheme);
  observer.observe(root,{attributes:true,attributeFilter:['data-pixflow-theme']});
  if (scope) observer.observe(scope,{attributes:true,attributeFilter:['data-theme','style']});
  system.addEventListener('change',syncTheme);
  function element<K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, text?: string) {
    const el = document.createElement(tag);
    if (text) el.textContent = translate(text);
    parent.append(el);
    return el;
  }
  function button(parent: HTMLElement, text: string, action: () => void) {
    const el = element('button',parent,text);
    el.type = 'button';
    el.onclick = action;
    return el;
  }
  const header = element('header',dialog);
  const title = element('h2',header,target.staticImage ? 'Optimise image' : 'Optimise dynamic images');
  title.id = 'pixflow-fit-title';
  dialog.setAttribute('aria-labelledby',title.id);
  element('p',header,target.staticImage ? 'Fit this image to its placement across screen sizes.' : 'Calculate the image sizes for this placement. Each row keeps its own image.');
  const form = element('form',dialog);
  const body = element('section',form);
  const toolbar = element('div',body);
  toolbar.className = 'pf-fit-toolbar';
  element('h3',toolbar,'Placement sizes');
  const original = target.read() || '';
  let removing = false;
  const calculate = button(toolbar,'Calculate',()=>{
    const sizes = measure(target);
    removing = false;
    inputs.forEach((input,i)=>{ input.value = sizes[i] || ''; input.disabled = false; });
    status.textContent = translate(sizes.every(Boolean) ? 'Calculated from the editor preview.' : 'Enter a size for each visible placement.');
    update();
  });
  const fields = element('div',body);
  fields.className = 'pf-fit-fields';
  const inputs = ['Mobile','Tablet','Desktop'].map((name,i)=>{
    const label = element('label',fields);
    element('span',label,name);
    const input = element('input',label);
    input.type = 'text';
    if (!target.cover) input.inputMode = 'numeric';
    input.placeholder = '—';
    input.value = original.split(',')[i] || '';
    input.oninput = ()=>{removing = false; update();};
    return input;
  });
  const status = element('p',body,target.cover ? 'Enter width × height in pixels, for example 480 × 320.' : 'Widths are in pixels. You can adjust each size before saving.');
  status.setAttribute('role','status');
  const footer = element('footer',form);
  if (original) {
    const disable = button(footer,'Disable',()=>{
      removing = true;
      inputs.forEach(input=>{input.disabled=true;});
      status.textContent = translate('Save to disable optimisation for this placement.');
      update();
    });
    disable.className = 'pf-fit-disable';
  }
  button(footer,'Cancel',()=>dialog.close());
  const save = element('button',footer,'Save');
  save.type = 'submit';
  save.className = 'pf-fit-save';
  function draft() { return removing ? '' : inputs.map(i=>i.value.trim().replace(/\s*[×x]\s*/g,'x')).join(','); }
  function update() {
    const value = draft();
    const valid = removing || value.split(',').every(slot=>/^[1-9]\d{0,3}(?:x[1-9]\d{0,3})?$/.test(slot) && slot.split('x').every(n=>Number(n)<=4096));
    save.disabled = !valid || value === original;
  }
  form.onsubmit = event=>{
    event.preventDefault();
    if (!save.disabled) {target.write(draft());dialog.close();}
  };
  update();
  dialog.onclose = ()=>{
    observer.disconnect();
    system.removeEventListener('change',syncTheme);
    dialog.remove();
    if(previous?.isConnected) previous.focus({preventScroll:true});
  };
  document.body.append(dialog);
  dialog.showModal();
  calculate.focus();
}
window.addEventListener('pixflow:dynamic-fit-configure',e=>configure((e as CustomEvent<RowTarget>).detail));

const wp=host.wp;
if(wp?.hooks && wp?.element && wp?.blockEditor) {
  const store=()=>wp.data.select('core/block-editor');
  const dynamicBlock=(name:string,attrs:any)=>name==='core/post-featured-image'||!!attrs.useFeaturedImage||
    [attrs.metadata?.bindings?.url,attrs.metadata?.bindings?.id].some(binding=>typeof binding?.source==='string'&&binding.source.trim());
  const eligible=(id:string,name:string,attrs:any)=>{
    if(!['core/image','core/cover','core/post-featured-image'].includes(name))return false;
    if(!dynamicBlock(name,attrs))return Number(attrs.id)>0 || (name==='core/image' && /^https?:\/\//i.test(attrs.url||''));
    return store().getBlockParents(id).some((parent:string)=>store().getBlockName(parent)==='core/query');
  };
  const target=(id:string):EditorFit|undefined=>{
    const block=store()?.getBlock(id);
    if (!block || !['core/image','core/cover','core/post-featured-image'].includes(block.name)) return;
    const attrs=block.attributes;
    const dynamic=dynamicBlock(block.name,attrs);
    if (!eligible(id,block.name,attrs)) return;
    const doc=document.querySelector<HTMLIFrameElement>('iframe[name="editor-canvas"]')?.contentDocument??document;
    const root=doc.querySelector('[data-block="'+CSS.escape(id)+'"]');
    if(!root)return;
    const cover=block.name==='core/cover';
    return {node:cover?root:root.querySelector('img')??root,cover,dynamic,attachmentId:dynamic?0:Number(attrs.id)||0,sourceUrl:dynamic?undefined:attrs.url,
      read:()=>store().getBlock(id)?.attributes.pixflowDynamicFit||'',
      write:profile=>wp.data.dispatch('core/block-editor').updateBlockAttributes(id,{pixflowDynamicFit:profile})};
  };
  const Control=({id,profile}:{id:string;profile:string})=>{
    const ref=wp.element.useRef(null);
    wp.element.useLayoutEffect(()=>{const t=target(id);if(t&&ref.current)return bindEditorFit(ref.current,t,()=>target(id),()=>store()?.getSelectedBlockClientId()===id);},[id,profile]);
    return wp.element.createElement('div',null,wp.element.createElement('button',{ref,type:'button',className:'components-button is-secondary'},translate('Optimise image')));
  };
  wp.hooks.addFilter('editor.BlockEdit','pixflow/dynamic-fit',(Edit:any)=>(props:any)=>{
    const h=wp.element.createElement;
    if(!props.isSelected||!eligible(props.clientId,props.name,props.attributes))return h(Edit,props);
    return h(wp.element.Fragment,null,h(Edit,props),h(wp.blockEditor.InspectorControls,null,
      h(wp.components.PanelBody,{title:translate('Image optimisation')},h(Control,{key:JSON.stringify([props.attributes.id,props.attributes.useFeaturedImage,props.attributes.url,props.attributes.metadata?.bindings]),id:props.clientId,profile:props.attributes.pixflowDynamicFit}))));
  });
  installEditorFitSave(()=>Array.from(store()?.getClientIdsWithDescendants()??[]).map(id=>target(String(id))).filter((t):t is EditorFit=>!!t),'.editor-post-publish-button,.editor-post-save-draft','iframe[name="editor-canvas"]');
}
