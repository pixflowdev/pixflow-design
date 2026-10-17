export const PIXFLOW_BRICKS_MUTATION_SCHEMA = 'pixflow.bricks.mutation.v1' as const;

export type PixflowBricksElement = Record<string, unknown> & { id?: string };
export type PixflowBricksGlobalClass = Record<string, unknown> & { id?: string };

export type PixflowBricksMutationEvent =
  | { type: 'add'; elements: PixflowBricksElement[] }
  | { type: 'remove'; elementIds: string[] }
  | { type: 'patch'; patches: Array<{ id: string; changes: Record<string, unknown>; removeKeys?: string[] }> }
  | { type: 'reorder'; orderedIds: string[] }
  | { type: 'classes'; upsert: PixflowBricksGlobalClass[]; removeIds: string[] }
  | { type: 'sidecar_delta'; sidecars: Record<string, unknown> }
  | { type: 'focus'; elementId: string }
  | {
    type: 'checkpoint';
    checkpointId: string;
    payloadHash: string;
    elementCount: number;
    elementIds?: string[];
    globalClassCount: number;
    globalClassIds?: string[];
    status?: string | null;
  }
  | { type: 'rollback'; checkpointId: string };

export type PixflowBricksMutationBatch = {
  schema: typeof PIXFLOW_BRICKS_MUTATION_SCHEMA;
  sequence: number;
  source: 'baseline' | 'draft' | 'result' | 'rollback';
  checkpointId: string;
  payloadHash: string;
  events: PixflowBricksMutationEvent[];
};

export type PixflowBricksMutationAck = {
  ok: boolean;
  status: 'applied_verified' | 'rolled_back_verified' | 'rejected' | 'queued';
  checkpointId: string;
  sequence: number;
  payloadHash: string;
  observed: {
    elementCount: number;
    globalClassCount: number;
    orderedElementIdsHash?: string;
    missingElementIds?: string[];
    missingGlobalClassIds?: string[];
  };
  message?: string;
};
