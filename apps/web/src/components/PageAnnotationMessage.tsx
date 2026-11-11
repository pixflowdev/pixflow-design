import { IconPointer } from '@tabler/icons-react';
import type { ChatSkillMention } from '@open-design/contracts';
import { pageAnnotationParts } from '../pixflow/page-annotation';
import { UserMessageReferences } from './chat/UserMessageReferences';
import styles from './PageAnnotationMessage.module.css';

export function PageAnnotationMessage({ content, skillMentions }: {
  content: string;
  skillMentions?: ChatSkillMention[];
}) {
  const annotations = pageAnnotationParts(content);
  if (!annotations.some(part => typeof part !== 'string')) {
    return <UserMessageReferences content={content} skillMentions={skillMentions} />;
  }
  return <div className={styles.list}>{annotations.map((annotation, index) =>
    typeof annotation === 'string' ? <span className={styles.comment} key={index}><UserMessageReferences content={annotation} /></span> : <div className={styles.item} key={index}>
      <span className={styles.comment}>{annotation.comment}</span>
      <span className={styles.chip} title={`${annotation.target.selector}\n${annotation.target.url}`}>
        <IconPointer size={14} stroke={1.75} />
        <span>{annotation.target.label || annotation.target.tag}</span>
      </span>
    </div>)}</div>;
}
