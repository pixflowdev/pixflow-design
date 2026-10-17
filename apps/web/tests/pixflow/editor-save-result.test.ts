// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { withEditorSaveResult } from '../../src/pixflow/editor-save-result';
it('rejects a native save which silently resolved after an HTTP conflict', async () => {
  await expect(withEditorSaveResult(async () => {
    window.dispatchEvent(new Event('pixflow-design:editor-save-conflict'));
    return { saved: true };
  })).rejects.toThrow('another editor saved');
  await expect(withEditorSaveResult(async () => ({ saved: true }))).resolves.toEqual({ saved: true });
});
it('reports a detected conflict even when the native save rejects with an opaque object', async () => {
  await expect(withEditorSaveResult(async () => {
    window.dispatchEvent(new Event('pixflow-design:editor-save-conflict'));
    throw { status: 409 };
  })).rejects.toThrow('another editor saved a newer version');
});
