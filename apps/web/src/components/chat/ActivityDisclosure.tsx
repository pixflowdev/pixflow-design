import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@open-design/components';
import { Icon } from '../Icon';
import { ActivityIcon, type ActivityIconKind } from './ActivityIcon';
import styles from './ActivityDisclosure.module.css';

/** Presentation only: source events and their ordering stay untouched. */
export function groupActivity<T>(blocks: T[], eligible: (block: T) => boolean) {
  const groups: { start: number; grouped: boolean; blocks: T[] }[] = [];
  blocks.forEach((block, start) => {
    const grouped = eligible(block);
    const previous = groups.at(-1);
    if (grouped && previous?.grouped) previous.blocks.push(block);
    else groups.push({ start, grouped, blocks: [block] });
  });
  return groups;
}

export function ActivityDisclosure({ label, icon = 'tools', active, issueLabel, children }: {
  label: string; icon?: ActivityIconKind; active: boolean; issueLabel?: string; children: () => ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [displayed, setDisplayed] = useState({ label, icon });
  const changedAt = useRef(Date.now());
  useEffect(() => {
    if (label === displayed.label && icon === displayed.icon) return;
    const update = () => { setDisplayed({ label, icon }); changedAt.current = Date.now(); };
    if (!active) { update(); return; }
    const timer = setTimeout(update, Math.max(0, 1000 - (Date.now() - changedAt.current)));
    return () => clearTimeout(timer);
  }, [label, icon, displayed, active]);
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setMounted(false), 160);
    return () => clearTimeout(timer);
  }, [open]);
  return <div className={styles.root} data-activity-group data-active={active}>
    <Button variant="ghost" className={styles.trigger} aria-expanded={open} aria-controls={id}
      onClick={() => { setMounted(true); setOpen(value => !value); }}>
      <ActivityIcon kind={!active ? icon : displayed.icon} />
      <span className={`${styles.label} ${active ? styles.shimmer : ''}`}>{!active ? label : displayed.label}</span>
      {issueLabel ? <span className={styles.issue}>{issueLabel}</span> : null}
      <span className={`${styles.chevron} ${open ? styles.rotated : ''}`}><Icon name="chevron-right" size={12} /></span>
    </Button>
    <div id={id} className={`${styles.collapse} ${open ? styles.open : ''}`} aria-hidden={!open}
      ref={node => { node?.toggleAttribute('inert', !open); }}>
      <div className={styles.inner}><div className={styles.body}>{mounted ? children() : null}</div></div>
    </div>
  </div>;
}
