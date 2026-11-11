// @vitest-environment jsdom
import React, {useState} from 'react';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {WorkspaceSelect} from '../../src/components/WorkspaceSelect';

afterEach(cleanup);

it('closes after a selection that changes the surrounding view', async () => {
  const change = vi.fn();
  function View() {
    const [view, setView] = useState('history');
    return <><WorkspaceSelect label="Audit view" value={view}
      options={[{value:'history',label:'History'},{value:'specialists',label:'Specialists'}]}
      onValueChange={value=>{change(value);setView(value);}}/>
      {view==='history'?<section>Long verification history</section>:<section>Specialist controls</section>}</>;
  }
  render(<View/>);
  fireEvent.click(screen.getByRole('combobox',{name:'Audit view'}));
  const option=await screen.findByRole('option',{name:'Specialists'});
  fireEvent.pointerDown(option,{pointerType:'mouse'});
  fireEvent.mouseUp(option);
  fireEvent.click(option);
  await waitFor(()=>expect(screen.queryByRole('listbox')).toBeNull());
  expect(change).toHaveBeenCalledExactlyOnceWith('specialists');
  expect(screen.getByText('Specialist controls')).toBeTruthy();
  expect(screen.getByRole('combobox').getAttribute('aria-expanded')).toBe('false');
});

it('Escape closes without changing the current selection', async () => {
  const change=vi.fn();
  render(<WorkspaceSelect label="Specialist" value="content" options={[{value:'content',label:'Content'}]} onValueChange={change}/>);
  const trigger=screen.getByRole('combobox',{name:'Specialist'});
  fireEvent.click(trigger);
  await screen.findByRole('listbox');
  fireEvent.keyDown(trigger,{key:'Escape'});
  await waitFor(()=>expect(screen.queryByRole('listbox')).toBeNull());
  expect(change).not.toHaveBeenCalled();
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(trigger.textContent).toContain('Content');
});
