// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import { collectMarkdownSources } from '../../src/runtime/markdown';
import type { AgentEvent } from '../../src/types';

afterEach(cleanup);

it('cites a page read through Claude CLI while retaining unrelated navigation links', async () => {
  const view = reply([
    {kind:'tool_use',id:'fetch',name:'Bash',input:{command:"curl -sL --max-time 15 'https://pixflow.co.uk/'"}},
    {kind:'tool_result',toolUseId:'fetch',content:'<title>Pixflow</title>',isError:false},
  ], 'The live [homepage](https://pixflow.co.uk/) title identifies Pixflow. Open the [dashboard](https://pixflow.co.uk/wp-admin/) to edit it.');
  const citation = view.getByRole('button',{name:'homepage (pixflow.co.uk)'});
  expect(view.getByRole('link',{name:'dashboard'})).toBeTruthy();
  fireEvent.click(citation);
  expect((await view.findByRole('link',{name:/pixflow.co.uk ·/})).getAttribute('href')).toBe('https://pixflow.co.uk/');
  expect(view.getByRole('button',{name:'Sources (1)'})).toBeTruthy();
});

it.each([
  ['echo https://pixflow.co.uk/', false],
  ['curl https://pixflow.co.uk/', true],
])('does not turn a printed URL or failed fetch into a source: %s', (command, isError) => {
  const view=reply([{kind:'tool_use',id:'fetch',name:'Bash',input:{command}},
    {kind:'tool_result',toolUseId:'fetch',content:'No evidence',isError}], '[homepage](https://pixflow.co.uk/)');
  expect(view.getByRole('link',{name:'homepage'})).toBeTruthy();
});

const content = 'Check the [dashboard](https://example.org/dashboard) first. The guide explains why. [Source guide](https://example.org/guide?hl=en)';
function reply(events: AgentEvent[], prose = content) {
  return render(<AssistantMessage projectId={null} streaming={false} message={{
    role: 'assistant', id: 'research', content: prose, events: [...events, { kind: 'text', text: prose }],
  }} />);
}

it('opens a saved research citation while keeping the inline navigation link usable', async () => {
  const view = reply([{ kind: 'tool_use', id: 's', name: 'WebSearch', input: { query: 'guidance' } }]);
  expect(view.getByRole('link', { name: 'dashboard' })).toBeTruthy();
  const trigger = view.getByRole('button', { name: /Source guide/ });
  expect(trigger.textContent).toBe('example.org');
  fireEvent.click(trigger);
  expect((await view.findByRole('link', { name: /example.org/ })).getAttribute('href')).toBe('https://example.org/guide?hl=en');
});

it('shows an inline source embedded in a researched sentence', () => {
  const view = reply([{ kind: 'activity', id: 'search', label: 'Searched', origin: 'provider',
    phase: 'researching', status: 'succeeded' }],
    'The official [Media Library documentation](https://wordpress.org/documentation/) explains how to view uploaded media.');
  expect(view.getByRole('button', { name: /Media Library documentation/ })).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: 'Sources (1)' }));
  expect(view.getByRole('link', { name: /Media Library documentation/ }).getAttribute('href'))
    .toBe('https://wordpress.org/documentation/');
});

it('leaves ordinary response links alone when there is no research event', () => {
  const view = reply([]);
  expect(view.getByRole('link', { name: 'Source guide' })).toBeTruthy();
  expect(view.queryByRole('button', { name: /Source guide/ })).toBeNull();
  expect(view.container.querySelector('[data-message-sources]')).toBeNull();
});

it('exposes cited destinations through a separate sources disclosure', () => {
  const view = reply([{ kind: 'activity', id: 'search', label: 'Searched', origin: 'provider', phase: 'researching', status: 'succeeded' }]);
  const toggle = view.getByRole('button', { name: 'Sources (1)', expanded: false });
  fireEvent.click(toggle);
  expect(view.getByRole('button', { name: 'Sources (1)', expanded: true })).toBe(toggle);
  expect(view.getByRole('link', { name: /Source guide · example.org/ }).getAttribute('target')).toBe('_blank');
  fireEvent.click(toggle);
  expect(view.queryByRole('link', { name: /Source guide · example.org/ })).toBeNull();
});

it('counts distinct source URLs in order and excludes examples, images and unsupported schemes', () => {
  const result = collectMarkdownSources([
    'One. [Guide](https://example.org/a)\n\nRepeated. [Another label](https://example.org/a)',
    'Two. [Other](https://example.org/b?q=1)\n\n`Example. [skip](https://example.org/code)`',
    '```md\nA. [skip](https://example.org/fenced)\n```',
    'Image. ![skip](https://example.org/pic)\n\nUnsafe. [skip](javascript:void)',
  ]);
  expect(result.map(({ title, url }) => [title, url.href])).toEqual([
    ['Guide', 'https://example.org/a'], ['Other', 'https://example.org/b?q=1'],
  ]);
});

it('uses real sources from activity steps even without a linked citation in the prose', () => {
  const activity: AgentEvent = { kind: 'activity', id: 'p', origin: 'pixflow', phase: 'researching',
    label: 'Searched', status: 'succeeded', sources: [
      { title: 'Documentation', url: 'https://docs.example.org/start' },
      { title: 'Same page', url: 'https://docs.example.org/start' },
      { title: 'Invalid', url: 'javascript:alert(1)' },
    ] };
  const view = render(<AssistantMessage projectId={null} streaming={false} message={{
    id: 'links', role: 'assistant', content: '', runStatus: 'succeeded',
    events: [activity, { kind: 'text', text: 'The guide confirms this.' }],
  }} />);
  fireEvent.click(view.getByRole('button', { name: 'Sources (1)' }));
  expect(view.getByRole('link', { name: /Documentation/ }).getAttribute('href')).toBe('https://docs.example.org/start');
  fireEvent.click(view.getByRole('button', { name: 'Searched' }));
  const badges = view.container.querySelectorAll('[data-agent-activity-phase="researching"] a');
  expect(badges).toHaveLength(1);
  expect(badges[0]?.textContent).toBe('docs.example.org');
  expect(badges[0]?.getAttribute('href')).toBe('https://docs.example.org/start');
});
