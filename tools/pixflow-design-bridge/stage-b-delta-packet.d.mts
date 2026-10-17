export type StageBDeltaPacketResult = {
  schema: 'pixflow.html_to_bricks.stage_b_delta.v1';
  sha256: string;
  packet: {
    source: Record<string, unknown> & { geometry: Array<Record<string, unknown>> };
    bricks: Record<string, unknown> & { geometry: Array<Record<string, unknown>> };
    issues: Array<Record<string, unknown>>;
  };
};

export function buildStageBDeltaPacket(input?: Record<string, unknown>): StageBDeltaPacketResult;
export function stageBDeltaPacketCacheDecision(previousHash: unknown, nextHash: unknown): 'hit' | 'miss';
