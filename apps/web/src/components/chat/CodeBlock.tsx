// shadcn/ui Code Block composition (MIT), using Pixflow's existing code tokens.
import type { ComponentProps } from 'react';
import styles from './CodeBlock.module.css';

export function CodeBlock({ className = '', variant = 'default', size = 'default', ...props }:
  ComponentProps<'div'> & { variant?: 'default' | 'destructive'; size?: 'default' | 'sm' }) {
  return <div data-slot="code-block" data-variant={variant} data-size={size} className={`${styles.root} ${className}`} {...props} />;
}
export function CodeBlockHeader({ className = '', ...props }: ComponentProps<'div'>) {
  return <div data-slot="code-block-header" className={`${styles.header} ${className}`} {...props} />;
}
export function CodeBlockTitle({ className = '', ...props }: ComponentProps<'div'>) {
  return <div data-slot="code-block-title" className={`${styles.title} ${className}`} {...props} />;
}
export function CodeBlockActions({ className = '', ...props }: ComponentProps<'div'>) {
  return <div data-slot="code-block-actions" className={`${styles.actions} ${className}`} {...props} />;
}
export function CodeBlockContent({ className = '', children, ...props }: ComponentProps<'pre'>) {
  return <pre data-slot="code-block-content" dir="ltr" tabIndex={0} className={`${styles.content} ${className}`} {...props}><code data-slot="code-block-code">{children}</code></pre>;
}
/** Shiki returns its own pre/code tree; keep a single scrolling viewport. */
export function CodeBlockHighlightedContent({ className = '', ...props }: ComponentProps<'div'>) {
  return <div data-slot="code-block-content" tabIndex={0} className={`${styles.content} ${className}`} {...props} />;
}
