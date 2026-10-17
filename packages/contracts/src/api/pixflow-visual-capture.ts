export type PixflowVisualCaptureViewport = {
  id: string;
  width: number;
  height: number;
  scrollPosition?: 'top' | 'middle' | 'bottom';
  /** Agent-selected interaction states, applied in order before the screenshot. */
  actions?: PixflowVisualCaptureAction[];
};

export type PixflowVisualCaptureAction =
  | { type: 'click' | 'hover'; selector: string }
  | { type: 'fill' | 'select'; selector: string; value: string }
  | { type: 'check'; selector: string; checked: boolean }
  | { type: 'waitFor'; selector: string; state?: 'visible' | 'hidden' | 'attached' | 'detached' };

import type {
  PixflowVisualRenderEnvironmentEvidence,
  PixflowVisualRenderEnvironmentIdentity,
  PixflowVisualRenderEnvironmentProfile,
} from './pixflow-bricks-render-environment.js';

export type PixflowVisualCaptureRequest = {
  url: string;
  viewports: PixflowVisualCaptureViewport[];
  captureMode?: 'generated' | 'live-reference';
  fidelityProfile?: 'structural' | 'visual-clone';
  references?: Array<{ viewport: string; url: string }>;
  fidelityReferenceUrl?: string;
  waitMs?: number;
  /** Route-owned destination semantics. Canonical Build is the only current opt-in. */
  renderEnvironmentProfile?: PixflowVisualRenderEnvironmentProfile;
  /** Render-only destination variable + Theme Style simulation; never persisted or converted. */
  themeStylePreviewCss?: string;
  /** Diagnostic identity of the effective Theme Style snapshot used for review. */
  themeStyleSnapshotHash?: string;
};

export type PixflowVisualFidelityDifference = {
  property: string;
  expected: string | number;
  actual: string | number;
  difference?: number;
};

export type PixflowVisualFidelityMismatch = {
  sourceKey: string;
  targetKey: string;
  label: string;
  matchBy: string;
  geometryScore: number;
  styleScore: number;
  geometry: PixflowVisualFidelityDifference[];
  styles: PixflowVisualFidelityDifference[];
};

export type PixflowVisualFidelityComparison = {
  referenceUrl: string;
  profile?: 'structural' | 'visual-clone';
  sourceElements: number;
  targetElements: number;
  matchedElements: number;
  unmatchedSourceElements: number;
  matchCoverage: number;
  geometryScore: number;
  styleScore: number;
  sourceDocumentHeight: number;
  targetDocumentHeight: number;
  documentHeightScore: number;
  overallScore: number;
  minimumMatchCoverage: number;
  minimumGeometryScore: number;
  minimumStyleScore: number;
  minimumDocumentHeightScore: number;
  minimumOverallScore: number;
  passed: boolean;
  mismatches: PixflowVisualFidelityMismatch[];
};

export type PixflowVisualInteractionSignal = {
  kind: 'webflow-ix2' | 'lottie' | 'gsap' | 'scroll-trigger' | 'lenis' | 'pixflow-motion' | 'css-animation' | 'css-transition' | 'autoplay-video';
  count: number;
  evidence: string[];
};

export type PixflowVisualInteractionAudit = {
  url: string;
  detected: boolean;
  signals: PixflowVisualInteractionSignal[];
};

export type PixflowVisualLayoutViewportEscape = {
  selector: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type PixflowVisualLayoutClippedElement = {
  selector: string;
  evidence: string[];
};

export type PixflowVisualLayoutMissingResource = {
  kind: 'image' | 'stylesheet' | 'script' | 'font' | 'request';
  url: string;
  selector?: string;
};

export type PixflowVisualLayoutInteractiveTarget = {
  selector: string;
  reason: string;
};

export type PixflowVisualTypographySample = {
  selector: string;
  text: string;
  fontSize: string;
  lineHeight: string;
  fontFamily: string;
  color?: string;
  fontWeight?: string;
  /** Computed ancestor surfaces, nearest first; images/opacity are not flattened. */
  backgroundLayers?: Array<{ color: string; image: string; opacity: string }>;
  /** Ancestor effects that prevent an sRGB colour-pair calculation. */
  compositingEffects?: string[];
  /** Nominal text/background measurement, not a pixel audit or accessibility verdict. */
  contrast?: { ratio: number; foreground: number[]; background: number[] } | { ratio: null; reason: string };
  width: number;
  height: number;
  /** Viewport-relative element and parent geometry; no fit/overlap verdict. */
  bounds?: { left: number; top: number; width: number; height: number };
  parentBounds?: { left: number; top: number; width: number; height: number };
};

/** Exact style grouping for concise CLI output; all original nodes remain in the evidence file. */
export type PixflowVisualTypographyStyle = Pick<PixflowVisualTypographySample,
  'fontSize' | 'fontWeight' | 'fontFamily' | 'lineHeight' | 'color' | 'contrast' | 'backgroundLayers' | 'compositingEffects'> & {
  count: number;
  examples: Array<Pick<PixflowVisualTypographySample, 'selector' | 'text' | 'bounds' | 'parentBounds'>>;
};

/** Bounded browser observations shared by Direct capture and visual comparison. */
export type PixflowVisualLayoutEvidence = {
  viewport: string;
  viewportWidth: number;
  viewportHeight: number;
  documentWidth: number;
  documentHeight: number;
  clientWidth: number;
  clientHeight: number;
  horizontalOverflowPx: number;
  overflowSources: string[];
  viewportEscapes: PixflowVisualLayoutViewportEscape[];
  zeroSizeVisible: string[];
  clippedElements: PixflowVisualLayoutClippedElement[];
  missingResources: PixflowVisualLayoutMissingResource[];
  consoleErrors: string[];
  failedRequests: string[];
  invalidInteractiveTargets: PixflowVisualLayoutInteractiveTarget[];
  oversizedElements: PixflowVisualLayoutClippedElement[];
  /** Rendered heading order, bounded independently from typography sampling. */
  headings?: Array<{ level: number; selector: string; text: string }>;
  headingsTruncated?: boolean;
  /** Rendered image observations; intrinsic size and CSS fit carry no quality verdict. */
  images?: {
    count: number;
    truncated: boolean;
    samples: Array<{
      selector: string;
      alt: string;
      naturalWidth: number;
      naturalHeight: number;
      objectFit: string;
      objectPosition: string;
      bounds: { left: number; top: number; width: number; height: number };
    }>;
  };
  /** Raw computed values for agent inspection; no quality score or threshold. */
  typography?: {
    rootFontSize: string;
    samples: PixflowVisualTypographySample[];
    /** Rendered text throughout the document, including outside this screenshot. */
    documentSamples?: Array<PixflowVisualTypographySample & {
      /** Coordinates relative to the captured viewport; offscreen values are retained. */
      top: number;
      left: number;
      inViewport: boolean;
    }>;
    documentTextCount?: number;
    documentTruncated?: boolean;
  };
  truncated?: boolean;
};
export type PixflowVisualCaptureStability = {
  mode: 'exact' | 'consensus' | 'representative';
  attempts: number;
  differenceRatio?: number;
  maximumTileDifferenceRatio?: number;
  meanAbsoluteChannelDifference?: number;
  maximumTileMeanAbsoluteChannelDifference?: number;
};
export type PixflowVisualCaptureResult = {
  viewport: string;
  width: number;
  height: number;
  scrollPosition?: 'top' | 'middle' | 'bottom';
  mimeType: 'image/png';
  base64: string;
  sha256: string;
  comparison?: {
    referenceUrl: string;
    differentPixels: number;
    totalPixels: number;
    differenceRatio: number;
    meanAbsoluteChannelDifference: number;
    maximumTileDifferenceRatio: number;
    maximumTileMeanAbsoluteChannelDifference: number;
    maximumTopBandTileDifferenceRatio: number;
    fullFrameLimit: number;
    maximumTileLimit: number;
    maximumTopBandTileLimit: number;
    passed: boolean;
  };
  fidelity?: PixflowVisualFidelityComparison;
  interactionAudit?: PixflowVisualInteractionAudit;
  layout?: PixflowVisualLayoutEvidence;
  /** Compact proof of the renderer-only destination baseline used for this viewport. */
  renderEnvironment?: PixflowVisualRenderEnvironmentEvidence;
  stability?: PixflowVisualCaptureStability;
  referenceCapture?: {
    mimeType: 'image/png';
    base64: string;
    sha256: string;
    interactionAudit?: PixflowVisualInteractionAudit;
    layout?: PixflowVisualLayoutEvidence;
    stability?: PixflowVisualCaptureStability;
  };
};

export type PixflowVisualCaptureResponse = {
  ok: boolean;
  browser: string | null;
  captures: PixflowVisualCaptureResult[];
  errors: string[];
  /** Renderer-only destination identity; never authored source or converter input. */
  renderEnvironment?: PixflowVisualRenderEnvironmentIdentity;
  /** Echoed for generation/review parity diagnostics; never source material. */
  themeStyleSnapshotHash?: string;
  timings?: {
    settleDurationMs: number;
    captureDurationMs: number;
    comparisonDurationMs: number;
    totalDurationMs: number;
  };
};
