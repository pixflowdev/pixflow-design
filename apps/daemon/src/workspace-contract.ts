import type { OrchestratorWorkspace, RunWorkspace } from '@open-design/contracts';

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function plainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeOrchestratorWorkspace(value: unknown): OrchestratorWorkspace | null {
  const record = plainObject(value);
  if (!record || stringField(record.kind) !== 'scratch') return null;
  if (record.writeback != null && stringField(record.writeback) !== 'external') return null;
  const result: OrchestratorWorkspace = { kind: 'scratch', writeback: 'external' };
  const sourceLabel = stringField(record.sourceLabel);
  const sourceRef = stringField(record.sourceRef);
  const baseRevision = stringField(record.baseRevision);
  if (sourceLabel) result.sourceLabel = sourceLabel;
  if (sourceRef) result.sourceRef = sourceRef;
  if (baseRevision) result.baseRevision = baseRevision;
  return result;
}

export function projectWorkspaceProvenance(metadata: unknown): RunWorkspace {
  const record = plainObject(metadata);
  const baseDir = stringField(record?.baseDir);
  const orchestrator = normalizeOrchestratorWorkspace(record?.orchestratorWorkspace);
  if (orchestrator) {
    return {
      storage: { kind: 'folder-backed', baseDir },
      provenance: {
        ...orchestrator,
        kind: 'orchestrator-scratch',
        writeback: 'external',
      },
    };
  }
  if (baseDir) {
    return {
      storage: { kind: 'folder-backed', baseDir },
      provenance: { kind: 'user-local', writeback: 'in-place' },
    };
  }
  return {
    storage: { kind: 'od-owned', baseDir: null },
    provenance: null,
  };
}
