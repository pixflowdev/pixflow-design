import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import { IconAlertCircle, IconArrowUpRight, IconCheck, IconChevronDown, IconHelpCircle, IconPlus, IconRefresh, IconSearch, IconX } from '@tabler/icons-react';
import type { PixflowBuilderId, PixflowBuilderDestination, PixflowBuilderDestinationList, PixflowBuilderDestinationRequest } from '@open-design/contracts';
import { useT } from '../i18n';
import { randomUUID } from '../utils/uuid';
import { builderEditorWindowName, listBuilderDestinations, prepareBuilderDestination, safeBuilderEditorUrl } from '../pixflow/builder-destinations';
import { workspacePortalTarget, workspacePortalThemeStyle } from './workspacePortalTarget';
import { CustomSelect } from './CustomSelect';
import styles from './BuilderDestinationControl.module.css';

export type BuilderDestinationBuildStatus = 'opening' | 'connecting' | 'delayed' | 'building' | 'awaiting_input' | 'completed' | 'failed' | 'uncertain';
export type BuilderDestinationBuildResult = { destination: PixflowBuilderDestination; editorUrl: string };
type Props = {
  chatId: string; disabled?: boolean; open: boolean; onOpenChange: (open: boolean) => void;
  destination?: PixflowBuilderDestination | null; onDestination: (destination: PixflowBuilderDestination) => void;
  buildBrief?: string;
  defaultPageTitle?: string;
  onBuild?: (request: PixflowBuilderDestinationRequest, brief: string, requestId: string) => Promise<BuilderDestinationBuildResult>;
  buildStatus?: BuilderDestinationBuildStatus;
  buildError?: string;
  buildEditorUrl?: string;
  buildReceiptBrief?: string;
  onRetryBuild?: () => Promise<BuilderDestinationBuildResult>;
  onNewBuild?: () => void;
  /** Fresh server receipt for the current submitted user turn, never chat history. */
  autoOpenReceiptId?: string | null;
};
/** The key isolates both pending requests and selections when the active chat changes. */
export function BuilderDestinationControl(props: Props) { return <DestinationControl key={props.chatId} {...props} />; }
function DestinationControl({ disabled, open, onOpenChange, destination, onDestination, buildBrief, defaultPageTitle, onBuild, buildStatus, buildError, buildEditorUrl, onRetryBuild, onNewBuild, autoOpenReceiptId }: Props) {
  const t = useT();
  const heading = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pagePicker = useRef<HTMLDivElement>(null);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const portalTarget = useRef(workspacePortalTarget());
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const pendingWindow = useRef<Window | null>(null);
  const pendingWindowOwned = useRef(false);
  const editorWindow = useRef<{ window: Window; name?: string } | null>(null);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const openedAgentReceipt = useRef<string|null>(null);
  const [builder, setBuilder] = useState<PixflowBuilderId | undefined>();
  const [mode, setMode] = useState<'create' | 'open'>('create');
  const brief = buildBrief ?? '';
  const pageTitle = Array.from(defaultPageTitle?.trim() || t('builderDestination.untitledPage')).slice(0, 200).join('');
  const briefOversized = new TextEncoder().encode(brief.trim()).byteLength > 65536;
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [postId, setPostId] = useState<number | null>(null);
  const [catalogue, setCatalogue] = useState<PixflowBuilderDestinationList | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<PixflowBuilderDestination | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [preparedEditorUrl, setPreparedEditorUrl] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const safeDestination = destination && safeBuilderEditorUrl(buildEditorUrl || destination.editorUrl);
  const builderLabels: Record<PixflowBuilderId, string> = { gutenberg: 'Gutenberg', bricks: 'Bricks', etch: 'Etch', elementor: 'Elementor' };
  const builderName = destination ? builderLabels[destination.builder] : '';
  const queryBuilder = mode === 'open' ? builder : undefined;
  const querySearch = mode === 'open' ? debouncedSearch : '';
  const waiting = loading || (mode === 'open' && search !== debouncedSearch);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; closePendingWindow(); }; }, []);
  useEffect(() => {
    if (!autoOpenReceiptId || openedAgentReceipt.current === autoOpenReceiptId || !destination || !buildEditorUrl) return;
    const href = safeBuilderEditorUrl(buildEditorUrl);
    if (!href) return;
    openedAgentReceipt.current = autoOpenReceiptId;
    setResult(destination); setPreparedEditorUrl(href);
    // Agent tool completion is not a browser gesture. Attempt the same named
    // editor tab once, then expose the existing Open editor recovery action.
    reserveEditorWindow(href);
    setBlocked(!showEditorWindow(href));
    onOpenChange(true);
  }, [autoOpenReceiptId, buildEditorUrl, destination, onOpenChange]);
  useLayoutEffect(() => {
    if (dialog.current) dialog.current.inert = !open;
    if (!open) { setPagesOpen(false); return; }
    const updatePosition = () => {
      if (!anchor.current || !dialog.current) return;
      const rect = anchor.current.getBoundingClientRect();
      const panel = { width: dialog.current.offsetWidth, height: dialog.current.offsetHeight };
      const gap = 8, pad = 12;
      const below = window.innerHeight - rect.bottom - pad;
      const top = below >= panel.height || below >= rect.top - pad
        ? rect.bottom + gap : rect.top - panel.height - gap;
      setPosition({
        top: Math.max(pad, Math.min(top, window.innerHeight - panel.height - pad)),
        left: Math.max(pad, Math.min(rect.right - panel.width, window.innerWidth - panel.width - pad)),
      });
    };
    updatePosition();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updatePosition) : null;
    if (dialog.current) observer?.observe(dialog.current);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => { observer?.disconnect(); window.removeEventListener('resize', updatePosition); window.removeEventListener('scroll', updatePosition, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    if (!buildStatus) {
      if (result) request.current = null;
      setResult(null); setBlocked(false); setPreparedEditorUrl(null);
    }
    dialog.current?.focus({ preventScroll: true });
    const outside = (event: MouseEvent) => {
      const node = event.target as Node;
      if (!dialog.current?.contains(node) && !anchor.current?.contains(node) && !busyRef.current) onOpenChange(false);
      if (!pagePicker.current?.contains(node)) setPagesOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    void listBuilderDestinations(queryBuilder, querySearch, controller.signal).then(data => {
      if (!controller.signal.aborted) { setCatalogue(data); setLoading(false); }
    }).catch(cause => { if (!controller.signal.aborted) { setCatalogue(null); setError(cause instanceof Error ? cause.message : String(cause)); setLoading(false); } });
    return () => controller.abort();
  }, [open, queryBuilder, querySearch, attempt]);
  function closePendingWindow() {
    if (pendingWindowOwned.current) pendingWindow.current?.close();
    pendingWindow.current = null; pendingWindowOwned.current = false;
  }
  function reserveEditorWindow(href?: string) {
    const name = href ? builderEditorWindowName(href) : undefined;
    const known = editorWindow.current;
    if (name && known?.name === name && !known.window.closed) {
      pendingWindow.current = known.window; pendingWindowOwned.current = false; return;
    }
    try {
      const next = window.open(name ? '' : 'about:blank', name || '_blank');
      pendingWindow.current = next;
      pendingWindowOwned.current = !!next && (!name || next.location.href === 'about:blank');
      if (next) next.opener = null;
    } catch {
      // A reused tab may have moved to another origin. Never redirect or close it.
      pendingWindow.current = null; pendingWindowOwned.current = false;
    }
  }
  function showEditorWindow(href: string): boolean {
    const name = builderEditorWindowName(href);
    const known = editorWindow.current;
    if (name && known?.name === name && !known.window.closed) {
      if (pendingWindow.current !== known.window) closePendingWindow();
      else { pendingWindow.current = null; pendingWindowOwned.current = false; }
      known.window.focus();
      return true;
    }
    const next = pendingWindow.current;
    if (!next || next.closed) { closePendingWindow(); return false; }
    try {
      if (name) next.name = name;
      if (pendingWindowOwned.current) next.location.replace(href);
      next.focus();
      editorWindow.current = { window: next, name };
      pendingWindow.current = null; pendingWindowOwned.current = false;
      return true;
    } catch { closePendingWindow(); return false; }
  }
  function openEditor(href: string) {
    reserveEditorWindow(href);
    setBlocked(!showEditorWindow(href));
  }
  function dismiss() { if (!busyRef.current) { onOpenChange(false); trigger.current?.focus(); } }
  function edit() { setResult(null); setError(''); setBlocked(false); }
  async function submit() {
    if (busyRef.current || disabled || !builder || !catalogue?.builders.find(item => item.id === builder)?.available) return;
    if ((mode === 'create' ? !pageTitle : !postId) || (onBuild && (!brief.trim() || briefOversized))) return;
    busyRef.current = true; setBusy(true); setError('');
    // Reserve a tab during the user gesture. A denied popup never causes a second page creation.
    reserveEditorWindow();
    const fingerprint = `${mode}:${builder}:${mode === 'create' ? pageTitle : postId}`;
    if (!request.current || request.current.fingerprint !== fingerprint) request.current = { fingerprint, id: randomUUID() };
    try {
      const destinationRequest: PixflowBuilderDestinationRequest = mode === 'create'
        ? { action: 'create', builder, title: pageTitle, requestId: request.current.id }
        : { action: 'open', builder, postId: postId! };
      const response = onBuild
        ? await onBuild(destinationRequest, brief.trim(), request.current.id)
        : await prepareBuilderDestination(destinationRequest);
      if (!mounted.current) return;
      const href = safeBuilderEditorUrl('editorUrl' in response ? response.editorUrl : response.destination.editorUrl);
      if (!href) throw new Error(t('builderDestination.invalidUrl'));
      setResult(response.destination); setPreparedEditorUrl(href); onDestination(response.destination);
      setBlocked(!showEditorWindow(href));
    } catch (cause) { closePendingWindow(); if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  async function retryBuild() {
    if (!onRetryBuild || retrying || busyRef.current) return;
    busyRef.current = true; setRetrying(true); setError('');
    reserveEditorWindow(buildEditorUrl || preparedEditorUrl || undefined);
    try {
      const response = await onRetryBuild();
      if (!mounted.current) return;
      const href = safeBuilderEditorUrl(response.editorUrl);
      if (!href) throw new Error(t('builderDestination.invalidUrl'));
      setResult(response.destination); setPreparedEditorUrl(href); onDestination(response.destination);
      setBlocked(!showEditorWindow(href));
    } catch (cause) { closePendingWindow(); if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { busyRef.current = false; if (mounted.current) setRetrying(false); }
  }
  const statusKey = buildStatus === 'failed' ? 'builderDestination.buildFailed'
    : buildStatus === 'uncertain' ? 'builderDestination.uncertain'
      : buildStatus === 'awaiting_input' ? 'builderDestination.awaitingInput'
        : buildStatus === 'completed' ? 'builderDestination.completed'
        : buildStatus === 'building' ? 'builderDestination.building'
          : buildStatus === 'opening' ? 'builderDestination.opening' : 'builderDestination.connecting';
  function prepareAnotherBuild() {
    if (!onNewBuild || busyRef.current || retrying) return;
    onNewBuild();
    request.current = null;
    setResult(null); setPreparedEditorUrl(null); setBlocked(false); setError('');
    setBuilder(undefined); setMode('create'); setPostId(null); setSearch('');
  }
  const displayedResult = result ?? (!busy && buildStatus && buildEditorUrl ? destination : null);
  const resultUrl = displayedResult && safeBuilderEditorUrl(buildEditorUrl || preparedEditorUrl || displayedResult.editorUrl);
  const selectedAvailable = !!catalogue?.builders.find(item => item.id === builder)?.available;
  const canSubmit = selectedAvailable && !waiting && !busy && !disabled && (mode === 'create' ? !!pageTitle : !!postId) && (!onBuild || (!!brief.trim() && !briefOversized));
  return <span ref={anchor} className={styles.control}>
    {safeDestination && <a className={styles.openLink} href={safeDestination} target={builderEditorWindowName(safeDestination) || '_blank'} rel="noopener noreferrer" title={destination.title} onClick={event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); openEditor(safeDestination);
    }}>{t('builderDestination.openIn', { builder: builderName })}<IconArrowUpRight size={14} stroke={1.5} /></a>}
    <Button ref={trigger} variant="subtle" className={styles.trigger} disabled={disabled} aria-haspopup="dialog" aria-controls={heading} aria-expanded={open} onClick={() => onOpenChange(!open)}>
      {t('builderDestination.handoffToBuilder')}
    </Button>
    {buildStatus && <span className={styles.headerStatus} title={t(statusKey)} role="status" aria-live="polite">{t(statusKey)}</span>}
    {createPortal(<div ref={dialog} id={heading} role="dialog" aria-modal="false" aria-label={t('builderDestination.handoffToBuilder')} aria-hidden={!open} tabIndex={-1}
      className={`${styles.popout} ${open ? styles.isOpen : ''}`} style={{ ...(anchor.current && portalTarget.current?.contains(anchor.current) ? {} : workspacePortalThemeStyle(anchor.current)), ...position }}
      onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); if (pagesOpen) setPagesOpen(false); else dismiss(); } }}>
      <header className={styles.header}><span>{t('builderDestination.handoffToBuilder')}</span><Button variant="ghost" className={styles.close} aria-label={t('common.close')} disabled={busy || retrying} onClick={dismiss}><IconX size={16} stroke={1.5} /></Button></header>
      <div className={styles.body}>
        {displayedResult && resultUrl ? <div>
          <div className={styles.resultSummary}>
            <span className={styles.resultBuilder}>{builderLabels[displayedResult.builder]}</span>
            <h3 className={styles.resultTitle}>{displayedResult.title}</h3>
            <p className={styles.resultStatus} role="status">
              <span className={styles.statusIcon} aria-hidden="true">{onBuild && (buildStatus === 'opening' || buildStatus === 'connecting' || buildStatus === 'delayed' || buildStatus === 'building') ? <span className={styles.spinner} /> : buildStatus === 'awaiting_input' ? <IconHelpCircle size={14} stroke={1.5} /> : (buildStatus === 'failed' || buildStatus === 'uncertain') ? <IconAlertCircle size={14} stroke={1.5} /> : <IconCheck size={14} stroke={1.5} />}</span>
              <span>{t(onBuild ? statusKey : 'builderDestination.prepared')}</span>
            </p>
          </div>
          {blocked && <p className={styles.note}>{t('builderDestination.blocked')}</p>}
          <div className={styles.resultActions}><a className={styles.resultAction} href={resultUrl} target={builderEditorWindowName(resultUrl) || '_blank'} rel="noopener noreferrer" onClick={event => {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault(); openEditor(resultUrl);
          }}><IconArrowUpRight size={16} stroke={1.5} /><span>{t('builderDestination.openEditor')}</span></a>
          {(buildStatus === 'failed' || buildStatus === 'uncertain' || buildStatus === 'delayed') && onRetryBuild && <Button variant="ghost" className={styles.resultAction} disabled={retrying} onClick={() => void retryBuild()}><IconRefresh size={16} stroke={1.5} /><span>{t(retrying ? 'common.loading' : 'builderDestination.retryBuild')}</span></Button>}</div>
        </div> : <>
          <CustomSelect key={String(open)} ariaLabel={t('builderDestination.editor')} value={builder ?? ''} placeholder={t('builderDestination.editor')} portal={false}
            triggerClassName={styles.selectTrigger} menuClassName={styles.selectMenu} disabled={busy || disabled || !catalogue}
            options={(catalogue?.builders ?? []).map(item => ({ value: item.id, label: item.available ? item.label : `${item.label} : ${item.reason || t('builderDestination.unavailable')}`, disabled: !item.available }))}
            onChange={value => { setBuilder(value as PixflowBuilderId); setPostId(null); setSearch(''); setPagesOpen(false); edit(); }} />
          <div className={styles.tabs} role="group" aria-label={t('builderDestination.destination')}><Button variant="ghost" disabled={busy} aria-pressed={mode === 'create'} onClick={() => { setMode('create'); setPagesOpen(false); edit(); }}>{t('builderDestination.newDraft')}</Button><Button variant="ghost" disabled={busy} aria-pressed={mode === 'open'} onClick={() => { setMode('open'); edit(); }}>{t('builderDestination.existing')}</Button></div>
          {mode === 'open' && <div ref={pagePicker} className={styles.pagePicker}>
            <Button variant="ghost" className={styles.selectTrigger} aria-haspopup="dialog" aria-expanded={pagesOpen} disabled={!builder || busy} onClick={() => setPagesOpen(value => !value)}>
              <span>{catalogue?.pages.find(page => page.postId === postId)?.title || t('builderDestination.existing')}</span><IconChevronDown size={14} stroke={1.5} />
            </Button>
            {pagesOpen && <div className={styles.pageMenu} role="dialog" aria-label={t('builderDestination.existing')}>
              <label className={styles.search}><IconSearch size={15} stroke={1.5} /><input autoFocus aria-label={t('builderDestination.search')} placeholder={t('builderDestination.search')} value={search} onChange={event => { setSearch(event.target.value); setPostId(null); }} /></label>
              <div className={styles.pages}>{waiting ? <p className={styles.loading} role="status"><span className={styles.spinner} />{t('common.loading')}</p> : catalogue?.pages.map(page => <Button key={page.postId} variant="ghost" className={styles.page} aria-pressed={postId === page.postId} onClick={() => { setPostId(page.postId); setPagesOpen(false); pagePicker.current?.querySelector('button')?.focus(); }}><span>{page.title}</span>{postId === page.postId && <IconCheck size={14} stroke={1.5} />}</Button>)}
              {!waiting && !catalogue?.pages.length && <p className={styles.note}>{t('builderDestination.noPages')}</p>}</div>
              {catalogue?.hasMore && <p className={styles.note}>{t('builderDestination.refine')}</p>}
            </div>}
          </div>}
          {onBuild && briefOversized && <p className={styles.error} role="alert">{t('builderDestination.briefTooLong')}</p>}
          {waiting && !pagesOpen && <div className={styles.loading} role="status"><span className={styles.spinner} />{t('common.loading')}</div>}
        </>}
        {(error || buildError) && <div className={styles.error} role="alert"><p>{error || buildError}</p>{!catalogue && <Button variant="ghost" onClick={() => setAttempt(value => value + 1)}>{t('workspaceSidebar.retry')}</Button>}</div>}
        {disabled && <p className={styles.note}>{t('builderDestination.runActive')}</p>}
      </div>
      <footer className={displayedResult ? styles.resultFooter : styles.footer}>{displayedResult && onNewBuild && <Button variant="ghost" className={styles.resultAction} disabled={busy || retrying} onClick={prepareAnotherBuild}><IconPlus size={16} stroke={1.5} /><span>{t('builderDestination.anotherBuild')}</span></Button>}{!displayedResult && <Button className={styles.primary} disabled={!canSubmit} onClick={() => void submit()}>{busy ? t('builderDestination.opening') : t('builderDestination.handoff')}</Button>}</footer>
    </div>, portalTarget.current ?? document.body)}
  </span>;
}
