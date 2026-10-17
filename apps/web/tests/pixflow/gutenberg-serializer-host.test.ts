import { describe, expect, it, vi } from 'vitest';
import { assertNonEmptyGutenbergSerialization, gutenbergActionUnavailableMessage, prepareGutenbergAction } from '../../src/pixflow/gutenberg-serializer-host';
import { pixflowWordPressRestFetch } from '../../src/pixflow/runtime-fetch';

vi.mock('../../src/pixflow/runtime-fetch', () => ({ pixflowWordPressRestFetch: vi.fn() }));

describe('Gutenberg serializer host fail-closed checks', () => {
  it('returns normal feature availability without opening a serializer or requesting a receipt', async () => {
    const unavailable = { allowed: false, code: 'pro_required', message: 'Advanced site tools require Pro.', learnMore: { label: 'Learn more', url: 'https://pixflow.dev/free-pro#advanced-site-tools' } };
    vi.mocked(pixflowWordPressRestFetch).mockReset().mockResolvedValue(new Response(JSON.stringify(unavailable)));
    await expect(prepareGutenbergAction('pixflow/wp-admin/gutenberg/apply-document', {
      postId: 7, expectedFingerprint: 'sha256:before', blocks: [{ name: 'core/html', attributes: { content: '<script>alert(1)</script>' } }],
    }, 'session')).resolves.toEqual(unavailable);
    expect(pixflowWordPressRestFetch).toHaveBeenCalledTimes(1);
    expect(gutenbergActionUnavailableMessage({ ...unavailable, allowed: false, code: 'pro_required' })).toBe('Advanced site tools require Pro.\n\n[Learn more](https://pixflow.dev/free-pro#advanced-site-tools)');
  });

  it('keeps genuine authorization denials as errors', async () => {
    vi.mocked(pixflowWordPressRestFetch).mockReset().mockResolvedValue(new Response(JSON.stringify({ code: 'gutenberg_executable_content_forbidden', message: 'Code permission is required.' }), { status: 403 }));
    await expect(prepareGutenbergAction('pixflow/wp-admin/gutenberg/apply-document', { postId: 7, blocks: [] }, 'session')).rejects.toThrow('Code permission is required.');
  });
  it('rejects an empty browser serialization even when the browser reports valid', () => {
    expect(() => assertNonEmptyGutenbergSerialization({
      content: '',
      validation: { valid: true, blockCount: 0 },
    })).toThrow(/empty or unverified document/i);
  });

  it('rejects non-empty markup when the browser reports no verified blocks', () => {
    expect(() => assertNonEmptyGutenbergSerialization({
      content: '<!-- wp:paragraph --><p>Article</p><!-- /wp:paragraph -->',
      validation: { valid: true, blockCount: 0 },
    })).toThrow(/empty or unverified document/i);
  });

  it('accepts non-empty markup only with a positive browser block count', () => {
    expect(() => assertNonEmptyGutenbergSerialization({
      content: '<!-- wp:paragraph --><p>Article</p><!-- /wp:paragraph -->',
      validation: { valid: true, blockCount: 1 },
    })).not.toThrow();
  });

  it('surfaces only bounded clone-safe browser validation evidence', () => {
    expect(() => assertNonEmptyGutenbergSerialization({
      content: '<!-- wp:table --><figure class="wp-block-table"></figure><!-- /wp:table -->',
      validation: {
        valid: false,
        blockCount: 1,
        errors: [{ index: 14, name: 'core/table', issues: ['Block validation failed.'] }],
      },
    })).toThrow(/block 14 · core\/table · Block validation failed\./);
  });
});
