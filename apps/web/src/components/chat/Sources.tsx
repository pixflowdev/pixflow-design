import { useT } from '../../i18n';
import { Icon } from '../Icon';
import { Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceIcon, TraceLine } from './Trace';
import styles from './Sources.module.css';

export function Sources({ sources }: { sources: Array<{ title: string; url: URL }> }) {
  const t = useT();
  return <Trace data-message-sources="">
    <TraceCollapsible>
      <TraceCollapsibleTrigger>
        <TraceLine>
          <TraceIcon><Icon name="globe" size={14} /></TraceIcon>
          <span>{t('pluginsView.tab.sources')} ({sources.length})</span>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <ul className={styles.list}>
          {sources.map(({ title, url }) => <li key={url.href}>
            <a className={styles.source} href={url.href} target="_blank" rel="noopener noreferrer"
              aria-label={`${title} · ${url.hostname} · ${t('common.openInNewTab')}`}>
              <span className={styles.name}>{title}</span>
              <span className={styles.host}>{url.hostname}</span>
              <Icon name="external-link" size={12} />
            </a>
          </li>)}
        </ul>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  </Trace>;
}
