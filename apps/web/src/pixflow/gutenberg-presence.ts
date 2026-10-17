import { createNativeEditorPresence, type PresenceTarget } from './native-editor-presence';
import type { GutenbergApi } from './gutenberg-native-tools';

type Block = { clientId: string; name: string; attributes: Record<string, unknown>; innerBlocks?: Block[] };
type Entry = { block: Block; parent: string; index: number; signature: string };
export function snapshotGutenbergBlocks(api: GutenbergApi): Map<string, Entry> {
  const result = new Map<string, Entry>();
  const visit = (blocks: Block[], parent = '') => blocks.forEach((block, index) => {
    result.set(block.clientId, {block,parent,index,signature:JSON.stringify([block.name,block.attributes])});
    visit(block.innerBlocks ?? [], block.clientId);
  });
  visit(api.data.select('core/block-editor').getBlocks());
  return result;
}
/** Diff native identities and attributes, including history and structural edits. */
export function changedGutenbergTargets(before: Map<string, Entry>, after: Map<string, Entry>): PresenceTarget[] {
  const ids = new Set<string>();
  for (const [id, item] of after) {
    const old = before.get(id);
    // Inserting/removing a sibling changes indices but does not edit every remaining block.
    const survivingSiblings = (source: Map<string, Entry>, other: Map<string, Entry>) => [...source]
      .filter(([key, entry]) => entry.parent === item.parent && other.get(key)?.parent === item.parent).map(([key]) => key);
    const reordered = old && survivingSiblings(before, after).indexOf(id) !== survivingSiblings(after, before).indexOf(id);
    if (!old || old.signature !== item.signature || old.parent !== item.parent || reordered) ids.add(id);
  }
  for (const [id, old] of before) if (!after.has(id) && after.has(old.parent)) ids.add(old.parent);
  return [...ids].filter(id => ![...ids].some(child => {
    let parent = after.get(child)?.parent;
    while (parent) { if (parent === id) return true; parent = after.get(parent)?.parent; }
    return false;
  })).slice(0, 20).map(id => ({id,label:after.get(id)!.block.name.replace('core/','').replaceAll('-',' '),scope:/^core\/(group|columns|column|cover|media-text|query|post-template)$/.test(after.get(id)!.block.name) ? 'layout' : 'content'}));
}
export function createGutenbergPresence(getPostId: () => number | string) {
  return createNativeEditorPresence(getPostId, {builder:'gutenberg',iframeSelector:'iframe[name="editor-canvas"]',targetSelector:id=>`[data-block="${CSS.escape(id)}"]`});
}
