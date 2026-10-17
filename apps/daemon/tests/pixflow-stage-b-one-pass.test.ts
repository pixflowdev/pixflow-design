import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildStageBDeltaPacket,
  stageBDeltaPacketCacheDecision,
} from '../../../tools/pixflow-design-bridge/stage-b-delta-packet.mjs';

describe('HTML to Bricks Stage B one-pass contract', () => {
  it('has no automatic QA-score repair loop in the packaged bridge runner', () => {
    const source = readFileSync(new URL('../../../tools/pixflow-design-bridge/bricks-handoff-cli.mjs', import.meta.url), 'utf8');
    expect(source).not.toMatch(/for \(let attempt = 1; stageBQaNeedsRepair/);
  });

  it('does not require a result mutation merely to prove the model ran', () => {
    const source = readFileSync(new URL('../src/pixflow/bricks-handoff-conversion.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('bricks_handoff_model_pass_incomplete');
    expect(source).toContain('stage_b_noop_baseline_retained');
  });

  it('builds one deterministic bounded delta packet and detects cache hits', () => {
    const input = {
      source: {
        canonicalHash: 'sha256:source',
        viewports: [{ id: 'desktop', width: 1440, height: 1000 }],
        geometry: Array.from({ length: 80 }, (_, index) => ({ id: `section-${index}`, top: index * 500, height: 480 })),
        fonts: ['Inter', 'Georgia'],
        colours: ['#111111', '#ffffff'],
        assets: ['hero.webp'],
        interactions: ['tabs'],
      },
      bricks: {
        resultHash: 'sha256:bricks',
        documentHeight: 6000,
        geometry: [{ id: 'section-1', top: 0, height: 520 }],
        elementCount: 120,
        globalClassCount: 30,
      },
      issues: Array.from({ length: 100 }, (_, index) => ({ id: `issue-${index}`, message: 'x'.repeat(200) })),
    };
    const first = buildStageBDeltaPacket(input);
    const second = buildStageBDeltaPacket(input);

    expect(first.schema).toBe('pixflow.html_to_bricks.stage_b_delta.v1');
    expect(first.sha256).toBe(second.sha256);
    expect(JSON.stringify(first.packet).length).toBeLessThan(32_000);
    expect(first.packet.source.geometry.length).toBeLessThanOrEqual(24);
    expect(first.packet.issues.length).toBeLessThanOrEqual(32);
    expect(stageBDeltaPacketCacheDecision(first.sha256, second.sha256)).toBe('hit');
    expect(stageBDeltaPacketCacheDecision(first.sha256, 'changed')).toBe('miss');
  });
});
