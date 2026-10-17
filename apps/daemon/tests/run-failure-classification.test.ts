import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/integrations/vela-errors.js', () => ({
  classifyAmrAccountFailure(text: string) {
    const value = String(text || '').toLowerCase();
    if (value.includes('insufficient balance')) {
      return { code: 'AMR_INSUFFICIENT_BALANCE' as const };
    }
    if (value.includes('authentication required') || value.includes('not authenticated') || value.includes('unauthorized')) {
      return { code: 'AMR_AUTH_REQUIRED' as const };
    }
    return null;
  },
}));

vi.mock('../src/runtimes/auth.js', () => ({
  classifyAgentServiceFailure(text: string) {
    const value = String(text || '').toLowerCase();
    if (value.includes('authentication required') || value.includes('not authenticated')) {
      return 'AGENT_AUTH_REQUIRED' as const;
    }
    if (value.includes('http 429') || value.includes('too many requests') || value.includes('session limit')) {
      return 'RATE_LIMITED' as const;
    }
    if (value.includes('503 upstream unavailable') || value.includes('upstream unavailable')) {
      return 'UPSTREAM_UNAVAILABLE' as const;
    }
    return null;
  },
}));

import {
  classifyRunFailure,
  isResumableFailure,
  type RunEventForFailureClassification,
} from '../src/run-failure-classification.js';

function errorEvent(
  code: string,
  message: string,
  retryable?: boolean,
): RunEventForFailureClassification {
  return {
    event: 'error',
    data: {
      message,
      error: {
        code,
        message,
        ...(retryable !== undefined ? { retryable } : {}),
      },
    },
  };
}

function classify(
  code: string | null,
  message = '',
  events: RunEventForFailureClassification[] = code
    ? [errorEvent(code, message)]
    : [],
) {
  return classifyRunFailure({
    result: 'failed',
    status: {
      status: 'failed',
      error: message || null,
      errorCode: code,
      exitCode: 1,
      signal: null,
    },
    ...(code ? { errorCode: code } : {}),
    agentId: 'claude',
    events,
  });
}

describe('classifyRunFailure', () => {
  it('classifies ACP fatal and stream close diagnostics as retryable runtime failures', () => {
    for (const [reason, detail] of [
      ['fatal_rpc_error', 'fatal_rpc_error'],
      ['stream_error', 'stream_error'],
    ] as const) {
      expect(classify('AGENT_EXECUTION_FAILED', '', [
        { event: 'agent', data: { type: 'text_delta', delta: 'partial' } },
        { event: 'diagnostic', data: { type: 'runtime_close', rpc_close_reason: reason } },
      ])).toMatchObject({
        failure_category: 'process_exit',
        failure_detail: detail,
        failure_stage: 'child_close',
        retryable: true,
        user_action: 'retry',
      });
    }
  });

  it('recognizes nonstandard provider key names as missing credentials', () => {
    expect(classify('AGENT_EXECUTION_FAILED', 'Missing environment variable: `AICODEX_OAI_KEY`.')).toMatchObject({
      failure_category: 'auth',
      failure_detail: 'missing_api_key',
      retryable: false,
      user_action: 'login',
    });
  });

  it('classifies regional and gateway 403 responses as non-retryable upstream client errors', () => {
    for (const message of [
      '403 Forbidden: Country, region, or territory not supported',
      'Forbidden: request was blocked by a gateway or proxy.',
    ]) {
      expect(classify('AGENT_EXECUTION_FAILED', message)).toMatchObject({
        failure_category: 'upstream_unavailable',
        failure_detail: 'upstream_client_error',
        retryable: false,
      });
    }
  });

  it('recognizes mid-response and malformed-response stream failures', () => {
    for (const message of [
      'API Error: Server error mid-response. The response above may be incomplete.',
      'API returned an empty or malformed response (HTTP 200).',
    ]) {
      expect(classify('AGENT_EXECUTION_FAILED', message)).toMatchObject({
        failure_category: 'upstream_unavailable',
        failure_detail: 'stream_disconnected',
        retryable: true,
        user_action: 'retry',
      });
    }
  });

  it('recognizes the Claude output-token cap as a prompt-size failure', () => {
    expect(classify(
      'AGENT_EXECUTION_FAILED',
      "Claude's response exceeded the 32000 output token maximum. Set CLAUDE_CODE_MAX_OUTPUT_TOKENS.",
    )).toMatchObject({
      failure_category: 'prompt_too_large',
      failure_detail: 'prompt_too_large',
      retryable: false,
      user_action: 'reduce_context',
    });
  });

  it('does not classify successful runs as failures', () => {
    expect(
      classifyRunFailure({
        result: 'success',
        status: { status: 'succeeded' },
      }),
    ).toBeUndefined();
  });

  it('classifies user cancellation separately from failures', () => {
    expect(
      classifyRunFailure({
        result: 'cancelled',
        status: { status: 'canceled' },
      }),
    ).toEqual({
      failure_category: 'user_cancel',
      failure_detail: 'user_cancelled',
      failure_stage: 'finalize',
      retryable: false,
      user_action: 'none',
    });
  });


  it('prefers user cancellation over timeout-flavored status text when the run result is cancelled', () => {
    expect(
      classifyRunFailure({
        result: 'cancelled',
        status: {
          status: 'canceled',
          error: 'Agent stalled without emitting any new output for 120s.',
          signal: 'SIGTERM',
          exitCode: null,
          errorCode: 'AGENT_SIGNAL_SIGTERM',
        },
        errorCode: 'AGENT_SIGNAL_SIGTERM',
        events: [
          errorEvent(
            'AGENT_SIGNAL_SIGTERM',
            'Agent stalled without emitting any new output for 120s.',
            true,
          ),
        ],
      }),
    ).toEqual({
      failure_category: 'user_cancel',
      failure_detail: 'user_cancelled',
      failure_stage: 'finalize',
      retryable: false,
      user_action: 'none',
    });
  });

  it('prefers structured model-unavailable codes over timeout-like free text', () => {
    expect(
      classify(
        'AMR_MODEL_UNAVAILABLE',
        'Model selection timed out while the provider reported the model was unavailable.',
      ),
    ).toMatchObject({
      failure_category: 'model_unavailable',
      failure_stage: 'model_select',
      retryable: false,
      user_action: 'switch_model',
    });
  });

  it('prefers prompt-too-large codes over empty-output fallback text', () => {
    expect(
      classify(
        'AGENT_PROMPT_TOO_LARGE',
        'The agent completed without producing any output because the context window exceeded the limit.',
      ),
    ).toMatchObject({
      failure_category: 'prompt_too_large',
      failure_stage: 'prompt_send',
      retryable: false,
      user_action: 'reduce_context',
    });
  });

  it('maps auth-required failures to login guidance', () => {
    expect(classify('AGENT_AUTH_REQUIRED')).toMatchObject({
      failure_category: 'auth',
      failure_detail: 'auth_required',
      failure_stage: 'session_init',
      retryable: false,
      user_action: 'login',
    });
  });


  it('lets explicit auth classification win over a generic execution-failed code', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Authentication required before starting the session.',
      ),
    ).toMatchObject({
      failure_category: 'auth',
      failure_detail: 'auth_required',
      failure_stage: 'session_init',
      retryable: false,
      user_action: 'login',
    });
  });

  it('maps auth subtypes from profile and token text', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Claude Code may be using a different or stale local profile than your terminal.',
      ),
    ).toMatchObject({
      failure_category: 'auth',
      failure_detail: 'stale_profile',
      user_action: 'login',
    });
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Your access token could not be refreshed because your refresh token was already used.',
      ),
    ).toMatchObject({
      failure_category: 'auth',
      failure_detail: 'refresh_token_reused',
      user_action: 'login',
    });
  });

  it('recognizes model-not-found text even when the outer error code is generic', () => {
    expect(
      classify('AGENT_EXECUTION_FAILED', 'Model not found: vela/deepseek-v3-2'),
    ).toMatchObject({
      failure_category: 'model_unavailable',
      failure_detail: 'model_not_found',
      failure_stage: 'model_select',
      retryable: false,
      user_action: 'switch_model',
    });
  });

  it('recovers rate-limit and session-limit signals from generic error codes', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        "You've hit your session limit; resets at 3:10am.",
      ),
    ).toMatchObject({
      failure_category: 'rate_limit',
      failure_detail: 'hard_quota',
      retryable: false,
      user_action: 'none',
    });
  });

  it('treats ordinary 429 rate limits as retryable', () => {
    expect(classify('RATE_LIMITED', 'HTTP 429: too many requests')).toMatchObject({
      failure_category: 'rate_limit',
      failure_detail: 'rate_limit_429',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('maps upstream failures to retry guidance', () => {
    expect(classify('UPSTREAM_UNAVAILABLE', 'HTTP 503 upstream unavailable')).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'upstream_5xx',
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('maps stream disconnects to upstream detail', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Reconnecting... 1/5 (stream disconnected before completion: tls handshake eof)',
      ),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'stream_disconnected',
      retryable: true,
      user_action: 'retry',
    });
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'json-rpc id 4: opencode event stream: opencode session error: {"sessionID":"ses_17838b40effecRNQTUFyauY0zL","error":{"name":"UnknownError","data":{"message":"\\"[code=upstream_error] Error reading stream: http2: response body closed\\""}}}',
      ),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'stream_disconnected',
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    });
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'json-rpc id 4: Cannot connect to API: The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()',
      ),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'stream_disconnected',
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('promotes AMR exit 130 connection resets into upstream stream disconnects', () => {
    expect(
      classify(
        'AGENT_EXIT_130',
        'json-rpc id 4: Connection reset by server',
      ),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'stream_disconnected',
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('promotes opencode API 4xx session errors out of process-exit fallback', () => {
    expect(
      classify(
        'AGENT_EXIT_130',
        'json-rpc id 4: opencode event stream: opencode session error: {"sessionID":"ses_16a081173ffeQy9mUJTmYowj5p","error":{"name":"APIError","data":{"message":"Not Found","statusCode":404,"isRetryable":false,"responseBody":"<html><head><title>404 Not Found</title></head>"}}}',
      ),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'upstream_client_error',
      failure_stage: 'first_token_wait',
      retryable: false,
      user_action: 'none',
    });

    expect(
      classify(
        'AGENT_EXIT_130',
        'json-rpc id 4: opencode event stream: opencode session error: {"error":{"name":"APIError","data":{"message":"Bad Request","statusCode":400,"isRetryable":false,"responseBody":"<html><head><title>400 Bad Request</title></head>"}}}',
      ),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'upstream_client_error',
      retryable: false,
      user_action: 'none',
    });
  });

  it('uses structured opencode API error data when raw error text is sparse', () => {
    expect(
      classifyRunFailure({
        result: 'failed',
        status: {
          status: 'failed',
          error: null,
          errorCode: 'AGENT_EXIT_130',
          exitCode: 130,
          signal: null,
        },
        errorCode: 'AGENT_EXIT_130',
        agentId: 'opencode',
        events: [
          {
            event: 'error',
            data: {
              error: {
                name: 'APIError',
                data: {
                  message: 'Not Found',
                  statusCode: 404,
                  isRetryable: false,
                },
              },
            },
          },
        ],
      }),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'upstream_client_error',
      failure_stage: 'first_token_wait',
      retryable: false,
      user_action: 'none',
    });
  });

  it('maps AMR model catalog outages to provider routing failures', () => {
    expect(
      classify(
        'AGENT_EXIT_130',
        'json-rpc id 2: AMR model catalog is unavailable.',
      ),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'provider_routing_error',
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('maps AMR insufficient balance to recharge guidance', () => {
    expect(
      classify('AMR_INSUFFICIENT_BALANCE', 'insufficient wallet balance'),
    ).toMatchObject({
      failure_category: 'insufficient_balance',
      failure_detail: 'amr_insufficient_balance',
      retryable: false,
      user_action: 'recharge',
    });
  });

  it('maps unavailable model errors to switch-model guidance', () => {
    expect(classify('AMR_MODEL_UNAVAILABLE', 'model is not available')).toMatchObject({
      failure_category: 'model_unavailable',
      failure_detail: 'model_not_found',
      failure_stage: 'model_select',
      retryable: false,
      user_action: 'switch_model',
    });
  });

  it('maps prompt-size failures to reduce-context guidance', () => {
    expect(classify('AGENT_PROMPT_TOO_LARGE', 'context window exceeded')).toMatchObject({
      failure_category: 'prompt_too_large',
      failure_detail: 'prompt_too_large',
      failure_stage: 'prompt_send',
      retryable: false,
      user_action: 'reduce_context',
    });
  });

  it('maps empty output to an explicit retryable category', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Agent completed without producing any output.',
        [errorEvent('AGENT_EXECUTION_FAILED', 'Agent completed without producing any output.', true)],
      ),
    ).toMatchObject({
      failure_category: 'empty_output',
      failure_detail: 'empty_output',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('maps signal exits and stall text to timeout', () => {
    expect(
      classifyRunFailure({
        result: 'failed',
        status: {
          status: 'failed',
          error: 'Agent stalled without emitting any new output for 120s.',
          signal: 'SIGTERM',
          exitCode: null,
          errorCode: null,
        },
        errorCode: 'AGENT_SIGNAL_SIGTERM',
        events: [],
      }),
    ).toMatchObject({
      failure_category: 'timeout',
      failure_detail: 'inactivity_timeout',
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    });
  });


  it('honors the latest explicit non-retryable hint for timeout failures', () => {
    expect(
      classifyRunFailure({
        result: 'failed',
        status: {
          status: 'failed',
          error: 'Agent stalled without emitting any new output for 120s.',
          signal: 'SIGTERM',
          exitCode: null,
          errorCode: null,
        },
        errorCode: 'AGENT_SIGNAL_SIGTERM',
        agentId: 'claude',
        events: [
          errorEvent('AGENT_EXECUTION_FAILED', 'transient upstream hiccup', true),
          errorEvent(
            'AGENT_SIGNAL_SIGTERM',
            'Agent stalled without emitting any new output for 120s.',
            false,
          ),
        ],
      }),
    ).toMatchObject({
      failure_category: 'timeout',
      failure_detail: 'inactivity_timeout',
      failure_stage: 'first_token_wait',
      retryable: false,
      user_action: 'none',
    });
  });

  it('uses the latest retryable hint for tool execution failures', () => {
    expect(
      classifyRunFailure({
        result: 'failed',
        status: {
          status: 'failed',
          error: 'Tool error: MCP connector failed while listing files.',
          exitCode: 1,
          signal: null,
          errorCode: 'AGENT_EXECUTION_FAILED',
        },
        errorCode: 'AGENT_EXECUTION_FAILED',
        agentId: 'claude',
        events: [
          errorEvent('AGENT_EXECUTION_FAILED', 'tool bootstrap failed', false),
          errorEvent(
            'AGENT_EXECUTION_FAILED',
            'Tool error: MCP connector failed while listing files.',
            true,
          ),
        ],
      }),
    ).toMatchObject({
      failure_category: 'tool_error',
      failure_detail: 'tool_error',
      failure_stage: 'tool_execution',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('maps invalid agent config to fix-config guidance', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Error loading config.toml: unknown variant `priority`, expected `fast` or `flex`\nin `service_tier`',
      ),
    ).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'agent_config_invalid',
      failure_stage: 'session_init',
      retryable: false,
      user_action: 'fix_config',
    });
  });

  it('maps fabricated role marker termination to a retryable protocol guard detail', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Run terminated: model emitted fabricated role marker (`## user`). No further tokens or tool calls accepted from this turn.',
      ),
    ).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'fabricated_role_marker',
      failure_stage: 'child_close',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('maps missing generated plugin artifacts to artifact-write tool failures', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Plugin authoring ended before generating the required generated-plugin artifacts.',
      ),
    ).toMatchObject({
      failure_category: 'tool_error',
      failure_detail: 'plugin_artifact_missing',
      failure_stage: 'artifact_write',
      retryable: false,
      user_action: 'none',
    });
  });

  it('keeps process exits as an explicit fallback category', () => {
    expect(classify('AGENT_EXIT_1', 'process exited with code 1')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'exit_code',
      failure_stage: 'child_close',
      retryable: false,
      user_action: 'none',
    });
  });

  it('adds process-exit details for spawn and protocol failures', () => {
    expect(classify('AGENT_EXECUTION_FAILED', 'spawn failed: spawn ENOEXEC')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'spawn_enoexec',
    });
    expect(classify('AGENT_EXECUTION_FAILED', 'json-rpc id 2: Internal error')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'agent_protocol_error',
    });
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'json-rpc id 4: opencode event stream: reply opencode permission: opencode POST /session/ses_17891e641ffe507UiYkoj7Qb5w/permissions/per_e876f835100166WeTqK11P7ZvV returned HTTP 404: {"_tag":"PermissionNotFoundError","requestID":"per_e876f835100166WeTqK11P7ZvV","message":"Permission request not found: per_e876f835100166WeTqK11P7ZvV"}',
      ),
    ).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'permission_request_not_found',
      failure_stage: 'child_close',
      retryable: true,
      user_action: 'retry',
    });
    expect(classify('AGENT_EXECUTION_FAILED', 'stdin: write EOF')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'stdin_write_eof',
    });
  });

  it('falls back to unknown when no meaningful signal is available', () => {
    expect(classify('SOMETHING_NEW', '')).toMatchObject({
      failure_category: 'unknown',
      failure_detail: 'unknown',
      failure_stage: 'finalize',
      retryable: false,
      user_action: 'none',
    });
  });
});

describe('AMR transient runtime failures', () => {
  it('distinguishes transport request limits from model context limits', () => {
    const result = classify(
      'AGENT_EXECUTION_FAILED',
      'opencode event stream: [code=request_too_large] request body exceeds configured limit',
    );
    expect(result).toMatchObject({
      failure_category: 'prompt_too_large',
      failure_detail: 'request_too_large',
      retryable: false,
      user_action: 'reduce_context',
    });
  });

  it.each([
    [
      'source.media_type: Invalid enum value application/pdf; expected image/jpeg',
      'attachment_media_type_unsupported',
    ],
    [
      'function_declarations[0].name: Invalid function name',
      'tool_schema_invalid',
    ],
    [
      'Failed to tokenize the prompt',
      'prompt_tokenization_failed',
    ],
    [
      '{"status":404,"message":"Function \\"generate\\" Not found for account"}',
      'provider_resource_not_found',
    ],
  ])('classifies deterministic client request failure: %s', (message, detail) => {
    expect(classify('AGENT_EXECUTION_FAILED', message)).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: detail,
      failure_stage: 'prompt_send',
      retryable: false,
      user_action: 'none',
    });
  });

  it('classifies AMR stream idle timeouts as retryable disconnects', () => {
    const result = classify(
      'AGENT_EXECUTION_FAILED',
      '[code=upstream_error] stream idle timeout: no data received within configured window',
    );
    expect(result).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'stream_disconnected',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('classifies the Windows OpenCode readiness crash status as process_crashed', () => {
    const result = classify(
      'AGENT_SIGNAL_SIGTERM',
      'opencode exited before readiness: exit status 0xc0000409',
    );
    expect(result).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'process_crashed',
      retryable: false,
      user_action: 'none',
    });
  });

  it('classifies unsupported OpenCode CPU failures as deterministic', () => {
    expect(classify(
      'AGENT_EXECUTION_FAILED',
      'Failed to start opencode server: no_avx2',
    )).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'cpu_unsupported',
      retryable: false,
      user_action: 'none',
    });
  });
});

describe('isResumableFailure', () => {
  it('resumes only retryable transient interruptions', () => {
    expect(isResumableFailure({
      failure_category: 'upstream_unavailable',
      failure_detail: 'stream_disconnected',
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    })).toBe(true);
    expect(isResumableFailure({
      failure_category: 'upstream_unavailable',
      failure_detail: 'upstream_client_error',
      failure_stage: 'prompt_send',
      retryable: false,
      user_action: 'none',
    })).toBe(false);
  });
});

// Regression coverage for the signal/interrupt mis-attribution bug: process
// crashes (SIGKILL/SIGSEGV/...), daemon shutdowns (SIGTERM), and cancellations
// (SIGINT / exit 130) must NOT be laundered into a retryable `timeout`. Each
// has a non-retryable home so the safe-retry policy never re-spawns an
// OOM/crash that is near-certain to reproduce.
describe('classifyRunFailure — signal and interrupt attribution', () => {
  function classifySignal(
    signal: string,
    message = '',
    exitCode: number | null = null,
  ) {
    const errorCode = `AGENT_SIGNAL_${signal}`;
    return classifyRunFailure({
      result: 'failed',
      status: {
        status: 'failed',
        error: message || null,
        signal,
        exitCode,
        errorCode: null,
      },
      errorCode,
      agentId: 'claude',
      events: [],
    });
  }

  function classifyExit(
    exitCode: number,
    message = '',
  ) {
    const errorCode = `AGENT_EXIT_${exitCode}`;
    return classifyRunFailure({
      result: 'failed',
      status: {
        status: 'failed',
        error: message || null,
        signal: null,
        exitCode,
        errorCode: null,
      },
      errorCode,
      agentId: 'claude',
      events: [],
    });
  }

  it('classifies SIGKILL as a non-retryable process kill, not a timeout', () => {
    expect(classifySignal('SIGKILL', 'Killed')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'signal_killed',
      retryable: false,
      user_action: 'none',
    });
  });

  it('classifies hard crash signals as non-retryable process crashes', () => {
    for (const signal of ['SIGSEGV', 'SIGABRT', 'SIGILL', 'SIGTRAP', 'SIGBUS']) {
      expect(classifySignal(signal, 'core dumped')).toMatchObject({
        failure_category: 'process_exit',
        failure_detail: 'process_crashed',
        retryable: false,
        user_action: 'none',
      });
    }
  });

  it('classifies SIGINT as a non-retryable interruption', () => {
    expect(classifySignal('SIGINT', 'Interrupted')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'interrupted',
      retryable: false,
      user_action: 'none',
    });
  });

  it('classifies exit code 130 (128+SIGINT) as a non-retryable interruption', () => {
    expect(classifyExit(130, 'Request was cancelled')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'interrupted',
      retryable: false,
      user_action: 'none',
    });
  });

  it('routes an interrupted run whose text names a stream disconnect to upstream', () => {
    expect(
      classifyExit(130, 'stream disconnected before completion'),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'stream_disconnected',
      retryable: true,
      user_action: 'retry',
    });
    expect(
      classifySignal('SIGINT', 'Upstream request failed; aborting stream'),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('classifies a plain SIGTERM (not inactivity) as a non-retryable termination', () => {
    expect(classifySignal('SIGTERM', 'Terminated')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'terminated_unknown',
      retryable: false,
      user_action: 'none',
    });
  });

  it('still classifies an inactivity-driven SIGTERM as a retryable timeout', () => {
    expect(
      classifySignal(
        'SIGTERM',
        'Agent stalled without emitting any new output for 120s.',
      ),
    ).toMatchObject({
      failure_category: 'timeout',
      failure_detail: 'inactivity_timeout',
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    });
  });
});
