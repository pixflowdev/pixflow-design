import { useRef, useState } from 'react';
import { Button } from '@open-design/components';
import { IconRefresh, IconTrash, IconSearch } from '@tabler/icons-react';
import type { SkillLibraryAction, SkillLibraryItem } from '@open-design/contracts';
import { useT } from '../i18n';
import { pixflowWordPressRestFetch } from '../pixflow/runtime-fetch';
import { hasPixflowWordPressContext } from '../pixflow/wordpress-context';
import styles from './SkillLibraryPanel.module.css';
import { availableSkillUpdates, useSkillLibraryCatalogue, type SkillLibraryCatalogue } from './useSkillLibraryCatalogue';
import { skillLibraryCategories, skillLibraryCategory, type SkillLibraryCategory } from './skill-library-categories';
import { SkillLibraryDetails } from './SkillLibraryDetails';

export function SkillLibraryPanel({ onChange, catalogue, presentation = 'rows' }: { onChange: () => Promise<void>; catalogue?: SkillLibraryCatalogue; presentation?: 'rows' | 'cards' }) {
  const t = useT();
  const localCatalogue = useSkillLibraryCatalogue(!catalogue);
  const { state, error, setError, load } = catalogue ?? localCatalogue;
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const selectedItem = state?.skills.find(item => item.id === selected);
  const [category, setCategory] = useState<SkillLibraryCategory | 'all'>('all');
  const categories = (Object.keys(skillLibraryCategories) as SkillLibraryCategory[]).map(id => ({ id, count: state?.skills.filter(item => skillLibraryCategory(item.id) === id).length ?? 0 })).filter(item => item.count > 0);
  const matchesSearch = (item: SkillLibraryItem) => (presentation !== 'cards' || category === 'all' || skillLibraryCategory(item.id) === category)
    && `${item.name} ${item.description} ${t(skillLibraryCategories[skillLibraryCategory(item.id)].label)}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const [remove, setRemove] = useState<string | null>(null);
  const mutationInFlight = useRef(false);
  const updates = availableSkillUpdates(state);
  const active = hasPixflowWordPressContext();
  const enabledSkills = new Map(state?.skills.filter(item => item.installedVersion && item.enabled).map(item => [item.id, item.name]));
  const overlaps = state?.pro ? (state.overlaps ?? []).filter(pair => pair.every(id => enabledSkills.has(id))) : [];
  // Keep new installations in place until the next visit, but regroup skills
  // already installed on arrival from their current enabled overlap pairs.
  const visitGroups = useRef<{ installed: Set<string> } | null>(null);
  if (!visitGroups.current && state?.skills.length) {
    visitGroups.current = {
      installed: new Set(state.skills.filter(item => item.installedVersion).map(item => item.id)),
    };
  }
  const promotedOverlapIds = new Set(overlaps.filter(pair => pair.every(id => visitGroups.current?.installed.has(id))).flat());
  const overlapping = state?.skills.filter(item => item.installedVersion && promotedOverlapIds.has(item.id)) ?? [];
  const groupedOverlapIds = new Set(overlapping.map(item => item.id));
  const installed = state?.skills.filter(item => item.installedVersion && visitGroups.current?.installed.has(item.id) && !groupedOverlapIds.has(item.id)) ?? [];
  const groupedIds = new Set([...groupedOverlapIds, ...installed.map(item => item.id)]);
  const remaining = state?.skills.filter(item => !groupedIds.has(item.id)) ?? [];
  const availableCount = remaining.filter(item => !item.installedVersion && item.canInstall && matchesSearch(item)).length;
  async function mutate(item: SkillLibraryItem, action: SkillLibraryAction) {
      const response = await pixflowWordPressRestFetch('/skill-library', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, action, digest: item.digest }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || response.statusText);
  }
  async function change(item: SkillLibraryItem, action: SkillLibraryAction) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(item.id); setError('');
    try {
      await mutate(item, action);
      // Reinstalling a removed skill follows the same stable placement as a new install.
      if (action === 'remove') visitGroups.current?.installed.delete(item.id);
      setRemove(null);
      await load(); await onChange();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { mutationInFlight.current = false; setBusy(null); }
  }
  async function updateAll() {
    if (mutationInFlight.current || !updates.length) return;
    mutationInFlight.current = true;
    setError(''); setRemove(null);
    const failures: string[] = [];
    try {
      // Use the reviewed digests, never silently adopt a newer catalogue mid-batch.
      for (const item of updates) {
        setBusy(item.id);
        try { await mutate(item, 'install'); }
        catch (e) { failures.push(`${item.name}: ${e instanceof Error ? e.message : String(e)}`); }
      }
      await load(); await onChange();
    } catch (e) { failures.push(e instanceof Error ? e.message : String(e)); }
    finally { setError(failures.join('\n')); mutationInFlight.current = false; setBusy(null); }
  }
  if (!active) return null;
  if (state && !state.pro && state.skills.length === 0) return null;
  const renderCard = (item: SkillLibraryItem) => <article key={item.id} className={styles.card} data-preview={presentation === 'cards'} onClick={event => {
    if (presentation === 'cards' && !(event.target as Element).closest('button, a, input')) setSelected(item.id);
  }}>
      <div className={styles.row}>
      <div className={styles.summary}>
        <div className={styles.title}><h4>{presentation === 'cards' ? <Button variant="ghost" className={styles.detailsTrigger} aria-haspopup="dialog" onClick={() => setSelected(item.id)}>{item.name}</Button> : item.name}</h4>{item.updateAvailable && <span className={styles.updateDot} role="img" aria-label={t('skillLibrary.updateAvailable')} title={`${t('skillLibrary.updateAvailable')}: ${item.version}`} />}<span className={styles.badge}>Pro</span><span className={styles.version} title={item.installedVersion ? t('settings.libraryInstalled') : undefined}>{item.installedVersion || item.version}</span></div>
        <p>{item.description}</p>
      </div>
      <div className={styles.actions}>
        {presentation === 'cards' && <span className={styles.categoryTag} data-category={skillLibraryCategory(item.id)}>{t(skillLibraryCategories[skillLibraryCategory(item.id)].label)}</span>}
        {!item.installedVersion || item.updateAvailable
          ? <Button className={styles.primary} disabled={busy !== null || !item.canInstall} onClick={() => void change(item, 'install')}>{busy === item.id ? t('common.loading') : item.updateAvailable ? t('skillLibrary.update') : t('settings.libraryInstallButton')}</Button> : null}
        {item.installedVersion && <>
          <Button role="switch" aria-checked={item.enabled} aria-label={`${item.name}: ${item.enabled ? t('settings.libraryEnabled') : t('settings.libraryDisabled')}`} title={item.enabled ? t('settings.libraryEnabled') : t('settings.libraryDisabled')} disabled={busy !== null || (!state?.pro && !item.enabled)} onClick={() => void change(item, item.enabled ? 'disable' : 'enable')} className={styles.switchButton}>
            <span className={styles.switchTrack} data-enabled={item.enabled}><span /></span>
          </Button>
          <Button variant="ghost" className={styles.iconButton} aria-label={`${t('chat.comments.remove')} ${item.name}`} title={t('chat.comments.remove')} aria-expanded={remove === item.id} disabled={busy !== null} onClick={() => setRemove(remove === item.id ? null : item.id)}><IconTrash size={16} stroke={1.6} aria-hidden="true" /></Button>
        </>}
      </div>
      </div>
      <div className={styles.disclosure} data-open={remove === item.id}><div><div className={styles.confirm}>
        <p>{t('skillLibrary.removalNote')}</p><div className={styles.actions}>
          <Button disabled={busy !== null} onClick={() => void change(item, 'remove')}>{t('chat.comments.remove')}</Button>
          <Button variant="ghost" disabled={busy !== null} onClick={() => setRemove(null)}>{t('common.cancel')}</Button>
        </div>
      </div></div></div>
    </article>;
  const overlapDetails = <><p>{t('skillLibrary.overlapHint')}</p><ul>{overlaps.map(([first, second]) => <li key={`${first}:${second}`}>{enabledSkills.get(first)} · {enabledSkills.get(second)}</li>)}</ul></>;
  return <section className={styles.panel} data-presentation={presentation} aria-label={t('skillLibrary.title')}>
    <header className={styles.header}><div><h3>{t('skillLibrary.title')}</h3><p>{t('skillLibrary.description')}</p></div>
      <div className={styles.actions}>
        {updates.length > 0 && <Button className={styles.updateAll} disabled={busy !== null} onClick={() => void updateAll()}>{t('skillLibrary.updateAll')}<span className={styles.updateCount}>{updates.length}</span></Button>}
        <Button variant="ghost" className={styles.iconButton} aria-label={t('designFiles.refresh')} title={t('designFiles.refresh')} disabled={busy !== null} onClick={() => { setError(''); void load(true).catch(e => setError(e.message)); }}><IconRefresh size={16} stroke={1.6} aria-hidden="true" /></Button>
      </div>
    </header>
    {presentation === 'cards' && <label className={styles.search}><IconSearch size={17} stroke={1.5} aria-hidden="true" /><input type="search" aria-label={t('ui.chatComposer.searchSkills2')} placeholder={t('ui.chatComposer.searchSkills')} value={search} onChange={event => setSearch(event.target.value)} /></label>}
    {presentation === 'cards' && categories.length > 0 && <div className={styles.filters} role="group" aria-label={t('pluginsHome.categoryFilterAria')}>
      <Button variant="ghost" className={styles.filter} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>{t('common.all')}{' '}<span>{state?.skills.length}</span></Button>
      {categories.map(item => <Button key={item.id} variant="ghost" className={styles.filter} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{t(skillLibraryCategories[item.id].label)}{' '}<span>{item.count}</span></Button>)}
    </div>}
    {(error || state?.error) && <p className={styles.notice} role="status">{error || state?.error}</p>}
    {!state && !error && <p role="status">{t('common.loading')}</p>}
    {state && !state.skills.some(matchesSearch) && <p className={styles.notice} role="status">{t(search.trim() || category !== 'all' ? 'context.noMatches' : 'ui.chatComposer.noSkillsAvailableYet')}</p>}
    {overlaps.length > 0 && overlapping.length === 0 && <aside className={styles.overlapNotice} role="status"><strong>{t('skillLibrary.overlapTitle')}</strong>{overlapDetails}</aside>}
    <div className={styles.groups}>
      {overlapping.some(matchesSearch) && <section aria-label={t('skillLibrary.overlapTitle')}>
        <div className={styles.groupHeading}><h4>{t('skillLibrary.overlapTitle')}</h4><span>{overlapping.filter(matchesSearch).length}</span></div>
        <div className={styles.overlapDetails} role="status">{overlapDetails}</div>
        <div className={styles.grid}>{overlapping.filter(matchesSearch).map(renderCard)}</div>
      </section>}
      {installed.some(matchesSearch) && <section aria-label={t('settings.libraryInstalled')}>
        <div className={styles.groupHeading}><h4>{t('settings.libraryInstalled')}</h4><span>{installed.filter(matchesSearch).length}</span></div>
        <div className={styles.grid}>{installed.filter(matchesSearch).map(renderCard)}</div>
      </section>}
      {remaining.some(matchesSearch) && <section aria-label={availableCount > 0 ? t('skillLibrary.availableToInstall') : undefined}>
        {availableCount > 0 && <div className={styles.groupHeading}><h4>{t('skillLibrary.availableToInstall')}</h4><span>{availableCount}</span></div>}
        <div className={styles.grid}>{remaining.filter(matchesSearch).map(renderCard)}</div>
      </section>}
    </div>
    {selectedItem && <SkillLibraryDetails key={selectedItem.id} item={selectedItem} busy={busy !== null} actionError={error} onClose={() => setSelected(null)} onInstall={() => void change(selectedItem, 'install')} />}
  </section>;
}
