// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatComposer } from '../../src/components/ChatComposer';
import { composerText, typeAndSettle, pressEnter, getComposerEditor } from '../helpers/lexical-composer';
import { $getRoot, $isRangeSelection } from 'lexical';
vi.mock('../../src/pixflow/feature-runtime',async importOriginal=>({...await importOriginal<typeof import('../../src/pixflow/feature-runtime')>(),pixflowFeatureConfiguration:()=>({operations:['audit','critique','polish','typeset','layout','colorize','clarify','harden','adapt','optimize']}), usePixflowFeatureAsset:()=>({}),pixflowFeatureEnabled:()=>true}));
vi.mock('../../src/pixflow/planning-availability',()=>({planningAvailable:()=>true}));
vi.mock('../../src/pixflow/composer-guidance-references',()=>({loadComposerGuidanceReferences:async()=>[
 {id:'pixflow-guidance:PRODUCT.md',kind:'design-system',label:'PRODUCT.md',content:'Saved product facts'},
 {id:'pixflow-guidance:DESIGN.md',kind:'design-system',label:'DESIGN.md',content:'Saved design rules'},
 {id:'pixflow-design-system:brand',kind:'design-system',label:'Brand system',content:'Saved tokens'},
]}));
afterEach(()=>{cleanup();history.replaceState(null,'','/');sessionStorage.clear();});
it.each(['Please help me ', 'Please help me\n', '  '])('opens an inline slash menu after %j and preserves surrounding text',async prefix=>{
 const open=vi.fn(),send=vi.fn();
 render(<ChatComposer projectId="p" projectFiles={[]} streaming={false} onEnsureProject={async()=> 'p'} onSend={send} onStop={()=>{}} onOpenSettings={open}/>);
 await typeAndSettle(prefix+'/design-settings');
 fireEvent.click(await screen.findByRole('option',{name:/\/design-settings/}));
 expect(open).toHaveBeenCalledWith('designSystems');expect(send).not.toHaveBeenCalled();
 expect(getComposerEditor().getEditorState().read(()=>$getRoot().getTextContent())).toBe(prefix);
});
it.each(['https://example.com/design','folder/design','word/design'])('does not open slash commands inside %s',async text=>{
 render(<ChatComposer projectId="p" projectFiles={[]} streaming={false} onEnsureProject={async()=> 'p'} onSend={vi.fn()} onStop={()=>{}} onOpenSettings={vi.fn()}/>);
 await typeAndSettle(text);expect(screen.queryByRole('listbox',{name:/slash/i})).toBeNull();expect(screen.queryByRole('option',{name:/\/design-settings/})).toBeNull();
});
for (const selectMenu of [true,false]) it(`opens design settings without sending (${selectMenu?'menu':'typed'})`,async()=>{
 const open=vi.fn(),send=vi.fn();
 render(<ChatComposer projectId="p" projectFiles={[]} streaming={false} onEnsureProject={async()=> 'p'} onSend={send} onStop={()=>{}} onOpenSettings={open}/>);
 await typeAndSettle('/design-settings');
 if(selectMenu) fireEvent.click(await screen.findByRole('option',{name:/\/design-settings/}));
 else fireEvent.click(screen.getByTestId('chat-send'));
 expect(open).toHaveBeenCalledWith('designSystems');expect(send).not.toHaveBeenCalled();expect(composerText().trim()).toBe('');
});

it.each(['PRODUCT.md','DESIGN.md','Brand system'])('sends the selected %s snapshot through shared context metadata',async label=>{
 history.replaceState(null,'','/?pixflowWpVersion=2.0.3');const send=vi.fn();
 render(<ChatComposer projectId="p" projectFiles={[]} streaming={false} onEnsureProject={async()=> 'p'} onSend={send} onStop={()=>{}}/>);
 await typeAndSettle('@'+label.split(' ')[0]);fireEvent.click(await screen.findByRole('option',{name:new RegExp(label.replace('.', '\\.'))}));
 await pressEnter();await waitFor(()=>expect(send).toHaveBeenCalledOnce());
 expect(send.mock.calls[0]![3].context.workspaceItems).toEqual([expect.objectContaining({label,content:expect.stringContaining('Saved')})]);
});
it.each(['audit','critique','polish','typeset','layout','colorize','clarify','harden','adapt','optimize'])('selects /design %s without prematurely sending or changing settings',async operation=>{
 history.replaceState(null,'','/?pixflowWpVersion=2.0.3');const send=vi.fn(),open=vi.fn();
 render(<ChatComposer projectId="p" projectFiles={[]} streaming={false} onEnsureProject={async()=> 'p'} onSend={send} onStop={()=>{}} onOpenSettings={open}/>);
 await typeAndSettle('/design');
 fireEvent.click(await screen.findByRole('option',{name:new RegExp('^Design '+operation, 'i')}));
 expect(send).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();
 expect(document.querySelector('.composer-inline-mention--skill')?.textContent).toBe('Design '+operation[0]!.toUpperCase()+operation.slice(1));
});

it('sends inline design skill tokens verbatim, including restored draft commands', async () => {
 history.replaceState(null,'','/?pixflowWpVersion=2.0.3');
 const send=vi.fn();
 render(<ChatComposer projectId="p" projectFiles={[]} streaming={false} onEnsureProject={async()=> 'p'} onSend={send} onStop={()=>{}} initialDraft="Improve the footer using /design layout and " />);
 await waitFor(() => expect(document.querySelector('.composer-inline-mention--skill')?.textContent).toBe('Design Layout'));
 act(() => getComposerEditor().update(() => {
   const selection = $getRoot().selectEnd();
   if ($isRangeSelection(selection)) selection.insertText('/design');
 }, { discrete: true }));
 const critique = await screen.findByRole('option', { name: /^Design Critique/ });
 expect(critique.closest('[role="listbox"]')?.textContent).toContain('Skills');
 expect(critique.querySelector('.tabler-icon-packages')).not.toBeNull();
 fireEvent.click(critique);
 expect(Array.from(document.querySelectorAll('.composer-inline-mention--skill'), node => node.textContent))
   .toEqual(['Design Layout', 'Design Critique']);
 expect(composerText().trim()).toBe('Improve the footer using Design Layout and Design Critique');
 fireEvent.click(screen.getByTestId('chat-send'));
 await waitFor(() => expect(send).toHaveBeenCalledOnce());
 expect(send.mock.calls[0]?.[0]).toBe('Improve the footer using /design layout and /design critique');
 expect(send.mock.calls[0]?.[3]?.context?.skillMentions).toEqual([
   { start: 25, token: '/design layout', label: 'Design Layout' },
   { start: 44, token: '/design critique', label: 'Design Critique' },
 ]);
});
