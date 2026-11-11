// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { editorStyleSnapshot, optionalStyleSource, renderedEditorStyles } from '../../src/pixflow/editor-style-snapshot';

describe('editor style snapshot revisions', () => {
  it('reuses unchanged evidence but invalidates changes, document switches and sites', () => {
    const input = { editor: 'gutenberg' as const, site: 'https://one.test', documentId: '12', native: { colors: ['red'], root: 10 }, rendered: { rootFontSize: '10px' } };
    const first = editorStyleSnapshot(input);
    expect(editorStyleSnapshot({ ...input, native: { root: 10, colors: ['red'] } })).toBe(first);
    expect(editorStyleSnapshot({ ...input, native: { colors: ['blue'], root: 10 } }).revision).not.toBe(first.revision);
    expect(editorStyleSnapshot({ ...input, documentId: '13' }).revision).not.toBe(first.revision);
    expect(editorStyleSnapshot({ ...input, site: 'https://two.test' }).revision).not.toBe(first.revision);
    expect(editorStyleSnapshot({ ...input, rendered: { rootFontSize: '16px' } }).revision).not.toBe(first.revision);
    expect(first.markdown).toContain('10px');
    expect(first.markdown).toContain('Untrusted site data');
  });
  it('does not hide style changes beyond displayed evidence limits', () => {
    const native = Array.from({ length: 2000 }, (_, i) => ({ selector: `.item-${i}`, css: 'color:red' }));
    const first = editorStyleSnapshot({ editor: 'etch', site: 'local', documentId: '1', native, rendered: null });
    native[1999]!.css = 'color:blue';
    expect(editorStyleSnapshot({ editor: 'etch', site: 'local', documentId: '1', native, rendered: null }).revision).not.toBe(first.revision);
  });
  it('isolates a native store snapshot and tolerates unavailable optional stores', () => {
    const source = { colors: ['red'] };
    const captured = optionalStyleSource(() => source);
    source.colors[0] = 'blue';
    expect(captured).toEqual({ colors: ['red'] });
    expect(optionalStyleSource(() => undefined)).toBeNull();
    expect(optionalStyleSource(() => { throw new Error('Store not ready'); })).toMatchObject({ available: false });
    expect(optionalStyleSource(() => Promise.resolve(source))).toMatchObject({ available: false });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(optionalStyleSource(() => circular)).toMatchObject({ available: false });
  });
  it('captures container constraints separately from viewport size and excludes admin chrome', () => {
    document.body.innerHTML = '<h1>Admin toolbar</h1><iframe id="canvas"></iframe>';
    const doc = document.querySelector('iframe')!.contentDocument!;
    doc.documentElement.style.fontSize = '10px';
    doc.body.innerHTML = '<div class="wp-block-post-content" style="max-width:640px;padding:20px"><h1>Page heading</h1></div>';
    const container = doc.querySelector('.wp-block-post-content')!;
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ width: 640 } as DOMRect);
    const evidence = renderedEditorStyles('#canvas') as any;
    expect(evidence.rootFontSize).toBe('10px');
    expect(evidence.contentContainers).toContainEqual(expect.objectContaining({ width: 640, maxWidth: '640px', paddingInline: '20px 20px' }));
    expect(evidence.typography.filter((item: any) => item.tag === 'h1')).toHaveLength(1);
    document.body.innerHTML = '';
    expect(renderedEditorStyles('#canvas')).toMatchObject({ available: false });
  });
});
