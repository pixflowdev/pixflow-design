import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import { useI18n } from '../i18n';
import { CodexUsageDetails, useCodexUsage } from './CodexUsage';
import { workspacePortalThemeStyle } from './workspacePortalTarget';
import styles from './CodexUsageIndicator.module.css';

/** The most constrained reported allowance drives the ring; every window remains visible in details. */
export function CodexUsageIndicator({ zIndex = 1000, provider = 'codex', model = '' }: { zIndex?: number; provider?: 'codex' | 'claude'; model?: string }) {
  const state = useCodexUsage(provider, model);
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const windows = state.data?.status === 'available' ? state.data.windows : [];
  const remaining = windows.length ? Math.min(...windows.map(window => window.remainingPercent)) : null;
  const percent = (value: number) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value / 100);
  const summary = state.busy && !state.data ? t('common.loading') : remaining === null ? t('builderDestination.unavailable') : t('settings.usageRemaining', { value: percent(remaining) });
  const visible = open || hover;

  useEffect(() => {
    if (!visible) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(288, window.innerWidth - 24);
      const above = rect.top > window.innerHeight - rect.bottom;
      // Viewport coordinates must not be interpreted inside the Workspace's
      // transformed/contained overlay. Preserve its stacking level when escaping it.
      let layer = zIndex;
      for (let ancestor = trigger.current?.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const ancestorLayer = Number.parseInt(window.getComputedStyle(ancestor).zIndex, 10);
        if (Number.isFinite(ancestorLayer)) layer = Math.max(layer, ancestorLayer + 1);
      }
      setPosition({ ...workspacePortalThemeStyle(trigger.current), position: 'fixed', width,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        ...(above ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
        maxHeight: Math.max(80, (above ? rect.top : window.innerHeight - rect.bottom) - 20), zIndex: layer });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [visible, zIndex]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) { setOpen(false); setHover(false); }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); setHover(false); }
    };
    document.addEventListener('mousedown', dismiss);
    window.addEventListener('keydown', escape, true);
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { document.removeEventListener('mousedown', dismiss); window.removeEventListener('keydown', escape, true); };
  }, [open]);

  const target = visible ? document.body : null;
  return <>
    <Button ref={trigger} variant="ghost" size="icon" className={styles.trigger}
      aria-label={`${t('settings.codexUsage').replace('Codex', provider === 'claude' ? 'Claude' : 'Codex')}: ${summary}`} aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? id : undefined} aria-describedby={!open && hover ? id : undefined}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)} onBlur={() => setHover(false)}
      onClick={() => { setOpen(value => !value); setHover(false); if (!open && !state.busy) state.refresh(); }}>
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" className={remaining === null ? styles.unknown : undefined}>
        <circle cx="10" cy="10" r="8" className={styles.track} />
        {remaining !== null ? <circle cx="10" cy="10" r="8" pathLength="100" strokeDasharray="100"
          strokeDashoffset={100 - remaining} transform="rotate(-90 10 10)" className={styles.fill} /> : <circle cx="10" cy="10" r="1" fill="currentColor" />}
      </svg>
    </Button>
    {target ? createPortal(<div className="pixflow-design-portal-scope">
      <div ref={panel} id={id} role={open ? 'dialog' : 'tooltip'} aria-label={open ? t('settings.codexUsage').replace('Codex', provider === 'claude' ? 'Claude' : 'Codex') : undefined}
      className={`${styles.panel}${open ? '' : ` ${styles.tooltip}`}`} style={{ ...position, color: open ? 'var(--text)' : 'var(--text-strong)' }}>
      {open ? <CodexUsageDetails state={state} /> : <div className={styles.preview}>
        <strong>{t('settings.codexUsage').replace('Codex', provider === 'claude' ? 'Claude' : 'Codex')}</strong>
        {windows.length ? windows.map((window, index) => <div key={index}>
          <span>{window.bucket !== 'codex' && window.bucket !== 'claude' ? `${window.bucket} · ` : ''}{new Intl.NumberFormat(locale, { style: 'unit', unit: window.durationMinutes % 1440 === 0 ? 'day' : window.durationMinutes % 60 === 0 ? 'hour' : 'minute', unitDisplay: 'long' }).format(window.durationMinutes / (window.durationMinutes % 1440 === 0 ? 1440 : window.durationMinutes % 60 === 0 ? 60 : 1))}</span>
          <span>{t('settings.usageRemaining', { value: percent(window.remainingPercent) })}</span>
          {window.resetsAt ? <small>{t('settings.usageResets', { value: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(window.resetsAt * 1000) })}</small> : null}
        </div>) : <span>{summary}</span>}
      </div>}
    </div></div>, target) : null}
  </>;
}



