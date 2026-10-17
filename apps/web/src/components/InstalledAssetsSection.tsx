import { useT as usePixflowUiTranslation } from '../i18n';
import { useEffect, useState } from 'react';
import { Button } from '@open-design/components';
import { requestWordPressRest } from '../pixflow/license';
import { Icon } from './Icon';
import styles from './InstalledAssetsSection.module.css';

type Item = { kind: 'font' | 'icons'; id: string; name: string; builder: string };
type State = { items: Item[]; message?: string; wordpressFontState?: unknown };
/** Minimal saved-asset controls; catalogue and installation are supplied by Pro. */
export function InstalledAssetsSection({ kind, compact = false }: { kind: Item['kind']; compact?: boolean }) {
  const translateUi = usePixflowUiTranslation();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Item | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let disposed = false;
    requestWordPressRest<State>('assets/installed').then(result => {
      if (disposed) return;
      if (!result.ok) throw new Error(result.body?.message || translateUi("ui.installedAssetsSection.feedback54"));
      setItems(result.body.items);
    }).catch(error => { if (!disposed) setMessage(error.message); }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, []);
  async function remove(item: Item) {
    setBusy(true); setMessage('');
    try {
      const result = await requestWordPressRest<State>('assets/installed/remove', { method: 'POST', body: item });
      if (!result.ok) throw new Error(result.body?.message || translateUi("ui.installedAssetsSection.feedback55"));
      setItems(result.body.items); setConfirm(null); setMessage(result.body.message || translateUi("ui.installedAssetsSection.feedback56"));
      if (item.kind === 'icons') window.dispatchEvent(new CustomEvent('pixflow-design:icon-packs-changed'));
      if (result.body.wordpressFontState) window.dispatchEvent(new CustomEvent('pixflow-design:wordpress-font-state', { detail: result.body.wordpressFontState }));
    } catch (error) { setMessage(error instanceof Error ? error.message : translateUi("ui.installedAssetsSection.feedback55")); }
    finally { setBusy(false); }
  }
  const visible = items.filter(item => item.kind === kind);
  return <section className={`${compact ? styles.compact : 'settings-section'} ${styles.section}`}>
    <h3>{kind === 'font' ? translateUi("ui.installedAssetsSection.installedFonts") : translateUi("ui.installedAssetsSection.installedIconSets")}</h3>
    {!compact && <p>{translateUi("ui.installedAssetsSection.installedAssetsKeepWorkingWithoutProPixflow")}</p>}
    {loading ? <p role="status">{translateUi("ui.installedAssetsSection.loadingInstalledAssets")}</p> : visible.length === 0 ? <p>{translateUi(kind === 'font' ? 'ui.installedAssetsSection.noInstalled' : 'ui.installedAssetsSection.iconSets')}</p> : <div className={styles.list}>{visible.map(item => <div className={styles.row} key={`${item.builder}:${item.id}`}>
      <div className={styles.label}><strong>{item.name}</strong><span>{item.builder === 'wordpress' ? 'WordPress' : item.builder === 'site' ? translateUi("ui.installedAssetsSection.siteLibrary") : item.builder}</span></div>
      {confirm === item ? <div className={styles.actions}><Button disabled={busy} onClick={() => void remove(item)}>{translateUi("chat.comments.remove")}</Button><Button disabled={busy} onClick={() => setConfirm(null)}>{translateUi("dictationCancel")}</Button></div> : <Button disabled={busy} aria-label={translateUi("ui.installedAssetsSection.remove", { value1: item.name, value2: item.builder })} onClick={() => setConfirm(item)}><Icon name="trash" size={16} /></Button>}
    </div>)}</div>}
    {confirm && <p>{translateUi('ui.installedAssetsSection.contentUsingThisRegistrationMayNeedA', { name: confirm.name, builder: confirm.builder })}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
