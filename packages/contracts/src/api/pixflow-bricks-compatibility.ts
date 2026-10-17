export const PIXFLOW_BRICKS_COMPATIBILITY_SCHEMA = 'pixflow.html_to_bricks.bricks_compatibility.v1' as const;
export const PIXFLOW_BRICKS_PROFILE_VERSION = '2026-08-10.1' as const;

export type PixflowBricksCompatibilityStatus = 'supported' | 'partial' | 'unknown' | 'incompatible';
export type PixflowBricksCapabilityStatus = 'supported' | 'partial' | 'unavailable' | 'unknown';
export type PixflowBricksThemeStyleLoadingMethod = 'all' | 'specific' | 'unknown';

export type PixflowBricksBreakpoint = {
  key: string;
  label: string;
  width: number;
  base: boolean;
};

export type PixflowBricksElementCapability = {
  supported: boolean;
  nestable: boolean;
  semanticTagControl: string | null;
  link: boolean;
  form: boolean;
  media: boolean;
  svg: boolean;
  code: boolean;
  fallbackElement: string;
  reason: string;
};

export type PixflowBricksCompatibilityDiagnostic = {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  profileId: string;
  bricksVersion: string | null;
  ownership: 'native_control' | 'scoped_css' | 'blocked';
  control?: string;
  cssProperty?: string;
  elementName?: string;
};

export type PixflowBricksCompatibilityContext = {
  schema: typeof PIXFLOW_BRICKS_COMPATIBILITY_SCHEMA;
  version: 1;
  profileVersion: typeof PIXFLOW_BRICKS_PROFILE_VERSION;
  profileId: string;
  status: PixflowBricksCompatibilityStatus;
  statusReason: string;
  bricksVersion: string | null;
  source: string;
  capturedAt: string;
  fallbackUsed: boolean;
  fallbackReason: string;
  breakpoints: PixflowBricksBreakpoint[];
  breakpointMode: {
    baseKey: string;
    baseWidth: number;
    mobileFirst: boolean;
    narrowerRule: 'max-width' | 'min-width';
    widerRule: 'max-width' | 'min-width';
  };
  pseudoStates: string[];
  compositeKeyFormat: '{control}:{breakpoint}:{pseudo}';
  themeStyleLoadingMethod: PixflowBricksThemeStyleLoadingMethod;
  globalData: {
    globalClasses: PixflowBricksCapabilityStatus;
    variables: PixflowBricksCapabilityStatus;
    palettes: PixflowBricksCapabilityStatus;
    themeStyles: PixflowBricksCapabilityStatus;
    pageSettings: PixflowBricksCapabilityStatus;
  };
  elementCapabilities: Record<string, PixflowBricksElementCapability>;
  provenance: {
    owner: 'pixflow';
    nativeConverterConsulted: false;
    runtimeFields: string[];
    profileFields: string[];
  };
  diagnostics: PixflowBricksCompatibilityDiagnostic[];
};

export type PixflowBricksCompatibilityInput = {
  bricksVersion?: unknown;
  source?: unknown;
  capturedAt?: unknown;
  breakpoints?: unknown;
  breakpointMode?: unknown;
  pseudoStates?: unknown;
  themeStyleLoadingMethod?: unknown;
  runtimeCapabilities?: unknown;
  elementCapabilities?: unknown;
};

const DEFAULT_BREAKPOINTS: PixflowBricksBreakpoint[] = [
  { key: 'desktop', label: 'Desktop', width: 1279, base: true },
  { key: 'tablet_portrait', label: 'Tablet portrait', width: 991, base: false },
  { key: 'mobile_landscape', label: 'Mobile landscape', width: 767, base: false },
  { key: 'mobile_portrait', label: 'Mobile portrait', width: 478, base: false },
];

const DEFAULT_PSEUDO_STATES = ['hover', 'focus', 'focus-visible', 'active', 'visited', 'disabled', 'before', 'after'];

export function createPixflowBricksCompatibilityContext(
  input: PixflowBricksCompatibilityInput,
): PixflowBricksCompatibilityContext {
  const bricksVersion = optionalString(input.bricksVersion);
  const version = parseVersion(bricksVersion);
  const fallbackUsed = bricksVersion === '';
  const profileId = 'bricks-2.4';
  const status = compatibilityStatus(version, fallbackUsed);
  const runtimeBreakpoints = normalizeBreakpoints(input.breakpoints);
  const breakpoints = runtimeBreakpoints.length > 0 ? runtimeBreakpoints : DEFAULT_BREAKPOINTS.map((item) => ({ ...item }));
  const mode = record(input.breakpointMode);
  const base = breakpoints.find((item) => item.base)
    || breakpoints.find((item) => item.key === optionalString(mode.baseKey))
    || breakpoints[0]!;
  const pseudoStates = uniqueStrings(input.pseudoStates)
    .map((item) => item.replace(/^:+/, '').trim().toLowerCase())
    .filter(Boolean);
  const runtimeCapabilities = record(input.runtimeCapabilities);
  const source = optionalString(input.source) || (fallbackUsed ? 'pixflow_profile' : 'wordpress_runtime');
  const diagnostics: PixflowBricksCompatibilityDiagnostic[] = [];
  if (status === 'unknown') {
    diagnostics.push(diagnostic(
      'bricks_profile_unknown',
      `Bricks ${bricksVersion || 'unknown'} is not verified by Pixflow profile ${profileId}; unavailable declarations must use scoped CSS.`,
      profileId,
      bricksVersion || null,
      'scoped_css',
    ));
  } else if (status === 'incompatible') {
    diagnostics.push(diagnostic(
      'bricks_profile_incompatible',
      `Bricks ${bricksVersion} is outside the safe Pixflow compatibility range.`,
      profileId,
      bricksVersion || null,
      'blocked',
      'error',
    ));
  } else if (fallbackUsed) {
    diagnostics.push(diagnostic(
      'bricks_runtime_context_unavailable',
      `Runtime Bricks facts were unavailable; Pixflow is using its version-labelled ${profileId} fallback profile.`,
      profileId,
      null,
      'scoped_css',
      'warning',
    ));
  }

  return {
    schema: PIXFLOW_BRICKS_COMPATIBILITY_SCHEMA,
    version: 1,
    profileVersion: PIXFLOW_BRICKS_PROFILE_VERSION,
    profileId,
    status,
    statusReason: statusReason(status, bricksVersion, fallbackUsed),
    bricksVersion: bricksVersion || null,
    source,
    capturedAt: optionalString(input.capturedAt),
    fallbackUsed,
    fallbackReason: fallbackUsed ? 'runtime_context_unavailable' : '',
    breakpoints,
    breakpointMode: {
      baseKey: optionalString(mode.baseKey) || base.key || 'desktop',
      baseWidth: positiveNumber(mode.baseWidth) || base.width || 1279,
      mobileFirst: mode.mobileFirst === true,
      narrowerRule: mode.mobileFirst === true ? 'min-width' : 'max-width',
      widerRule: mode.mobileFirst === true ? 'max-width' : 'min-width',
    },
    pseudoStates: pseudoStates.length > 0 ? pseudoStates : [...DEFAULT_PSEUDO_STATES],
    compositeKeyFormat: '{control}:{breakpoint}:{pseudo}',
    themeStyleLoadingMethod: normalizeThemeStyleLoadingMethod(input.themeStyleLoadingMethod),
    globalData: {
      globalClasses: capabilityStatus(runtimeCapabilities.globalClasses, fallbackUsed),
      variables: capabilityStatus(runtimeCapabilities.variables, fallbackUsed),
      palettes: capabilityStatus(runtimeCapabilities.palettes, fallbackUsed),
      themeStyles: capabilityStatus(runtimeCapabilities.themeStyles, fallbackUsed),
      pageSettings: capabilityStatus(runtimeCapabilities.pageSettings, fallbackUsed),
    },
    elementCapabilities: normalizeElementCapabilities(input.elementCapabilities),
    provenance: {
      owner: 'pixflow',
      nativeConverterConsulted: false,
      runtimeFields: [
        ...(bricksVersion ? ['bricksVersion'] : []),
        ...(runtimeBreakpoints.length > 0 ? ['breakpoints'] : []),
        ...(Object.keys(mode).length > 0 ? ['breakpointMode'] : []),
        ...(pseudoStates.length > 0 ? ['pseudoStates'] : []),
        ...(optionalString(input.themeStyleLoadingMethod) ? ['themeStyleLoadingMethod'] : []),
        ...(Object.keys(runtimeCapabilities).length > 0 ? ['runtimeCapabilities'] : []),
      ],
      profileFields: [
        ...(runtimeBreakpoints.length === 0 ? ['breakpoints'] : []),
        ...(pseudoStates.length === 0 ? ['pseudoStates'] : []),
        'elementCapabilities',
        'controlRegistry',
      ],
    },
    diagnostics,
  };
}

export function normalizePixflowBricksCompatibilityContext(value: unknown): PixflowBricksCompatibilityContext {
  const candidate = record(value);
  if (
    candidate.schema === PIXFLOW_BRICKS_COMPATIBILITY_SCHEMA
    && candidate.version === 1
    && candidate.profileVersion === PIXFLOW_BRICKS_PROFILE_VERSION
    && ['supported', 'partial', 'unknown', 'incompatible'].includes(optionalString(candidate.status))
  ) {
    return candidate as PixflowBricksCompatibilityContext;
  }
  return createPixflowBricksCompatibilityContext(candidate);
}

function compatibilityStatus(
  version: { major: number; minor: number } | null,
  fallbackUsed: boolean,
): PixflowBricksCompatibilityStatus {
  if (fallbackUsed) return 'partial';
  if (!version) return 'unknown';
  if (version.major < 2) return 'incompatible';
  if (version.major > 2 || version.minor > 4) return 'unknown';
  return version.minor === 4 ? 'supported' : 'partial';
}

function statusReason(status: PixflowBricksCompatibilityStatus, version: string, fallbackUsed: boolean): string {
  if (fallbackUsed) return 'Runtime facts were unavailable; using the Pixflow Bricks 2.4 fallback profile.';
  if (status === 'supported') return `Bricks ${version} matches the verified Pixflow Bricks 2.4 profile.`;
  if (status === 'partial') return `Bricks ${version} can use the Pixflow Bricks 2.4 profile with scoped fallbacks for unverified controls.`;
  if (status === 'incompatible') return `Bricks ${version} predates Pixflow's safe compatibility boundary.`;
  return `Bricks ${version || 'unknown'} is not verified by the current Pixflow profile.`;
}

function normalizeBreakpoints(value: unknown): PixflowBricksBreakpoint[] {
  if (!Array.isArray(value)) return [];
  const normalized: PixflowBricksBreakpoint[] = [];
  for (const entry of value) {
    const item = record(entry);
    const key = optionalString(item.key || item.name || item.id);
    const width = positiveNumber(item.width ?? item.value ?? item.maxWidth ?? item.max_width);
    if (!key || !width) continue;
    normalized.push({
      key,
      label: optionalString(item.label) || key,
      width,
      base: item.base === true || /^(?:desktop|base)$/i.test(key),
    });
  }
  return normalized.filter((item, index, all) => all.findIndex((candidate) => candidate.key === item.key) === index);
}

function normalizeElementCapabilities(value: unknown): Record<string, PixflowBricksElementCapability> {
  const source = record(value);
  const result: Record<string, PixflowBricksElementCapability> = {};
  for (const [name, raw] of Object.entries(source)) {
    const item = record(raw);
    if (!name.trim()) continue;
    result[name] = {
      supported: item.supported === true,
      nestable: item.nestable === true,
      semanticTagControl: optionalString(item.semanticTagControl) || null,
      link: item.link === true,
      form: item.form === true,
      media: item.media === true,
      svg: item.svg === true,
      code: item.code === true,
      fallbackElement: optionalString(item.fallbackElement) || 'div',
      reason: optionalString(item.reason),
    };
  }
  return result;
}

function normalizeThemeStyleLoadingMethod(value: unknown): PixflowBricksThemeStyleLoadingMethod {
  const method = optionalString(value).toLowerCase();
  return method === 'all' || method === 'specific' ? method : 'unknown';
}

function capabilityStatus(value: unknown, fallbackUsed: boolean): PixflowBricksCapabilityStatus {
  if (value === true) return 'supported';
  if (value === false) return 'unavailable';
  return fallbackUsed ? 'partial' : 'unknown';
}

function diagnostic(
  code: string,
  message: string,
  profileId: string,
  bricksVersion: string | null,
  ownership: PixflowBricksCompatibilityDiagnostic['ownership'],
  severity: PixflowBricksCompatibilityDiagnostic['severity'] = 'warning',
): PixflowBricksCompatibilityDiagnostic {
  return { code, severity, message, profileId, bricksVersion, ownership };
}

function parseVersion(value: string): { major: number; minor: number } | null {
  const match = /^(\d+)\.(\d+)/.exec(value);
  return match ? { major: Number(match[1]), minor: Number(match[2]) } : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
    : [];
}

function positiveNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
