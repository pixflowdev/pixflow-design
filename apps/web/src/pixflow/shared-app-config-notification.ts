import {
  sanitizePixflowSharedAppConfigNotification,
  type PixflowSharedAppConfigPatch,
  type PixflowSharedAppConfigNotification,
  type PixflowSurface,
} from '@open-design/contracts';

let notificationRevision = 0;
const SHARED_APP_CONFIG_CHANNEL = 'pixflow-design:app-config:v1';

export function createPixflowSharedAppConfigNotification(
  patch: unknown,
  source: PixflowSurface,
  originId = 'web-surface',
): PixflowSharedAppConfigNotification | null {
  const safe = sanitizePixflowSharedAppConfigNotification({
    schema: 'pixflow.app-config.changed.v1',
    version: 1,
    revision: ++notificationRevision,
    source,
    originId,
    patch,
  });
  return safe;
}

export function sharedAppConfigPatchFromNotification(
  patch: unknown,
  source: PixflowSurface,
  originId?: string,
): PixflowSharedAppConfigPatch {
  return createPixflowSharedAppConfigNotification(patch, source, originId)?.patch ?? {};
}

/**
 * Broadcast only the sanitised cross-surface patch. Provider keys and agent
 * secret environments are excluded by the contract sanitizer before this
 * function can publish anything.
 */
export function publishPixflowSharedAppConfigNotification(
  notification: PixflowSharedAppConfigNotification,
): void {
  if (typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') return;
  try {
    const channel = new window.BroadcastChannel(SHARED_APP_CONFIG_CHANNEL);
    channel.postMessage(notification);
    channel.close();
  } catch {
    // BroadcastChannel is an optional convergence hint; REST remains authoritative.
  }
}

export function subscribePixflowSharedAppConfigNotifications(
  onNotification: (notification: PixflowSharedAppConfigNotification) => void,
): () => void {
  if (typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') return () => undefined;
  let channel: BroadcastChannel;
  try {
    channel = new window.BroadcastChannel(SHARED_APP_CONFIG_CHANNEL);
  } catch {
    return () => undefined;
  }
  const onMessage = (event: MessageEvent) => {
    const notification = sanitizePixflowSharedAppConfigNotification(event.data);
    if (notification) onNotification(notification);
  };
  channel.addEventListener('message', onMessage);
  return () => {
    channel.removeEventListener('message', onMessage);
    channel.close();
  };
}
