import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Input } from '@open-design/components';
import type { WorkspaceOrganization, WorkspaceOrganizationAction, WorkspaceProjectGroup } from '@open-design/contracts';
import { IconChevronDown, IconDots, IconFolder, IconFolderPlus, IconPencilPlus, IconPin, IconSearch, IconLayoutSidebar, IconSettings, IconPhoto, IconPalette, IconSitemap, IconHome, IconX } from '@tabler/icons-react';
import type { Project } from '../types';
import type { EntryHomeView } from '../router';
import { useT } from '../i18n';
import { randomUUID } from '../utils/uuid';
import { isWorkspaceDisclosureAction } from '../state/workspace-organization';
import styles from './WorkspaceSidebar.module.css';

export interface WorkspaceSidebarProps {
  chats: Project[];
  activeChatId: string | null;
  pendingProjectId?: string | null;
  activeView?: EntryHomeView;
  helpControl?: ReactNode;
  connectionControl?: ReactNode;
  onClose?: () => void;
  organization: WorkspaceOrganization;
  loading: boolean;
  error: string | null;
  onRetry: () => Promise<unknown>;
  onMutate: (action: WorkspaceOrganizationAction) => Promise<unknown>;
  onOpenChat: (id: string) => void;
  onRenameChat: (id: string, name: string) => Promise<unknown>;
  onNewChat: (projectId: string | null) => void;
  onNavigate: (view: EntryHomeView) => void;
  onSettings: () => void;
  children: ReactNode;
}
type MenuTarget = { kind: 'chat'; item: Project } | { kind: 'project'; item: WorkspaceProjectGroup };
type Editor = { kind: 'create' } | { kind: 'rename' | 'remove'; target: MenuTarget };

/** The sidebar changes organization only. Existing chat IDs, files and conversation routes stay intact. */
export function WorkspaceSidebar({ chats, activeChatId, pendingProjectId, activeView, helpControl, connectionControl, onClose, organization, loading, error, onRetry, onMutate, onOpenChat, onRenameChat, onNewChat, onNavigate, onSettings, children }: WorkspaceSidebarProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<{ target: MenuTarget; top: number; left: number } | null>(null);
  const [moving, setMoving] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [draggedChat, setDraggedChat] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const dropPending = useRef(false);
  const pointerDrag = useRef<{ chatId: string; x: number; y: number; pointerId: number; capture: HTMLElement } | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const suppressDragClick = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const collapsed = organization.sidebarCollapsed;
  const sorted = useMemo(() => chats.filter(chat => chat.metadata?.pixflowInternalProject !== true
    && (chat.metadata as { purpose?: string } | undefined)?.purpose !== 'direct-attachments')
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)), [chats]);
  const groups = organization.projects;
  const filtered = sorted.filter(chat => chat.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const pinnedChats = sorted.filter(chat => organization.chats[chat.id]?.pinned);
  const pinnedGroups = groups.filter(group => group.pinned);
  const looseChats = sorted.filter(chat => !organization.chats[chat.id]?.pinned && !groups.some(group => group.id === organization.chats[chat.id]?.projectId));

  function clearDrag() {
    const pointer = pointerDrag.current; pointerDrag.current = null;
    if (pointer?.capture.hasPointerCapture?.(pointer.pointerId)) pointer.capture.releasePointerCapture(pointer.pointerId);
    dragId.current = null; setDraggedChat(null); setDropTarget(null); setDragPosition(null);
  }
  useEffect(() => {
    if (!draggedChat) return;
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') clearDrag(); };
    document.addEventListener('keydown', cancel);
    window.addEventListener('blur', clearDrag);
    return () => { document.removeEventListener('keydown', cancel); window.removeEventListener('blur', clearDrag); };
  }, [draggedChat]);
  // A drag must originate in this sidebar. Never trust IDs from outside drag payloads.
  function acceptsDrop(projectId: string | null) {
    const id = dragId.current;
    return !busy && !dropPending.current && !!id && sorted.some(chat => chat.id === id)
      && (organization.chats[id]?.projectId ?? null) !== projectId;
  }
  function commitDrop(projectId: string | null) {
    if (!acceptsDrop(projectId)) { clearDrag(); return; }
    const chatId = dragId.current!;
    clearDrag(); dropPending.current = true;
    void perform({ type: 'move-chat', chatId, projectId }).finally(() => { dropPending.current = false; });
  }
  function pointerDestination(x: number, y: number): { projectId: string | null; key: string } | null {
    const element = document.elementFromPoint(x, y);
    const project = element?.closest<HTMLElement>('[data-project-id]');
    if (project && groups.some(group => group.id === project.dataset.projectId)) return { projectId: project.dataset.projectId!, key: `project:${project.dataset.projectId}` };
    return element?.closest('[data-chat-drop-zone="loose"]') ? { projectId: null, key: 'loose-chats' } : null;
  }

  function closeMenu() { setMenu(null); setMoving(false); trigger.current?.focus(); }
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function outside(event: PointerEvent) { if (!menuRef.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setMenu(null); }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') { event.preventDefault(); setMenu(null); trigger.current?.focus(); } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [menu, moving]);
  useEffect(() => { if (editor) dialogRef.current?.showModal(); else dialogRef.current?.close(); }, [editor]);
  async function perform(action: WorkspaceOrganizationAction) {
    const blocksEditing = !isWorkspaceDisclosureAction(action);
    if (blocksEditing) setBusy(true);
    setFailed(false);
    try { await onMutate(action); return true; } catch { setFailed(true); return false; } finally { if (blocksEditing) setBusy(false); }
  }
  function openMenu(target: MenuTarget, button: HTMLButtonElement) {
    const rect = button.getBoundingClientRect(); trigger.current = button; setMoving(false);
    setMenu({ target, top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 300)), left: Math.max(8, Math.min(rect.left, window.innerWidth - 240)) });
  }
  function edit(next: Editor) { setName(next.kind === 'create' ? '' : next.target.item.name); setEditor(next); setMenu(null); setFailed(false); }
  async function save() {
    if (!editor || busy || (editor.kind !== 'remove' && !name.trim())) return;
    let success = false;
    if (editor.kind === 'create') success = await perform({ type: 'create-project', id: randomUUID(), name: name.trim() });
    else if (editor.kind === 'remove') success = await perform({ type: 'delete-project', id: editor.target.item.id });
    else if (editor.target.kind === 'project') success = await perform({ type: 'rename-project', id: editor.target.item.id, name: name.trim() });
    else {
      setBusy(true); setFailed(false);
      try { await onRenameChat(editor.target.item.id, name.trim()); success = true; } catch { setFailed(true); } finally { setBusy(false); }
    }
    if (success) { setEditor(null); trigger.current?.focus(); }
  }
  function actions(target: MenuTarget) {
    return <Button variant="ghost" size="icon" className={styles.actions} aria-label={`${t(target.kind === 'chat' ? 'workspaceSidebar.chatActions' : 'workspaceSidebar.projectActions')}: ${target.item.name}`} aria-haspopup="menu" aria-expanded={menu?.target.item.id === target.item.id} onClick={event => openMenu(target, event.currentTarget)}><IconDots size={16} stroke={1.6} /></Button>;
  }
  function chatRow(chat: Project) {
    return <div className={styles.row} data-active={activeChatId === chat.id} key={chat.id} data-chat-id={chat.id}
      draggable={false} data-dragging={draggedChat === chat.id}
      onPointerDown={event => {
        if (event.button !== 0 || event.pointerType === 'touch' || busy || dropPending.current) return;
        const button = (event.target as Element).closest<HTMLButtonElement>('button');
        if (!button || button.getAttribute('aria-haspopup') === 'menu') return;
        pointerDrag.current = { chatId: chat.id, x: event.clientX, y: event.clientY, pointerId: event.pointerId, capture: button };
        button.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={event => {
        const pointer = pointerDrag.current;
        if (!pointer || pointer.pointerId !== event.pointerId) return;
        if (!dragId.current && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 6) return;
        event.preventDefault(); dragId.current = pointer.chatId; setDraggedChat(pointer.chatId); setMenu(null);
        setDragPosition({ x: Math.min(event.clientX + 12, window.innerWidth - 240), y: event.clientY + 12 });
        const destination = pointerDestination(event.clientX, event.clientY);
        setDropTarget(destination && acceptsDrop(destination.projectId) ? destination.key : null);
      }}
      onPointerUp={event => {
        if (!pointerDrag.current || pointerDrag.current.pointerId !== event.pointerId) return;
        if (!dragId.current) { clearDrag(); return; }
        suppressDragClick.current = true;
        const destination = pointerDestination(event.clientX, event.clientY);
        if (destination) commitDrop(destination.projectId); else clearDrag();
        setTimeout(() => { suppressDragClick.current = false; }, 0);
      }} onPointerCancel={clearDrag}
      onClickCapture={event => { if (suppressDragClick.current) { event.preventDefault(); event.stopPropagation(); } }}
>
      <Button variant="ghost" className={styles.rowMain} draggable={false} onClick={() => onOpenChat(chat.id)} aria-current={activeChatId === chat.id ? 'page' : undefined} title={chat.name}><span>{chat.name}</span></Button>
      {actions({ kind: 'chat', item: chat })}
    </div>;
  }
  function groupRow(group: WorkspaceProjectGroup) {
    const members = sorted.filter(chat => organization.chats[chat.id]?.projectId === group.id && !organization.chats[chat.id]?.pinned);
    return <div key={group.id} className={styles.group} data-project-id={group.id} data-drop-target={dropTarget === `project:${group.id}`}>
      <div className={styles.row}>
        <Button variant="ghost" className={styles.rowMain} aria-expanded={!group.collapsed} onClick={() => void perform({ type: 'collapse-project', id: group.id, collapsed: !group.collapsed })} title={group.name}>
          <span className={styles.folderIcon} aria-hidden="true"><IconFolder size={16} stroke={1.6} /><IconChevronDown size={14} stroke={1.6} className={styles.chevron} data-closed={group.collapsed} /></span><span>{group.name}</span>
        </Button>{actions({ kind: 'project', item: group })}
      </div>
      <div className={styles.disclosure} data-open={!group.collapsed} {...(group.collapsed ? { inert: '' } as Record<string, string> : {})} aria-hidden={group.collapsed || undefined}>
        <div className={styles.disclosureInner}><div className={styles.members}>{members.map(chatRow)}{!members.length && <p className={styles.empty}>{t('workspaceSidebar.emptyProject')}</p>}</div></div>
      </div>
    </div>;
  }
  function section(key: 'pinned' | 'projects' | 'chats', content: ReactNode) {
    const closed = organization.collapsedSections?.[key] === true;
    return <section className={styles.section} aria-label={t(`workspaceSidebar.${key}`)}>
      <div className={styles.sectionHead}><Button variant="ghost" className={styles.sectionToggle} aria-expanded={!closed} onClick={() => void perform({ type: 'collapse-section', section: key, collapsed: !closed })}><span>{t(`workspaceSidebar.${key}`)}</span><IconChevronDown size={14} stroke={1.6} className={styles.chevron} data-closed={closed} /></Button>
        {key === 'projects' && <Button variant="ghost" size="icon" className={styles.sectionAdd} aria-label={t('workspaceSidebar.newProject')} onClick={event => { trigger.current = event.currentTarget; edit({ kind: 'create' }); }}><IconFolderPlus size={15} stroke={1.6} /></Button>}
      </div>
      <div className={styles.disclosure} data-open={!closed} {...(closed ? { inert: '' } as Record<string, string> : {})} aria-hidden={closed || undefined}><div className={styles.disclosureInner}>{content}</div></div>
    </section>;
  }
  return <div className={styles.layout} data-collapsed={collapsed}>
    <header className={styles.toolbar}>
      <Button variant="ghost" size="icon" className={styles.collapse} title={t(collapsed ? 'entry.navExpand' : 'entry.navCollapse')} aria-label={t(collapsed ? 'entry.navExpand' : 'entry.navCollapse')} aria-expanded={!collapsed} onClick={() => void perform({ type: 'collapse-sidebar', collapsed: !collapsed })}><IconLayoutSidebar size={19} stroke={1.6} /></Button>
      <div className={styles.toolbarActions}>{connectionControl}{onClose && <Button variant="ghost" size="icon" aria-label={t('ui.workspaceTabsBar.closeWorkspace')} title={t('ui.workspaceTabsBar.closeWorkspace')} onClick={onClose}><IconX size={18} stroke={1.6} /></Button>}</div>
    </header>
    <nav className={styles.rail} aria-label={t('workspaceSidebar.title')}>
      <Button variant="ghost" className={styles.destination} title={t('entry.navHome')} aria-label={t('entry.navHome')} aria-current={activeView === 'home' ? 'page' : undefined} onClick={() => onNavigate('home')}><IconHome size={19} stroke={1.6} /></Button>
      <Button variant="ghost" className={styles.destination} title={t('workspaceSidebar.newChat')} aria-label={t('workspaceSidebar.newChat')} onClick={() => onNewChat(null)}><IconPencilPlus size={19} stroke={1.6} /></Button>
      {([{ view: 'media', label: 'entry.navMedia', Icon: IconPhoto }, { view: 'sitemap', label: 'entry.navSitemap', Icon: IconSitemap }, { view: 'design-systems', label: 'entry.navDesignSystems', Icon: IconPalette }] as const).map(item => <Button variant="ghost" className={styles.destination} key={item.view} title={t(item.label)} aria-label={t(item.label)} aria-current={activeView === item.view ? 'page' : undefined} onClick={() => onNavigate(item.view)}><item.Icon size={19} stroke={1.6} /></Button>)}
      <Button variant="ghost" className={`${styles.destination} ${styles.settings}`} title={t('entry.openSettingsAria')} aria-label={t('entry.openSettingsAria')} onClick={onSettings}><IconSettings size={19} stroke={1.6} /></Button>
      {helpControl}
    </nav>
    <aside className={styles.sidebar} aria-label={t('workspaceSidebar.chats')} aria-hidden={collapsed || undefined} {...(collapsed ? { inert: '' } as Record<string, string> : {})}>
      <div className={styles.sidebarInner}>
      <label className={styles.search}><IconSearch size={16} stroke={1.6} /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('workspaceSidebar.search')} aria-label={t('workspaceSidebar.search')} /></label>
      <div className={styles.scroll}>
        {(error || failed) && !editor && <div className={styles.error} role="alert"><span>{t(failed ? 'workspaceSidebar.saveError' : 'workspaceSidebar.loadError')}</span><Button variant="ghost" onClick={() => { setFailed(false); void onRetry().catch(() => setFailed(true)); }}>{t('workspaceSidebar.retry')}</Button></div>}
        {loading ? <p className={styles.empty} role="status">{t('common.loading')}</p> : query.trim() ? <section aria-label={t('workspaceSidebar.search')}>{filtered.length ? filtered.map(chatRow) : <p className={styles.empty}>{t('workspaceSidebar.searchEmpty')}</p>}</section> : <>
          {section('pinned', <>{pinnedGroups.map(groupRow)}{pinnedChats.map(chatRow)}{!pinnedGroups.length && !pinnedChats.length && <p className={styles.empty}>{t('workspaceSidebar.emptyPinned')}</p>}</>)}
          {section('projects', <>{groups.filter(group => !group.pinned).map(groupRow)}{!groups.filter(group => !group.pinned).length && <p className={styles.empty}>{t('workspaceSidebar.emptyProjects')}</p>}</>)}
          <div className={styles.group} data-chat-drop-zone="loose" data-drop-target={dropTarget === 'loose-chats'}>{section('chats', <>{looseChats.map(chatRow)}{!looseChats.length && <p className={styles.empty}>{t('workspaceSidebar.emptyChats')}</p>}</>)}</div>
        </>}
      </div>
      </div>
    </aside>
    {dragPosition && draggedChat && <div className={styles.dragPreview} aria-hidden="true" style={{ left: dragPosition.x, top: dragPosition.y }}>{sorted.find(chat => chat.id === draggedChat)?.name}</div>}
    <div className={styles.content}>
      {pendingProjectId && groups.some(group => group.id === pendingProjectId) && <div className={styles.projectContext}><IconFolder size={15} stroke={1.6} /><span>{t('workspaceSidebar.newChatIn', { name: groups.find(group => group.id === pendingProjectId)!.name })}</span></div>}
      <div className={styles.page}>{children}</div>
    </div>
    {menu && <div ref={menuRef} className={styles.menu} role="menu" style={{ top: menu.top, left: menu.left, maxHeight: `min(340px, calc(100dvh - ${menu.top + 8}px))` }} onKeyDown={event => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault(); const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]; const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }}>
      {moving && menu.target.kind === 'chat' ? <><span className={styles.menuLabel}>{t('workspaceSidebar.moveTo')}</span>{[{ id: null, name: t('workspaceSidebar.noProject') }, ...groups].map(group => <Button role="menuitem" variant="ghost" key={group.id ?? 'none'} disabled={busy} onClick={() => { const chatId = menu.target.item.id; void perform({ type: 'move-chat', chatId, projectId: group.id }).then(ok => { if (ok) closeMenu(); }); }}>{group.name}</Button>)}</> : <>
        {menu.target.kind === 'project' && <Button role="menuitem" variant="ghost" onClick={() => { onNewChat(menu.target.item.id); closeMenu(); }}>{t('workspaceSidebar.newChatIn', { name: menu.target.item.name })}</Button>}
        <Button role="menuitem" variant="ghost" disabled={busy} onClick={() => { const target = menu.target; void perform(target.kind === 'chat' ? { type: 'pin-chat', chatId: target.item.id, pinned: !organization.chats[target.item.id]?.pinned } : { type: 'pin-project', id: target.item.id, pinned: !target.item.pinned }).then(ok => { if (ok) closeMenu(); }); }}><IconPin size={15} stroke={1.6} />{t((menu.target.kind === 'chat' ? organization.chats[menu.target.item.id]?.pinned : menu.target.item.pinned) ? 'workspaceSidebar.unpin' : 'workspaceSidebar.pin')}</Button>
        <Button role="menuitem" variant="ghost" onClick={() => edit({ kind: 'rename', target: menu.target })}>{t('common.rename')}</Button>
        {menu.target.kind === 'chat' ? <Button role="menuitem" variant="ghost" onClick={() => setMoving(true)}>{t('workspaceSidebar.moveTo')}</Button> : <Button role="menuitem" variant="ghost" onClick={() => edit({ kind: 'remove', target: menu.target })}>{t('workspaceSidebar.removeProject')}</Button>}
      </>}
    </div>}
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId} onCancel={event => { if (busy) event.preventDefault(); else setEditor(null); }}>
      {editor && <form onSubmit={event => { event.preventDefault(); void save(); }}><h2 id={titleId}>{t(editor.kind === 'create' ? 'workspaceSidebar.newProject' : editor.kind === 'remove' ? 'workspaceSidebar.removeProject' : 'common.rename')}</h2>
        {editor.kind === 'remove' ? <p>{t('workspaceSidebar.removeProjectNote')}</p> : <Input autoFocus aria-label={t(editor.kind === 'rename' && editor.target.kind === 'chat' ? 'workspaceSidebar.chatName' : 'workspaceSidebar.projectName')} value={name} maxLength={100} onChange={event => setName(event.target.value)} />}
        {failed && <p role="alert">{t('workspaceSidebar.saveError')}</p>}
        <div className={styles.dialogActions}><Button variant="ghost" disabled={busy} onClick={() => { setEditor(null); trigger.current?.focus(); }}>{t('common.cancel')}</Button><Button type="submit" disabled={busy || (editor.kind !== 'remove' && !name.trim())}>{t(editor.kind === 'remove' ? 'workspaceSidebar.removeProject' : 'common.save')}</Button></div>
      </form>}
    </dialog>
  </div>;
}
