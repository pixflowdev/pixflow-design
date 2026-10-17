
import { useT as usePixflowUiTranslation } from '../i18n';
// Plan §3.F5 / spec §11.6 — Home plugin details inspector.
//
// This file used to render a single inspector body for every plugin
// kind. The home gallery now ships type-aware preview tiles
// (image / video / HTML / design-system / fallback), and the user
// expects the detail modal to mirror those tiles with the same
// affordances they get on the curated gallery (DesignSystemPreview
// modal, examples PreviewModal, PromptTemplatePreviewModal):
//
//   media   → image/video player, prompt body, copy, lightbox
//   html    → sandboxed iframe + share menu + fullscreen
//   design  → showcase / tokens tabs + DESIGN.md sidebar
//   text    → original rich inspector (scenario fallback)
//
// We dispatch on `inferPluginPreview` (the same classifier the home
// card uses) so the chrome users see when expanding a tile is the
// natural extension of the tile they clicked. The Use/Apply flow
// stays identical — every variant reaches `usePlugin` through the
// same callback wiring.

import type { InstalledPluginRecord } from '@open-design/contracts';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveSystemTheme } from '../state/appearance';
import { inferPluginPreview } from './plugins-home/preview';
import { PluginScenarioDetail } from './plugin-details/PluginScenarioDetail';
import { PluginExampleDetail } from './plugin-details/PluginExampleDetail';
import { PluginDesignSystemDetail } from './plugin-details/PluginDesignSystemDetail';
import { PluginMediaDetail } from './plugin-details/PluginMediaDetail';
import type { PluginUseAction } from './plugins-home/useActions';
import type { PreviewSharePopoverItem } from './PreviewModal';
import { workspacePortalTarget } from './workspacePortalTarget';
import portalStyles from './ResourcePreviewPortal.module.css';
import { hasPixflowWordPressContext } from '../pixflow/wordpress-context';
import { prepareResourceDraft, resourceDraftAvailable, resourceBuilder } from '../pixflow/resource-draft';

interface Props {
  record: InstalledPluginRecord;
  onClose: () => void;
  onUse: (record: InstalledPluginRecord, action: PluginUseAction) => void;
  isApplying?: boolean;
  hideUseAction?: boolean;
  onPrepared?: () => void;
  // Analytics — fires when the user picks an item inside the PreviewModal
  // share popover (media / html / design variants only; the scenario
  // fallback has no share popover).
  onSharePopoverItemClick?: (item: PreviewSharePopoverItem) => void;
}

export function PluginDetailsModal({
  record,
  onClose,
  onUse: upstreamOnUse,
  isApplying: upstreamApplying,
  hideUseAction: upstreamHideUseAction,
  onPrepared,
  onSharePopoverItemClick,
}: Props) {
  const translateUi = usePixflowUiTranslation();
  const native = hasPixflowWordPressContext();
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const isApplying = upstreamApplying || preparing;
  const hideUseAction = native ? !record.pixflowDestination || !resourceDraftAvailable() : upstreamHideUseAction;
  const onUse = (item: InstalledPluginRecord, action: PluginUseAction) => {
    if (!native) return upstreamOnUse(item, action);
    if (preparing) return;
    setPreparing(true); setError('');
    void prepareResourceDraft(item).then(() => { onClose(); onPrepared?.(); })
      .catch(reason => setError(reason instanceof Error ? reason.message : translateUi("ui.pluginDetailsModal.feedback70")))
      .finally(() => setPreparing(false));
  };
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document === 'undefined') return 'light';
    const current = document.documentElement.getAttribute('data-pixflow-theme');
    return current === 'light' || current === 'dark' ? current : resolveSystemTheme();
  });

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTheme = () => {
      const current = root.getAttribute('data-pixflow-theme');
      setTheme(current === 'light' || current === 'dark'
        ? current
        : media.matches ? 'dark' : 'light');
    };
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['data-pixflow-theme'] });
    media.addEventListener('change', syncTheme);
    syncTheme();
    return () => {
      observer.disconnect();
      media.removeEventListener('change', syncTheme);
    };
  }, []);

  const preview = inferPluginPreview(record);
  let detail: JSX.Element;

  if (preview.kind === 'media') {
    detail = (
      <PluginMediaDetail
        record={record}
        onClose={onClose}
        onUse={onUse}
        isApplying={isApplying}
        hideUseAction={hideUseAction}
        onSharePopoverItemClick={onSharePopoverItemClick}
      />
    );
  } else if (preview.kind === 'html') {
    detail = (
      <PluginExampleDetail
        record={record}
        exampleStem={
          preview.source === 'example' ? preview.exampleStem ?? null : null
        }
        onClose={onClose}
        onUse={onUse}
        isApplying={isApplying}
        hideUseAction={hideUseAction}
        onSharePopoverItemClick={onSharePopoverItemClick}
      />
    );
  } else if (preview.kind === 'design') {
    detail = (
      <PluginDesignSystemDetail
        record={record}
        onClose={onClose}
        onUse={onUse}
        isApplying={isApplying}
        hideUseAction={hideUseAction}
        onSharePopoverItemClick={onSharePopoverItemClick}
      />
    );
  } else {
    detail = (
      <PluginScenarioDetail
        record={record}
        onClose={onClose}
        onUse={onUse}
        isApplying={isApplying}
        hideUseAction={hideUseAction}
      />
    );
  }

  if (typeof document === 'undefined') return detail;
  const portalTarget = workspacePortalTarget();
  return createPortal(
    <div className="pixflow-design-portal-scope" data-theme={theme}><div className={portalStyles.portal}>
      {detail}
      {native && (error || !resourceDraftAvailable()) && <p role="status" className={portalStyles.notice}>{error || translateUi("ui.pluginDetailsModal.openAPageInToUseThis", { value1: resourceBuilder() })}</p>}
    </div></div>,
    document.getElementById('pixflow-design-overlay') ?? portalTarget ?? document.body,
  );
}
