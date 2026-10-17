import { useEffect } from 'react';
import { fetchPixflowLicenseStatus, isPixflowWordPressEmbed } from './license';

type RefreshHost = { users: number; refresh(): void; dispose(): void };
type HostWindow = Window & { __PIXFLOW_LICENSE_REFRESH_HOST__?: RefreshHost };

/** Every chat/settings root reconciles activation performed in another tab. */
export function usePixflowLicenseRefresh(): void {
  useEffect(() => {
    const scope = window as HostWindow;
    let host = scope.__PIXFLOW_LICENSE_REFRESH_HOST__;
    if (!host) {
      let pending = false;
      let lastChecked = 0;
      const refresh = () => {
        if (!isPixflowWordPressEmbed() || pending || document.visibilityState === 'hidden') return;
        pending = true;
        lastChecked = Date.now();
        void fetchPixflowLicenseStatus({ force: true }).catch(() => {
          // An offline host keeps its current UI and drafts. The next focus or
          // explicit licence check retries; failed transport is not revocation.
        }).finally(() => { pending = false; });
      };
      // Some embedded browsers switch tabs without delivering focus or
      // visibility events. Reconcile on the next interaction, bounded to the
      // existing licence-cache interval rather than fetching for every click.
      const refreshIfStale = () => { if (Date.now() - lastChecked >= 30_000) refresh(); };
      window.addEventListener('focus', refresh);
      window.addEventListener('pixflow-design:wordpress-runtime-ready', refresh);
      document.addEventListener('visibilitychange', refresh);
      document.addEventListener('pointerdown', refreshIfStale, true);
      document.addEventListener('keydown', refreshIfStale, true);
      host = { users: 0, refresh, dispose: () => {
        window.removeEventListener('focus', refresh);
        window.removeEventListener('pixflow-design:wordpress-runtime-ready', refresh);
        document.removeEventListener('visibilitychange', refresh);
        document.removeEventListener('pointerdown', refreshIfStale, true);
        document.removeEventListener('keydown', refreshIfStale, true);
      } };
      scope.__PIXFLOW_LICENSE_REFRESH_HOST__ = host;
    }
    host.users++;
    // A Workspace can mount after an existing floating root completed its
    // first refresh; publish current status for the newly mounted consumer.
    host.refresh();
    return () => {
      if (--host.users === 0) { host.dispose(); delete scope.__PIXFLOW_LICENSE_REFRESH_HOST__; }
    };
  }, []);
}
