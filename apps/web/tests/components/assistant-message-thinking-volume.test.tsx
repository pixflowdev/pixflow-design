// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';

afterEach(cleanup);
it('keeps malformed protocol out of answer and thinking while preserving literal examples',()=>{
  const text='Before <od-card>{"type":"unknown"}</od-card> after';
  const {container}=render(<AssistantMessage streaming={false} projectId={null} message={{id:'rich',role:'assistant',content:text,events:[{kind:'thinking',text},{kind:'text',text}]}} />);
  fireEvent.click(container.querySelector('[data-activity-group] button')!);
  fireEvent.click(container.querySelector('.thinking-toggle')!);
  expect(container.querySelector('.thinking-body')!.textContent).toContain('Before  after');
  expect(container.querySelector('.prose-block')!.textContent).toContain('Before  after');
  expect(container.textContent).not.toContain('"type"');
});
it('keeps large collapsed output out of the DOM until requested and preserves disclosure content on close', () => {
  const text = 'Large canvas response '.repeat(5000) + 'END_OF_CANVAS';
  const { container } = render(<AssistantMessage streaming={false} projectId={null} message={{
    id: 'large-thinking', role: 'assistant', content: '',
    events: [{ kind: 'thinking', text }], startedAt: 1000, endedAt: 2000,
  }} />);
  expect(container.querySelector('.thinking-preview')).toBeNull();
  fireEvent.click(container.querySelector('[data-activity-group] button')!);
  const preview = container.querySelector('.thinking-preview')!;
  expect(preview.textContent!.length).toBeLessThan(600);
  expect(container.querySelector('.thinking-body')!.textContent).toBe('');
  const toggle = container.querySelector('.thinking-toggle')!;
  fireEvent.click(toggle);
  expect(container.querySelector('.thinking-body')!.textContent).toContain('END_OF_CANVAS');
  fireEvent.click(toggle);
  expect(container.querySelector('.thinking-body')!.textContent).toContain('END_OF_CANVAS');
});
