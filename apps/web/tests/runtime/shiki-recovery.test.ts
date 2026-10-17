import { describe, expect, it, vi } from 'vitest';

const createHighlighter = vi.hoisted(() => vi.fn());
vi.mock('../../src/runtime/shiki-bundle', () => ({ createHighlighter }));
import { highlightCode } from '../../src/runtime/shiki';

describe('deferred syntax highlighter recovery', () => {
  it('retries after failed initialization and reuses the recovered instance', async () => {
    const codeToHtml = vi.fn((code: string) => `<pre>${code}</pre>`);
    createHighlighter.mockRejectedValueOnce(new Error('Chunk temporarily unavailable')).mockResolvedValueOnce({
      getLoadedLanguages: () => ['javascript'], codeToHtml,
    });
    await expect(highlightCode('customer draft', 'javascript')).rejects.toThrow('Chunk temporarily unavailable');
    await expect(highlightCode('customer draft', 'javascript')).resolves.toBe('<pre>customer draft</pre>');
    await expect(highlightCode('customer draft', 'javascript')).resolves.toBe('<pre>customer draft</pre>');
    await expect(highlightCode('unrecognized syntax', 'unknown')).resolves.toBe('');
    expect(createHighlighter).toHaveBeenCalledTimes(2);
    expect(codeToHtml).toHaveBeenCalledTimes(1);
  });
});
