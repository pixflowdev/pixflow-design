// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn(), execute: vi.fn(), feedback: vi.fn() }));
vi.mock('../../src/pixflow/gutenberg-presence', () => ({ createGutenbergPresence: () => ({begin:mocks.feedback,show:mocks.feedback,finish:mocks.feedback,clear:mocks.feedback,syncDocument:mocks.feedback,dispose:vi.fn()}), snapshotGutenbergBlocks:()=>new Map(),changedGutenbergTargets:()=>[] }));
vi.mock('../../src/pixflow/runtime-fetch', () => ({ pixflowWordPressRestFetch: mocks.request }));
vi.mock('../../src/pixflow/gutenberg-native-tools', () => ({ gutenbergPostId: (api: any) => api.postId, executeGutenberg: mocks.execute }));
vi.mock('../../src/pixflow/gutenberg-entity', () => ({watchGutenbergHistory:()=>()=>{},gutenbergEntity:(api:any)=>({type:'page',id:String(api.postId)})}));
import { startGutenbergCanvas } from '../../src/pixflow/gutenberg-canvas-connection';
let stop: (() => void) | undefined;
beforeEach(() => { vi.useFakeTimers(); sessionStorage.clear(); mocks.feedback.mockReset(); mocks.request.mockReset(); mocks.execute.mockReset().mockResolvedValue({ saved: true }); });
afterEach(() => { stop?.(); vi.useRealTimers(); vi.restoreAllMocks(); });
const reply = (value: unknown) => ({ ok: true, json: async () => value });
it('retries a lost completion without replaying the native mutation', async () => {
  mocks.feedback.mockImplementation(() => { throw new Error('Detached feedback document'); });
  let issued = false, completions = 0;
  mocks.request.mockImplementation(async (_url, init) => {
    const body = JSON.parse(init.body); expect(body.builder).toBe('gutenberg');
    if (body.action === 'register') return reply({ canvasId: 'a'.repeat(32) });
    if (body.action === 'complete') { expect(body.result.ok).toBe(true); if (++completions === 1) throw new Error('Connection lost after acknowledgment'); return reply({ accepted: false }); }
    if (!issued) { issued = true; return reply({ command: { id: 'b'.repeat(32), tool: 'gutenberg.save', arguments: { expectedPostId: 42 } } }); }
    return reply({ command: null });
  });
  stop = startGutenbergCanvas(() => ({ postId: 42 }) as any);
  await vi.advanceTimersByTimeAsync(5000);
  expect(mocks.execute).toHaveBeenCalledOnce(); expect(completions).toBe(2);
  expect(JSON.parse(sessionStorage.getItem('pixflow:gutenberg-canvas')!).completion).toBeUndefined();
});
it('waits for hydration and reconnects the same tab despite unavailable optional storage', async () => {
  let ready = false, offline = false; const registrations: any[] = [];
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage full'); });
  mocks.request.mockImplementation(async (_url, init) => {
    const body = JSON.parse(init.body);
    if (offline) throw new Error('Offline');
    if (body.action === 'register') { registrations.push(body); return reply({ canvasId: 'c'.repeat(32) }); }
    return reply({ command: null });
  });
  stop = startGutenbergCanvas(() => ready ? ({ postId: 42 } as any) : undefined);
  await vi.advanceTimersByTimeAsync(1000); expect(mocks.request).not.toHaveBeenCalled();
  ready = true; await vi.advanceTimersByTimeAsync(4000);
  offline = true; await vi.advanceTimersByTimeAsync(2000);
  expect((window as any).pixflowGutenbergCanvas.connected).toBe(false);
  offline = false; window.dispatchEvent(new CustomEvent('pixflow-design:gutenberg-reconnect'));
  await vi.advanceTimersByTimeAsync(100);
  expect(registrations.at(-1).canvasId).toBe('c'.repeat(32));
  expect((window as any).pixflowGutenbergCanvas.connected).toBe(true);
});
