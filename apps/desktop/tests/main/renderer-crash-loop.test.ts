import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  RENDERER_CRASH_LOOP_COOLDOWN_MS,
  RENDERER_CRASH_LOOP_LIMIT,
  RENDERER_CRASH_LOOP_WINDOW_MS,
  RendererCrashLoopBreaker,
} from "../../src/main/renderer-crash-loop.js";
import { isRendererFailureHttpStatus } from "../../src/main/runtime.js";

describe("RendererCrashLoopBreaker", () => {
  test("opens on the configured number of crashes inside the rolling window", () => {
    const breaker = new RendererCrashLoopBreaker({ limit: 3, windowMs: 60_000 });
    expect(breaker.recordCrash(1_000).tripped).toBe(false);
    expect(breaker.recordCrash(2_000).tripped).toBe(false);
    const outcome = breaker.recordCrash(3_000);
    expect(outcome).toEqual({ tripped: true, suppressTelemetry: false, justOpened: true });
  });

  test("suppresses duplicate crash telemetry only after opening", () => {
    const breaker = new RendererCrashLoopBreaker({ limit: 2 });
    breaker.recordCrash(1_000);
    breaker.recordCrash(2_000);
    expect(breaker.recordCrash(3_000)).toEqual({
      tripped: true,
      suppressTelemetry: true,
      justOpened: false,
    });
  });

  test("does not combine crashes outside the rolling window", () => {
    const breaker = new RendererCrashLoopBreaker({ limit: 2, windowMs: 1_000 });
    expect(breaker.recordCrash(0).tripped).toBe(false);
    expect(breaker.recordCrash(1_000).tripped).toBe(false);
  });

  test("re-arms once after a quiet cooldown", () => {
    const breaker = new RendererCrashLoopBreaker({ limit: 2, cooldownMs: 10_000 });
    breaker.recordCrash(1_000);
    breaker.recordCrash(2_000);
    expect(breaker.rearmIfCooledDown(11_999)).toBe(false);
    expect(breaker.rearmIfCooledDown(12_000)).toBe(true);
    expect(breaker.rearmIfCooledDown(13_000)).toBe(false);
    expect(breaker.recordCrash(13_001).tripped).toBe(false);
  });

  test("keeps the upstream production thresholds", () => {
    expect(RENDERER_CRASH_LOOP_LIMIT).toBe(5);
    expect(RENDERER_CRASH_LOOP_WINDOW_MS).toBe(60_000);
    expect(RENDERER_CRASH_LOOP_COOLDOWN_MS).toBe(300_000);
  });
});

const runtimeSource = readFileSync(new URL("../../src/main/runtime.ts", import.meta.url), "utf8");

describe("renderer crash recovery wiring", () => {
  test("records crashes, parks while open, and performs bounded recovery attempts", () => {
    expect(runtimeSource).toContain("new RendererCrashLoopBreaker(");
    expect(runtimeSource).toContain("rendererCrashLoop.recordCrash(");
    expect(runtimeSource).toContain("rendererCrashLoop.rearmIfCooledDown(");
    expect(runtimeSource).toContain("suppressTelemetry");
    expect(runtimeSource).toContain('reason: "recovery-attempt"');
  });

  test("uses a local recovery screen with diagnostics export", () => {
    expect(runtimeSource).toContain("createRendererCrashHtml");
    expect(runtimeSource).toContain("window.openDesignDesktop");
    expect(runtimeSource).toContain("exportDiagnostics");
  });
});

describe("renderer HTTP document recovery", () => {
  test("treats only 5xx documents as renderer failures", () => {
    expect(isRendererFailureHttpStatus(502)).toBe(true);
    expect(isRendererFailureHttpStatus(404)).toBe(false);
    expect(isRendererFailureHttpStatus(-1)).toBe(false);
  });

  test("wires failed loads and failed documents into the poll loop", () => {
    expect(runtimeSource).toContain('"did-fail-load"');
    expect(runtimeSource).toContain('"did-navigate"');
    expect(runtimeSource).toContain("url !== currentUrl || rendererFailed");
  });
});
