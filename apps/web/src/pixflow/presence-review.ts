export type ReviewItem = { id: string; label: string };
export type ReviewArea = ReviewItem & { elements: ReviewItem[] };
/** Group native mutations by rendered sections, never by generated IDs. */
export function reviewSection(node: HTMLElement): HTMLElement {
  if (node.matches('[data-block][data-type]')) {
    let group = node;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (parent.matches('[data-block][data-type="core/group"], [data-block][data-type="core/columns"], [data-block][data-type="core/cover"], [data-block][data-type="core/media-text"]')) group = parent;
    }
    return group;
  }
  let area = node.closest<HTMLElement>('section, .brxe-section, .e-con, .elementor-section, [data-etch-element="section"]');
  if (!area) return node;
  for (let p = area.parentElement; p && p.tagName !== 'BODY'; p = p.parentElement) {
    if (p.matches('section, .brxe-section, .e-con, .elementor-section, [data-etch-element="section"]')) area = p;
  }
  return area;
}
export function reviewLabel(node: HTMLElement, fallback = 'Page element'): string {
  const heading = /^H[1-6]$/.test(node.tagName) ? node : node.querySelector<HTMLElement>('h1,h2,h3,h4,h5,h6');
  const text = (node.hasAttribute('data-block') ? '' : node.getAttribute('aria-label')) || heading?.innerText || heading?.textContent
    || (/^(P|A|BUTTON|SPAN)$/.test(node.tagName) ? node.innerText || node.textContent : '') || fallback;
  return text.replace(/\s+/g, ' ').trim().slice(0, 80) || fallback;
}
