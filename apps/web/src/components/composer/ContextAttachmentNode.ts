import { TextNode, type EditorConfig, type LexicalEditor, type NodeKey, type SerializedTextNode, type Spread } from 'lexical';
import { formatContextAttachment, type ContextAttachment } from './context-attachment';
import styles from './AnnotationBatchNode.module.css';
type SerializedAttachment = Spread<{ attachment: ContextAttachment }, SerializedTextNode>;
/** Atomic visual reference; removing it affects the draft, never the saved source. */
export class ContextAttachmentNode extends TextNode {
  __attachment: ContextAttachment;
  static getType() { return 'context-attachment'; }
  static clone(node: ContextAttachmentNode) { return new ContextAttachmentNode(node.__attachment, node.__key); }
  constructor(attachment: ContextAttachment, key?: NodeKey) {
    super(formatContextAttachment(attachment), key); this.__attachment = attachment;
  }
  createDOM(_config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = document.createElement('span');
    dom.className = styles.chip!; dom.contentEditable = 'false';
    dom.setAttribute('data-context-attachment', '');
    const label = document.createElement('span');
    label.className = styles.review!; label.textContent = this.__attachment.label;
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = styles.remove!;
    remove.setAttribute('aria-label', `Remove ${this.__attachment.label}`);
    remove.textContent = '×';
    remove.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      editor.update(() => { this.getLatest().remove(); });
      editor.focus();
    });
    dom.append(label, remove); return dom;
  }
  updateDOM() { return false; }
  isTextEntity() { return true; }
  canInsertTextBefore() { return false; }
  canInsertTextAfter() { return false; }
  exportJSON(): SerializedAttachment { return { ...super.exportJSON(), type: ContextAttachmentNode.getType(), version: 1, attachment: this.__attachment }; }
  static importJSON(value: SerializedAttachment) { return $createContextAttachmentNode(value.attachment); }
}
export function $createContextAttachmentNode(value: ContextAttachment) {
  return new ContextAttachmentNode(value).setMode('token');
}
