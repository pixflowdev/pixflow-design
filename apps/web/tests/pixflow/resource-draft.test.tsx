// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { prepareResourceDraft, resourceBuilder, resourceDraftAvailable, useResourceDraft } from '../../src/pixflow/resource-draft';
import { fetchPlugin } from '../../src/state/projects';
const hostWindow = window as Window & { pixflowDesignBricks?: { openPanel: (reason?: string) => void; getState?: () => { open?: boolean; streaming?: boolean } } };
vi.mock('../../src/providers/registry', () => ({ fetchPluginPreviewHtml: vi.fn(async () => ({ html: '<main>Reference</main>' })) }));
vi.mock('../../src/state/projects', () => ({ fetchPlugin: vi.fn(), resolvePluginQueryFallback: (value: unknown) => typeof value === 'string' ? value : '' }));
afterEach(() => { cleanup(); delete (window as any).__PIXFLOW_DESIGN_WORDPRESS__; sessionStorage.clear(); delete hostWindow.pixflowDesignBricks; delete (window as any).pixflowGutenbergEditor; delete (window as any).pixflowGutenbergCanvas; window.history.replaceState({}, '', '/'); vi.restoreAllMocks(); });
function mountDraft(initial = '') {
  const composer = { getDraft: () => initial, setDraft: vi.fn(), attachFiles: vi.fn(async (_files: File[]) => {}) };
  function Consumer() { const ref = useRef(composer); useResourceDraft(ref); return null; }
  render(<Consumer />);
  return composer;
}
it('prepares media in the live composer without replacing a draft or reopening an active session', async () => {
  const composer = mountDraft('Keep my existing request.');
  const openPanel = vi.fn();
  hostWindow.pixflowDesignBricks = { openPanel, getState: () => ({ open: true, streaming: true }) };
  vi.mocked(fetchPlugin).mockResolvedValue({ id: 'image', title: 'Product image', pixflowDestination: 'media', manifest: { od: { useCase: { query: 'Soft studio lighting' } } } } as never);
  await prepareResourceDraft({ id: 'image' } as never);
  expect(openPanel).not.toHaveBeenCalled();
  expect(composer.attachFiles.mock.calls[0]?.[0]).toHaveLength(1);
  expect(composer.setDraft).toHaveBeenCalledOnce();
  expect(composer.setDraft.mock.calls[0]?.[0]).toContain('Keep my existing request.\n\nCreate media');
  expect(composer.setDraft.mock.calls[0]?.[0]).toContain('WordPress Media Library');
});
it('holds a Bricks reference until the closed panel mounts and excludes HTML execution instructions', async () => {
  const openPanel = vi.fn();
  hostWindow.pixflowDesignBricks = { openPanel, getState: () => ({ open: false }) };
  vi.mocked(fetchPlugin).mockResolvedValue({ id: 'landing', title: 'Landing', pixflowDestination: 'bricks', manifest: { description: 'Editorial landing page', od: { useCase: { query: 'Create an HTML project' } } } } as never);
  await prepareResourceDraft({ id: 'landing' } as never);
  expect(openPanel).toHaveBeenCalledOnce();
  const composer = mountDraft();
  expect(composer.setDraft.mock.calls[0]?.[0]).toContain('this page in Bricks');
  expect(composer.setDraft.mock.calls[0]?.[0]).not.toContain('HTML project');
  expect(composer.attachFiles.mock.calls[0]?.[0].map((file: File) => file.name)).toEqual(['landing-reference.md', 'landing-reference.html']);
});
it('does not fall back to a workspace project without a native destination', async () => {
  await expect(prepareResourceDraft({ id: 'example' } as never)).rejects.toThrow('Open a page in Bricks');
  hostWindow.pixflowDesignBricks = { openPanel: vi.fn() };
  vi.mocked(fetchPlugin).mockResolvedValue({ id: 'example' } as never);
  await expect(prepareResourceDraft({ id: 'example' } as never)).rejects.toThrow('no supported Pixflow destination');
});
it.each([['Etch', '/?etch=magic&post_id=2364'], ['Elementor', '/wp-admin/post.php?post=2614&action=elementor']])('routes a %s reference and both removable files into its composer', async (builder, url) => {
  window.history.replaceState({}, '', url);
  (window as any).__PIXFLOW_DESIGN_WORDPRESS__ = { runtime: 'wordpress', restBaseUrl: 'http://localhost/wp-json/pixflow-design/v1', etchIntegrationActive: builder === 'Etch', elementorIntegrationActive: builder === 'Elementor' };
  const open = vi.fn(); window.addEventListener('pixflow-design:host-panel-toggle', open);
  vi.mocked(fetchPlugin).mockResolvedValue({ id: 'landing', title: 'Landing', pixflowDestination: 'bricks', manifest: { description: 'Editorial landing page' } } as never);
  const composer = mountDraft('My brief');
  await prepareResourceDraft({ id: 'landing' } as never);
  expect(open).toHaveBeenCalledOnce();
  expect(composer.setDraft.mock.calls[0]?.[0]).toContain(`this page in ${builder}`);
  expect(composer.attachFiles.mock.calls[0]?.[0]).toHaveLength(2);
  window.removeEventListener('pixflow-design:host-panel-toggle', open);
});
it('does not offer Etch handoff from its URL when the Pro integration is absent', () => {
  window.history.replaceState({}, '', '/?etch=magic&post_id=2364');
  (window as any).__PIXFLOW_DESIGN_WORDPRESS__ = { runtime: 'wordpress', restBaseUrl: 'http://localhost/wp-json/pixflow-design/v1', etchIntegrationActive: false };
  expect(resourceBuilder()).not.toBe('Etch');
  expect(resourceDraftAvailable()).toBe(false);
});
it.each([{type:'page',id:'42'}, {type:'wp_template',id:'theme//single'}])('routes a Gutenberg $type reference to the connected composer without sending', async entity => {
  (window as any).pixflowGutenbergEditor = {};
  (window as any).pixflowGutenbergCanvas = {canvasId:'origin', connected:true, entity};
  hostWindow.pixflowDesignBricks = {openPanel:vi.fn()};
  const composer = mountDraft('Keep my brief.');
  vi.mocked(fetchPlugin).mockResolvedValue({id:'landing',title:'Landing',pixflowDestination:'bricks',manifest:{description:'Minimalist reference'}} as never);
  expect(resourceBuilder()).toBe('Gutenberg');
  expect(resourceDraftAvailable()).toBe(true);
  await prepareResourceDraft({id:'landing'} as never);
  expect(composer.setDraft.mock.calls[0]?.[0]).toContain('Keep my brief.\n\nUse “Landing” as visual inspiration for this page in Gutenberg.');
  expect(composer.attachFiles.mock.calls[0]?.[0].map(file=>file.name)).toEqual(['landing-reference.md','landing-reference.html']);
  expect(hostWindow.pixflowDesignBricks.openPanel).not.toHaveBeenCalled();
});
it('does not offer a resource handoff for a disconnected Gutenberg editor', async () => {
  (window as any).pixflowGutenbergEditor = {};
  (window as any).pixflowGutenbergCanvas = {canvasId:'origin',connected:false,entity:{type:'page',id:'42'}};
  hostWindow.pixflowDesignBricks = {openPanel:vi.fn()};
  expect(resourceDraftAvailable()).toBe(false);
  await expect(prepareResourceDraft({id:'landing'} as never)).rejects.toThrow('Open a page in Gutenberg');
});

it('does not expose Elementor handoff without its Pro contribution', () => {
  window.history.replaceState({}, '', '/wp-admin/post.php?post=2614&action=elementor');
  (window as any).__PIXFLOW_DESIGN_WORDPRESS__ = { runtime: 'wordpress', restBaseUrl: 'http://localhost/wp-json/pixflow-design/v1', elementorIntegrationActive: false };
  expect(resourceBuilder()).not.toBe('Elementor');
  expect(resourceDraftAvailable()).toBe(false);
});
