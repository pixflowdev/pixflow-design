// @vitest-environment jsdom
import React from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MediaFolders} from '../../src/components/MediaFolders';
import {mediaFolders,MediaFoldersError} from '../../src/providers/media-folders';
import {en} from '../../src/i18n/locales/en';
vi.mock('../../src/i18n',()=>({useT:()=> (key:keyof typeof en,params:Record<string,string>={})=>Object.entries(params).reduce((text,[name,value])=>text.replaceAll('{'+name+'}',value),en[key])}));
vi.mock('../../src/providers/media-folders',async importOriginal=>({...await importOriginal<typeof import('../../src/providers/media-folders')>(),mediaFolders:vi.fn()}));
const inventory={provider:'pixflow' as const,folders:[{id:1,name:'Parent',parent:0,count:1,position:0},{id:2,name:'Child',parent:1,count:0,position:1}],writable:true,happyfilesAvailable:true,multiple:false};
beforeEach(()=>{vi.mocked(mediaFolders).mockResolvedValue(inventory);window.matchMedia=vi.fn().mockReturnValue({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()});});
afterEach(()=>{cleanup();vi.clearAllMocks();localStorage.clear();});
it('filters a nested folder without altering attachments',async()=>{
 const onScope=vi.fn();render(<MediaFolders scope={{provider:'pixflow',folder:'all'}} onScope={onScope} attachmentIds={[]} onChanged={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:/^Child/}));
 expect(onScope).toHaveBeenCalledWith({provider:'pixflow',folder:2});
 expect(mediaFolders).toHaveBeenCalledTimes(1);
});
it('requires explicit confirmation before deleting a folder',async()=>{
 render(<MediaFolders scope={{provider:'pixflow',folder:2}} onScope={()=>{}} attachmentIds={[]} onChanged={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Options for Child'}));
 fireEvent.click(await screen.findByRole('menuitem',{name:'Delete'}));
 expect(mediaFolders).toHaveBeenCalledTimes(1);
 expect(screen.getByText(/Media files are kept/)).toBeTruthy();
 fireEvent.click(screen.getAllByRole('button',{name:'Delete'}).at(-1)!);
 await waitFor(()=>expect(mediaFolders).toHaveBeenCalledWith('pixflow',expect.objectContaining({action:'delete',id:2})));
});
it('moves all dragged media into the destination folder',async()=>{
 render(<MediaFolders scope={{provider:'pixflow',folder:'all'}} onScope={()=>{}} attachmentIds={[10,11]} onChanged={()=>{}}/>);
 const row=(await screen.findByRole('button',{name:/^Child/})).parentElement!;
 fireEvent.drop(row,{dataTransfer:{getData:(type:string)=>type==='application/x-pixflow-media'?'[10,11]':''}});
 await waitFor(()=>expect(mediaFolders).toHaveBeenCalledWith('pixflow',expect.objectContaining({action:'assign',id:2,attachmentIds:[10,11]})));
});
it('restores saved sorting and disables manual dragging outside default order',async()=>{
 localStorage.setItem('pixflow.media.folderSort','nameDesc');
 render(<MediaFolders scope={{provider:'pixflow',folder:'all'}} onScope={()=>{}} attachmentIds={[]} onChanged={()=>{}}/>);
 const row=(await screen.findByRole('button',{name:/^Parent/})).parentElement!;
 expect(row.getAttribute('draggable')).toBe('false');
 fireEvent.click(screen.getByRole('button',{name:'Sort folders'}));
 expect((await screen.findByRole('menuitemradio',{name:'Name: Z–A'})).getAttribute('aria-checked')).toBe('true');
});
it('does not expose writes for a read-only HappyFiles account',async()=>{
 vi.mocked(mediaFolders).mockResolvedValue({...inventory,provider:'happyfiles',writable:false});
 render(<MediaFolders scope={{provider:'happyfiles',folder:'all'}} onScope={()=>{}} attachmentIds={[10]} onChanged={()=>{}}/>);
 await screen.findByRole('button',{name:/^Parent/});
 expect(screen.queryByRole('button',{name:'New folder'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Move to folder'})).toBeNull();
});
it('shows deactivation errors without silently changing provider',async()=>{
 vi.mocked(mediaFolders).mockRejectedValue(new Error('HappyFiles is unavailable.'));
 const onScope=vi.fn();render(<MediaFolders scope={{provider:'happyfiles',folder:2}} onScope={onScope} attachmentIds={[]} onChanged={()=>{}}/>);
 expect(await screen.findByRole('alert')).toBeTruthy();expect(onScope).not.toHaveBeenCalled();
});
it('renames inline without a modal or changing the parent',async()=>{
 render(<MediaFolders scope={{provider:'pixflow',folder:'all'}} onScope={()=>{}} attachmentIds={[]} onChanged={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Options for Child'}));
 fireEvent.click(await screen.findByRole('menuitem',{name:'Rename'}));
 const input=await screen.findByRole('textbox',{name:'Folder name'});
 expect(screen.queryByRole('dialog')).toBeNull();
 fireEvent.change(input,{target:{value:'New child'}});fireEvent.keyDown(input,{key:'Enter'});
 await waitFor(()=>expect(mediaFolders).toHaveBeenCalledWith('pixflow',expect.objectContaining({action:'update',id:2,name:'New child',parent:1})));
});
it('moves a dragged folder back to the top level',async()=>{
 render(<MediaFolders scope={{provider:'pixflow',folder:'all'}} onScope={()=>{}} attachmentIds={[]} onChanged={()=>{}}/>);
 await screen.findByRole('button',{name:/^Child/});
 fireEvent.drop(screen.getByRole('button',{name:'All media'}).parentElement!,{dataTransfer:{getData:(type:string)=>type==='application/x-pixflow-folder'?JSON.stringify({id:2,provider:'pixflow'}):''}});
 await waitFor(()=>expect(mediaFolders).toHaveBeenCalledWith('pixflow',expect.objectContaining({action:'update',id:2,name:'Child',parent:0})));
});
it('moves a child to the root when dropped before a root folder',async()=>{
 render(<MediaFolders scope={{provider:'pixflow',folder:'all'}} onScope={()=>{}} attachmentIds={[]} onChanged={()=>{}}/>);
 const target=(await screen.findByRole('button',{name:/^Parent/})).parentElement!;
 fireEvent.drop(target,{clientY:0,dataTransfer:{getData:(type:string)=>type==='application/x-pixflow-folder'?JSON.stringify({id:2,provider:'pixflow'}):''}});
 await waitFor(()=>expect(mediaFolders).toHaveBeenCalledWith('pixflow',expect.objectContaining({action:'reorder',id:2,parent:0,beforeId:1})));
});
it('does not highlight the dragged folder or its descendants as drop targets',async()=>{
 render(<MediaFolders scope={{provider:'pixflow',folder:'all'}} onScope={()=>{}} attachmentIds={[]} onChanged={()=>{}}/>);
 const parent=(await screen.findByRole('button',{name:/^Parent/})).parentElement!;
 const child=screen.getByRole('button',{name:/^Child/}).parentElement!;
 const dataTransfer={types:['application/x-pixflow-folder'],setData:vi.fn(),dropEffect:'move'};
 fireEvent.dragStart(parent,{dataTransfer});
 fireEvent.dragOver(parent,{dataTransfer});expect(parent.getAttribute('data-drop')).toBeNull();
 fireEvent.dragOver(child,{dataTransfer});expect(child.getAttribute('data-drop')).toBeNull();
 expect(dataTransfer.dropEffect).toBe('none');expect(mediaFolders).toHaveBeenCalledTimes(1);
});



it.each(['Enter','Escape','blur'])('discards an unnamed new folder on %s',async(method)=>{
 render(<MediaFolders scope={{provider:'pixflow',folder:'all'}} onScope={()=>{}} attachmentIds={[]} onChanged={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'New folder'}));
 const input=screen.getByRole('textbox',{name:'Folder name'});
 expect(screen.queryByRole('dialog')).toBeNull();expect(document.activeElement).toBe(input);
 if(method==='blur')fireEvent.blur(input);else fireEvent.keyDown(input,{key:method});
 expect(screen.queryByRole('textbox')).toBeNull();expect(mediaFolders).toHaveBeenCalledTimes(1);
});
it.each(['Enter','blur'])('creates a named folder at root on %s only once',async(method)=>{
 render(<MediaFolders scope={{provider:'pixflow',folder:2}} onScope={()=>{}} attachmentIds={[]} onChanged={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'New folder'}));
 const input=screen.getByRole('textbox',{name:'Folder name'});
 fireEvent.change(input,{target:{value:'  Photos  '}});
 if(method==='blur')fireEvent.blur(input);else {fireEvent.keyDown(input,{key:method});fireEvent.blur(input);}
 await waitFor(()=>expect(mediaFolders).toHaveBeenCalledWith('pixflow',expect.objectContaining({action:'create',name:'Photos',parent:0})));
 expect(mediaFolders).toHaveBeenCalledTimes(2);
});
it('cancels a named draft folder with Escape without saving',async()=>{
 render(<MediaFolders scope={{provider:'pixflow',folder:'all'}} onScope={()=>{}} attachmentIds={[]} onChanged={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'New folder'}));
 const input=screen.getByRole('textbox',{name:'Folder name'});fireEvent.change(input,{target:{value:'Cancelled'}});fireEvent.keyDown(input,{key:'Escape'});fireEvent.blur(input);
 expect(screen.queryByRole('textbox')).toBeNull();expect(mediaFolders).toHaveBeenCalledTimes(1);
});
it('creates an inline child in the chosen folder and removes the move menu action',async()=>{
 render(<MediaFolders scope={{provider:'pixflow',folder:'all'}} onScope={()=>{}} attachmentIds={[10]} onChanged={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Expand Parent'}));
 fireEvent.click(screen.getByRole('button',{name:'Options for Parent'}));
 expect(screen.queryByRole('menuitem',{name:'Move to folder'})).toBeNull();
 fireEvent.click(await screen.findByRole('menuitem',{name:'New child folder'}));
 const input=await screen.findByRole('textbox',{name:'Folder name'});
 expect(document.activeElement).toBe(input);
 expect(input.closest('[data-slot=dialog]')).toBeNull();
 fireEvent.change(input,{target:{value:'Nested QA'}});fireEvent.keyDown(input,{key:'Enter'});
 await waitFor(()=>expect(mediaFolders).toHaveBeenCalledWith('pixflow',expect.objectContaining({action:'create',name:'Nested QA',parent:1})));
});
it('keeps sidebar controls mounted while only the folder tree refreshes',async()=>{
 render(<MediaFolders scope={{provider:'pixflow',folder:'all'}} onScope={()=>{}} attachmentIds={[]} onChanged={()=>{}}/>);
 await screen.findByRole('button',{name:/^Parent/});
 const create=screen.getByRole('button',{name:'New folder'});
 let resolve!:(value:typeof inventory)=>void;
 vi.mocked(mediaFolders).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 fireEvent.click(screen.getByRole('button',{name:'Refresh'}));
 expect(screen.getByRole('button',{name:'New folder'})).toBe(create);
 expect((create as HTMLButtonElement).disabled).toBe(true);
 expect(screen.getByRole('switch',{name:'HappyFiles folders'})).toBeTruthy();
 expect(screen.getByRole('status',{name:'Loading…'})).toBeTruthy();
 resolve(inventory);
 await waitFor(()=>expect((create as HTMLButtonElement).disabled).toBe(false));
 expect(screen.queryByRole('status')).toBeNull();
});


it('hides the HappyFiles switch when the integration is unavailable',async()=>{
 vi.mocked(mediaFolders).mockResolvedValue({...inventory,happyfilesAvailable:false});
 render(<MediaFolders scope={{provider:'pixflow',folder:'all'}} onScope={()=>{}} attachmentIds={[]} onChanged={()=>{}}/>);
 await screen.findByRole('button',{name:'New folder'});
 expect(screen.queryByRole('switch',{name:'HappyFiles folders'})).toBeNull();
});
it('returns a saved HappyFiles selection to native folders when the integration is deactivated',async()=>{
 vi.mocked(mediaFolders).mockRejectedValue(new MediaFoldersError('HappyFiles is unavailable.',409));
 const onScope=vi.fn();
 render(<MediaFolders scope={{provider:'happyfiles',folder:2}} onScope={onScope} attachmentIds={[]} onChanged={()=>{}}/>);
 await waitFor(()=>expect(onScope).toHaveBeenCalledWith({provider:'pixflow',folder:'all'}));
});
