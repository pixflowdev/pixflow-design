import { sameGutenbergEntity } from './gutenberg-entity';
import type { PixflowEditorTarget } from '@open-design/contracts';

/** Resolve only this window's relay. Discovery of other tabs is never recovery. */
export async function resolveEditorRunTarget(input: { canvasId?: string; canvasPostId?: number; context?: unknown }, signal: AbortSignal): Promise<PixflowEditorTarget | undefined> {
  const context = input.context as { editor?: string; gutenbergEntity?: import('@open-design/contracts').PixflowGutenbergEntity; object?: { id?: number } } | undefined;
  const builder = context?.editor === 'etch' || context?.editor === 'elementor' || context?.editor === 'gutenberg' ? context.editor : input.canvasId ? 'bricks' : undefined;
  if (!builder) return;
  if (builder === 'bricks') return { builder, canvasId: input.canvasId!, postId: input.canvasPostId! };
  const property = builder === 'gutenberg' ? 'pixflowGutenbergCanvas' : builder === 'etch' ? 'pixflowEtchCanvas' : 'pixflowElementorCanvas';
  window.dispatchEvent(new CustomEvent(`pixflow-design:${builder}-reconnect`));
  const deadline = Date.now() + 20_000;
  while (true) {
    signal.throwIfAborted();
    const canvas = (window as unknown as Record<string, any>)[property];
    if (canvas?.canvasId && canvas.connected !== false && (canvas.postId > 0 || (builder === 'gutenberg' && canvas.entity))) {
      if (builder === 'gutenberg' && context?.gutenbergEntity && !sameGutenbergEntity(canvas.entity, context.gutenbergEntity)) throw new Error('The editor changed documents before this request started. Submit it again from the intended document.');
      if (context?.object?.id && Number(context.object.id) !== canvas.postId) throw new Error('The editor changed pages before this request started. Submit it again from the intended page.');
      return { builder, canvasId: canvas.canvasId, postId: canvas.postId, ...(builder === 'gutenberg' && canvas.entity ? {entity: canvas.entity} : {}) };
    }
    if (Date.now() >= deadline) throw new Error(`Could not reconnect this ${builder === 'gutenberg' ? 'Gutenberg' : builder === 'etch' ? 'Etch' : 'Elementor'} tab. Your request has not started and no edits were applied. Reload this editor and try again; another tab will not take over.`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}
