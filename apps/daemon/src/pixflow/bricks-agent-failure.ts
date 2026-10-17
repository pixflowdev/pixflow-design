import type {
  PixflowBricksAgentFailureNotice,
  PixflowBricksAgentFailureKind,
} from '@open-design/contracts';
import {
  classifyAgentAuthFailure,
  classifyAgentServiceFailure,
} from '../runtimes/auth.js';

const AGENT_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  antigravity: 'Antigravity',
  opencode: 'OpenCode',
  'cursor-agent': 'Cursor Agent',
  copilot: 'GitHub Copilot',
  deepseek: 'DeepSeek',
  qwen: 'Qwen Code',
  qoder: 'Qoder CLI',
  kimi: 'Kimi CLI',
  pi: 'Pi',
};

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

/**
 * Reads the last complete JSON object from CLI stdout that may contain JSONL
 * progress records followed by one pretty-printed result. A greedy `{...}`
 * match treats the whole stream as one object and masks the useful provider
 * failure with "Unexpected non-whitespace character after JSON".
 */
export function parseLastPixflowCliJsonObject(
  value: unknown,
): Record<string, unknown> | null {
  const source = String(value || '');
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let last: Record<string, unknown> | null = null;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (start < 0) {
      if (character === '{') {
        start = index;
        depth = 1;
        inString = false;
        escaped = false;
      }
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString && character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (character === '{') {
      depth += 1;
      continue;
    }
    if (character !== '}') continue;
    depth -= 1;
    if (depth !== 0) continue;

    try {
      const parsed = JSON.parse(source.slice(start, index + 1)) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        last = parsed as Record<string, unknown>;
      }
    } catch {
      // Continue scanning after malformed provider noise.
    }
    start = -1;
  }

  return last;
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
    // Plain CLI output is expected.
  }

  return text
    .replace(/\s*(?:Claude|Codex|OpenCode|Antigravity|CLI) output:\s*\{[\s\S]*$/iu, '')
    .slice(0, 360)
    .trim();
}

function notice(
  code: string,
  kind: PixflowBricksAgentFailureKind,
  title: string,
  message: string,
  action: PixflowBricksAgentFailureNotice['action'],
  actionLabel: string,
  retryable: boolean,
  agentId: string,
): PixflowBricksAgentFailureNotice {
  return {
    code,
    kind,
    title,
    message,
    action,
    actionLabel,
    retryable,
    ...(agentId ? { agentId } : {}),
  };
}

export function buildPixflowBricksAgentFailureNotice(input: {
  agentId?: string;
  code?: string;
  message?: unknown;
}): PixflowBricksAgentFailureNotice {
  const agentId = String(input.agentId || '').trim();
  const label = agentLabel(agentId);
  const rawMessage = cleanFailureText(input.message);
  const explicitCode = String(input.code || '').trim().toUpperCase();
  const authFailure = classifyAgentAuthFailure(agentId, rawMessage);
  const serviceFailure = classifyAgentServiceFailure(rawMessage);
  const code = explicitCode
    || (authFailure ? 'AGENT_AUTH_REQUIRED' : serviceFailure)
    || 'AGENT_EXECUTION_FAILED';

  if (
    code === 'AGENT_AUTH_REQUIRED'
    || code === 'UNAUTHORIZED'
    || authFailure
    || serviceFailure === 'AGENT_AUTH_REQUIRED'
  ) {
    return notice(
      'AGENT_AUTH_REQUIRED',
      'authentication',
      `${label} needs you to sign in`,
      authFailure?.message
        ?? `${label} could not authenticate. Sign in with the CLI in a terminal, then rescan Local CLI in this panel.`,
      'rescan',
      'Rescan after sign-in',
      true,
      agentId,
    );
  }

  if (code === 'RATE_LIMITED' || serviceFailure === 'RATE_LIMITED') {
    return notice(
      'RATE_LIMITED',
      'rate_limit',
      `${label} has reached a usage limit`,
      'The selected model is temporarily unavailable because of a quota or rate limit. Choose another available model or retry later.',
      'choose_model',
      'Choose model',
      true,
      agentId,
    );
  }

  if (/requires? explicit opt[ -]?in|provider opt[ -]?in|only available hosted in/iu.test(rawMessage)) {
    return notice(
      'MODEL_REQUIRES_OPT_IN',
      'model',
      'Selected model requires provider opt-in',
      rawMessage || 'Enable the required provider hosting option or choose another available model, then retry.',
      'choose_model',
      'Choose model',
      true,
      agentId,
    );
  }

  if (
    code === 'MODEL_UNAVAILABLE'
    || code === 'AGENT_MODEL_UNAVAILABLE'
    || /model .*(?:not found|not available|unavailable|not supported)|selected model is at capacity/iu.test(rawMessage)
  ) {
    return notice(
      code,
      'model',
      'Selected model is unavailable',
      'Choose another available model for this CLI, then retry the request.',
      'choose_model',
      'Choose model',
      true,
      agentId,
    );
  }

  if (
    code === 'UPSTREAM_UNAVAILABLE'
    || serviceFailure === 'UPSTREAM_UNAVAILABLE'
  ) {
    return notice(
      'UPSTREAM_UNAVAILABLE',
      'upstream',
      'The model service is temporarily unavailable',
      'The CLI is connected, but its model provider could not complete the request. Retry in a moment.',
      'retry',
      'Retry',
      true,
      agentId,
    );
  }

  if (
    code === 'TIMEOUT'
    || /\b(?:timed out|timeout|stream idle)\b/iu.test(rawMessage)
  ) {
    return notice(
      'TIMEOUT',
      'timeout',
      'The request took too long',
      'The CLI stopped responding before the request completed. Check the connection and retry.',
      'retry',
      'Retry',
      true,
      agentId,
    );
  }

  if (
    code.includes('LICENSE')
    || /pixflow (?:design )?license|validate your pixflow design license/iu.test(rawMessage)
  ) {
    return notice(
      code || 'LICENSE_REQUIRED',
      'license',
      'Pixflow Design license needs attention',
      rawMessage || 'Refresh the Pixflow Design license, then retry the request.',
      'retry',
      'Retry',
      true,
      agentId,
    );
  }

  if (
    /bridge|failed to fetch|connection refused|networkerror|load failed/iu.test(rawMessage)
  ) {
    return notice(
      'BRIDGE_UNAVAILABLE',
      'bridge',
      'Local CLI bridge is offline',
      'Start Pixflow Design Bridge, reconnect it to this site, then rescan Local CLI.',
      'rescan',
      'Reconnect and rescan',
      true,
      agentId,
    );
  }

  if (
    code === 'VALIDATION_FAILED'
    || /enter a prompt|attach an html file|valid bricks target|public http/iu.test(rawMessage)
  ) {
    return notice(
      code || 'VALIDATION_FAILED',
      'validation',
      'The request needs attention',
      rawMessage || 'Check the request and try again.',
      'none',
      '',
      false,
      agentId,
    );
  }

  return notice(
    code,
    'unknown',
    'Bricks Agent could not complete the request',
    rawMessage || 'Check the selected CLI and model, then retry.',
    'retry',
    'Retry',
    true,
    agentId,
  );
}

export function buildPixflowBricksAgentFailurePayload(
  failure: PixflowBricksAgentFailureNotice | {
    agentId?: string;
    code?: string;
    message?: unknown;
  },
): PixflowBricksAgentFailureNotice & {
  failureNotice: PixflowBricksAgentFailureNotice;
} {
  const failureNotice = 'kind' in failure && 'title' in failure
    ? failure
    : buildPixflowBricksAgentFailureNotice(failure);
  return {
    ...failureNotice,
    message: failureNotice.message,
    failureNotice,
  };
}
