const eventName = 'pixflow-design:chat-library-changed';
// Same-origin invalidation crosses editor iframe and host configuration shapes.
// No identities or chat data are sent; every reader remains permission-scoped.
const channelName = () => eventName;
/** Broadcast invalidation only. Each surface reloads through its authorized API. */
export function notifyChatLibraryChanged(origin?: string) {
  window.dispatchEvent(new CustomEvent(eventName, { detail: origin }));
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(channelName());
  channel.postMessage(origin); channel.close();
}
export function subscribeChatLibrary(refresh: () => void, origin?: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 100); };
  const receive = (event: Event | MessageEvent) => { const source = 'data' in event ? event.data : (event as CustomEvent).detail; if (!origin || source !== origin) schedule(); };
  const visible = () => { if (document.visibilityState === 'visible') schedule(); };
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName()) : null;
  if (channel) channel.onmessage = receive;
  window.addEventListener(eventName, receive);
  window.addEventListener('focus', visible);
  document.addEventListener('visibilitychange', visible);
  return () => { clearTimeout(timer); channel?.close(); window.removeEventListener(eventName, receive); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); };
}
