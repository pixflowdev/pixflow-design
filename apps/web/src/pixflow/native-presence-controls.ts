import { annotationAvailable } from './annotation-availability';
import { changeReviewDisabled, subscribeChangeReviewPreference } from './change-review-preference';
import type { ReviewArea } from './presence-review';
type ReviewState = { working: boolean; paused: boolean; saved: boolean; count: number; index: number; label: string; reviewing: boolean; areas: ReviewArea[] };
type Actions = { resume(): void; pause(): void; review(direction: number): void; select(id: string): void; preview(id: string | null): void; annotate(id: string): void; dismiss(): void };

/** Host-only controls shared by all native builders; never serialized as content. */
export function createPresenceControls(getFrame: () => HTMLIFrameElement | null, actions: Actions) {
  const root = document.createElement('div'); root.id = 'pixflow-presence-controls'; root.hidden = true;
  root.setAttribute('role', 'group'); root.setAttribute('aria-label', 'Agent change review'); root.dataset.pixflowAnnotation = 'controls';
  let state: ReviewState | undefined, expanded = false, signature = '', renderedState = '';
  let annotationActive = !!document.querySelector('[data-pixflow-annotation-toolbar]');
  const openGroups = new Set<string>();
  const bar = document.createElement('div'); bar.className = 'presence-bar';
  const status = document.createElement('span'); status.className = 'presence-status'; status.setAttribute('role', 'status');
  // Tabler outline geometry: chevrons, message-plus, player-pause and x.
  const paths = { left: 'm14 6-6 6 6 6', right: 'm10 6 6 6-6 6', expand: 'm6 14 6-6 6 6', close: 'm6 6 12 12M6 18 18 6', annotate: 'M12 20l-3-3H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4l-3 3M9 10h6M12 7v6', pause: 'M7 5h3v14H7zM14 5h3v14h-3z' };
  const button = (name: string, action: () => void, path?: string) => {
    const node = document.createElement('button'); node.type = 'button'; node.setAttribute('aria-label', name); node.title = name;
    if (path) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
      const shape = document.createElementNS(svg.namespaceURI, 'path'); shape.setAttribute('d', path); svg.append(shape); node.append(svg);
    } else node.textContent = name;
    node.addEventListener('click', action); return node;
  };
  const resume = button('Resume following', actions.resume);
  const pause = button('Pause following', actions.pause, paths.pause);
  const review = button('Review changes', () => actions.review(0));
  const previous = button('Previous changed area', () => actions.review(-1), paths.left);
  const counter = document.createElement('span'); counter.className = 'presence-count';
  const next = button('Next changed area', () => actions.review(1), paths.right);
  const annotate = button('Annotate current area', () => { const area = state?.areas[state.index]; if (area && annotationAvailable()) actions.annotate(area.id); }, paths.annotate);
  const expand = button('Expand changes', () => { expanded = !expanded; render(); }, paths.expand);
  expand.setAttribute('aria-expanded', 'false'); expand.setAttribute('aria-controls', 'pixflow-presence-list');
  const dismiss = button('Dismiss change review', actions.dismiss, paths.close);
  const list = document.createElement('div'); list.id = 'pixflow-presence-list'; list.className = 'presence-list'; list.setAttribute('role', 'list'); list.setAttribute('aria-label', 'Changed sections');
  const disclosure = document.createElement('div'); disclosure.className = 'presence-disclosure';
  const inner = document.createElement('div'); inner.className = 'presence-disclosure-inner'; inner.append(list); disclosure.append(inner);
  bar.append(status, resume, pause, review, previous, counter, next, annotate, expand, dismiss);
  root.append(disclosure, bar); document.body.append(root);
  const theme = () => {
    const source = document.querySelector<HTMLElement>('.pixflow-agent-surface-shell, .pixflow-design-token-scope[data-theme]');
    if (!source) return;
    const computed = getComputedStyle(source);
    for (const name of ['--composer-surface', '--composer-hover', '--text', '--text-muted', '--border']) {
      const value = computed.getPropertyValue(name).trim(); if (value) root.style.setProperty(name, value);
    }
  };
  const position = () => {
    if (root.hidden) return;
    theme();
    const frame = getFrame(); if (!frame) { root.hidden = true; return; }
    const r = frame.getBoundingClientRect(), left = Math.max(8, r.left + 12), right = Math.min(innerWidth - 8, r.right - 12);
    root.style.maxWidth = `${Math.max(0, right - left)}px`;
    bar.style.width = expanded ? '100%' : 'max-content';
    root.style.width = `${expanded ? 420 : bar.scrollWidth + 2}px`;
    const annotationSpace = annotationActive ? (document.querySelector<HTMLElement>('[data-pixflow-annotation-toolbar]')?.offsetHeight || 44) + 12 : 0;
    root.style.setProperty('--presence-list-height', `${Math.max(30, Math.min(320, r.height - 110 - annotationSpace))}px`);
    const width = root.offsetWidth, height = root.offsetHeight;
    const obstacles = [...document.querySelectorAll<HTMLElement>('.pixflow-bricks-agent-panel, #elementor-navigator, [role="dialog"]')]
      .filter(el => !el.closest('[data-pixflow-annotation]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').map(el => el.getBoundingClientRect());
    for (const top of [Math.min(innerHeight - 12, r.bottom - 12) - height, Math.max(8, r.top + 12)]) for (const x of [(left + right - width) / 2, left, right - width]) {
      if (x < left || top < r.top || obstacles.some(o => x < o.right && x + width > o.left && top < o.bottom && top + height > o.top)) continue;
      root.style.left = `${x}px`; root.style.top = `${top}px`; root.style.visibility = ''; return;
    }
    root.style.visibility = 'hidden';
  };
  const row = (item: { id: string; label: string }, detail: string, child = false) => {
    const entry = document.createElement('div'); entry.className = `presence-row${child ? ' presence-child' : ''}`; entry.setAttribute('role', 'listitem'); entry.dataset.id = item.id;
    const select = button(`Show ${item.label}`, () => actions.select(item.id)); select.className = 'presence-select'; select.textContent = '';
    const title = document.createElement('span'); title.textContent = item.label;
    const copy = document.createElement('span'); copy.className = 'presence-row-copy'; copy.append(title);
    if (!child) { const subtitle = document.createElement('small'); subtitle.textContent = detail; copy.append(subtitle); }
    select.append(copy);
    select.addEventListener('pointerenter', () => actions.preview(item.id)); select.addEventListener('pointerleave', () => actions.preview(null));
    entry.append(select); if (annotationAvailable()) entry.append(button(`Annotate ${item.label}`, () => actions.annotate(item.id), paths.annotate)); return entry;
  };
  const renderList = () => {
    if (!state || JSON.stringify(state.areas) === signature) return;
    signature = JSON.stringify(state.areas);
    const focusId = (document.activeElement?.closest('.presence-row') as HTMLElement | null)?.dataset.id;
    const focusLabel = document.activeElement?.getAttribute('aria-label'), scroll = list.scrollTop;
    list.replaceChildren();
    for (const area of state.areas) {
      const header = row(area, `${area.elements.length} changed element${area.elements.length === 1 ? '' : 's'}`);
      if (area.elements.length > 1) {
        const group = document.createElement('div'); group.className = 'presence-group'; group.setAttribute('role', 'listitem');
        header.removeAttribute('role');
        const toggle = header.querySelector<HTMLButtonElement>('.presence-select')!;
        const chevron = button('', () => {}, paths.right).firstElementChild!;
        chevron.classList.add('presence-group-chevron'); toggle.append(chevron);
        const details = document.createElement('div'); details.className = 'presence-elements'; details.id = `pixflow-presence-group-${list.children.length}`;
        const contents = document.createElement('div'); contents.className = 'presence-elements-inner';
        const children = document.createElement('div'); children.className = 'presence-children'; children.setAttribute('role', 'list'); children.setAttribute('aria-label', `${area.label} elements`);
        area.elements.forEach(item => children.append(row(item, '', true))); contents.append(children); details.append(contents);
        toggle.setAttribute('aria-controls', details.id);
        const sync = () => {
          const open = openGroups.has(area.id);
          group.dataset.open = String(open); toggle.setAttribute('aria-expanded', String(open));
          details.inert = !open; details.setAttribute('aria-hidden', String(!open));
        };
        toggle.addEventListener('click', () => { if (openGroups.has(area.id)) openGroups.delete(area.id); else openGroups.add(area.id); sync(); position(); });
        sync(); group.append(header, details); list.append(group);
      } else list.append(header);
    }
    list.scrollTop = scroll;
    if (focusId && focusLabel) [...list.querySelectorAll<HTMLButtonElement>('button')].find(b => b.closest<HTMLElement>('.presence-row')?.dataset.id === focusId && b.getAttribute('aria-label') === focusLabel)?.focus({ preventScroll: true });
  };
  const render = () => {
    if (!state) return;
    const v = state; root.hidden = !v.count || changeReviewDisabled(); root.dataset.expanded = String(expanded);
    disclosure.inert = !expanded; disclosure.setAttribute('aria-hidden', String(!expanded));
    const text = v.reviewing ? v.label : v.paused && v.working ? 'Following paused' : v.working ? `Updating ${v.label}` : `${v.count} area${v.count === 1 ? '' : 's'} updated${v.saved ? ' · Saved' : ''}`;
    if (status.textContent !== text) status.textContent = text; status.title = text;
    resume.hidden = !v.paused || !v.working; pause.hidden = v.paused || !v.working;
    review.hidden = v.reviewing || v.working || expanded;
    previous.hidden = next.hidden = counter.hidden = !v.reviewing; previous.disabled = next.disabled = v.count < 2;
    counter.textContent = `${v.index + 1} / ${v.count}`; annotate.disabled = !v.count; annotate.hidden = !annotationAvailable();
    expand.setAttribute('aria-expanded', String(expanded)); expand.setAttribute('aria-label', expanded ? 'Collapse changes' : 'Expand changes'); expand.title = expanded ? 'Collapse changes' : 'Expand changes';
    renderList();
    for (const el of list.querySelectorAll<HTMLElement>('.presence-row')) el.dataset.selected = String(v.reviewing && el.dataset.id === v.areas[v.index]?.id);
    position();
  };
  const unsubscribePreference = subscribeChangeReviewPreference(render);
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && root.contains(document.activeElement)) { if (expanded) { expanded = false; render(); expand.focus(); } else actions.dismiss(); event.stopPropagation(); } };
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position); observer?.observe(root);
  const annotationLayout = (event: Event) => { annotationActive = (event as CustomEvent<{ active: boolean }>).detail.active; position(); };
  window.addEventListener('pixflow-design:annotation-toolbar', annotationLayout);
  const themeObserver = new MutationObserver(theme); themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme'], subtree: true });
  root.addEventListener('keydown', escape); window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
  return { root, update(value: ReviewState) { const next = JSON.stringify(value); if (state && renderedState === next) return; renderedState = next; state = value; render(); }, hide() { state = undefined; root.hidden = true; }, reset() { state = undefined; expanded = false; signature = ''; openGroups.clear(); list.replaceChildren(); root.hidden = true; }, dispose() { unsubscribePreference(); observer?.disconnect(); themeObserver.disconnect(); root.remove(); window.removeEventListener('pixflow-design:annotation-toolbar', annotationLayout); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); } };
}
