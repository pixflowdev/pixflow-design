import { Empty, EmptyMedia } from '@open-design/components/empty';
import { useT } from '../i18n';
import { useEffect, useRef, useState, type ReactNode, type DragEvent } from 'react';
import { Collapsible } from '@base-ui/react/collapsible';
import { ContextMenu } from '@base-ui/react/context-menu';
import { Menu } from '@base-ui/react/menu';
import { Dialog } from '@base-ui/react/dialog';
import { Switch } from '@base-ui/react/switch';
import { Button, Input } from '@open-design/components';
import type { MediaFolder, MediaFolderChange, MediaFolderInventory, MediaFolderProvider } from '@open-design/contracts';
import { mediaFolders, MediaFoldersError } from '../providers/media-folders';
import { Icon } from './Icon';
import styles from './MediaFolders.module.css';

export interface MediaFolderScope { provider: MediaFolderProvider; folder: number | 'all' }
export const MEDIA_DRAG_TYPE='application/x-pixflow-media';
const FOLDER_DRAG_TYPE='application/x-pixflow-folder';
type Sort='default'|'nameAsc'|'nameDesc'|'count';
const sorts:Sort[]=['default','nameAsc','nameDesc','count'];
export function MediaFolders({scope,onScope,attachmentIds,onChanged}: {
 scope:MediaFolderScope; onScope:(scope:MediaFolderScope)=>void; attachmentIds:number[]; onChanged:(change:Omit<MediaFolderChange,'provider'>)=>void;
}) {
 const t=useT();
 const [inventory,setInventory]=useState<MediaFolderInventory>();
 const [error,setError]=useState('');
 const [saving,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const onScopeRef=useRef(onScope);
 onScopeRef.current=onScope;
 const onChangedRef=useRef(onChanged);
 onChangedRef.current=onChanged;
 const busy=saving||loading;
 const [revision,setRevision]=useState(0);
 const [container,setContainer]=useState<HTMLElement|null>(null);
 const [editor,setEditor]=useState<{action:'create'|'delete';folder?:MediaFolder}|null>(null);
 const [draftName,setDraftName]=useState<string|null>(null);
 const draftPending=useRef(false);
 const [draftParent,setDraftParent]=useState(0);
 const [collapsed,setCollapsed]=useState<Set<number>>(()=>new Set());
 const [over,setOver]=useState<number|'all'|null>(null);
 const [dropMode,setDropMode]=useState<'inside'|'before'|'after'>('inside');
 const [renaming,setRenaming]=useState<MediaFolder|null>(null);
 const [renameValue,setRenameValue]=useState('');
 const draggedFolder=useRef<number|null>(null);
 const [sort,setSort]=useState<Sort>(()=>{try{const saved=localStorage.getItem('pixflow.media.folderSort');return sorts.includes(saved as Sort)?saved as Sort:'default';}catch{return 'default';}});
 useEffect(()=>{try{localStorage.setItem('pixflow.media.folderSort',sort);}catch{/* Storage may be unavailable. */}},[sort]);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setInventory(current=>current?.provider===scope.provider?current:undefined);setError('');setEditor(null);setRenaming(null);setDraftName(null);draftPending.current=false;
  mediaFolders(scope.provider,undefined,controller.signal).then(value=>{
   if(!controller.signal.aborted)setInventory(value);
  }).catch(error=>{
   if(controller.signal.aborted)return;
   if(scope.provider==='happyfiles' && error instanceof MediaFoldersError && (error.status===403 || error.status===409)) {
    setInventory(undefined);
    onScopeRef.current({provider:'pixflow',folder:'all'});
    return;
   }
   setError(error instanceof Error ? error.message : String(error));
  }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return ()=>controller.abort();
 },[scope.provider,revision]);
 async function change(input:Omit<MediaFolderChange,'provider'>){
  if(busy||!inventory?.writable)return;setBusy(true);setError('');
  try{setInventory(await mediaFolders(scope.provider,{...input,provider:scope.provider}));setEditor(null);setRenaming(null);
   if(input.action==='delete'&&input.id===scope.folder)onScope({...scope,folder:'all'});
   onChangedRef.current(input);
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
 }
 function edit(action:'create'|'delete',folder?:MediaFolder){
  if(action==='delete'){setEditor({action,folder});return;}
  setRenaming(null);setDraftParent(folder?.id??0);setCollapsed(current=>{const next=new Set(current);next.delete(folder?.id??0);return next;});draftPending.current=true;setDraftName('');
 }
 // A new folder stays local until named; Enter and blur must never save it twice.
 function finishDraft(cancel=false){
  if(!draftPending.current)return;
  draftPending.current=false;
  const name=draftName?.trim();setDraftName(null);
  if(!cancel&&name)void change({action:'create',name,parent:draftParent});
 }
 function choose(folder:number|'all'){if(!busy)onScope({...scope,folder});}
 function menuItems(folder?:MediaFolder,all=false){return <>
  <Menu.Item className={styles.menuItem} disabled={busy} onClick={()=>edit('create',folder)}><Icon name="plus" size={15}/>{t(folder?'media.folders.newChild':'media.folders.new')}</Menu.Item>
  {folder&&<><Menu.Item className={styles.menuItem} disabled={busy} onClick={()=>{setRenaming(folder);setRenameValue(folder.name);}}><Icon name="edit" size={15}/>{t('common.rename')}</Menu.Item>
  <Menu.Item className={styles.menuItem} disabled={busy} onClick={()=>edit('delete',folder)}><Icon name="trash" size={15}/>{t('common.delete')}</Menu.Item></>}
 </>;}
 function dragOver(event:DragEvent,id:number|'all'){
  if(!inventory?.writable||busy)return;
  const files=event.dataTransfer.types.includes(MEDIA_DRAG_TYPE);
  if(!files&&draggedFolder.current!==null){
   let ancestor=typeof id==='number'?id:0;
   const seen=new Set<number>();
   while(ancestor&&!seen.has(ancestor)){
    if(ancestor===draggedFolder.current){event.stopPropagation();event.dataTransfer.dropEffect='none';setOver(null);return;}
    seen.add(ancestor);ancestor=inventory.folders.find(f=>f.id===ancestor)?.parent??0;
   }
  }
  if((files&&id!=='all')||(sort==='default'&&id!==0&&event.dataTransfer.types.includes(FOLDER_DRAG_TYPE))){
   event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';setOver(id);
   const bounds=event.currentTarget.getBoundingClientRect(),offset=event.clientY-bounds.top;
   setDropMode(files||id==='all'?'inside':offset<9?'before':offset>bounds.height-9?'after':'inside');
  }
 }
 function drop(event:DragEvent,id:number|'all'){
  event.preventDefault();event.stopPropagation();setOver(null);if(!inventory?.writable||busy)return;
  try{
   const files=event.dataTransfer.getData(MEDIA_DRAG_TYPE);
   if(files){const ids:unknown=JSON.parse(files);if(id!=='all'&&Array.isArray(ids)&&ids.length>0&&ids.every(n=>Number.isInteger(n)&&n>0))void change({action:'assign',id,attachmentIds:ids});return;}
   const raw=event.dataTransfer.getData(FOLDER_DRAG_TYPE);if(!raw||sort!=='default'||id===0)return;
   const source=JSON.parse(raw);if(source.provider!==scope.provider)return;
   const folder=inventory.folders.find(f=>f.id===source.id),target=inventory.folders.find(f=>f.id===id);
   if(folder&&id==='all'){void change({action:'update',id:folder.id,name:folder.name,parent:0});return;}
   if(folder&&target&&folder.id!==target.id){
    const bounds=event.currentTarget.getBoundingClientRect(),offset=event.clientY-bounds.top;
    if(offset>=9&&offset<=bounds.height-9){void change({action:'update',id:folder.id,name:folder.name,parent:target.id});return;}
    const siblings=inventory.folders.filter(f=>f.parent===target.parent&&f.id!==folder.id);
    const after=offset>bounds.height/2;
    const beforeId=after?siblings[siblings.findIndex(f=>f.id===target.id)+1]?.id??0:target.id;
    void change({action:'reorder',id:folder.id,parent:target.parent,beforeId});
   }
  }catch{/* Ignore foreign or malformed drag payloads. */}
 }
 function row(folder?:MediaFolder,all=false){
  const id=all?'all':folder?.id??0;
  const label=all?t('media.folders.all'):folder?.name??t('media.folders.unfiled');
  const children=folder&&(inventory?.folders.some(f=>f.parent===folder.id)||(draftName!==null&&draftParent===folder.id));
  return <ContextMenu.Root><ContextMenu.Trigger className={styles.row} data-selected={scope.folder===id} data-drop={over===id?dropMode:undefined}
   draggable={!!folder&&sort==='default'&&inventory?.writable&&!busy&&!renaming}
   onDragStart={event=>{if(!folder)return;draggedFolder.current=folder.id;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData(FOLDER_DRAG_TYPE,JSON.stringify({id:folder.id,provider:scope.provider}));}}
   onDragOver={event=>dragOver(event,id)} onDragLeave={()=>setOver(null)} onDrop={event=>{drop(event,id);draggedFolder.current=null;}} onDragEnd={()=>{draggedFolder.current=null;setOver(null);}}>
   {children?<Collapsible.Trigger render={<Button variant="ghost" size="icon" aria-label={t('media.folders.expand',{name:label})}/>} className={styles.expand}><Icon name="chevron-right" size={14}/></Collapsible.Trigger>:<span className={styles.spacer}/>}
   {folder&&renaming?.id===folder.id?<Input autoFocus className={styles.rename} aria-label={t('media.folders.name')} value={renameValue} maxLength={120} disabled={busy} onFocus={e=>e.target.select()} onChange={e=>setRenameValue(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setRenaming(null);}if(e.key==='Enter'){e.preventDefault();void change({action:'update',id:folder.id,name:renameValue,parent:folder.parent});}}}/>:<Button variant="ghost" className={styles.folder} aria-current={scope.folder===id?'true':undefined} onClick={()=>choose(id)}><Icon name={all?'image':'folder'} size={16}/><span>{label}</span>{folder&&<small>{folder.count}</small>}</Button>}
   {inventory?.writable&&<Menu.Root><Menu.Trigger render={<Button variant="ghost" size="icon"/>} className={styles.more} aria-label={t('media.folders.options',{name:label})}><Icon name="more-horizontal" size={16}/></Menu.Trigger><Menu.Portal container={container}><Menu.Positioner className={styles.positioner} sideOffset={4}><Menu.Popup className={styles.menu}>{menuItems(folder,all)}</Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>}
  </ContextMenu.Trigger>{inventory?.writable&&<ContextMenu.Portal container={container}><ContextMenu.Positioner className={styles.positioner}><ContextMenu.Popup className={styles.menu}>{menuItems(folder,all)}</ContextMenu.Popup></ContextMenu.Positioner></ContextMenu.Portal>}</ContextMenu.Root>;
 }
 function tree(parentId:number,ancestors:number[]=[]):ReactNode{
  const folders=inventory?.folders.filter(f=>f.parent===parentId&&!ancestors.includes(f.id))??[];
  folders.sort((a,b)=>sort==='nameAsc'?a.name.localeCompare(b.name):sort==='nameDesc'?b.name.localeCompare(a.name):sort==='count'?b.count-a.count||a.name.localeCompare(b.name):a.position-b.position||a.name.localeCompare(b.name));
  return <>{draftName!==null&&draftParent===parentId&&<div className={styles.row}><span className={styles.spacer}/><Icon name="folder" size={16}/><Input autoFocus className={styles.rename} aria-label={t('media.folders.name')} value={draftName} maxLength={120} onChange={e=>setDraftName(e.target.value)} onBlur={()=>finishDraft()} onKeyDown={e=>{if(e.key==='Escape'||e.key==='Enter'){e.preventDefault();e.stopPropagation();finishDraft(e.key==='Escape');}}}/></div>}{folders.map(folder=><Collapsible.Root key={folder.id} open={!collapsed.has(folder.id)} onOpenChange={open=>setCollapsed(current=>{const next=new Set(current);if(open)next.delete(folder.id);else next.add(folder.id);return next;})}>{row(folder)}<Collapsible.Panel className={styles.children}>{tree(folder.id,[...ancestors,folder.id])}</Collapsible.Panel></Collapsible.Root>)}</>;
 }
 return <aside ref={setContainer} className={styles.sidebar} aria-label={t('media.folders.title')}>
  {inventory?.happyfilesAvailable&&<label className={styles.source}><span>{t('media.folders.happyfiles')}</span><Switch.Root className={styles.switch} checked={scope.provider==='happyfiles'} disabled={busy} onCheckedChange={checked=>onScope({provider:checked?'happyfiles':'pixflow',folder:'all'})}><Switch.Thumb className={styles.thumb}/></Switch.Root></label>}
  <div className={styles.actions}>
   {inventory?.writable&&<Button disabled={busy} onClick={()=>edit('create')}><Icon name="plus" size={15}/>{t('media.folders.new')}</Button>}
   <Menu.Root><Menu.Trigger render={<Button variant="ghost" size="icon"/>} aria-label={t('media.folders.sort')}><Icon name="sliders" size={16}/></Menu.Trigger><Menu.Portal container={container}><Menu.Positioner className={styles.positioner} sideOffset={5} align="start"><Menu.Popup className={styles.menu}><Menu.RadioGroup value={sort} onValueChange={value=>setSort(value as Sort)}>{sorts.map(value=><Menu.RadioItem key={value} value={value} className={styles.menuItem}><span>{t(`media.folders.${value}`)}</span><Menu.RadioItemIndicator><Icon name="check" size={14}/></Menu.RadioItemIndicator></Menu.RadioItem>)}</Menu.RadioGroup></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>
   <Button variant="ghost" size="icon" aria-label={t('designFiles.refresh')} disabled={busy} onClick={()=>setRevision(v=>v+1)}><Icon name="refresh" size={15}/></Button>
  </div>
  {error&&<p role="alert" className={styles.notice}>{error}</p>}
  <div className={styles.treeArea} aria-busy={loading}>
   {inventory?.provider===scope.provider&&<nav aria-label={t('media.folders.title')} className={styles.tree} style={loading?{visibility:'hidden'}:undefined}>{row(undefined,true)}{row()}{tree(0)}</nav>}
   {loading&&<Empty className={styles.loading} role="status" aria-label={t('common.loading')}><EmptyMedia><Icon name="spinner" size={24}/></EmptyMedia></Empty>}
  </div>
  <Dialog.Root open={!!editor} onOpenChange={open=>{if(!open&&!busy)setEditor(null);}}><Dialog.Portal container={container}><Dialog.Backdrop className={styles.backdrop}/><Dialog.Popup className={styles.dialog}>
   <Dialog.Title>{t(editor?.action==='create'?'media.folders.new':editor?.action==='delete'?'common.delete':'common.edit')}</Dialog.Title>
   <Dialog.Description>{editor?.action==='delete'?t('media.folders.deleteConfirm',{name:editor.folder?.name??''}):t('media.folders.preserve')}</Dialog.Description>
   <form onSubmit={event=>{event.preventDefault();if(editor)void change({action:'delete',id:editor.folder?.id});}}>
    {error&&<p role="alert">{error}</p>}<div className={styles.dialogActions}><Button variant="ghost" disabled={busy} onClick={()=>setEditor(null)}>{t('common.cancel')}</Button><Button type="submit" disabled={busy}>{t(editor?.action==='delete'?'common.delete':'common.save')}</Button></div>
   </form>
  </Dialog.Popup></Dialog.Portal></Dialog.Root>
 </aside>;
}
