// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage } from '../../src/types';

afterEach(cleanup);
it.each(['compacting', 'Compacting working context'])('shows %s as transient working status without changing the reply', label => {
  const message: ChatMessage = { id:'summary-status', role:'assistant', content:'Existing answer.', startedAt:Date.now(), events:[{kind:'text',text:'Existing answer.'},{kind:'status',label}] };
  const props = {projectId:'qa',message,streaming:true,onFeedback:vi.fn()};
  const view=render(<AssistantMessage {...props}/>);
  expect(screen.getByText('Compacting context…')).toBeTruthy();
  expect(screen.getByText('Existing answer.')).toBeTruthy();
  expect(view.container.querySelector('.status-pill')).toBeNull();
  view.rerender(<AssistantMessage {...props} message={{...message,events:[...message.events!,{kind:'status',label:'thinking'}]}}/>);
  expect(screen.queryByText('Compacting context…')).toBeNull();
  view.rerender(<AssistantMessage {...props} streaming={false} message={{...message,endedAt:Date.now(),runStatus:'succeeded'}}/>);
  expect(screen.queryByText('Compacting context…')).toBeNull();
  expect(screen.getByText('Existing answer.')).toBeTruthy();
});
