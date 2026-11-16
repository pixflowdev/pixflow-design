// shadcn/ui Message Scroller composition (MIT). Behaviour comes from the
// upstream package; Pixflow supplies tokens, icons and translated labels.
import { MessageScroller as Primitive, useMessageScroller, useMessageScrollerScrollable } from '@shadcn/react/message-scroller';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useCallback, type ComponentProps } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@open-design/components';
import styles from './MessageScroller.module.css';

// Static history previews also render transcript rows outside a scroll region.
// Only interactive transcripts mount a controller; there is no legacy scroller.
const ReadingContext = createContext({ held: false, hold: () => {}, resume: () => {}, release: () => {} });
const ScrollerContext = createContext<{ ready: boolean } | null>(null);
export function MessageScrollerProvider({ autoScroll, children, ...props }: ComponentProps<typeof Primitive.Provider>) {
  const lifecycle = useRef({ ready: false });
  const [held, setHeld] = useState(false);
  useEffect(() => { lifecycle.current.ready = true; }, []);
  const hold = useCallback(() => setHeld(true), []);
  const release = useCallback(() => setHeld(false), []);
  const resume = useCallback(() => { flushSync(release); }, [release]);
  return <ScrollerContext.Provider value={lifecycle.current}><ReadingContext.Provider value={{ held, hold, resume, release }}>
    <Primitive.Provider autoScroll={autoScroll && !held} {...props}>
      <ResumeAtLiveEdge held={held} resume={resume} />{children}
    </Primitive.Provider>
  </ReadingContext.Provider></ScrollerContext.Provider>;
}
function ResumeAtLiveEdge({ held, resume }: { held: boolean; resume: () => void }) {
  const { end } = useMessageScrollerScrollable();
  const { scrollToEnd } = useMessageScroller();
  const leftEdge = useRef(false);
  useEffect(() => {
    if (!held) { leftEdge.current = false; return; }
    if (end) { leftEdge.current = true; return; }
    if (leftEdge.current) {
      // An explicit return to the edge resumes following. Schedule outside the
      // effect so the provider update precedes the upstream scroll command.
      const frame = requestAnimationFrame(() => { resume(); scrollToEnd({ behavior: 'instant' }); });
      return () => cancelAnimationFrame(frame);
    }
  }, [held, end, resume, scrollToEnd]);
  return null;
}
export function ChatTranscriptItem({ animateNew = false, ...props }: ComponentProps<typeof Primitive.Item> & { animateNew?: boolean }) {
  const controller = useContext(ScrollerContext);
  const animate = useRef(Boolean(controller?.ready && animateNew));
  const { release } = useContext(ReadingContext);
  useLayoutEffect(() => {
    // A newly submitted user turn is an explicit request to move again.
    // Prepending history and mounting a saved conversation never release hold.
    if (animate.current && props.scrollAnchor) release();
  }, [props.scrollAnchor, release]);
  if (controller) return <MessageScrollerItem {...props} data-message-enter={animate.current || undefined} />;
  const { messageId: _id, scrollAnchor: _anchor, ...rest } = props;
  return <div {...rest} />;
}
export { useMessageScroller, useMessageScrollerScrollable };
export function MessageScroller({ className = '', ...props }: ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root data-slot="message-scroller" className={`${styles.root} ${className}`} {...props} />;
}
/** Forward non-scroll reading gestures to the upstream intent handler too.
 * 0.3.1 exposes intent through wheel/touch/keyboard events, not an imperative
 * pause method. A zero-delta wheel signals intent without moving the viewport.
 * All position, anchoring, resize and resume behaviour remains upstream-owned.
 */
function holdForReader(viewport: HTMLDivElement | null) {
  viewport?.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 0 }));
}
export function MessageScrollerViewport({ className = '', ref, onPointerDownCapture, onFocusCapture, ...props }: ComponentProps<typeof Primitive.Viewport>) {
  const viewport = useRef<HTMLDivElement | null>(null);
  const { held, hold } = useContext(ReadingContext);
  const pause = useCallback(() => { hold(); holdForReader(viewport.current); }, [hold]);
  const setViewport = useCallback((node: HTMLDivElement | null) => {
    viewport.current = node; if (typeof ref === 'function') return ref(node); if (ref) ref.current = node;
  }, [ref]);
  useEffect(() => {
    const selection = () => {
      const selected = window.getSelection();
      if (selected && !selected.isCollapsed && (viewport.current?.contains(selected.anchorNode) || viewport.current?.contains(selected.focusNode))) pause();
    };
    const find = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' || event.key === 'F3') pause();
    };
    document.addEventListener('selectionchange', selection);
    document.addEventListener('keydown', find);
    return () => { document.removeEventListener('selectionchange', selection); document.removeEventListener('keydown', find); };
  }, [pause]);
  return <Primitive.Viewport data-slot="message-scroller-viewport" data-reader-held={held || undefined} className={`${styles.viewport} ${className}`}
    ref={setViewport}
    onPointerDownCapture={event => { pause(); onPointerDownCapture?.(event); }}
    onFocusCapture={event => { if (event.target !== event.currentTarget) pause(); onFocusCapture?.(event); }}
    {...props} />;
}
export function MessageScrollerContent({ className = '', ...props }: ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Content data-slot="message-scroller-content" className={`${styles.content} ${className}`} {...props} />;
}
export function MessageScrollerItem({ className = '', ...props }: ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item data-slot="message-scroller-item" className={`${styles.item} ${className}`} {...props} />;
}
export function MessageScrollerButton({ className = '', onClick, ...props }: ComponentProps<typeof Primitive.Button>) {
  const { resume } = useContext(ReadingContext);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return <Primitive.Button data-slot="message-scroller-button" className={`${styles.button} ${className}`}
    onClick={event => { onClick?.(event); if (!event.defaultPrevented) resume(); }} render={<Button />} behavior={reduced ? 'instant' : 'smooth'} {...props} />;
}
