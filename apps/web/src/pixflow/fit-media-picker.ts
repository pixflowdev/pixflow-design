import './fit-upscale-worker';
import { measure } from './dynamic-fit-editor';


type Placement = { node: Element; cover: boolean; saveProfile(profile: string): void };
type Attachment = { id: number; get(key: string): any; fetch(): Promise<unknown> };
type Selection = { length: number; first(): Attachment; reset(models: Attachment[]): void };
type Frame = { el: HTMLElement; state(): { get(key: string): Selection }; options: { multiple?: boolean; pixflowFitOwned?: boolean }; once(event: string, fn: () => void): void };
const wp = (window as any).wp;
const supported = ['image/jpeg', 'image/png', 'image/webp'];
const label = (text: string) => wp.i18n.__(text, 'pixflow-design');

function placement(): Placement | undefined {
  let selected: Placement | undefined;
  window.dispatchEvent(new CustomEvent('pixflow:fit-placement', {detail: {
    set(node: Element, cover: boolean, saveProfile?: Placement["saveProfile"]) { if (saveProfile) selected = {node, cover, saveProfile}; },
  }}));
  if (selected) return selected;
  const block = wp.data?.select('core/block-editor')?.getSelectedBlock?.();
  if (!block || !['core/image', 'core/cover'].includes(block.name)) return;
  const canvas = document.querySelector<HTMLIFrameElement>('iframe[name="editor-canvas"]')?.contentDocument ?? document;
  const root = canvas.querySelector('[data-block="' + CSS.escape(block.clientId) + '"]');
  if (root) return {node: block.name === 'core/image' ? root.querySelector('img') ?? root : root, cover:block.name === 'core/cover', saveProfile: profile => wp.data.dispatch('core/block-editor').updateBlockAttributes(block.clientId,{pixflowDynamicFit:profile})};
}

function placementProfile({node, cover}: Placement, aspect: number, max: number, limit = max) {
  // Preserve each editor's live style cascade, including media queries and container units.
  const frame = node.ownerDocument.defaultView?.frameElement as HTMLElement | null;
  const measure = () => {
    const el = node as HTMLElement;
    return Math.max(el.offsetWidth, cover ? el.offsetHeight * aspect : 0);
  };
  const width = measure();
  if (!width) throw Error(label('The selected placement has no measurable size.'));
  if (!frame) return [max,max,max].map(w => Math.min(4096,w)).join(','); // A non-iframed editor has no independent viewport to resize safely.
  const measured = [0,0,0];
  const properties = ['width', 'min-width', 'max-width'];
  const original = properties.map(key => [frame.style.getPropertyValue(key), frame.style.getPropertyPriority(key)]);
  const widths = new Set([360, 390, 600, 767, 768, 782, 991, 1024, 1280, 1440, 1920]);
  function collect(rules: CSSRuleList) {
    for (const rule of Array.from(rules)) {
      if ('conditionText' in rule) for (const hit of String(rule.conditionText).matchAll(/(?:min|max)-width:\s*([\d.]+)(px|em|rem)/g)) {
        const boundary = Math.round(Number(hit[1]) * (hit[2] === 'px' ? 1 : 16));
        if (boundary >= 320 && boundary <= 2560) { widths.add(boundary); widths.add(boundary + 1); widths.add(boundary - 1); }
      }
      if ('cssRules' in rule && 'conditionText' in rule) collect(rule.cssRules as CSSRuleList);
    }
  }
  for (const sheet of Array.from(node.ownerDocument.styleSheets)) {
    try { collect(sheet.cssRules); } catch { /* Third-party stylesheets can be applied but not inspected. */ }
  }
  // WordPress and Bricks emit attachment dimensions as HTML attributes. The
  // current attachment (or placeholder) is not the intrinsic size of its replacement.
  const image = !cover && node.tagName === 'IMG' ? node : null;
  const intrinsicWidth = image?.getAttribute('width') ?? null;
  const intrinsicHeight = image?.getAttribute('height') ?? null;
  const transition = frame.style.getPropertyValue('transition-property');
  const priority = frame.style.getPropertyPriority('transition-property');
  try {
    image?.setAttribute('width', String(max));
    image?.setAttribute('height', String(Math.round(max / aspect)));
    frame.style.setProperty('transition-property','none','important');
    for (const w of widths) {
      for (const key of properties) frame.style.setProperty(key, w + 'px', 'important');
      frame.getBoundingClientRect();
      const slot = w <= 600 ? 0 : w <= 1024 ? 1 : 2;
      measured[slot] = Math.max(measured[slot]!, measure());
    }
  } finally {
    if (image) {
      if (intrinsicWidth === null) image.removeAttribute('width'); else image.setAttribute('width', intrinsicWidth);
      if (intrinsicHeight === null) image.removeAttribute('height'); else image.setAttribute('height', intrinsicHeight);
    }
    properties.forEach((key, i) => {
      const [value, priority] = original[i]!;
      if (value) frame.style.setProperty(key, value, priority); else frame.style.removeProperty(key);
    });
    frame.getBoundingClientRect();
    if (transition) frame.style.setProperty('transition-property', transition, priority);
    else frame.style.removeProperty('transition-property');
  }
  return measured.map(value => Math.min(4096,limit,Math.ceil(value || width))).join(',');
}

async function fitSelection(model: Attachment, target: Placement) {
  const sourceId = Number(model.get('pixflowFitSource'));
  const attachment = sourceId && sourceId !== model.id ? wp.media.attachment(sourceId) : model;
  if (attachment !== model) await attachment.fetch();
  const width = Number(attachment.get('width'));
  const height = Number(attachment.get('height'));
  if (!(width > 0 && height > 0)) throw Error(label('Could not read this image.'));
  return {attachment, profile: placementProfile(target, width / height, width,4096)};
}

async function existingProfile(node: Element, attachmentId: number, cover=false, resolveNode=()=>node): Promise<string> {
  if (cover) {
    const sizes=measure({node,cover:true});
    if (!sizes.every(Boolean)) throw Error(label('The selected placement has no measurable size.'));
    return sizes.join(',');
  }
    let profile: string;
    if (attachmentId) {
      const model = wp.media.attachment(attachmentId);
      if (!model.get('width') || !model.get('mime')) await model.fetch();
      if (!supported.includes(model.get('mime'))) throw Error(label('Choose a JPEG, PNG or WebP image.'));
      const width = Number(model.get('width')), height = Number(model.get('height'));
      if (!(width > 0 && height > 0)) throw Error(label('Could not read this image.'));
      let image = resolveNode();
      // Gutenberg replaces the selected image as focus moves to its inspector.
      for (let attempt=0; attempt<10 && !image?.getBoundingClientRect().width; attempt++) {
        await new Promise<void>(done=>requestAnimationFrame(()=>done()));
        image=resolveNode();
      }
      if (!image) throw Error(label('Select the image and try again.'));
      profile = placementProfile({node:image,cover:false,saveProfile:()=>{}},width/height,width,4096);
    } else {
      const sizes = measure({node});
      if (!sizes.every(Boolean)) throw Error(label('The selected placement has no measurable size.'));
      profile = sizes.join(',');
    }
    return profile;
}

type WatchedFit = {
  signal?: AbortSignal;
  node(): Element | null;
  controls(): HTMLElement | null;
  profile: string;
  attachmentId: number;
  cover?: boolean;
};
let stopWatchingFit: (() => void) | undefined;
window.addEventListener('pixflow:watch-fit', event => {
  stopWatchingFit?.();
  const target = (event as CustomEvent<WatchedFit | null>).detail;
  if (!target || !/^\d+(?:x\d+)?(?:,\d+(?:x\d+)?){2}$/.test(target.profile)) return;
  let stopped = false;
  let observed: Element | null = null;
  let timer = 0;
  let revision = 0;
  let displayed: HTMLElement | null = null;
  const schedule = () => {
    const run = ++revision;
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const node = target.node();
      if (node !== observed) {
        resize.disconnect();
        observed = node;
        if (node) {
          resize.observe(node);
          if (node.parentElement) resize.observe(node.parentElement);
        }
      }
      const controls = target.controls();
      if (!node || !controls) return;
      let profile: string;
      try { profile = await existingProfile(node,target.attachmentId,target.cover); } catch { return; }
      if (stopped || run !== revision || node !== target.node()) return;
      const widths = profile.split(',');
      const saved = target.profile.split(',');
      const index = widths.findIndex((width,i) => slotChanged(width,saved[i]!));
      const notice = controls.querySelector<HTMLElement>('[data-pixflow-fit-notice]');
      if (!notice) return;
      displayed = controls;
      if (index >= 0) {
        notice.textContent = label('Image size has changed and needs reoptimising.');
      }
      controls.toggleAttribute('data-fit-stale',index >= 0);
    },250);
  };
  const resize = new ResizeObserver(schedule);
  const doc = target.node()?.ownerDocument;
  const mutations = new MutationObserver(() => {
    if (target.node() !== observed) schedule();
  });
  if (doc?.body) mutations.observe(doc.body,{childList:true,subtree:true});
  const styles = new MutationObserver(schedule);
  if (doc?.head) styles.observe(doc.head,{childList:true,characterData:true,subtree:true});
  schedule();
  stopWatchingFit = () => {
    stopped = true;
    clearTimeout(timer);
    resize.disconnect();
    mutations.disconnect();
    styles.disconnect();
    displayed?.removeAttribute('data-fit-stale');
  };
  target.signal?.addEventListener('abort',stopWatchingFit,{once:true});
});

function slotChanged(next:string, previous:string) {
  const old=previous.split('x').map(Number);
  const values=next.split('x').map(Number);
  return old.length!==values.length || values.some((n,i)=>Math.abs(n-old[i]!)>2);
}

type SaveFit = { cover?: boolean; profile: string; node: Element | null; attachmentId: number; apply(profile: string): boolean };

async function checkSaveFits(placements: SaveFit[], signal: AbortSignal) {
  let notice: HTMLElement | undefined;
  let skipped = 0;
  function report(text: string) {
    if (!notice) {
      document.querySelector('[data-pixflow-fit-toast]')?.remove();
      notice = document.createElement('div');
      notice.dataset.pixflowFitToast = '';
      notice.setAttribute('role','status');
      document.body.append(notice);
    }
    notice.textContent = label(text);
  }
  const onTimeout = () => {
    report('Saving with existing sizes for images that could not be checked.');
    window.setTimeout(()=>notice?.remove(),4500);
  };
  signal.addEventListener('abort',onTimeout,{once:true});
  let lastYield = performance.now();
  try {
    for (const placement of placements) {
      try {
        if (performance.now()-lastYield>40) {
          await new Promise<void>(done=>window.setTimeout(done,0));
          lastYield=performance.now();
        }
        if (signal.aborted) return;
        if (!placement.node?.isConnected) { skipped++; continue; }
        const next = await existingProfile(placement.node,placement.attachmentId,placement.cover);
        const saved = placement.profile.split(',');
        if (!next.split(',').some((v,i)=>slotChanged(v,saved[i]!))) continue;
        if (!notice) {
          report('Recalculating image sizes…');
          await new Promise<void>(done=>window.setTimeout(done,32));
        }
        if (signal.aborted) return;
        if (!placement.apply(next)) skipped++;
      } catch { skipped++; }
    }
    if (signal.aborted) return;
    if (skipped) report('Saving with existing sizes for images that could not be checked.');
    else if (notice) report('Image sizes updated. Saving…');
  } finally {
    signal.removeEventListener('abort',onTimeout);
    if (notice) window.setTimeout(()=>notice?.remove(),4500);
  }
}

for(const name of ['pixflow:before-editor-fit-save','pixflow:before-bricks-save']) window.addEventListener(name, event => {
  const detail = (event as CustomEvent).detail;
  detail.wait(checkSaveFits(detail.placements, detail.signal));
});

const resolvedSources=new Map<string,Promise<{id:number}>>();
function fitSource(source:string,importImage=false) {
  const cached=resolvedSources.get(source);
  if (!importImage && cached) return cached;
  const request=wp.apiFetch({path:'/pixflow-design/v1/media/fit-source',method:'POST',data:{source,import:importImage}}) as Promise<{id:number}>;
  resolvedSources.set(source,request);
  void request.catch(()=>resolvedSources.delete(source));
  return request;
}
window.addEventListener('pixflow:fit-source-label',async event=>{
  const {source,button,apply}=(event as CustomEvent).detail;
  try {
    button.dataset.fitSource=source;
    button.disabled=true;
    const {id}=await fitSource(source);
    if(button.isConnected && button.dataset.fitSource===source){button.dataset.fitImport=id?'no':'yes';apply(!id);}
  } catch { /* The action retries lookup on click. */ }
  finally {if(button.dataset.fitSource===source)button.disabled=false;}
});
window.addEventListener('pixflow:fit-existing-image', async event => {
  const {node, attachmentId, current, read, write, button} = (event as CustomEvent).detail;
  if (button.disabled) return;
  button.disabled = true;
  document.querySelector('[data-pixflow-fit-toast]')?.remove();
  const notice = document.createElement('div');
  notice.dataset.pixflowFitToast = '';
  notice.setAttribute('role','status');
  document.body.append(notice);
  notice.textContent = label('Calculating image sizes…');
  try {
    await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    if (!current() || !((event as CustomEvent).detail.resolveNode?.() ?? node)?.isConnected) throw Error(label('Select the image and try again.'));
    let id=attachmentId;
    const source=(event as CustomEvent).detail.sourceUrl;
    if (!id && source) {
      const resolved=await fitSource(source);
      if (!resolved.id && !(button.dataset.fitImport==='yes' && button.dataset.fitSource===source))
        throw Error(label('Select the image again to import it.'));
      id=resolved.id || (await fitSource(source,true)).id;
      if (!current()) return;
    }
    const profile = await existingProfile(node,id,(event as CustomEvent).detail.cover,(event as CustomEvent).detail.resolveNode);
    if (!current()) throw Error(label('Select the image and try again.'));
    if (read() !== profile) write(profile);
    notice.textContent = label('Finished. Responsive image sizes are set.');
  } catch (error) {
    notice.textContent = (error as {message?:string})?.message || label('Could not optimise this image.');
  } finally {
    button.disabled = false;
    window.setTimeout(() => notice.remove(),4500);
  }
});

window.addEventListener('pixflow:fit-native-selection', async event => {
  const {id, current, apply, status, signal, finish} = (event as CustomEvent).detail;
  try {
    const target = placement();
    if (!target) return;
    const model = wp.media.attachment(id);
    await model.fetch();
    if (!supported.includes(model.get('mime'))) { status.textContent = label('Choose a JPEG, PNG or WebP image.'); return; }
    const valid = () => !signal.aborted && current() && placement()?.node === target.node;
    if (!valid()) return;
    const fit = await fitSelection(model, target);
    if (valid()) {
      await apply(fit.attachment.toJSON());
      target.saveProfile(fit.profile);
    }
  } catch (error) {
    if (!signal.aborted) status.textContent = (error as {message?:string})?.message || label('Could not optimise this image.');
  } finally { finish(); }
});

function install(frame: Frame, target: Placement) {
  const selection = frame.state()?.get('selection');
  if (!selection || frame.options.multiple || frame.el.querySelector('[data-pixflow-fit]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button';
  button.dataset.pixflowFit = '';
  button.textContent = label('Fit & optimise');
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  status.style.marginInline = '8px';
  const abort = new AbortController();
  const refresh = () => {
    const primary = frame.el.querySelector<HTMLButtonElement>('.media-button-select, .media-button-insert');
    if (!primary || primary.parentElement === null) return;
    if (button.parentElement !== primary.parentElement) primary.before(status, button);
    const eligible = selection.length === 1 && supported.includes(selection.first()?.get('mime'));
    button.style.display = eligible ? '' : 'none';
  };
  const observer = new MutationObserver(refresh);
  observer.observe(frame.el, {childList:true, subtree:true, attributes:true, attributeFilter:['aria-checked','disabled']});
  frame.once('close', () => { abort.abort(); observer.disconnect(); button.remove(); status.remove(); });
  refresh();
  button.onclick = async () => {
    const model = selection.first();
    if (!model || button.disabled) return;
    button.disabled = true;
    status.textContent = label('Measuring placement…');
    const current = () => !abort.signal.aborted && selection.first()?.id === model.id && placement()?.node === target.node;
    try {
      const fit = await fitSelection(model, target);
      if (!current()) return;
      selection.reset([fit.attachment]);
      const apply = frame.el.querySelector<HTMLButtonElement>('.media-button-select, .media-button-insert');
      if (apply && !apply.disabled) { apply.click(); target.saveProfile(fit.profile); }
    } catch (error) {
      if (!abort.signal.aborted) status.textContent = (error as {message?:string})?.message || label('Could not optimise this image.');
    } finally { button.disabled = false; }
  };
}

const prototype = wp?.media?.view?.MediaFrame?.prototype;
if (prototype && !prototype.pixflowFitInstalled) {
  const open = prototype.open;
  prototype.open = function(this: Frame, ...args: unknown[]) {
    const target = placement();
    const result = open.apply(this, args);
    if (target && !this.options.pixflowFitOwned) install(this, target);
    return result;
  };
  prototype.pixflowFitInstalled = true;
}
