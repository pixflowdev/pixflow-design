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

export function MediaView() {
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

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
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
            <button type="button" onClick={() => void load()} disabled={loading}>
              <Icon name="refresh" size={14} />
              {translateUi("designFiles.refresh")} </button>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              <Icon name="upload" size={14} />
              {translateUi("designFiles.upload.label")} </button>
            <button type="button" onClick={openWpMedia}>
              <Icon name="import" size={14} />
              {translateUi("ui.composerPlusMenu.wpMedia")} </button>
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
                  className={`direct-media-file-row${selected?.id === item.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="direct-media-file-name">
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
                    <img src={selected.url} alt={selected.title || selected.filename} />
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
