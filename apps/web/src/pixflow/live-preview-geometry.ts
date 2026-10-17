export interface LivePreviewRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface LivePreviewGeometry {
  top: number;
  left: number;
  width: number;
  height: number;
  scale: number;
}

interface CalculateLivePreviewGeometryInput {
  stageRect: LivePreviewRect;
  containingBlockOrigin: Pick<LivePreviewRect, 'top' | 'left'>;
  viewportWidth: number;
  minVisualHeight: number;
  minScale: number;
}

const roundToPixel = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Keeps the fixed preview shell aligned to its stage even when a builder
 * ancestor establishes a fixed-position containing block of its own.
 */
export function calculateLivePreviewGeometry({
  stageRect,
  containingBlockOrigin,
  viewportWidth,
  minVisualHeight,
  minScale,
}: CalculateLivePreviewGeometryInput): LivePreviewGeometry {
  const availableWidth = Math.max(1, stageRect.width);
  const availableHeight = Math.max(minVisualHeight, stageRect.height);
  const scale = Math.max(
    minScale,
    Math.round(Math.min(1, availableWidth / viewportWidth) * 1000) / 1000,
  );

  return {
    top: roundToPixel(stageRect.top - containingBlockOrigin.top),
    left: roundToPixel(
      stageRect.left
      - containingBlockOrigin.left
      + (availableWidth - viewportWidth * scale) / 2,
    ),
    width: viewportWidth,
    height: Math.max(minVisualHeight, Math.round(availableHeight / scale)),
    scale,
  };
}
