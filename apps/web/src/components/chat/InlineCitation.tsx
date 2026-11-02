import { Popover } from '@base-ui/react/popover';
import { useRef, useState } from 'react';
import { useT } from '../../i18n';
import { Icon } from '../Icon';
import { workspacePortalTarget } from '../workspacePortalTarget';
import styles from './InlineCitation.module.css';

export function citationSource(href: string): URL | null {
  if (!/^https?:\/\//i.test(href)) return null;
  try {
    const url = new URL(href);
    return url.username || url.password ? null : url;
  } catch {
    return null;
  }
}

export function InlineCitation({ source, title }: { source: URL; title: string }) {
  const t = useT();
  const trigger = useRef<HTMLButtonElement>(null);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const host = source.hostname;
  return <Popover.Root onOpenChange={open => {
    if (open) setPortal(workspacePortalTarget(trigger.current));
  }}>
    <Popover.Trigger ref={trigger} type="button" className={styles.chip}
      openOnHover delay={90} closeDelay={150} aria-label={`${title} (${host})`}>
      {host}
    </Popover.Trigger>
    <Popover.Portal container={portal}>
      <Popover.Positioner className={styles.positioner} side="top" align="start" sideOffset={6}>
        <Popover.Popup className={styles.card} aria-label={title}>
          <strong>{title}</strong>
          <a href={source.href} target="_blank" rel="noopener noreferrer"
            aria-label={`${host} · ${t('common.openInNewTab')}`}>
            {host}<Icon name="external-link" size={12} />
          </a>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>;
}
