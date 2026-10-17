import { gutenbergEntity, watchGutenbergHistory } from './gutenberg-entity';
import { pixflowWordPressRestFetch } from './runtime-fetch';
import { gutenbergPostId, executeGutenberg, type GutenbergApi, type GutenbergCommand } from './gutenberg-native-tools';
import { withEditorSaveResult } from './editor-save-result';
import { createGutenbergPresence, snapshotGutenbergBlocks, changedGutenbergTargets } from './gutenberg-presence';

type Completion = { action: 'complete'; canvasId: string; commandId: string; result: Record<string, unknown> };
const storageKey = 'pixflow:gutenberg-canvas';
/** Visual feedback must never fail, repeat or change an editor operation. */
function feedback<T>(action: () => T): T | undefined { try { return action(); } catch { return undefined; } }
export function startGutenbergCanvas(getApi: () => GutenbergApi | undefined): () => void {
  const presence = createGutenbergPresence(() => { try { const e = gutenbergEntity(getApi()!); return e.type + ':' + e.id; } catch { return ''; } });
  let active = true, failures = 0;
  let stopHistory: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let id: string | undefined, completion: Completion | undefined;
  let registeredEntity: string | undefined;
  let releaseLock: (() => void) | undefined;
  let initialized = false;
  let polling = false;
  let needsRegistration = false;
  const request = async (body: Record<string, unknown>) => {
    const response = await pixflowWordPressRestFetch('/wp-admin/direct/canvas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, builder: 'gutenberg', entity: gutenbergEntity(getApi()!) }),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.message || `Gutenberg connection: HTTP ${response.status}`);
    return value;
  };
  const persist = () => {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ canvasId: id, completion })); } catch { /* Optional recovery storage. */ }
  };
  // A navigation result must not reach the agent before the relay knows its new target.
  const deliverCompletion = async (gutenberg: GutenbergApi) => {
    if (!completion) return;
    const postId = gutenbergPostId(gutenberg);
    if (JSON.stringify(gutenbergEntity(gutenberg)) !== registeredEntity) {
      await request({ action: 'register', postId, canvasId: id, hasCompletion: true });
      registeredEntity = JSON.stringify(gutenbergEntity(gutenberg));
      (window as any).pixflowGutenbergCanvas = { canvasId: id, postId, entity: gutenbergEntity(gutenberg) };
    }
    await request(completion);
    completion = undefined;
    persist();
  };
  const claim = async (key: string): Promise<boolean> => {
    if (!navigator.locks) return false; // No lock: register a fresh identity, never resume another tab's edit.
    return new Promise(resolve => {
      void navigator.locks.request(`pixflow-gutenberg:${key}`, { ifAvailable: true }, async lock => {
        if (!lock || !active) { resolve(false); return; }
        resolve(true);
        await new Promise<void>(release => { releaseLock = release; });
      }).catch(() => resolve(false));
    });
  };
  const poll = async () => {
    if (polling || !active) return;
    polling = true;
    try {
      const gutenberg = getApi();
      if (!gutenberg) throw new Error('Waiting for Gutenberg to initialize.');
      stopHistory ??= watchGutenbergHistory(gutenberg);
      if (!initialized) {
        initialized = true;
        let saved;
        try { saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { /* Optional storage. */ }
        if (saved?.canvasId && await claim(saved.canvasId)) { id = saved.canvasId; completion = saved.completion; }
        else { id = undefined; completion = undefined; }
      }
      if (!id || needsRegistration || !(window as any).pixflowGutenbergCanvas) {
        const postId = gutenbergPostId(gutenberg);
        const registered = await request({ action: 'register', postId, canvasId: id, hasCompletion: Boolean(completion) });
        if (registered.canvasId !== id) { releaseLock?.(); await claim(registered.canvasId); }
        id = registered.canvasId;
        registeredEntity = JSON.stringify(gutenbergEntity(gutenberg));
        needsRegistration = false;
        persist();
      }
      (window as any).pixflowGutenbergCanvas = { canvasId: id, postId: gutenbergPostId(gutenberg), entity: gutenbergEntity(gutenberg), connected: failures === 0 };
      await deliverCompletion(gutenberg);
      feedback(() => presence.syncDocument());
      const polledPostId = gutenbergPostId(gutenberg);
      const response = await request({ action: 'poll', canvasId: id, postId: polledPostId });
      registeredEntity = JSON.stringify(gutenbergEntity(gutenberg));
      if (response.command) {
        let result: Record<string, unknown>;
        try {
          if (!active) throw new Error('Editor disconnected before execution.');
          feedback(() => presence.begin());
          const before = feedback(() => snapshotGutenbergBlocks(gutenberg));
          const value = await withEditorSaveResult(() => executeGutenberg(gutenberg, response.command as GutenbergCommand));
          feedback(() => {
            const changes = before ? changedGutenbergTargets(before, snapshotGutenbergBlocks(gutenberg)) : [];
            if (changes.length) presence.show(changes);
          });
          // Serialize before claiming success; circular results must not replay the edit.
          result = JSON.parse(JSON.stringify({ ok: true, result: value }));
        } catch (error) {
          feedback(() => presence.clear());
          const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : String(error);
          result = { ok: false, error: message, inspectBeforeRetry: true };
        }
        feedback(() => presence.finish({saved:response.command.tool === 'gutenberg.save' && result.ok === true}));
        completion = { action: 'complete', canvasId: id!, commandId: response.command.id, result };
        persist();
        await deliverCompletion(gutenberg);
      }
      failures = 0;
      (window as any).pixflowGutenbergCanvas.connected = true;
      window.dispatchEvent(new CustomEvent('pixflow-design:gutenberg-connection', { detail: { connected: true, canvasId: id, postId: gutenbergPostId(gutenberg) } }));
    } catch (error) {
      failures++;
      needsRegistration = true;
      if ((window as any).pixflowGutenbergCanvas) (window as any).pixflowGutenbergCanvas.connected = false;
      window.dispatchEvent(new CustomEvent('pixflow-design:gutenberg-connection', { detail: { connected: false, error: failures >= 5 ? 'This editor could not reconnect. Live editing is paused; reload this tab to recover. ' + String(error) : String(error) } }));
    }
    polling = false;
    if (active) timer = setTimeout(() => void poll(), failures ? Math.min(30000, 1000 * 2 ** Math.min(failures, 5)) : 1500);
  };
  const reconnect = () => { clearTimeout(timer); void poll(); };
  window.addEventListener('pixflow-design:gutenberg-reconnect', reconnect);
  void poll();
  return () => { window.removeEventListener('pixflow-design:gutenberg-reconnect', reconnect); active = false; stopHistory?.(); presence.dispose(); clearTimeout(timer); releaseLock?.(); delete (window as any).pixflowGutenbergCanvas; };
}

