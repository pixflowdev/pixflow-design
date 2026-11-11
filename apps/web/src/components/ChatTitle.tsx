import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import styles from './ChatTitle.module.css';

/** Match the desktop chat-title motion: a short pause, then reveal the ending once. */
export function chatTitleMotion(distance: number, fontSize: number) {
  const travel = distance / (fontSize * 2);
  const duration = 0.35 + travel;
  const stops = ['0 0%'];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32, rest = 1 - t;
    const a = 3 * rest * rest * t, b = 3 * rest * t * t, c = t * t * t;
    stops.push(`${(0.6 * a + b + c).toFixed(4)} ${((0.35 + travel * (0.49 * a + 0.7 * b + c)) / duration * 100).toFixed(4)}%`);
  }
  return { '--title-distance': `${distance}px`, '--title-duration': `${duration.toFixed(3)}s`, '--title-timing': `linear(${stops.join(', ')})` } as CSSProperties;
}

export function ChatTitle({ children }: { children: string }) {
  const viewport = useRef<HTMLSpanElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const [motion, setMotion] = useState<CSSProperties | undefined>();
  useLayoutEffect(() => {
    const outer = viewport.current, inner = content.current;
    if (!outer || !inner) return;
    const measure = () => {
      const distance = inner.scrollWidth - outer.clientWidth;
      const fontSize = parseFloat(getComputedStyle(inner).fontSize) || 15;
      const next = outer.clientWidth > 0 && distance >= 1 ? chatTitleMotion(distance, fontSize) : undefined;
      setMotion(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer); observer.observe(inner);
    return () => observer.disconnect();
  }, [children]);
  return <span ref={viewport} className={styles.title} data-chat-title data-overflow={!!motion} style={motion}>
    <span className={styles.clip}><span className={styles.track}><span ref={content} className={styles.content}>{children}</span></span></span>
  </span>;
}
