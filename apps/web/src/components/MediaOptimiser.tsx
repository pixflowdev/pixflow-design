import { useEffect, useState } from 'react';
import { Input } from '@base-ui/react/input';
import { MediaQualitySlider } from './MediaQualitySlider';
import { WorkspaceSelect } from './WorkspaceSelect';
import { useT } from '../i18n';
import { uploadPixflowMedia, type PixflowMediaItem } from '../providers/registry';

type Source = { image: HTMLImageElement; bytes: number; blob: Blob };
type Result = { blob: Blob; url: string; width: number; height: number; signature: string };
const size = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`;


export async function encodeMediaImage(image: HTMLImageElement, format: string, quality: number, limit: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(image.naturalWidth, limit || image.naturalWidth);
  canvas.height = Math.max(1, Math.round(image.naturalHeight * canvas.width / image.naturalWidth));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  if (format === 'jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const mime = 'image/' + format;
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => {
    if (value?.type === mime) resolve(value);
    else reject(new Error('Unsupported image format'));
  }, mime, quality / 100));
  return { blob, width: canvas.width, height: canvas.height };
}

export function saveMediaCopy(item: PixflowMediaItem, blob: Blob) {
  const extension = blob.type.slice(6).replace('jpeg', 'jpg');
  const filename = item.filename.replace(/\.[^.]+$/, '') + '-optimised.' + extension;
  return uploadPixflowMedia(new File([blob], filename, { type: blob.type }), item);
}

export async function readMediaImage(item: PixflowMediaItem, signal: AbortSignal) {
  const response = await fetch(item.url, { signal, cache:'no-cache' });
  if (!response.ok) throw new Error('Image unavailable');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { image, bytes: blob.size, blob };
  } finally { URL.revokeObjectURL(url); }
}

export function MediaOptimiser({ item, onSaved, expanded, onExpandedChange }: { item: PixflowMediaItem; onSaved: (copy: PixflowMediaItem) => void; expanded?: boolean; onExpandedChange?: (value:boolean)=>void }) {
  const t = useT();
  const [localOpen,setLocalOpen]=useState(false);
  const open=expanded??localOpen;
  const setOpen=onExpandedChange??setLocalOpen;
  const [format, setFormat] = useState('webp');
  const [quality, setQuality] = useState(82);
  const [limit, setLimit] = useState('');
  const [source, setSource] = useState<Source>();
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const signature = JSON.stringify([format, quality, limit]);
  const validWidth = limit === '' || (Number.isSafeInteger(Number(limit)) && Number(limit) > 0);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    void readMediaImage(item, abort.signal).then(image => {
      if (!abort.signal.aborted) setSource(image);
    }).catch(() => { if (!abort.signal.aborted) setError(t('media.optimise.failed')); });
    return () => abort.abort();
  }, [open, item.url, t]);
  useEffect(() => {
    if (!source || !open || !validWidth) return;
    let active = true;
    let url = '';
    const timer = window.setTimeout(() => {
      void encodeMediaImage(source.image, format, quality, Number(limit)).then(encoded => {
        if (!active) return;
        url = URL.createObjectURL(encoded.blob);
        setError('');
        setResult({ ...encoded, url, signature });
      }).catch(() => { if (active) setError(t('media.optimise.failed')); });
    }, 160);
    return () => { active = false; clearTimeout(timer); if (url) URL.revokeObjectURL(url); };
  }, [source, open, validWidth, format, quality, limit, signature, t]);

  const preview = validWidth && result?.signature === signature ? result : undefined;
  async function save() {
    if (!preview || saving) return;
    setSaving(true);
    try {
      const copy = await saveMediaCopy(item, preview.blob);
      onSaved(copy);
    } catch { setError(t('ui.mediaView.feedback58')); setSaving(false); }
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)}>{t('media.optimise.action')}</button>;
  return <fieldset className="direct-media-optimiser" disabled={saving}>
    <legend>{t('media.optimise.action')}</legend>
    <div>{t('media.optimise.format')}<WorkspaceSelect label={t('media.optimise.format')} value={format} onValueChange={setFormat}
      disabled={saving} options={[{ value: 'webp', label: 'WebP' }, { value: 'jpeg', label: 'JPEG' }, { value: 'png', label: 'PNG' }]} /></div>
    {format !== 'png' && <MediaQualitySlider value={quality} onChange={setQuality} disabled={saving} />}
    <label>{t('media.optimise.width')} (px)
      <Input className="direct-media-width" data-slot="input" type="number" min="1" step="1"
        placeholder={String(item.width || '')} value={limit} aria-invalid={!validWidth}
        onChange={event => setLimit(event.target.value)} />
    </label>
    <div className="direct-media-comparison">
      <figure><img src={item.url} alt="" /><figcaption>{t('media.optimise.original')}<br/>{source && size(source.bytes)}</figcaption></figure>
      <figure>{preview && <img src={preview.url} alt="" />}<figcaption>{t('media.optimise.copy')}<br/>{preview && size(preview.blob.size)}</figcaption></figure>
    </div>
    {preview && source && <output>
      {preview.width} × {preview.height} px · {t(preview.blob.size <= source.bytes ? 'media.optimise.smaller' : 'media.optimise.larger', { percent: Math.abs((1-preview.blob.size/source.bytes)*100).toFixed(1) })}
    </output>}
    {error && <p role="alert">{error}</p>}
    <div><button type="button" disabled={!preview || saving} onClick={() => void save()}>{t('media.optimise.save')}</button>
    <button type="button" onClick={() => { setOpen(false); setSource(undefined); setResult(undefined); setError(''); }}>{t('common.cancel')}</button></div>
  </fieldset>;
}
