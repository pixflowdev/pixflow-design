import { resourceBuilder } from './resource-draft';
import { getPixflowWordPressConfig } from './wordpress-context';

/** A design-system adapter must belong to the current editor, not another active plugin. */
export function designSystemBuilder(): 'Bricks' | 'Etch' | 'Elementor' | 'Gutenberg' | null {
  if (typeof window !== 'undefined' && (window as any).pixflowGutenbergEditor) return 'Gutenberg';
  const builder = resourceBuilder();
  const config = getPixflowWordPressConfig();
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('etch') === 'magic' && config?.etchIntegrationActive !== true) return null;
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('action') === 'elementor' && config?.elementorIntegrationActive !== true) return null;
  if (typeof window !== 'undefined' && config?.gutenbergGlobalStylesAvailable && !/[?&](?:etch|bricks|action)=/.test(window.location.search)) return 'Gutenberg';
  if (builder === 'Elementor') return config?.elementorIntegrationActive === true ? 'Elementor' : null;
  if (builder === 'Etch') return config?.etchIntegrationActive === true ? 'Etch' : null;
  return config?.bricksIntegrationActive !== false ? 'Bricks' : null;
}
