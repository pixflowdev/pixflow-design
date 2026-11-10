// shadcn/ui Base UI Hover Card (MIT), with Pixflow portal and theme integration.
import { PreviewCard } from '@base-ui/react/preview-card';
import type { ComponentProps } from 'react';
import styles from './InlineCitation.module.css';

export function HoverCard(props: ComponentProps<typeof PreviewCard.Root>) {
  return <PreviewCard.Root {...props} />;
}
export function HoverCardTrigger(props: ComponentProps<typeof PreviewCard.Trigger>) {
  return <PreviewCard.Trigger data-slot="hover-card-trigger" {...props} />;
}
export function HoverCardContent({ container, side = 'bottom', align = 'center', sideOffset = 4,
  alignOffset = 4, className = '', ...props }: ComponentProps<typeof PreviewCard.Popup> &
  Pick<ComponentProps<typeof PreviewCard.Positioner>, 'side' | 'align' | 'sideOffset' | 'alignOffset'> &
  { container?: HTMLElement | null }) {
  return <PreviewCard.Portal container={container} data-slot="hover-card-portal">
    <PreviewCard.Positioner side={side} align={align} sideOffset={sideOffset} alignOffset={alignOffset} className={styles.positioner}>
      <PreviewCard.Popup data-slot="hover-card-content" className={`${styles.card} ${className}`} {...props} />
    </PreviewCard.Positioner>
  </PreviewCard.Portal>;
}
