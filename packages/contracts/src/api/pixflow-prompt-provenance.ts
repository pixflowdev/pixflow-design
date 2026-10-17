/**
 * Redacted, provider-neutral provenance for the effective instruction stack.
 *
 * This is deliberately a source manifest rather than a copy of the prompt.
 * It lets diagnostics and tests prove which authorities were staged without
 * leaking site values, user content, credentials, or provider transcripts.
 */
export const PIXFLOW_PROMPT_PROVENANCE_SCHEMA = 'pixflow.prompt_provenance.v1' as const;

export type PixflowPromptPipeline = 'build-in-bricks' | 'prototype-html';
export type PixflowPromptTransport =
  | 'local-cli'
  | 'byok-api'
  | 'wordpress-byok'
  | 'daemon';
export type PixflowPromptLayerKind =
  | 'system'
  | 'skill'
  | 'dynamic'
  | 'context'
  | 'provider'
  | 'user'
  | 'compatibility'
  | 'plugin'
  | 'craft'
  | 'preset'
  | 'scenario';
export type PixflowPromptOwner =
  | 'pixflow-agent-core'
  | 'build-in-bricks'
  | 'shared-web'
  | 'prototype-html'
  | 'site'
  | 'provider'
  | 'user'
  | 'open-design'
  | 'compatibility';

export type PixflowPromptLayer = {
  id: string;
  kind: PixflowPromptLayerKind;
  owner: PixflowPromptOwner;
  order: number;
  present: boolean;
  revision?: string;
  fingerprint?: string;
  /** Logical product source; never an environment-specific absolute path. */
  sourcePath?: string;
  reason?: string;
};

export type PixflowPromptSourceReference = {
  id: string;
  owner: PixflowPromptOwner;
  present: boolean;
  revision?: string;
  fingerprint?: string;
  /** Logical product source; never an environment-specific absolute path. */
  sourcePath?: string;
  reason?: string;
};

export type PixflowPromptProvenanceInput = {
  pipeline: PixflowPromptPipeline;
  transport: PixflowPromptTransport;
  layers: PixflowPromptLayer[];
  crafts?: PixflowPromptSourceReference[];
  presets?: PixflowPromptSourceReference[];
  plugins?: PixflowPromptSourceReference[];
  scenarios?: PixflowPromptSourceReference[];
  omissions?: PixflowPromptSourceReference[];
};

export type PixflowPromptProvenance = {
  schema: typeof PIXFLOW_PROMPT_PROVENANCE_SCHEMA;
  version: 1;
  pipeline: PixflowPromptPipeline;
  transport: PixflowPromptTransport;
  layers: PixflowPromptLayer[];
  crafts: PixflowPromptSourceReference[];
  presets: PixflowPromptSourceReference[];
  plugins: PixflowPromptSourceReference[];
  scenarios: PixflowPromptSourceReference[];
  omissions: PixflowPromptSourceReference[];
};

const MAX_LAYERS = 80;
const MAX_SOURCES = 40;
const MAX_TEXT = 160;

function boundedText(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, MAX_TEXT) : undefined;
}

function normalizeLayer(layer: PixflowPromptLayer): PixflowPromptLayer | null {
  const id = boundedText(layer?.id);
  if (!id) return null;
  const kind = layer.kind;
  const owner = layer.owner;
  if (!kind || !owner) return null;
  const order = Number.isFinite(layer.order) ? Math.max(0, Math.floor(layer.order)) : 0;
  const normalized: PixflowPromptLayer = {
    id,
    kind,
    owner,
    order,
    present: layer.present === true,
  };
  const revision = boundedText(layer.revision);
  const fingerprint = boundedText(layer.fingerprint);
  const sourcePath = boundedText(layer.sourcePath);
  const reason = boundedText(layer.reason);
  if (revision) normalized.revision = revision;
  if (fingerprint) normalized.fingerprint = fingerprint;
  if (sourcePath) normalized.sourcePath = sourcePath;
  if (reason) normalized.reason = reason;
  return normalized;
}

function normalizeSource(source: PixflowPromptSourceReference): PixflowPromptSourceReference | null {
  const id = boundedText(source?.id);
  if (!id || !source.owner) return null;
  const normalized: PixflowPromptSourceReference = {
    id,
    owner: source.owner,
    present: source.present === true,
  };
  const revision = boundedText(source.revision);
  const fingerprint = boundedText(source.fingerprint);
  const sourcePath = boundedText(source.sourcePath);
  const reason = boundedText(source.reason);
  if (revision) normalized.revision = revision;
  if (fingerprint) normalized.fingerprint = fingerprint;
  if (sourcePath) normalized.sourcePath = sourcePath;
  if (reason) normalized.reason = reason;
  return normalized;
}

function normalizeSources(value: PixflowPromptSourceReference[] | undefined): PixflowPromptSourceReference[] {
  const seen = new Set<string>();
  return (Array.isArray(value) ? value : [])
    .map(normalizeSource)
    .filter((source): source is PixflowPromptSourceReference => Boolean(source))
    .filter((source) => {
      if (seen.has(source.id)) return false;
      seen.add(source.id);
      return true;
    })
    .slice(0, MAX_SOURCES);
}

export function createPixflowPromptProvenance(input: PixflowPromptProvenanceInput): PixflowPromptProvenance {
  const layers = (Array.isArray(input.layers) ? input.layers : [])
    .map(normalizeLayer)
    .filter((layer): layer is PixflowPromptLayer => Boolean(layer))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .slice(0, MAX_LAYERS);
  return {
    schema: PIXFLOW_PROMPT_PROVENANCE_SCHEMA,
    version: 1,
    pipeline: input.pipeline,
    transport: input.transport,
    layers,
    crafts: normalizeSources(input.crafts),
    presets: normalizeSources(input.presets),
    plugins: normalizeSources(input.plugins),
    scenarios: normalizeSources(input.scenarios),
    omissions: normalizeSources(input.omissions),
  };
}
