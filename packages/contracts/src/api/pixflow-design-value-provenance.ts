export const PIXFLOW_DESIGN_VALUE_PROVENANCE_SCHEMA = 'pixflow.design_value_provenance.v1' as const;

export type PixflowDesignValueResourceType = 'variable' | 'variable_category' | 'palette' | 'palette_color';
export type PixflowDesignValueOrigin =
  | 'framework'
  | 'user'
  | 'custom_mapped'
  | 'pixflow_design_system'
  | 'pixflow_generated'
  | 'imported'
  | 'unknown';
export type PixflowDesignValueGeneratedRoute =
  | 'html_to_bricks'
  | 'website_clone'
  | 'build_in_bricks'
  | 'template_import'
  | 'other';
export type PixflowFrameworkMembership = 'member' | 'not_member' | 'unknown';
export type PixflowDesignValueScope = 'site' | 'post' | 'project';

export type PixflowDesignValueProvenance = {
  schema: typeof PIXFLOW_DESIGN_VALUE_PROVENANCE_SCHEMA;
  version: 1;
  resourceType: PixflowDesignValueResourceType;
  resourceId: string;
  origin: PixflowDesignValueOrigin;
  generator?: PixflowDesignValueGeneratedRoute;
  frameworkId?: string;
  frameworkMembership: PixflowFrameworkMembership;
  frameworkEligible: boolean;
  frameworkEvidence: string[];
  designContextEligible: boolean;
  designContextEvidence: string[];
  scope: PixflowDesignValueScope;
  postId?: number;
  projectId?: string;
  runId?: string;
  route?: string;
  categoryId?: string;
  createdAt: string;
  updatedAt: string;
  inference?: 'authoritative' | 'legacy_inferred' | 'unknown';
};

export type PixflowDesignValueProvenanceRegistry = {
  schema: typeof PIXFLOW_DESIGN_VALUE_PROVENANCE_SCHEMA;
  version: 1;
  updatedAt: string;
  records: Record<string, PixflowDesignValueProvenance>;
};

export function provenanceKey(resourceType: PixflowDesignValueResourceType, resourceId: string): string {
  return `${resourceType}:${resourceId.trim()}`;
}

export function isDesignContextEligible(value: Partial<PixflowDesignValueProvenance> | null | undefined): boolean {
  return value?.designContextEligible === true;
}

export function normalizeDesignValueProvenance(
  input: Partial<PixflowDesignValueProvenance> & Pick<PixflowDesignValueProvenance, 'resourceType' | 'resourceId'>,
  now = new Date().toISOString(),
): PixflowDesignValueProvenance {
  const origin = input.origin ?? 'unknown';
  const generated = input.generator;
  const generatedIneligible = origin === 'pixflow_generated' || origin === 'imported';
  const eligible = input.designContextEligible === true && !generatedIneligible;
  const frameworkEligible = !generatedIneligible
    && origin !== 'unknown'
    && (input.frameworkEligible ?? ['framework', 'custom_mapped', 'pixflow_design_system'].includes(origin));
  const postId = positiveInteger(input.postId);
  return {
    schema: PIXFLOW_DESIGN_VALUE_PROVENANCE_SCHEMA,
    version: 1,
    resourceType: input.resourceType,
    resourceId: input.resourceId.trim(),
    origin,
    ...(generated ? { generator: generated } : {}),
    ...(input.frameworkId ? { frameworkId: input.frameworkId.trim() } : {}),
    frameworkMembership: input.frameworkMembership ?? 'unknown',
    frameworkEligible: Boolean(frameworkEligible),
    frameworkEvidence: uniqueStrings(input.frameworkEvidence),
    designContextEligible: eligible,
    designContextEvidence: uniqueStrings(input.designContextEvidence),
    scope: input.scope ?? 'site',
    ...(postId ? { postId } : {}),
    ...(input.projectId?.trim() ? { projectId: input.projectId.trim() } : {}),
    ...(input.runId?.trim() ? { runId: input.runId.trim() } : {}),
    ...(input.route?.trim() ? { route: input.route.trim() } : {}),
    ...(input.categoryId?.trim() ? { categoryId: input.categoryId.trim() } : {}),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    inference: input.inference ?? 'authoritative',
  };
}

export function createEmptyDesignValueProvenanceRegistry(now = new Date().toISOString()): PixflowDesignValueProvenanceRegistry {
  return {
    schema: PIXFLOW_DESIGN_VALUE_PROVENANCE_SCHEMA,
    version: 1,
    updatedAt: now,
    records: {},
  };
}

function uniqueStrings(values: unknown): string[] {
  return Array.isArray(values)
    ? [...new Set(values.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean))].slice(0, 12)
    : [];
}

function positiveInteger(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}
