import { createPresenceControls } from './native-presence-controls';
import { reviewLabel, reviewSection, type ReviewArea } from './presence-review';
import { nativeReviewTargetEvent, type NativeReviewTarget } from './native-review-target';
export type PresenceTarget = { id: string; label: string; scope?: 'content' | 'layout' };
type TrackedTarget = PresenceTarget & { fromContent?: boolean; node?: HTMLElement };
export type PresenceState = 'hidden' | 'arriving' | 'working' | 'completed' | 'moving';
type Bounds = { left: number; top: number; right: number; bottom: number };
const overlaps = (a: Bounds, b: Bounds) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** Prefer clear space outside the edit, avoiding host panels and preview edges. */
export function placePresenceCaption(target: Bounds, viewport: Bounds, width: number, height: number, obstacles: Bounds[] = []) {
  const gap = 8, maxWidth = Math.min(280, Math.max(0, viewport.right - viewport.left - gap * 2));
  const w = Math.min(width, maxWidth);
  const clampX = (x: number) => Math.max(viewport.left + gap, Math.min(x, viewport.right - w - gap));
  const clampY = (y: number) => Math.max(viewport.top + gap, Math.min(y, viewport.bottom - height - gap));
  const positions = [
    { top: target.top - height - gap, placement: 'above' },
    { top: target.bottom + gap, placement: 'below' },
    { top: target.bottom - height - gap, placement: 'inside' },
  ];
  for (const candidate of positions) {
    if (candidate.placement !== 'inside' && (candidate.top < viewport.top + gap || candidate.top + height > viewport.bottom - gap)) continue;
    for (const x of [target.left, target.right - w, viewport.left + gap, viewport.right - w - gap]) {
      const left = clampX(x), top = clampY(candidate.top);
      if (!obstacles.some(obstacle => overlaps({ left, top, right: left + w, bottom: top + height }, obstacle))) {
        return { left, top, maxWidth, placement: candidate.placement };
      }
    }
  }
  return { left: clampX(target.left), top: clampY(target.top), maxWidth, placement: 'occluded' };
}

type PresenceOptions = {
  builder: string;
  iframeSelector?: string;
  getFrame?: () => HTMLIFrameElement | null;
  targetSelector: (id: string) => string;
  resolveTarget?: (doc: Document, id: string) => HTMLElement | null;
  scrollBehavior?: 'smooth' | 'instant';
};

/** A host-only follower. Execution owns working/completed; user input always wins. */
export function createNativeEditorPresence(getPostId: () => number | string, options: PresenceOptions) {
  const root = document.createElement('div'); root.id = 'pixflow-direct-presence';
  root.dataset.builder = options.builder; root.dataset.presentation = 'quiet'; root.dataset.state = 'hidden';
  const box = document.createElement('div'); box.className = 'pixflow-direct-presence-box';
  const cursor = document.createElement('div'); cursor.className = 'pixflow-direct-presence-cursor';
  const pointer = document.createElement('span'); pointer.className = 'pixflow-direct-presence-pointer'; pointer.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span'); label.className = 'pixflow-direct-presence-label';
  const brand = document.createElement('span'); brand.className = 'pixflow-direct-presence-brand'; brand.textContent = 'Working…';
  const detail = document.createElement('span'); detail.className = 'pixflow-direct-presence-detail';
  label.append(brand, detail); cursor.append(pointer, label); root.append(box, cursor); document.body.append(root);
  root.setAttribute('role', 'status'); root.setAttribute('aria-atomic', 'true');
  let frame = 0, timer: ReturnType<typeof setTimeout> | undefined, transition: ReturnType<typeof setTimeout> | undefined;
  let targets: TrackedTarget[] = [], postId: number | string = 0, revealId = '', stopped = false, finished = false, changed = false;
  let yielded = false, lastEditAt = 0, lastNode: HTMLElement | null = null, group: HTMLElement | null = null;
  let preview: Document | null = null, previousCaption: { x: number; y: number } | undefined;
  let obstacles: Bounds[] = [], obstacleReadAt = 0, controlsReadAt = 0;
  let working = false, saved = false, reviewing = false, reviewIndex = 0, dismissed = false;
  let latest: TrackedTarget[] = [];
  const retireReview = () => document.dispatchEvent(new CustomEvent(nativeReviewTargetEvent, { detail: null }));
  const history = new Map<string, TrackedTarget>();
  let hovering = false;
  const groupIds = new WeakMap<HTMLElement, string>();
  let nextGroupId = 0;
  let areas: Array<ReviewArea & { node: HTMLElement; target: TrackedTarget }> = [];
  const collectAreas = () => {
    const doc = getFrame()?.contentDocument;
    const groups = new Map<HTMLElement, typeof areas[number]>();
    for (const [id, item] of history) {
      const node = doc && resolve(doc, id);
      if (!node?.isConnected) continue; // Native model notifications can precede rendering.
      const sectionNode = reviewSection(node);
      let area = groups.get(sectionNode);
      if (!area) {
        if (!groupIds.has(sectionNode)) groupIds.set(sectionNode, `area:${++nextGroupId}`);
        const name = reviewLabel(sectionNode, sectionNode === node ? item.label : `Section ${groups.size + 1}`);
        area = { id: groupIds.get(sectionNode)!, label: name, node: sectionNode, target: { ...item, node: sectionNode, label: name, fromContent: false }, elements: [] };
        groups.set(sectionNode, area);
      }
      area.elements.push({ id, label: reviewLabel(node, item.label) });
    }
    areas = [...groups.values()]; reviewIndex = Math.min(reviewIndex, Math.max(0, areas.length - 1));
  };
  const contentLabel = (node: HTMLElement) => {
    const heading = node.querySelector<HTMLElement>('h1,h2,h3') || (/^H[1-6]$/.test(node.tagName) ? node : null);
    return ((node.hasAttribute('data-block') ? '' : node.getAttribute('aria-label')) || heading?.innerText || heading?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  };
  const getFrame = () => options.getFrame ? options.getFrame() : options.iframeSelector ? document.querySelector<HTMLIFrameElement>(options.iframeSelector) : null;
  const syncControls = () => {
    if (dismissed || document.hidden) { controls.hide(); return; }
    collectAreas();
    controls.update({ working, paused: yielded, saved, count: areas.length, index: reviewIndex, reviewing,
      areas: areas.map(({ id, label, elements }) => ({ id, label, elements })),
      label: (reviewing ? areas[reviewIndex]?.label : latest[0]?.label) || 'the page' });
  };
  const choose = (id: string, hover = false) => {
    if (getPostId() !== postId) { resetPage(); return; }
    collectAreas();
    const area = areas.find(a => a.id === id || a.elements.some(e => e.id === id));
    const target = area?.id === id ? area.target : history.get(id);
    if (!target) { syncControls(); return; }
    hide(); hovering = hover; if (!hover) reviewing = true; stopped = false; finished = true;
    if (!hover) { reviewIndex = areas.indexOf(area!); yielded = false; }
    targets = [target]; frame = requestAnimationFrame(position); timer = setTimeout(hide, 4000);
    if (!hover) {
      syncControls();
      const selectedPage = postId;
      const detail: NativeReviewTarget = {
        element: target.node || (getFrame()?.contentDocument && resolve(getFrame()!.contentDocument!, target.id))!,
        builder: options.builder, postId, index: reviewIndex, count: areas.length, label: target.label,
        navigate(direction) {
          if (selectedPage !== getPostId()) { resetPage(); return; }
          collectAreas(); if (areas.length) choose(areas[(reviewIndex + direction + areas.length) % areas.length]!.id);
        },
        dismiss() { if (selectedPage === getPostId()) { reviewing = false; hide(); retireReview(); syncControls(); } },
      };
      if (detail.element?.isConnected) document.dispatchEvent(new CustomEvent(nativeReviewTargetEvent, { detail, cancelable: true }));
      else retireReview();
    }
  };
  const controls = createPresenceControls(getFrame, {
    resume() { if (getPostId() !== postId) { resetPage(); return; } yielded = false; stopped = false; reviewing = false; if (latest.length) show(latest); syncControls(); },
    review(direction) {
      collectAreas(); if (!areas.length) { hide(); syncControls(); return; }
      const index = (reviewing ? reviewIndex + direction + areas.length : 0) % areas.length;
      choose(areas[index]!.id);
    },
    pause() { yielded = true; hide(); syncControls(); },
    select(id) { choose(id); },
    preview(id) { if (working) return; if (id) choose(id, true); else if (hovering) { hide(); hovering = false; } },
    annotate(id) {
      if (getPostId() !== postId) { resetPage(); return; }
      collectAreas();
      const area = areas.find(a => a.id === id);
      const doc = getFrame()?.contentDocument;
      const node = area?.node || (doc && resolve(doc, id));
      if (!node?.isConnected) { syncControls(); return; }
      yielded = working; hide();
      node.scrollIntoView({ block: 'center', behavior: 'instant' });
      document.dispatchEvent(new CustomEvent('pixflow:annotate-element', { detail: { element: node }, cancelable: true }));
      syncControls();
    },
    dismiss() { dismissed = true; yielded = true; hide(); retireReview(); controls.hide(); },
  });
  controls.root.dataset.builder = options.builder;
  const resetPage = () => { retireReview(); history.clear(); areas = []; latest = []; working = false; saved = false; reviewing = false; hide(); controls.reset(); };
  const animations = new Set<Animation>();
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = (value: PresenceState) => { root.dataset.state = value; };
  const animate = (node: HTMLElement, keys: Keyframe[], duration: number) => {
    if (reduced() || !node.animate) return;
    const animation = node.animate(keys, { duration, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    animations.add(animation); animation.onfinish = animation.oncancel = () => animations.delete(animation);
  };
  const hide = () => {
    clearTimeout(timer); clearTimeout(transition); cancelAnimationFrame(frame);
    state('hidden'); root.dataset.visible = 'false';
    animations.forEach(animation => animation.cancel()); animations.clear();
    targets = []; revealId = ''; previousCaption = undefined; group = lastNode = null;
    delete root.dataset.targetId; delete root.dataset.positioned;
  };
  const clear = () => { retireReview(); stopped = true; working = false; changed = false; group = lastNode = null; hide(); syncControls(); };
  const complete = () => {
    clearTimeout(transition); state('completed'); root.dataset.phase = 'updated';
    brand.textContent = reviewing || hovering ? 'Review' : saved ? 'Saved' : 'Updated';
    root.setAttribute('aria-label', `${brand.textContent}: ${detail.textContent}`);
    animate(box, [{ opacity: .55 }, { opacity: 1 }], 360);
    clearTimeout(timer); timer = setTimeout(hide, reviewing ? 4000 : 1100);
  };
  const settle = () => {
    if (finished) complete();
    else {
      state('working'); root.setAttribute('aria-label', `Pixflow editing ${detail.textContent}`);
      brand.textContent = 'Updating…';
    }
  };
  const input = (event: Event) => {
    if (event.composedPath().includes(controls.root)) return;
    // Composing/steering a request does not take ownership of the canvas.
    if ((event.target as Element | null)?.closest?.('.pixflow-bricks-agent-panel')) return;
    if (event instanceof KeyboardEvent && !['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ', 'Tab', 'Escape'].includes(event.key)) return;
    // Manual navigation owns the viewport until the user explicitly resumes.
    // Idle interactions only dismiss the previous highlight; they must not pause
    // the next request before it has even started.
    if (working) yielded = true;
    if (preview?.defaultView && root.dataset.visible === 'true') {
      const view = preview.defaultView;
      view.scrollTo({ top: view.scrollY, left: view.scrollX, behavior: 'instant' });
    }
    hide(); group = lastNode = null; reviewing = false; syncControls();
  };
  const listen = (doc: Document, add: boolean) => {
    for (const name of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
      if (add) doc.addEventListener(name, input, { capture: true, passive: true });
      else doc.removeEventListener(name, input, true);
    }
  };
  listen(document, true);
  const resolve = (doc: Document, id: string) => options.resolveTarget ? options.resolveTarget(doc, id) : doc.querySelector<HTMLElement>(options.targetSelector(id));
  const section = (node: HTMLElement) => node.closest<HTMLElement>('section, .e-con, [data-etch-element="section"]');
  const position = () => {
    if (getPostId() !== postId) { resetPage(); return; }
    if (stopped || document.hidden || (yielded && !hovering)) { hide(); return; }
    try {
      const iframe = getFrame();
      const doc = iframe?.contentDocument;
      if (doc && preview !== doc) { if (preview) listen(preview, false); preview = doc; listen(doc, true); }
      const found = targets.map(item => ({ item, node: item.node?.isConnected ? item.node : doc && resolve(doc, item.id) })).find(item => item.node);
      if (!iframe || !doc || !found?.node) { root.dataset.visible = 'false'; frame = requestAnimationFrame(position); return; }
      // Model events can precede the native editor's text redraw. Refresh names
      // while the follower is already active, without an idle polling loop.
      if (Date.now() - controlsReadAt > 200) { controlsReadAt = Date.now(); syncControls(); }
      let node = found.node;
      if (found.item.fromContent) {
        const name = contentLabel(node);
        if (name && found.item.label !== name) { found.item.label = name; syncControls(); }
      }
      if (group && (!group.isConnected || !group.contains(node))) group = null;
      if (group) node = group;
      const viewport = iframe.getBoundingClientRect(), rect = node.getBoundingClientRect();
      const id = group ? `group:${group.id || group.getAttribute('data-id') || group.getAttribute('data-etch-id') || found.item.id}` : found.item.id;
      const sx = viewport.width / (iframe.offsetWidth || 1), sy = viewport.height / (iframe.offsetHeight || 1);
      if (!hovering && revealId !== id) {
          if (rect.bottom < 0 || rect.top > iframe.clientHeight || rect.right < 0 || rect.left > iframe.clientWidth
            || (reviewing && (rect.top < 24 || rect.top > iframe.clientHeight * .7))) {
          // A visible placeholder can move offscreen as earlier widgets render.
          // Consume the reveal only when an actual scroll is needed.
          revealId = id;
          doc.defaultView?.scrollTo({ top: Math.max(0, (doc.defaultView.scrollY || 0) + rect.top - iframe.clientHeight / 3), left: Math.max(0, (doc.defaultView.scrollX || 0) + (rect.right < 0 || rect.left > iframe.clientWidth ? rect.left - 24 : 0)), behavior: reduced() ? 'instant' : options.scrollBehavior ?? 'smooth' });
        }
      }
      const left = Math.max(0, viewport.left, viewport.left + rect.left * sx), top = Math.max(0, viewport.top, viewport.top + rect.top * sy);
      const right = Math.min(innerWidth, viewport.right, viewport.left + rect.right * sx), bottom = Math.min(innerHeight, viewport.bottom, viewport.top + rect.bottom * sy);
      if (right <= left || bottom <= top) { root.dataset.visible = 'false'; frame = requestAnimationFrame(position); return; }
      const geometry = `${left}:${top}:${right}:${bottom}`;
      if (box.dataset.geometry !== geometry) {
        box.dataset.geometry = geometry;
        box.style.cssText = `transform:translate(${left}px,${top}px);width:${right-left}px;height:${bottom-top}px`;
      }
      const text = group ? (group.getAttribute('aria-label') || group.querySelector('h1,h2,h3')?.textContent?.trim().slice(0,70) || 'Section') : `${found.item.label}${targets.length > 1 ? ` +${targets.length - 1}` : ''}`;
      if (detail.textContent !== text) detail.textContent = text;
      if (Date.now() - obstacleReadAt > 150) {
        obstacles = [...document.querySelectorAll<HTMLElement>('.pixflow-bricks-agent-panel, #elementor-navigator, [role="dialog"], .pixflow-annotation-composer, #pixflow-presence-controls, [data-pixflow-annotation-toolbar]')]
          .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').map(el => el.getBoundingClientRect());
        obstacleReadAt = Date.now();
      }
      const caption = placePresenceCaption({ left, top, right, bottom }, { left: Math.max(0, viewport.left), top: Math.max(0, viewport.top), right: Math.min(innerWidth, viewport.right), bottom: Math.min(innerHeight, viewport.bottom) }, cursor.offsetWidth || 180, cursor.offsetHeight || 28, obstacles);
      cursor.style.maxWidth = `${caption.maxWidth}px`; cursor.style.visibility = caption.placement === 'occluded' ? 'hidden' : '';
      const destination = `translate(${caption.left}px,${caption.top}px)`;
      cursor.style.transform = destination; cursor.dataset.placement = caption.placement;
      if (root.dataset.targetId !== id) {
        clearTimeout(transition);
        const current = root.dataset.positioned ? cursor.getBoundingClientRect() : null;
        if (current?.width && animations.size) previousCaption = { x: current.left, y: current.top };
        animations.forEach(animation => animation.cancel()); animations.clear();
        const nearby = previousCaption && Math.hypot(caption.left-previousCaption.x, caption.top-previousCaption.y) < 240;
        state(previousCaption ? 'moving' : 'arriving');
        if (nearby) animate(cursor, [{ transform: `translate(${previousCaption!.x}px,${previousCaption!.y}px)` }, { transform: destination }], 220);
        else animate(cursor, [{ opacity: 0 }, { opacity: 1 }], 180);
        animate(box, [{ opacity: .35 }, { opacity: 1 }], 220);
        root.dataset.targetId = id;
        if (finished) complete();
        else transition = setTimeout(settle, reduced() ? 0 : 220);
      }
      // Reveal only after caption, status and geometry are ready for the first paint.
      root.dataset.visible = 'true';
      previousCaption = { x: caption.left, y: caption.top }; root.dataset.positioned = 'true';
      frame = requestAnimationFrame(position);
    } catch { clear(); } // A reloading/cross-origin preview must not leave stale feedback.
  };
  const show = (next: TrackedTarget[]) => {
    if (stopped || !next.length) return;
    const iframe = getFrame();
    const doc = iframe?.contentDocument;
    next = next.map(item => {
      const node = doc && resolve(doc, item.id);
      const generic = item.fromContent || /^(element|heading|text|paragraph|section|container|div|e-heading|e-div-block|widget)$/i.test(item.label);
      const name = generic && node ? contentLabel(node) : '';
      return { ...item, fromContent: generic, label: (name || item.label).replace(/\s+/g, ' ').trim().slice(0, 80) || 'Page element' };
    });
    latest = next; saved = false; dismissed = false; reviewing = false; hovering = false;
    for (const item of next) { history.set(item.id, item); if (history.size > 120) history.delete(history.keys().next().value!); }
    changed = true; syncControls();
    if (yielded) return;
    const nodes = doc ? next.map(item => resolve(doc, item.id)).filter((node): node is HTMLElement => !!node) : [];
    const candidate = nodes[0] && section(nodes[0]);
    // Stay on a real shared section for a batch or a rapid series of sibling edits.
    if (!next.every(item => item.scope === 'content') && candidate && candidate.getBoundingClientRect().height <= (iframe?.clientHeight || 0) * 1.5
      && ((nodes.length > 1 && nodes.every(node => candidate.contains(node))) || (Date.now()-lastEditAt < 900 && lastNode && lastNode !== nodes[0] && candidate.contains(lastNode)))) group = candidate;
    else if (next.every(item => item.scope === 'content') || (group && !nodes.every(node => group!.contains(node)))) group = null;
    lastNode = nodes[0] ?? null; lastEditAt = Date.now(); changed = true; finished = false;
    targets = next; clearTimeout(timer); cancelAnimationFrame(frame); root.dataset.phase = 'editing'; brand.textContent = 'Updating…';
    detail.textContent = next[0]!.label;
    root.setAttribute('aria-label', `Pixflow editing ${detail.textContent}`);
    if (root.dataset.state === 'completed') settle();
    frame = requestAnimationFrame(position);
    // Never invent a completion when edits go quiet; expire stale feedback instead.
    timer = setTimeout(() => { hide(); syncControls(); }, 2400);
  };
  const visibility = () => { if (document.hidden) { hide(); controls.hide(); } else { if (getPostId() !== postId) resetPage(); else syncControls(); } };
  window.addEventListener('pixflow-design:agent-stop', clear); document.addEventListener('visibilitychange', visibility);
  return {
    begin() { retireReview(); if (postId !== getPostId()) { resetPage(); yielded = false; } if (stopped) hide(); stopped = false; working = true; reviewing = false; changed = false; finished = false; postId = getPostId(); },
    show,
    finish(result?: { saved?: boolean }) { if (stopped) return; working = false; if (result?.saved) saved = true; syncControls(); if (!changed || !targets.length) return; finished = true; if (!['arriving', 'moving', 'hidden'].includes(root.dataset.state!)) complete(); },
    clear,
    syncDocument() { if (postId && getPostId() !== postId) resetPage(); },
    dispose() { clear(); controls.dispose(); root.remove(); listen(document, false); if (preview) listen(preview, false); window.removeEventListener('pixflow-design:agent-stop', clear); document.removeEventListener('visibilitychange', visibility); },
  };
}
