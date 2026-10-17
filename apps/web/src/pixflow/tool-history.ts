import { directTabStorageKey } from './direct-tab-storage';
import { getPixflowWordPressConfig } from './wordpress-context';
import { pixflowRuntimeFetch, pixflowWordPressRestFetch } from './runtime-fetch';
import type { PixflowDirectToolHistoryResponse } from '@open-design/contracts';

const commandKey = () => directTabStorageKey('pixflow:clear-tool-history');
const commandEvent = 'pixflow:clear-tool-history';

export function clearCompletedToolEvents<T extends { events?: unknown[]; status?: string; runStatus?: string }>(messages: T[]): T[] {
  return messages.map(message => {
    if (message.status === 'streaming' || ['running', 'interrupted'].includes(message.runStatus || '')) return message;
    return {...message, events: message.events?.filter(event => !event || typeof event !== 'object' || !['tool_use','tool_result','tool_input_delta'].includes(String((event as {kind?:string}).kind)))};
  });
}

/** Only this site's/user's saved display transcript is touched. Recovery and queues are excluded. */
export function clearBrowserToolHistory(): number {
  const config = getPixflowWordPressConfig();
  if (!config?.siteHash || !config.userId) throw new Error('Reopen Pixflow from WordPress before clearing browser tool history.');
  const adminKey = `pixflow-direct:${config.siteHash}:${config.userId}`;
  const bricksPrefix = directTabStorageKey('pixflow-design:bricks-agent:working-memory:v2') + ':';
  let cleared = 0;
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (const key of Object.keys(storage)) {
      if (key !== adminKey && key !== `pixflow:admin-transcript:${adminKey}` && !key.startsWith(bricksPrefix)) continue;
      let saved: unknown;
      try { saved = JSON.parse(storage.getItem(key) || 'null'); } catch { continue; }
      const messages = Array.isArray(saved) ? saved : (saved as {messages?:unknown[]})?.messages;
      if (!Array.isArray(messages)) continue;
      const next = clearCompletedToolEvents(messages);
      if (JSON.stringify(messages) === JSON.stringify(next)) continue;
      storage.setItem(key, JSON.stringify(Array.isArray(saved) ? next : {...saved as object, messages:next}));
      cleared++;
    }
  }
  // Other open panels drop their matching display logs too, preventing a later
  // transcript write from resurrecting the just-cleared diagnostics.
  localStorage.setItem(commandKey(), String(Date.now()));
  window.dispatchEvent(new Event(commandEvent));
  return cleared;
}

export function onToolHistoryCleared(clear: () => void): () => void {
  const key = commandKey();
  const storage = (event: StorageEvent) => { if (event.key === key && event.newValue) clear(); };
  window.addEventListener(commandEvent, clear);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(commandEvent, clear); window.removeEventListener('storage', storage); };
}

export async function clearBridgeToolHistory(): Promise<PixflowDirectToolHistoryResponse> {
  const opened = await pixflowWordPressRestFetch('/wp-admin/direct/sessions', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'design'})});
  if (!opened.ok) throw new Error('Reconnect to WordPress before clearing Bridge tool history.');
  const session = await opened.json();
  const response = await pixflowRuntimeFetch('/api/pixflow/direct-site/history-clear', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session}),signal:AbortSignal.timeout(20_000)});
  if (response.status === 404) throw new Error('Update and restart Bridge to use tool-history cleanup.');
  if (!response.ok) throw new Error('Could not clear Bridge tool history. Check the Bridge connection and try again.');
  return response.json();
}
