import { MediaQualitySlider } from './MediaQualitySlider';
import './MediaView.css';
import { MediaOptimiser, readMediaImage, encodeMediaImage, saveMediaCopy } from './MediaOptimiser';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { useT as usePixflowUiTranslation } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchPixflowMedia,
  importPixflowWpMedia,
  uploadPixflowMedia,
  type PixflowMediaItem,
} from '../providers/registry';

import { Icon } from './Icon';
import { openWordPressMediaLibrary } from './wordPressMediaPicker';

type MediaFilter = 'all' | 'image' | 'video' | 'audio';
type SourceFilter = 'all' | 'pixflow';
const MEDIA_PAGE_SIZE = 30;

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return 'Unknown size';
  if (size < 1024) return `${Math.round(size)} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function mediaKindLabel(item: PixflowMediaItem): string {
  if (item.type === 'image') return 'Image';
  if (item.type === 'video') return 'Video';
  if (item.type === 'audio') return 'Audio';
  return 'File';
}

function shortKind(item: PixflowMediaItem): string {
  if (item.type === 'image') return 'IMG';
  if (item.type === 'video') return 'VID';
  if (item.type === 'audio') return 'AUD';
  return 'FILE';
}

function MediaImagePreview({item,onOptimise}:{item:PixflowMediaItem;onOptimise?:()=>void}) {
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

export function MediaView({ attachmentId, attachmentUrl }: { attachmentId?: number; attachmentUrl?: string } = {}) {
  const translateUi = usePixflowUiTranslation();
  const [items, setItems] = useState<PixflowMediaItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [type, setType] = useState<MediaFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');
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
    setLoading(true);
    setMessage('');
    try {
      const result = await fetchPixflowMedia({
        type,
        source,
        search: debouncedSearch,
        page: nextPage,
        perPage: MEDIA_PAGE_SIZE,
      });
      setItems(result.items);
      setTotal(result.total);
      setSelectedId((current) =>
        current && result.items.some((item) => item.id === current)
          ? current
          : result.items[0]?.id ?? '',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : translateUi("ui.mediaView.feedback57"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [type, source, debouncedSearch]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    void load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, source, debouncedSearch, page]);

  const [bulk, setBulk] = useState(false);
  const [selection, setSelection] = useState<PixflowMediaItem[]>([]);
  const [quality, setQuality] = useState(82);
  const [results, setResults] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const batch = useRef<AbortController | null>(null);
  useEffect(() => () => batch.current?.abort(), []);
  const eligible = (item: PixflowMediaItem) => ['image/jpeg', 'image/png', 'image/webp'].includes(item.mimeType);

  const lookup=useRef<AbortController>();
  const [selecting,setSelecting]=useState(false);
  useEffect(()=>{
    setSelection([]);
    setSelecting(false);
    return ()=>lookup.current?.abort();
  },[bulk,search,source,type]);

  async function selectAllImages(){
    if(running||selecting||type==='video'||type==='audio')return;
    const task=new AbortController();lookup.current=task;setSelecting(true);setMessage('');
    try {
      const matches=new Map<string,PixflowMediaItem>();
      let pages=1;
      for(let current=1;current<=pages;current++){
        const result=await fetchPixflowMedia({type:'image',source,search,page:current,perPage:100},task.signal);
        if(current===1)pages=Math.ceil(result.total/100);
        for(const item of result.items)if(eligible(item))matches.set(item.id,item);
      }
      if(!task.signal.aborted)setSelection([...matches.values()]);
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
            status = copy.filename + ' · ' + formatFileSize(blob.size) + ' · ' +
              translateUi('media.optimise.smaller', { percent: ((1 - blob.size / source.bytes) * 100).toFixed(1) });
          }
          setResults(previous => [...previous, item.filename + ' — ' + status]);
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
  function selectCopy(copy: PixflowMediaItem) {
    pickedRow.current = true;
    setLinked(copy);
    setSelectedId(copy.id);
    void load();
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setLoading(true);
    setMessage('');
    try {
      for (const file of files) {
        await uploadPixflowMedia(file);
      }
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : translateUi("ui.mediaView.feedback58"));
      setLoading(false);
    }
  }

  function openWpMedia() {
    void openWordPressMediaLibrary({
      title: translateUi("ui.mediaView.addMediaToPixflow"),
      buttonText: 'Add selected',
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
      <div className="direct-media-files-main">
        <header className="direct-media-titlebar">
          <div>
            <div className="direct-media-title">
              <span className="direct-media-title-icon"><Icon name="image" size={16} /></span>
              <span>{translateUi("entry.navMedia")}</span>
            </div>
            <p>{translateUi("ui.mediaView.generatedImagesVideosAudioUploadsAndWordpress")}</p>
          </div>
          <div className="direct-media-files-actions">
            <button type="button" disabled={running} aria-pressed={bulk} onClick={() => {
              setBulk(!bulk); setSelection([]); setResults([]);
            }}>{translateUi('media.bulk.action')}</button>
            <button type="button" onClick={() => void load()} disabled={loading}>
              <Icon name="refresh" size={14} />
              {translateUi("designFiles.refresh")} </button>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              <Icon name="upload" size={14} />
              {translateUi("designFiles.upload.label")} </button>
            {attachmentId === undefined && !attachmentUrl && <button type="button" onClick={openWpMedia}>
              <Icon name="import" size={14} />
              {translateUi("ui.composerPlusMenu.wpMedia")} </button>}
          </div>
        </header>

        <div className="direct-media-files-head">
          <label className="direct-media-search">
            <Icon name="search" size={14} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={translateUi("ui.mediaView.searchMedia")}
            />
          </label>
          <div className="direct-media-filter-group" role="group" aria-label={translateUi("ui.mediaView.mediaType")}>
            {(['all', 'image', 'video', 'audio'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={type === value ? 'is-active' : ''}
                onClick={() => setType(value)}
              >
                {value === 'all' ? translateUi("common.all") : `${value[0]!.toUpperCase()}${value.slice(1)}`}
              </button>
            ))}
          </div>
          <div className="direct-media-filter-group" role="group" aria-label={translateUi("ui.mediaView.mediaSource")}>
            {(['all', 'pixflow'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={source === value ? 'is-active' : ''}
                onClick={() => setSource(value)}
              >
                {value === 'all' ? translateUi("ui.mediaView.allLibrary") : translateUi("ui.mediaView.pixflowOnly")}
              </button>
            ))}
          </div>
        </div>

        {bulk && <section className="direct-media-batch">
          <span>{translateUi('media.bulk.hint')}</span>
          <div className="direct-media-batch-selection">
            <button type="button" disabled={running||selecting||type==='audio'||type==='video'} onClick={()=>void selectAllImages()}>
              {translateUi(selecting?'common.loading':'media.bulk.selectAll')}</button>
            <button type="button" disabled={running||selecting||!selection.length} onClick={()=>setSelection([])}>{translateUi('ui.pixflowGoogleFontsSection.deselectAll')}</button>
          </div>
          <MediaQualitySlider value={quality} onChange={setQuality} disabled={running} />
          <button type="button" disabled={running || selecting || !selection.length} onClick={() => void runBatch()}>
            {translateUi('media.optimise.save')} ({selection.length})
          </button>
          <ul aria-live="polite">{results.map((line, index) => <li key={index}>{line}</li>)}</ul>
        </section>}
        {message ? <div className="direct-media-message">{message}</div> : null}

        <div className="direct-media-files-body">
          <div className="direct-media-table" role="table" aria-label={translateUi("ui.mediaView.pixflowMedia")}>
            <div className="direct-media-table-row direct-media-table-head" role="row">
              <span>{translateUi("routines.fieldName")}</span>
              <span>{translateUi("designFiles.groupByKind")}</span>
              <span>{translateUi("pluginsView.source")}</span>
              <span>{translateUi("designFiles.groupByModified")}</span>
            </div>
            {loading ? (
              <div className="direct-media-empty">{translateUi("ui.mediaView.loadingMedia")}</div>
            ) : items.length === 0 ? (
              <div className="direct-media-empty">{translateUi("ui.mediaView.noMediaYetUploadFilesOrAdd")}</div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={bulk && (!eligible(item) || running || selecting)}
                  aria-pressed={bulk ? selection.some(entry => entry.id === item.id) : undefined}
                  className={`direct-media-file-row${(bulk ? selection.some(entry => entry.id === item.id) : selected?.id === item.id) ? ' is-selected' : ''}`}
                  onClick={() => {
                    if (bulk) {
                      setSelection(previous => previous.some(entry => entry.id === item.id)
                        ? previous.filter(entry => entry.id !== item.id) : [...previous, item]);
                    } else { pickedRow.current = true; setLinked(null); setSelectedId(item.id); }
                  }}
                >
                  <span className="direct-media-file-name">
                    {bulk && <span aria-hidden="true" className="direct-media-check">{selection.some(entry => entry.id === item.id) ? '✓' : ''}</span>}
                    <span className={`direct-media-row-icon direct-media-row-icon--${item.type}`}>
                      {item.type === 'image' ? (
                        <img src={item.url} alt="" loading="lazy" />
                      ) : (
                        shortKind(item)
                      )}
                    </span>
                    <span>
                      <strong>{item.title || item.filename}</strong>
                      <small>{item.filename} · {formatFileSize(item.sizeBytes)}</small>
                    </span>
                  </span>
                  <span>{mediaKindLabel(item)}</span>
                  <span>{item.isPixflowMedia ? item.source : translateUi("ui.mediaView.wpLibrary")}</span>
                  <span>{formatDate(item.modifiedAt || item.createdAt)}</span>
                </button>
              ))
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
                      />
                  ) : selected.type === 'video' ? (
                    <video src={selected.url} controls />
                  ) : selected.type === 'audio' ? (
                    <audio src={selected.url} controls />
                  ) : (
                    <Icon name="file" size={32} />
                  )}
                </div>
                <div className="direct-media-preview-meta">
                  <h2>{selected.title || selected.filename}</h2>
                  <p>{selected.mimeType}</p>
                  <dl>
                    <div><dt>{translateUi("chat.designToolbox.context.file")}</dt><dd>{selected.filename}</dd></div>
                    <div><dt>{translateUi("ui.designBrowserPanel.size")}</dt><dd>{formatFileSize(selected.sizeBytes)}</dd></div>
                    <div><dt>{translateUi("pluginsView.source")}</dt><dd>{selected.isPixflowMedia ? selected.source : translateUi("ui.mediaView.wpLibrary")}</dd></div>
                    {selected.width && selected.height ? (
                      <div><dt>{translateUi("ui.mediaView.dimensions")}</dt><dd>{selected.width} x {selected.height}</dd></div>
                    ) : null}
                  </dl>
                  {['image/png', 'image/jpeg', 'image/webp'].includes(selected.mimeType) &&
                    <div key={selected.id} ref={optimiserRegion}>
                      <MediaOptimiser item={selected} onSaved={selectCopy} expanded={optimiseId===selected.id} onExpandedChange={open=>setOptimiseId(open?selected.id:undefined)}/>
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
    </section>
  );
}
