import type { PixflowGutenbergEntity } from '@open-design/contracts';
import type { GutenbergApi } from './gutenberg-native-tools';

/** Optional implementation, separate from retained reference/history safety. */
export interface GutenbergSiteAuthoring {
  documents(wp: GutenbergApi, tool: string, args: Record<string, any>): Promise<unknown>;
  save(wp: GutenbergApi, entity: PixflowGutenbergEntity): Promise<void>;
}
export function siteAuthoring(): GutenbergSiteAuthoring {
  const owner = typeof window === 'undefined' ? undefined : (window as any).PixflowGutenbergSiteAuthoring as GutenbergSiteAuthoring | undefined;
  if (!owner) throw new Error('Pixflow Site Editor, template and shared-pattern authoring requires Pro. Existing content and WordPress native editing remain available.');
  return owner;
}
export function assertSiteAuthoring(tool: string, shared: boolean): void {
  if (tool === 'gutenberg.entities' || tool === 'gutenberg.create' || (shared && !['gutenberg.read', 'gutenberg.schema'].includes(tool) && !(window as any).PixflowGutenbergReadCommands?.[tool])) siteAuthoring();
}
