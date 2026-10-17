import { createPortal } from 'react-dom';
import type { CSSProperties, MutableRefObject, ReactNode } from 'react';

// Pixflow-owned: reusable composer dock/portal shell. The workspace chat keeps
// the same positioning behavior, while the Bricks Agent can mount the same
// composer surface into a floating panel later without duplicating portal code.
export function SharedComposerDock({
  composerNode,
  shouldPortal = false,
  slotRef,
  slotStyle,
  portalTarget,
  portalRect,
  layerRef,
}: {
  composerNode: ReactNode;
  shouldPortal?: boolean;
  slotRef: MutableRefObject<HTMLDivElement | null>;
  slotStyle?: CSSProperties;
  portalTarget: HTMLElement | null;
  portalRect: { left: number; bottom: number; width: number } | null;
  layerRef: MutableRefObject<HTMLDivElement | null>;
}) {
  // Pixflow-owned WP runtime: keep chat composers in their owning surface.
  // The legacy body-level portal breaks the Bricks/project workspace layout
  // after the WP-first migration because the fixed layer escapes the scoped
  // workspace shell and leaves `.chat-composer-slot` empty. Keep the prop for
  // compatibility with older callers, but do not portal from this shared dock.
  const renderInSlot = true;

  return (
    <>
      <div
        className="chat-composer-slot"
        ref={slotRef}
        style={slotStyle}
        aria-hidden={renderInSlot ? undefined : shouldPortal ? true : undefined}
      >
        {renderInSlot ? composerNode : shouldPortal ? null : composerNode}
      </div>
      {!renderInSlot && shouldPortal && portalTarget && portalRect
        ? createPortal(
            <div
              className="chat-composer-fixed-layer"
              ref={layerRef}
              style={{
                left: portalRect.left,
                bottom: portalRect.bottom,
                width: portalRect.width,
              }}
            >
              {composerNode}
            </div>,
            portalTarget,
          )
        : null}
    </>
  );
}
