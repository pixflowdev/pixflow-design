// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { navigate, useRoute } from '../src/router';

function RouteLabel() {
  const route = useRoute();
  const label = route.kind === 'home' ? route.view : route.kind;
  return <div data-testid="route-label">{label}</div>;
}

function NavigateFromUpdater() {
  const [didNavigate, setDidNavigate] = useState(false);

  useEffect(() => {
    if (didNavigate) return;
    setDidNavigate(() => {
      navigate({ kind: 'home', view: 'onboarding' }, { replace: true });
      return true;
    });
  }, [didNavigate]);

  return <RouteLabel />;
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('navigate / useRoute timing', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleError.mockRestore();
    window.history.replaceState(null, '', '/');
  });

  it('updates history synchronously and notifies listeners after the microtask boundary', async () => {
    const onPop = vi.fn();
    window.addEventListener('popstate', onPop);

    navigate({ kind: 'home', view: 'onboarding' }, { replace: true });

    expect(window.location.pathname).toBe('/onboarding');
    expect(onPop).not.toHaveBeenCalled();

    await flushMicrotasks();

    expect(onPop).toHaveBeenCalledTimes(1);
    window.removeEventListener('popstate', onPop);
  });

  it('updates route subscribers after render-phase updater navigation without React warnings', async () => {
    render(<NavigateFromUpdater />);

    await flushMicrotasks();

    await waitFor(() => {
      expect(screen.getByTestId('route-label').textContent).toBe('onboarding');
    });
    expect(window.location.pathname).toBe('/onboarding');

    const warningCalls = consoleError.mock.calls.filter((call: unknown[]) =>
      String(call[0]).includes('Cannot update a component'),
    );
    expect(warningCalls).toEqual([]);
  });

  it('keeps embedded Bricks workspace navigation out of the builder URL and popstate channel', async () => {
    window.history.replaceState(null, '', '/builder-page/?bricks=run');
    (window as typeof window & { pixflowDesignShell?: Record<string, unknown> }).pixflowDesignShell = {
      runtime: 'wordpress',
      version: 'test',
    };
    const onPop = vi.fn();
    window.addEventListener('popstate', onPop);
    render(<RouteLabel />);

    navigate({ kind: 'home', view: 'onboarding' });
    expect(window.location.pathname).toBe('/builder-page/');
    expect(window.location.search).toBe('?bricks=run');
    expect(window.location.hash).toBe('');

    await flushMicrotasks();

    expect(onPop).not.toHaveBeenCalled();
    expect(screen.getByTestId('route-label').textContent).toBe('onboarding');
    window.removeEventListener('popstate', onPop);
    delete (window as typeof window & { pixflowDesignShell?: Record<string, unknown> }).pixflowDesignShell;
  });
});

it('writes WordPress routes as selector-safe fragments',()=>{
 (window as any).pixflowDesignShell={runtime:'wordpress',version:'test'};
 window.history.replaceState(null,'','/wp-admin/');
 try{navigate({kind:'project',projectId:'hash-test',conversationId:'chat',fileName:null});
 expect(()=>document.querySelector(window.location.hash)).not.toThrow();}
 finally{delete (window as any).pixflowDesignShell;window.history.replaceState(null,'','/');}
});
