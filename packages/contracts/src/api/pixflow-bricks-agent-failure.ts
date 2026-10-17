export type PixflowBricksAgentFailureKind =
  | 'authentication'
  | 'bridge'
  | 'rate_limit'
  | 'model'
  | 'upstream'
  | 'timeout'
  | 'license'
  | 'validation'
  | 'unknown';

export type PixflowBricksAgentFailureAction =
  | 'retry'
  | 'rescan'
  | 'choose_model'
  | 'none';

export interface PixflowBricksAgentFailureNotice {
  code: string;
  kind: PixflowBricksAgentFailureKind;
  title: string;
  message: string;
  action: PixflowBricksAgentFailureAction;
  actionLabel: string;
  retryable: boolean;
  agentId?: string;
}
