import { useMemo, type ReactNode } from 'react';
import { IconCircleCheck, IconAlertCircle, IconCircleMinus, IconFlask } from '@tabler/icons-react';
import { Trace, TraceCollapsible, TraceCollapsibleTrigger, TraceCollapsibleContent, TraceLine, TraceTitle, TraceIcon, TraceDescription } from './Trace';
import { CodeBlock, CodeBlockContent } from './CodeBlock';

type Test = { name: string; status: 'passed' | 'failed' | 'skipped'; error?: string };
type Suite = { name: string; tests: Test[] };

/** Only explicit structured results become test suites. Never infer passes from
 * prose or a command name. Unknown provider payloads retain the generic output. */
export function readTestSuites(content: string): Suite[] | null {
  if (content.length > 32768) return null;
  try {
    const value = JSON.parse(content);
    if (!Array.isArray(value?.suites) || !value.suites.length) return null;
    if (!value.suites.every((suite: Suite) => suite && typeof suite.name === 'string'
      && Array.isArray(suite.tests) && suite.tests.every(test => test && typeof test.name === 'string'
        && ['passed', 'failed', 'skipped'].includes(test.status)
        && (test.error === undefined || typeof test.error === 'string')))) return null;
    return value.suites;
  } catch { return null; }
}

/** shadcn Test Results and Stack Trace patterns; source results stay immutable. */
export function StreamToolResult({ content, failed, kind, children }: { content: string; failed?: boolean; kind?: string; children: ReactNode }) {
  const suites = useMemo(() => readTestSuites(content), [content]);
  if (suites) return <Trace data-trace-kind="test-results">{suites.map((suite, index) => {
    const failures = suite.tests.filter(test => test.status === 'failed').length;
    return <TraceCollapsible key={index} defaultOpen={failures > 0}>
      <TraceCollapsibleTrigger><TraceLine status={failures ? 'error' : undefined}>
        <TraceIcon><IconFlask /></TraceIcon><TraceTitle>{suite.name}</TraceTitle>
        <TraceDescription>{suite.tests.filter(test => test.status === 'passed').length}/{suite.tests.length}</TraceDescription>
      </TraceLine></TraceCollapsibleTrigger>
      <TraceCollapsibleContent keepMounted><Trace>{suite.tests.map((test, testIndex) => {
        const Glyph = test.status === 'failed' ? IconAlertCircle : test.status === 'skipped' ? IconCircleMinus : IconCircleCheck;
        const line = <TraceLine status={test.status === 'failed' ? 'error' : test.status === 'skipped' ? 'pending' : undefined}>
          <TraceIcon><Glyph /></TraceIcon><TraceTitle>{test.name}</TraceTitle>
        </TraceLine>;
        return test.error ? <TraceCollapsible key={testIndex}>
          <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
          <TraceCollapsibleContent><CodeBlock size="sm" variant="destructive"><CodeBlockContent>{test.error}</CodeBlockContent></CodeBlock></TraceCollapsibleContent>
        </TraceCollapsible> : <div key={testIndex}>{line}</div>;
      })}</Trace></TraceCollapsibleContent>
    </TraceCollapsible>;
  })}</Trace>;
  if (failed && /(?:^|\n)\s*at\s+\S|Traceback \(most recent call last\)/.test(content)) {
    const title = content.split('\n').find(line => /(?:Error|Exception):/.test(line)) || content.split('\n')[0] || '';
    return <Trace data-trace-kind="stack-trace"><TraceCollapsible defaultOpen>
      <TraceCollapsibleTrigger><TraceLine status="error"><TraceIcon><IconAlertCircle /></TraceIcon><TraceTitle>{title.slice(0, 200)}</TraceTitle></TraceLine></TraceCollapsibleTrigger>
      <TraceCollapsibleContent><CodeBlock size="sm" variant="destructive"><CodeBlockContent>{content.slice(0, 16000)}</CodeBlockContent></CodeBlock></TraceCollapsibleContent>
    </TraceCollapsible></Trace>;
  }
  if (kind === 'subagent' && !/^\s*[\[{]/.test(content)) return <div style={{ whiteSpace: 'pre-wrap' }}>{content.slice(0, 16000)}</div>;
  return children;
}
