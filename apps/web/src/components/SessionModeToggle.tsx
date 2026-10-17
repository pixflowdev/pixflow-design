import { useCallback, useEffect, useLayoutEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ChatSessionMode } from '@open-design/contracts';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { workspacePortalTarget, workspacePortalThemeStyle } from './workspacePortalTarget';
import styles from './SessionModeToggle.module.css';
import { hasPixflowWordPressContext } from '../pixflow/wordpress-context';
import { ChangeReviewPreference } from '../pixflow/ChangeReviewPreference';

interface Props {
  mode: ChatSessionMode;
  onChange?: (mode: ChatSessionMode) => void;
  disabled?: boolean;
  menuExtra?: ReactNode;
  preferencesOnly?: boolean;
}

const MODE_META: Array<{
  mode: ChatSessionMode;
  icon: 'comment' | 'file' | 'sparkles';
  labelKey: ModeCopyKey;
  titleKey: ModeCopyKey;
  summaryKey: ModeCopyKey;
  solvesKey: ModeCopyKey;
  queryKeys: [ModeCopyKey, ModeCopyKey, ModeCopyKey];
}> = [
  {
    mode: 'chat',
    icon: 'comment',
    labelKey: 'chat.mode.chat.label',
    titleKey: 'chat.mode.chat.title',
    summaryKey: 'chat.mode.chat.summary',
    solvesKey: 'chat.mode.chat.solves',
    queryKeys: ['chat.mode.chat.query1', 'chat.mode.chat.query2', 'chat.mode.chat.query3'],
  },
  {
    mode: 'plan',
    icon: 'file',
    labelKey: 'chat.mode.plan.label',
    titleKey: 'chat.mode.plan.title',
    summaryKey: 'chat.mode.plan.summary',
    solvesKey: 'chat.mode.plan.solves',
    queryKeys: ['chat.mode.plan.query1', 'chat.mode.plan.query2', 'chat.mode.plan.query3'],
  },
  {
    mode: 'design',
    icon: 'sparkles',
    labelKey: 'chat.mode.design.label',
    titleKey: 'chat.mode.design.title',
    summaryKey: 'chat.mode.design.summary',
    solvesKey: 'chat.mode.design.solves',
    queryKeys: ['chat.mode.design.query1', 'chat.mode.design.query2', 'chat.mode.design.query3'],
  },
];

type ModeCopyKey =
  | 'chat.mode.chat.label'
  | 'chat.mode.chat.title'
  | 'chat.mode.chat.summary'
  | 'chat.mode.chat.solves'
  | 'chat.mode.chat.query1'
  | 'chat.mode.chat.query2'
  | 'chat.mode.chat.query3'
  | 'chat.mode.plan.label'
  | 'chat.mode.plan.title'
  | 'chat.mode.plan.summary'
  | 'chat.mode.plan.solves'
  | 'chat.mode.plan.query1'
  | 'chat.mode.plan.query2'
  | 'chat.mode.plan.query3'
  | 'chat.mode.design.label'
  | 'chat.mode.design.title'
  | 'chat.mode.design.summary'
  | 'chat.mode.design.solves'
  | 'chat.mode.design.query1'
  | 'chat.mode.design.query2'
  | 'chat.mode.design.query3';

interface ModeView {
  mode: ChatSessionMode;
  icon: 'comment' | 'file' | 'sparkles';
  label: string;
  title: string;
  summary: string;
  solves: string;
  queries: string[];
}

function ModeDescriptionCard({
  item,
  bestForLabel,
  tryLabel,
  className,
  id,
  role,
}: {
  item: ModeView;
  bestForLabel: string;
  tryLabel: string;
  className: string;
  id?: string;
  role?: 'tooltip';
}) {
  return (
    <div className={`session-mode-card ${className}`} id={id} role={role}>
      <div className="session-mode-card__head">
        <span className="session-mode-card__icon" aria-hidden>
          <Icon name={item.icon} size={14} />
        </span>
        <div className="session-mode-card__heading">
          <div className="session-mode-card__title">{item.title}</div>
          <div className="session-mode-card__label">{item.label}</div>
        </div>
      </div>
      <p className="session-mode-card__summary">{item.summary}</p>
      <div className="session-mode-card__section">
        <div className="session-mode-card__section-label">{bestForLabel}</div>
        <p className="session-mode-card__section-text">{item.solves}</p>
      </div>
      <div className="session-mode-card__section">
        <div className="session-mode-card__section-label">{tryLabel}</div>
        <ul className="session-mode-card__queries">
          {item.queries.map((query) => (
            <li key={query} className="session-mode-card__query">
              {query}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SessionModeToggle({ mode, onChange, disabled = false, menuExtra, preferencesOnly = hasPixflowWordPressContext() }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<ChatSessionMode | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  const floating = open && !!rootRef.current?.closest('.pixflow-bricks-agent-shell, .workspace-shell');
  const portalTarget = floating ? workspacePortalTarget(rootRef.current) : null;
  const cardId = useId();
  const modes = MODE_META.map<ModeView>((item) => ({
    mode: item.mode,
    icon: item.icon,
    label: t(item.labelKey),
    title: t(item.titleKey),
    summary: t(item.summaryKey),
    solves: t(item.solvesKey),
    queries: item.queryKeys.map((queryKey) => t(queryKey)),
  }));
  const active = modes.find((item) => item.mode === mode) ?? modes[1]!;
  const preview = modes.find((item) => item.mode === (previewMode ?? mode)) ?? active;
  const disabledState = disabled || (!preferencesOnly && !onChange);
  const showCard = open && !disabledState && !floating && !preferencesOnly;
  const triggerLabel = preferencesOnly ? t('pixflow.styling.label') : active.title;

  const closeMenu = useCallback(() => {
    setOpen(false);
    setPreviewMode(null);
  }, []);

  useLayoutEffect(() => {
    if (!open || !floating) return;
    const updatePosition = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      const popover = popoverRef.current;
      if (!anchor || !popover) return;
      const margin = 12;
      const gap = 6;
      const above = Math.max(0, anchor.top - margin - gap);
      const below = Math.max(0, window.innerHeight - anchor.bottom - margin - gap);
      const openAbove = above >= popover.scrollHeight || above >= below;
      const width = Math.min(preferencesOnly ? 304 : popover.scrollWidth, window.innerWidth - margin * 2);
      setPosition({
        ...workspacePortalThemeStyle(triggerRef.current),
        position: 'fixed',
        left: Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin)),
        width,
        right: 'auto',
        top: openAbove ? 'auto' : anchor.bottom + gap,
        bottom: openAbove ? window.innerHeight - anchor.top + gap : 'auto',
        maxHeight: openAbove ? above : below,
        maxWidth: Math.max(0, window.innerWidth - margin * 2),
        visibility: 'visible',
      });
    };
    updatePosition();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updatePosition) : null;
    if (popoverRef.current) observer?.observe(popoverRef.current);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, floating, preferencesOnly]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node) || popoverRef.current?.contains(event.target as Node)) return;
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { closeMenu(); triggerRef.current?.focus(); }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeMenu, open]);

  const popover = open ? (
        <div ref={popoverRef} className={`session-mode-toggle__popover${floating ? ` ${styles.floating}` : ''}${preferencesOnly ? ` ${styles.preferences}` : ''}`} style={floating ? position : undefined}>
          <div className="session-mode-toggle__menu" role="menu">
            {!preferencesOnly && <div className="session-mode-toggle__options">
              {modes.map((item) => {
                const itemActive = item.mode === mode;
                return (
                  <button key={item.mode} type="button" role="menuitemradio" aria-checked={itemActive}
                    className={`session-mode-toggle__option${itemActive ? ' is-active' : ''}`} aria-label={item.title}
                    onPointerEnter={() => setPreviewMode(item.mode)} onFocus={() => setPreviewMode(item.mode)}
                    onClick={() => { if (!itemActive) onChange?.(item.mode); closeMenu(); }}>
                    <Icon name={item.icon} size={13} />
                    <span className="session-mode-toggle__label">{item.label}</span>
                    <span className="session-mode-toggle__check" aria-hidden>{itemActive ? <Icon name="check" size={13} /> : null}</span>
                  </button>
                );
              })}
            </div>}
            {menuExtra}
            {preferencesOnly && <ChangeReviewPreference />}
          </div>
          {showCard ? <ModeDescriptionCard item={preview} bestForLabel={t('chat.mode.cardBestFor')} tryLabel={t('chat.mode.cardTry')} className="session-mode-toggle__popover-card" id={cardId} role="tooltip" /> : null}
        </div>
      ) : null;

  return (
    <div
      className="session-mode-toggle"
      ref={rootRef}
      onPointerLeave={() => {
        if (!open) setPreviewMode(null);
      }}
      onBlur={(event) => {
        if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget as Node)) return;
        if (!open) setPreviewMode(null);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`session-mode-toggle__trigger od-tooltip${open ? ' is-open' : ''}`}
        disabled={disabledState}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={triggerLabel}
        data-tooltip={triggerLabel}
        data-testid="session-mode-trigger"
        onClick={() => {
          if (open) {
            closeMenu();
            return;
          }
          setOpen(true);
          setPreviewMode(mode);
        }}
      >
        <Icon name={preferencesOnly ? 'sparkles' : active.icon} size={13} />
        <span className="session-mode-toggle__label">{preferencesOnly ? triggerLabel : active.label}</span>
        <Icon name="chevron-down" size={12} />
      </button>
      {portalTarget ? createPortal(popover, portalTarget) : popover}
    </div>
  );
}
