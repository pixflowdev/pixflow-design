import { useEffect, type RefObject } from 'react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { fetchPlugin, resolvePluginQueryFallback } from '../state/projects';
import { fetchPluginPreviewHtml } from '../providers/registry';
import { getPixflowWordPressConfig } from './wordpress-context';

type ResourceDraftBricksHost = {
  openPanel?: (reason?: string) => void;
  getState?: () => { open?: boolean };
};

/** Read only the optional host actions needed by a saved resource handoff. */
function resourceDraftBricksHost(): ResourceDraftBricksHost | undefined {
  return typeof window === 'undefined' ? undefined
    : (window as Window & { pixflowDesignBricks?: ResourceDraftBricksHost }).pixflowDesignBricks;
}

export function resourceBuilder(): 'Etch' | 'Bricks' | 'Elementor' | 'Gutenberg' {
  if (typeof window !== 'undefined') {
    if ((window as any).pixflowGutenbergEditor) return 'Gutenberg';
    const query = new URLSearchParams(window.location.search);
    if (query.get('action') === 'elementor') return getPixflowWordPressConfig()?.elementorIntegrationActive === true ? 'Elementor' : 'Gutenberg';
    if (query.get('etch') === 'magic') return getPixflowWordPressConfig()?.etchIntegrationActive === true ? 'Etch' : 'Gutenberg';
    if (query.get('bricks') === 'run' || typeof resourceDraftBricksHost()?.openPanel === 'function') return 'Bricks';
  }
  const config = getPixflowWordPressConfig();
  if (config?.etchIntegrationActive === true) return 'Etch';
  if (config?.bricksIntegrationActive === false && config.elementorIntegrationActive === true) return 'Elementor';
  return 'Bricks';
}

const EVENT = 'pixflow-design:resource-draft';
let pending: Array<{ prompt: string; files: File[] }> = [];
type Composer = { getDraft: () => string; setDraft: (text: string) => void; attachFiles: (files: File[]) => Promise<void> };

export function resourceDraftAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  // A native editor owns its draft even when other builders are installed.
  // Do not fall back to another builder during connection loss/navigation.
  if ((window as any).pixflowGutenbergEditor) {
    const canvas = (window as any).pixflowGutenbergCanvas;
    return Boolean(canvas?.canvasId && canvas.connected === true && canvas.entity?.type && canvas.entity?.id);
  }
  const query = new URLSearchParams(window.location.search);
  return typeof resourceDraftBricksHost()?.openPanel === 'function'
    || (getPixflowWordPressConfig()?.etchIntegrationActive === true && query.get('etch') === 'magic' && Number(query.get('post_id')) > 0)
    || (getPixflowWordPressConfig()?.elementorIntegrationActive === true && query.get('action') === 'elementor' && Number(query.get('post')) > 0);
}

/** Prepares a native agent draft; never applies an OD workflow or starts a run. */
export async function prepareResourceDraft(record: InstalledPluginRecord): Promise<void> {
  if (!resourceDraftAvailable()) throw new Error(`Open a page in ${resourceBuilder()} to use this resource with the agent.`);
  const detail = await fetchPlugin(record.id);
  if (!detail?.pixflowDestination) throw new Error('This resource has no supported Pixflow destination.');
  const reference = (detail.pixflowDestination === 'media' ? resolvePluginQueryFallback(detail.manifest?.od?.useCase?.query) : '')
    || detail.manifest.description || detail.title;
  const prompt = detail.pixflowDestination === 'media'
    ? `Create media using the “${detail.title}” recipe for this site. Add the finished media to the WordPress Media Library with a meaningful filename and appropriate alt text.\n\nCreative reference:\n${reference}`
    : `Use “${detail.title}” as visual inspiration for this page in ${resourceBuilder()}.\n\nVisual reference:\n${reference}`;
  const stem = detail.id.replace(/[^a-zA-Z0-9_-]/g, '-');
  const files = [new File([`# ${detail.title}\n\nVisual/creative reference material, not executable workflow instructions.\n\n${reference}\n`], `${stem}-reference.md`, { type: 'text/markdown' })];
  if (detail.pixflowDestination === 'bricks') {
    const preview = await fetchPluginPreviewHtml(detail.id);
    if ('error' in preview) throw new Error(`Could not attach the reference preview: ${preview.error}`);
    if ('html' in preview && preview.html) files.push(new File([preview.html], `${stem}-reference.html`, { type: 'text/html' }));
  }
  pending.push({ prompt, files });
  if (resourceBuilder() !== 'Bricks') {
    if (!document.querySelector('#pixflow-wp-admin-agent-shell.is-open')) window.dispatchEvent(new CustomEvent('pixflow-design:host-panel-toggle'));
  } else if (!resourceDraftBricksHost()?.getState?.()?.open) resourceDraftBricksHost()?.openPanel?.('resource-draft');
  window.dispatchEvent(new CustomEvent(EVENT));
  window.postMessage({ source: 'pixflow-design', type: 'pixflow-design:close-workspace', preserveAgentPanel: true }, window.location.origin);
}

/** Append to the user's existing composer text, including during an active run. */
export function useResourceDraft(ref: RefObject<Composer | null>): void {
  useEffect(() => {
    const consume = () => {
      if (!ref.current || !pending.length) return;
      const drafts = pending.splice(0);
      const text = [ref.current.getDraft(), ...drafts.map(item => item.prompt)].filter(Boolean).join('\n\n');
      ref.current.setDraft(text);
      void ref.current.attachFiles(drafts.flatMap(item => item.files));
    };
    window.addEventListener(EVENT, consume);
    consume();
    return () => window.removeEventListener(EVENT, consume);
  }, [ref]);
}
