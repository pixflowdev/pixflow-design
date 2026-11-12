// shadcn/ui Attachment composition (MIT), using Pixflow tokens and buttons.
import type { ComponentProps } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { Button } from '@open-design/components';
import styles from './Attachment.module.css';

export function Attachment({ className = '', size = 'default', ...props }: ComponentProps<'div'> & { size?: 'default' | 'sm' }) {
  return <div data-slot="attachment" data-state="done" data-size={size} className={`${styles.attachment} ${className}`} {...props} />;
}
export function AttachmentGroup({ className = '', ...props }: ComponentProps<'div'>) {
  return <div data-slot="attachment-group" className={`${styles.group} ${className}`} {...props} />;
}
export function AttachmentMedia({ className = '', ...props }: ComponentProps<'div'>) {
  return <div data-slot="attachment-media" className={`${styles.media} ${className}`} aria-hidden {...props} />;
}
export function AttachmentContent({ className = '', ...props }: ComponentProps<'div'>) {
  return <div data-slot="attachment-content" className={`${styles.content} ${className}`} {...props} />;
}
export function AttachmentTitle({ className = '', ...props }: ComponentProps<'span'>) {
  return <span data-slot="attachment-title" className={`${styles.title} ${className}`} {...props} />;
}
export function AttachmentDescription({ className = '', ...props }: ComponentProps<'span'>) {
  return <span data-slot="attachment-description" className={`${styles.description} ${className}`} {...props} />;
}
export function AttachmentActions({ className = '', ...props }: ComponentProps<'div'>) {
  return <div data-slot="attachment-actions" className={`${styles.actions} ${className}`} {...props} />;
}
export function AttachmentAction({ className = '', render, ...props }: useRender.ComponentProps<'button'>) {
  return useRender({ defaultTagName: 'button', render: render ?? <Button variant="subtle" />,
    props: mergeProps<'button'>({ className: `${styles.action} ${className}` }, props), state: { slot: 'attachment-action' } });
}

export function AttachmentTrigger({ className = '', render, ...props }: useRender.ComponentProps<'button'>) {
  return useRender({
    defaultTagName: 'button',
    render: render ?? <button type="button" />,
    props: mergeProps<'button'>({ className: `${styles.trigger} ${className}` }, props),
    state: { slot: 'attachment-trigger' },
  });
}
