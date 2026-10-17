// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { resolveEditorRunTarget } from '../../src/pixflow/editor-run-target';
afterEach(() => { vi.useRealTimers(); delete (window as any).pixflowEtchCanvas; delete (window as any).pixflowElementorCanvas; delete (window as any).pixflowGutenbergCanvas; });
it.each(['etch', 'elementor', 'gutenberg'] as const)('waits for the originating %s relay instead of allowing discovery to substitute a tab', async builder => {
  vi.useFakeTimers();
  const property = builder === 'gutenberg' ? 'pixflowGutenbergCanvas' : builder === 'etch' ? 'pixflowEtchCanvas' : 'pixflowElementorCanvas';
  const pending = resolveEditorRunTarget({ context: { editor: builder, object: { id: 42 } } }, new AbortController().signal);
  (window as any)[property] = { canvasId: 'local-tab', postId: 42, connected: false };
  let settled = false; void pending.then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(1000);
  expect(settled).toBe(false);
  (window as any)[property].connected = true;
  await vi.advanceTimersByTimeAsync(200);
  expect(await pending).toEqual({ builder, canvasId: 'local-tab', postId: 42 });
});
it('clearly fails when the originating editor never connects', async () => {
  vi.useFakeTimers();
  const pending = resolveEditorRunTarget({ context: { editor: 'etch' } }, new AbortController().signal);
  const failure = expect(pending).rejects.toThrow('another tab will not take over');
  await vi.advanceTimersByTimeAsync(21000); await failure;
});
it('rejects a page switch before submission and leaves non-builder requests unpinned', async () => {
  (window as any).pixflowEtchCanvas = { canvasId: 'local-tab', postId: 43, connected: true };
  await expect(resolveEditorRunTarget({ context: { editor: 'etch', object: { id: 42 } } }, new AbortController().signal)).rejects.toThrow('changed pages');
  expect(await resolveEditorRunTarget({ context: { editor: 'wordpress' } }, new AbortController().signal)).toBeUndefined();
});
