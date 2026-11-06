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
export function CodeBlockContent({ className = '', ...props }: ComponentProps<'div'>) {
  return <div data-slot="code-block-content" tabIndex={0} className={`${styles.content} ${className}`} {...props} />;
}
