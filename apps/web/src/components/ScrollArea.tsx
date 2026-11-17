import type { ReactNode } from 'react';
import { ScrollArea as Primitive } from '@base-ui/react/scroll-area';
import styles from './ScrollArea.module.css';

/** shadcn/Base UI scroll-area composition, themed with shared Pixflow tokens. */
export function ScrollArea({ children, className = '', label }: { children: ReactNode; className?: string; label: string }) {
  return <Primitive.Root data-slot="scroll-area" className={`${styles.root} ${className}`}>
    <Primitive.Viewport data-slot="scroll-area-viewport" className={styles.viewport} aria-label={label} tabIndex={0}>
      <Primitive.Content className={styles.content}>{children}</Primitive.Content>
    </Primitive.Viewport>
    <Primitive.Scrollbar orientation="vertical" className={styles.scrollbar}><Primitive.Thumb className={styles.thumb}/></Primitive.Scrollbar>
    <Primitive.Corner />
  </Primitive.Root>;
}
