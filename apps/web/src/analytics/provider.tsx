'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AnalyticsConfigureGlobals } from '@open-design/contracts/analytics';
import { toPixflowRuntimeUrl } from '../pixflow/bridge-url';
import { hasPixflowWordPressContext } from '../pixflow/wordpress-context';
import { randomUUID } from '../utils/uuid';

interface AnalyticsContextValue {
  track: (
    event: string,
    properties: Record<string, unknown>,
    options?: { requestId?: string; insertId?: string },
  ) => void;
  setConsent: (granted: boolean) => void;
  setIdentity: (installationId: string | null) => void;
  setConfigureGlobals: (next: AnalyticsConfigureGlobals) => void;
  setUserId: (userId: string | null) => void;
  anonymousId: string;
  sessionId: string;
  newRequestId: () => string;
}

const APP_VERSION_PLACEHOLDER = '0.0.0';
const NOOP_ANALYTICS_ID = 'pixflow-analytics-disabled';
const Ctx = createContext<AnalyticsContextValue | null>(null);

let runtimeAppVersion: string | null = null;
let runtimeAppVersionPromise: Promise<string | null> | null = null;

function readPixflowWordPressAppVersion(): string | null {
  if (!hasPixflowWordPressContext() || typeof window === 'undefined') return null;
  const source = (window as Window & {
    __PIXFLOW_DESIGN_WORDPRESS__?: { version?: string };
    pixflowDesignShell?: { version?: string };
  }).__PIXFLOW_DESIGN_WORDPRESS__ ?? (window as Window & {
    pixflowDesignShell?: { version?: string };
  }).pixflowDesignShell;
  const version = typeof source?.version === 'string' ? source.version.trim() : '';
  return version || null;
}

function pixflowRuntimeVersionFetch(): Promise<Response> {
  const url = toPixflowRuntimeUrl('/api/version');
  if (typeof window === 'undefined') return fetch(url);
  const config = (window as Window & {
    __PIXFLOW_DESIGN_WORDPRESS__?: { restBaseUrl?: string; restNonce?: string };
    pixflowDesignShell?: { restBaseUrl?: string; restNonce?: string };
  }).__PIXFLOW_DESIGN_WORDPRESS__ ?? (window as Window & {
    pixflowDesignShell?: { restBaseUrl?: string; restNonce?: string };
  }).pixflowDesignShell;
  const restBaseUrl = typeof config?.restBaseUrl === 'string' ? config.restBaseUrl.replace(/\/+$/, '') : '';
  if (!restBaseUrl || !url.startsWith(`${restBaseUrl}/`) || !config?.restNonce) return fetch(url);
  return fetch(url, {
    credentials: 'same-origin',
    headers: { 'X-WP-Nonce': config.restNonce },
  });
}

async function loadRuntimeAppVersion(): Promise<string | null> {
  const wordpressVersion = readPixflowWordPressAppVersion();
  if (wordpressVersion) {
    runtimeAppVersion = wordpressVersion;
    return wordpressVersion;
  }
  if (runtimeAppVersion) return runtimeAppVersion;
  if (!runtimeAppVersionPromise) {
    runtimeAppVersionPromise = (async () => {
      try {
        const res = await pixflowRuntimeVersionFetch();
        if (!res.ok) return null;
        const body = (await res.json()) as { version?: { version?: string } };
        const next = body?.version?.version;
        if (!next) return null;
        runtimeAppVersion = next;
        return next;
      } catch {
        return null;
      } finally {
        if (!runtimeAppVersion) runtimeAppVersionPromise = null;
      }
    })();
  }
  return runtimeAppVersionPromise;
}

export async function resolveAppVersionForCapture(current: string): Promise<string> {
  return current && current !== APP_VERSION_PLACEHOLDER
    ? current
    : (await loadRuntimeAppVersion()) ?? current;
}

export function useAppVersion(): string {
  const [version, setVersion] = useState(() => readPixflowWordPressAppVersion() ?? APP_VERSION_PLACEHOLDER);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await loadRuntimeAppVersion();
      if (!cancelled && next) setVersion(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return version;
}

function createNoopAnalyticsValue(): AnalyticsContextValue {
  return {
    track: () => undefined,
    setConsent: () => undefined,
    setIdentity: () => undefined,
    setConfigureGlobals: () => undefined,
    setUserId: () => undefined,
    anonymousId: NOOP_ANALYTICS_ID,
    sessionId: NOOP_ANALYTICS_ID,
    newRequestId: () => randomUUID(),
  };
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => createNoopAnalyticsValue(), []);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAnalytics(): AnalyticsContextValue {
  return useContext(Ctx) ?? createNoopAnalyticsValue();
}
