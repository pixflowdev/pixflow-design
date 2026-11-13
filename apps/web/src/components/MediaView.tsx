import { MediaUploadQueue, MediaDropOverlay } from './MediaUploads';
import { useMediaUploads } from './useMediaUploads';
import { MediaFolders, MEDIA_DRAG_TYPE, type MediaFolderScope } from './MediaFolders';
import { mediaFolders } from '../providers/media-folders';
import folderStyles from './MediaFolders.module.css';
import { Button } from '@open-design/components';
import { useUpscalerInventory } from '../pixflow/upscaler-access';
import { WorkspaceSelect } from './WorkspaceSelect';
import { MediaUpscaler } from './MediaUpscaler';
import { MediaQualitySlider } from './MediaQualitySlider';
import './MediaView.css';
import { MediaOptimiser, readMediaImage, encodeMediaImage, saveMediaCopy } from './MediaOptimiser';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { useI18n, useT as usePixflowUiTranslation } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchPixflowMedia,
  importPixflowWpMedia,
  uploadPixflowMedia,
  type PixflowMediaItem,
} from '../providers/registry';

import { Icon } from './Icon';
import { openWordPressMediaLibrary } from './wordPressMediaPicker';


const mediaLayouts = ['list','2','3','4'] as const;
type MediaLayout = typeof mediaLayouts[number];
function initialMediaLayout():MediaLayout {
  try { return mediaLayouts.find(value=>value===localStorage.getItem('pixflow.media.layout'))??'list'; }
  catch { return 'list'; }
}
function MediaLayoutIcon({layout}:{layout:MediaLayout}){
  const cols=layout==='list'?1:Number(layout);
  return <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true" fill="currentColor">
    {Array.from({length:cols*(cols===1?3:2)},(_,i)=><rect key={i} rx="0.6" x={1+(i%cols)*16/cols}
      y={2+Math.floor(i/cols)*(cols===1?5:8)} width={16/cols-1} height={cols===1?2:6}/>)}
  </svg>;
}
const MEDIA_PAGE_SIZE = 30;

function formatFileSize(size: number, t: ReturnType<typeof usePixflowUiTranslation>, locale: string): string {
  if (!Number.isFinite(size) || size <= 0) return t("ui.mediaView.unknownSize");
  if (size < 1024) return `${new Intl.NumberFormat(locale).format(size)} B`;
  if (size < 1024 * 1024) return `${new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(size / 1024)} KB`;
  return `${new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(size / 1024 / 1024)} MB`;
}

function formatDate(value: string, t: ReturnType<typeof usePixflowUiTranslation>, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("ui.mediaView.recently");
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function mediaKindLabel(item: PixflowMediaItem, t: ReturnType<typeof usePixflowUiTranslation>): string {
  if (item.type === 'image') return t("ui.mediaView.image");
  if (item.type === 'video') return t("ui.mediaView.video");
  if (item.type === 'audio') return t("ui.mediaView.audio");
  return t("ui.mediaView.file");
}

const mediaTypeLabels = {
  image: "ui.mediaView.images",
  video: "ui.mediaView.video",
  audio: "ui.mediaView.audio",
  font: "ui.mediaView.fonts",
  document: "ui.mediaView.documents",
  spreadsheet: "ui.mediaView.spreadsheets",
  interactive: "ui.mediaView.interactive",
  text: "ui.mediaView.text",
  archive: "ui.mediaView.archives",
  code: "ui.mediaView.code",
  file: "ui.mediaView.files",
} as const;

const mediaSourceLabels = {
  generated: "ui.mediaView.generated",
  upload: "ui.mediaView.upload",
  imported: "ui.mediaView.imported",
  import: "ui.mediaView.imported",
} as const;

function mediaSourceLabel(item: PixflowMediaItem, t: ReturnType<typeof usePixflowUiTranslation>) {
  if (!item.isPixflowMedia) return t('ui.mediaView.wpLibrary');
  if (!Object.hasOwn(mediaSourceLabels, item.source)) return item.source;
  return t(mediaSourceLabels[item.source as keyof typeof mediaSourceLabels]);
}

function shortKind(item: PixflowMediaItem): string {
  if (item.type === 'image') return 'IMG';
  if (item.type === 'video') return 'VID';
  if (item.type === 'audio') return 'AUD';
  return 'FILE';
}

function MediaImagePreview({item,onOptimise,onUpscale}:{item:PixflowMediaItem;onOptimise?:()=>void;onUpscale?:(trigger:HTMLElement)=>void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const t = usePixflowUiTranslation();
  const trigger=useRef<HTMLButtonElement>(null);
  const title = item.title || item.filename;
  const previewUrl=new URL(item.url,document.baseURI);
  if(item.previewRevision)previewUrl.searchParams.set('pixflow_revision',String(item.previewRevision));
  const [copyStatus, setCopyStatus] = useState('');
  return <>
    <button ref={trigger} className="direct-media-zoom" type="button" aria-haspopup="dialog"
      aria-label={t('designSystemPicker.fullscreenAria', { title })}
      onClick={() => { setCopyStatus(''); dialog.current?.showModal(); }}>
      <img src={previewUrl.href} alt={title} />
    </button>
    <dialog ref={dialog} className="direct-media-lightbox" aria-label={title}
      onCancel={event => event.stopPropagation()}
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="direct-media-lightbox-toolbar">
        <div className="direct-media-lightbox-info">
          <strong title={item.filename}>{item.filename}</strong>
          {item.width && item.height ? <small>{item.width} × {item.height} px</small> : null}
        </div>
        {onOptimise && <button type="button" onClick={()=>{dialog.current?.close();onOptimise();}}>{t('media.optimise.action')}</button>}
        {onUpscale && <button type="button" onClick={()=>{dialog.current?.close();if(trigger.current)onUpscale(trigger.current);}}>{t('media.upscale.action')}</button>}
        <button type="button" className="direct-media-lightbox-copy" aria-label={t('ui.designBrowserPanel.copyUrl')} title={t('ui.designBrowserPanel.copyUrl')}
          onClick={async () => setCopyStatus(await copyToClipboard(item.url) ? t('ui.designBrowserPanel.feedback7') : t('media.optimise.copyFailed'))}>
          <Icon name="copy" size={16} />
        </button>
        <span className="direct-media-copy-status" role="status">{copyStatus}</span>
        <a className="direct-media-lightbox-download" href={item.url} download={item.filename}>
          <Icon name="download" size={16} />{t('designFiles.download')}
        </a>
        <button className="direct-media-lightbox-close" type="button" autoFocus
          aria-label={t('promptTemplates.closeFullscreen')} onClick={() => dialog.current?.close()}>
          <Icon name="close" size={20} />
        </button>
      </div>
      <img src={previewUrl.href} alt={title} />
    </dialog>
  </>;
}

export function MediaView({ attachmentId, attachmentUrl, headerAction, onLeaveForSettings, onSelectImage }: { onSelectImage?: (item: PixflowMediaItem) => void; onLeaveForSettings?: () => void; headerAction?: React.ReactNode; attachmentId?: number; attachmentUrl?: string } = {}) {
  const { t: translateUi, locale } = useI18n();
  const [folderScope,setFolderScope]=useState<MediaFolderScope>(()=>{try{const value=JSON.parse(sessionStorage.getItem('pixflow.media.folders')??'null');if(value&&(value.provider==='pixflow'||value.provider==='happyfiles')&&(value.folder==='all'||Number.isSafeInteger(value.folder)&&value.folder>=0))return value;}catch{}return {provider:'pixflow',folder:'all'};});
  useEffect(()=>{try{sessionStorage.setItem('pixflow.media.folders',JSON.stringify(folderScope));}catch{}},[folderScope]);
  const [items, setItems] = useState<PixflowMediaItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [type, setType] = useState('all');
  const [availableTypes,setAvailableTypes]=useState<{value:string;label:string}[]>([]);
  const requestId=useRef(0);
  const [layout,setLayout]=useState<MediaLayout>(initialMediaLayout);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pickedRow = useRef(false);
  const [linked, setLinked] = useState<PixflowMediaItem | null>(null);
  useEffect(() => {
    const id = attachmentId ?? Number(new URLSearchParams(window.location.search).get('pixflow_media_id'));
    if (!attachmentUrl && (!Number.isSafeInteger(id) || id <= 0)) return;
    let active = true;
    fetchPixflowMedia(attachmentId || !attachmentUrl ? { attachmentId: id } : { attachmentUrl }).then(result => {
      if (active && !pickedRow.current) setLinked(result.items[0] ?? null);
    }).catch(error => { if (active) setMessage(String(error)); });
    return () => { active = false; };
  }, [attachmentId, attachmentUrl]);
  const selected = useMemo(
    () => (attachmentId || attachmentUrl) && !pickedRow.current ? linked : linked ?? items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId, linked, attachmentId, attachmentUrl],
  );

  const pageCount = Math.max(1, Math.ceil(total / MEDIA_PAGE_SIZE));
  const pageStart = total === 0 ? 0 : (page - 1) * MEDIA_PAGE_SIZE + 1;
  const pageEnd = Math.min(total, page * MEDIA_PAGE_SIZE);

  async function load(nextPage = page) {
    const id=++requestId.current;
    setLoading(true);
    setMessage('');
    try {
      const result = await fetchPixflowMedia({
        type,
        folder:folderScope.folder, folderProvider:folderScope.provider,
        search: debouncedSearch,
        page: nextPage,
        perPage: MEDIA_PAGE_SIZE,
      });
      if(id!==requestId.current)return;
      setAvailableTypes(result.availableTypes ?? []);
      if(type!=='all' && !result.availableTypes?.some(option=>option.value===type))setType('all');
      setItems(result.items);
      setTotal(result.total);
      setSelectedId((current) =>
        current && result.items.some((item) => item.id === current)
          ? current
          : result.items[0]?.id ?? '',
      );
    } catch (error) {
      if(id!==requestId.current)return;
      setItems([]);setTotal(0);
      setMessage(error instanceof Error ? error.message : translateUi("ui.mediaView.feedback57"));
    } finally {
      if(id===requestId.current)setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [type, debouncedSearch, folderScope]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    void load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, debouncedSearch, page, folderScope]);

  const [bulk, setBulk] = useState(false);
  const [selection, setSelection] = useState<PixflowMediaItem[]>([]);
  const rangeAnchor = useRef<string | undefined>(undefined);
  const shiftRange = useRef<{base: PixflowMediaItem[]; remove: boolean} | null>(null);
  useEffect(() => {
    shiftRange.current = null;
  }, [folderScope, page, type, debouncedSearch]);
  useEffect(() => {
    function endRange() { shiftRange.current = null; }
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === 'Shift') endRange();
    }
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', endRange);
    return () => {
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', endRange);
    };
  }, []);
  const [compress,setCompress]=useState(false);
  const [queue,setQueue]=useState<PixflowMediaItem[]>();
  const [quality, setQuality] = useState(82);
  const [results, setResults] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const batch = useRef<AbortController | null>(null);
  useEffect(() => () => batch.current?.abort(), []);
  const eligible = (item: PixflowMediaItem) => ['image/jpeg', 'image/png', 'image/webp'].includes(item.mimeType);

  const lookup=useRef<AbortController | undefined>(undefined);
  const [selecting,setSelecting]=useState(false);
  useEffect(()=>{
    setSelecting(false);
    return ()=>lookup.current?.abort();
  },[bulk,search,type]);

  function selectMediaRow(item: PixflowMediaItem, extend: boolean, toggle: boolean) {
    if (extend && !running && !selecting) {
      const anchorId = bulk ? rangeAnchor.current : selected?.id;
      const anchorIndex = items.findIndex(entry => entry.id === anchorId);
      const itemIndex = items.indexOf(item);
      const range = anchorIndex < 0 ? [item] : items.slice(
        Math.min(anchorIndex, itemIndex), Math.max(anchorIndex, itemIndex) + 1,
      );
      rangeAnchor.current = anchorIndex < 0 ? item.id : anchorId;
      setBulk(true);
      const gesture = shiftRange.current ?? {
        base: selection,
        remove: bulk && selection.some(entry => entry.id === item.id),
      };
      shiftRange.current = gesture;
      const byId = new Map(gesture.base.map(entry => [entry.id, entry]));
      for (const entry of range) {
        if (gesture.remove) byId.delete(entry.id);
        else byId.set(entry.id, entry);
      }
      setSelection([...byId.values()]);
      return;
    }

    shiftRange.current = null;
    rangeAnchor.current = item.id;
    if (toggle && !bulk && !running && !selecting) {
      const anchor = items.find(entry => entry.id === selected?.id);
      setBulk(true);
      setSelection(anchor?.id === item.id ? [] : anchor ? [anchor, item] : [item]);
      return;
    }

    if (bulk) {
      setSelection(previous => previous.some(entry => entry.id === item.id)
        ? previous.filter(entry => entry.id !== item.id)
        : [...previous, item]);
      return;
    }

    pickedRow.current = true;
    setLinked(null);
    setSelectedId(item.id);
  }

  async function selectAllImages(){
    shiftRange.current = null;
    if(running||selecting||(type!=='all'&&type!=='image'))return;
    const task=new AbortController();lookup.current=task;setSelecting(true);setMessage('');
    try {
      const matches=new Map<string,PixflowMediaItem>();
      let pages=1;
      for(let current=1;current<=pages;current++){
        const result=await fetchPixflowMedia({type:'image',search,page:current,perPage:100,folder:folderScope.folder,folderProvider:folderScope.provider},task.signal);
        if(current===1)pages=Math.ceil(result.total/100);
        for(const item of result.items)if(eligible(item))matches.set(item.id,item);
      }
      if(!task.signal.aborted)setSelection(previous=>[...previous,...[...matches.values()].filter(item=>!previous.some(entry=>entry.id===item.id))]);
    }catch(error){if(!task.signal.aborted)setMessage(error instanceof Error?error.message:translateUi('ui.mediaView.feedback58'));}
    finally{if(lookup.current===task){lookup.current=undefined;setSelecting(false);}}
  }

  async function runBatch() {
    if (!selection.length || batch.current) return;
    const controller = new AbortController();
    batch.current = controller;
    setRunning(true);
    setResults([]);
    try {
      for (const item of selection) {
        if (controller.signal.aborted) break;
        try {
          const source = await readMediaImage(item, controller.signal);
          const { blob } = await encodeMediaImage(source.image, 'webp', quality, 0);
          if (controller.signal.aborted) break;
          let status = translateUi('media.bulk.noSaving');
          if (blob.size < source.bytes) {
            const copy = await saveMediaCopy(item, blob);
            status = copy.filename + ' · ' + formatFileSize(blob.size, translateUi, locale) + ' · ' +
              translateUi('media.optimise.smaller', { percent: ((1 - blob.size / source.bytes) * 100).toFixed(1) });
          }
          setResults(previous => [...previous, item.filename + ' — ' + status]);
          shiftRange.current = null;
          setSelection(previous => previous.filter(entry => entry.id !== item.id));
        } catch {
          if (!controller.signal.aborted) setResults(previous => [...previous, item.filename + ' — ' + translateUi('ui.mediaView.feedback58')]);
        }
      }
      if (!controller.signal.aborted) await load(page);
    } finally { batch.current = null; setRunning(false); }
  }

  const [optimiseId,setOptimiseId]=useState<string>();
  const optimiserRegion=useRef<HTMLDivElement>(null);
  const [upscaleItem, setUpscaleItem] = useState<PixflowMediaItem | null>(null);
  const returnTo = useRef<{ button: HTMLElement; scroll: HTMLElement; top: number } | null>(null);
  const {status:upscaler}=useUpscalerInventory();
  const canUpscale=!!(upscaler?.supported && upscaler.enabled && upscaler.installedModels?.length);
  const needsUpscalerSetup = upscaler?.supported === true && upscaler.installedModels?.length === 0;
  const showUpscaleAction = canUpscale || needsUpscalerSetup;
  useEffect(()=>{if(!canUpscale)setUpscaleItem(null);},[canUpscale]);
  function openUpscaler(item: PixflowMediaItem, button: HTMLElement, batchItems?: PixflowMediaItem[]) {
    if (needsUpscalerSetup) {
      onLeaveForSettings?.();
      if (window.dispatchEvent(new Event('pixflow-design:open-upscaler-settings', { cancelable: true }))) {
        window.postMessage({ source: 'pixflow-design-shell', type: 'pixflow-design:open-settings', section: 'upscaler' }, window.location.origin);
      }
      return;
    }
    setQueue(batchItems);
    let scroll = button.parentElement;
    while (scroll && !/auto|scroll/.test(getComputedStyle(scroll).overflowY)) scroll = scroll.parentElement;
    scroll ??= document.documentElement;
    // The preview can scroll independently. Preserve the library's outer scroll position.
    if (scroll.classList.contains('direct-media-preview')) {
      let parent = scroll.parentElement;
      while (parent && !/auto|scroll/.test(getComputedStyle(parent).overflowY)) parent = parent.parentElement;
      scroll = parent ?? document.documentElement;
    }
    returnTo.current = { button, scroll, top: scroll.scrollTop };
    setUpscaleItem(item);
    scroll.scrollTop = 0;
  }
  function closeUpscaler() {
    void load();
    setQueue(undefined);setUpscaleItem(null);
    const target = returnTo.current;
    requestAnimationFrame(() => {
      if (target) {
        target.scroll.scrollTop = target.top;
        target.button.focus({ preventScroll: true });
      }
    });
  }

  function selectCopy(copy: PixflowMediaItem) {
    pickedRow.current = true;
    setLinked(copy);
    setSelectedId(copy.id);
    void load();
  }

  const uploads=useMediaUploads(()=>{void load();});
  function uploadFiles(files: File[]) {
    const destination={...folderScope};
    uploads.add(files,file=>{
      let uploaded:PixflowMediaItem|undefined;
      return async onProgress=>{
        if(!uploaded)uploaded=await uploadPixflowMedia(file,undefined,{onProgress});
        onProgress(100);
        if(typeof destination.folder==='number'&&destination.folder>0){
          try{await mediaFolders(destination.provider,{provider:destination.provider,action:'assign',id:destination.folder,attachmentIds:[uploaded.attachmentId]});}
          catch(error){throw new Error(translateUi('media.folders.uploadFailed',{message:error instanceof Error?error.message:String(error)}));}
        }
      };
    });
  }

  function openWpMedia() {
    void openWordPressMediaLibrary({
      title: translateUi("ui.mediaView.addMediaToPixflow"),
      buttonText: translateUi("ui.mediaView.addSelected"),
      multiple: true,
      libraryTypes: ['image', 'video', 'audio'],
    })
      .then((selection) => {
        const ids = selection
          .map((model) => Number(model.id ?? 0))
          .filter((id) => Number.isFinite(id) && id > 0);
        if (ids.length === 0) return;
        return importPixflowWpMedia(ids);
      })
      .then(() => load(page))
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : translateUi("ui.mediaView.feedback59"));
      });
  }

  return (
    <section
      className={`direct-media-files-panel pixflow-media-view${dragging ? ' is-dragging' : ''}`}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void uploadFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <MediaDropOverlay active={dragging}/>
      <MediaUploadQueue jobs={uploads.jobs} onRetry={uploads.retry} onClear={uploads.clear}/>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        hidden
        onChange={(event) => {
          void uploadFiles(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = '';
        }}
      />
      {upscaleItem && canUpscale && <MediaUpscaler queue={queue} headerAction={headerAction} installedModels={upscaler!.installedModels!} item={upscaleItem} onBack={closeUpscaler} onSaved={copy => {
        closeUpscaler();
        selectCopy(copy);
      }} />}
      <div className={folderStyles.shell} style={upscaleItem ? {display:'none'} : undefined}>
      <MediaFolders scope={folderScope} onScope={next=>{rangeAnchor.current=undefined;setFolderScope(next);setSelection([]);setLinked(null);setSelectedId('');setPage(1);}} attachmentIds={bulk?selection.map(item=>item.attachmentId):selected?[selected.attachmentId]:[]} onChanged={change=>{
        if(change.action==='assign'&&change.attachmentIds?.length){
          shiftRange.current = null;
          const movedIds=new Set(change.attachmentIds);
          setSelection(current=>current.filter(item=>!movedIds.has(item.attachmentId)));
          if(items.some(item=>item.id===rangeAnchor.current&&movedIds.has(item.attachmentId)))rangeAnchor.current=undefined;
        }
        void load();
      }}/>
      <div className="direct-media-files-main" style={upscaleItem ? {display:'none'} : undefined}>
        <header className="direct-media-header">
          <div className="direct-media-titlebar">
            <div>
              <div className="direct-media-title">
                <span className="direct-media-title-icon"><Icon name="image" size={16} /></span>
                <span>{translateUi("entry.navMedia")}</span>
              </div>
              <p>{translateUi("ui.mediaView.generatedImagesVideosAudioUploadsAndWordpress")}</p>
            </div>
            <div className="direct-media-files-actions">
              <button type="button" disabled={running} aria-pressed={bulk} onClick={() => {
                rangeAnchor.current = undefined;
                shiftRange.current = null;
                setCompress(false);setBulk(!bulk); setSelection([]); setResults([]);
              }}>{translateUi(bulk?'common.cancel':'media.bulk.select')}</button>
              <button type="button" onClick={() => void load()} disabled={loading}>
                <Icon name="refresh" size={14} />
                {translateUi("designFiles.refresh")} </button>
              <button type="button" onClick={() => fileInputRef.current?.click()}>
                <Icon name="upload" size={14} />
                {translateUi("designFiles.upload.label")} </button>
              {attachmentId === undefined && !attachmentUrl && <button type="button" onClick={openWpMedia}>
                <Icon name="import" size={14} />
                {translateUi("ui.composerPlusMenu.wpMedia")} </button>}
              {headerAction}
            </div>
          </div>

          <div className="direct-media-files-head">
            <label className="direct-media-search">
              <Icon name="search" size={14} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={translateUi("ui.mediaView.searchMedia")}
              />
            </label>
            <div className="direct-media-layout-select">
              <WorkspaceSelect label={translateUi('ui.mediaView.mediaType')} value={type}
                options={[{value:'all',label:translateUi('common.all')},...availableTypes.map(option => {
                  if (!Object.hasOwn(mediaTypeLabels, option.value)) return option;
                  return {...option, label: translateUi(mediaTypeLabels[option.value as keyof typeof mediaTypeLabels])};
                })]}
                onValueChange={value=>{pickedRow.current=true;setLinked(null);setPage(1);setType(value);}}/>
            </div>
            <div className="direct-media-layout-select">
              <WorkspaceSelect label={translateUi('designs.viewToggleAria')} value={layout}
                options={mediaLayouts.map(value=>({value,label:value==='list'?translateUi('media.view.list'):translateUi('media.view.columns',{count:value})}))}
                renderOption={option=><><MediaLayoutIcon layout={option.value}/><span>{option.label}</span></>}
                onValueChange={value=>{
                  const next=mediaLayouts.find(layout=>layout===value);
                  if(next){setLayout(next);try{localStorage.setItem('pixflow.media.layout',next);}catch{}}
                }}/>
            </div>
          </div>
        </header>

        {bulk && <section className="direct-media-batch">

          <div className="direct-media-batch-selection">
            <button type="button" disabled={running||selecting||(type!=='all'&&type!=='image')} onClick={()=>void selectAllImages()}>
              {translateUi(selecting?'common.loading':'media.bulk.selectAll')}</button>
            <button type="button" disabled={running||selecting||!selection.length} onClick={()=>{rangeAnchor.current=undefined;shiftRange.current=null;setSelection([]);}}>{translateUi('ui.pixflowGoogleFontsSection.deselectAll')}</button>
          </div>
          <button type="button" aria-pressed={compress} disabled={running||selecting||!selection.length||selection.some(item=>!eligible(item))} onClick={()=>setCompress(!compress)}>{translateUi('media.bulk.action')} ({selection.length})</button>
          {showUpscaleAction && <button type="button" disabled={running||selecting||!selection.length||selection.some(item=>!eligible(item))} onClick={event=>{openUpscaler(selection[0]!,event.currentTarget,[...selection]);}}>{translateUi('media.upscale.action')} ({selection.length})</button>}
          {compress && <><span>{translateUi('media.bulk.hint')}</span><MediaQualitySlider value={quality} onChange={setQuality} disabled={running} />
          <button type="button" disabled={running || selecting || !selection.length || selection.some(item=>!eligible(item))} onClick={() => void runBatch()}>
            {translateUi('media.optimise.save')} ({selection.length})
          </button></>}
          <ul aria-live="polite">{results.map((line, index) => <li key={index}>{line}</li>)}</ul>
        </section>}
        {message ? <div className="direct-media-message">{message}</div> : null}

        <div className="direct-media-files-body">
          <div className="direct-media-table" data-layout={layout} role={layout==='list'?'table':'group'} aria-label={translateUi("ui.mediaView.pixflowMedia")}>
            {layout==='list' && <div className="direct-media-table-row direct-media-table-head" role="row">
              <span>{translateUi("routines.fieldName")}</span>
              <span>{translateUi("designFiles.groupByKind")}</span>
              <span>{translateUi("pluginsView.source")}</span>
              <span>{translateUi("designFiles.groupByModified")}</span>
            </div>}
            {loading ? (
              <div className="direct-media-empty">{translateUi("ui.mediaView.loadingMedia")}</div>
            ) : items.length === 0 ? (
              <div className="direct-media-empty">{translateUi("ui.mediaView.noMediaYetUploadFilesOrAdd")}</div>
            ) : (
              <div className="direct-media-entries" style={layout==='list'?undefined:{gridTemplateColumns:'repeat('+layout+',minmax(0,1fr))'}}>{items.map((item) => (
                <button
                  key={item.id}
                  draggable={!running && !selecting}
                  onDragStart={event=>{
                    const dragged=bulk&&selection.some(entry=>entry.id===item.id)?selection:[item];
                    event.dataTransfer.effectAllowed='move';
                    event.dataTransfer.setData(MEDIA_DRAG_TYPE,JSON.stringify(dragged.map(entry=>entry.attachmentId)));
                  }}
                  type="button"
                  disabled={bulk && (running || selecting)}
                  aria-pressed={bulk ? selection.some(entry => entry.id === item.id) : undefined}
                  className={`direct-media-file-row${(bulk ? selection.some(entry => entry.id === item.id) : selected?.id === item.id) ? ' is-selected' : ''}`}
                  onClick={event => selectMediaRow(item, event.shiftKey, event.ctrlKey || event.metaKey)}
                >
                  <span className="direct-media-file-name">
                    {bulk && <span aria-hidden="true" className="direct-media-check">{selection.some(entry => entry.id === item.id) ? '✓' : ''}</span>}
                    <span className={`direct-media-row-icon direct-media-row-icon--${item.type}`}>
                      {item.type === 'image' ? (
                        <img src={item.url} alt="" loading="lazy" draggable={false} />
                      ) : (
                        shortKind(item)
                      )}
                    </span>
                    <span>
                      <strong>{item.title || item.filename}</strong>
                      <small>{item.filename} · {formatFileSize(item.sizeBytes, translateUi, locale)}</small>
                    </span>
                  </span>
                  <span>{mediaKindLabel(item, translateUi)}</span>
                  <span>{mediaSourceLabel(item, translateUi)}</span>
                  <span>{formatDate(item.modifiedAt || item.createdAt, translateUi, locale)}</span>
                </button>
              ))}</div>
            )}
            {!loading && total > MEDIA_PAGE_SIZE ? (
              <div className="direct-media-pagination" role="navigation" aria-label={translateUi("ui.mediaView.mediaPages")}>
                <span>
                  {translateUi("ui.mediaView.rangeSummary", { start: pageStart, end: pageEnd, total })}
                </span>
                <div>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1}
                  >
                    {translateUi("designFiles.prev")} </button>
                  <span>{page} / {pageCount}</span>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    disabled={page >= pageCount}
                  >
                    {translateUi("designFiles.next")} </button>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="direct-media-preview" aria-label={translateUi("ui.mediaView.mediaPreview")}>
            {selected ? (
              <>
                <div className="direct-media-preview-frame">
                  {selected.type === 'image' ? (
                    <MediaImagePreview key={selected.id} item={selected}
                      onOptimise={eligible(selected)?()=>{
                        setOptimiseId(selected.id);
                        requestAnimationFrame(()=>{const field=optimiserRegion.current?.querySelector<HTMLElement>('[role=combobox]');
                          field?.focus();field?.scrollIntoView({block:'nearest'});});
                      }:undefined}
                      onUpscale={eligible(selected)&&showUpscaleAction?button=>openUpscaler(selected,button):undefined}/>
                  ) : selected.type === 'video' ? (
                    <video src={selected.url} controls />
                  ) : selected.type === 'audio' ? (
                    <audio src={selected.url} controls />
                  ) : (
                    <Icon name="file" size={32} />
                  )}
                </div>
                <div className="direct-media-preview-meta">
                  {onSelectImage && selected.type === 'image' && <Button onClick={() => onSelectImage(selected)}>{translateUi("ui.blogStudio.useThisImage_b2f8cf")}</Button>}
                  <div className="direct-media-preview-heading">
                    <h2>{selected.title || selected.filename}</h2>
                    <p><span title={selected.mimeType}>{selected.mimeType.split('/').pop()?.toUpperCase()}</span>
                      <span aria-hidden="true"> · </span>{formatFileSize(selected.sizeBytes, translateUi, locale)}</p>
                  </div>
                  <dl>
                    <div><dt>{translateUi("chat.designToolbox.context.file")}</dt><dd>{selected.filename}</dd></div>
                    <div><dt>{translateUi("pluginsView.source")}</dt><dd>{mediaSourceLabel(selected, translateUi)}</dd></div>
                    {selected.width && selected.height ? (
                      <div><dt>{translateUi("ui.mediaView.dimensions")}</dt><dd>{selected.width} × {selected.height}</dd></div>
                    ) : null}
                  </dl>
                  {eligible(selected) && <div key={selected.id} ref={optimiserRegion} className="direct-media-edit-tools">
                    <div className="direct-media-edit-actions">
                      <button type="button" aria-expanded={optimiseId===selected.id} onClick={()=>setOptimiseId(optimiseId===selected.id?undefined:selected.id)}>
                        <Icon name="sliders" size={15}/>{translateUi('media.optimise.action')}
                      </button>
                      {showUpscaleAction && <button type="button" onClick={event=>openUpscaler(selected,event.currentTarget)}>
                        <Icon name="expand" size={15}/>{translateUi('media.upscale.action')}
                      </button>}
                    </div>
                    {optimiseId===selected.id && <MediaOptimiser item={selected} onSaved={selectCopy} expanded
                      onExpandedChange={open=>setOptimiseId(open?selected.id:undefined)}/>}
                  </div>}
                  <div className="direct-media-preview-links">
                    <a href={selected.url} target="_blank" rel="noreferrer">
                      <Icon name="external-link" size={14} />
                      {translateUi("ui.mediaView.openFile")} </a>
                    <a href={selected.url} download={selected.filename}>
                      <Icon name="download" size={14} />
                      {translateUi("designFiles.download")} </a>
                  </div>
                </div>
              </>
            ) : (
              <div className="direct-media-preview-empty">{translateUi("ui.mediaView.selectMediaToPreviewIt")}</div>
            )}
          </aside>
        </div>
      </div>
      </div>
    </section>
  );
}
