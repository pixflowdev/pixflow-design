import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('bare markdown links', () => {
  it('wraps at useful URL boundaries instead of splitting every character', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/viewer/code.css'), 'utf8');
    const rule = css.match(/\.prose-block \.md-link-bare\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toContain('word-break: normal');
    expect(rule).toContain('overflow-wrap: break-word');
    expect(rule).not.toContain('word-break: break-all');
  });
});
