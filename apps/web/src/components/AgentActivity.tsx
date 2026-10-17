import { useState } from 'react';
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
  const [open, setOpen] = useState(false);
  const activityInProgress = activity.status === 'started' || activity.status === 'progress';
  const active = runStreaming && activityInProgress;
  const sources = activity.sources || [];
  const sourceLabel = sources.length === 1 ? '1 source' : `${sources.length} sources`;
  const settledIcon: IconName = activity.status === 'failed'
    ? 'alert-triangle'
    : activity.status === 'canceled'
      ? 'stop'
      : activity.status === 'succeeded' || (activityInProgress && !runStreaming)
        ? 'check'
        : activityIcon(activity.phase);
  const statusClass = activity.status === 'failed'
    ? styles.failed
    : activity.status === 'canceled'
      ? styles.canceled
      : activity.status === 'succeeded' || (activityInProgress && !runStreaming)
        ? styles.succeeded
        : styles.active;

  return (
    <div
      className={`${styles.activity} ${statusClass}`}
      data-agent-activity-phase={activity.phase}
      data-agent-activity-status={activityInProgress && !runStreaming ? 'succeeded' : activity.status}
      role="status"
      aria-live={active ? 'polite' : undefined}
    >
      <div className={styles.header}>
        <span className={styles.icon} aria-hidden>
          <Icon name={active ? 'spinner' : settledIcon} size={14} />
        </span>
        <span className={styles.copy}>
          <span className={`${styles.label}${active ? ' shimmer-text' : ''}`}>{activity.label}</span>
          {activity.detail ? <span className={styles.detail}>{activity.detail}</span> : null}
        </span>
        {sources.length ? (
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            <span>{sourceLabel}</span>
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size={11} />
          </button>
        ) : null}
      </div>
      {sources.length ? (
        <div className={`accordion-collapsible${open ? ' open' : ''}`}>
          <div className="accordion-collapsible-inner">
            <ul className={styles.sources}>
              {sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer noopener">{source.title}</a>
                  {source.provider ? <span>{source.provider}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
