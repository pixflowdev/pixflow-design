// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mountGutenbergEditorControls } from '../../src/pixflow/gutenberg-editor-controls';

vi.mock('../../src/pixflow/wordpress-context', () => ({ getPixflowWordPressConfig: () => ({iconUrl:'/icon.svg',quickMenuIconUrl:'/menu.svg'}) }));
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.innerHTML = ''; delete (window as any).pixflowDesignWorkspaceMenu; });
it('reuses the panel and shared menu, survives toolbar replacement, and cleans up', async () => {
  document.body.innerHTML = '<header class="editor-document-tools__left"></header><section id="pixflow-wp-admin-agent-shell"></section>';
  const toggle = vi.fn(), destroy = vi.fn(), mount = vi.fn(() => ({toggle,destroy,refreshTheme:vi.fn()}));
  (window as any).pixflowDesignWorkspaceMenu = {mount};
  dispose = mountGutenbergEditorControls();
  const button = document.getElementById('pixflow-gutenberg-agent-toggle')!;
  const onToggle = vi.fn(); window.addEventListener('pixflow-design:host-panel-toggle',onToggle);
  button.click(); expect(onToggle).toHaveBeenCalledOnce();
  window.removeEventListener('pixflow-design:host-panel-toggle',onToggle);
  document.getElementById('pixflow-wp-admin-agent-shell')!.classList.add('is-open');
  window.dispatchEvent(new Event('pixflow-design:wp-admin-panel-open'));
  expect(button.getAttribute('aria-expanded')).toBe('true');
  window.dispatchEvent(new Event('pixflow-design:wp-admin-panel-close'));
  expect(button.getAttribute('aria-expanded')).toBe('false');
  document.getElementById('pixflow-gutenberg-workspace-toggle')!.click();
  expect(toggle).toHaveBeenCalledOnce(); expect(mount).toHaveBeenCalledOnce();
  document.querySelector('header')!.outerHTML = '<header class="editor-document-tools__left"></header>';
  await new Promise(resolve => setTimeout(resolve,0));
  expect(document.querySelectorAll('#pixflow-gutenberg-agent-toggle')).toHaveLength(1);
  expect(document.querySelector('header')!.contains(button)).toBe(true);
  dispose(); dispose = undefined;
  expect(destroy).toHaveBeenCalledOnce();
  expect(document.querySelector('[data-pixflow-gutenberg-controls]')).toBeNull();
});
