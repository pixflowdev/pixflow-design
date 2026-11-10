// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createEditor, $getRoot, $isElementNode } from 'lexical';
import { ContextAttachmentNode } from '../../../src/components/composer/ContextAttachmentNode';
import { contextAttachmentParts, formatContextAttachment } from '../../../src/components/composer/context-attachment';
import { setComposerFromText } from '../../../src/components/composer/deserialize';
import { serializeComposer } from '../../../src/components/composer/serialize';

describe('context attachments', () => {
  const attachment = { label: '2 feedback notes', content: 'Read the notes.\n[{"text":"Preserve this","replies":["Reply"]}]' };
  it('restores an atomic chip while retaining the complete agent payload', () => {
    const editor = createEditor({ nodes: [ContextAttachmentNode], onError: error => { throw error; } });
    const text = `My draft\n${formatContextAttachment(attachment)}\nMore text`;
    setComposerFromText(editor, text, []);
    expect(serializeComposer(editor.getEditorState()).text).toBe(text);
    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChildOrThrow();
      if (!$isElementNode(paragraph)) throw new Error('Expected paragraph');
      const node = paragraph.getChildren().find(item => item instanceof ContextAttachmentNode) as ContextAttachmentNode;
      expect(node).toBeDefined();
      const dom = node.createDOM(editor._config, editor);
      expect(dom.querySelector('span')?.textContent).toBe('2 feedback notes');
      expect(dom.textContent).not.toContain('replies');
    });
    const restored = editor.parseEditorState(JSON.stringify(editor.getEditorState().toJSON()));
    expect(serializeComposer(restored).text).toBe(text);
  });
  it('preserves malformed attachments as ordinary draft text', () => {
    const text = '[Pixflow context attachment]{broken}[/Pixflow context attachment]';
    expect(contextAttachmentParts(text)).toEqual([text]);
  });
  it('round trips multiple attachments without dropping adjacent text', () => {
    const text = `Before ${formatContextAttachment(attachment)} between ${formatContextAttachment(attachment)} after`;
    expect(contextAttachmentParts(text).map(part => typeof part === 'string' ? part : formatContextAttachment(part)).join('')).toBe(text);
  });
});
