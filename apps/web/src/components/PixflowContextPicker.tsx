import { useT } from '../i18n';
import { externalMcpAvailable } from '../pixflow/external-mcp-contribution';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { WorkspaceContextItem } from '@open-design/contracts';
import type { McpServerConfig } from '@open-design/contracts';
import type { ProjectFile } from '../types';
import { Icon, type IconName } from './Icon';
import { getPixflowWordPressConfig } from '../pixflow/wordpress-context';
import { designSystemBuilder } from '../pixflow/design-system-builder';
import { planningAvailable } from '../pixflow/planning-availability';
import { searchComposerSiteContext } from '../pixflow/composer-context-search';
import styles from './ComposerPicker.module.css';
import local from './PixflowContextPicker.module.css';

type Category = 'files' | 'pages' | 'media' | 'elements' | 'systems';
export type ContextPickerHandle = { key(key: string): boolean };
type Row = { id: string; label: string; detail: string; icon: IconName; color?: string; choose(): void; group?: string };
export const PixflowContextPicker = forwardRef<ContextPickerHandle, {
  query: string; files: Array<Pick<ProjectFile, 'name' | 'path' | 'mime'>>; contexts: WorkspaceContextItem[];
  onFile(path: string): void; onContext(item: WorkspaceContextItem): void;
  onUpload(): void; onClose(): void; onReturn?(): void; onActiveIndex?(index: number): void;
  mcpServers?: McpServerConfig[]; onMcp?(server: McpServerConfig): void; onManageMcp?(): void;
}>(({ query, files, contexts, onFile, onContext, onUpload, onClose, onReturn, onActiveIndex, mcpServers = [], onMcp, onManageMcp }, ref) => {
  const t = useT();
  const config = getPixflowWordPressConfig();
  const bricksActive = config?.bricksIntegrationActive !== false;
  const systemsActive = planningAvailable() && designSystemBuilder() !== null;
  const availableContext = (item: WorkspaceContextItem) => (bricksActive || !item.id.startsWith('bricks-')) && (systemsActive || item.kind !== 'design-system');
  const recentKey = `pixflow:context-references:${config?.siteUrl || config?.restBaseUrl}:${config?.userId || 'current'}`;
  const [recent] = useState<WorkspaceContextItem[]>(()=>{try { const items=JSON.parse(sessionStorage.getItem(recentKey)||'[]'); return Array.isArray(items) ? items.filter(item=>item && typeof item.id==='string' && typeof item.label==='string').slice(0,5) : []; }catch{return [];}});
  const chooseContext = (item: WorkspaceContextItem) => {
    try {sessionStorage.setItem(recentKey,JSON.stringify([item,...recent.filter(entry=>entry.id!==item.id)].slice(0,5)));}catch{/* References remain usable when browser storage is unavailable. */}
    onContext(item);
  };
  const [category, setCategory] = useState<Category | null>(null);
  const [search, setSearch] = useState('');
  const [index, setIndex] = useState(0);
  const [remote, setRemote] = useState<WorkspaceContextItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const q = (category ? search : query).trim().toLowerCase();
  const elements = contexts.filter(item => item.id.startsWith('bricks-selection:') || item.id.startsWith('bricks-element:'));
  const names: Record<Category, string> = {files:t('context.files'),pages:t('context.pages'),media:t('context.media'),elements:t('context.elements'),systems:t('context.systems')};
  const enter = (next: Category) => { setCategory(next); setSearch(''); setIndex(0); };
  useEffect(() => { if (category) input.current?.focus(); }, [category]);
  useEffect(() => { setIndex(0); }, [q, category]);
  useEffect(() => {
    if (category !== 'pages' && category !== 'media' && category !== 'systems') return;
    const abort = new AbortController(); setLoading(true); setError(''); setRemote([]);
    const timer = setTimeout(() => {
      void searchComposerSiteContext(category, search.trim(), abort.signal).then(rows => {
        if (!abort.signal.aborted) setRemote(rows);
      }).catch(err => { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : t('context.loadFailed')); })
        .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    }, 180);
    return () => {clearTimeout(timer); abort.abort();};
  }, [category, search, retry, t]);
  const rows = useMemo(() => {
    const out: Row[] = [];
    const contextRow = (item: WorkspaceContextItem, group?: string): Row => ({id:item.id,label:item.label,detail:(item.title !== item.label ? item.title : '') || item.url || item.path || '',color:item.kind === 'design-system' && /^#[a-f0-9]{6}$/i.test(item.accentColor || '') ? item.accentColor : undefined,icon:item.kind === 'design-system' ? 'palette' : item.id.startsWith('bricks-') && item.kind !== 'browser' ? 'layers-filled' : item.kind === 'file' ? 'image' : 'file',choose:()=>chooseContext(item),group});
    if (!category) {
      const categories: Array<[Category,IconName,string]> = [['files','attach',t('context.filesHint')],['pages','file',t('context.pagesHint')],['media','image',t('context.mediaHint')],['systems','palette',t('context.systemsHint')]];
      if (contexts.some(item=>item.id.startsWith('bricks-'))) categories.push(['elements','layers-filled',t('context.elementsHint')]);
      for (const [id,icon,detail] of categories.filter(([id]) => (bricksActive || id !== 'elements') && (systemsActive || id !== 'systems'))) if (!q || `${names[id]} ${detail}`.toLowerCase().includes(q)) out.push({id,label:names[id],detail,icon,choose:()=>enter(id),group:t('context.browse')});
      for (const item of recent.filter(availableContext).filter(item=>!item.id.startsWith('bricks-element:') && !item.id.startsWith('bricks-selection:') && !contexts.some(current=>current.id===item.id))) if (!q || `${item.label} ${item.title || ''}`.toLowerCase().includes(q)) out.push(contextRow(item,t('context.recent')));
      for (const item of contexts.filter(availableContext).filter(item=>!item.id.startsWith('bricks-element:'))) if (!q || `${item.label} ${item.title || ''}`.toLowerCase().includes(q)) out.push(contextRow(item,t('context.current')));
      for (const server of externalMcpAvailable() ? mcpServers : []) if (!q || `${server.label || ''} ${server.id}`.toLowerCase().includes(q)) out.push({id:`mcp:${server.id}`,label:server.label || server.id,detail:t('context.serverTools'),icon:'link',choose:()=>onMcp?.(server),group:t('context.externalTools')});
    } else if (category === 'files') {
      out.push({id:'upload',label:t('context.upload'),detail:t('context.fromComputer'),icon:'attach',choose:onUpload});
      for (const file of files) if (!q || `${file.name} ${file.path || ''}`.toLowerCase().includes(q)) out.push({id:file.path || file.name,label:file.name,detail:file.path || file.mime || '',icon:'file',choose:()=>onFile(file.path || file.name)});
    } else {
      for (const item of category === 'elements' ? elements : remote) if (category !== 'elements' || !q || `${item.label} ${item.title || ''}`.toLowerCase().includes(q)) out.push(contextRow(item));
    }
    return out;
  }, [category,q,files,contexts,remote,onFile,onContext,onUpload,bricksActive,mcpServers,onMcp,t]);
  const active = Math.min(index, Math.max(0, rows.length-1));
  useEffect(()=>{onActiveIndex?.(active);},[active,onActiveIndex]);
  const key = (value: string) => {
    if (value === 'Escape') { if (category) {setCategory(null);setIndex(0);onReturn?.();} else onClose(); return true; }
    if (value === 'ArrowDown' || value === 'ArrowUp') { if(rows.length) setIndex((active+(value==='ArrowDown'?1:rows.length-1))%rows.length); return true; }
    if (value === 'Enter' || value === 'Tab') { rows[active]?.choose(); return true; }
    return false;
  };
  useImperativeHandle(ref,()=>({key}));
  useEffect(()=> {list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({block:'nearest'});},[active]);
  return <div className={styles.picker} data-testid="pixflow-context-picker">
    <div className={styles.search}>
      {category ? <button type="button" className={local.back} aria-label={t('context.back')} onClick={()=>{setCategory(null);setIndex(0);onReturn?.();}}><Icon name="arrow-left" size={16}/></button> : <span aria-hidden="true">@</span>}
      {category ? <input ref={input} className={local.search} aria-label={t(`context.search.${category}`)} placeholder={t(`context.search.${category}`)} value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(key(e.key)){e.preventDefault();e.stopPropagation();}}} role="combobox" aria-expanded="true" aria-controls="mention-listbox" aria-activedescendant={rows.length ? `mention-opt-${active}` : undefined}/> : <strong>{query || t('context.add')}</strong>}
      <kbd>Esc</kbd>
    </div>
    <div className={styles.results} id="mention-listbox" role="listbox" aria-label={category ? names[category] : t('context.label')} ref={list}>
      {loading && <div className={local.status} role="status">{t('context.searching')}</div>}
      {error && <div className={local.status} role="alert">{error} <button type="button" onClick={()=>setRetry(x=>x+1)}>{t('preview.retry')}</button></div>}
      {!loading && !error && rows.length === 0 && <div className={local.status}>{t('context.noMatches')}</div>}
      {rows.map((row,i)=><div key={row.id} role="presentation">
        {row.group && row.group !== rows[i-1]?.group && <div className={styles.group}>{row.group}</div>}
        <button type="button" role="option" id={`mention-opt-${i}`} aria-selected={i===active} className={`mention-item${i===active?' is-active':''}`} onMouseEnter={()=>setIndex(i)} onMouseDown={e=>e.preventDefault()} onClick={row.choose} title={`${row.label} — ${row.detail}`}>
          <span className={row.color ? local.systemDot : undefined} style={row.color ? { backgroundColor: row.color } : undefined} aria-hidden="true">{!row.color && <Icon name={row.icon} size={16}/>}</span><span className="mention-item-body"><strong>{row.label}</strong><span className="mention-meta mention-meta--desc">{row.detail}</span></span>
        </button>
      </div>)}
    </div>
    <div className={styles.footer}><span><kbd>↑</kbd> <kbd>↓</kbd> {t('chat.pickerNavigate')}</span><span><kbd>↵</kbd> {t('chat.pickerSelect')}</span>{category && <span>{names[category]}</span>}{!category && externalMcpAvailable() && onManageMcp && <button type="button" className={local.manage} onClick={onManageMcp}>{t('context.manageTools')}</button>}</div>
  </div>;
});
