import { mountGutenbergIcons } from './gutenberg-icons';
import { mountGutenbergFonts } from './gutenberg-fonts';
import { startGutenbergCanvas } from './gutenberg-canvas-connection';
import { gutenbergPostId } from './gutenberg-native-tools';
import { mountGutenbergEditorControls } from './gutenberg-editor-controls';
import { mountGutenbergPanelDocking } from './gutenberg-panel-docking';

if (window.top === window && (window as any).pixflowGutenbergEditor) {
  const stopIcons = mountGutenbergIcons();
  const stopFonts = mountGutenbergFonts();
  const stopControls = mountGutenbergEditorControls();
  const stopDocking = mountGutenbergPanelDocking();
  const stop = startGutenbergCanvas(() => {
    const wp = (window as any).wp;
    try { gutenbergPostId(wp); return wp; } catch { return undefined; }
  });
  window.addEventListener('pagehide', () => { stop(); stopIcons(); stopFonts(); stopControls(); stopDocking(); }, { once: true });
}
