// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ToolCard } from '../../src/components/ToolCard';
import { ActivityDisclosure } from '../../src/components/chat/ActivityDisclosure';
import { readTestSuites } from '../../src/components/chat/StreamToolResult';
import { PlanCard } from '../../src/components/chat/Plan';

afterEach(cleanup);

it.each(['Bash', 'functions.exec_command', 'run_shell_command', 'run_command'])(
  'uses the same terminal composition and completion behaviour for %s', name => {
    const use = { kind: 'tool_use' as const, id: 'shell', name, input: { command: 'echo ready' } };
    const view = render(<ToolCard use={use} runStreaming />);
    expect(view.container.querySelector('[data-trace-kind=terminal]')).toBeTruthy();
    expect(view.getByRole('button').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(view.getByRole('button'));
    expect(view.container.querySelector('pre > code')?.textContent).toBe('echo ready');
    expect(view.container.querySelector('pre pre')).toBeNull();
    view.rerender(<ToolCard use={use} runSucceeded result={{kind:'tool_result',toolUseId:'shell',content:'ready',isError:false}} />);
    expect(view.getByRole('button').getAttribute('aria-expanded')).toBe('true');
    expect(view.container.querySelector('[data-status=running]')).toBeNull();
    expect(view.getByText('ready')).toBeTruthy();
    expect(view.container.querySelector('.op-card,.op-status,.op-output')).toBeNull();
  });

it('honours a manual collapse across stream updates', () => {
  const view = render(<ActivityDisclosure label="Reviewing" active>{() => <span>Step</span>}</ActivityDisclosure>);
  fireEvent.click(view.getByRole('button'));
  fireEvent.click(view.getByRole('button'));
  view.rerender(<ActivityDisclosure label="Checking" active>{() => <span>Next step</span>}</ActivityDisclosure>);
  expect(view.getByRole('button').getAttribute('aria-expanded')).toBe('false');
});

it('renders explicit test suites and failures without inventing a pass for unknown payloads', () => {
  expect(readTestSuites('{"suites":[{"name":"broken","tests":[{"name":"x","status":"maybe"}]}]}')).toBeNull();
  const view = render(<ToolCard use={{kind:'tool_use',id:'tests',name:'runTests',input:{}}}
    result={{kind:'tool_result',toolUseId:'tests',isError:false,content:JSON.stringify({suites:[{name:'Links',tests:[
      {name:'Internal links',status:'passed'}, {name:'Contact link',status:'failed',error:'Missing destination'},
    ]}]})}} />);
  fireEvent.click(view.getByRole('button'));
  expect(view.container.querySelector('[data-trace-kind=test-results]')).toBeTruthy();
  expect(view.getByText('1/2')).toBeTruthy();
  fireEvent.click(view.getByText('Contact link'));
  expect(view.getByText('Missing destination')).toBeTruthy();
});

it('uses a stack trace for actual stack frames and a subagent disclosure for delegated work', () => {
  const view = render(<ToolCard use={{kind:'tool_use',id:'agent',name:'Task',input:{description:'Review the page'}}}
    result={{kind:'tool_result',toolUseId:'agent',isError:true,content:'TypeError: missing page\n    at review (page.ts:12:2)'}} />);
  expect(view.container.querySelector('[data-trace-kind=subagent]')).toBeTruthy();
  fireEvent.click(view.getByRole('button'));
  expect(view.container.querySelector('[data-trace-kind=stack-trace]')).toBeTruthy();
  expect(view.container.querySelector('[data-variant=destructive]')).toBeTruthy();
});

it('renders the saved plan with nested Trace steps and no retired task-card markup', () => {
  const view = render(<PlanCard input={{title:'Build the page',todos:[{content:'Plan',status:'completed'},{content:'Build',status:'in_progress'}]}} runStreaming runSucceeded={false} />);
  expect(view.container.querySelectorAll('[data-slot=trace]')).toHaveLength(2);
  expect(view.container.querySelectorAll('[role=listitem]')).toHaveLength(2);
  expect(view.container.querySelector('.op-todo,.todo-list,.todo-item')).toBeNull();
});


it('keeps activity collapsed through tool start, completion and subsequent tools until the user expands it', () => {
  const draw = (active: boolean) => <ActivityDisclosure label="Inspecting" active={active}>{() => <span>Tool details</span>}</ActivityDisclosure>;
  const view = render(draw(false));
  const expanded = () => view.getByRole('button').getAttribute('aria-expanded');
  expect(expanded()).toBe('false');
  for (const active of [true, false, true, false]) {
    view.rerender(draw(active));
    expect(expanded()).toBe('false');
  }
  fireEvent.click(view.getByRole('button'));
  for (const active of [true, false, true]) {
    view.rerender(draw(active));
    expect(expanded()).toBe('true');
  }
  fireEvent.click(view.getByRole('button'));
  view.rerender(draw(false));
  view.rerender(draw(true));
  expect(expanded()).toBe('false');
});


it('keeps a running tool closed when its result arrives without a user click', () => {
  const use = { kind: 'tool_use' as const, id: 'shell', name: 'Bash', input: { command: 'echo ready' } };
  const view = render(<ToolCard use={use} runStreaming />);
  expect(view.getByRole('button').getAttribute('aria-expanded')).toBe('false');
  view.rerender(<ToolCard use={use} runSucceeded result={{kind:'tool_result',toolUseId:'shell',content:'ready',isError:false}} />);
  expect(view.getByRole('button').getAttribute('aria-expanded')).toBe('false');
});
