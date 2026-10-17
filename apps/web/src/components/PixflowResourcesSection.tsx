import { useT as usePixflowUiTranslation } from '../i18n';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import type { InstalledPluginRecord } from '@open-design/contracts';
import type { DesignSystemSummary, SkillSummary } from '../types';
import { requestWordPressRest } from '../pixflow/license';
import { PluginDetailsModal } from './PluginDetailsModal';
import { DesignSystemPreviewModal } from './DesignSystemPreviewModal';
import type { PluginUseAction } from './plugins-home/useActions';
import styles from './PixflowResourcesSection.module.css';
import { Icon, type IconName } from './Icon';
import { renderMarkdown } from '../runtime/markdown';

type Category = 'creative' | 'templates' | 'styles';
const categories: Record<Category, { title: string; path: string; key: string; hint: string }> = {
  creative: { title: 'Creative Resources', path: 'plugins', key: 'plugins', hint: 'Image, video and web design recipes with preview assets.' },
  templates: { title: 'Design Templates', path: 'design-templates', key: 'designTemplates', hint: 'Composition recipes for your agent. These are not insertable Bricks layouts.' },
  styles: { title: 'Style References', path: 'design-systems', key: 'designSystems', hint: 'Visual inspiration. Manage your applied Bricks systems in Design Systems.' },
};
const categoryIcons: Record<Category, IconName> = { creative: 'sparkles', templates: 'grid', styles: 'palette' };
type Item = { id: string; title: string; description: string; record: InstalledPluginRecord | SkillSummary | DesignSystemSummary };
async function readResource<T>(path: string): Promise<T> {
  const result = await requestWordPressRest<T & { message?: string }>(`od/${path}`);
  if (!result.ok || !result.body) throw new Error(result.body?.message || 'Resources could not be loaded. Please retry.');
  return result.body;
}

/** Both entry points browse this site's installed packs, not the Bridge's unrelated catalogue. */
export function PixflowResourcesSection({ onDownloads, onUsePlugin, onPrepared, inSettings = false }: {
  onDownloads: () => void;
  onUsePlugin?: (record: InstalledPluginRecord, action: PluginUseAction) => void;
  onPrepared?: () => void;
  inSettings?: boolean;
}) {
  const translateUi = usePixflowUiTranslation();
  const [category, setCategory] = useState<Category>('creative');
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Item | null>(null);
  const [body, setBody] = useState('');
  const requestId = useRef(0);
  const categoryId = useId();
  useEffect(() => {
    let current = true;
    setLoading(true); setError(''); setItems([]); setSelected(null);
    const spec = categories[category];
    readResource<Record<string, Array<InstalledPluginRecord & SkillSummary & DesignSystemSummary>>>(spec.path)
      .then(data => {
        if (!current) return;
        setItems((data[spec.key] || []).filter(item => category !== 'styles' || item.category === 'Style Reference').map(record => ({
          id: record.id, title: record.title || record.name || record.id,
          description: record.description || record.summary || record.manifest?.description || '', record,
        })));
      }).catch(reason => { if (current) setError(String(reason.message || reason)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; requestId.current++; };
  }, [category, revision]);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener('open-design:plugins-changed', refresh);
    return () => window.removeEventListener('open-design:plugins-changed', refresh);
  }, []);
  async function open(item: Item) {
    setSelected(item); setBody(''); setError('');
    if (category !== 'templates') return;
    const id = ++requestId.current;
    try {
      const detail = await readResource<{ body: string }>(`design-templates/${encodeURIComponent(item.id)}`);
      if (id === requestId.current) setBody(detail.body.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim());
    } catch (reason) { if (id === requestId.current) setError(String((reason as Error).message)); }
  }
  const filtered = items.filter(item => `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase()));
  return <section className={styles.root} data-settings={inSettings} aria-label={translateUi("ui.pixflowResourcesSection.resources")} onClick={event => event.stopPropagation()}>
    <header className={styles.header}>
      <div>{!inSettings && <h3>{translateUi("ui.pixflowResourcesSection.resources")}</h3>}<p>{translateUi("ui.pixflowResourcesSection.exploreTheCreativePacksInstalledOnThis")}</p></div>
      <Button className={styles.downloadsButton} onClick={onDownloads}><Icon name="download" size={15} />{translateUi("ui.pixflowResourcesSection.manageDownloads")}</Button>
    </header>
    <div className={styles.tabs} role="tablist" aria-label={translateUi("ui.pixflowResourcesSection.resourceCategories")}>{(Object.keys(categories) as Category[]).map((key, index, keys) =>
      <Button key={key} id={`${categoryId}-${key}`} role="tab" aria-controls={`${categoryId}-panel`} aria-selected={category === key} tabIndex={category === key ? 0 : -1} onKeyDown={event => {
        const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
        const step = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
        if (!step && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : (index + step + keys.length) % keys.length;
        setCategory(keys[target]!); setQuery('');
        (event.currentTarget.parentElement?.children[target] as HTMLElement | undefined)?.focus();
      }} onClick={() => { setCategory(key); setQuery(''); }}>{translateUi(key === 'creative' ? 'ui.finalResources.creative' : key === 'templates' ? 'ui.finalResources.templates' : 'ui.finalResources.styles')}</Button>)}</div>
    <div className={styles.panel} id={`${categoryId}-panel`} role="tabpanel" aria-labelledby={`${categoryId}-${category}`}>
    <p className={styles.hint}>{translateUi(category === 'creative' ? 'ui.finalResources.creativeHint' : category === 'templates' ? 'ui.finalResources.templatesHint' : 'ui.finalResources.stylesHint')}</p>
    <div className={styles.toolbar}><label className={styles.search}><Icon name="search" size={16} /><input type="search" aria-label={translateUi("ui.pixflowResourcesSection.searchResources")} placeholder={translateUi("ui.pixflowResourcesSection.searchResources2")} value={query} onChange={event => setQuery(event.target.value)} /></label><Button className={styles.refreshButton} disabled={loading} onClick={() => setRevision(value => value + 1)}><Icon name="refresh" size={14} />{translateUi("designFiles.refresh")}</Button></div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {loading ? <p className={styles.empty} role="status">{translateUi("ui.pixflowResourcesSection.loadingResources")}</p> : <>
      <p className={styles.hint}>{filtered.length} {filtered.length === 1 ? translateUi("ui.pixflowResourcesSection.resource") : translateUi("ui.pixflowResourcesSection.resources2")}</p>
      {!items.length && !error && <p className={styles.empty}>{translateUi("ui.pixflowResourcesSection.noResourcesInstalledInThisCategoryOpen")}</p>}
      {!!items.length && !filtered.length && <p className={styles.empty}>{translateUi("ui.pixflowResourcesSection.noMatchingResources")}</p>}
      {!(selected && category === 'templates') && <div className={styles.list}>{filtered.map(item => <button type="button" className={styles.row} key={item.id} onClick={() => void open(item)}><span className={styles.resourceIcon}><Icon name={categoryIcons[category]} size={18} /></span><span className={styles.copy}><strong>{item.title}</strong>{item.description && <span>{item.description}</span>}</span><Icon name="chevron-right" size={15} /></button>)}</div>}
    </>}
    {selected && category === 'creative' && <PluginDetailsModal record={selected.record as InstalledPluginRecord} onPrepared={onPrepared} onClose={() => setSelected(null)} onUse={onUsePlugin || (() => {})} hideUseAction={!onUsePlugin} />}
    {selected && category === 'styles' && <DesignSystemPreviewModal referenceOnly system={selected.record as DesignSystemSummary} onClose={() => setSelected(null)} />}
    {selected && category === 'templates' && <section className={styles.detail} aria-label={translateUi("ui.pixflowResourcesSection.templateGuidance")}>
      <header className={styles.detailHeader}><h4>{selected.title}</h4><Button className={styles.backButton} onClick={() => { requestId.current++; setSelected(null); }}><Icon name="chevron-left" size={14} />{translateUi("ui.pixflowResourcesSection.closeGuidance")}</Button></header>
      <div className={styles.guidance}>{body ? renderMarkdown(body) : <p role="status">{error ? translateUi('ui.finalResources.failed') : translateUi('ui.finalResources.loading')}</p>}</div>
    </section>}
    </div>
  </section>;
}
