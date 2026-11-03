import './dynamic-fit-editor';
import { encodeMediaImage } from '../utils/encode-media-image';

type Placement = { node: Element; cover: boolean };
type Attachment = { id: number; get(key: string): any; fetch(): Promise<unknown> };
type Selection = { length: number; first(): Attachment; reset(models: Attachment[]): void };
type Frame = { el: HTMLElement; state(): { get(key: string): Selection }; options: { multiple?: boolean; pixflowFitOwned?: boolean }; once(event: string, fn: () => void): void };
const wp = (window as any).wp;
const supported = ['image/jpeg', 'image/png', 'image/webp'];
const label = (text: string) => wp.i18n.__(text, 'pixflow-design');

function placement(): Placement | undefined {
  let selected: Placement | undefined;
  window.dispatchEvent(new CustomEvent('pixflow:fit-placement', {detail: {
    set(node: Element, cover: boolean) { selected = {node, cover}; },
  }}));
  if (selected) return selected;
  const block = wp.data?.select('core/block-editor')?.getSelectedBlock?.();
  if (!block || !['core/image', 'core/cover'].includes(block.name)) return;
  const canvas = document.querySelector<HTMLIFrameElement>('iframe[name="editor-canvas"]')?.contentDocument ?? document;
  const root = canvas.querySelector('[data-block="' + CSS.escape(block.clientId) + '"]');
  if (root) return {node: block.name === 'core/image' ? root.querySelector('img') ?? root : root, cover:block.name === 'core/cover'};
}

async function targetWidth({node, cover}: Placement, aspect: number, max: number) {
  // Preserve each editor's live style cascade, including media queries and container units.
  const frame = node.ownerDocument.defaultView?.frameElement as HTMLElement | null;
  const measure = () => {
    const el = node as HTMLElement;
    return Math.max(el.offsetWidth, cover ? el.offsetHeight * aspect : 0);
  };
  let width = measure();
  if (!width) throw Error(label('The selected placement has no measurable size.'));
  if (!frame) return max; // A non-iframed editor has no independent viewport to resize safely.
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
    width = measure();
    frame.style.setProperty('transition-property','none','important');
    for (const w of widths) {
      if (width >= max) break;
      for (const key of properties) frame.style.setProperty(key, w + 'px', 'important');
      frame.getBoundingClientRect();
      width = Math.max(width, measure());
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
  return Math.min(max, Math.ceil(width));
}

async function makeCopy(model: Attachment, target: Placement, signal: AbortSignal, current: () => boolean, status: HTMLElement) {
  const sourceId = Number(model.get('pixflowFitSource'));
  const original = sourceId && sourceId !== model.id ? wp.media.attachment(sourceId) : model;
  if (original !== model) await original.fetch();
  const res = await fetch(original.get('url'), {signal});
  if (!res.ok) throw Error(label('Could not read this image.'));
  const source = await res.blob();
  if (original.get('mime') === 'image/png') {
    const bytes = new DataView(await source.arrayBuffer());
    for (let i = 8; i + 12 <= bytes.byteLength; i += bytes.getUint32(i) + 12) {
      if (bytes.getUint32(i+4) === 0x6163544c) throw Error(label('Animated images keep their original format.'));
    }
  }
  if (original.get('mime') === 'image/webp') {
    const bytes = new DataView(await source.arrayBuffer());
    for (let i = 12; i + 8 <= bytes.byteLength;) {
      if (bytes.getUint32(i) === 0x414e494d) throw Error(label('Animated images keep their original format.'));
      const length = bytes.getUint32(i + 4, true);
      i += 8 + length + (length % 2);
    }
  }
  const url = URL.createObjectURL(source);
  let encoded;
  try {
    const img = new Image(); img.src = url; await img.decode();
    const width = await targetWidth(target, img.naturalWidth / img.naturalHeight, img.naturalWidth);
    if (original !== model && Number(model.get('width')) === width) {
      status.textContent = label('This copy already fits the placement.');
      return;
    }
    encoded = await encodeMediaImage(img, 'webp', 82, width);
  } finally { URL.revokeObjectURL(url); }
  if (!current()) return;
  if (encoded.blob.size >= source.size) { status.textContent = label('The original is already smaller.'); return; }
  const form = new FormData();
  form.append('file', encoded.blob, original.get('filename').replace(/\.[^.]+$/, '') + '-fit-' + encoded.width + '.webp');
  form.append('pixflow_fit_source', String(original.id));
  for (const key of ['title','caption','description','alt']) {
    const value = model.get(key);
    if (typeof value === 'string') form.append(key === 'alt' ? 'alt_text' : key, value);
  }
  status.textContent = label('Saving optimised copy…');
  const copy = await wp.apiFetch({path:'/wp/v2/media', method:'POST',body:form,signal});
  const attachment = wp.media.attachment(copy.id);
  await attachment.fetch();
  if (!current()) return;
  return { attachment, savedBytes: source.size - encoded.blob.size, width: encoded.width };
}

function reportSaved(width: number, bytes: number) {
  const notice = document.createElement('div');
  notice.setAttribute('role','status');
  notice.style.cssText = 'position:fixed;inset:auto 18px 18px auto;padding:10px 16px;background:#202124;color:white;border-radius:8px;z-index:2147483646;pointer-events:none;font:14px/1.4 system-ui';
  notice.textContent = wp.i18n.sprintf(label('Optimised copy � %1$s px � saved %2$s KB'), width, Math.round(bytes / 1024));
  document.body.append(notice);
  window.setTimeout(() => notice.remove(), 4500);
}

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
    const copy = await makeCopy(model, target, signal, valid, status);
    if (copy && valid()) {
      await apply(copy.attachment.toJSON());
      reportSaved(copy.width, copy.savedBytes);
    }
  } catch (error) {
    if (!signal.aborted) status.textContent = error instanceof Error ? error.message : label('Could not optimise this image.');
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
      const copy = await makeCopy(model, target, abort.signal, current, status);
      if (!copy || !current()) return;
      selection.reset([copy.attachment]);
      const apply = frame.el.querySelector<HTMLButtonElement>('.media-button-select, .media-button-insert');
      if (apply && !apply.disabled) { apply.click(); reportSaved(copy.width, copy.savedBytes); }
    } catch (error) {
      if (!abort.signal.aborted) status.textContent = error instanceof Error ? error.message : label('Could not optimise this image.');
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



