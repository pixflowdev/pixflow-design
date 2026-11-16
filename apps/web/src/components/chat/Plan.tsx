import { useState } from 'react';
import { IconCircle, IconCircleCheck, IconCircleDot, IconPlayerPause, IconRoute } from '@tabler/icons-react';
import { Button } from '@open-design/components';
import { useT } from '../../i18n';
import { parseTodoWriteInput } from '../../runtime/todos';
import { Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceDescription, TraceIcon, TraceLine, TraceTitle } from './Trace';
import styles from './Plan.module.css';

/** shadcn/ui AI Elements Plan composition. Persistence and provider adapters
 * stay outside this presentation component. See ui.shadcn.com/docs/ai-elements/base/plan. */
export function PlanCard({ input, runStreaming, onDismiss }: {
  input: unknown; runStreaming: boolean; runSucceeded: boolean; onDismiss?: () => void;
}) {
  const t = useT();
  const steps = parseTodoWriteInput(input);
  const [expanded, setExpanded] = useState<boolean | null>(null);
  if (!steps.length) return null;
  const plan = input && typeof input === 'object' ? input as {title?: unknown; summary?: unknown} : {};
  const completed = steps.filter(step => step.status === 'completed').length;
  const running = runStreaming && steps.some(step => step.status === 'in_progress');
  return <Trace className={styles.plan} data-trace-kind="plan">
    <TraceCollapsible open={expanded ?? completed !== steps.length} onOpenChange={setExpanded}>
      <div className={styles.heading}>
        <TraceCollapsibleTrigger>
          <TraceLine status={running ? 'running' : undefined}>
            <TraceIcon><IconRoute size={14} /></TraceIcon>
            <TraceTitle>{typeof plan.title === 'string' ? plan.title : t('tool.todos')}</TraceTitle>
            <TraceDescription>{completed}/{steps.length}</TraceDescription>
          </TraceLine>
        </TraceCollapsibleTrigger>
        {onDismiss && completed === steps.length
          ? <Button variant="subtle" onClick={onDismiss} title={t('tool.todosDismiss')}>{t('tool.todosDone')}</Button> : null}
      </div>
      <TraceCollapsibleContent keepMounted>
        {typeof plan.summary === 'string' && plan.summary ? <p className={styles.summary}>{plan.summary}</p> : null}
        <Trace role="list" className={styles.steps}>
          {steps.map((step, index) => {
            const active = step.status === 'in_progress' && runStreaming;
            const StatusIcon = step.status === 'completed' ? IconCircleCheck : active ? IconCircleDot
              : step.status === 'stopped' || step.status === 'in_progress' ? IconPlayerPause : IconCircle;
            return <TraceLine key={index} role="listitem" className={styles.step}
              status={active ? 'running' : step.status === 'completed' ? undefined : 'pending'}>
              <TraceIcon><StatusIcon size={14} /></TraceIcon>
              <TraceTitle>{active && step.activeForm ? step.activeForm : step.content}</TraceTitle>
            </TraceLine>;
          })}
        </Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  </Trace>;
}
