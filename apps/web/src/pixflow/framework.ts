import { isPixflowWordPressEmbed, requestWordPressAjax, requestWordPressRest } from './license';
import { toPixflowRuntimeUrl } from './bridge-url';
import { getPixflowWordPressConfig } from './wordpress-context';
import type {
  PixflowFrameworkColorGroup,
  PixflowFrameworkDesignSystemProfile,
  PublishPixflowFrameworkDesignSystemResponse,
  PixflowStageADesignContext,
} from '@open-design/contracts';

export type PixflowFrameworkRoute = {
  id: string;
  group: 'pixflow-framework' | 'direct';
  title: string;
  label: string;
  description: string;
  requiresPlugin?: string | null;
  available: boolean;
  autoSetup?: boolean;
  requiresMapping?: boolean;
};

export type PixflowFrameworkState = {
  routes: PixflowFrameworkRoute[];
  activeRouteId: string;
  mapping: {
    present: boolean;
    source: string;
    hash: string;
    updatedAt: string;
    message: string;
  };
  setup: Record<string, boolean>;
  designSystem?: PixflowDesignSystemState;
};

export type PixflowRouteContextSnapshot = {
  schemaVersion: number;
  postId?: number | null;
  activeRouteId: string;
  requestedRouteId: string;
  fallbackUsed: boolean;
  route: PixflowFrameworkRoute | Record<string, unknown>;
  sources: {
    bricks: {
      available: boolean;
      postId?: number | null;
      colorPalettes: unknown[];
      globalVariables: unknown[];
      globalClasses: unknown[];
      themeStylesLoadingMethod: 'all' | 'specific';
      themeStyleActiveIds: string[];
      themeStyleDiagnostics?: {
        storedStyleCount?: number;
        returnedStyleCount?: number;
        activeStyleCount?: number;
        missingActiveStyleIds?: string[];
        capped?: boolean;
        resolutionOrderSource?: string;
        unsupportedSettings?: string[];
      };
      themeStyles: Array<{
        id: string;
        label: string;
        active: boolean;
        conditions: Record<string, unknown>;
        typography: { body: string; headings: string };
        settings?: Record<string, unknown>;
      }>;
    };
    framework: {
      routeFamily: string;
      pixflowRoute: boolean;
      variables: unknown[];
      utilityClasses: unknown[];
      colorRoots: string[];
      source: string;
      available?: boolean;
    };
  };
  allowlists: {
    routeId: string;
    cssVariables: string[];
    utilityClasses: string[];
    globalClassNames: string[];
    bricksColorVariables: string[];
  };
  usage: Record<string, unknown>;
  designContext?: Partial<PixflowStageADesignContext>;
  breakpoints?: Array<{ key: string; label: string; width: number | null; base: boolean }>;
  breakpointMode?: Record<string, unknown>;
};

export type PixflowDesignSystemColorGroup = PixflowFrameworkColorGroup;
export type PixflowDesignSystemProfile = PixflowFrameworkDesignSystemProfile;

export type PixflowDesignSystemPublication = {
  designSystemId: string;
  syncHash: string;
  title: string;
  publishedAt: string;
};

export type PixflowDesignSystemPublicationState = {
  activeRouteId: string;
  publication: PixflowDesignSystemPublication | null;
};

export type PixflowDesignSystemState = {
  available: boolean;
  activeRouteId: string;
  profile: PixflowDesignSystemProfile;
  persisted: boolean;
};

export type PixflowMappingWizardPayload = {
  wizardState?: Record<string, unknown>;
  scaleCategories?: Array<{
    id: string;
    name: string;
    scope?: string;
    scaleType?: string;
    baseline?: string;
    prefix?: string;
    minBasePx?: number | string;
    maxBasePx?: number | string;
    minRatio?: number | string;
    maxRatio?: number | string;
    scaleNames?: string[];
  }>;
  colorPalettes?: Array<{
    id: string;
    name: string;
    colors: Array<{ id: string; label: string; raw: string; light?: string }>;
  }>;
  variables?: Array<{ name: string; categoryName?: string; categoryId?: string; value?: string }>;
  suggestions?: Record<string, unknown>;
  mappingSource?: string;
  localMappingPresent?: boolean;
  remoteMappingPresent?: boolean;
  effectiveBundlePresent?: boolean;
  lastSavedAt?: string;
};

const standaloneState: PixflowFrameworkState = {
  routes: [],
  activeRouteId: '',
  // Pixflow-owned: framework readiness must come from the WordPress site. If
  // the bridge app loses WP context, fail closed instead of showing a false
  // "Native Bricks token mapping saved" state with no selectable routes.
  mapping: {
    present: false,
    source: 'wordpress-unavailable',
    hash: '',
    updatedAt: '',
    message: 'Open Pixflow Design from WordPress to configure framework routes.',
  },
  setup: {},
};

// Pixflow-owned: WordPress remains the source of truth for Bricks token route
// state; the bridge-hosted app reaches it through the parent REST proxy.
export async function fetchPixflowFrameworkState(): Promise<PixflowFrameworkState> {
  if (!isPixflowWordPressEmbed()) return standaloneState;
  const response = await requestWordPressRest<PixflowFrameworkState>('framework/state');
  if (!response.ok) {
    throw new Error((response.body as { message?: string })?.message ?? 'Could not load Pixflow token mapping.');
  }
  return response.body;
}

export async function activatePixflowFrameworkRoute(routeId: string): Promise<PixflowFrameworkState> {
  const response = await requestWordPressRest<{ ok: boolean; message?: string; state?: PixflowFrameworkState }>(
    'framework/active-route',
    { method: 'POST', body: { routeId } },
  );
  if (!response.ok || !response.body.ok || !response.body.state) {
    throw new Error(response.body?.message ?? 'Could not activate this token route.');
  }
  return response.body.state;
}

export async function fetchPixflowRouteContext(routeId = '', postId = 0): Promise<PixflowRouteContextSnapshot> {
  const params = new URLSearchParams();
  if (routeId.trim()) params.set('routeId', routeId.trim());
  if (postId > 0) params.set('postId', String(Math.trunc(postId)));
  const query = params.size > 0 ? `?${params.toString()}` : '';
  const response = await requestWordPressRest<PixflowRouteContextSnapshot>(`framework/route-context${query}`);
  if (!response.ok) {
    throw new Error((response.body as { message?: string })?.message ?? 'Could not load Pixflow route context.');
  }
  return response.body;
}

export async function fetchPixflowFrameworkDesignSystem(): Promise<PixflowDesignSystemState> {
  let response;
  try {
    response = await requestWordPressAjax<PixflowDesignSystemState>(
      'pixflow_design_framework_system_profile',
      { operation: 'load' },
    );
  } catch {
    response = await requestWordPressRest<PixflowDesignSystemState>('framework/system-profile');
  }
  if (!response.ok) {
    throw new Error((response.body as { message?: string })?.message ?? 'Could not load Pixflow Design System.');
  }
  return response.body;
}

export async function savePixflowFrameworkDesignSystem(
  profile: PixflowDesignSystemProfile,
): Promise<{
  ok: boolean;
  message?: string;
  profile?: PixflowDesignSystemProfile;
  activeRouteId?: string;
  persisted?: boolean;
  builderState?: import('./framework-builder-sync').PixflowBuilderStyleState;
}> {
  let response;
  try {
    response = await requestWordPressAjax<{
      ok: boolean;
      message?: string;
      code?: string;
      profile?: PixflowDesignSystemProfile;
      activeRouteId?: string;
      persisted?: boolean;
      builderState?: import('./framework-builder-sync').PixflowBuilderStyleState;
    }>('pixflow_design_framework_system_profile', {
      operation: 'save',
      payload: { profile: profile as unknown as Record<string, unknown> },
    });
  } catch {
    response = await requestWordPressRest<{
      ok: boolean;
      message?: string;
      code?: string;
      profile?: PixflowDesignSystemProfile;
      activeRouteId?: string;
      persisted?: boolean;
      builderState?: import('./framework-builder-sync').PixflowBuilderStyleState;
    }>('framework/system-profile', { method: 'POST', body: { profile: profile as unknown as Record<string, unknown> } });
  }
  if (!response.ok || !response.body.ok) {
    const body = response.body as { message?: string; code?: string } | undefined;
    const details = [
      body?.message,
      body?.code ? `(${body.code})` : '',
      response.status ? `[${response.status}]` : '',
    ].filter(Boolean).join(' ');
    throw new Error(details || 'Could not save Pixflow Design System.');
  }
  return response.body;
}

export async function fetchPixflowFrameworkDesignSystemPublication(): Promise<PixflowDesignSystemPublicationState> {
  const response = await requestWordPressRest<PixflowDesignSystemPublicationState>(
    'framework/system-publication',
  );
  if (!response.ok) {
    throw new Error(
      (response.body as { message?: string })?.message
      ?? 'Could not load the reusable design system link.',
    );
  }
  return response.body;
}

export async function publishPixflowFrameworkDesignSystem(
  title: string,
  profile: PixflowDesignSystemProfile,
  routeContext: PixflowRouteContextSnapshot,
  existingPublication?: PixflowDesignSystemPublication | null,
): Promise<PublishPixflowFrameworkDesignSystemResponse> {
  const config = getPixflowWordPressConfig();
  const response = await fetch(toPixflowRuntimeUrl('/api/design-systems/pixflow-framework'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      summary: `Reusable design system published from ${config?.siteLabel ?? 'a Pixflow Framework site'}.`,
      routeId: routeContext.activeRouteId,
      ...(config?.siteUrl || config?.siteOrigin ? { siteUrl: config.siteUrl ?? config.siteOrigin } : {}),
      ...(config?.siteLabel ? { siteName: config.siteLabel } : {}),
      profile,
      routeContext: routeContext as unknown as Record<string, unknown>,
      bricksTokenMap: routeContext.sources.bricks as unknown as Record<string, unknown>,
      ...(existingPublication?.designSystemId
        ? { existingDesignSystemId: existingPublication.designSystemId }
        : {}),
    }),
  });
  const body = await response.json().catch(() => ({})) as
    Partial<PublishPixflowFrameworkDesignSystemResponse> & { error?: string };
  if (!response.ok || !body.designSystemId || !body.syncHash || !body.designSystem) {
    throw new Error(body.error ?? 'Could not publish this reusable design system.');
  }
  return body as PublishPixflowFrameworkDesignSystemResponse;
}

export async function savePixflowFrameworkDesignSystemPublication(
  publication: Omit<PixflowDesignSystemPublication, 'publishedAt'>,
): Promise<PixflowDesignSystemPublication> {
  const response = await requestWordPressRest<{
    ok: boolean;
    message?: string;
    publication?: PixflowDesignSystemPublication;
  }>('framework/system-publication', {
    method: 'POST',
    body: { publication: publication as unknown as Record<string, unknown> },
  });
  if (!response.ok || !response.body.ok || !response.body.publication) {
    throw new Error(response.body.message ?? 'Could not link the reusable design system to this route.');
  }
  return response.body.publication;
}

export async function fetchNativeBricksMappingWizard(): Promise<PixflowMappingWizardPayload> {
  const response = await requestWordPressRest<PixflowMappingWizardPayload>('framework/mapping/native-bricks');
  if (!response.ok) {
    throw new Error((response.body as { message?: string })?.message ?? 'Could not load Native Bricks mapping.');
  }
  return response.body;
}

export async function saveNativeBricksMappingWizard(
  wizardState: Record<string, unknown>,
): Promise<{ wizard?: PixflowMappingWizardPayload; customMappingBundlePresent?: boolean }> {
  const response = await requestWordPressRest<{ wizard?: PixflowMappingWizardPayload; customMappingBundlePresent?: boolean }>(
    'framework/mapping/native-bricks',
    { method: 'POST', body: { wizardState } },
  );
  if (!response.ok) {
    throw new Error((response.body as { message?: string })?.message ?? 'Could not save Native Bricks mapping.');
  }
  return response.body;
}

// Pixflow-owned: central helper for applying the WordPress-side compatibility
// mapping before generated Bricks templates are inserted into the page.
export async function rewritePixflowTemplatePayload<T extends Record<string, unknown>>(
  payload: T,
  routeId = '',
): Promise<{ payload: T; routeId: string }> {
  if (!isPixflowWordPressEmbed()) return { payload, routeId };
  const response = await requestWordPressRest<{ ok: boolean; payload?: T; routeId?: string; message?: string }>(
    'framework/template-rewrite',
    { method: 'POST', body: { payload, routeId } },
  );
  if (!response.ok || !response.body.ok || !response.body.payload) {
    throw new Error(response.body?.message ?? 'Could not apply Pixflow token mapping.');
  }
  return { payload: response.body.payload, routeId: response.body.routeId ?? routeId };
}
