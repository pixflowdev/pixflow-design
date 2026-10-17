import { blockExtension, integrationInput, prepareIntegrationBlocks, settleIntegrationBlocks, integrationStyles, assertIntegrationTree } from './gutenberg-extensions';
import { siteAuthoring, assertSiteAuthoring } from './gutenberg-site-authoring';
import { liveGutenbergPatterns } from './gutenberg-patterns';
import type { PixflowGutenbergEntity } from '@open-design/contracts';
import { gutenbergEntity, sameGutenbergEntity, sharedGutenbergEntity, assertGutenbergBlockOwner, assertGutenbergHistory } from './gutenberg-entity';
/** Native editor operations. Gutenberg owns serialization, history and saving. */
export type GutenbergApi = { data: { subscribe?: (listener: () => void) => () => void; resolveSelect?: (store: string) => any; select: (store: string) => any; dispatch: (store: string) => any }; blocks: { createBlock: (name: string, attributes: Record<string, unknown>, children: any[]) => any; getBlockType: (name: string) => any; getBlockTypes: () => any[]; getBlockVariations?: (name: string) => any[] | undefined } };
export type GutenbergCommand = { tool: string; arguments: Record<string, any>; postId?: number; entity?: PixflowGutenbergEntity };
export function gutenbergPostId(wp: GutenbergApi): number {
  return Number(gutenbergEntity(wp).id) || 0;
}

export function withGutenbergTarget<T extends Record<string, any>>(context: T): T {
  if (!(window as any).pixflowGutenbergEditor) return context;
  const id = gutenbergPostId((window as any).wp);
  return { ...context, editor: 'gutenberg', object: { ...context.object, id }, gutenbergEntity: gutenbergEntity((window as any).wp), gutenbergCanvas: (window as any).pixflowGutenbergCanvas };
}

async function snapshot(wp: GutenbergApi) {
  const editor = wp.data.select('core/editor'), blocks = wp.data.select('core/block-editor');
  const tree = blocks.getBlocks();
  const content = editor.getEditedPostContent();
  const title = editor.getEditedPostAttribute('title');
  const entity = gutenbergEntity(wp);
  const settings = () => [editor.getEditedPostAttribute('meta'), editor.getEditedPostAttribute('status')];
  const serialized = JSON.stringify([entity, tree, content, title, settings()]);
  const bytes = new TextEncoder().encode(serialized);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  // Hashing yields to the editor. Never dispatch against a snapshot changed by typing meanwhile.
  if (serialized !== JSON.stringify([gutenbergEntity(wp), blocks.getBlocks(), editor.getEditedPostContent(), editor.getEditedPostAttribute('title'), settings()])) throw new Error('The live document changed. Read it again before editing; no operation was applied.');
  return { entity, shared: sharedGutenbergEntity(entity), postId: gutenbergPostId(wp), postType: editor.getCurrentPostType(), title, revision: Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join(''), blocks: tree, content, dirty: editor.isEditedPostDirty(), selectedClientId: blocks.getSelectedBlockClientId(), canUndo: editor.hasEditorUndo(), canRedo: editor.hasEditorRedo() };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 100));
/** Check the whole prospective tree before dispatch, including children not yet in the store. */
function validateTree(wp: GutenbergApi, blocks: any[], ancestors: any[], limit = 100): void {
  const globallyAllowed = wp.data.select('core/block-editor').getSettings?.().allowedBlockTypes;
  let count = 0;
  const visit = (items: any[], parents: any[]) => items.forEach(item => {
    if (++count > limit) throw new Error('Supply at most 100 blocks including nested children.');
    const type = wp.blocks.getBlockType(item.name), parent = parents[0];
    if (globallyAllowed === false || (Array.isArray(globallyAllowed) && !globallyAllowed.includes(item.name))) throw new Error(`${item.name} is not allowed by this editor.`);
    if (type.parent?.length && !type.parent.includes(parent?.name)) throw new Error(`${item.name} requires its registered parent block.`);
    if (type.ancestor?.length && !parents.some(p => type.ancestor.includes(p.name))) throw new Error(`${item.name} requires its registered ancestor block.`);
    const allowed = parent?.attributes?.allowedBlocks ?? (parent && wp.blocks.getBlockType(parent.name)?.allowedBlocks);
    if (Array.isArray(allowed) && !allowed.includes(item.name)) throw new Error(`${item.name} is not allowed inside ${parent.name}.`);
    visit(item.innerBlocks ?? [], [item, ...parents]);
  });
  visit(blocks, ancestors);
}
function create(wp: GutenbergApi, spec: any, depth = 0): any {
  if (depth > 30 || !spec || typeof spec.name !== 'string' || !wp.blocks.getBlockType(spec.name)) throw new Error('Unknown or invalid block. Inspect gutenberg.schema first.');
  if (spec.name === 'core/missing' || spec.name.startsWith('etch/')) throw new Error('This block cannot be authored through the Gutenberg connection.');
  return wp.blocks.createBlock(spec.name, attributes(wp, spec.name, integrationInput(spec.name, spec.attributes ?? {}, true)), (spec.innerBlocks ?? []).map((child: any) => create(wp, child, depth + 1)));
}
function attributes(wp: GutenbergApi, name: string, input: any): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Block attributes must be an object.');
  const schema = wp.blocks.getBlockType(name)?.attributes ?? {};
  for (const [key, value] of Object.entries(input)) {
    if (!schema[key]) throw new Error(`Unknown ${name} attribute: ${key}. Read gutenberg.schema.`);
    // Some installed blocks declare object attributes with an empty-array default.
    // Accept their own canonical default when copying a native read result.
    if ('default' in schema[key] && JSON.stringify(value) === JSON.stringify(schema[key].default)) continue;
    const type = schema[key].type;
    if (value != null && type && (type === 'array' ? !Array.isArray(value) : type === 'object' ? typeof value !== 'object' || Array.isArray(value) : type === 'integer' ? !Number.isInteger(value) : type === 'rich-text' ? typeof value !== 'string' : typeof value !== type)) throw new Error(`Invalid type for ${name}.${key}.`);
    if (schema[key].enum && !schema[key].enum.includes(value)) throw new Error(`Invalid value for ${name}.${key}.`);
  }
  return input;
}

export async function executeGutenberg(wp: GutenbergApi, command: GutenbergCommand): Promise<unknown> {
  const { tool, arguments: args } = command;
  const postId = gutenbergPostId(wp);
  const entity = gutenbergEntity(wp), shared = sharedGutenbergEntity(entity);
  if ((shared || args.expectedEntity || command.entity) && (!sameGutenbergEntity(args.expectedEntity, entity) || (command.entity && !sameGutenbergEntity(command.entity, entity)))) throw new Error('The Gutenberg editor is showing a different document. No operation was applied.');
  if (!shared && (Number(args.expectedPostId) !== postId || (command.postId && command.postId !== postId))) throw new Error('The Gutenberg editor is showing a different post. No operation was applied.');
  assertSiteAuthoring(tool, shared);
  const view = wp.data.select('core/block-editor'), edit = wp.data.dispatch('core/block-editor');
  const editor = wp.data.select('core/editor'), post = wp.data.dispatch('core/editor');
  if (tool === 'gutenberg.schema') return wp.blocks.getBlockTypes().filter((type: any) => (!args.name || type.name === args.name) && (() => { try { blockExtension(type.name); return true; } catch { return false; } })()).map((type: any) => ({ name: type.name, title: type.title, attributes: type.attributes, supports: type.supports, parent: type.parent, ancestor: type.ancestor, allowedBlocks: type.allowedBlocks, usesContext: type.usesContext, providesContext: type.providesContext, ...(blockExtension(type.name)?.schema(wp, type.name, !!args.name) ?? {}) }));
  const before = await snapshot(wp);
  if (tool === 'gutenberg.read') return before;
  if (tool === 'gutenberg.entities') return siteAuthoring().documents(wp, tool, args);
  if (tool === 'gutenberg.styles' && ['list', 'read'].includes(args.action)) return integrationStyles(wp, args);
  assertIntegrationTree(before.blocks);
  if (!args.expectedRevision || args.expectedRevision !== before.revision) throw new Error('The live document changed. Read it again before editing; no operation was applied.');
  if (shared && args.confirmShared !== true) throw new Error('This is a shared document. Confirm that the requested change should affect every place it is used, then pass confirmShared: true.');
  if (tool === 'gutenberg.create') return siteAuthoring().documents(wp, tool, args);
  if (tool === 'gutenberg.styles') return integrationStyles(wp, args, async () => {
    if ((await snapshot(wp)).revision !== before.revision) throw new Error('The live document changed while preparing styles. Read it again; no global style was saved.');
  });
  if (editor.isSavingPost() || editor.isPostLocked?.()) throw new Error('The document is saving or locked by another user. Wait and read it again.');
  const block = args.clientId ? view.getBlock(args.clientId) : undefined;
  if (args.clientId && !block) throw new Error('That block no longer exists. Read the editor again.');
  if (args.clientId) assertGutenbergBlockOwner(wp, args.clientId);
  if (args.rootClientId) {
    assertGutenbergBlockOwner(wp, args.rootClientId);
    if (['core/block', 'core/template-part', 'core/navigation'].includes(view.getBlock(args.rootClientId)?.name)) throw new Error('Open the shared item in its own editor before changing its children.');
  }
  if (tool === 'gutenberg.undo' || tool === 'gutenberg.redo') {
    assertGutenbergHistory(wp);
    const dirty = wp.data.select('core').__experimentalGetDirtyEntityRecords?.() ?? [];
    if (dirty.some((item: any) => item.kind !== 'postType' || item.name !== entity.type || String(item.key) !== entity.id)) throw new Error('Other documents have unsaved changes. Use native Undo/Redo to review the shared editor history.');
  }
  switch (tool) {
    case 'gutenberg.insert': {
      const parent = args.rootClientId || '';
      if (parent && !view.getBlock(parent)) throw new Error('The parent block no longer exists.');
      if (!Array.isArray(args.blocks) || !args.blocks.length || args.blocks.length > 100) throw new Error('Supply between 1 and 100 blocks.');
      const blocks = args.blocks.map((spec: any) => create(wp, spec));
      validateTree(wp, blocks, parent ? [view.getBlock(parent), ...view.getBlockParents(parent).slice().reverse().map((id: string) => view.getBlock(id))] : []);
      const validate = (items: any[], root: string) => { for (const item of items) { if (!view.canInsertBlockType(item.name, root)) throw new Error(`Inserting ${item.name} is locked or not allowed here.`); } };
      validate(blocks, parent);
      await prepareIntegrationBlocks(blocks);
      await liveGutenbergPatterns(blocks, entity);
      if ((await snapshot(wp)).revision !== before.revision) throw new Error('The live document changed while preparing navigation. Read it again; no blocks were inserted.');
      const count = view.getBlockOrder(parent).length;
      if (args.index != null && (!Number.isInteger(args.index) || args.index < 0 || args.index > count)) throw new Error('Invalid insertion index.');
      await edit.insertBlocks(blocks, args.index ?? count, parent, false);
      await settle();
      if (blocks.some((item: any) => !view.getBlock(item.clientId))) throw new Error('Gutenberg rejected the insertion. Inspect the editor before retrying.');
      break;
    }
    case 'gutenberg.update':
      if (!block) throw new Error('Select a clientId from gutenberg.read.');
      if (view.getBlockEditingMode?.(block.clientId) === 'disabled' || view.getTemplateLock?.(view.getBlockRootClientId(block.clientId)) === 'all') throw new Error('This block is locked for editing.');
      await prepareIntegrationBlocks([{ name: block.name, attributes: { ...block.attributes, ...args.attributes } }]);
      await liveGutenbergPatterns([{ name: block.name, attributes: { ...block.attributes, ...args.attributes } }], entity);
      if ((await snapshot(wp)).revision !== before.revision) throw new Error('The live document changed while checking shared resources. Read it again; no blocks were changed.');
      await edit.updateBlockAttributes(block.clientId, attributes(wp, block.name, integrationInput(block.name, args.attributes, false)));
      break;
    case 'gutenberg.remove':
      if (!block || !view.canRemoveBlock(block.clientId)) throw new Error('This block cannot be removed.');
      await edit.removeBlocks([block.clientId], false);
      break;
    case 'gutenberg.move': {
      const parent = args.rootClientId || '';
      if (!block || !view.canMoveBlock(block.clientId) || (parent && !view.getBlock(parent)) || !view.canInsertBlockType(block.name, parent)) throw new Error('This block cannot be moved there.');
      if (parent === block.clientId || view.getBlockParents(parent).includes(block.clientId)) throw new Error('A block cannot be moved inside itself.');
      if (!Number.isInteger(args.index) || args.index < 0 || args.index > view.getBlockOrder(parent).length) throw new Error('Invalid destination index.');
      validateTree(wp, [block], parent ? [view.getBlock(parent), ...view.getBlockParents(parent).slice().reverse().map((id: string) => view.getBlock(id))] : [], Infinity);
      await edit.moveBlocksToPosition([block.clientId], view.getBlockRootClientId(block.clientId), parent, args.index);
      break;
    }
    case 'gutenberg.undo':
      if (!before.canUndo) throw new Error('There is nothing to undo.');
      await post.undo(); break;
    case 'gutenberg.redo':
      if (!before.canRedo) throw new Error('There is nothing to redo.');
      await post.redo(); break;
    case 'gutenberg.save':
      if (editor.isPostSavingLocked?.()) throw new Error('Saving is currently locked by the editor.');
      await settleIntegrationBlocks(wp, () => {
        if (!sameGutenbergEntity(gutenbergEntity(wp), entity)) throw new Error('The open document changed. No save was sent.');
      });
      if (shared) {
        await siteAuthoring().save(wp, entity);
      } else {
        await post.savePost();
        if (!editor.didPostSaveRequestSucceed() || editor.didPostSaveRequestFail()) throw new Error('WordPress did not save this document. Check the editor notice; your unsaved work remains in this tab.');
      }
      break;
    default: throw new Error('Unknown Gutenberg operation.');
  }
  await settle();
  if (tool !== 'gutenberg.save') await settleIntegrationBlocks(wp, () => {
    if (!sameGutenbergEntity(gutenbergEntity(wp), entity)) throw new Error('The open document changed. Read the intended editor again.');
  });
  return { ...await snapshot(wp), saved: tool === 'gutenberg.save' };
}
