import { IconPointer } from '@tabler/icons-react';
import { pageAnnotationParts } from '../pixflow/page-annotation';
import styles from './PageAnnotationMessage.module.css';

export function PageAnnotationMessage({ content }: { content: string }) {
  const annotations = pageAnnotationParts(content);
  if (!annotations.some(part => typeof part !== 'string')) return <>{content}</>;
  return <div className={styles.list}>{annotations.map((annotation, index) =>
    typeof annotation === 'string' ? <span className={styles.comment} key={index}>{annotation}</span> : <div className={styles.item} key={index}>
      <span className={styles.comment}>{annotation.comment}</span>
      <span className={styles.chip} title={`${annotation.target.selector}\n${annotation.target.url}`}>
        <IconPointer size={14} stroke={1.75} />
        <span>{annotation.target.label || annotation.target.tag}</span>
      </span>
    </div>)}</div>;
}
