import { useState } from 'react';
import type { ConversationForkOrigin } from '@open-design/contracts';
import { IconGitFork } from '@tabler/icons-react';
import { useT } from '../i18n';
import { buildPath, navigate } from '../router';
import { getProject, listConversations } from '../state/projects';
import { isPixflowWordPressEmbed } from '../pixflow/license';
import styles from './ChatForkOrigin.module.css';

/** Lineage is visible after reload, independently of how much history is loaded. */
export function ChatForkOrigin({ origin }: { origin: ConversationForkOrigin }) {
  const t = useT();
  const [unavailable, setUnavailable] = useState(false);
  const [opening, setOpening] = useState(false);
  const route = { kind: 'project', projectId: origin.projectId, conversationId: origin.conversationId, fileName: null } as const;
  const path = buildPath(route);
  return <span className={styles.origin}>
    <IconGitFork size={15} stroke={1.6} aria-hidden="true" />
    {unavailable ? <span role="status">{t('chat.forkSourceUnavailable')}</span> : <a href={isPixflowWordPressEmbed() ? `#pixflow=${encodeURIComponent(path)}` : path}
      aria-busy={opening || undefined} onClick={async event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); if (opening) return; setOpening(true);
        try {
          const [project, conversations] = await Promise.all([getProject(origin.projectId), listConversations(origin.projectId)]);
          if (!project || !conversations.some(c => c.id === origin.conversationId)) setUnavailable(true);
          else navigate(route);
        } catch { setUnavailable(true); } finally { setOpening(false); }
      }}>{t('chat.continuedFrom', { title: origin.title })}</a>}
  </span>;
}
