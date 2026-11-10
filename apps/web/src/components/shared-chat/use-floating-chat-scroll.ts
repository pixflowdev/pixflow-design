import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export function chatScrollBehavior(): ScrollBehavior {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
}

/** Keep the live edge in view until the reader scrolls away. */
export function useFloatingChatScroll(
  log: RefObject<HTMLDivElement | null>, spacer: RefObject<HTMLDivElement | null>, session: string,
  messages: ReadonlyArray<{ id?: string; role?: string }>, running: boolean,
) {
  const state = useRef({ follow: true, moving: false, manual: false });
  const schedule = useRef<() => void>(() => {});
  const [scrollable, setScrollable] = useState(false);
  const [away, setAway] = useState(false);
  const [scrolling, setScrolling] = useState(false);

  const followOnSend = useCallback(() => {
    Object.assign(state.current, { follow: true, moving: false, manual: false });
    schedule.current();
  }, []);

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
    const pin = () => {
      if (view.follow && !view.moving && distance() > 1) el.scrollTop = el.scrollHeight;
    };
    const measure = () => {
      frame = null;
      pin();
      setAway(!view.moving && distance() > 2);
      setScrollable(el.scrollHeight > el.clientHeight + 2);
    };
    function queue() { if (frame === null) frame = requestAnimationFrame(measure); }
    const sync = () => { pin(); queue(); };
    // Content mutations already notify ResizeObserver after layout, before paint.
    // Avoid forcing a second synchronous layout inside the React commit.
    schedule.current = typeof ResizeObserver === 'undefined' ? sync : queue;
    let reachedScrollback = false;
    const release = () => {
      if (!view.manual) reachedScrollback = distance() > 2;
      Object.assign(view, { manual: true, moving: false, follow: false });
    };
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) release();
    };
    const onScrollEnd = () => {
      if (view.moving) { view.moving = false; queue(); }
    };
    const onScroll = () => {
      if (view.manual) {
        if (distance() > 2) reachedScrollback = true;
        else if (reachedScrollback) { view.manual = false; view.follow = true; }
      }
      setAway(!view.moving && distance() > 2);
      setScrolling(true);
      window.clearTimeout(idle);
      idle = window.setTimeout(() => setScrolling(false), 140);
    };
    const onWheel = (e: WheelEvent) => { if (e.deltaY < 0 || distance() > 2) release(); };
    const onPointer = (e: PointerEvent) => {
      if (e.target === el && e.offsetX >= el.clientWidth) release();
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchmove', release, { passive: true });
    el.addEventListener('pointerdown', onPointer, { passive: true });
    el.addEventListener('keydown', onKey);
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('scrollend', onScrollEnd);
    // Token reveals, highlighting and disclosures can change height between
    // provider events. Observe row boxes, never the tail that we resize.
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
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
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchmove', release);
      el.removeEventListener('pointerdown', onPointer);
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
  return { scrollable, scrolling, away, jump, followOnSend };
}
