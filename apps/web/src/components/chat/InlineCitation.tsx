import { Button, VisuallyHidden } from '@open-design/components';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './HoverCard';
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
  const [open, setOpen] = useState(false);
  const host = source.hostname;
  return <HoverCard open={open} onOpenChange={value => {
    if (value) setPortal(workspacePortalTarget(trigger.current));
    setOpen(value);
  }}>
    <HoverCardTrigger render={<Button ref={trigger} />} className={styles.chip}
      delay={10} closeDelay={100} aria-label={`${title} (${host})`}
      onClick={() => { setPortal(workspacePortalTarget(trigger.current)); setOpen(value => !value); }}>
      {host}
    </HoverCardTrigger>
        <HoverCardContent container={portal} side="top" align="start" sideOffset={6} aria-label={title}>
          <strong>{title}</strong>
          <a href={source.href} target="_blank" rel="noopener noreferrer"
            aria-label={`${host} · ${t('common.openInNewTab')}`}>
            {host}<Icon name="external-link" size={12} /><VisuallyHidden>{t('common.openInNewTab')}</VisuallyHidden>
          </a>
        </HoverCardContent>
  </HoverCard>;
}
