import { TranslatedText } from '../../../i18n/TranslatedText';
import { useT as usePixflowUiTranslation } from '../../../i18n';
// Design-system preview surface — showcase thumbnail with a brand-patch fallback.
//
// Most design-system plugins reference an upstream design system in
// `od.context.designSystem.ref`. When available, reuse the same
// showcase route as the detail modal so the home grid reads like real
// website thumbnails rather than synthetic color swatches. The iframe
// uses native lazy loading so off-screen cards do not eagerly render.

import { useEffect, useState } from 'react';
import type { DesignPreviewSpec } from '../preview';

interface Props {
  preview: DesignPreviewSpec;
  inView: boolean;
}

export function DesignSystemSurface({ preview, inView }: Props) {
  const translateUi = usePixflowUiTranslation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!preview.designSystemId) return;
    if (!inView) {
      setReady(false);
      return;
    }
    const id = window.setTimeout(() => setReady(true), 520);
    return () => window.clearTimeout(id);
  }, [inView, preview.designSystemId]);

  if (preview.designSystemId) {
    return (
      <div className="plugins-home__design plugins-home__design--showcase">
        <div className="plugins-home__design-showcase">
          {ready ? (
            <iframe
              title={translateUi("ui.designSystemSurface.showcasePreview", { value1: preview.brand })}
              src={`/api/design-systems/${encodeURIComponent(preview.designSystemId)}/showcase`}
              sandbox="allow-scripts"
              loading="lazy"
              tabIndex={-1}
              aria-hidden
              className="plugins-home__design-iframe"
            />
          ) : (
            <DesignPatch preview={preview} />
          )}
        </div>
      </div>
    );
  }

  return <DesignPatch preview={preview} />;
}

function DesignPatch({ preview }: { preview: DesignPreviewSpec }) {
  const translateUi = usePixflowUiTranslation();
  const [primary, secondary, ink] = preview.swatches;
  return (
    <div
      className="plugins-home__design"
      style={{
        background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`,
        color: ink,
      }}
    >
      <div className="plugins-home__design-headline">
        <TranslatedText id="ui.designSystemSurface.theSystemThat" values={{ brand: <strong>{preview.brand}</strong>, brandAgain: preview.brand }} />
      </div>
      <div className="plugins-home__design-specimen" aria-hidden>
        <span>{translateUi("ui.designSystemSurface.aa")}</span>
        <span>{translateUi("ui.designSystemSurface.bb")}</span>
        <span>{translateUi("ui.designSystemSurface.cc")}</span>
      </div>
      <div className="plugins-home__design-swatches" aria-hidden>
        {preview.swatches.map((c, i) => (
          <span key={i} style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}
