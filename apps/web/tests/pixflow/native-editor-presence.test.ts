// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createNativeEditorPresence, placePresenceCaption } from '../../src/pixflow/native-editor-presence';
import { setChangeReviewDisabled } from '../../src/pixflow/change-review-preference';

let presence: ReturnType<typeof createNativeEditorPresence>;
beforeEach(() => {
  setChangeReviewDisabled(false);
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => { delete (window as unknown as {PixflowAnnotationsFactory?: unknown}).PixflowAnnotationsFactory; presence?.dispose(); document.body.innerHTML = ''; vi.useRealTimers(); vi.unstubAllGlobals(); });
const rect = (left: number, top: number, width = 120, height = 30) => ({ left, top, width, height, right: left + width, bottom: top + height } as DOMRect);
function fixture(getPostId = () => 1) {
  const frame = document.createElement('iframe'); frame.id = 'preview'; document.body.append(frame);
  Object.defineProperties(frame, { offsetWidth: { value: 800 }, offsetHeight: { value: 600 }, clientWidth: { value: 800 }, clientHeight: { value: 600 } });
  frame.getBoundingClientRect = () => rect(100, 50, 800, 600);
  const doc = frame.contentDocument!;
  doc.body.innerHTML = '<section id="section"><h1 id="a">A</h1><p id="b">B</p></section><h2 id="c">C</h2>';
  const a = doc.getElementById('a')!, b = doc.getElementById('b')!, c = doc.getElementById('c')!, section = doc.getElementById('section')!;
  a.getBoundingClientRect = () => rect(20, 100); b.getBoundingClientRect = () => rect(20, 160); c.getBoundingClientRect = () => rect(500, 400);
  section.getBoundingClientRect = () => rect(10, 90, 300, 160);
  frame.contentWindow!.scrollTo = vi.fn();
  presence = createNativeEditorPresence(getPostId, { builder: 'test', iframeSelector: '#preview', targetSelector: id => `#${id}` });
  const root = document.querySelector<HTMLElement>('#pixflow-direct-presence')!;
  const cursor = root.querySelector<HTMLElement>('.pixflow-direct-presence-cursor')!;
  const animations: { node: string; keys: Keyframe[]; options: unknown; cancel: ReturnType<typeof vi.fn> }[] = [];
  for (const node of [cursor, root.firstElementChild as HTMLElement]) node.animate = vi.fn((keys, options) => {
    const animation = { node: node.className, keys: keys as Keyframe[], options, cancel: vi.fn() }; animations.push(animation); return animation as unknown as Animation;
  });
  return { root, frame, doc, a, b, c, section, cursor, animations };
}
const show = (id = 'a') => presence.show([{ id, label: id.toUpperCase() }]);

it('offers the selected live review area to optional UI and retires it on page changes', () => {
  let page = 1;
  const { a, c } = fixture(() => page);
  const selections: CustomEvent[] = [];
  const capture = (event: Event) => selections.push(event as CustomEvent);
  document.addEventListener('pixflow:review-target', capture);
  presence.begin(); show('a'); show('c'); presence.finish();
  document.querySelector<HTMLButtonElement>('[aria-label="Review changes"]')!.click();
  const first = selections.at(-1)!.detail;
  expect(first.element).toBe(a);
  expect(first.count).toBe(2);
  first.navigate(1);
  expect(selections.at(-1)!.detail.element).toBe(c);
  page = 2; presence.syncDocument();
  expect(selections.at(-1)!.detail).toBeNull();
  const count = selections.length;
  first.navigate(1); // An old pill cannot navigate another page's review.
  expect(selections.slice(count).every(event => event.detail === null)).toBe(true);
  document.removeEventListener('pixflow:review-target', capture);
});

it('hides review immediately without stopping the follower and restores the recorded changes', async () => {
  const { root } = fixture(); presence.begin(); show();
  await vi.advanceTimersByTimeAsync(260);
  const controls = document.querySelector<HTMLElement>('#pixflow-presence-controls')!;
  expect(controls.hidden).toBe(false);
  setChangeReviewDisabled(true); expect(controls.hidden).toBe(true);
  expect(root.dataset.state).toBe('working');
  show('c'); await vi.advanceTimersByTimeAsync(260);
  expect(root.dataset.targetId).toBe('c'); expect(controls.hidden).toBe(true);
  presence.finish(); setChangeReviewDisabled(false);
  expect(controls.hidden).toBe(false); expect(controls.textContent).toContain('2 areas updated');
});

it('keeps a readable working caption until execution confirms the edit', async () => {
  const { root } = fixture(); presence.begin(); show();
  await vi.advanceTimersByTimeAsync(40); expect(root.dataset.state).toBe('arriving');
  await vi.advanceTimersByTimeAsync(240); expect(root.dataset.state).toBe('working');
  await vi.advanceTimersByTimeAsync(920); expect(root.dataset.compact).not.toBe('true');
  expect(root.querySelector('.pixflow-direct-presence-brand')?.textContent).toBe('Updating…');
  expect(root.querySelector('.pixflow-direct-presence-detail')?.textContent).toBe('A');
  presence.finish(); expect(root.dataset.state).toBe('completed');
  expect(root.querySelector('.pixflow-direct-presence-brand')?.textContent).toBe('Updated');
  await vi.advanceTimersByTimeAsync(1200); expect(root.dataset.state).toBe('hidden'); expect(vi.getTimerCount()).toBe(0);
});
it('handles fast synchronous completion without displaying invented working time', async () => {
  const { root } = fixture(); presence.begin(); show(); presence.finish();
  await vi.advanceTimersByTimeAsync(17); expect(root.dataset.state).toBe('completed');
  expect(root.textContent).toContain('Updated');
});
it('populates a fallback caption before arrival and resets saved feedback on the next edit', async () => {
  const { root } = fixture(); presence.begin(); presence.show([{ id: 'a', label: '  ' }]);
  expect(root.querySelector('.pixflow-direct-presence-brand')?.textContent).toBe('Updating…');
  expect(root.querySelector('.pixflow-direct-presence-detail')?.textContent?.trim()).toBeTruthy();
  await vi.advanceTimersByTimeAsync(260); presence.finish({ saved: true });
  expect(root.querySelector('.pixflow-direct-presence-brand')?.textContent).toBe('Saved');
  presence.begin(); show();
  expect(root.querySelector('.pixflow-direct-presence-brand')?.textContent).toBe('Updating…');
  expect(root.dataset.phase).toBe('editing');
  expect(root.dataset.state).not.toBe('completed');
});
it('expires stalled feedback without showing success; read-only commands remain hidden', async () => {
  const { root } = fixture(); presence.begin(); presence.finish(); expect(root.dataset.state).toBe('hidden');
  show(); await vi.advanceTimersByTimeAsync(2450); expect(root.dataset.state).toBe('hidden'); expect(vi.getTimerCount()).toBe(0);
});
it('groups rapid sibling edits into their section, but changes focus for another section', async () => {
  const { root } = fixture(); presence.begin(); show(); await vi.advanceTimersByTimeAsync(40);
  show('b'); await vi.advanceTimersByTimeAsync(40); expect(root.dataset.targetId).toBe('group:section');
  show('a'); await vi.advanceTimersByTimeAsync(40); expect(root.dataset.targetId).toBe('group:section');
  show('c'); await vi.advanceTimersByTimeAsync(40); expect(root.dataset.targetId).toBe('c');
});
it('reveals an initially visible target when native rendering pushes it below the viewport', async () => {
  const { a, frame } = fixture(); presence.begin(); show();
  await vi.advanceTimersByTimeAsync(40);
  expect(frame.contentWindow!.scrollTo).not.toHaveBeenCalled();
  a.getBoundingClientRect = () => rect(20, 950);
  await vi.advanceTimersByTimeAsync(40);
  expect(frame.contentWindow!.scrollTo).toHaveBeenCalledOnce();
});
it('groups batch edits, but never expands to a huge section or the document body', async () => {
  const { root, section } = fixture(); presence.begin(); presence.show([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]);
  await vi.advanceTimersByTimeAsync(40); expect(root.dataset.targetId).toBe('group:section');
  presence.clear(); section.getBoundingClientRect = () => rect(0, 0, 800, 2000); presence.begin();
  presence.show([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]);
  await vi.advanceTimersByTimeAsync(40); expect(root.dataset.targetId).toBe('a');
});
it('travels locally but fades to distant targets instead of flying across the page', async () => {
  const { c, animations } = fixture(); presence.begin(); show(); await vi.advanceTimersByTimeAsync(260);
  c.getBoundingClientRect = () => rect(40, 120); show('c'); await vi.advanceTimersByTimeAsync(40);
  expect(animations.filter(a => a.node.includes('cursor')).at(-1)!.keys[0]).toHaveProperty('transform');
  c.getBoundingClientRect = () => rect(600, 500); show('a'); await vi.advanceTimersByTimeAsync(40); show('c'); await vi.advanceTimersByTimeAsync(40);
  expect(animations.filter(a => a.node.includes('cursor')).at(-1)!.keys[0]).toEqual({ opacity: 0 });
});
it('yields to preview scrolling and host interaction without resuming for late updates', async () => {
  const { root, doc, frame } = fixture(); presence.begin(); show(); await vi.advanceTimersByTimeAsync(40);
  doc.dispatchEvent(new Event('wheel')); expect(root.dataset.state).toBe('hidden');
  expect(frame.contentWindow!.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'instant' }));
  show('c'); presence.finish(); await vi.advanceTimersByTimeAsync(100); expect(root.dataset.state).toBe('hidden');
  await vi.advanceTimersByTimeAsync(3000); show('c'); await vi.advanceTimersByTimeAsync(40); expect(root.dataset.state).toBe('hidden');
  presence.begin(); show(); await vi.advanceTimersByTimeAsync(40); expect(root.dataset.visible).toBe('false');
  document.querySelector<HTMLButtonElement>('[aria-label="Resume following"]')!.click();
  await vi.advanceTimersByTimeAsync(40); expect(root.dataset.visible).toBe('true');
  document.dispatchEvent(new Event('pointerdown')); expect(root.dataset.visible).toBe('false');
});
it('retains honest working feedback during long commands and distinguishes applied from confirmed saved', async () => {
  const { root } = fixture(); presence.begin(); show();
  await vi.advanceTimersByTimeAsync(3000);
  const controls = document.getElementById('pixflow-presence-controls')!;
  expect(root.dataset.visible).toBe('false'); expect(controls.hidden).toBe(false);
  expect(controls.textContent).toContain('Updating A'); expect(vi.getTimerCount()).toBe(0);
  presence.finish(); expect(controls.textContent).toContain('1 area updated');
  presence.begin(); presence.finish({ saved: true }); expect(controls.textContent).toContain('Saved');
  presence.begin(); show('c'); expect(controls.textContent).not.toContain('Saved');
});
it('does not pause following when composing another request or interacting with an idle editor', async () => {
  const { root, doc } = fixture(); presence.begin(); show(); presence.finish();
  await vi.advanceTimersByTimeAsync(1400);
  doc.dispatchEvent(new Event('wheel'));
  presence.begin(); show(); await vi.advanceTimersByTimeAsync(40);
  expect(root.dataset.visible).toBe('true');
  const panel = document.createElement('div'); panel.className = 'pixflow-bricks-agent-panel';
  const input = document.createElement('textarea'); panel.append(input); document.body.append(panel);
  input.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  expect(root.dataset.visible).toBe('true');
});
it('clears review history on page switches, including an idle page with no new command', async () => {
  let page = 1; fixture(() => page); presence.begin(); show(); presence.finish();
  const controls = document.getElementById('pixflow-presence-controls')!;
  expect(controls.hidden).toBe(false);
  page = 2; presence.syncDocument(); expect(controls.hidden).toBe(true);
  presence.begin(); show('c'); presence.finish();
  document.querySelector<HTMLButtonElement>('[aria-label="Review changes"]')!.click();
  expect(document.querySelector('.presence-count')!.textContent).toBe('1 / 1');
});
it('keeps partial changes reviewable after stop without claiming a save or continuing animation', async () => {
  const { root } = fixture(); presence.begin(); show(); await vi.advanceTimersByTimeAsync(260);
  window.dispatchEvent(new Event('pixflow-design:agent-stop')); presence.finish({ saved: true });
  expect(root.dataset.state).toBe('hidden'); expect(vi.getTimerCount()).toBe(0);
  const controls = document.getElementById('pixflow-presence-controls')!;
  expect(controls.textContent).toContain('1 area updated');
  expect(document.querySelector<HTMLButtonElement>('[aria-label="Resume following"]')!.hidden).toBe(true);
  document.querySelector<HTMLButtonElement>('[aria-label="Dismiss change review"]')!.click();
  expect(controls.hidden).toBe(true);
});
it('reviews unique changed areas without mutating content and skips deleted targets', async () => {
  const { root, doc, a } = fixture(); presence.begin(); show(); show('c'); show(); presence.finish();
  const html = doc.body.innerHTML;
  document.querySelector<HTMLButtonElement>('[aria-label="Review changes"]')!.click();
  await vi.advanceTimersByTimeAsync(260); expect(root.dataset.targetId).toBe('a');
  expect(document.querySelector('.presence-count')!.textContent).toBe('1 / 2');
  document.querySelector<HTMLButtonElement>('[aria-label="Next changed area"]')!.click();
  await vi.advanceTimersByTimeAsync(260); expect(root.dataset.targetId).toBe('c');
  expect(doc.body.innerHTML).toBe(html);
  a.remove(); document.querySelector<HTMLButtonElement>('[aria-label="Previous changed area"]')!.click();
  await vi.advanceTimersByTimeAsync(260); expect(root.dataset.targetId).toBe('c');
  expect(document.querySelector('.presence-count')!.textContent).toBe('1 / 1');
});
it('uses real heading text for generic names and preserves precise content targets', async () => {
  const { root, a, b } = fixture(); a.textContent = 'A calmer place'; b.textContent = 'More space';
  presence.begin(); presence.show([{id:'a',label:'Heading',scope:'content'}]); await vi.advanceTimersByTimeAsync(260);
  expect(root.textContent).toContain('A calmer place');
  a.textContent = 'The updated heading'; // Native redraw can follow the model notification.
  await vi.advanceTimersByTimeAsync(40);
  expect(root.textContent).toContain('The updated heading');
  expect(document.querySelector('.presence-status')!.textContent).toContain('The updated heading');
  a.innerHTML = 'A little green.<br>A lot of good.';
  Object.defineProperty(a, 'innerText', { value: 'A little green.\nA lot of good.' });
  await vi.advanceTimersByTimeAsync(40);
  expect(root.textContent).toContain('A little green. A lot of good.');
  presence.show([{id:'b',label:'Paragraph',scope:'content'}]); await vi.advanceTimersByTimeAsync(40);
  expect(root.dataset.targetId).toBe('b');
});
it('cancels animation and timers on stop, suppresses late completion, and can begin a new command', async () => {
  const { root, animations } = fixture(); presence.begin(); show(); await vi.advanceTimersByTimeAsync(40);
  window.dispatchEvent(new Event('pixflow-design:agent-stop')); show('b'); presence.finish();
  expect(root.dataset.state).toBe('hidden'); expect(vi.getTimerCount()).toBe(0); expect(animations.every(a => a.cancel.mock.calls.length)).toBe(true);
  presence.begin(); show('b'); await vi.advanceTimersByTimeAsync(40); expect(root.dataset.visible).toBe('true');
});
it('reduced motion skips travel and pulse; an overlay never changes native content', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true })); const { doc, animations, root } = fixture(); const original = doc.body.innerHTML;
  presence.begin(); show(); presence.finish(); await vi.advanceTimersByTimeAsync(50);
  expect(root.dataset.state).toBe('completed'); expect(animations).toHaveLength(0); expect(doc.body.innerHTML).toBe(original);
});
it('avoids captions over floating panels and hides a caption if every location is obstructed', () => {
  const viewport = rect(100, 50, 400, 400), target = rect(120, 150);
  const caption = placePresenceCaption(target, viewport, 150, 28, [rect(100, 50, 200, 400)]);
  expect(caption.left).toBeGreaterThanOrEqual(300);
  expect(placePresenceCaption(target, viewport, 150, 28, [viewport]).placement).toBe('occluded');
});
it('has bounded idle work after rapid edits and safely handles a removed target', async () => {
  const { root, a } = fixture(); presence.begin(); for (let i = 0; i < 100; i++) show();
  await vi.advanceTimersByTimeAsync(40); expect(vi.getTimerCount()).toBeLessThanOrEqual(4);
  a.remove(); await vi.advanceTimersByTimeAsync(2450); expect(root.dataset.visible).toBe('false'); expect(vi.getTimerCount()).toBe(0);
});

it('groups sibling mutations into sections, expands individual targets and annotates the exact selection', async () => {
  Object.assign(window, {PixflowAnnotationsFactory: () => ({})});
  const { section, a, doc, frame } = fixture();
  section.scrollIntoView = vi.fn(); a.scrollIntoView = vi.fn();
  presence.begin(); show('a'); show('b'); show('c'); presence.finish();
  const click = (name: string) => document.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!.click();
  click('Expand changes');
  expect(document.querySelector('#pixflow-presence-controls')?.getAttribute('data-expanded')).toBe('true');
  expect(document.querySelector('#pixflow-presence-list')?.children).toHaveLength(2);
  expect(document.querySelector('#pixflow-presence-list')?.textContent).not.toContain('Individual elements');
  const groupToggle = document.querySelector<HTMLButtonElement>('.presence-group .presence-select')!;
  expect(groupToggle.getAttribute('aria-expanded')).toBe('false');
  expect(groupToggle.querySelector('.presence-group-chevron')).not.toBeNull();
  groupToggle.click();
  expect(groupToggle.getAttribute('aria-expanded')).toBe('true');
  expect(document.querySelector<HTMLElement>('.presence-elements')!.inert).toBe(false);
  const annotation = vi.fn(); document.addEventListener('pixflow:annotate-element', annotation);
  click('Annotate current area'); expect(annotation.mock.calls[0]![0].detail.element).toBe(section);
  const child = document.querySelector<HTMLButtonElement>('.presence-child [aria-label="Annotate A"]')!;
  child.click(); expect(annotation.mock.calls[1]![0].detail.element).toBe(a);
  expect(groupToggle.getAttribute('aria-expanded')).toBe('true');
  groupToggle.click(); expect(groupToggle.getAttribute('aria-expanded')).toBe('false');
  expect(document.querySelector<HTMLElement>('.presence-elements')!.inert).toBe(true);
  document.removeEventListener('pixflow:annotate-element', annotation);
  expect(doc.querySelector('[data-pixflow-annotation]')).toBeNull();
  const scroll = frame.contentWindow!.scrollTo as ReturnType<typeof vi.fn>; scroll.mockClear();
  const row = document.querySelector('.presence-select')!;
  section.getBoundingClientRect = () => rect(20, 1200, 300, 200);
  row.dispatchEvent(new Event('pointerenter')); await vi.advanceTimersByTimeAsync(40);
  expect(scroll).not.toHaveBeenCalled();
  row.dispatchEvent(new Event('pointerleave')); await vi.advanceTimersByTimeAsync(40);
  expect(document.querySelector('#pixflow-direct-presence')?.getAttribute('data-visible')).toBe('false');
  click('Show A'); await vi.advanceTimersByTimeAsync(40); expect(scroll).toHaveBeenCalled();
    scroll.mockClear();
    section.getBoundingClientRect = () => rect(20, -140, 300, 200);
    click('Show A'); await vi.advanceTimersByTimeAsync(40); expect(scroll).toHaveBeenCalledOnce();
});

it('reserves vertical room for annotations in short canvases and releases it on exit', () => {
  const { frame } = fixture();
  frame.getBoundingClientRect = () => rect(100, 50, 800, 350);
  presence.begin(); show(); presence.finish();
  const controls = document.getElementById('pixflow-presence-controls')!;
  expect(controls.style.getPropertyValue('--presence-list-height')).toBe('240px');
  window.dispatchEvent(new CustomEvent('pixflow-design:annotation-toolbar', { detail: { active: true } }));
  expect(controls.style.getPropertyValue('--presence-list-height')).toBe('184px');
  window.dispatchEvent(new CustomEvent('pixflow-design:annotation-toolbar', { detail: { active: false } }));
  expect(controls.style.getPropertyValue('--presence-list-height')).toBe('240px');
});

it('reviews the changed wrapper rather than its unchanged containing section', () => {
  const { doc, section } = fixture();
  const wrapper = doc.createElement('div'); wrapper.id = 'wrapper';
  const child = doc.createElement('h2'); child.id = 'new-title'; child.textContent = 'New content';
  wrapper.append(child); section.append(wrapper);
  const capture = vi.fn(); document.addEventListener('pixflow:review-target', capture);
  presence.begin(); presence.show([{ id: 'wrapper', label: 'Wrapper' }, { id: 'new-title', label: 'Heading' }]); presence.finish();
  document.querySelector<HTMLButtonElement>('[aria-label="Review changes"]')!.click();
  expect(capture.mock.calls.at(-1)![0].detail.element).toBe(wrapper);
  document.removeEventListener('pixflow:review-target', capture);
});

it('prefers a caption below the target when space is available', () => {
  expect(placePresenceCaption({ left: 100, top: 100, right: 400, bottom: 200 }, { left: 0, top: 0, right: 800, bottom: 600 }, 180, 28)).toMatchObject({ top: 208, placement: 'below' });
});

it('does not rewrite unchanged review controls while the working highlight animates', async () => {
  fixture(); presence.begin(); show(); await vi.advanceTimersByTimeAsync(280);
  const controls = document.getElementById('pixflow-presence-controls')!;
  const changes: MutationRecord[] = [];
  const observer = new MutationObserver(records => changes.push(...records));
  observer.observe(controls, { subtree: true, childList: true, attributes: true });
  await vi.advanceTimersByTimeAsync(600);
  observer.disconnect();
  expect(changes).toHaveLength(0);
});
