import { useEffect, useId, useState, type ReactElement } from 'react';
import { Tooltip } from '@base-ui/react/tooltip';
import { workspacePortalTarget } from './workspacePortalTarget';
import styles from './NavigationTooltip.module.css';

/** Shared shadcn Base Tooltip composition for Workspace and contributed navigation.
 * Portalling into the active workspace preserves its theme and modal stacking. */
export function NavigationTooltip({ label, children, disabled = false, side = 'right' }: {
  label: string;
  children: ReactElement;
  disabled?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return <Tooltip.Provider delay={250}>
    <Tooltip.Root disabled={disabled}>
      <Tooltip.Trigger ref={setAnchor} render={children} />
      {anchor && <NavigationTooltipPopup anchor={anchor} label={label} side={side} />}
    </Tooltip.Root>
  </Tooltip.Provider>;
}

/** Native builder header controls cannot render a React Trigger. Their shared
 * event layer supplies the anchor while reusing the same shadcn popup. */
export function AnchoredNavigationTooltip({ anchor, label, side = 'top' }: {
  anchor: HTMLElement;
  label: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  const id = useId();
  useEffect(() => {
    const previous = anchor.getAttribute('aria-describedby');
    anchor.setAttribute('aria-describedby', [previous, id].filter(Boolean).join(' '));
    return () => {
      const remaining = (anchor.getAttribute('aria-describedby') || '').split(/\s+/).filter(value => value && value !== id).join(' ');
      if (remaining) anchor.setAttribute('aria-describedby', remaining);
      else anchor.removeAttribute('aria-describedby');
    };
  }, [anchor, id]);
  return <Tooltip.Provider>
    <Tooltip.Root open>
      <NavigationTooltipPopup anchor={anchor} label={label} side={side} id={id} />
    </Tooltip.Root>
  </Tooltip.Provider>;
}

function NavigationTooltipPopup({ anchor, label, side, id }: {
  anchor: HTMLElement;
  label: string;
  side: 'top' | 'right' | 'bottom' | 'left';
  id?: string;
}) {
  return <Tooltip.Portal container={workspacePortalTarget(anchor)}>
        <Tooltip.Positioner anchor={anchor} side={side} sideOffset={8} collisionPadding={8} className={styles.positioner}>
          <Tooltip.Popup id={id} role="tooltip" data-slot="tooltip-content" className={styles.content}>
            {label}
            <Tooltip.Arrow className={styles.arrow}>
              <svg width="10" height="5" viewBox="0 0 10 5" aria-hidden="true"><path d="M0 0H10L5 5Z" /></svg>
            </Tooltip.Arrow>
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>;
}
