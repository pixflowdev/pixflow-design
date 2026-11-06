// shadcn/ui Message Scroller composition (MIT). Behaviour comes from the
// upstream package; Pixflow supplies tokens, icons and translated labels.
import { MessageScroller as Primitive, useMessageScroller, useMessageScrollerScrollable } from '@shadcn/react/message-scroller';
import { createContext, useContext, version, type ComponentProps } from 'react';
import { Button } from '@open-design/components';
import styles from './MessageScroller.module.css';

// WordPress directory installs own their React version. Keep their legacy
// scroller until the host supplies React 19; never install a second renderer.
export const supportsMessageScroller = Number(version.split('.')[0]) >= 19;
const ScrollerContext = createContext(false);
export function MessageScrollerProvider(props: ComponentProps<typeof Primitive.Provider>) {
  return <ScrollerContext.Provider value><Primitive.Provider {...props} /></ScrollerContext.Provider>;
}
export function ChatTranscriptItem(props: ComponentProps<typeof Primitive.Item>) {
  const enabled = useContext(ScrollerContext);
  // Pixflow follows the live edge; turn anchoring would reserve blank space
  // and pull a newly submitted prompt to the top of the viewport.
  if (enabled) return <MessageScrollerItem {...props} scrollAnchor={false} />;
  const { messageId: _id, scrollAnchor: _anchor, ...rest } = props;
  return <div {...rest} />;
}
export { useMessageScroller, useMessageScrollerScrollable };
export function MessageScroller({ className = '', ...props }: ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root data-slot="message-scroller" className={`${styles.root} ${className}`} {...props} />;
}
export function MessageScrollerViewport({ className = '', ...props }: ComponentProps<typeof Primitive.Viewport>) {
  return <Primitive.Viewport data-slot="message-scroller-viewport" className={`${styles.viewport} ${className}`} {...props} />;
}
export function MessageScrollerContent({ className = '', ...props }: ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Content data-slot="message-scroller-content" className={`${styles.content} ${className}`} {...props} />;
}
export function MessageScrollerItem({ className = '', ...props }: ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item data-slot="message-scroller-item" className={`${styles.item} ${className}`} {...props} />;
}
export function MessageScrollerButton({ className = '', ...props }: ComponentProps<typeof Primitive.Button>) {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return <Primitive.Button data-slot="message-scroller-button" className={`${styles.button} ${className}`}
    render={<Button />} behavior={reduced ? 'instant' : 'smooth'} {...props} />;
}
