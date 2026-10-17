// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatComposer } from '../../src/components/ChatComposer';
import { composerText, typeAndSettle } from '../helpers/lexical-composer';

beforeEach(()=>vi.stubGlobal('fetch',vi.fn(async()=>new Response('[]'))));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function mount(available=true) {
  const open=vi.fn(),send=vi.fn();
  render(<ChatComposer projectId="project" projectFiles={[]} streaming={false} onEnsureProject={async()=> 'project'} onSend={send} onStop={()=>{}} onOpenBuilderHandoff={available?open:undefined}/>);
  return {open,send};
}
it('opens the shared destination selector from the explicit slash choice without sending a run',async()=>{
  const {open,send}=mount();
  await typeAndSettle('/hand');
  fireEvent.click(await screen.findByRole('option',{name:/\/handoff/}));
  expect(open).toHaveBeenCalledOnce();
  expect(send).not.toHaveBeenCalled();
  expect(composerText().trim()).toBe('');
});
it('handles a typed exact command through the same selector',async()=>{
  const {open,send}=mount();
  await typeAndSettle('/handoff');
  fireEvent.click(screen.getByTestId('chat-send'));
  expect(open).toHaveBeenCalledOnce();
  expect(send).not.toHaveBeenCalled();
});
it('leaves natural requests and command arguments to the agent instead of guessing intent',async()=>{
  const {open,send}=mount();
  await typeAndSettle('Could we handoff to Bricks after reviewing this?');
  fireEvent.click(screen.getByTestId('chat-send'));
  await waitFor(()=>expect(send).toHaveBeenCalledOnce());
  expect(open).not.toHaveBeenCalled();
  expect(send.mock.calls[0]?.[0]).toBe('Could we handoff to Bricks after reviewing this?');
});
it('does not expose the shortcut outside a handoff-enabled Workspace',async()=>{
  mount(false);await typeAndSettle('/hand');
  expect(screen.queryByRole('option',{name:/\/handoff/})).toBeNull();
});
