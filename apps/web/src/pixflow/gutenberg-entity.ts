import { gutenbergExtensions } from './gutenberg-extensions';
import type { PixflowGutenbergEntity } from '@open-design/contracts';
import type { GutenbergApi } from './gutenberg-native-tools';

export function gutenbergEntity(wp: GutenbergApi): PixflowGutenbergEntity {
  const editor = wp.data.select('core/editor');
  const type = editor?.getCurrentPostType(), id = editor?.getCurrentPostId();
  if (!type || !id) throw new Error('Open a Gutenberg document to connect its editor.');
  return { type, id: String(id) };
}
export const sameGutenbergEntity = (a: unknown, b: PixflowGutenbergEntity): boolean => {
  const value = a as PixflowGutenbergEntity | undefined;
  return value?.type === b.type && String(value.id) === b.id;
};
export const sharedGutenbergEntity = (entity: PixflowGutenbergEntity): boolean => ['wp_template', 'wp_template_part', 'wp_block', 'wp_navigation', ...gutenbergExtensions().flatMap(e => e.sharedTypes ?? [])].includes(entity.type);

const mixedHistory = new WeakMap<GutenbergApi, boolean>();
/** WordPress history spans entities. Once mixed, native UI must decide what to undo. */
export function watchGutenbergHistory(wp: GutenbergApi): () => void {
  const initial = gutenbergEntity(wp);
  mixedHistory.set(wp, false);
  const observe = () => {
    try {
      const dirty = wp.data.select('core').__experimentalGetDirtyEntityRecords?.() ?? [];
      if (!sameGutenbergEntity(gutenbergEntity(wp), initial) || dirty.some((r:any) => r.kind !== 'postType' || r.name !== initial.type || String(r.key) !== initial.id)) mixedHistory.set(wp, true);
    } catch { /* Editor navigation can temporarily have no document. */ }
  };
  observe();
  return wp.data.subscribe?.(observe) ?? (() => {});
}
export function assertGutenbergHistory(wp: GutenbergApi): void {
  if (mixedHistory.get(wp)) throw new Error('This tab has shared history from other documents. Use native Undo/Redo to review it, or reopen this document before starting a new edit.');
}

/** Referenced entities are separate documents, never writable descendants of a page. */
export function assertGutenbergBlockOwner(wp: GutenbergApi, clientId: string): void {
  const view = wp.data.select('core/block-editor');
  const parents = view.getBlockParents(clientId) as string[];
  if (parents.some(id => ['core/block', 'core/template-part', 'core/navigation'].includes(view.getBlock(id)?.name))) {
    throw new Error('This block belongs to a shared pattern, template part or navigation. Open that item in its own editor before changing it.');
  }
}
