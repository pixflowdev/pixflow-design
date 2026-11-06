import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export function chatScrollBehavior(): ScrollBehavior {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
}

/** Follow the actual live edge without reserving space below new prompts.
 * Scrolling away suspends following until the reader returns or chooses Latest. */
export function useFloatingChatScroll(
  log: RefObject<HTMLDivElement | null>, spacer: RefObject<HTMLDivElement | null>, session: string,
  messages: ReadonlyArray<{ id?: string; role?: string }>, running: boolean,
) {
  const state = useRef({ follow: true, moving: false, manual: false });
  const schedule = useRef<() => void>(() => {});
  const [scrollable, setScrollable] = useState(false);
  const [away, setAway] = useState(false);
  const [scrolling, setScrolling] = useState(false);

  const jump = useCallback(() => {
    const el = log.current;
    if (!el) return;
    const view = state.current;
    Object.assign(view, { follow: true, manual: false });
    if (spacer.current) spacer.current.style.height = '0px';
    const behavior = chatScrollBehavior();
    view.moving = behavior === 'smooth' && 'onscrollend' in el && el.scrollHeight - el.scrollTop - el.clientHeight > 2;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setAway(false);
  }, [log, spacer]);

  useLayoutEffect(() => {
    const el = log.current, tail = spacer.current;
    if (!el || !tail) return;
    const view = state.current;
    Object.assign(view, { follow: true, moving: false, manual: false });
    tail.style.height = '0px';
    let idle: number | undefined, frame: number | null = null;
    const distance = () => el.scrollHeight - el.clientHeight - el.scrollTop;
    const measure = () => {
      frame = null;
      if (view.follow && !view.moving && distance() > 1) el.scrollTop = el.scrollHeight;
      setAway(!view.moving && distance() > 2);
      setScrollable(el.scrollHeight > el.clientHeight + 2);
    };
    function queue() { if (frame === null) frame = requestAnimationFrame(measure); }
    schedule.current = queue;
    const release = () => { Object.assign(view, { manual: true, moving: false, follow: false }); };
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) release();
    };
    const onScrollEnd = () => {
      if (view.moving) { view.moving = false; queue(); }
    };
    const onScroll = () => {
      if (view.manual && distance() <= 2) { view.manual = false; view.follow = true; }
      setAway(!view.moving && distance() > 2);
      setScrolling(true);
      window.clearTimeout(idle);
      idle = window.setTimeout(() => setScrolling(false), 140);
    };
    el.addEventListener('wheel', release, { passive: true });
    el.addEventListener('touchstart', release, { passive: true });
    el.addEventListener('pointerdown', release, { passive: true });
    el.addEventListener('keydown', onKey);
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('scrollend', onScrollEnd);
    // Token reveals, highlighting and disclosures can change height between
    // provider events. Observe row boxes, never the tail that we resize.
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(queue);
    resize?.observe(el);
    for (const child of el.children) if (child !== tail) resize?.observe(child);
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(records => {
      for (const record of records) {
        for (const child of record.removedNodes) if (child instanceof Element) resize?.unobserve(child);
        for (const child of record.addedNodes) if (child instanceof Element && child !== tail) resize?.observe(child);
      }
      queue();
    });
    mutations?.observe(el, { childList: true });
    return () => {
      el.removeEventListener('wheel', release);
      el.removeEventListener('touchstart', release);
      el.removeEventListener('pointerdown', release);
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('scrollend', onScrollEnd);
      mutations?.disconnect();
      resize?.disconnect();
      window.clearTimeout(idle);
      if (frame !== null) cancelAnimationFrame(frame);
      schedule.current = () => {};
    };
  }, [session, log, spacer]);

  useLayoutEffect(() => {
    schedule.current();
  }, [messages, running, session]);
  return { scrollable, scrolling, away, jump };
}
