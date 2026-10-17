import { requestWordPressRest } from './license';
import { gutenbergExtensions } from './gutenberg-extensions';

/** Refresh native collection queries without touching the document or undo stack. */
export function mountGutenbergIcons(): () => void {
  let previous: string[] = [];
  let disposed = false;
  let generation = 0;
  const refresh = async () => {
    const requested = ++generation;
    const wp = (window as any).wp;
    if (!wp?.data) return;
    try {
      const response = await requestWordPressRest<{ native: boolean; icons: Array<{ collection: string; name: string; label: string; block: { name: string; attributes: Record<string, unknown> } }> }>('icons/packs/wordpress', { method: 'GET' });
      if (!response.ok || disposed || requested !== generation) return;
      for (const extension of gutenbergExtensions()) extension.icons?.(response.body.icons);
      const collections = [...new Set(response.body.icons.map(i => i.collection))];
      if (response.body.native) {
        const store = wp.data.dispatch('core');
        store.invalidateResolution('getEntityRecords', ['root', 'iconCollection']);
        store.invalidateResolution('getEntityRecords', ['root', 'icon', {}]);
        for (const collection of new Set([...previous, ...collections])) store.invalidateResolution('getEntityRecords', ['root', 'icon', { collection }]);
      } else {
        const settings = wp.data.select('core/block-editor').getSettings();
        const patterns = (settings.__experimentalBlockPatterns ?? []).filter((p: any) => !p.categories?.includes('pixflow-icons'));
        const core = wp.data.select('core');
        // Newer pre-Icon editors load server patterns through core-data. Updating
        // legacy settings alone leaves disabled/removed packs in that cache.
        if (typeof core?.getBlockPatterns === 'function') {
          wp.data.dispatch('core').invalidateResolution('getBlockPatterns', []);
          if (typeof core.getBlockPatternCategories === 'function') wp.data.dispatch('core').invalidateResolution('getBlockPatternCategories', []);
        }
        // WordPress 6.0 exposes those resolvers too, but its editor still reads
        // settings. Keep both surfaces current; newer editors deduplicate by name.
        for (const icon of response.body.icons) patterns.push({ name: icon.name, title: icon.label, categories: ['pixflow-icons'], content: wp.blocks.serialize(wp.blocks.createBlock(icon.block.name, icon.block.attributes)) });
        wp.data.dispatch('core/block-editor').updateSettings({ __experimentalBlockPatterns: patterns });
      }
      previous = collections;
    } catch (error) {
      // Preserve the current picker on failure, but leave a useful diagnostic.
      console.warn('Pixflow could not refresh the WordPress icon picker.', error);
    }
  };
  void refresh();
  window.addEventListener('pixflow-design:icon-packs-changed', refresh);
  return () => { disposed = true; window.removeEventListener('pixflow-design:icon-packs-changed', refresh); };
}
