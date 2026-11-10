import { useEffect, useState } from 'react';
import { IconBrandChrome, IconArrowUpRight } from '@tabler/icons-react';
import { useT } from '../i18n';
import styles from './BridgeExtensionBanner.module.css';

/** Presence is independent of connection health and never grants site access. */
function detected() {
  return typeof window !== 'undefined' && Boolean((window as Window & {
    __PIXFLOW_NATIVE_PROTOTYPE__?: boolean;
    pixflowDesignBridgeStatus?: { connectionRoute?: string };
  }).__PIXFLOW_NATIVE_PROTOTYPE__ || (window as Window & {
    pixflowDesignBridgeStatus?: { connectionRoute?: string };
  }).pixflowDesignBridgeStatus?.connectionRoute === 'chrome-extension');
}

export function BridgeExtensionBanner() {
  const t = useT();
  const [installed, setInstalled] = useState(detected);
  useEffect(() => {
    const update = () => setInstalled(detected());
    const message = (event: MessageEvent) => {
      if (event.source === window && event.origin === location.origin && event.data?.channel === 'pixflow-native-response') update();
    };
    window.addEventListener('message', message);
    window.addEventListener('pixflow-design:bridge-status', update);
    window.addEventListener('focus', update);
    const timer = window.setInterval(update, 1500);
    update();
    return () => {
      clearInterval(timer);
      window.removeEventListener('message', message);
      window.removeEventListener('pixflow-design:bridge-status', update);
      window.removeEventListener('focus', update);
    };
  }, []);
  if (installed) return null;
  return <aside className={styles.banner}>
    <IconBrandChrome className={styles.icon} size={22} aria-hidden="true" />
    <div className={styles.copy}>
      <a className={styles.link} href="https://chromewebstore.google.com/detail/pixflow-design-bridge/hbnbiboohlelmngadeolikeejamjlbkh" target="_blank" rel="noopener noreferrer">
        {t('settings.extensionInstall')}<IconArrowUpRight size={16} aria-hidden="true" />
      </a>
      <p>{t('settings.extensionHint')}</p>
    </div>
  </aside>;
}
