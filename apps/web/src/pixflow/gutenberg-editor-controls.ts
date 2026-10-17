import { getPixflowWordPressConfig } from './wordpress-context';
import { mountNativeEditorWorkspaceMenu } from './native-editor-workspace-menu';
import styles from './GutenbergEditor.module.css';

/** Follow WordPress toolbar remounts, including fullscreen and distraction-free modes. */
export function mountGutenbergEditorControls(): () => void {
  const controls = document.createElement('div'); controls.className = styles.controls!;
  controls.dataset.pixflowGutenbergControls = ''; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Pixflow Design');
  const button = document.createElement('button'); button.id = 'pixflow-gutenberg-agent-toggle'; button.type = 'button';
  button.setAttribute('aria-controls', 'pixflow-wp-admin-agent-shell');
  const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true');
  icon.style.maskImage = `url("${getPixflowWordPressConfig()?.iconUrl || ''}")`; button.append(icon); controls.append(button);
  const update = (event?: Event) => {
    const open = event?.type === 'pixflow-design:wp-admin-panel-close' ? false : document.querySelector('#pixflow-wp-admin-agent-shell')?.classList.contains('is-open') === true;
    button.setAttribute('aria-expanded', String(open)); button.setAttribute('aria-label', `${open ? 'Close' : 'Open'} Pixflow Agent panel`); button.title = `${open ? 'Close' : 'Open'} Pixflow Design`;
  };
  button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); window.dispatchEvent(new CustomEvent('pixflow-design:host-panel-toggle')); });
  controls.addEventListener('keydown', event => event.stopPropagation());
  const mount = () => {
    const parent = document.querySelector('.editor-document-tools__left') ?? document.querySelector('.edit-post-header-toolbar');
    if (parent && controls.parentElement !== parent) parent.append(controls);
    update();
  };
  mount(); const stopMenu = mountNativeEditorWorkspaceMenu('gutenberg');
  const observer = new MutationObserver(() => { if (!controls.isConnected) mount(); });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('pixflow-design:wp-admin-panel-open', update);
  window.addEventListener('pixflow-design:wp-admin-panel-close', update);
  return () => { observer.disconnect(); stopMenu(); controls.remove(); window.removeEventListener('pixflow-design:wp-admin-panel-open', update); window.removeEventListener('pixflow-design:wp-admin-panel-close', update); };
}
