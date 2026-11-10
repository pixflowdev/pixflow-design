// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BricksAgentFailureBanner,
  normalizePixflowBricksAgentFailureNotice,
  bricksAgentFailureDiagnostic,
  bricksAgentFailureNoticeForState,
} from '../../src/pixflow/BricksAgentFailureBanner';

afterEach(cleanup);

describe('BricksAgentFailureBanner', () => {
  it('keeps historical interruption in the transcript without inventing a current outage', () => {
    const state = { messages: [{ role: 'assistant', runStatus: 'interrupted' }], streamError: 'The Bridge restarted before this agent run completed.' };
    expect(bricksAgentFailureDiagnostic(state, { ready: true })).toBe('');
    expect(bricksAgentFailureDiagnostic(state, { ready: false, error: 'Connection refused' })).toBe('Connection refused');
    expect(bricksAgentFailureDiagnostic({ ...state, messages: [{ role: 'assistant', runStatus: 'failed' }] }, { ready: true })).toBe(state.streamError);
    const persisted = { ...state, failureNotice: normalizePixflowBricksAgentFailureNotice(null, state.streamError) };
    expect(bricksAgentFailureNoticeForState(persisted, { ready: true })).toBeNull();
    expect(bricksAgentFailureNoticeForState(persisted, { ready: false, error: 'Connection refused' })?.code).toBe('BRIDGE_UNAVAILABLE');
  });
  it('does not describe incomplete provider discovery as an offline bridge', () => {
    const result = normalizePixflowBricksAgentFailureNotice(null,
      'Pixflow Design Bridge agents are still loading.', 'codex');
    expect(result).toMatchObject({ title: 'Providers are not ready yet', action: 'rescan' });
    expect(result?.message).not.toContain('Start Pixflow');
  });
  it('reports failed automatic pairing as a license issue rather than an offline bridge', () => {
    const result = normalizePixflowBricksAgentFailureNotice(null,
      'Pixflow Design license: Automatic bridge pairing failed.', 'codex');
    expect(result).toMatchObject({ kind: 'license', title: 'Pixflow Design license needs attention' });
  });
  it('turns raw Claude OAuth diagnostics into clean sign-in guidance', () => {
    const result = normalizePixflowBricksAgentFailureNotice(
      null,
      'Failed to authenticate: OAuth session expired and could not be refreshed. Claude output: {"context_management":null,"uuid":"secret"}',
      'claude',
    );

    expect(result).toMatchObject({
      kind: 'authentication',
      title: 'Claude Code needs you to sign in',
      action: 'rescan',
    });
    expect(result?.message).not.toContain('{');
    expect(result?.message).not.toContain('context_management');
    expect(result?.message).not.toContain('uuid');
  });

  it('renders an accessible banner and performs the requested recovery action', () => {
    const onRescan = vi.fn();
    const notice = normalizePixflowBricksAgentFailureNotice(
      null,
      'Pixflow Design Bridge disconnected.',
      'codex',
    );

    render(
      <BricksAgentFailureBanner
        notice={notice!}
        onRescan={onRescan}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('Local CLI bridge is offline');
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect and rescan' }));
    expect(onRescan).toHaveBeenCalledTimes(1);
  });

  it('offers model selection for capacity failures', () => {
    const onChooseModel = vi.fn();
    const notice = normalizePixflowBricksAgentFailureNotice(
      null,
      'Selected model is at capacity. Please try a different model.',
      'codex',
    );

    render(
      <BricksAgentFailureBanner
        notice={notice!}
        onChooseModel={onChooseModel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose model' }));
    expect(onChooseModel).toHaveBeenCalledTimes(1);
  });

  it('extracts useful JSON error text without showing transport data', () => {
    const result = normalizePixflowBricksAgentFailureNotice(
      null,
      JSON.stringify({
        message: 'Provider request failed.',
        diagnostics: { requestId: 'secret', raw: true },
      }),
      'opencode',
    );

    expect(result?.message).toBe('Provider request failed.');
    expect(result?.message).not.toContain('diagnostics');
    expect(result?.message).not.toContain('requestId');
  });
});

it('keeps diagnosed Bridge recovery steps visible instead of calling every failure offline', () => {
  const message='Pixflow could not reach Design Bridge. The browser cannot determine the cause. Check that Bridge is running.';
  expect(normalizePixflowBricksAgentFailureNotice(null,message)).toMatchObject({title:'Bridge connection needs attention',message,action:'rescan'});
});

it('does not turn a Bridge timeout into a CLI retry instruction', () => {
  const message='The Pixflow Design Bridge request timed out. Check Bridge status and rescan Local CLI.';
  expect(normalizePixflowBricksAgentFailureNotice(null,message)).toMatchObject({message,action:'rescan'});
});
