import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import styles from './Badge.module.css';

/** shadcn Base UI Badge composition, using Pixflow tokens instead of utility colours. */
export function Badge({className, variant='default', render, ...props}: useRender.ComponentProps<'span'> & {
  variant?: 'default'|'secondary'|'destructive'|'outline'|'ghost'|'link';
}) {
  return useRender({
    defaultTagName:'span', render,
    props:mergeProps({className:[styles.badge,className].filter(Boolean).join(' ')},props),
    state:{slot:'badge',variant},
  });
}
