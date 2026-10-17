export interface OrchestratorWorkspace {
  kind: 'scratch';
  sourceLabel?: string;
  sourceRef?: string;
  baseRevision?: string;
  writeback?: 'external';
}

export interface RunWorkspaceStorage {
  kind: 'od-owned' | 'folder-backed';
  baseDir: string | null;
}

export interface RunWorkspaceProvenance {
  kind: 'user-local' | 'orchestrator-scratch';
  writeback: 'in-place' | 'external';
  sourceLabel?: string;
  sourceRef?: string;
  baseRevision?: string;
}

export interface RunWorkspace {
  storage: RunWorkspaceStorage;
  provenance: RunWorkspaceProvenance | null;
}
