import { useState, type ReactElement } from 'react';
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
      {anchor && <Tooltip.Portal container={workspacePortalTarget(anchor)}>
        <Tooltip.Positioner side={side} sideOffset={8} collisionPadding={8} className={styles.positioner}>
          <Tooltip.Popup data-slot="tooltip-content" className={styles.content}>
            {label}
            <Tooltip.Arrow className={styles.arrow}>
              <svg width="10" height="5" viewBox="0 0 10 5" aria-hidden="true"><path d="M0 0H10L5 5Z" /></svg>
            </Tooltip.Arrow>
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>}
    </Tooltip.Root>
  </Tooltip.Provider>;
}
