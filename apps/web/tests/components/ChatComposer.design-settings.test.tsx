// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatComposer } from '../../src/components/ChatComposer';
import { composerText, typeAndSettle, pressEnter } from '../helpers/lexical-composer';
vi.mock('../../src/pixflow/feature-runtime',async importOriginal=>({...await importOriginal<typeof import('../../src/pixflow/feature-runtime')>(),pixflowFeatureConfiguration:()=>({operations:['audit','critique','polish','typeset','layout','colorize','clarify','harden','adapt','optimize']}), usePixflowFeatureAsset:()=>({}),pixflowFeatureEnabled:()=>true}));
vi.mock('../../src/pixflow/planning-availability',()=>({planningAvailable:()=>true}));
vi.mock('../../src/pixflow/composer-guidance-references',()=>({loadComposerGuidanceReferences:async()=>[
 {id:'pixflow-guidance:PRODUCT.md',kind:'design-system',label:'PRODUCT.md',content:'Saved product facts'},
 {id:'pixflow-guidance:DESIGN.md',kind:'design-system',label:'DESIGN.md',content:'Saved design rules'},
 {id:'pixflow-design-system:brand',kind:'design-system',label:'Brand system',content:'Saved tokens'},
]}));
afterEach(()=>{cleanup();history.replaceState(null,'','/');sessionStorage.clear();});
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
 fireEvent.click(await screen.findByRole('option',{name:new RegExp('/design '+operation)}));
 expect(send).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();expect(composerText()).toContain('/design '+operation);
});
