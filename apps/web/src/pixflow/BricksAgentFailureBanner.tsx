import { Button } from '@open-design/components';
import type {
  PixflowBricksAgentFailureAction,
  PixflowBricksAgentFailureNotice,
} from '@open-design/contracts';
import { SharedRunFailureCard } from '../components/shared-chat';

const AGENT_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  antigravity: 'Antigravity',
  opencode: 'OpenCode',
  'cursor-agent': 'Cursor Agent',
  copilot: 'GitHub Copilot',
  pi: 'Pi',
  byok: 'BYOK provider',
};

/** Terminal interruption/cancellation is already explained in the transcript.
 * Only current execution readiness may describe a new connection problem. */
type FailureDiagnosticState = { messages?: ReadonlyArray<{ role?: string; runStatus?: string }>; streamError?: string | null; error?: string | null; failureNotice?: unknown };
function terminalOutcomePresented(state: FailureDiagnosticState): boolean {
  const latest = [...(state.messages ?? [])].reverse().find(message => message.role === 'assistant');
  return latest?.runStatus === 'interrupted' || latest?.runStatus === 'canceled';
}
export function bricksAgentFailureDiagnostic(
  state: FailureDiagnosticState,
  execution: { ready: boolean; error?: string | null },
): string {
  const presented = terminalOutcomePresented(state);
  return (!presented ? state.streamError || state.error : '')
    || (!execution.ready ? execution.error : '') || '';
}

export function bricksAgentFailureNoticeForState(state: FailureDiagnosticState, execution: { ready: boolean; error?: string | null }, agentId = '') {
  return normalizePixflowBricksAgentFailureNotice(
    terminalOutcomePresented(state) ? null : state.failureNotice,
    bricksAgentFailureDiagnostic(state, execution), agentId,
  );
}

function agentLabel(agentId: string): string {
  const normalized = agentId.trim().toLowerCase();
  if (!normalized) return 'Local CLI';
  return AGENT_LABELS[normalized]
    ?? normalized
      .split(/[-_\s]+/u)
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
      .join(' ');
}

function cleanFailureText(value: unknown): string {
  const text = String(value || '')
    .replace(/\u001b\[[0-9;]*m/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!text) return '';

  try {
    const parsed = JSON.parse(text) as {
      message?: unknown;
      error?: unknown;
      detail?: unknown;
    };
    const nested = typeof parsed.error === 'object' && parsed.error !== null
      ? (parsed.error as { message?: unknown }).message
      : parsed.error;
    const candidate = parsed.message ?? nested ?? parsed.detail;
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.replace(/\s+/gu, ' ').trim().slice(0, 360);
    }
  } catch {
    // Normal CLI errors are plain text.
  }

  return text
    .replace(/\s*(?:Claude|Codex|OpenCode|Antigravity|CLI) output:\s*\{[\s\S]*$/iu, '')
    .slice(0, 360)
    .trim();
}

function fallbackNotice(
  kind: PixflowBricksAgentFailureNotice['kind'],
  title: string,
  message: string,
  action: PixflowBricksAgentFailureAction,
  actionLabel: string,
  agentId: string,
  code: string,
): PixflowBricksAgentFailureNotice {
  return {
    code,
    kind,
    title,
    message,
    action,
    actionLabel,
    retryable: action !== 'none',
    ...(agentId ? { agentId } : {}),
  };
}

function isFailureNotice(value: unknown): value is PixflowBricksAgentFailureNotice {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PixflowBricksAgentFailureNotice>;
  return typeof candidate.title === 'string'
    && typeof candidate.message === 'string'
    && typeof candidate.kind === 'string'
    && typeof candidate.action === 'string';
}

export function normalizePixflowBricksAgentFailureNotice(
  value: unknown,
  fallbackMessage = '',
  fallbackAgentId = '',
  fallbackSurfaceLabel = 'Bricks Agent',
): PixflowBricksAgentFailureNotice | null {
  if (isFailureNotice(value)) {
    const message = cleanFailureText(value.message);
    return {
      ...value,
      title: cleanFailureText(value.title) || `${fallbackSurfaceLabel} could not complete the request`,
      message: message || 'Check the selected CLI and model, then retry.',
      actionLabel: cleanFailureText(value.actionLabel),
      agentId: value.agentId || fallbackAgentId || undefined,
    };
  }

  const message = cleanFailureText(fallbackMessage);
  if (!message) return null;
  const agentId = fallbackAgentId.trim();
  const label = agentLabel(agentId);

  if (
    /auth(?:entication|orization)? (?:failed|required)|failed to authenticate|oauth session expired|access token (?:could not|cannot|can't) be refreshed|refresh token (?:was|has been|is)?[ _-]?(?:revoked|invalid|expired)|token refresh (?:failed|was rejected)|not (?:logged|signed) in|login required|invalid api key|unauthorized|\b401\b/iu.test(message)
  ) {
    return fallbackNotice(
      'authentication',
      `${label} needs you to sign in`,
      `${label} could not authenticate. Sign in with the CLI in a terminal, then rescan Local CLI in this panel.`,
      'rescan',
      'Rescan after sign-in',
      agentId,
      'AGENT_AUTH_REQUIRED',
    );
  }

  if (/\b429\b|rate[_ -]?limit(?:ed)?|quota (?:exceeded|reached)|insufficient[_ -]?quota|resource[_ -]?exhausted|usage (?:limit|exhausted)|no remaining usage|credits? (?:have been )?exhausted/iu.test(message)) {
    return fallbackNotice(
      'rate_limit',
      `${label} has reached a usage limit`,
      'Choose another available model or retry after the provider limit resets.',
      'choose_model',
      'Choose model',
      agentId,
      'RATE_LIMITED',
    );
  }

  if (/requires? explicit opt[ -]?in|provider opt[ -]?in|only available hosted in/iu.test(message)) {
    return fallbackNotice(
      'model',
      'Selected model requires provider opt-in',
      message,
      'choose_model',
      'Choose model',
      agentId,
      'MODEL_REQUIRES_OPT_IN',
    );
  }

  if (/model .*(?:not found|not available|unavailable|not supported)|selected model is at capacity/iu.test(message)) {
    return fallbackNotice(
      'model',
      'Selected model is unavailable',
      'Choose another available model for this CLI, then retry the request.',
      'choose_model',
      'Choose model',
      agentId,
      'MODEL_UNAVAILABLE',
    );
  }

  if (/\b(?:502|503|504)\b|service temporarily unavailable|upstream (?:error|unavailable)/iu.test(message)) {
    return fallbackNotice(
      'upstream',
      'The model service is temporarily unavailable',
      'The CLI is connected, but its model provider could not complete the request. Retry in a moment.',
      'retry',
      'Retry',
      agentId,
      'UPSTREAM_UNAVAILABLE',
    );
  }

  if (/\b(?:timed out|timeout|stream idle)\b/iu.test(message)) {
    return fallbackNotice(
      'timeout',
      'The request took too long',
      'The CLI stopped responding before the request completed. Check the connection and retry.',
      'retry',
      'Retry',
      agentId,
      'TIMEOUT',
    );
  }

  if (/pixflow (?:design )?license|validate your pixflow design license/iu.test(message)) {
    return fallbackNotice(
      'license',
      'Pixflow Design license needs attention',
      message,
      'retry',
      'Retry',
      agentId,
      'LICENSE_REQUIRED',
    );
  }

  if (message === 'Pixflow Design Bridge agents are still loading.') {
    return fallbackNotice(
      'bridge',
      'Providers are not ready yet',
      'The provider list could not finish loading. Pixflow will retry when the Bridge is available, or you can rescan now.',
      'rescan',
      'Rescan providers',
      agentId,
      'PROVIDERS_NOT_READY',
    );
  }

  if (/bridge|failed to fetch|connection refused|networkerror|load failed/iu.test(message)) {
    return fallbackNotice(
      'bridge',
      'Local CLI bridge is offline',
      'Start Pixflow Design Bridge, reconnect it to this site, then rescan Local CLI.',
      'rescan',
      'Reconnect and rescan',
      agentId,
      'BRIDGE_UNAVAILABLE',
    );
  }

  return fallbackNotice(
    'unknown',
    `${fallbackSurfaceLabel} could not complete the request`,
    message,
    'retry',
    'Retry',
    agentId,
    'AGENT_EXECUTION_FAILED',
  );
}

interface BricksAgentFailureBannerProps {
  notice: PixflowBricksAgentFailureNotice;
  diagnostic?: string | null;
  onRetry?: () => void;
  onRescan?: () => void;
  onChooseModel?: () => void;
}

export function BricksAgentFailureBanner({
  notice,
  diagnostic,
  onRetry,
  onRescan,
  onChooseModel,
}: BricksAgentFailureBannerProps) {
  const handler = notice.action === 'retry'
    ? onRetry
    : notice.action === 'rescan'
      ? onRescan
      : notice.action === 'choose_model'
        ? onChooseModel
        : undefined;

  return (
    <SharedRunFailureCard
      title={notice.title}
      message={notice.message}
      diagnostic={diagnostic && diagnostic.trim() !== notice.message.trim() ? diagnostic : null}
      actions={handler && notice.actionLabel ? (
        <Button variant="default" onClick={handler}>
          {notice.actionLabel}
        </Button>
      ) : null}
    />
  );
}
