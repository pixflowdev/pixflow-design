// shadcn/ui Input Group composition (MIT), preserving Pixflow's rich-text editor.
import type { ComponentProps } from 'react';
import { Button } from '@open-design/components';
import styles from './InputGroup.module.css';

export function InputGroup({ className = '', ...props }: ComponentProps<'div'>) {
  return <div role="group" data-slot="input-group" className={`${styles.root} ${className}`} {...props} />;
}
export function InputGroupAddon({ align = 'block-end', ...props }: ComponentProps<'div'> & { align?: 'block-start' | 'block-end' }) {
  return <div role="group" data-slot="input-group-addon" data-align={align} {...props} />;
}
export function InputGroupButton(props: ComponentProps<typeof Button>) {
  return <Button data-slot="input-group-button" {...props} />;
}
