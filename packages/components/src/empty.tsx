// shadcn/ui Empty composition (MIT), styled with Pixflow's shared tokens.
import type { ComponentProps } from 'react';
import { joinClassNames } from './class-names';
import styles from './empty.module.css';

export function Empty({className,...props}:ComponentProps<'div'>) {
  return <div data-slot="empty" className={joinClassNames(styles.root,className)} {...props}/>;
}
export function EmptyHeader({className,...props}:ComponentProps<'div'>) {
  return <div data-slot="empty-header" className={joinClassNames(styles.header,className)} {...props}/>;
}
export function EmptyMedia({className,variant='default',...props}:ComponentProps<'div'>&{variant?:'default'|'icon'}) {
  return <div data-slot="empty-media" data-variant={variant} className={joinClassNames(styles.media,className)} {...props}/>;
}
export function EmptyTitle({className,...props}:ComponentProps<'div'>) {
  return <div data-slot="empty-title" className={joinClassNames(styles.title,className)} {...props}/>;
}
export function EmptyDescription({className,...props}:ComponentProps<'p'>) {
  return <p data-slot="empty-description" className={joinClassNames(styles.description,className)} {...props}/>;
}
export function EmptyContent({className,...props}:ComponentProps<'div'>) {
  return <div data-slot="empty-content" className={joinClassNames(styles.content,className)} {...props}/>;
}
