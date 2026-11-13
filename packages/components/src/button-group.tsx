import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { joinClassNames } from './class-names';
import styles from './button-group.module.css';

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
}

/** Shadcn button-group composition, using Pixflow's shared button tokens. */
export const ButtonGroup = forwardRef<HTMLDivElement, ButtonGroupProps>(function ButtonGroup(
  { orientation = 'horizontal', className, ...props }, ref,
) {
  return <div ref={ref} role="group" data-slot="button-group" data-orientation={orientation}
    className={joinClassNames(styles.group, className)} {...props} />;
});

export function ButtonGroupSeparator({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span aria-hidden="true" data-slot="button-group-separator"
    className={joinClassNames(styles.separator, className)} {...props} />;
}
