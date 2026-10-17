import type { GutenbergApi } from './gutenberg-native-tools';

/** Add-on bundles register before the core editor starts; Free imports no implementation. */
export type GutenbergExtension = {
  id: string;
  owns: (name: string) => boolean;
  input: (name: string, attributes: Record<string, any>, inserting: boolean) => Record<string, any>;
  schema: (wp: GutenbergApi, name: string, detailed: boolean) => Record<string, unknown>;
  prepare: (blocks: any[]) => Promise<void>;
  settle: (wp: GutenbergApi, assertTarget: () => void) => Promise<void>;
  styles?: (wp: GutenbergApi, args: Record<string, any>, ready?: () => Promise<void>) => Promise<unknown>;
  icons?: (icons: any[]) => void;
  sharedTypes?: string[];
  collections?: Record<string, { omitContent?: boolean; status: 'draft' | 'publish' }>;
  patternDetails?: (record: any) => Record<string, unknown>;
};
export const gutenbergExtensions = (): GutenbergExtension[] => typeof window === 'undefined' ? [] : ((window as any).PixflowGutenbergExtensions ?? []);
const ownedPrefixes = ['generateblocks/', 'generateblocks-pro/'];
export function blockExtension(name: string): GutenbergExtension | undefined {
  const extension = gutenbergExtensions().find(e => e.owns(name));
  if (!extension && ownedPrefixes.some(prefix => name.startsWith(prefix))) throw new Error('This block integration requires Pixflow Design Pro and its active plugin. Existing content is unchanged.');
  return extension;
}
export function integrationInput(name: string, attributes: Record<string, any>, inserting: boolean) {
  return blockExtension(name)?.input(name, attributes, inserting) ?? attributes;
}
export function assertIntegrationTree(blocks: any[]): void {
  for (const block of blocks) { blockExtension(block.name); assertIntegrationTree(block.innerBlocks ?? []); }
}
export async function prepareIntegrationBlocks(blocks: any[]): Promise<void> {
  assertIntegrationTree(blocks);
  for (const extension of gutenbergExtensions()) await extension.prepare(blocks);
}
export async function settleIntegrationBlocks(wp: GutenbergApi, assertTarget: () => void): Promise<void> {
  assertIntegrationTree(wp.data.select('core/block-editor').getBlocks());
  for (const extension of gutenbergExtensions()) await extension.settle(wp, assertTarget);
}
export function integrationStyles(wp: GutenbergApi, args: Record<string, any>, ready?: () => Promise<void>): Promise<unknown> {
  const owner = gutenbergExtensions().find(e => e.styles);
  if (!owner?.styles) throw new Error('No active Pro integration provides global block styles.');
  return owner.styles(wp, args, ready);
}
