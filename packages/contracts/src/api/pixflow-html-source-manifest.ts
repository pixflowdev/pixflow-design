export const PIXFLOW_HTML_SOURCE_MANIFEST_SCHEMA = 'pixflow.html_to_bricks.source_manifest.v1' as const;

export const PIXFLOW_HTML_SCRIPT_DISPOSITIONS = [
  'capture_only',
  'visual_behavior',
  'application',
  'blocked',
] as const;

export const PIXFLOW_HTML_VISUAL_IMPLEMENTATION_STRATEGIES = [
  'none',
  'bricks_native',
  'css',
  'pixflow_js',
  'library',
  'manual_review',
] as const;

export type PixflowHtmlScriptDisposition = typeof PIXFLOW_HTML_SCRIPT_DISPOSITIONS[number];
export type PixflowHtmlVisualImplementationStrategy = typeof PIXFLOW_HTML_VISUAL_IMPLEMENTATION_STRATEGIES[number];

export type PixflowHtmlRuntimeScriptAudit = {
  id: string;
  source: string;
  inline: boolean;
  disposition: PixflowHtmlScriptDisposition;
  reasonCodes: string[];
  libraries: string[];
  executedDuringCapture: boolean;
  retainForConversion: boolean;
  finalStrategy: PixflowHtmlVisualImplementationStrategy;
  confidence: 'high' | 'medium' | 'low';
};

export type PixflowHtmlRuntimeBehavior = {
  id: string;
  kind: 'hydration' | 'css_animation' | 'load_animation' | 'scroll' | 'hover' | 'menu' | 'accordion' | 'carousel' | 'video' | 'canvas' | 'unknown';
  trigger: string;
  affectedSourceNodeIds: string[];
  visualChanges: string[];
  libraries: string[];
  implementation: PixflowHtmlVisualImplementationStrategy;
  confidence: 'high' | 'medium' | 'low';
};

export type PixflowHtmlRuntimeAudit = {
  mode: 'safe_hydration_then_static_replay';
  productMode: 'visual_clone';
  sourceRenderStatus: 'complete' | 'incomplete' | 'unscored';
  scripts: PixflowHtmlRuntimeScriptAudit[];
  behaviors: PixflowHtmlRuntimeBehavior[];
  excludedScriptIds: string[];
  staticReplay: {
    comparedViewports: number;
    matchedViewports: number;
    maximumDifferenceRatio: number | null;
  };
  agentReview: 'not_required' | 'recommended';
  warnings: string[];
};

export type PixflowHtmlSourceInputKind = 'single_document' | 'document_bundle' | 'generated_document';

export type PixflowHtmlSourceManifestFile = {
  path: string;
  role: 'canonical_html' | 'stylesheet' | 'font' | 'image' | 'media' | 'script' | 'context' | 'evidence';
  mimeType: string;
  size: number;
  sha256: string;
  resolvedPath: string;
  disposition: 'canonical' | 'materialized' | 'sanitized' | 'blocked' | 'evidence';
  sourcePath?: string;
};

export type PixflowHtmlSourceManifest = {
  schema: typeof PIXFLOW_HTML_SOURCE_MANIFEST_SCHEMA;
  version: 1;
  sourceId: string;
  runId: string;
  inputKind: PixflowHtmlSourceInputKind;
  selectionReason: string;
  resourceBase: string;
  canonicalHtml: PixflowHtmlSourceManifestFile;
  files: PixflowHtmlSourceManifestFile[];
  viewports: Array<{ id: 'desktop' | 'bricks_base' | 'mobile'; width: 1440 | 992 | 390; height: number }>;
  evidence: {
    sanitizedDom: PixflowHtmlSourceManifestFile;
    resolvedStylesheet: PixflowHtmlSourceManifestFile;
    computedStyles: PixflowHtmlSourceManifestFile[];
    screenshots: PixflowHtmlSourceManifestFile[];
    assetMap: PixflowHtmlSourceManifestFile;
    interactionEvidence: PixflowHtmlSourceManifestFile | null;
    runtimeAudit: PixflowHtmlSourceManifestFile;
    hydratedDom: PixflowHtmlSourceManifestFile;
    staticReplayScreenshots: PixflowHtmlSourceManifestFile[];
  };
  runtimeAudit: PixflowHtmlRuntimeAudit;
  sanitization: {
    scriptsDeniedByDefault: true;
    removedScripts: number;
    removedEventHandlers: number;
    blockedResources: string[];
    warnings: string[];
  };
  capabilities: Array<{
    name: 'validation' | 'sanitization' | 'resource_materialization' | 'runtime_audit' | 'sandbox_settle' | 'hydrated_dom_capture' | 'static_replay' | 'dom_style_capture' | 'responsive_capture';
    status: 'completed' | 'skipped' | 'failed' | 'unavailable';
    durationMs: number;
    evidencePath?: string;
    evidenceHash?: string;
  }>;
};
