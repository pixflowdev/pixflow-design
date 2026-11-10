import { TraceIcon, TraceLine, TraceTitle, TraceDescription } from './chat/Trace';
import { citationSource } from './chat/InlineCitation';
import { useT } from '../i18n';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { Icon, type IconName } from './Icon';
import styles from './AgentActivity.module.css';

type ActivityEvent = Extract<PersistedAgentEvent, { kind: 'activity' }>;

function activityIcon(phase: ActivityEvent['phase']): IconName {
  if (phase === 'researching') return 'search';
  if (phase === 'reading') return 'file';
  if (phase === 'thinking' || phase === 'planning') return 'sparkles';
  if (phase === 'executing') return 'play';
  if (phase === 'verifying') return 'check';
  return 'spinner';
}

export function AgentActivity({ activity, runStreaming }: { activity: ActivityEvent; runStreaming: boolean }) {
  const t = useT();
  const active = runStreaming && ['started', 'progress'].includes(activity.status);
  const failed = activity.status === 'failed';
  const icon = failed ? 'alert-triangle' : activity.status === 'succeeded' ? 'check'
    : activity.status === 'canceled' ? 'stop' : activityIcon(activity.phase);
  const sources = new Map<string, { url: URL; title: string }>();
  for (const source of activity.sources ?? []) {
    const url = citationSource(source.url);
    if (url && !sources.has(url.href)) sources.set(url.href, { url, title: source.title || url.hostname });
  }

  return <div data-agent-activity-phase={activity.phase} data-agent-activity-status={activity.status}>
    <TraceLine status={failed ? 'error' : active ? 'running' : undefined}>
      <TraceIcon><Icon name={active ? 'spinner' : icon} size={14} /></TraceIcon>
      <TraceTitle title={activity.label}>{activity.label}</TraceTitle>
      {activity.detail && <TraceDescription title={activity.detail}>{activity.detail}</TraceDescription>}
    </TraceLine>
    {sources.size > 0 && <div className={styles.badges}>
      {[...sources.values()].map(({ url, title }) => <a key={url.href} href={url.href}
        target="_blank" rel="noopener noreferrer" title={title}
        aria-label={`${title} · ${url.hostname} · ${t('common.openInNewTab')}`}>{url.hostname}</a>)}
    </div>}
  </div>;
}
