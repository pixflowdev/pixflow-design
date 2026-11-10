import { useT } from '../../i18n';
import { Icon } from '../Icon';
import { Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceIcon, TraceLine, TraceTitle, TraceDescription } from './Trace';
import styles from './Sources.module.css';

export function Sources({ sources }: { sources: Array<{ title: string; url: URL }> }) {
  const t = useT();
  return <Trace data-message-sources="">
    <TraceCollapsible>
      <TraceCollapsibleTrigger>
        <TraceLine>
          <TraceIcon><Icon name="globe" size={14} /></TraceIcon>
          <TraceTitle>{t('pluginsView.tab.sources')}</TraceTitle>{' '}<TraceDescription>({sources.length})</TraceDescription>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <ul className={styles.list}>
          {sources.map(({ title, url }) => <li key={url.href}>
            <a className={styles.source} href={url.href} target="_blank" rel="noopener noreferrer"
              aria-label={`${title} · ${url.hostname} · ${t('common.openInNewTab')}`}>
              <TraceLine><TraceTitle className={styles.name} title={title}>{title}</TraceTitle>
              <TraceDescription className={styles.host}>{url.hostname}</TraceDescription>
              <TraceIcon><Icon name="external-link" size={12} /></TraceIcon></TraceLine>
            </a>
          </li>)}
        </ul>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  </Trace>;
}
