// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SearchableModelSelect } from '../../src/components/modelOptions';
vi.mock('../../src/i18n', () => ({ useT: () => (key: string) => key }));
afterEach(cleanup);

it('searches models, preserves unavailable entries, selects once and closes', async () => {
  const change = vi.fn();
  render(<SearchableModelSelect models={[{id:'a',label:'Alpha'}, {id:'b',label:'Beta'}, {id:'c',label:'Blocked',enabled:false}]} value="a" onChange={change} aria-label="Model" searchPlaceholder="Find model" minSearchableOptions={1} />);
  fireEvent.click(screen.getByRole('combobox', {name:'Model'}));
  const input = await screen.findByRole('combobox', {name:'Find model'});
  fireEvent.change(input, {target:{value:'B'}});
  expect(screen.getByRole('option', {name:/Blocked/}).getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(screen.getByRole('option', {name:'Beta'}));
  expect(change).toHaveBeenCalledExactlyOnceWith('b');
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
});

it('opens with keyboard and Escape restores focus without changing the model', async () => {
  const change = vi.fn();
  render(<SearchableModelSelect models={[{id:'a',label:'Alpha'}, {id:'b',label:'Beta'}]} value="a" onChange={change} aria-label="Model" searchPlaceholder="Find model" />);
  const trigger=screen.getByRole('combobox', {name:'Model'});
  trigger.focus(); fireEvent.keyDown(trigger,{key:'ArrowDown'});
  await screen.findByRole('listbox');
  fireEvent.keyDown(trigger,{key:'Escape'});
  await waitFor(()=>expect(screen.queryByRole('listbox')).toBeNull());
  expect(change).not.toHaveBeenCalled(); expect(document.activeElement).toBe(trigger);
});
