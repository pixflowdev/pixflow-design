import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { renderMarkdown, type MarkdownLinkClickHandler } from '../../runtime/markdown';

// Smooth uneven transport chunks over a short, bounded interval. This is
// display state only: history, copy, tools and run completion use the real text.
export function StreamingMarkdown({ text, live, onLinkClick, searchedWeb }: {
  text: string; live: boolean; onLinkClick?: MarkdownLinkClickHandler; searchedWeb?: boolean;
}) {
  const [shown, setShown] = useState(() => live ? '' : text);
  const current = useRef(shown);
  const target = useRef(text);
  const frame = useRef<number | null>(null);
  const allowed = live && typeof window !== 'undefined' && !document.hidden
    && window.getSelection()?.isCollapsed !== false
    && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useLayoutEffect(() => {
    target.current = text;
    if (!allowed || !text.startsWith(current.current) || text.length - current.current.length <= 16) {
      current.current = text;
      setShown(text);
      return;
    }
    if (current.current === text || frame.current !== null) return;
    function tick() {
      frame.current = null;
      const full = target.current;
      // A burst leaves at most 32 characters for the next two paints.
      const remaining = full.length - current.current.length;
      let end = Math.min(full.length, Math.max(full.length - 32,
        current.current.length + Math.max(16, Math.ceil(remaining / 2))));
      if (end < full.length && /[\uD800-\uDBFF]/.test(full.charAt(end - 1))) end++;
      current.current = full.slice(0, end);
      setShown(current.current);
      if (current.current !== full) frame.current = requestAnimationFrame(tick);
    }
    frame.current = requestAnimationFrame(tick);
  }, [text, allowed]);
  useLayoutEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, [allowed]);
  // Flush any partial presentation on tab switch. A hidden tab's animation
  // frames may be suspended until well after the provider has finished.
  useEffect(() => {
    if (!live) return;
    const flush = () => {
      if (document.hidden) { current.current = target.current; setShown(target.current); }
    };
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [live]);
  const visible = allowed && text.startsWith(shown) ? shown : text;
  return useMemo(() => renderMarkdown(visible, { onLinkClick, searchedWeb }), [visible, onLinkClick, searchedWeb]);
}
