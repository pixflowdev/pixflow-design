// shadcn/ui Base UI Bubble composition (MIT), styled with Pixflow tokens.
import type { ComponentProps } from 'react';
import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import styles from './Bubble.module.css';

export function BubbleGroup({ className = '', ...props }: ComponentProps<'div'>) {
  return <div data-slot="bubble-group" className={`${styles.group} ${className}`} {...props} />;
}
export function Bubble({ variant = 'default', align = 'start', className = '', ...props }: ComponentProps<'div'> & {
  variant?: 'default' | 'secondary' | 'muted' | 'tinted' | 'outline' | 'ghost' | 'destructive'; align?: 'start' | 'end';
}) {
  return <div data-slot="bubble" data-variant={variant} data-align={align} className={`${styles.bubble} ${className}`} {...props} />;
}
export function BubbleContent({ className = '', render, ...props }: useRender.ComponentProps<'div'>) {
  return useRender({ defaultTagName: 'div', render,
    props: mergeProps<'div'>({ className: `${styles.content} ${className}` }, props), state: { slot: 'bubble-content' } });
}
export function BubbleReactions({ side = 'bottom', align = 'end', className = '', ...props }: ComponentProps<'div'> & {
  side?: 'top' | 'bottom'; align?: 'start' | 'end';
}) {
  return <div data-slot="bubble-reactions" data-side={side} data-align={align} className={`${styles.reactions} ${className}`} {...props} />;
}
