// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PixflowContextPicker, type ContextPickerHandle } from '../../src/components/PixflowContextPicker';
import { searchComposerSiteContext } from '../../src/pixflow/composer-context-search';
vi.mock('../../src/pixflow/composer-context-search',()=>({searchComposerSiteContext:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();delete (window as any).PixflowPlanningFactory;});
const base = {query:'',files:[],contexts:[],onFile:vi.fn(),onContext:vi.fn(),onUpload:vi.fn(),onClose:vi.fn()};
describe('Pixflow context picker',()=>{
 it('offers saved design systems as coloured references without applying them',async()=>{
   (window as any).PixflowPlanningFactory = () => ({});
   const item={id:'pixflow-design-system:pds-abcdef123456',kind:'design-system' as const,label:'Coastal',title:'Ocean blue',accentColor:'#173f4f',content:'{"scope":"reference"}'};
   vi.mocked(searchComposerSiteContext).mockResolvedValue([item]);
   render(<PixflowContextPicker {...base}/>);
   fireEvent.click(screen.getByRole('option',{name:/Design systems/}));
   const row=await screen.findByRole('option',{name:/Coastal/});
   expect(row.querySelector('span')?.style.backgroundColor).toBe('rgb(23, 63, 79)');
   fireEvent.click(row);
   expect(base.onContext).toHaveBeenCalledWith(item);
   expect(searchComposerSiteContext).toHaveBeenCalledWith('systems','',expect.any(AbortSignal));
 });
 it('always offers files, including on an empty conversation, without skills or plugins',()=>{
   render(<PixflowContextPicker {...base}/>);
   expect(screen.queryByRole('option',{name:/Design systems/})).toBeNull();
   expect(screen.getByRole('option',{name:/Files/})).toBeTruthy();
   expect(screen.queryByRole('tab',{name:'Skills'})).toBeNull();
   fireEvent.click(screen.getByRole('option',{name:/Files/}));
   fireEvent.click(screen.getByRole('option',{name:/Upload files/}));
   expect(base.onUpload).toHaveBeenCalledOnce();
 });
 it('uses keyboard navigation to enter a category and return without closing the picker',()=>{
   const ref=createRef<ContextPickerHandle>();render(<PixflowContextPicker {...base} ref={ref}/>);
   act(()=>{ref.current?.key('Enter');});
   expect(screen.getByRole('combobox',{name:'Search files…'})).toBeTruthy();
   fireEvent.keyDown(screen.getByRole('combobox'),{key:'Escape'});
   expect(screen.getByRole('option',{name:/Pages & posts/})).toBeTruthy();
   expect(base.onClose).not.toHaveBeenCalled();
 });
 it('attaches the chosen draft reference with its identity and shows no repeated badges',async()=>{
   const page={id:'wordpress:pages:9',kind:'browser' as const,label:'Workshop',title:'Page · draft',content:'{"id":9}'};
   vi.mocked(searchComposerSiteContext).mockResolvedValue([page]);
   render(<PixflowContextPicker {...base}/>);
   fireEvent.click(screen.getByRole('option',{name:/Pages & posts/}));
   await waitFor(()=>expect(screen.getByRole('option',{name:/Workshop/})).toBeTruthy());
   fireEvent.click(screen.getByRole('option',{name:/Workshop/}));
   expect(base.onContext).toHaveBeenCalledWith(page);
   expect(document.querySelector('.mention-item-kind')).toBeNull();
 });
});
