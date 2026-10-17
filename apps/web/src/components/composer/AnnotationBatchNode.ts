import { annotationAvailable } from '../../pixflow/annotation-availability';
import { TextNode, type NodeKey, type SerializedTextNode, type Spread } from 'lexical';
import styles from './AnnotationBatchNode.module.css';
import type { PageAnnotation } from '../../pixflow/page-annotation';
import { formatAnnotationDraft } from '../../pixflow/annotation-draft';

type SerializedBatch = Spread<{ annotations: PageAnnotation[] }, SerializedTextNode>;
export class AnnotationBatchNode extends TextNode {
  __annotations: PageAnnotation[];
  static getType() { return 'page-annotation-batch'; }
  static clone(node: AnnotationBatchNode) { return new AnnotationBatchNode(node.__annotations, node.__key); }
  constructor(annotations: PageAnnotation[], key?: NodeKey) {
    super(formatAnnotationDraft(annotations), key);
    this.__annotations = annotations;
  }
  createDOM(): HTMLElement {
    const dom = document.createElement('span');
    dom.className = styles.chip!;
    dom.contentEditable = 'false';
    dom.setAttribute('data-annotation-batch', '');
    const review = document.createElement('button');
    review.type = 'button';
    review.className = styles.review!;
    review.textContent = `${this.__annotations.length} annotation${this.__annotations.length === 1 ? '' : 's'}`;
    review.setAttribute('data-pixflow-i18n-count', String(this.__annotations.length));
    review.title = annotationAvailable() ? 'Review annotations' : this.__annotations.map((item, index) => `${index + 1}. ${item.target.label}: ${item.comment}`).join('\n');
    if (annotationAvailable()) review.setAttribute('data-pixflow-i18n-title', 'annotations.review');
    review.disabled = !annotationAvailable();
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = styles.remove!;
    remove.setAttribute('aria-label', 'Remove annotations attachment');
    remove.title = 'Remove annotations';
    remove.setAttribute('data-pixflow-i18n-label', 'annotations.removeAttachment');
    remove.setAttribute('data-pixflow-i18n-title', 'annotations.remove');
    const icon = document.createElementNS('http://www.w3.org/2000/svg','svg');
    icon.setAttribute('viewBox','0 0 24 24'); icon.setAttribute('width','14'); icon.setAttribute('height','14'); icon.setAttribute('aria-hidden','true');
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d','M6 6l12 12M18 6L6 18'); path.setAttribute('stroke','currentColor'); path.setAttribute('stroke-width','1.75'); path.setAttribute('stroke-linecap','round');
    icon.append(path); remove.append(icon); dom.append(review,remove);
    remove.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); dom.dispatchEvent(new CustomEvent('pixflow:remove-annotations', {bubbles:true})); });
    const open = () => dom.dispatchEvent(new CustomEvent('pixflow:review-annotations', { bubbles: true }));
    review.addEventListener('click', event => {event.stopPropagation(); open();});
    review.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); open(); }
    });
    return dom;
  }
  updateDOM() { return false; }
  isTextEntity() { return true; }
  canInsertTextBefore() { return false; }
  canInsertTextAfter() { return false; }
  exportJSON(): SerializedBatch { return { ...super.exportJSON(), type: AnnotationBatchNode.getType(), version: 1, annotations: this.__annotations }; }
  static importJSON(value: SerializedBatch) { return $createAnnotationBatchNode(value.annotations); }
}
export function $createAnnotationBatchNode(annotations: PageAnnotation[]) {
  const node = new AnnotationBatchNode(annotations);
  node.setMode('token');
  return node;
}
