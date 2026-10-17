import { describe, expect, it, vi } from 'vitest';
import { onDocumentParsed } from '../../src/utils/on-document-parsed';

function fixture(initial = 'loading') {
  const doc = new EventTarget() as Document;
  let state = initial;
  Object.defineProperty(doc, 'readyState', { get: () => state });
  return { doc, ready(value: string) { state = value; doc.dispatchEvent(new Event('readystatechange')); } };
}

describe('editor host startup', () => {
  it('starts when parsing completes even when deferred scripts delay DOMContentLoaded', () => {
    const page = fixture(); const start = vi.fn();
    onDocumentParsed(start, page.doc);
    expect(start).not.toHaveBeenCalled();
    page.ready('interactive');
    expect(start).toHaveBeenCalledTimes(1);
    page.doc.dispatchEvent(new Event('DOMContentLoaded'));
    page.ready('complete');
    expect(start).toHaveBeenCalledTimes(1);
  });
  it.each(['interactive', 'complete'])('starts immediately at %s', state => {
    const page = fixture(state); const start = vi.fn();
    onDocumentParsed(start, page.doc);
    expect(start).toHaveBeenCalledTimes(1);
  });
});
