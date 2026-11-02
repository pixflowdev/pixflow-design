import type { ComponentProps } from 'react';
import styles from './Message.module.css';

// shadcn/ui Message composition, adapted to Pixflow's shared transcript layout.
export function Message({ className = '', align = 'start', ...props }: ComponentProps<'div'> & { align?: 'start' | 'end' }) {
  return <div data-slot="message" data-align={align} className={`${styles.message} ${className}`} {...props} />;
}
export function MessageContent({ className = '', ...props }: ComponentProps<'div'>) {
  return <div data-slot="message-content" className={`${styles.content} ${className}`} {...props} />;
}
export function MessageHeader({ className = '', ...props }: ComponentProps<'div'>) {
  return <div data-slot="message-header" className={`${styles.header} ${className}`} {...props} />;
}
export function MessageFooter({ className = '', ...props }: ComponentProps<'div'>) {
  return <div data-slot="message-footer" className={`${styles.footer} ${className}`} {...props} />;
}
