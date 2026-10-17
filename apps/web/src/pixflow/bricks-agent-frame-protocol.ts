// Pixflow-owned: typed message contract between the WordPress Bricks builder
// shell and the bridge-hosted Bricks Agent iframe. Keep this file UI-free so it
// can be shared by the hosted React app and future test harnesses.

export const PIXFLOW_BRICKS_AGENT_PROTOCOL_VERSION = 1 as const;

export const PIXFLOW_BRICKS_AGENT_FRAME_SOURCE = 'pixflow-design:bricks-agent-frame' as const;
export const PIXFLOW_BRICKS_AGENT_SHELL_SOURCE = 'pixflow-design:bricks-agent-shell' as const;

export type PixflowBricksAgentFrameSource =
  | typeof PIXFLOW_BRICKS_AGENT_FRAME_SOURCE
  | typeof PIXFLOW_BRICKS_AGENT_SHELL_SOURCE;

export type PixflowBricksAgentRequestType =
  | 'pixflow-bricks-agent:get-context'
  | 'pixflow-bricks-agent:refresh-context'
  | 'pixflow-bricks-agent:apply-live-mutation'
  | 'pixflow-bricks-agent:apply-insert'
  | 'pixflow-bricks-agent:apply-prepared-handoff'
  | 'pixflow-bricks-agent:rollback'
  | 'pixflow-bricks-agent:wp-rest-request'
  | 'pixflow-bricks-agent:send-prompt'
  | 'pixflow-bricks-agent:stop'
  | 'pixflow-bricks-agent:get-execution-settings'
  | 'pixflow-bricks-agent:set-mode'
  | 'pixflow-bricks-agent:set-model'
  | 'pixflow-bricks-agent:validate-insert'
  | 'pixflow-bricks-agent:text-preview-start'
  | 'pixflow-bricks-agent:text-preview-delta'
  | 'pixflow-bricks-agent:text-preview-commit'
  | 'pixflow-bricks-agent:text-preview-revert'
  | 'pixflow-bricks-agent:open-panel'
  | 'pixflow-bricks-agent:close-panel'
  | 'pixflow-bricks-agent:set-panel-state'
  | 'pixflow-bricks-agent:set-panel-size'
  | 'pixflow-bricks-agent:dock-panel';

export type PixflowBricksAgentEventType =
  | 'pixflow-bricks-agent:ready'
  | 'pixflow-bricks-agent:ui-ready'
  | 'pixflow-bricks-agent:state'
  | 'pixflow-bricks-agent:context'
  | 'pixflow-bricks-agent:execution-settings'
  | 'pixflow-bricks-agent:app-config-changed'
  | 'pixflow-bricks-agent:mutation-result'
  | 'pixflow-bricks-agent:wp-rest-response'
  | 'pixflow-bricks-agent:text-preview-result'
  | 'pixflow-bricks-agent:error';

export type PixflowBricksAgentMessageType =
  | PixflowBricksAgentRequestType
  | PixflowBricksAgentEventType;

export type PixflowBricksAgentError = {
  code: string;
  message: string;
  details?: unknown;
};

export type PixflowBricksAgentEnvelope<
  Type extends PixflowBricksAgentMessageType = PixflowBricksAgentMessageType,
  Payload = unknown,
> = {
  source: PixflowBricksAgentFrameSource;
  version: typeof PIXFLOW_BRICKS_AGENT_PROTOCOL_VERSION;
  type: Type;
  requestId?: string;
  payload?: Payload;
  error?: PixflowBricksAgentError;
};

export function createPixflowBricksAgentMessage<
  Type extends PixflowBricksAgentMessageType,
  Payload = unknown,
>(
  source: PixflowBricksAgentFrameSource,
  type: Type,
  payload?: Payload,
  options: { requestId?: string; error?: PixflowBricksAgentError } = {},
): PixflowBricksAgentEnvelope<Type, Payload> {
  return {
    source,
    version: PIXFLOW_BRICKS_AGENT_PROTOCOL_VERSION,
    type,
    ...(options.requestId ? { requestId: options.requestId } : {}),
    ...(payload === undefined ? {} : { payload }),
    ...(options.error ? { error: options.error } : {}),
  };
}

export function isPixflowBricksAgentMessage(value: unknown): value is PixflowBricksAgentEnvelope {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<PixflowBricksAgentEnvelope>;
  return (
    candidate.version === PIXFLOW_BRICKS_AGENT_PROTOCOL_VERSION &&
    (candidate.source === PIXFLOW_BRICKS_AGENT_FRAME_SOURCE ||
      candidate.source === PIXFLOW_BRICKS_AGENT_SHELL_SOURCE) &&
    typeof candidate.type === 'string' &&
    candidate.type.startsWith('pixflow-bricks-agent:')
  );
}
