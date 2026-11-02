import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export function chatScrollBehavior(): ScrollBehavior {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
}

/** A fresh prompt anchors once. Streamed chunks consume the space below it;
 * only a reader at the live edge follows subsequent output. */
export function useFloatingChatScroll(
  log: RefObject<HTMLDivElement>, spacer: RefObject<HTMLDivElement>, session: string,
  messages: ReadonlyArray<{ id?: string; role?: string }>, running: boolean,
) {
  const state = useRef({ follow: true, anchor: '', lastUser: '', align: false, moving: false, manual: false, running: false });
  const schedule = useRef<() => void>(() => {});
  const [scrollable, setScrollable] = useState(false);
  const [away, setAway] = useState(false);
  const [scrolling, setScrolling] = useState(false);

  const jump = useCallback(() => {
    const el = log.current;
    if (!el) return;
    const view = state.current;
    Object.assign(view, { anchor: '', follow: true, align: false, manual: false });
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
    Object.assign(view, { follow: true, anchor: '', lastUser: '', align: false, moving: false, manual: false });
    tail.style.height = '0px';
    let idle: number | undefined, frame: number | null = null;
    const distance = () => el.scrollHeight - el.clientHeight - el.scrollTop;
    const measure = () => {
      frame = null;
      if (!view.running) {
        view.anchor = '';
        tail.style.height = '0px';
        if (!view.manual) view.follow = true;
      }
      const row = view.anchor && el.querySelector<HTMLElement>(`[data-chat-user-id="${CSS.escape(view.anchor)}"]`);
      if (row) {
        const top = el.scrollTop + row.getBoundingClientRect().top - el.getBoundingClientRect().top;
        const reserve = Math.max(0, el.clientHeight - (el.scrollHeight - tail.offsetHeight - top) - 12);
        tail.style.height = `${reserve}px`;
        if (view.align) {
          view.align = false;
          el.scrollTo({ top: Math.max(0, top - 12), behavior: chatScrollBehavior() });
        }
        if (!reserve) { view.anchor = ''; view.follow = true; }
      }
      if (!view.anchor && view.follow && !view.moving && distance() > 1) el.scrollTop = el.scrollHeight;
      setAway(!view.moving && distance() > 2);
      setScrollable(el.scrollHeight > el.clientHeight + 2);
    };
    function queue() { if (frame === null) frame = requestAnimationFrame(measure); }
    schedule.current = queue;
    const release = () => { Object.assign(view, { manual: true, anchor: '', align: false, moving: false, follow: false }); };
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
    const view = state.current;
    let user = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') { user = messages[i]?.id || ''; break; }
    }
    if (running && user && user !== view.lastUser) {
      Object.assign(view, { anchor: user, align: true, follow: false, manual: false, moving: false });
    }
    view.running = running;
    view.lastUser = user;
    schedule.current();
  }, [messages, running, session]);
  return { scrollable, scrolling, away, jump };
}
