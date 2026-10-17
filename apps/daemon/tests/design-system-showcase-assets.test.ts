import { describe, expect, it } from 'vitest';
import { rewriteDesignSystemShowcaseAssetUrls } from '../src/design-system-showcase-assets.js';

describe('design-system showcase assets', () => {
  it('rewrites relative assets without admitting external or traversal URLs', () => {
    const html = '<link href="../tokens.css"><img src="./assets/logo.svg">' +
      '<style>src:url("../fonts/display.woff2?v=1")</style>' +
      '<img src="https://example.com/external.png"><img src="../../../secret.txt">';
    const rewritten = rewriteDesignSystemShowcaseAssetUrls(html, 'bento', 'system');
    expect(rewritten).toContain('path=tokens.css');
    expect(rewritten).toContain('path=system%2Fassets%2Flogo.svg');
    expect(rewritten).toContain('path=fonts%2Fdisplay.woff2&v=1');
    expect(rewritten).toContain('https://example.com/external.png');
    expect(rewritten).toContain('../../../secret.txt');
  });
});
