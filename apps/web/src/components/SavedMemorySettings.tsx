import { useT as usePixflowUiTranslation } from '../i18n';
import { useEffect, useState } from 'react';
import { Button } from '@open-design/components';
import type { MemoryListResponse, MemoryType } from '@open-design/contracts';
import { exportSavedMemories, loadSavedMemories, memoryRequest, SAVED_MEMORY_CHANGED, type SavedMemory } from '../pixflow/saved-memory';
import styles from './SavedMemorySettings.module.css';

const categories: Record<MemoryType, string> = { user: 'About you', feedback: 'Preferences', project: 'Project context', reference: 'References' };
type Draft = Omit<SavedMemory, 'id' | 'updatedAt'> & { id?: string };

export function SavedMemorySettings() {
  const translateUi = usePixflowUiTranslation();
  const [data, setData] = useState<MemoryListResponse | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<SavedMemory | null>(null);
  const [index, setIndex] = useState<string | null>(null);
  const refresh = async () => setData(await loadSavedMemories());
  const act = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(''); setStatus('');
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : translateUi("ui.savedMemorySettings.feedback86")); }
    finally { setBusy(false); }
  };
  useEffect(() => { let alive = true; loadSavedMemories().then(value => { if (alive) setData(value); }).catch(cause => { if (alive) setError(String(cause.message)); }); return () => { alive = false; }; }, []);
  const changed = async (message: string) => {
    await refresh(); window.dispatchEvent(new Event(SAVED_MEMORY_CHANGED)); setStatus(message);
  };
  const configure = (patch: { enabled?: boolean; chatExtractionEnabled?: boolean }) => void act(async () => {
    await memoryRequest('/config', { method: 'PATCH', body: JSON.stringify(patch) });
    await changed('Memory settings saved.');
  });
  const entries = data?.entries.filter(entry => `${entry.name} ${entry.description} ${categories[entry.type]}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  return <section className={styles.card} aria-labelledby="saved-memory-title">
    <header className={styles.header}><div><h3 id="saved-memory-title">{translateUi("ui.savedMemorySettings.savedMemories")}</h3><p>{translateUi("ui.savedMemorySettings.preferencesAndContextSavedToYourWordpress")}</p></div>
      <Button variant="ghost" disabled={busy || !data} onClick={() => { setDraft({ name: '', description: '', type: 'user', body: '' }); setDeleting(null); }}>{translateUi("ui.savedMemorySettings.addMemory")}</Button></header>
    {error && <div className={styles.notice} role="alert">{error} <Button variant="ghost" disabled={busy} onClick={() => void act(refresh)}>{translateUi("ui.savedMemorySettings.retryLoading")}</Button></div>}
    {!data && !error && <p role="status">{translateUi("ui.savedMemorySettings.loadingMemories")}</p>}
    {data && <>
      <label className={styles.row}><span><strong>{translateUi("ui.savedMemorySettings.useSavedMemories")}</strong><small>{translateUi("ui.savedMemorySettings.makeSavedContextAvailableToFutureChats")}</small></span><input type="checkbox" role="switch" checked={data.enabled} disabled={busy} onChange={event => configure({ enabled: event.target.checked })} /></label>
      {data.entries.length > 0 && <div className={styles.toolbar}><input aria-label={translateUi("ui.savedMemorySettings.searchMemories")} placeholder={translateUi("ui.savedMemorySettings.searchMemories")} value={query} onChange={event => setQuery(event.target.value)} /><span>{data.entries.length}  {translateUi("ui.memorySection.saved")}</span></div>}
      {!data.entries.length && !draft && <div className={styles.empty}><strong>{translateUi("ui.savedMemorySettings.noSavedMemoriesYet")}</strong><p>{translateUi("ui.savedMemorySettings.addAPreferenceOrAFactYou")}</p></div>}
      {data.entries.length > 0 && !entries.length && <p>{translateUi("ui.savedMemorySettings.noMemoriesMatchYourSearch")}</p>}
      <div className={styles.list}>{entries.map(entry => <div className={styles.row} key={entry.id}><div className={styles.copy}><strong>{entry.name}</strong>{entry.description && <small>{entry.description}</small>}<span className={styles.category}>{categories[entry.type]}</span></div><div className={styles.actions}>
        <Button variant="ghost" disabled={busy} aria-label={translateUi("ui.savedMemorySettings.edit", { value1: entry.name })} onClick={() => void act(async () => { const result = await memoryRequest<{ entry: SavedMemory }>(`/${encodeURIComponent(entry.id)}`); setDraft(result.entry); setDeleting(null); })}>{translateUi("common.edit")}</Button>
        <Button variant="ghost" disabled={busy} aria-label={translateUi("ui.savedMemorySettings.delete2", { value1: entry.name })} onClick={() => void act(async () => { const result = await memoryRequest<{ entry: SavedMemory }>(`/${encodeURIComponent(entry.id)}`); setDeleting(result.entry); setDraft(null); })}>{translateUi("common.delete")}</Button>
      </div></div>)}</div>
      {deleting && <div className={styles.editor}><strong>{translateUi("ui.savedMemorySettings.delete", { name: deleting.name })}</strong><p>{translateUi("ui.savedMemorySettings.thisRemovesTheSavedMemoryYourConversations")}</p><div className={styles.actions}><Button variant="ghost" disabled={busy} onClick={() => setDeleting(null)}>{translateUi("dictationCancel")}</Button><Button variant="primary" disabled={busy} onClick={() => void act(async () => { await memoryRequest(`/${encodeURIComponent(deleting.id)}?expectedVersion=${deleting.version ?? 1}`, { method: 'DELETE' }); setDeleting(null); await changed('Memory deleted.'); })}>{translateUi("ui.savedMemorySettings.deleteMemory")}</Button></div></div>}
      {draft && <form className={styles.editor} onSubmit={event => { event.preventDefault(); void act(async () => { await memoryRequest(draft.id ? `/${encodeURIComponent(draft.id)}` : '', { method: draft.id ? 'PUT' : 'POST', body: JSON.stringify({ ...draft, id: draft.id ?? `user_${crypto.randomUUID().replaceAll('-', '')}`, expectedVersion: draft.version }) }); setDraft(null); await changed('Memory saved.'); }); }}>
        <strong>{draft.id ? translateUi("ui.savedMemorySettings.editMemory") : translateUi("settings.memoryNew")}</strong>
        <label>{translateUi("settings.memoryNameLabel")}<input autoFocus required maxLength={180} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>{translateUi("connectors.categoryLabel")}<select value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value as MemoryType })}>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>{translateUi("ui.savedMemorySettings.summary")}<input maxLength={400} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
        <label>{translateUi("ui.savedMemorySettings.whatShouldBeRemembered")}<textarea required rows={4} maxLength={16000} value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} /></label>
        <div className={styles.actions}><Button variant="ghost" disabled={busy} onClick={() => setDraft(null)}>{translateUi("dictationCancel")}</Button><Button type="submit" variant="primary" disabled={busy || !draft.name.trim() || !draft.body.trim()}>{busy ? translateUi("routines.saving") : translateUi("ui.savedMemorySettings.saveMemory")}</Button></div>
      </form>}
      <footer className={styles.row}><span><strong>{translateUi("ui.savedMemorySettings.exportMemories")}</strong><small>{translateUi("ui.savedMemorySettings.downloadYourSavedTextAndMemorySettings")}</small></span><Button variant="ghost" disabled={busy} onClick={() => void act(async () => { const text = await exportSavedMemories(); const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'pixflow-memories.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setStatus('Memory export downloaded.'); })}>{translateUi("pluginsHome.facet.export")}</Button></footer>
      <details className={styles.advanced}><summary>{translateUi("ui.savedMemorySettings.advancedMemorySettings")}</summary><label className={styles.row}><span><strong>{translateUi("ui.savedMemorySettings.allowMemoriesFromChat")}</strong><small>{translateUi("ui.savedMemorySettings.allowsSupportedChatFlowsToSaveExplicit")}</small></span><input type="checkbox" role="switch" checked={data.chatExtractionEnabled} disabled={busy} onChange={event => configure({ chatExtractionEnabled: event.target.checked })} /></label>
        <label className={styles.index}>{translateUi("ui.savedMemorySettings.memoryIndex")}<small>{translateUi("ui.savedMemorySettings.advancedCompatibilityControlForChatFlowsThat")}</small><textarea rows={5} value={index ?? data.index} onChange={event => setIndex(event.target.value)} /></label><div className={styles.actions}><Button variant="ghost" disabled={busy || index === null} onClick={() => setIndex(null)}>{translateUi("ui.savedMemorySettings.discardChanges")}</Button><Button variant="ghost" disabled={busy || index === null} onClick={() => void act(async () => { await memoryRequest('/index', { method: 'PUT', body: JSON.stringify({ index }) }); setIndex(null); await changed('Memory index saved.'); })}>{translateUi("settings.memoryIndexSave")}</Button></div>
        <div className={styles.row}><span><strong>{translateUi("ui.savedMemorySettings.memoryActivityLogs")}</strong><small>{translateUi("ui.savedMemorySettings.removeRecordsOfPastMemorySavingAttempts")}</small></span><Button variant="ghost" disabled={busy} onClick={() => void act(async () => { await memoryRequest('/extractions', { method: 'DELETE' }); setStatus('Memory activity logs cleared.'); })}>{translateUi("ui.savedMemorySettings.clearActivity")}</Button></div>
      </details>
    </>}
    {status && <p role="status">{status}</p>}
  </section>;
}
