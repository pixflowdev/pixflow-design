import { useT as usePixflowUiTranslation } from '../i18n';
import { useState } from 'react';
import { Button } from '@open-design/components';
import { clearBridgeToolHistory, clearBrowserToolHistory } from '../pixflow/tool-history';
import styles from './ToolHistorySettings.module.css';
import { ChatStorageSettings } from './ChatStorageSettings';

export function ToolHistorySettings() {
  const translateUi = usePixflowUiTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const clear = async (target: 'browser' | 'bridge') => {
    if (busy) return;
    setBusy(target); setFailed(false); setMessage('');
    try {
      if (target === 'browser') {
        clearBrowserToolHistory();
        setMessage(translateUi("ui.toolHistorySettings.savedBrowserToolHistoryClearedForThis"));
      } else {
        const result = await clearBridgeToolHistory();
        setMessage(result.clearedEvents ? translateUi("ui.toolHistorySettings.feedback95") : translateUi("ui.toolHistorySettings.feedback96"));
      }
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : translateUi("ui.toolHistorySettings.feedback97")); }
    finally { setBusy(null); }
  };
  return <><ChatStorageSettings /><section className={`settings-section settings-section-card ${styles.card}`} aria-labelledby="tool-history-title">
    <div><h3 id="tool-history-title">{translateUi("ui.toolHistorySettings.storageCleanup")}</h3><p>{translateUi("ui.toolHistorySettings.clearTheDetailsBehindCompletedAgentActions")}</p></div>
    <div className={styles.row}><div><h4>{translateUi("ui.toolHistorySettings.browserToolHistory")}</h4><p>{translateUi("ui.toolHistorySettings.storedInThisBrowserForThisSite")}</p></div><Button variant="ghost" disabled={!!busy} onClick={() => void clear('browser')}>{busy === 'browser' ? translateUi("ui.toolHistorySettings.clearing") : translateUi("ui.toolHistorySettings.clearBrowserHistory")}</Button></div>
    <div className={styles.row}><div><h4>{translateUi("ui.toolHistorySettings.bridgeToolHistory")}</h4><p>{translateUi("ui.toolHistorySettings.requiresAConnectedBridgeCompletedRunLogs")}</p></div><Button variant="ghost" disabled={!!busy} onClick={() => void clear('bridge')}>{busy === 'bridge' ? translateUi("ui.toolHistorySettings.clearing") : translateUi("ui.toolHistorySettings.clearBridgeHistory")}</Button></div>
    <p>{translateUi("ui.toolHistorySettings.activeAndInterruptedRunsAreProtectedThese")}</p>
    {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
  </section></>;
}
