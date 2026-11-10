import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIcon, type ActivityIconKind } from './ActivityIcon';
import { Trace, TraceCollapsible, TraceCollapsibleTrigger, TraceCollapsibleContent, TraceLine, TraceIcon, TraceTitle, TraceDescription } from './Trace';

/** Presentation only: source events and their ordering stay untouched. */
export function groupActivity<T>(blocks: T[], eligible: (block: T) => boolean) {
  const groups: { start: number; grouped: boolean; blocks: T[] }[] = [];
  blocks.forEach((block, start) => {
    const grouped = eligible(block);
    const previous = groups.at(-1);
    if (grouped && previous?.grouped) previous.blocks.push(block);
    else groups.push({ start, grouped, blocks: [block] });
  });
  return groups;
}

export function ActivityDisclosure({ label, icon = 'tools', active, live = active, soloReasoning = false, issueLabel, stepLabel, children }: {
  label: string; icon?: ActivityIconKind; active: boolean; live?: boolean; soloReasoning?: boolean; issueLabel?: string; stepLabel?: string; children: () => ReactNode;
}) {
  const [override, setOverride] = useState<boolean>();
  // A live summary is useful; expanding every command/output is not. Preserve
  // the user's explicit choice across subsequent events and completion.
  const open = soloReasoning || (override ?? false);
  const [visited, setVisited] = useState(open);
  const [displayed, setDisplayed] = useState({ label, icon });
  const changedAt = useRef(Date.now());
  useEffect(() => {
    if (label === displayed.label && icon === displayed.icon) return;
    const update = () => { setDisplayed({ label, icon }); changedAt.current = Date.now(); };
    if (!active) { update(); return; }
    const timer = setTimeout(update, Math.max(0, 1000 - (Date.now() - changedAt.current)));
    return () => clearTimeout(timer);
  }, [label, icon, displayed, active]);
  useEffect(() => {
    if (open) setVisited(true);
  }, [open]);
  return <TraceCollapsible data-activity-group data-active={active} data-solo-reasoning={soloReasoning || undefined} open={open}
    onOpenChange={setOverride}>
    {!soloReasoning && <TraceCollapsibleTrigger>
      <TraceLine status={active ? 'running' : issueLabel ? 'error' : undefined}>
        <TraceIcon><ActivityIcon kind={!active ? icon : displayed.icon} /></TraceIcon>
        <TraceTitle>{!active ? label : displayed.label}</TraceTitle>
        {stepLabel && <TraceDescription>{stepLabel}</TraceDescription>}
        {issueLabel ? <TraceDescription>{issueLabel}</TraceDescription> : null}
      </TraceLine>
    </TraceCollapsibleTrigger>}
    <TraceCollapsibleContent keepMounted>{open || visited ? <Trace data-chain-of-thought="">{children()}</Trace> : null}</TraceCollapsibleContent>
  </TraceCollapsible>;
}
