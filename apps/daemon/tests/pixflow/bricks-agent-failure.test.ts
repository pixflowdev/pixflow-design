import { describe, expect, it } from 'vitest';
import {
  buildPixflowBricksAgentFailureNotice,
  buildPixflowBricksAgentFailurePayload,
  parseLastPixflowCliJsonObject,
} from '../../src/pixflow/bricks-agent-failure.js';

describe('buildPixflowBricksAgentFailureNotice', () => {
  it('turns expired Claude OAuth output into clean sign-in guidance', () => {
    const result = buildPixflowBricksAgentFailureNotice({
      agentId: 'claude',
      message:
        'Failed to authenticate: OAuth session expired and could not be refreshed. Claude output: {"context_management":null,"uuid":"secret"}',
    });

    expect(result).toMatchObject({
      code: 'AGENT_AUTH_REQUIRED',
      kind: 'authentication',
      title: 'Claude Code needs you to sign in',
      action: 'rescan',
      actionLabel: 'Rescan after sign-in',
    });
    expect(result.message).toContain('claude auth login');
    expect(result.message).not.toContain('context_management');
    expect(result.message).not.toContain('uuid');
  });

  it('presents Claude free-tier sign-in failures as authentication guidance', () => {
    const result = buildPixflowBricksAgentFailureNotice({
      agentId: 'claude',
      message: 'Failed to authenticate. API Error: 401 Invalid authentication credentials',
    });

    expect(result).toMatchObject({
      code: 'AGENT_AUTH_REQUIRED',
      kind: 'authentication',
      title: 'Claude Code needs you to sign in',
      action: 'rescan',
    });
    expect(result.message).not.toContain('401');
  });

  it.each([
    ['HTTP 429: too many requests', 'rate_limit', 'choose_model'],
    ['Monthly usage exhausted for this workspace.', 'rate_limit', 'choose_model'],
    ['No remaining usage is available on this plan.', 'rate_limit', 'choose_model'],
    ['HTTP 503: service temporarily unavailable', 'upstream', 'retry'],
    ['Selected model is at capacity. Please try a different model.', 'model', 'choose_model'],
    ['Stream idle timeout after 45 seconds', 'timeout', 'retry'],
    ['Pixflow Design Bridge disconnected.', 'bridge', 'rescan'],
  ])('normalizes %s', (message, kind, action) => {
    expect(buildPixflowBricksAgentFailureNotice({
      agentId: 'codex',
      message,
    })).toMatchObject({ kind, action });
  });

  it('distinguishes provider opt-in from usage exhaustion', () => {
    const result = buildPixflowBricksAgentFailureNotice({
      agentId: 'opencode',
      message: 'The latest version of this model is only available hosted in China and requires explicit opt in.',
    });

    expect(result).toMatchObject({
      code: 'MODEL_REQUIRES_OPT_IN',
      kind: 'model',
      title: 'Selected model requires provider opt-in',
      action: 'choose_model',
    });
    expect(result.message).toContain('requires explicit opt in');
    expect(result.title).not.toContain('usage');
  });

  it('extracts a message from JSON without displaying the object', () => {
    const result = buildPixflowBricksAgentFailureNotice({
      agentId: 'opencode',
      message: JSON.stringify({
        message: 'Provider request failed.',
        diagnostics: { token: 'secret', raw: true },
      }),
    });

    expect(result.message).toBe('Provider request failed.');
    expect(result.message).not.toContain('diagnostics');
  });

  it('reads the final CLI result after streamed JSONL records', () => {
    const parsed = parseLastPixflowCliJsonObject([
      '{"type":"agent_event","payload":{"event":{"kind":"status"}}}',
      '{"type":"error","payload":{"message":"Failed to authenticate"}}',
      JSON.stringify({
        status: 'failed',
        action: 'answer',
        message: 'Failed to authenticate',
      }, null, 2),
    ].join('\n'));

    expect(parsed).toMatchObject({
      status: 'failed',
      message: 'Failed to authenticate',
    });
  });

  it('serializes an existing typed notice without coercing it to [object Object]', () => {
    const notice = buildPixflowBricksAgentFailureNotice({
      agentId: 'claude',
      code: 'AGENT_AUTH_REQUIRED',
      message: 'Failed to authenticate',
    });
    const payload = buildPixflowBricksAgentFailurePayload(notice);

    expect(payload.message).toBe(notice.message);
    expect(payload.message).not.toBe('[object Object]');
    expect(payload.failureNotice).toEqual(notice);
  });
});
