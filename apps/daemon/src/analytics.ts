import type { Request } from 'express';
import type {
  AnalyticsClientType,
  AnalyticsConfigResponse,
} from '@open-design/contracts/analytics';

export interface AnalyticsContext {
  deviceId: string;
  sessionId: string;
  clientType: AnalyticsClientType;
  locale: string;
  requestId: string | null;
}

export function readAnalyticsContext(_req: Request): AnalyticsContext | null {
  return null;
}

export function readPublicConfigResponse(_env?: NodeJS.ProcessEnv): AnalyticsConfigResponse {
  return { enabled: false, env: 'disabled', key: null, host: null };
}

export interface AnalyticsService {
  capture(args: {
    eventName: string;
    context: AnalyticsContext;
    appVersion: string;
    properties: Record<string, unknown>;
    insertId: string;
  }): void;
  captureSafety(args: {
    eventName: string;
    distinctId?: string;
    appVersion: string;
    properties: Record<string, unknown>;
    insertId?: string;
  }): Promise<void>;
  shutdown(): Promise<void>;
}

const NOOP_SERVICE: AnalyticsService = {
  capture: () => undefined,
  captureSafety: async () => undefined,
  shutdown: async () => undefined,
};

export function createAnalyticsService(_args: {
  env?: NodeJS.ProcessEnv;
  dataDir: string;
}): AnalyticsService {
  return NOOP_SERVICE;
}

export function anonymizeArtifactId(value: string): string {
  return value;
}

export function randomInsertId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export const newInsertId = randomInsertId;
