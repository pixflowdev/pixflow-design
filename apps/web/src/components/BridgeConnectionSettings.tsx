import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@open-design/components';
import { useT } from '../i18n';
import { getPixflowWordPressConfig } from '../pixflow/wordpress-context';
import { installerUrlForPlatform } from '../pixflow/bridge-update';
import { normalizeBridgeStatus, type BridgeStatusPayload } from './WorkspaceBridgeStatus';
import styles from './BridgeConnectionSettings.module.css';
import { BridgeExtensionBanner } from './BridgeExtensionBanner';

function useBridgePayload() {
  const [payload, setPayload] = useState<BridgeStatusPayload>(() =>
    typeof window === 'undefined' ? {} : (window as Window & { pixflowDesignBridgeStatus?: BridgeStatusPayload }).pixflowDesignBridgeStatus ?? {});
  useEffect(() => {
    const update = (event: Event) => setPayload((event as CustomEvent<BridgeStatusPayload>).detail ?? {});
    window.addEventListener('pixflow-design:bridge-status', update);
    // The host only broadcasts changes; close the render-to-subscribe gap.
    setPayload((window as Window & { pixflowDesignBridgeStatus?: BridgeStatusPayload }).pixflowDesignBridgeStatus ?? {});
    return () => window.removeEventListener('pixflow-design:bridge-status', update);
  }, []);
  return payload;
}

/** Cached discovery is preference data, not proof that a CLI is reachable. */
export function BridgeCliSettings({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  const payload = useBridgePayload();
  const t = useT();
  if (!embedded) return <>{children}</>;
  return <><BridgeConnectionSettings /><BridgeExtensionBanner />{normalizeBridgeStatus(payload).state === 'connected'
    ? children : <p className={styles.offlineNote}>{t('settings.cliConnectToView')}</p>}</>;
}

/** Uses the host heartbeat and recovery flow shared by the panel and workspace. */
export function BridgeConnectionSettings() {
  const t = useT();
  const payload = useBridgePayload();
  const status = normalizeBridgeStatus(payload);
  const checking = status.state === 'checking';
  const connected = status.state === 'connected';
  const config = getPixflowWordPressConfig();
  const download = installerUrlForPlatform(typeof navigator === 'undefined' ? '' : `${navigator.platform} ${navigator.userAgent}`, null, {
    windows: config?.bridgeInstallWindowsUrl,
    macosArm64: config?.bridgeInstallMacArm64Url,
    linux: config?.bridgeInstallUnixUrl,
  });
  return <section className={styles.card} aria-label={t('ui.pixflowLicensePanel.bridgeConnection')}>
    <div className={styles.row}>
      <div className={styles.copy}>
        <strong>{t('ui.settingsDialog.bridge')}</strong>
        <span className={styles.status} role="status" aria-live="polite">
          <i data-state={status.state} aria-hidden="true" />{t(connected && payload.connectionRoute === 'chrome-extension' ? 'bridge.statusExtension' : connected && payload.connectionRoute === 'direct' ? 'bridge.statusDirect' : status.label)}
        </span>
      </div>
      <Button disabled={checking} onClick={() => {
        window.dispatchEvent(new CustomEvent('pixflow-design:bridge-reconnect-request', { detail: { source: 'execution-settings' } }));
      }}>{checking ? t('ui.finalAnnotation.bridgeChecking') : status.state === 'update' ? t('ui.finalAnnotation.update') : connected || payload.siteMismatch
        ? t('ui.xaiOAuthControl.reconnect') : t('ui.pixflowLicensePanel.connectBridge')}</Button>
    </div>
    {!connected && !checking && <a className={styles.download} href={download} target="_blank" rel="noopener noreferrer">{t('ui.entryShell.downloadPixflowDesignBridge')}</a>}
    {typeof payload.error === 'string' && payload.error && !checking && <p className={styles.error} role="alert">{payload.error}</p>}
  </section>;
}
