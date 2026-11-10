import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@open-design/components/empty';
import { IconMessageCircle } from '@tabler/icons-react';
import { useT } from '../../i18n';
import styles from './FloatingChatEmpty.module.css';

export function FloatingChatEmpty() {
  const t=useT();
  return <Empty className={styles.empty}><EmptyHeader><EmptyMedia variant="icon"><IconMessageCircle aria-hidden="true"/></EmptyMedia><EmptyTitle>{t('chat.startTitle')}</EmptyTitle></EmptyHeader></Empty>;
}
