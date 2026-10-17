import styles from './GutenbergEditor.module.css';

type Side = 'left' | 'right';
type Panel = { dock: string; width: number; collapsed: boolean };
type Rect = { x: number; y: number; width: number; height: number };

/** Reserve editor space without changing WordPress sidebar preferences or content. */
export function mountGutenbergPanelDocking(): () => void {
  const body = () => document.querySelector<HTMLElement>('.interface-interface-skeleton__body');
  let reserved: HTMLElement | null = null, frame = 0;
  let last: Panel | undefined;
  const hint = document.createElement('div');
  hint.className = styles.hint!; hint.dataset.pixflowGutenbergHint = ''; hint.hidden = true; hint.setAttribute('aria-hidden', 'true');
  hint.dataset.pixflowAnnotation = 'controls'; document.body.append(hint);
  const rect = (side: Side, requested: number): Rect | null => {
    const target = body(); if (!target) return null;
    const bounds = target.getBoundingClientRect();
    const nativeWidth = Array.from(target.children).filter(node => node.classList.contains('interface-interface-skeleton__secondary-sidebar') || node.classList.contains('interface-interface-skeleton__sidebar')).reduce((sum, node) => sum + node.getBoundingClientRect().width, 0);
    const available = bounds.width - nativeWidth - 320;
    if (bounds.width < 782 || available < 280) return null;
    const width = Math.min(requested, available);
    const footer = document.querySelector('.interface-interface-skeleton__footer')?.getBoundingClientRect();
    const top = Math.max(0, bounds.top), bottom = Math.min(innerHeight, footer?.height ? footer.top : bounds.bottom);
    return { x: side === 'left' ? bounds.left : bounds.right - width, y: top, width, height: Math.max(0, bottom - top) };
  };
  const release = () => {
    reserved?.removeAttribute('data-pixflow-gutenberg-dock');
    reserved?.style.removeProperty('--pixflow-gutenberg-dock-width'); reserved = null;
  };
  const adapter = {
    getFloatTop: () => Math.max(0, body()?.getBoundingClientRect().top ?? 48),
    getDockRect: rect,
    inferDockSide(x: number, y: number, panel?: Rect): Side | '' {
      const bounds = body()?.getBoundingClientRect();
      if (!bounds || !rect('left', panel?.width || 460) || y < bounds.top || y > bounds.bottom) return '';
      if ((panel?.x ?? x) <= bounds.left + 40) return 'left';
      if ((panel ? panel.x + panel.width : x) >= bounds.right - 40) return 'right';
      return '';
    },
    onDockApply(panel: Panel) {
      last = panel;
      const target = body(), bounds = rect(panel.dock as Side, panel.width);
      if (!target || !bounds || panel.dock === 'float' || panel.collapsed) { release(); return; }
      if (reserved !== target) release(); reserved = target;
      target.dataset.pixflowGutenbergDock = panel.dock;
      target.style.setProperty('--pixflow-gutenberg-dock-width', `${bounds.width}px`);
    },
    onDockRelease() { release(); hint.hidden = true; },
    onDockHint(side: Side | '') {
      const bounds = side ? rect(side, last?.width || 460) : null;
      hint.hidden = !bounds;
      if (!bounds) return;
      Object.assign(hint.style, { left: `${bounds.x}px`, top: `${bounds.y}px`, width: `${bounds.width}px`, height: `${bounds.height}px` });
      hint.textContent = `Dock ${side}`;
    },
  };
  const host = window as Window & { PixflowDesignHostDock?: typeof adapter };
  const refresh = () => {
    if (frame || !body()) return;
    frame = requestAnimationFrame(() => { frame = 0; window.dispatchEvent(new Event('pixflow-design:host-docking-ready')); });
  };
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh);
  let watched: Element[] = [];
  const watch = () => {
    const target = body();
    // Gutenberg creates its layout asynchronously. Until it exists, leave the
    // host's startup geometry intact instead of discarding a saved dock.
    if (target) host.PixflowDesignHostDock = adapter;
    const nodes = target ? [target, ...Array.from(target.children)] : [];
    if (nodes.length === watched.length && nodes.every((node, index) => node === watched[index])) return;
    resize?.disconnect(); watched = nodes; nodes.forEach(node => resize?.observe(node)); refresh();
  };
  const observer = new MutationObserver(watch); observer.observe(document.body, { childList: true, subtree: true });
  const mode = new MutationObserver(refresh); mode.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', refresh); watch();
  return () => {
    observer.disconnect(); mode.disconnect(); resize?.disconnect(); cancelAnimationFrame(frame);
    window.removeEventListener('resize', refresh); release(); hint.remove();
    if (host.PixflowDesignHostDock === adapter) delete host.PixflowDesignHostDock;
  };
}
