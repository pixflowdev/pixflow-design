/** Configure only the placement. The editor's own change handler owns Undo and Save. */
type RowTarget = { node: Element; cover?: boolean; read(): string; write(value: string): void };
const host = window as any;
const translate = (text: string) => host.wp.i18n.__(text,'pixflow-design');

function measure({node,cover}: RowTarget): string[] {
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
  if(document.querySelector('[data-pixflow-fit-config]'))return;
  const dialog=document.createElement('dialog');
  dialog.dataset.pixflowFitConfig='';
  dialog.style.cssText='position:fixed;inset:0;margin:auto;width:min(400px,90vw);padding:24px;border:1px solid #7776;border-radius:12px;color:CanvasText;background:Canvas;font:14px/1.5 system-ui;z-index:2147483647';
  const title=document.createElement('h2');title.id='pixflow-fit-title';title.textContent=translate('Optimise dynamic images');dialog.setAttribute('aria-labelledby',title.id);
  const hint=document.createElement('p');hint.textContent=translate('Each row keeps its own image. Check the measured widths in pixels before enabling optimisation.');
  const values=target.read()?.split(','); const sizes=values?.length===3?values:measure(target);
  const form=document.createElement('form');dialog.append(title,hint,form);
  const inputs=['Mobile','Tablet','Desktop'].map((label,i)=>{
    const row=document.createElement('label');row.style.cssText='display:flex;align-items:center;justify-content:space-between;margin:8px 0';
    row.append(translate(label));const input=document.createElement('input');input.required=true;input.pattern='[1-9][0-9]{0,3}(x[1-9][0-9]{0,3})?';input.value=sizes[i]||'';input.style.width='8em';
    row.append(input);form.append(row);return input;
  });
  const actions=document.createElement('div');actions.style.cssText='display:flex;justify-content:flex-end;gap:8px;margin-top:18px';form.append(actions);
  const button=(text:string,fn:()=>void)=>{const b=document.createElement('button');b.type='button';b.textContent=translate(text);b.onclick=fn;actions.append(b);return b;};
  if(target.read())button('Disable',()=>{target.write('');dialog.close();});
  button('Cancel',()=>dialog.close());button(target.read()?'Save changes':'Enable for this placement',()=>form.requestSubmit());
  form.onsubmit=e=>{e.preventDefault();for(const input of inputs){if(input.value.split('x').some(n=>Number(n)>4096)){input.setCustomValidity(translate('Use a size from 1 to 4096 pixels.'));input.reportValidity();input.oninput=()=>input.setCustomValidity('');return;}}
    target.write(inputs.map(i=>i.value).join(','));dialog.close();};
  dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
}
window.addEventListener('pixflow:dynamic-fit-configure',e=>configure((e as CustomEvent<RowTarget>).detail));

const wp=host.wp;
if(wp?.hooks && wp?.element && wp?.blockEditor) {
  wp.hooks.addFilter('editor.BlockEdit','pixflow/dynamic-fit',(Edit:any)=>(props:any)=>{
    const h=wp.element.createElement;
    if((props.name!=='core/post-featured-image' && !(props.name==='core/cover'&&props.attributes.useFeaturedImage))||!props.isSelected)return h(Edit,props);
    return h(wp.element.Fragment,null,h(Edit,props),h(wp.blockEditor.InspectorControls,null,
      h(wp.components.PanelBody,{title:translate('Optimise dynamic images'),initialOpen:false},
        h(wp.components.Button,{variant:'secondary',onClick:()=>{
          const canvas=document.querySelector<HTMLIFrameElement>('iframe[name="editor-canvas"]')?.contentDocument??document;
          const root=canvas.querySelector('[data-block="'+CSS.escape(props.clientId)+'"]');
          if(root) configure({node:root.querySelector('img')??root,cover:props.name==='core/cover'||(props.attributes.scale==='cover'&&!!props.attributes.height),
            read:()=>props.attributes.pixflowDynamicFit||'',write:v=>props.setAttributes({pixflowDynamicFit:v||undefined})});
        }},translate(props.attributes.pixflowDynamicFit?'Edit placement sizes':'Measure placement')))));
  });
}
