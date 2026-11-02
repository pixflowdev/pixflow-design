import { createContext, useContext, useState, type ComponentProps } from 'react';
import { Collapsible } from '@base-ui/react/collapsible';
import { Icon } from '../Icon';
import styles from './Trace.module.css';

const TraceOpenContext = createContext(false);

// Adapted from shadcn/ui's MIT-licensed Base UI Trace composition.
// Pixflow owns event normalization; these parts only present supplied data.
export function Trace({ className = '', ...props }: ComponentProps<'div'>) {
  return <div data-slot="trace" className={`${styles.trace} ${className}`} {...props} />;
}
export function TraceLine({ className = '', status, ...props }: ComponentProps<'span'> & {
  status?: 'running' | 'error' | 'pending';
}) {
  return <span data-slot="trace-line" data-status={status} className={`${styles.line} ${className}`} {...props} />;
}
export function TraceIcon({ className = '', ...props }: ComponentProps<'span'>) {
  return <span data-slot="trace-icon" aria-hidden="true" className={`${styles.icon} ${className}`} {...props} />;
}
export function TraceTitle({ className = '', ...props }: ComponentProps<'span'>) {
  return <span data-slot="trace-title" className={`${styles.title} ${className}`} {...props} />;
}
export function TraceDescription({ className = '', ...props }: ComponentProps<'span'>) {
  return <span data-slot="trace-description" className={`${styles.description} ${className}`} {...props} />;
}
export function TraceCollapsible({ className = '', open: controlledOpen, defaultOpen = false, onOpenChange, ...props }: ComponentProps<typeof Collapsible.Root>) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? localOpen;
  return <TraceOpenContext.Provider value={open}>
    <Collapsible.Root data-slot="trace-collapsible" className={`${styles.root} ${className}`} {...props} open={open}
      onOpenChange={(value, event) => { setLocalOpen(value); onOpenChange?.(value, event); }} />
  </TraceOpenContext.Provider>;
}
export function TraceCollapsibleTrigger({ className = '', children, ...props }: ComponentProps<typeof Collapsible.Trigger>) {
  return <Collapsible.Trigger data-slot="trace-collapsible-trigger" className={`${styles.trigger} ${className}`} {...props}>
    {children}<TraceIcon className={styles.chevron}><Icon name="chevron-right" size={12} /></TraceIcon>
  </Collapsible.Trigger>;
}
export function TraceCollapsibleContent({ className = '', children, ...props }: ComponentProps<typeof Collapsible.Panel>) {
  const open = useContext(TraceOpenContext);
  return <Collapsible.Panel keepMounted data-slot="trace-collapsible-content" className={styles.panel} {...props}>
    <div className={styles.inner} aria-hidden={!open} ref={node => { node?.toggleAttribute('inert', !open); }}>
      <div className={`${styles.content} ${className}`}>{children}</div>
    </div>
  </Collapsible.Panel>;
}
