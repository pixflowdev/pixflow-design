import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(import.meta.dirname, '../../src');

function source(relativePath: string): string {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8');
}

describe('selected provider readiness surface coverage', () => {
  it.each([
    ['main and project workspaces', 'App.tsx'],
    ['WP Admin floating panel', 'pixflow/WpAdminAgentFrameApp.tsx'],
  ])('warms the selected provider for %s', (_surface, file) => {
    const text = source(file);
    expect(text).toContain('warmSelectedAgentReadiness');
    expect(text).toContain("window.addEventListener('pageshow', onFocus)");
    expect(text).toContain("window.addEventListener('pixflow-design:bridge-status', onBridgeStatus)");
    expect(text).toContain('readinessBridgeStatusSignatureRef.current = signature');
  });

  it('keeps BYOK outside the local CLI readiness path', () => {
    const text = source('providers/agent-readiness.ts');
    expect(text).toContain("if (input.mode !== 'daemon') return null");
    expect(text).toContain('never submits a prompt');
  });
});
