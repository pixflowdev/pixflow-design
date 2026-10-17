import { useT as usePixflowUiTranslation } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import type { PixflowSurface } from '@open-design/contracts';
import { useT } from '../i18n';
import { fetchPixflowOptionalBridgeConfig, persistPixflowOptionalBridgeConfig } from './optional-bridge';
import { createPixflowSharedAppConfigNotification, publishPixflowSharedAppConfigNotification, subscribePixflowSharedAppConfigNotifications } from './shared-app-config-notification';
import styles from './BricksStylingOptions.module.css';

/** View of the shared Bridge preference, independent of the styling route. */
export function EnhancedDesignGuidance({ enabled = true, surface = 'bricks_builder' }: { enabled?: boolean; surface?: PixflowSurface }) {
  const translateUi = usePixflowUiTranslation();
  const t = useT();
  const revision = useRef(0);
  const [value, setValue] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { revision.current++; setValue(enabled); }, [enabled]);
  useEffect(() => {
    let active = true;
    const requestedRevision = revision.current;
    void fetchPixflowOptionalBridgeConfig().then(config => { if (active && requestedRevision === revision.current && config) setValue(config.enhancedDesignGuidance !== false); });
    const unsubscribe = subscribePixflowSharedAppConfigNotifications(notification => {
      if (typeof notification.patch.enhancedDesignGuidance === 'boolean') { revision.current++; setValue(notification.patch.enhancedDesignGuidance); }
    });
    return () => { active = false; unsubscribe(); };
  }, []);
  async function change() {
    revision.current++;
    setSaving(true); setError('');
    try {
      const next = !value;
      const config = await persistPixflowOptionalBridgeConfig({ enhancedDesignGuidance: next });
      if (config?.enhancedDesignGuidance !== next) throw new Error(t('pixflow.guidance.saveError'));
      setValue(next);
      const notification = createPixflowSharedAppConfigNotification({enhancedDesignGuidance:next}, surface, 'design-guidance');
      if (notification) publishPixflowSharedAppConfigNotification(notification);
    } catch { setError(t('pixflow.guidance.saveError')); }
    finally { setSaving(false); }
  }
  return <div className={styles.group}>
    <div className={styles.toggleRow}>
      <span>{t('pixflow.guidance.label')} <small className={styles.beta}>{translateUi("ui.newProjectPanel.beta")}</small></span>
      <label className={`toggle-switch toggle-switch-sm ${styles.switch}`}>
        <input type="checkbox" role="switch" aria-label={t('pixflow.guidance.label')} aria-checked={value} aria-busy={saving} checked={value} disabled={saving} onChange={() => void change()} />
        <span className="toggle-slider" />
      </label>
    </div>
    <p className={styles.hint}>{t('pixflow.guidance.hint')}</p>
    {error && <p className={styles.hint} role="alert">{error}</p>}
  </div>;
}
