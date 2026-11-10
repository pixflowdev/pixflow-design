// shadcn/ui Marker composition (MIT), styled with Pixflow tokens.
import type { ComponentProps } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import styles from './Marker.module.css';
export function Marker({ className = '', render, ...props }: useRender.ComponentProps<'div'>) {
  return useRender({defaultTagName:'div',render,props:mergeProps<'div'>({className:`${styles.marker} ${className}`},props),state:{slot:'marker',variant:'separator'}});
}
export function MarkerIcon(props: ComponentProps<'span'>) { return <span data-slot="marker-icon" aria-hidden {...props} />; }
export function MarkerContent(props: ComponentProps<'span'>) { return <span data-slot="marker-content" {...props} />; }
