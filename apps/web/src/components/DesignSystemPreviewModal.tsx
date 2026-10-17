import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnalytics } from '../analytics/provider';
import {
  trackDesignSystemsTemplatesModalClick,
  trackDesignSystemsTemplatesModalSharePopoverClick,
  trackDesignSystemsTemplatesModalSurfaceView,
} from '../analytics/events';
import { useT } from '../i18n';
import {
  fetchDesignSystem,
  fetchDesignSystemPreview,
  fetchDesignSystemShowcase,
} from '../providers/registry';
import type { DesignSystemSummary } from '../types';
import { DesignSpecView } from './DesignSpecView';
import { PreviewModal } from './PreviewModal';
import portalStyles from './ResourcePreviewPortal.module.css';

interface Props {
  system: DesignSystemSummary;
  onClose: () => void;
  referenceOnly?: boolean;
}

// Two-tab DS preview: a complete Showcase webpage rendered from the system's
// tokens, and the original Tokens view (palette / typography / components +
// rendered DESIGN.md prose). A toggleable side panel surfaces the raw
// DESIGN.md so users can compare spec to render at the same time, mirroring
// the styles.refero.design layout.
export function DesignSystemPreviewModal({ system, onClose, referenceOnly = false }: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const surfaceViewFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (surfaceViewFiredRef.current === system.id) return;
    surfaceViewFiredRef.current = system.id;
    trackDesignSystemsTemplatesModalSurfaceView(analytics.track, {
      page_name: 'design_systems',
      area: 'templates_modal',
      templates_id: system.id,
      templates_type: system.source ?? 'library',
    });
  }, [analytics.track, system.id, system.source]);
  const [showcaseHtml, setShowcaseHtml] = useState<string | null | undefined>(undefined);
  const [tokensHtml, setTokensHtml] = useState<string | null | undefined>(undefined);
  const [specBody, setSpecBody] = useState<string | null | undefined>(undefined);

  // Track user-driven view changes separately from the initial preview.
  const initialViewIdRef = useRef<string | null>(null);
  const handleView = useCallback(
    (viewId: string) => {
      // The first call comes from PreviewModal's mount with the initial
      // view id; that's a surface_view, not a click. Skip the click
      // tracking for the very first invocation and only emit on real
      // user-driven tab changes.
      if (initialViewIdRef.current === null) {
        initialViewIdRef.current = viewId;
      } else if (initialViewIdRef.current !== viewId) {
        initialViewIdRef.current = viewId;
        if (viewId === 'showcase' || viewId === 'tokens') {
          trackDesignSystemsTemplatesModalClick(analytics.track, {
            page_name: 'design_systems',
            area: 'templates_modal',
            element: viewId,
            templates_id: system.id,
            templates_type: system.source ?? 'library',
          });
        }
      }

    },
    [analytics.track, system.id, system.source],
  );

  // Load on mount so child disclosure effects cannot race the initial fetch.
  useEffect(() => {
    let current = true;
    setShowcaseHtml(undefined);
    setTokensHtml(undefined);
    setSpecBody(undefined);
    void fetchDesignSystemShowcase(system.id).then(html => { if (current) setShowcaseHtml(html); });
    if (!referenceOnly) void fetchDesignSystemPreview(system.id).then(html => { if (current) setTokensHtml(html); });
    void fetchDesignSystem(system.id).then(detail => { if (current) setSpecBody(detail?.body || 'Reference details are unavailable.'); });
    return () => { current = false; };
  }, [system.id, referenceOnly]);

  const detail = (
    <PreviewModal
      title={system.title}
      subtitle={system.summary || system.category}
      views={[
        { id: 'showcase', label: t('ds.showcase'), html: showcaseHtml, unavailable: showcaseHtml === null ? { kind: 'html', noun: 'template' } : undefined },
        ...(!referenceOnly ? [{ id: 'tokens', label: t('ds.tokens'), html: tokensHtml, unavailable: tokensHtml === null ? { kind: 'html' as const, noun: 'template' as const } : undefined }] : []),
      ]}
      initialViewId="showcase"
      onView={handleView}
      exportTitleFor={(viewId) => `${system.title} — ${viewId}`}
      onClose={onClose}
      onFullscreenClick={() =>
        trackDesignSystemsTemplatesModalClick(analytics.track, {
          page_name: 'design_systems',
          area: 'templates_modal',
          element: 'fullscreen',
          templates_id: system.id,
          templates_type: system.source ?? 'library',
        })
      }
      onShareClick={() =>
        trackDesignSystemsTemplatesModalClick(analytics.track, {
          page_name: 'design_systems',
          area: 'templates_modal',
          element: 'share',
          templates_id: system.id,
          templates_type: system.source ?? 'library',
        })
      }
      onSidebarToggleClick={() =>
        trackDesignSystemsTemplatesModalClick(analytics.track, {
          page_name: 'design_systems',
          area: 'templates_modal',
          element: 'design_md',
          templates_id: system.id,
          templates_type: system.source ?? 'library',
        })
      }
      onSharePopoverItemClick={(item) =>
        trackDesignSystemsTemplatesModalSharePopoverClick(analytics.track, {
          page_name: 'design_systems',
          area: 'templates_modal_share_popover',
          element: item,
          templates_id: system.id,
          templates_type: system.source ?? 'library',
        })
      }
      sidebar={{
        label: t('ds.specToggle'),
        defaultOpen: true,
        // Reset the sidebar content when a different reference is selected.
        contentKey: system.id,
        content: (
          <DesignSpecView
            source={specBody}
            loadingLabel={t('ds.specLoading')}
          />
        ),
      }}
    />
  );

  if (typeof document === 'undefined') return detail;
  return createPortal(<div className="pixflow-design-portal-scope" data-theme={document.documentElement.getAttribute('data-pixflow-theme') || 'light'}><div className={portalStyles.portal}>{detail}</div></div>, document.body);
}
