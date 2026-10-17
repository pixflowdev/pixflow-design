import { describe, expect, it } from 'vitest';

import { extractBuildSourceEnvelope } from '../../src/pixflow/bricks-html-source-shared';

describe('Build in Bricks hosted source parser', () => {
  it('accepts the bounded labelled HTML/CSS artifact returned by OpenAI BYOK', () => {
    const result = extractBuildSourceEnvelope([
      '```html',
      '<section class="hero"><h1>Independent architecture</h1></section>',
      '```',
      '',
      '```css',
      '.hero { display: grid; }',
      '```',
      '',
      'The page uses semantic HTML and a small authored stylesheet.',
    ].join('\n'));

    expect(result).toEqual({
      html: '<section class="hero"><h1>Independent architecture</h1></section>',
      css: '.hero { display: grid; }',
      js: null,
    });
  });

  it('does not treat arbitrary prose, unlabelled fences, or duplicate files as source', () => {
    expect(extractBuildSourceEnvelope('I would create a hero and a contact section.')).toEqual({
      html: null,
      css: null,
      js: null,
    });
    expect(extractBuildSourceEnvelope('```\n<section>Not labelled</section>\n```')).toEqual({
      html: null,
      css: null,
      js: null,
    });
    expect(extractBuildSourceEnvelope([
      '```html',
      '<section>First</section>',
      '```',
      '```html',
      '<section>Second</section>',
      '```',
      '```css',
      'section { display: block; }',
      '```',
    ].join('\n'))).toEqual({
      html: null,
      css: 'section { display: block; }',
      js: null,
    });
  });

  it('keeps canonical XML envelopes authoritative over explanatory fences', () => {
    const result = extractBuildSourceEnvelope([
      '<pixflow-build-source-file path="build-source/source/index.html"><main>Canonical</main></pixflow-build-source-file>',
      '<pixflow-build-source-file path="build-source/source/styles.css">main { color: black; }</pixflow-build-source-file>',
      '```html',
      '<main>Explanation example</main>',
      '```',
    ].join('\n'));

    expect(result.html).toBe('<main>Canonical</main>');
    expect(result.css).toBe('main { color: black; }');
  });
});
