import type { PixflowStageADesignContext } from './pixflow-build-in-bricks-stage-a.js';

export const PIXFLOW_HTML_FRAMEWORK_CONTEXT_SCHEMA = 'pixflow.html_to_bricks.framework_context.v1' as const;

export const PIXFLOW_HTML_FRAMEWORK_MATCH_POLICY = {
  spacing: { mode: 'near_numeric', relative: 0.03, absolutePx: 0.75, rejectFluidForFixed: true },
  typography: { mode: 'near_numeric', relative: 0.05, absolutePx: 0.25, rejectFluidForFixed: true },
  radius: { mode: 'near_numeric', relative: 0.08, absolutePx: 1, maximumFluidSpanPx: 2 },
  shadow: { mode: 'exact_css' },
  container: { mode: 'near_numeric', relative: 0.01, absolutePx: 2, rejectFluidForFixed: true },
  layout: { mode: 'exact_css' },
  colour: { mode: 'separate_authority' },
} as const;

export type PixflowHtmlFrameworkContextStatus = 'available' | 'stale' | 'incomplete' | 'unavailable';
export type PixflowHtmlFrameworkFetchOutcome = 'completed' | 'partial' | 'timeout' | 'failed' | 'unavailable';
export type PixflowHtmlFrameworkValueProvenance =
  | 'observed_source'
  | 'resolved_asset'
  | 'framework_equivalent'
  | 'explicit_fallback'
  | 'synthetic_bricks';

export type PixflowHtmlFrameworkContext = {
  [key: string]: unknown;
  schema: typeof PIXFLOW_HTML_FRAMEWORK_CONTEXT_SCHEMA;
  version: 1;
  capturedAt: string;
  status: PixflowHtmlFrameworkContextStatus;
  statusReason: string;
  fetchOutcome: PixflowHtmlFrameworkFetchOutcome;
  activeRouteId: string;
  requestedRouteId: string;
  routeFamily: string;
  fallbackUsed: boolean;
  source: string;
  mappingUsage: 'pixflow_library_template_payloads_only';
  libraryMappingAllowed: false;
  matchPolicy: typeof PIXFLOW_HTML_FRAMEWORK_MATCH_POLICY;
  allowlists: {
    cssVariables: string[];
    utilityClasses: string[];
    globalClassNames: string[];
    bricksColorVariables: string[];
  };
  routeContext: Record<string, unknown>;
  frameworkState: Record<string, unknown>;
  bricksColorScheme: Record<string, unknown>;
  /**
   * The bounded, provenance-filtered view consumed by Build source generation.
   * This remains optional because the HTML → Bricks converter also consumes
   * this context and older callers do not need the design-facing projection.
   */
  designContext?: Partial<PixflowStageADesignContext>;
  breakpoints?: PixflowStageADesignContext['breakpoints'];
  breakpointMode?: Record<string, unknown>;
};

export function createPixflowHtmlFrameworkContext(input: {
  frameworkState?: unknown;
  routeContext?: unknown;
  bricksColorScheme?: unknown;
  capturedAt?: string;
  fetchOutcome?: PixflowHtmlFrameworkFetchOutcome;
}): PixflowHtmlFrameworkContext {
  const frameworkState = record(input.frameworkState);
  const routeContext = record(input.routeContext);
  const sources = record(routeContext.sources);
  const frameworkSource = record(sources.framework);
  const allowlists = record(routeContext.allowlists);
  const stateRouteId = stringValue(frameworkState.activeRouteId);
  const contextRouteId = stringValue(routeContext.activeRouteId);
  const activeRouteId = contextRouteId || stateRouteId;
  const requestedRouteId = stringValue(routeContext.requestedRouteId);
  const routeFamily = stringValue(frameworkSource.routeFamily);
  const hasRouteContext = Object.keys(routeContext).length > 0;
  const routeMismatch = Boolean(stateRouteId && contextRouteId && stateRouteId !== contextRouteId);
  const complete = Boolean(
    activeRouteId
    && Object.keys(frameworkSource).length > 0
    && Object.keys(allowlists).length > 0,
  );

  let status: PixflowHtmlFrameworkContextStatus = 'unavailable';
  let statusReason = 'No live route context was available; use explicit Bricks settings.';
  if (routeMismatch) {
    status = 'stale';
    statusReason = `Route context ${contextRouteId} does not match the active framework route ${stateRouteId}.`;
  } else if (hasRouteContext && complete) {
    status = 'available';
    statusReason = 'Live route context matches the active framework route.';
  } else if (hasRouteContext) {
    status = 'incomplete';
    statusReason = 'Route context is missing an active route, framework source, or allowlists.';
  }

  return {
    schema: PIXFLOW_HTML_FRAMEWORK_CONTEXT_SCHEMA,
    version: 1,
    capturedAt: input.capturedAt || new Date().toISOString(),
    status,
    statusReason,
    fetchOutcome: input.fetchOutcome || (status === 'available' ? 'completed' : (hasRouteContext ? 'partial' : 'unavailable')),
    activeRouteId,
    requestedRouteId,
    routeFamily,
    fallbackUsed: routeContext.fallbackUsed === true,
    source: stringValue(frameworkSource.source) || 'wordpress_route_context',
    mappingUsage: 'pixflow_library_template_payloads_only',
    libraryMappingAllowed: false,
    matchPolicy: PIXFLOW_HTML_FRAMEWORK_MATCH_POLICY,
    allowlists: {
      cssVariables: stringList(allowlists.cssVariables),
      utilityClasses: stringList(allowlists.utilityClasses),
      globalClassNames: stringList(allowlists.globalClassNames),
      bricksColorVariables: stringList(allowlists.bricksColorVariables),
    },
    routeContext,
    frameworkState,
    bricksColorScheme: record(input.bricksColorScheme),
    ...(record(routeContext.designContext).schema ? { designContext: record(routeContext.designContext) as Partial<PixflowStageADesignContext> } : {}),
    ...(Array.isArray(routeContext.breakpoints) ? { breakpoints: routeContext.breakpoints as PixflowStageADesignContext['breakpoints'] } : {}),
    ...(record(routeContext.breakpointMode).mode || Object.keys(record(routeContext.breakpointMode)).length > 0
      ? { breakpointMode: record(routeContext.breakpointMode) }
      : {}),
  };
}

export function normalizePixflowHtmlFrameworkContext(value: unknown): PixflowHtmlFrameworkContext {
  const candidate = record(value);
  if (
    candidate.schema === PIXFLOW_HTML_FRAMEWORK_CONTEXT_SCHEMA
    && candidate.version === 1
    && ['available', 'stale', 'incomplete', 'unavailable'].includes(stringValue(candidate.status))
    && candidate.libraryMappingAllowed === false
  ) {
    return candidate as PixflowHtmlFrameworkContext;
  }
  return createPixflowHtmlFrameworkContext({
    frameworkState: candidate.frameworkState || candidate,
    routeContext: candidate.routeContext || candidate,
    bricksColorScheme: candidate.bricksColorScheme,
    fetchOutcome: 'partial',
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
    : [];
}
