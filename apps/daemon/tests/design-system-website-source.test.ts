import { describe, expect, it } from 'vitest';

import {
  extractDesignSystemWebsiteEvidence,
  inspectDesignSystemWebsite,
} from '../src/design-system-website-source.js';

describe('design-system website source inspection', () => {
  it('extracts deterministic brand evidence from HTML and linked CSS', () => {
    const evidence = extractDesignSystemWebsiteEvidence(
      'https://example.com',
      'https://www.example.com/product',
      `<!doctype html>
        <html>
          <head>
            <title>Example Product</title>
            <meta name="description" content="A precise product description.">
            <meta property="og:image" content="/hero.png">
            <link rel="stylesheet" href="/assets/app.css">
            <style>:root { --brand-accent: #abc; --surface: #ffffff; }</style>
          </head>
          <body style="color:#112233"><img src="images/product.webp"></body>
        </html>`,
      [`.hero { font-family: "Space Grotesk", sans-serif; background: #123456; }`],
    );

    expect(evidence).toMatchObject({
      title: 'Example Product',
      description: 'A precise product description.',
      colors: expect.arrayContaining(['#aabbcc', '#ffffff', '#112233', '#123456']),
      fonts: ['Space Grotesk'],
      stylesheetUrls: ['https://www.example.com/assets/app.css'],
      imageUrls: [
        'https://www.example.com/hero.png',
        'https://www.example.com/images/product.webp',
      ],
    });
    expect(evidence.cssVariables).toEqual([
      { name: '--brand-accent', value: '#abc' },
      { name: '--surface', value: '#ffffff' },
    ]);
    expect(evidence.evidenceMarkdown).toContain('# Website Design Evidence');
  });

  it('rejects loopback and private website sources before fetching', async () => {
    await expect(inspectDesignSystemWebsite('http://127.0.0.1:8080/')).rejects.toThrow(
      'url points at a private address',
    );
    await expect(inspectDesignSystemWebsite('http://localhost/')).rejects.toThrow(
      'localhost is not allowed',
    );
  });
});
