/**
 * Bounds automatic renderer recovery when a deterministic Chromium/V8 failure
 * would otherwise reload and crash forever.
 *
 * The policy is pure so the Electron wiring can be tested without starting a
 * BrowserWindow. Callers report the crash that opens the breaker, suppress
 * later duplicates, and attempt one passive reload after the quiet cooldown.
 */
export const RENDERER_CRASH_LOOP_LIMIT = 5;
export const RENDERER_CRASH_LOOP_WINDOW_MS = 60_000;
export const RENDERER_CRASH_LOOP_COOLDOWN_MS = 5 * 60_000;

export interface RendererCrashLoopBreakerOptions {
  limit?: number;
  windowMs?: number;
  cooldownMs?: number;
}

export interface RendererCrashOutcome {
  readonly tripped: boolean;
  readonly suppressTelemetry: boolean;
  readonly justOpened: boolean;
}

export class RendererCrashLoopBreaker {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;
  private crashTimes: number[] = [];
  private open = false;
  private lastCrashAt = 0;

  constructor(options: RendererCrashLoopBreakerOptions = {}) {
    this.limit = options.limit ?? RENDERER_CRASH_LOOP_LIMIT;
    this.windowMs = options.windowMs ?? RENDERER_CRASH_LOOP_WINDOW_MS;
    this.cooldownMs = options.cooldownMs ?? RENDERER_CRASH_LOOP_COOLDOWN_MS;
  }

  recordCrash(now: number): RendererCrashOutcome {
    const wasOpen = this.open;
    this.lastCrashAt = now;
    this.crashTimes = this.crashTimes.filter((time) => now - time < this.windowMs);
    this.crashTimes.push(now);
    if (this.crashTimes.length >= this.limit) this.open = true;
    return {
      tripped: this.open,
      suppressTelemetry: wasOpen,
      justOpened: this.open && !wasOpen,
    };
  }

  isOpen(): boolean {
    return this.open;
  }

  rearmIfCooledDown(now: number): boolean {
    if (!this.open || now - this.lastCrashAt < this.cooldownMs) return false;
    this.reset();
    return true;
  }

  reset(): void {
    this.crashTimes = [];
    this.open = false;
  }
}
