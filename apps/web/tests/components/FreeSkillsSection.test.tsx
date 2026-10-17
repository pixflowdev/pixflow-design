// @vitest-environment jsdom
import {cleanup, render, screen, waitFor, fireEvent} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {SkillsSection} from '../../src/components/SkillsSection';
import {I18nProvider} from '../../src/i18n';
import type {AppConfig} from '../../src/types';
vi.mock('../../src/providers/registry', () => ({
  fetchSkill: async () => ({body:'Core instructions'}),
}));
vi.mock('../../src/pixflow/runtime-fetch', () => ({pixflowRuntimeFetch: async () => new Response(JSON.stringify({skills:[{id:'core',name:'WordPress content',description:'Core editing',source:'built-in'}, {id:'personal',name:'Private brand',source:'user'}],lockedSkills:[{id:'gsap-core',name:'GSAP Core',description:'Motion guidance',requiresPro:true}]}))}));
afterEach(cleanup);
it('keeps built-in skills and preferences available without exposing stored personal skills or authoring', async () => {
  const setCfg=vi.fn();
  render(<I18nProvider><SkillsSection cfg={{disabledSkills:[]} as unknown as AppConfig} setCfg={setCfg}/></I18nProvider>);
  await screen.findByText('WordPress content');
  expect(screen.queryByText('Private brand')).toBeNull();
  expect(screen.queryByText(/new skill|import|create skill/i)).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'WordPress content'}));
  await waitFor(()=>expect(screen.getByText('Core instructions')).toBeTruthy());
  fireEvent.click(screen.getByRole('checkbox',{name:'WordPress content'}));
  expect(setCfg.mock.calls[0]![0]({disabledSkills:[]})).toEqual({disabledSkills:['core']});
});

it('shows locked Pro skill metadata without a toggle or an instruction-reading button', async () => {
  render(<I18nProvider><SkillsSection cfg={{disabledSkills:[]} as unknown as AppConfig} setCfg={vi.fn()}/></I18nProvider>);
  const title=await screen.findByText('GSAP Core');
  expect(title.closest('article')?.getAttribute('aria-disabled')).toBe('true');
  expect(screen.getByText('Pro')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'GSAP Core'})).toBeNull();
  expect(screen.queryByRole('checkbox',{name:'GSAP Core'})).toBeNull();
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'motion'}});
  expect(screen.getByText('GSAP Core')).toBeTruthy();
  expect(screen.queryByText('WordPress content')).toBeNull();
});
