import type { ChatMessage } from '../../types';
import type { Dict } from '../../i18n/types';
import { projectRawUrl } from '../../providers/registry';
import { Icon } from '../Icon';
import { Marker, MarkerContent, MarkerIcon } from './Marker';
import { Attachment, AttachmentGroup, AttachmentMedia, AttachmentContent, AttachmentTitle, AttachmentDescription, AttachmentActions, AttachmentAction } from './Attachment';
import { Bubble, BubbleContent } from './Bubble';
import { Message, MessageContent } from './Message';
import styles from './HandoffMessage.module.css';

/** Presentation only: the stored content remains the full executable handoff. */
export function HandoffMessage({message,t}: {message:ChatMessage;t:(key:keyof Dict,vars?:Record<string,string|number>)=>string}) {
  const display=message.handoffPresentation;
  if(!display)return null;
  return <section className={styles.handoff} data-chat-user-id={message.id}>
    <Marker><MarkerIcon><Icon name="file" size={14}/></MarkerIcon><MarkerContent>{display.title}</MarkerContent></Marker>
    <AttachmentGroup className={styles.files}>
      {(message.attachments || []).map(file=><Attachment key={`${file.projectId}:${file.path}`}>
        <AttachmentMedia><Icon name="file" size={18}/></AttachmentMedia>
        <AttachmentContent><AttachmentTitle>{file.name}</AttachmentTitle><AttachmentDescription>{file.name.split('.').pop()?.toUpperCase()}</AttachmentDescription></AttachmentContent>
        {file.projectId && <AttachmentActions><AttachmentAction render={<a href={projectRawUrl(file.projectId,file.path)} download={file.name}/>} aria-label={`${t('fileViewer.download')} ${file.name}`} title={t('fileViewer.download')}><Icon name="download" size={15}/></AttachmentAction></AttachmentActions>}
      </Attachment>)}
    </AttachmentGroup>
    <Message align="end" className="msg user"><MessageContent className="user-text-wrap"><Bubble align="end"><BubbleContent className="user-text user-bubble">{display.summary}</BubbleContent></Bubble></MessageContent></Message>
  </section>;
}
