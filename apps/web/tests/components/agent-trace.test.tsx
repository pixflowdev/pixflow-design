// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import { SharedChatRows } from '../../src/components/shared-chat/SharedChatRows';
import type { AgentEvent, ChatMessage } from '../../src/types';
import { ToolCard } from '../../src/components/ToolCard';

import { TraceCollapsible, TraceCollapsibleTrigger, TraceCollapsibleContent } from '../../src/components/chat/Trace';

afterEach(cleanup);

it('keeps a manually opened tool detail when the outer timeline is folded and reopened', () => {
  const view = render(<AssistantMessage projectId={null} streaming={false} message={{
    id: 'nested', role: 'assistant', content: '', runStatus: 'succeeded', events: [
      { kind: 'tool_use', name: 'Bash', id: 'tool', input: { command: 'echo ready' } },
      { kind: 'tool_result', toolUseId: 'tool', content: 'Ready', isError: false },
    ],
  }} />);
  const group = view.container.querySelector('[data-activity-group] > button')!;
  fireEvent.click(group);
  fireEvent.click(view.container.querySelector('[data-trace-kind="tool"] > button')!);
  fireEvent.click(group);
  fireEvent.click(group);
  expect(view.container.querySelector('[data-trace-kind="tool"] > button')?.getAttribute('aria-expanded')).toBe('true');
  expect(view.getByText('Ready')).toBeTruthy();
});

it('renders repeated saved tool identities once while retaining distinct executions and source history', () => {
  const use = { kind: 'tool_use' as const, id: 'repeat', name: 'Bash', input: { command: 'Read a page' } };
  const message: ChatMessage = { id: 'old-claude', role: 'assistant', content: '', runStatus: 'succeeded', events: [
    use, { ...use }, { kind: 'tool_result', toolUseId: 'repeat', content: 'Not found', isError: true },
    { ...use, id: 'retry' }, { kind: 'tool_result', toolUseId: 'retry', content: 'Read confirmed', isError: false },
  ] };
  const before = JSON.stringify(message);
  const view = render(<AssistantMessage projectId={null} streaming={false} message={message} />);
  fireEvent.click(view.container.querySelector('[data-activity-group] > button')!);
  expect(view.container.querySelectorAll('[data-trace-kind="tool"]')).toHaveLength(2);
  expect(view.getByText('error · 1')).toBeTruthy();
  expect(JSON.stringify(message)).toBe(before);
});

it.each([
  ['{"pages":[{"title":"Home","id":1}]}', '{\n  "pages": [\n    {\n      "title": "Home",\n      "id": 1\n    }\n  ]\n}'],
  ['{unfinished tool output', '{unfinished tool output'],
  ['<img src=x onerror=alert(1)>', '<img src=x onerror=alert(1)>'],
])('formats output on demand without altering provider data: %s', (content, expected) => {
  const result = { kind: 'tool_result' as const, toolUseId: 'read', content, isError: false };
  const before = JSON.stringify(result);
  const view = render(<ToolCard use={{ kind: 'tool_use', id: 'read', name: 'read_page', input: {} }} result={result} />);
  expect(view.container.querySelector('pre')).toBeNull();
  fireEvent.click(view.getByRole('button'));
  expect(view.container.querySelector('pre')?.textContent).toBe(expected);
  expect(view.container.querySelector('img')).toBeNull();
  expect(JSON.stringify(result)).toBe(before);
});

it('bounds large tool output and keeps closed details out of keyboard navigation', () => {
  const content = JSON.stringify({ text: 'a'.repeat(100_000) });
  const view = render(<ToolCard use={{ kind: 'tool_use', id: 'read', name: 'read_page', input: {} }}
    result={{ kind: 'tool_result', toolUseId: 'read', content, isError: false }} />);
  fireEvent.click(view.getByRole('button'));
  expect(view.container.querySelector('pre')?.textContent).toBe(content.slice(0, 3999) + '…');
  fireEvent.click(view.getByRole('button'));
  expect(view.container.querySelector('pre')).toBeNull();
});

it.each([{}, []])('omits an empty generic tool input instead of displaying JSON punctuation', input => {
  const view = render(<AssistantMessage projectId={null} streaming={false} message={{
    id: 'empty-input', role: 'assistant', content: '', runStatus: 'succeeded', events: [
      {kind: 'tool_use', id: 'empty', name: 'wordpress.settings.get', input},
      {kind: 'tool_result', toolUseId: 'empty', content: 'Read confirmed', isError: false},
    ],
  }} />);
  fireEvent.click(view.container.querySelector('[data-activity-group] > button')!);
  expect(view.container.querySelector('[data-trace-kind="tool"] [data-slot="trace-description"]')).toBeNull();
});
const scenarios = [
  { agentId: 'codex', mode: 'cli', tool: 'functions.exec_command' },
  { agentId: 'claude', mode: 'cli', tool: 'Bash' },
  { agentId: 'openai', mode: 'api', tool: 'read_page' },
  { agentId: 'anthropic', mode: 'api', tool: 'read_page' },
];

// Both transports feed this same persisted-event contract. Do not key UI
// capability on model names: a run can omit optional data or expose new tools.
for (const surface of ['workspace', 'floating'] as const) {
  it.each(scenarios)(`${surface}: streams and reloads $mode/$agentId without inventing optional data`, scenario => {
    const events: AgentEvent[] = [{ kind: 'text', text: 'Checking the page.' }];
    const message = (running: boolean): ChatMessage => ({
      id: 'trace-run', role: 'assistant', agentId: scenario.agentId,
      content: '', runStatus: running ? 'running' : 'succeeded',
      startedAt: 1000, ...(!running ? { endedAt: 2000 } : {}), events: [...events],
    });
    const tree = (m: ChatMessage, streaming: boolean) => surface === 'workspace'
      ? <AssistantMessage message={m} streaming={streaming} projectId={null} />
      : <SharedChatRows messages={[m]} t={key => key} />;
    const view = render(tree(message(true), true));
    expect(view.container.querySelector('[data-slot="message"]')).not.toBeNull();
    expect(view.container.querySelector('[data-trace-kind="reasoning"]')).toBeNull();
    expect(view.container.querySelector('[data-activity-group]')).toBeNull();
    events.push({ kind: 'thinking', text: 'Checking the supplied page structure.' });
    view.rerender(tree(message(true), true));
    expect(view.container.querySelector('[data-activity-group] > button')).toBeNull();
    expect(view.container.querySelector('[data-trace-kind="reasoning"] > button')?.getAttribute('aria-expanded')).toBe('true');
    expect(view.container.querySelector('[data-trace-kind="reasoning"]')).not.toBeNull();
    events.push({ kind: 'tool_use', id: 'read-1', name: scenario.tool, input: { command: 'read-only inspection' } });
    view.rerender(tree(message(true), true));
    expect(view.container.querySelector('[data-trace-kind="tool"] [data-status="running"]')).not.toBeNull();
    expect(view.container.querySelector('[data-trace-kind="reasoning"] [data-status="running"]')).toBeNull();
    events.push({ kind: 'tool_result', toolUseId: 'read-1', content: 'PAGE_READ_CONFIRMED', isError: false });
    events.push({ kind: 'text', text: 'The page is ready.' });
    const saved = JSON.stringify(message(false));
    view.rerender(tree(JSON.parse(saved), false));
    expect(view.container.querySelector('[data-activity-group] > button')?.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(view.container.querySelector('[data-activity-group] > button')!);
    expect(view.container.querySelector('[data-status="running"]')).toBeNull();
    const toggle = view.container.querySelector('[data-trace-kind="tool"] > button')!;
    fireEvent.click(toggle);
    expect(view.getByText('PAGE_READ_CONFIRMED')).toBeTruthy();
    expect(view.getByText('The page is ready.')).toBeTruthy();
    expect(JSON.stringify(message(false))).toBe(saved);
    view.unmount();
    const restored = render(tree(JSON.parse(saved), false));
    expect(restored.getByText('The page is ready.')).toBeTruthy();
    expect(restored.container.querySelector('[data-status="running"]')).toBeNull();
    expect(restored.queryByText('PAGE_READ_CONFIRMED')).toBeNull();
  });
}

it('keeps unknown CLI tools inspectable without treating their output as HTML', () => {
  const view = render(<AssistantMessage projectId={null} streaming={false} message={{
    id: 'unknown', role: 'assistant', content: '', runStatus: 'failed', events: [
      {kind:'tool_use',id:'u',name:'new_provider_tool',input:{}},
      {kind:'tool_result',toolUseId:'u',content:'<script>unsafe()</script>',isError:true},
    ],
  }} />);
  fireEvent.click(view.container.querySelector('[data-activity-group] > button')!);
  expect(view.container.querySelector('[data-status="error"]')).not.toBeNull();
  fireEvent.click(view.container.querySelector('[data-trace-kind="tool"] > button')!);
  expect(view.getByText('<script>unsafe()</script>')).toBeTruthy();
  expect(view.container.querySelector('script')).toBeNull();
});

it('does not expose empty reasoning or add tools for a text-only saved response', () => {
  const view = render(<AssistantMessage projectId={null} streaming={false} message={{
    id:'plain',role:'assistant',agentId:'claude',content:'Just text',events:[
      {kind:'thinking',text:'   '},{kind:'text',text:'Just text'},
    ],
  }} />);
  expect(view.container.querySelector('[data-activity-group]')).toBeNull();
  expect(view.getByText('Just text')).toBeTruthy();
});

it('shows the Codex edit filename and actual diff from a saved result', () => {
  const diff = '{"paths":["pixflow/design-engine/SKILL.md"]}';
  const changes = [{ path: 'C:\\Bridge\\run-example\\image-skills.json', kind: { type: 'add' }, diff }];
  const view = render(<ToolCard use={{ kind: 'tool_use', id: 'edit', name: 'Edit', input: { changes: [] } }}
    result={{ kind: 'tool_result', toolUseId: 'edit', content: JSON.stringify(changes), isError: false }} />);
  expect(view.getByRole('button').textContent).toContain('image-skills.json');
  fireEvent.click(view.getByRole('button'));
  expect(view.getByText(diff)).toBeTruthy();
  expect(view.container.textContent).not.toContain('(unnamed)');
});

it('folds consecutive successful commands while leaving the failed command visible', () => {
  const events: AgentEvent[] = ['first','second','failed'].flatMap((id): AgentEvent[] => [
    {kind:'tool_use',id,name:'Bash',input:{command:id}},
    {kind:'tool_result',toolUseId:id,content:id,isError:id==='failed'},
  ]);
  const view = render(<AssistantMessage projectId={null} streaming={false} message={{id:'commands',role:'assistant',events,content:'',runStatus:'succeeded'}} />);
  fireEvent.click(view.container.querySelector('[data-activity-group] > button')!);
  const batch = view.getByRole('button', { name:/Ran commands.*2/ });
  expect(batch.getAttribute('aria-expanded')).toBe('false');
  expect(view.getAllByRole('button', {name:/Terminal/})).toHaveLength(1);
  fireEvent.click(batch);
  expect(view.getAllByRole('button', {name:/Terminal/})).toHaveLength(3);
});
it('unmounts closed Trace details by default and mounts them when opened', () => {
  const view = render(<TraceCollapsible><TraceCollapsibleTrigger>Details</TraceCollapsibleTrigger>
    <TraceCollapsibleContent><a href="#report">Report</a></TraceCollapsibleContent></TraceCollapsible>);
  expect(view.queryByText('Report')).toBeNull();
  fireEvent.click(view.getByRole('button'));
  expect(view.getByRole('link', {name:'Report'})).toBeTruthy();
});
