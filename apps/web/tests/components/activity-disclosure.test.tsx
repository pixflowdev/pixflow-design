// @vitest-environment jsdom
import { cleanup, fireEvent, render, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ActivityDisclosure, groupActivity } from '../../src/components/chat/ActivityDisclosure';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import { SharedChatRows } from '../../src/components/shared-chat/SharedChatRows';
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('renders the shared Workspace and floating-panel rows with the real activity accordion', () => {
  const ui = render(<SharedChatRows t={key => key} messages={[{
    id: 'shared-command', role: 'assistant', content: 'Checked the files.', runStatus: 'succeeded', endedAt: 20,
    events: [
      { kind: 'thinking', text: 'Checking the relevant files.' },
      { kind: 'tool_use', id: 'read-only', name: 'Bash', input: { command: 'echo checked' } },
      { kind: 'tool_result', toolUseId: 'read-only', content: 'checked', isError: false },
      { kind: 'text', text: 'Checked the files.' },
    ],
  }]} />);
  const toggle = ui.container.querySelector<HTMLButtonElement>('[data-activity-group] > button')!;
  expect(toggle).toBeTruthy();
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(ui.queryByText('echo checked')).toBeNull();
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(ui.getByText('echo checked')).toBeTruthy();
  expect(ui.getByText('Checked the files.')).toBeTruthy();
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
});

it('groups mixed activity only between standalone messages', () => {
  expect(groupActivity(['prose','thinking','command','prose','search','error'], x => ['thinking','command','search'].includes(x)))
    .toEqual([{start:0,grouped:false,blocks:['prose']},{start:1,grouped:true,blocks:['thinking','command']},
      {start:3,grouped:false,blocks:['prose']},{start:4,grouped:true,blocks:['search']},{start:5,grouped:false,blocks:['error']}]);
});

it('keeps details lazy, retains the user toggle while streaming and removes hidden focus targets after closing', () => {
  vi.useFakeTimers();
  const body = () => <a href="#details">Details</a>;
  const ui = render(<ActivityDisclosure label="Reading" icon="read" active>{body}</ActivityDisclosure>);
  expect(ui.queryByText('Details')).toBeNull();
  fireEvent.click(ui.getByRole('button'));
  expect(ui.getByRole('link')).toBeTruthy();
  ui.rerender(<ActivityDisclosure label="Running" icon="command" active>{body}</ActivityDisclosure>);
  expect(ui.getByRole('button').getAttribute('aria-expanded')).toBe('true');
  expect(ui.getByRole('button').textContent).toBe('Reading');
  expect(ui.container.querySelector('[data-activity-icon="read"]')).toBeTruthy();
  act(() => vi.advanceTimersByTime(1000));
  expect(ui.getByRole('button').textContent).toBe('Running');
  expect(ui.container.querySelector('[data-activity-icon="command"]')).toBeTruthy();
  ui.rerender(<ActivityDisclosure label="Done" active={false}>{body}</ActivityDisclosure>);
  expect(ui.getByRole('button').textContent).toBe('Done');
  expect(ui.container.querySelector('[data-active="false"]')).toBeTruthy();
  fireEvent.click(ui.getByRole('button'));
  expect(ui.container.querySelector('[inert]')).toBeTruthy();
  act(() => vi.advanceTimersByTime(160));
  expect(ui.queryByText('Details')).toBeNull();
});

it('keeps failed tool details inside activity while exposing an error summary', () => {
  const ui = render(<AssistantMessage projectId={null} streaming={false} message={{id:'activity',role:'assistant',content:'',events:[
    {kind:'text',text:'Starting the work.'},{kind:'thinking',text:'Private detail'},
    {kind:'tool_use',id:'a',name:'Bash',input:{command:'echo ok'}},{kind:'tool_result',toolUseId:'a',content:'ok',isError:false},
    {kind:'tool_use',id:'b',name:'Read',input:{file_path:'file.txt'}},{kind:'tool_result',toolUseId:'b',content:'read',isError:false},
    {kind:'text',text:'Next step.'},{kind:'tool_use',id:'c',name:'Bash',input:{command:'bad'}},
    {kind:'tool_result',toolUseId:'c',content:'Failed visibly',isError:true},
  ]}} />);
  expect(ui.container.querySelectorAll('[data-activity-group]')).toHaveLength(2);
  expect(ui.container.querySelector('[data-activity-icon="mixed"]')).toBeTruthy();
  expect(ui.getByText('Starting the work.')).toBeTruthy();
  expect(ui.getByText('Next step.')).toBeTruthy();
  expect(ui.queryByText('Failed visibly')).toBeNull();
  expect(ui.getByText('error · 1')).toBeTruthy();
  fireEvent.click(ui.getByText('error · 1').closest('button')!);
  expect(ui.getByText('Failed visibly')).toBeTruthy();
  expect([...ui.container.querySelectorAll('.action-card-toggle')].every(node => node.closest('[data-activity-group]'))).toBe(true);
  expect(ui.container.textContent).not.toContain('Private detail');
});

it('keeps a failed command and its running retry in the same shimmer group', () => {
  const ui = render(<AssistantMessage projectId={null} streaming message={{id:'retry',role:'assistant',content:'',events:[
    {kind:'tool_use',id:'a',name:'Bash',input:{command:'first'}},
    {kind:'tool_result',toolUseId:'a',content:'Transient failure',isError:true},
    {kind:'tool_use',id:'b',name:'Bash',input:{command:'retry'}},
  ]}} />);
  expect(ui.container.querySelectorAll('[data-activity-group][data-active="true"]')).toHaveLength(1);
  expect(ui.container.querySelector('.action-card-toggle')).toBeNull();
  expect(ui.getByText('Running a command')).toBeTruthy();
  expect(ui.getByText('error · 1')).toBeTruthy();
});

it.each([
  ['Bash', 'command'], ['mcp__browser__click', 'browser'], ['Edit', 'edit'],
  ['Read', 'read'], ['Grep', 'search'], ['unknown_tool', 'tools'],
])('uses the same activity identity while running and completed: %s', (name, icon) => {
  const event = {kind:'tool_use' as const, id:'icon-tool', name, input:{}};
  const ui = render(<AssistantMessage projectId={null} streaming message={{id:'icon',role:'assistant',content:'',events:[event]}} />);
  expect(ui.container.querySelector(`[data-activity-icon="${icon}"]`)).toBeTruthy();
  ui.rerender(<AssistantMessage projectId={null} streaming={false} message={{id:'icon',role:'assistant',content:'',events:[event,
    {kind:'tool_result',toolUseId:'icon-tool',content:'ok',isError:false},
  ]}} />);
  expect(ui.container.querySelector(`[data-activity-icon="${icon}"]`)).toBeTruthy();
});
